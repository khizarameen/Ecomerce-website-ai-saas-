"""AI Next-Customer ('Agla Customer') Recovery & Deal-Closing Service."""

from datetime import datetime, timezone
from decimal import Decimal
import uuid

from django.contrib.auth.models import User
from django.db import transaction

from store.models import Order, OrderItem, Product, ProductReview, Seller
from .agents import GEMINI_MODEL, GROQ_MODEL, _invoke
from .models import AgentExecutionLog, CancelledOrderRecovery, PendingApprovalAction, SellerShieldMetrics
from .photo_verifier import prepare_cancel_photo, verify_cancelled_product_photo


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _money_dec(value) -> Decimal:
    return Decimal(str(round(float(value or 0), 2)))


def serialize_recovery(item: CancelledOrderRecovery) -> dict:
    """Serialize a CancelledOrderRecovery model instance with its Seller's original Product metadata."""
    prod = (
        Product.objects.filter(id=item.product_id).select_related('seller', 'category').first()
        if item.product_id
        else None
    )
    if prod is None and item.seller_username:
        prod = (
            Product.objects.filter(seller__user__username=item.seller_username)
            .select_related('seller', 'category')
            .order_by('-created_at')
            .first()
        )

    seller_store_name = (
        prod.seller.store_name
        if (prod and prod.seller and prod.seller.store_name)
        else (item.seller_username or 'Verified Seller Store')
    )
    return {
        'id': item.id,
        'order_id': item.order_id,
        'order_number': item.order_number,
        'seller_username': item.seller_username,
        'seller_store_name': seller_store_name,
        'product_id': item.product_id,
        'original_product_id': prod.id if prod else item.product_id,
        'original_product_slug': prod.slug if prod else None,
        'original_product_name': prod.name if prod else item.product_title,
        'original_store_price': float(prod.price) if prod else float(item.original_price),
        'original_stock_quantity': int(prod.stock_quantity or 0) if prod else 0,
        'original_category_name': prod.category.name if (prod and prod.category) else 'Store Catalog',
        'original_image_url': prod.main_image.url if (prod and prod.main_image) else None,
        'product_title': item.product_title,
        'original_price': float(item.original_price),
        'quantity': item.quantity,
        'cancelled_by_buyer': item.cancelled_by_buyer,
        'origin_city': item.origin_city,
        'cancel_stage': item.cancel_stage,
        'cancel_reason': item.cancel_reason,
        'shipping_fee_at_risk': float(item.shipping_fee_at_risk),
        'ai_recommended_deal_price': float(item.ai_recommended_deal_price),
        'ai_discount_pct': float(item.ai_discount_pct),
        'ai_strategy_summary': item.ai_strategy_summary,
        'candidate_buyers': item.candidate_buyers or [],
        'selected_candidate': item.selected_candidate or {},
        'final_deal_price': float(item.final_deal_price) if item.final_deal_price is not None else None,
        'reassigned_order_id': item.reassigned_order_id,
        'reassigned_order_number': item.reassigned_order_number,
        'seller_edited_title': item.seller_edited_title or item.product_title,
        'seller_offer_note': item.seller_offer_note,
        'shipping_policy': item.shipping_policy,
        'published_to_buyers': item.published_to_buyers,
        'resolution_option': item.resolution_option,
        'status': item.status,
        'buyer_cancel_photo_url': item.buyer_cancel_photo_data or None,
        'has_cancel_photo': bool(item.buyer_cancel_photo_data),
        'photo_verification_status': item.photo_verification_status or 'NOT_PROVIDED',
        'photo_verification_result': {
            k: v
            for k, v in (item.photo_verification_result or {}).items()
            if k != 'engine_used'
        },
        'chat_history': item.chat_history or [],
        'created_at': item.created_at.isoformat() if item.created_at else None,
        'updated_at': item.updated_at.isoformat() if item.updated_at else None,
    }


def build_candidate_buyers(
    product_title: str,
    total_price: float,
    quantity: int,
    city: str,
    exclude_user_id: int | None = None,
    shipping_saved: float = 14.50,
) -> list[dict]:
    """Generate 3 ranked Next Customer ('Agla Customer') candidates blending real DB buyers."""
    base_total = max(float(total_price or 45.0), 1.0)
    qty = max(int(quantity or 1), 1)
    safe_city = city or 'Karachi'

    real_buyers_qs = User.objects.filter(profile__user_type='buyer').select_related('profile')
    if exclude_user_id:
        real_buyers_qs = real_buyers_qs.exclude(id=exclude_user_id)
    real_buyers = list(real_buyers_qs.order_by('-id')[:3])

    templates = [
        {
            'slot': 'cand-1',
            'fallback_name': 'Hamza Tariq',
            'fallback_username': 'hamza_karachi',
            'fallback_email': 'hamza.tariq@example.com',
            'fallback_phone': '+92-301-8841920',
            'city': safe_city,
            'match_score': 97,
            'intent_badge': f'Same-City {safe_city} Hub Instant Match',
            'payment_preference': 'Verified Prepaid / Fast COD',
            'discount_pct': 10.0,
            'perk': 'Free Express Same-City Delivery (0 Return Wait)',
        },
        {
            'slot': 'cand-2',
            'fallback_name': 'Ayesha Siddiqui',
            'fallback_username': 'ayesha_deals',
            'fallback_email': 'ayesha.siddiqui@example.com',
            'fallback_phone': '+92-333-4410293',
            'city': safe_city,
            'match_score': 91,
            'intent_badge': 'Viewed Similar Item 2x Today (Wishlist Alert)',
            'payment_preference': 'Stripe Prepaid Verified (0% RTO Risk)',
            'discount_pct': 12.0,
            'perk': '12% Flash Deal + Priority Dispatch Seal',
        },
        {
            'slot': 'cand-3',
            'fallback_name': 'Usman Farooq',
            'fallback_username': 'usman_vip',
            'fallback_email': 'usman.farooq@example.com',
            'fallback_phone': '+92-321-7752108',
            'city': 'Lahore' if safe_city != 'Lahore' else 'Islamabad',
            'match_score': 86,
            'intent_badge': 'Repeat Store VIP Buyer (5 Completed Orders)',
            'payment_preference': '100% Prepaid Card',
            'discount_pct': 8.0,
            'perk': '8% VIP Early-Access Price Lock',
        },
    ]

    candidates = []
    for idx, tpl in enumerate(templates):
        db_user = real_buyers[idx] if idx < len(real_buyers) else None
        profile = getattr(db_user, 'profile', None) if db_user else None

        disc_pct = tpl['discount_pct']
        suggested_total = round(base_total * (1.0 - disc_pct / 100.0), 2)
        suggested_unit = round(suggested_total / qty, 2)
        buyer_city = (getattr(profile, 'city', '') or '').strip() or tpl['city']
        buyer_name = (
            (db_user.get_full_name().strip() if db_user else '')
            or (db_user.username if db_user else '')
            or tpl['fallback_name']
        )

        pitch = (
            f'Hi {buyer_name}! Good news from our {buyer_city} stock hub: we have {qty}x {product_title} '
            f'ready for immediate priority release at ${suggested_total:.2f} ({disc_pct:.0f}% instant discount '
            f'+ {tpl["perk"]}). Reply YES to lock this unit before it leaves {buyer_city}!'
        )

        candidates.append({
            'id': tpl['slot'],
            'user_id': db_user.id if db_user else None,
            'username': db_user.username if db_user else tpl['fallback_username'],
            'name': buyer_name,
            'email': (db_user.email if db_user and db_user.email else tpl['fallback_email']),
            'phone': (getattr(profile, 'phone', '') or tpl['fallback_phone']),
            'city': buyer_city,
            'match_score': tpl['match_score'],
            'intent_badge': tpl['intent_badge'],
            'payment_preference': tpl['payment_preference'],
            'discount_pct': disc_pct,
            'suggested_unit_price': suggested_unit,
            'suggested_total_price': suggested_total,
            'shipping_saved': round(float(shipping_saved), 2),
            'perk': tpl['perk'],
            'ai_pitch_message': pitch,
        })

    return candidates


def _craft_strategy_summary(
    product_title: str,
    original_price: float,
    deal_price: float,
    city: str,
    cancel_stage: str,
    cancel_reason: str,
    shipping_saved: float,
    top_candidate: dict,
) -> str:
    prompt = (
        'You are the Seller Profit-Shield AI Deal Closer. Respond ONLY in JSON '
        '{"action_summary": string} in 1-2 crisp sentences.\n'
        f'Cancelled Product: {product_title} (${original_price:.2f}) in {city}, stage {cancel_stage}. '
        f'Reason: "{cancel_reason}". Top Next Customer match: {top_candidate.get("name")} '
        f'({top_candidate.get("match_score")}% match, {top_candidate.get("intent_badge")}) at '
        f'${deal_price:.2f}. Saves ${shipping_saved:.2f} return freight.'
    )
    llm_json, _mode, _reason = _invoke('groq', prompt)
    text = (llm_json or {}).get('action_summary')
    if isinstance(text, str) and len(text.strip()) >= 20:
        return text.strip()
    return (
        f'Buyer cancelled "{product_title}" ({cancel_stage.replace("_", " ").lower()}) due to "{cancel_reason}". '
        f'AI matched {top_candidate.get("name")} ({top_candidate.get("match_score")}% score in {city}) at '
        f'${deal_price:.2f} (10% rescue deal) — avoiding ${shipping_saved:.2f} freight loss and converting '
        'the cancellation into a confirmed sale.'
    )


def register_cancelled_order_recovery(
    order: Order,
    reason: str = '',
    prior_status: str = 'pending',
    cancel_photo_file=None,
) -> CancelledOrderRecovery | None:
    """Create or refresh per-seller Next-Customer Recovery items when an Order is cancelled."""
    photo_bytes = None
    photo_data_uri = ''
    if cancel_photo_file is not None:
        try:
            photo_bytes, photo_data_uri = prepare_cancel_photo(cancel_photo_file)
        except Exception:
            photo_bytes = None
            photo_data_uri = ''

    order_items = list(
        order.order_items.select_related('product', 'product__seller', 'product__seller__user').all()
    )

    seller_groups: dict[str, dict] = {}
    for oi in order_items:
        prod = oi.product
        s_user = ''
        if prod and prod.seller and prod.seller.user:
            s_user = prod.seller.user.username
        if not s_user:
            continue
        grp = seller_groups.setdefault(
            s_user,
            {'product_id': None, 'titles': [], 'quantity': 0, 'subtotal': Decimal('0.00')},
        )
        if grp['product_id'] is None and oi.product_id:
            grp['product_id'] = oi.product_id
        grp['titles'].append(oi.product_name or (prod.name if prod else 'Store Product'))
        qty_i = int(oi.quantity or 1)
        grp['quantity'] += qty_i
        line_total = oi.total if oi.total is not None else (Decimal(str(oi.price or 0)) * qty_i)
        grp['subtotal'] += Decimal(str(line_total))

    if not seller_groups and isinstance(order.items, list):
        for raw_item in order.items:
            if not isinstance(raw_item, dict):
                continue
            pid = raw_item.get('product_id')
            prod = Product.objects.filter(id=pid).select_related('seller__user').first() if pid else None
            if not (prod and prod.seller and prod.seller.user):
                continue
            s_user = prod.seller.user.username
            grp = seller_groups.setdefault(
                s_user,
                {'product_id': None, 'titles': [], 'quantity': 0, 'subtotal': Decimal('0.00')},
            )
            if grp['product_id'] is None:
                grp['product_id'] = prod.id
            grp['titles'].append(str(raw_item.get('product_name') or raw_item.get('name') or prod.name))
            qty_i = int(raw_item.get('quantity') or 1)
            grp['quantity'] += qty_i
            line_total = raw_item.get('total') or (Decimal(str(raw_item.get('price') or prod.price or 0)) * qty_i)
            grp['subtotal'] += Decimal(str(line_total))

    if not seller_groups:
        return None

    shipping_addr = order.shipping_address or {}
    origin_city = str(shipping_addr.get('city') or 'Karachi').strip() or 'Karachi'
    cancelled_by = (
        str(shipping_addr.get('name') or '').strip()
        or (order.user.username if order.user else '')
        or order.email
        or 'buyer'
    )
    cancel_stage = 'IN_TRANSIT' if prior_status == 'shipped' else 'PRE_DISPATCH'
    shipping_at_risk = 14.50 if cancel_stage == 'IN_TRANSIT' else 8.00
    clean_reason = (reason or '').strip() or 'Buyer cancelled product / order'

    created_recoveries: list[CancelledOrderRecovery] = []
    for seller_username, grp in seller_groups.items():
        product_title = ', '.join(dict.fromkeys(grp['titles']))[:250] or 'Store Product'
        quantity = max(1, int(grp['quantity'] or 1))
        orig_price = float(grp['subtotal']) if grp['subtotal'] > 0 else float(order.total or 45.0)
        product_id = grp['product_id']

        candidates = build_candidate_buyers(
            product_title=product_title,
            total_price=orig_price,
            quantity=quantity,
            city=origin_city,
            exclude_user_id=order.user_id,
            shipping_saved=shipping_at_risk,
        )
        top = candidates[0]
        deal_price = float(top['suggested_total_price'])

        strategy = _craft_strategy_summary(
            product_title=product_title,
            original_price=orig_price,
            deal_price=deal_price,
            city=origin_city,
            cancel_stage=cancel_stage,
            cancel_reason=clean_reason,
            shipping_saved=shipping_at_risk,
            top_candidate=top,
        )

        initial_chat = [
            {
                'sender': 'AI_COPILOT',
                'text': (
                    f'Cancellation detected on Order #{order.order_number} ({product_title}). '
                    f'Ranked 3 ready buyers; top pick {top["name"]} ({top["city"]}) is ready at ${deal_price:.2f}.'
                ),
                'timestamp': _utc_now_iso(),
            },
            {
                'sender': 'AI_PITCH_DRAFT',
                'candidate_name': top['name'],
                'text': top['ai_pitch_message'],
                'offered_price': deal_price,
                'timestamp': _utc_now_iso(),
            },
        ]

        verification_result: dict = {}
        verification_status = ''
        if photo_bytes:
            prod_obj = (
                Product.objects.filter(id=product_id).select_related('category', 'seller').first()
                if product_id
                else None
            )
            verification_result = verify_cancelled_product_photo(
                buyer_photo_bytes=photo_bytes,
                product=prod_obj,
                product_title=product_title,
                cancel_reason=clean_reason,
            )
            verification_status = verification_result.get('verdict', 'SUSPICIOUS')
            conf_score = verification_result.get('confidence_score', 0)
            initial_chat.append({
                'sender': 'AI_VISION_CHECK',
                'verdict': verification_status,
                'confidence_score': conf_score,
                'text': (
                    f'Photo Verification ({verification_status} · {conf_score}% confidence): '
                    f'{verification_result.get("summary") or verification_result.get("roman_urdu_summary") or verification_result.get("visual_comparison", "")}'
                ),
                'timestamp': _utc_now_iso(),
            })

        recovery_defaults = {
            'order_number': order.order_number,
            'product_id': product_id,
            'product_title': product_title,
            'original_price': _money_dec(orig_price),
            'quantity': quantity,
            'cancelled_by_buyer': cancelled_by,
            'origin_city': origin_city,
            'cancel_stage': cancel_stage,
            'cancel_reason': clean_reason,
            'shipping_fee_at_risk': _money_dec(shipping_at_risk),
            'ai_recommended_deal_price': _money_dec(deal_price),
            'ai_discount_pct': float(top['discount_pct']),
            'ai_strategy_summary': strategy,
            'candidate_buyers': candidates,
            'selected_candidate': {},
            'final_deal_price': None,
            'reassigned_order_id': None,
            'reassigned_order_number': '',
            'status': 'OPEN_FOR_DEAL',
            'chat_history': initial_chat,
        }
        if photo_bytes:
            recovery_defaults['buyer_cancel_photo_data'] = photo_data_uri
            recovery_defaults['photo_verification_status'] = verification_status
            recovery_defaults['photo_verification_result'] = verification_result

        with transaction.atomic():
            recovery, _ = CancelledOrderRecovery.objects.update_or_create(
                order_id=order.id,
                seller_username=seller_username,
                defaults=recovery_defaults,
            )
            if photo_bytes:
                metrics_obj = SellerShieldMetrics.objects.filter(seller_username=seller_username).first()
                if metrics_obj is not None:
                    run_id = uuid.uuid4().hex[:12]
                    engine_used = verification_result.get('engine_used', 'pil-visual-fallback')
                    AgentExecutionLog.objects.create(
                        metrics=metrics_obj,
                        run_id=run_id,
                        trigger_event='BUYER_CANCEL_PHOTO_CHECK',
                        agent_name='return_fraud_vision_agent',
                        llm_engine=GEMINI_MODEL if 'gemini' in engine_used else engine_used,
                        engine_mode='live' if 'gemini' in engine_used else 'fallback',
                        action=(
                            f'Verified buyer cancel photo for #{order.order_number} ({product_title}): '
                            f'{verification_status} ({verification_result.get("confidence_score", 0)}% confidence).'
                        ),
                        money_impact=Decimal(str(orig_price)) if verification_status == 'MISMATCH' else Decimal('0.00'),
                        handoff_to='profit_bleed_auditor_agent' if verification_status == 'MISMATCH' else 'intransit_rto_rerouter_agent',
                        is_autonomous=True,
                        details=verification_result,
                    )
                    if verification_status == 'MISMATCH':
                        PendingApprovalAction.objects.create(
                            metrics=metrics_obj,
                            run_id=run_id,
                            title=f'Photo Mismatch Alert on Cancel #{order.order_number}',
                            agent_name='return_fraud_vision_agent',
                            action_type='FRAUD_CLAIM',
                            description=verification_result.get('seller_recommendation')
                            or 'Buyer cancel photo did not match original product listing.',
                            dollar_impact=_money_dec(orig_price),
                            payload={
                                'recovery_id': recovery.id,
                                'order_number': order.order_number,
                                'verdict': verification_status,
                                'confidence_score': verification_result.get('confidence_score', 0),
                            },
                        )
            created_recoveries.append(recovery)

    return created_recoveries[0] if created_recoveries else None


def create_simulated_recovery(seller_user=None) -> CancelledOrderRecovery:
    """Create a realistic buyer-cancelled order recovery case strictly from this seller's store."""
    if not seller_user or not getattr(seller_user, 'is_authenticated', False):
        raise ValueError('Seller authentication required to simulate a cancellation.')

    product_obj = Product.objects.filter(seller__user=seller_user).order_by('-created_at').first()
    if product_obj:
        product_title = product_obj.name
        product_id = product_obj.id
        orig_price = float(product_obj.price)
    else:
        product_title = f"{seller_user.username}'s Store Sample Item"
        product_id = None
        orig_price = 45.00
    seller_username = seller_user.username

    sim_order_num = f'ORD-CNL-{uuid.uuid4().hex[:5].upper()}'
    origin_city = 'Karachi'
    shipping_at_risk = 14.50
    clean_reason = 'Buyer requested urgent cancellation (Delivery taking too long / Found alternate deal)'

    candidates = build_candidate_buyers(
        product_title=product_title,
        total_price=orig_price,
        quantity=1,
        city=origin_city,
        exclude_user_id=None,
        shipping_saved=shipping_at_risk,
    )
    top = candidates[0]
    deal_price = float(top['suggested_total_price'])

    strategy = _craft_strategy_summary(
        product_title=product_title,
        original_price=orig_price,
        deal_price=deal_price,
        city=origin_city,
        cancel_stage='IN_TRANSIT',
        cancel_reason=clean_reason,
        shipping_saved=shipping_at_risk,
        top_candidate=top,
    )

    initial_chat = [
        {
            'sender': 'AI_COPILOT',
            'text': (
                f'Buyer cancellation alert #{sim_order_num}: "{product_title}" cancelled in {origin_city}. '
                f'Next-Customer match {top["name"]} ({top["match_score"]}%) queued at ${deal_price:.2f}.'
            ),
            'timestamp': _utc_now_iso(),
        },
        {
            'sender': 'AI_PITCH_DRAFT',
            'candidate_name': top['name'],
            'text': top['ai_pitch_message'],
            'offered_price': deal_price,
            'timestamp': _utc_now_iso(),
        },
    ]

    return CancelledOrderRecovery.objects.create(
        order_id=None,
        order_number=sim_order_num,
        seller_username=seller_username,
        product_id=product_id,
        product_title=product_title,
        original_price=_money_dec(orig_price),
        quantity=1,
        cancelled_by_buyer='simulated_buyer',
        origin_city=origin_city,
        cancel_stage='IN_TRANSIT',
        cancel_reason=clean_reason,
        shipping_fee_at_risk=_money_dec(shipping_at_risk),
        ai_recommended_deal_price=_money_dec(deal_price),
        ai_discount_pct=float(top['discount_pct']),
        ai_strategy_summary=strategy,
        candidate_buyers=candidates,
        status='OPEN_FOR_DEAL',
        chat_history=initial_chat,
    )


def sync_and_list_recoveries(seller_user=None) -> list[dict]:
    """Sync any un-tracked cancelled store.Orders strictly for this seller and return recovery list."""
    # Remove any legacy unowned rows so demo data never leaks into real seller accounts
    CancelledOrderRecovery.objects.filter(seller_username='').delete()

    if seller_user and getattr(seller_user, 'is_authenticated', False):
        if seller_user.is_staff or seller_user.is_superuser:
            cancelled_orders = Order.objects.filter(status='cancelled').order_by('-updated_at')[:25]
            for ord_obj in cancelled_orders:
                if not CancelledOrderRecovery.objects.filter(order_id=ord_obj.id).exists():
                    register_cancelled_order_recovery(
                        ord_obj,
                        reason=ord_obj.customer_notes or ord_obj.admin_notes or 'Buyer cancelled order',
                        prior_status='shipped' if ord_obj.shipped_at else 'pending',
                    )
            qs = CancelledOrderRecovery.objects.exclude(seller_username='')
        else:
            cancelled_orders = (
                Order.objects.filter(
                    status='cancelled',
                    order_items__product__seller__user=seller_user,
                )
                .distinct()
                .order_by('-updated_at')[:25]
            )
            for ord_obj in cancelled_orders:
                if not CancelledOrderRecovery.objects.filter(
                    order_id=ord_obj.id,
                    seller_username=seller_user.username,
                ).exists():
                    register_cancelled_order_recovery(
                        ord_obj,
                        reason=ord_obj.customer_notes or ord_obj.admin_notes or 'Buyer cancelled order',
                        prior_status='shipped' if ord_obj.shipped_at else 'pending',
                    )
            qs = CancelledOrderRecovery.objects.filter(seller_username=seller_user.username)
        return [serialize_recovery(item) for item in qs[:25]]

    # Public / buyer deal listing sync: sync only real cancelled orders owned by sellers (no fake seed)
    cancelled_orders = Order.objects.filter(status='cancelled').order_by('-updated_at')[:25]
    existing_order_ids = set(
        CancelledOrderRecovery.objects.exclude(order_id__isnull=True).values_list('order_id', flat=True)
    )
    for ord_obj in cancelled_orders:
        if ord_obj.id not in existing_order_ids:
            register_cancelled_order_recovery(
                ord_obj,
                reason=ord_obj.customer_notes or ord_obj.admin_notes or 'Buyer cancelled order',
                prior_status='shipped' if ord_obj.shipped_at else 'pending',
            )
    qs = CancelledOrderRecovery.objects.exclude(seller_username='')
    return [serialize_recovery(item) for item in qs[:25]]


def negotiate_with_next_customer(
    recovery: CancelledOrderRecovery,
    candidate_id: str,
    custom_price: float | None = None,
    seller_message: str = '',
) -> CancelledOrderRecovery:
    """Ask AI Deal Copilot to negotiate price & generate buyer acceptance for the next customer."""
    candidates = list(recovery.candidate_buyers or [])
    candidate = next((c for c in candidates if c.get('id') == candidate_id), None) or (candidates[0] if candidates else None)
    if not candidate:
        raise ValueError('No Next Customer candidate available.')

    orig_price = float(recovery.original_price)
    offered = float(custom_price) if custom_price is not None and float(custom_price) > 0 else float(
        candidate.get('suggested_total_price', orig_price * 0.9)
    )
    offered = round(min(offered, orig_price), 2)
    disc_pct = round(max(0.0, ((orig_price - offered) / orig_price) * 100.0), 1)

    seller_note = (seller_message or '').strip()
    prompt = (
        'You are negotiating on behalf of an e-commerce seller to close an urgent deal with the next buyer '
        'for a cancelled order. Respond ONLY in JSON {"seller_pitch": string, "buyer_reply": string}.\n'
        f'Product: {recovery.product_title} (Original ${orig_price:.2f}). Offer price: ${offered:.2f} '
        f'({disc_pct:.1f}% off). Next Buyer: {candidate["name"]} in {candidate["city"]}. '
        f'Seller note: {seller_note or "Fast hub dispatch + quality check guaranteed"}.'
    )
    llm_json, _mode, _reason = _invoke('groq', prompt)
    llm = llm_json or {}

    seller_pitch = llm.get('seller_pitch') if isinstance(llm.get('seller_pitch'), str) else ''
    if not seller_pitch.strip():
        extra = f' Note: {seller_note}.' if seller_note else ''
        seller_pitch = (
            f'Hi {candidate["name"]}, we unlocked an exclusive ${offered:.2f} ({disc_pct:.0f}% Off) rescue offer on '
            f'{recovery.quantity}x {recovery.product_title} right out of our {candidate["city"]} hub with '
            f'priority dispatch.{extra} Confirming now saves you ${orig_price - offered:.2f}!'
        )

    buyer_reply = llm.get('buyer_reply') if isinstance(llm.get('buyer_reply'), str) else ''
    if not buyer_reply.strip():
        buyer_reply = (
            f'Deal looks great at ${offered:.2f} with priority {candidate["city"]} dispatch! '
            f'Please lock {recovery.product_title} for me — ready for immediate confirmation.'
        )

    candidate['suggested_total_price'] = offered
    candidate['suggested_unit_price'] = round(offered / max(recovery.quantity, 1), 2)
    candidate['discount_pct'] = disc_pct
    candidate['ai_pitch_message'] = seller_pitch

    history = list(recovery.chat_history or [])
    now = _utc_now_iso()
    history.append({
        'sender': 'SELLER_OFFER',
        'candidate_name': candidate['name'],
        'text': seller_pitch,
        'offered_price': offered,
        'timestamp': now,
    })
    history.append({
        'sender': 'NEXT_CUSTOMER',
        'candidate_name': candidate['name'],
        'text': buyer_reply,
        'offered_price': offered,
        'timestamp': now,
    })

    recovery.candidate_buyers = candidates
    recovery.ai_recommended_deal_price = _money_dec(offered)
    recovery.ai_discount_pct = disc_pct
    recovery.chat_history = history
    recovery.save()
    return recovery


def close_deal_with_next_customer(
    recovery: CancelledOrderRecovery,
    candidate_id: str,
    final_price: float | None,
    metrics: SellerShieldMetrics,
    seller_user=None,
) -> CancelledOrderRecovery:
    """Lock the deal with the Next Customer, create a confirmed replacement Order, and update ROI."""
    if recovery.status == 'DEAL_CLOSED':
        raise ValueError(f'Recovery #{recovery.order_number} deal is already closed.')

    candidates = list(recovery.candidate_buyers or [])
    candidate = next((c for c in candidates if c.get('id') == candidate_id), None) or (candidates[0] if candidates else None)
    if not candidate:
        raise ValueError('No Next Customer candidate found.')

    agreed_total = float(final_price) if final_price is not None and float(final_price) > 0 else float(
        candidate.get('suggested_total_price', recovery.ai_recommended_deal_price)
    )
    agreed_dec = _money_dec(agreed_total)
    orig_dec = _money_dec(recovery.original_price)
    discount_dec = max(orig_dec - agreed_dec, Decimal('0.00'))

    target_user = User.objects.filter(id=candidate.get('user_id')).first() if candidate.get('user_id') else None
    product_obj = Product.objects.filter(id=recovery.product_id).first() if recovery.product_id else None
    if product_obj is None and seller_user:
        seller_obj = Seller.objects.filter(user=seller_user).first()
        if seller_obj:
            product_obj = seller_obj.products.first()

    pay_pref = str(candidate.get('payment_preference', '')).lower()
    is_prepaid = 'prepaid' in pay_pref or 'stripe' in pay_pref
    payment_method = 'stripe' if is_prepaid else 'cod'
    payment_status = 'paid' if is_prepaid else 'pending'

    shipping_addr = {
        'name': candidate.get('name', 'Verified Buyer'),
        'address': f'Priority Hub Release - {candidate.get("city", recovery.origin_city)}',
        'city': candidate.get('city', recovery.origin_city),
        'state': 'Punjab' if candidate.get('city') in ('Lahore', 'Islamabad', 'Rawalpindi') else 'Sindh',
        'country': 'Pakistan',
        'postal_code': '75500',
    }
    item_payload = [{
        'product_id': product_obj.id if product_obj else recovery.product_id,
        'product_name': recovery.product_title,
        'quantity': recovery.quantity,
        'price': str(round(float(agreed_dec) / max(recovery.quantity, 1), 2)),
        'total': str(agreed_dec),
    }]

    with transaction.atomic():
        new_order = Order.objects.create(
            user=target_user,
            email=candidate.get('email') or 'nextbuyer@example.com',
            phone=candidate.get('phone') or '+92-300-0000001',
            shipping_address=shipping_addr,
            billing_address=shipping_addr,
            items=item_payload,
            subtotal=orig_dec,
            tax=Decimal('0.00'),
            shipping_cost=Decimal('0.00'),
            discount=discount_dec,
            total=agreed_dec,
            payment_method=payment_method,
            payment_status=payment_status,
            status='confirmed',
            customer_notes=(
                f'AI Next-Customer Recovery Deal from Cancelled Order #{recovery.order_number} '
                f'-> Assigned to {candidate.get("name")} ({candidate.get("city")})'
            ),
        )
        if product_obj is not None:
            OrderItem.objects.create(
                order=new_order,
                product=product_obj,
                product_name=recovery.product_title,
                variant_name='',
                price=_money_dec(float(agreed_dec) / max(recovery.quantity, 1)),
                quantity=recovery.quantity,
                total=agreed_dec,
            )

        recovery.status = 'DEAL_CLOSED'
        recovery.selected_candidate = candidate
        recovery.final_deal_price = agreed_dec
        recovery.reassigned_order_id = new_order.id
        recovery.reassigned_order_number = new_order.order_number
        history = list(recovery.chat_history or [])
        history.append({
            'sender': 'DEAL_LOCKED',
            'candidate_name': candidate.get('name'),
            'text': (
                f'Deal locked at ${agreed_dec} with {candidate.get("name")} ({candidate.get("city")}). '
                f'Created Confirmed Order #{new_order.order_number} (+${recovery.shipping_fee_at_risk} freight saved).'
            ),
            'offered_price': float(agreed_dec),
            'timestamp': _utc_now_iso(),
        })
        recovery.chat_history = history
        recovery.save()

        money_protected = _money_dec(recovery.shipping_fee_at_risk) + agreed_dec
        metrics.rerouted_parcels_count += 1
        metrics.reroute_saved += _money_dec(recovery.shipping_fee_at_risk)
        metrics.total_money_saved_today += money_protected
        metrics.save()

        AgentExecutionLog.objects.create(
            metrics=metrics,
            run_id=uuid.uuid4().hex[:12],
            trigger_event='NEXT_CUSTOMER_DEAL',
            agent_name='intransit_rto_rerouter_agent',
            llm_engine=GROQ_MODEL,
            engine_mode='ai-assisted',
            action=(
                f'Closed recovery deal on cancelled #{recovery.order_number} ({recovery.product_title}): '
                f'reassigned to Next Customer {candidate.get("name")} in {candidate.get("city")} at '
                f'${agreed_dec} -> new Confirmed Order #{new_order.order_number} '
                f'(${recovery.shipping_fee_at_risk} freight saved + ${agreed_dec} revenue rescued).'
            ),
            money_impact=money_protected,
            handoff_to='LEDGER_SYNCED',
            is_autonomous=False,
            details={
                'recovery_id': recovery.id,
                'cancelled_order': recovery.order_number,
                'reassigned_order': new_order.order_number,
                'next_customer': candidate.get('name'),
            },
        )

    return recovery


def _create_replacement_order(
    recovery: CancelledOrderRecovery,
    buyer_name: str,
    buyer_email: str,
    buyer_phone: str,
    buyer_city: str,
    agreed_dec: Decimal,
    payment_method: str,
    payment_status: str,
    target_user=None,
    seller_user=None,
    note_suffix: str = '',
) -> Order:
    """Create a real confirmed store.Order + OrderItem for a rescued cancelled order."""
    orig_dec = _money_dec(recovery.original_price)
    discount_dec = max(orig_dec - agreed_dec, Decimal('0.00'))

    product_obj = Product.objects.filter(id=recovery.product_id).first() if recovery.product_id else None
    if product_obj is None and seller_user:
        seller_obj = Seller.objects.filter(user=seller_user).first()
        if seller_obj:
            product_obj = seller_obj.products.first()
    if product_obj is None and recovery.seller_username:
        product_obj = (
            Product.objects.filter(
                seller__user__username=recovery.seller_username,
                name__icontains=recovery.product_title[:25],
            ).first()
            or Product.objects.filter(seller__user__username=recovery.seller_username).first()
        )

    effective_title = recovery.seller_edited_title or recovery.product_title
    shipping_addr = {
        'name': buyer_name or 'Verified Buyer',
        'address': f'{recovery.shipping_policy} - {buyer_city}',
        'city': buyer_city or recovery.origin_city,
        'state': 'Punjab' if buyer_city in ('Lahore', 'Islamabad', 'Rawalpindi') else 'Sindh',
        'country': 'Pakistan',
        'postal_code': '75500',
    }
    item_payload = [{
        'product_id': product_obj.id if product_obj else recovery.product_id,
        'product_name': effective_title,
        'quantity': recovery.quantity,
        'price': str(round(float(agreed_dec) / max(recovery.quantity, 1), 2)),
        'total': str(agreed_dec),
    }]
    new_order = Order.objects.create(
        user=target_user,
        email=buyer_email or 'nextbuyer@example.com',
        phone=buyer_phone or '+92-300-0000001',
        shipping_address=shipping_addr,
        billing_address=shipping_addr,
        items=item_payload,
        subtotal=orig_dec,
        tax=Decimal('0.00'),
        shipping_cost=Decimal('0.00'),
        discount=discount_dec,
        total=agreed_dec,
        payment_method=payment_method,
        payment_status=payment_status,
        status='confirmed',
        customer_notes=(
            f'AI Recovery Deal (#{recovery.order_number}) -> {buyer_name} ({buyer_city}). '
            f'Shipping: {recovery.shipping_policy}. {note_suffix}'.strip()
        ),
    )
    if product_obj is not None:
        OrderItem.objects.create(
            order=new_order,
            product=product_obj,
            product_name=effective_title,
            variant_name='',
            price=_money_dec(float(agreed_dec) / max(recovery.quantity, 1)),
            quantity=recovery.quantity,
            total=agreed_dec,
        )
    return new_order


def ask_profit_shield_chatbot(
    recovery: CancelledOrderRecovery,
    question: str,
    metrics: SellerShieldMetrics,
) -> CancelledOrderRecovery:
    """Interactive Profit-Shield Chatbot advising Seller on rate cuts, shipping, or backup recall."""
    clean_q = (question or '').strip()
    if not clean_q:
        raise ValueError('Please enter a question for the Profit-Shield Advisor.')

    orig = float(recovery.original_price)
    unit_cost = float(metrics.unit_cost or 22.0)
    freight_risk = float(recovery.shipping_fee_at_risk)
    break_even = round(unit_cost, 2)
    sweet_spot_10 = round(orig * 0.90, 2)
    sweet_spot_15 = round(orig * 0.85, 2)
    net_gain_resell = round((sweet_spot_10 - unit_cost) + freight_risk, 2)

    photo_status = recovery.photo_verification_status or 'NOT_PROVIDED'
    photo_info = recovery.photo_verification_result or {}
    photo_context = (
        f'Buyer Photo Verification Status: {photo_status} '
        f'({photo_info.get("confidence_score", 0)}% confidence) | '
        f'Detected: {photo_info.get("detected_item", "N/A")} | '
        f'Visual Check: {photo_info.get("visual_comparison", "No photo uploaded yet")}'
    )

    prompt = (
        'You are the Profit-Shield Strategy Chatbot helping an e-commerce seller decide what to do with a '
        'cancelled order. Answer clearly in concise English with exact numbers, '
        'responding ONLY in JSON {"reply": string, "recommended_discount_pct": number, "recommended_shipping": string}.\n'
        f'Product: {recovery.seller_edited_title or recovery.product_title}\n'
        f'Original Price: ${orig:.2f} | Unit Cost: ${unit_cost:.2f} | Stage: {recovery.cancel_stage} | '
        f'City: {recovery.origin_city} | Return Freight Risk: ${freight_risk:.2f}\n'
        f'{photo_context}\n'
        f'Seller question: {clean_q}'
    )
    llm_json, _mode, _reason = _invoke('groq', prompt)
    llm = llm_json or {}
    reply = llm.get('reply') if isinstance(llm.get('reply'), str) and llm.get('reply').strip() else ''

    q_low = clean_q.lower()
    if not reply:
        if any(k in q_low for k in ('photo', 'image', 'pic', 'wahi', 'same', 'original', 'fake', 'check')):
            if photo_status == 'NOT_PROVIDED':
                reply = (
                    f'Photo Verification Status: The buyer did not upload a product photo when cancelling '
                    f'Order #{recovery.order_number}. When the parcel arrives at the hub, upload an inspection photo to verify it automatically.'
                )
            else:
                conf = photo_info.get('confidence_score', 0)
                sum_text = photo_info.get('summary') or photo_info.get('roman_urdu_summary') or photo_info.get('visual_comparison', '')
                rec_adv = photo_info.get('seller_recommendation', '')
                reply = (
                    f'AI Photo Verification ({photo_status} · {conf}% confidence): {sum_text} '
                    f'Advice: {rec_adv}'
                ).strip()
        elif 'ship' in q_low or 'courier' in q_low or 'hub' in q_low or 'delivery' in q_low:
            reply = (
                f'Shipping Advice ({recovery.origin_city}): Recalling the parcel back to the warehouse costs '
                f'${freight_risk:.2f} in return freight. Hold it at the {recovery.origin_city} Hub for 48 hours '
                'and offer the next buyer "Free Same-City Hub Delivery" to deliver within 24 hours and save outbound/return shipping.'
            )
        elif 'backup' in q_low or 'wapsi' in q_low or 'recall' in q_low:
            reply = (
                f'Discount vs Warehouse Recall Analysis: Reselling to the next buyer at a 10% discount (${sweet_spot_10:.2f}) '
                f'preserves ${net_gain_resell:.2f} in net profit plus saved freight (break-even cost: ${break_even:.2f}). '
                f'If offers drop below ${sweet_spot_15:.2f}, use Option 2 ("Recall to Warehouse Backup") to return the item to inventory.'
            )
        else:
            reply = (
                f'Pricing & Deal Strategy: For {recovery.product_title}, a 10%-15% discount works best '
                f'(Target: ${sweet_spot_10:.2f} to ${sweet_spot_15:.2f}, unit cost floor ${break_even:.2f}). '
                f'Pairing this rate with Free {recovery.origin_city} Hub Shipping closes the next buyer quickly and saves '
                f'${freight_risk:.2f} in return freight loss.'
            )

    rec_disc = llm.get('recommended_discount_pct')
    if not isinstance(rec_disc, (int, float)) or rec_disc <= 0 or rec_disc > 40:
        rec_disc = 10.0

    rec_ship = llm.get('recommended_shipping')
    if not isinstance(rec_ship, str) or not rec_ship.strip():
        rec_ship = f'Free Same-City {recovery.origin_city} Hub Delivery (Zero RTO Fee)'

    now = _utc_now_iso()
    history = list(recovery.chat_history or [])
    history.append({'sender': 'SELLER_CHAT', 'text': clean_q, 'timestamp': now})
    history.append({
        'sender': 'PROFIT_SHIELD_BOT',
        'text': reply,
        'offered_price': round(orig * (1 - float(rec_disc) / 100.0), 2),
        'recommended_shipping': rec_ship,
        'timestamp': now,
    })
    recovery.chat_history = history
    recovery.save(update_fields=['chat_history', 'updated_at'])
    return recovery


def reverify_recovery_photo(
    recovery: CancelledOrderRecovery,
    metrics: SellerShieldMetrics | None = None,
    uploaded_photo=None,
) -> CancelledOrderRecovery:
    """Verify or re-verify buyer's cancelled product photo (or seller parcel photo) with AI Vision."""
    source_photo = uploaded_photo if uploaded_photo is not None else (recovery.buyer_cancel_photo_data or None)
    if not source_photo:
        raise ValueError('No cancel photo uploaded yet. Attach a photo to inspect with the AI Vision Agent.')

    photo_bytes, photo_data_uri = prepare_cancel_photo(source_photo)
    prod_obj = (
        Product.objects.filter(id=recovery.product_id).select_related('category', 'seller').first()
        if recovery.product_id
        else None
    )
    verification = verify_cancelled_product_photo(
        buyer_photo_bytes=photo_bytes,
        product=prod_obj,
        product_title=recovery.product_title,
        cancel_reason=recovery.cancel_reason,
    )
    verdict = verification.get('verdict', 'SUSPICIOUS')
    conf_score = verification.get('confidence_score', 0)
    engine_used = verification.get('engine_used', 'pil-visual-fallback')

    history = list(recovery.chat_history or [])
    history.append({
        'sender': 'AI_VISION_CHECK',
        'verdict': verdict,
        'confidence_score': conf_score,
        'text': (
            f'AI Vision Product Verification ({verdict} · {conf_score}% confidence): '
            f'{verification.get("summary") or verification.get("roman_urdu_summary") or verification.get("visual_comparison", "")}'
        ),
        'timestamp': _utc_now_iso(),
    })

    recovery.buyer_cancel_photo_data = photo_data_uri
    recovery.photo_verification_status = verdict
    recovery.photo_verification_result = verification
    recovery.chat_history = history
    recovery.save(
        update_fields=[
            'buyer_cancel_photo_data',
            'photo_verification_status',
            'photo_verification_result',
            'chat_history',
            'updated_at',
        ]
    )

    if metrics is not None:
        AgentExecutionLog.objects.create(
            metrics=metrics,
            run_id=uuid.uuid4().hex[:12],
            trigger_event='SELLER_PHOTO_REVERIFY',
            agent_name='return_fraud_vision_agent',
            llm_engine=GEMINI_MODEL if 'gemini' in engine_used else engine_used,
            engine_mode='live' if 'gemini' in engine_used else 'fallback',
            action=(
                f'AI Vision inspected cancel #{recovery.order_number} ({recovery.product_title}): '
                f'{verdict} ({conf_score}% confidence).'
            ),
            money_impact=recovery.original_price if verdict == 'MISMATCH' else Decimal('0.00'),
            handoff_to='profit_bleed_auditor_agent' if verdict == 'MISMATCH' else 'intransit_rto_rerouter_agent',
            is_autonomous=False,
            details=verification,
        )

    return recovery


def apply_seller_recovery_option(
    recovery: CancelledOrderRecovery,
    option_type: str,
    metrics: SellerShieldMetrics,
    edited_title: str = '',
    discount_pct: float | None = None,
    custom_price: float | None = None,
    shipping_policy: str = '',
    offer_note: str = '',
) -> CancelledOrderRecovery:
    """Seller chooses Option 1 (Edit/Discount & publish to buyers) or Option 2 (Recall to warehouse backup)."""
    opt = str(option_type or '').upper().strip()
    orig = float(recovery.original_price)
    now = _utc_now_iso()
    history = list(recovery.chat_history or [])

    if opt == 'EDIT_AND_DISCOUNT':
        if custom_price is not None and float(custom_price) > 0:
            deal_price = round(min(float(custom_price), orig), 2)
            disc = round(max(0.0, ((orig - deal_price) / orig) * 100.0), 1)
        else:
            disc = round(max(0.0, min(float(discount_pct or 10.0), 60.0)), 1)
            deal_price = round(orig * (1.0 - disc / 100.0), 2)

        title_clean = (edited_title or '').strip() or recovery.product_title
        ship_clean = (shipping_policy or '').strip() or recovery.shipping_policy or 'Free Same-City Hub Delivery'
        note_clean = (offer_note or '').strip()

        candidates = list(recovery.candidate_buyers or [])
        for cand in candidates:
            cand['suggested_total_price'] = deal_price
            cand['suggested_unit_price'] = round(deal_price / max(recovery.quantity, 1), 2)
            cand['discount_pct'] = disc

        recovery.seller_edited_title = title_clean
        recovery.seller_offer_note = note_clean
        recovery.shipping_policy = ship_clean
        recovery.ai_recommended_deal_price = _money_dec(deal_price)
        recovery.ai_discount_pct = disc
        recovery.candidate_buyers = candidates
        recovery.published_to_buyers = True
        recovery.resolution_option = 'DISCOUNT_RESALE'
        if recovery.status == 'RETURNED_TO_BACKUP':
            recovery.status = 'OPEN_FOR_DEAL'

        history.append({
            'sender': 'SELLER_OFFER',
            'candidate_name': 'All Buyers (Rescue Deals Showcase)',
            'text': (
                f'Seller published edited offer: "{title_clean}" at ${deal_price:.2f} ({disc:.0f}% Off) · '
                f'Shipping: {ship_clean}. {note_clean}'.strip()
            ),
            'offered_price': deal_price,
            'timestamp': now,
        })
        recovery.chat_history = history
        recovery.save()
        return recovery

    if opt == 'RETURN_TO_BACKUP':
        product_obj = Product.objects.filter(id=recovery.product_id).first() if recovery.product_id else None
        with transaction.atomic():
            if product_obj is not None:
                product_obj.stock_quantity = int(product_obj.stock_quantity or 0) + int(recovery.quantity or 1)
                product_obj.save(update_fields=['stock_quantity'])

            recovery.status = 'RETURNED_TO_BACKUP'
            recovery.resolution_option = 'RETURN_TO_BACKUP'
            recovery.published_to_buyers = False
            recovery.shipping_policy = 'Recalled to Warehouse Backup Stock'
            history.append({
                'sender': 'BACKUP_RECALLED',
                'text': (
                    f'Seller recalled "{recovery.product_title}" (#{recovery.order_number}) back to '
                    f'Warehouse Backup (+{recovery.quantity} unit restored to backup stock).'
                ),
                'timestamp': now,
            })
            recovery.chat_history = history
            recovery.save()

            AgentExecutionLog.objects.create(
                metrics=metrics,
                run_id=uuid.uuid4().hex[:12],
                trigger_event='BACKUP_RECALL',
                agent_name='profit_bleed_auditor_agent',
                llm_engine=GROQ_MODEL,
                engine_mode='human',
                action=(
                    f'Seller recalled cancelled order #{recovery.order_number} ({recovery.product_title}) '
                    f'to warehouse backup inventory.'
                ),
                money_impact=Decimal('0.00'),
                handoff_to='LEDGER_SYNCED',
                is_autonomous=False,
                details={'recovery_id': recovery.id, 'option': 'RETURN_TO_BACKUP'},
            )
        return recovery

    raise ValueError('option_type must be EDIT_AND_DISCOUNT or RETURN_TO_BACKUP.')


def list_buyer_rescue_deals() -> list[dict]:
    """Return all cancelled-order deals visible to buyers (open deals + recalled backup availability)."""
    qs = CancelledOrderRecovery.objects.filter(published_to_buyers=True).exclude(seller_username='').order_by('-updated_at', '-id')
    if not qs.exists():
        sync_and_list_recoveries(seller_user=None)
        qs = CancelledOrderRecovery.objects.filter(published_to_buyers=True).exclude(seller_username='').order_by('-updated_at', '-id')
    return [serialize_recovery(item) for item in qs[:20]]


def buyer_act_on_cancelled_deal(
    recovery: CancelledOrderRecovery,
    buyer_user: User,
    option_type: str,
    custom_note: str = '',
    offered_price: float | None = None,
    metrics: SellerShieldMetrics | None = None,
    photo_file=None,
) -> dict:
    """Buyer chooses Option 1 (Claim Discount / Ask Edit), Option 2 (Request Backup), or uploads an inspection photo."""
    opt = str(option_type or '').upper().strip()
    if opt not in ('CLAIM_DISCOUNT_DEAL', 'REQUEST_EDIT_DISCOUNT', 'REQUEST_BACKUP_UNIT', 'UPLOAD_BUYER_PHOTO'):
        raise ValueError(
            'option_type must be CLAIM_DISCOUNT_DEAL, REQUEST_EDIT_DISCOUNT, REQUEST_BACKUP_UNIT, or UPLOAD_BUYER_PHOTO.'
        )
    if opt == 'CLAIM_DISCOUNT_DEAL' and recovery.status == 'DEAL_CLOSED':
        raise ValueError('This cancelled deal was already claimed by another buyer.')
    if opt == 'UPLOAD_BUYER_PHOTO' and photo_file is None:
        raise ValueError('Please select a photo to upload.')

    now = _utc_now_iso()
    buyer_name = buyer_user.get_full_name().strip() or buyer_user.username
    buyer_profile = getattr(buyer_user, 'profile', None)
    buyer_city = (getattr(buyer_profile, 'city', '') or recovery.origin_city or 'Karachi').strip()
    buyer_phone = getattr(buyer_profile, 'phone', '') or '+92-300-1234567'
    history = list(recovery.chat_history or [])

    photo_verdict = None
    photo_conf = None
    if photo_file is not None:
        photo_bytes, photo_data_uri = prepare_cancel_photo(photo_file)
        prod_obj = (
            Product.objects.filter(id=recovery.product_id).select_related('category', 'seller').first()
            if recovery.product_id
            else None
        )
        verification = verify_cancelled_product_photo(
            buyer_photo_bytes=photo_bytes,
            product=prod_obj,
            product_title=recovery.product_title,
            cancel_reason=recovery.cancel_reason,
        )
        photo_verdict = verification.get('verdict', 'SUSPICIOUS')
        photo_conf = verification.get('confidence_score', 0)
        summary_msg = (
            verification.get('summary')
            or verification.get('roman_urdu_summary')
            or verification.get('visual_comparison', '')
        )
        recovery.buyer_cancel_photo_data = photo_data_uri
        recovery.photo_verification_status = photo_verdict
        recovery.photo_verification_result = verification
        history.append({
            'sender': 'AI_VISION_CHECK',
            'verdict': photo_verdict,
            'confidence_score': photo_conf,
            'candidate_name': buyer_name,
            'text': f'Buyer {buyer_name} uploaded a photo ({photo_verdict} · {photo_conf}% match): {summary_msg}',
            'timestamp': now,
        })
        if metrics is not None:
            run_id = uuid.uuid4().hex[:12]
            AgentExecutionLog.objects.create(
                metrics=metrics,
                run_id=run_id,
                trigger_event='MARKETPLACE_BUYER_PHOTO_CHECK',
                agent_name='return_fraud_vision_agent',
                llm_engine='automated-agent',
                engine_mode='live',
                action=(
                    f'Buyer {buyer_name} uploaded photo on #{recovery.order_number} ({recovery.product_title}): '
                    f'{photo_verdict} ({photo_conf}% confidence).'
                ),
                money_impact=recovery.original_price if photo_verdict == 'MISMATCH' else Decimal('0.00'),
                handoff_to='profit_bleed_auditor_agent' if photo_verdict == 'MISMATCH' else 'intransit_rto_rerouter_agent',
                is_autonomous=True,
                details={k: v for k, v in verification.items() if k != 'engine_used'},
            )
            if photo_verdict == 'MISMATCH':
                PendingApprovalAction.objects.create(
                    metrics=metrics,
                    run_id=run_id,
                    title=f'Buyer Deal Photo Mismatch on #{recovery.order_number}',
                    agent_name='return_fraud_vision_agent',
                    action_type='FRAUD_CLAIM',
                    description=verification.get('seller_recommendation')
                    or 'Uploaded buyer photo did not match original product listing.',
                    dollar_impact=recovery.original_price,
                    payload={
                        'recovery_id': recovery.id,
                        'order_number': recovery.order_number,
                        'verdict': photo_verdict,
                        'confidence_score': photo_conf,
                    },
                )

    if opt == 'UPLOAD_BUYER_PHOTO':
        note_clean = (custom_note or '').strip()
        if note_clean:
            history.append({
                'sender': 'NEXT_CUSTOMER',
                'candidate_name': buyer_name,
                'text': f'[Buyer Photo Note] {note_clean}',
                'timestamp': now,
            })
        recovery.chat_history = history
        recovery.save(
            update_fields=[
                'buyer_cancel_photo_data',
                'photo_verification_status',
                'photo_verification_result',
                'chat_history',
                'updated_at',
            ]
        )
        return {
            'message': f'Photo uploaded and sent to the Seller for verification ({photo_verdict} · {photo_conf}%)!',
            'recovery': serialize_recovery(recovery),
        }

    if opt == 'CLAIM_DISCOUNT_DEAL':
        agreed = float(recovery.ai_recommended_deal_price)
        agreed_dec = _money_dec(agreed)
        with transaction.atomic():
            new_order = _create_replacement_order(
                recovery=recovery,
                buyer_name=buyer_name,
                buyer_email=buyer_user.email or f'{buyer_user.username}@example.com',
                buyer_phone=buyer_phone,
                buyer_city=buyer_city,
                agreed_dec=agreed_dec,
                payment_method='cod',
                payment_status='pending',
                target_user=buyer_user,
                note_suffix='Buyer claimed discounted cancelled-order item.',
            )
            recovery.status = 'DEAL_CLOSED'
            recovery.resolution_option = 'DISCOUNT_RESALE'
            recovery.final_deal_price = agreed_dec
            recovery.reassigned_order_id = new_order.id
            recovery.reassigned_order_number = new_order.order_number
            recovery.selected_candidate = {
                'name': buyer_name,
                'username': buyer_user.username,
                'city': buyer_city,
            }
            history.append({
                'sender': 'DEAL_LOCKED',
                'candidate_name': buyer_name,
                'text': (
                    f'Buyer {buyer_name} ({buyer_city}) claimed the discounted cancelled unit at ${agreed_dec} -> '
                    f'Confirmed Order #{new_order.order_number}.'
                ),
                'offered_price': float(agreed_dec),
                'timestamp': now,
            })
            recovery.chat_history = history
            recovery.save()

            if metrics is not None:
                protected = _money_dec(recovery.shipping_fee_at_risk) + agreed_dec
                metrics.rerouted_parcels_count += 1
                metrics.reroute_saved += _money_dec(recovery.shipping_fee_at_risk)
                metrics.total_money_saved_today += protected
                metrics.save()
        return {
            'message': f'Deal claimed! Confirmed Order #{new_order.order_number} created for ${agreed_dec}.',
            'order_number': new_order.order_number,
            'recovery': serialize_recovery(recovery),
        }

    if opt == 'REQUEST_EDIT_DISCOUNT':
        orig = float(recovery.original_price)
        req_price = round(min(float(offered_price), orig), 2) if offered_price else round(
            float(recovery.ai_recommended_deal_price) * 0.95, 2
        )
        note_clean = (custom_note or '').strip() or 'Please give extra discount or confirm edited product condition.'
        history.append({
            'sender': 'NEXT_CUSTOMER',
            'candidate_name': buyer_name,
            'text': f'[Buyer Edit / Extra Discount Request] {note_clean} (Proposed: ${req_price:.2f})',
            'offered_price': req_price,
            'timestamp': now,
        })
        recovery.chat_history = history
        recovery.save(update_fields=['chat_history', 'updated_at'])
        return {
            'message': f'Your edit/discount request (${req_price:.2f}) was sent to the Seller.',
            'recovery': serialize_recovery(recovery),
        }

    if opt == 'REQUEST_BACKUP_UNIT':
        note_clean = (custom_note or '').strip() or 'Buyer requested fresh warehouse backup unit instead of open cancelled parcel.'
        history.append({
            'sender': 'NEXT_CUSTOMER',
            'candidate_name': buyer_name,
            'text': f'[Buyer Fresh Backup Request] {note_clean}',
            'timestamp': now,
        })
        recovery.resolution_option = 'BACKUP_REQUESTED'
        recovery.chat_history = history
        recovery.save(update_fields=['resolution_option', 'chat_history', 'updated_at'])
        return {
            'message': 'Backup unit / recall preference sent to Seller Profit-Shield Desk.',
            'recovery': serialize_recovery(recovery),
        }

    raise ValueError('option_type must be CLAIM_DISCOUNT_DEAL, REQUEST_EDIT_DISCOUNT, or REQUEST_BACKUP_UNIT.')


def get_seller_review_insights(seller_user=None) -> dict:
    """Aggregate buyer reviews strictly across this Seller's products and compute AI optimization tips."""
    if seller_user and getattr(seller_user, 'is_authenticated', False):
        if seller_user.is_staff or seller_user.is_superuser:
            products = list(Product.objects.filter(status='published').order_by('-created_at')[:8])
        else:
            products = list(Product.objects.filter(seller__user=seller_user).order_by('-created_at')[:8])
    else:
        products = []

    if not products:
        return {'reviews': [], 'product_insights': [], 'summary': {'total_reviews': 0, 'avg_rating': 0.0}}

    product_ids = [p.id for p in products]
    reviews_qs = (
        ProductReview.objects.filter(product_id__in=product_ids, is_approved=True)
        .select_related('product', 'user')
        .order_by('-created_at')
    )

    reviews_data = [
        {
            'id': r.id,
            'product_id': r.product_id,
            'product_name': r.product.name if r.product else 'Product',
            'user_name': r.user.username if r.user else 'Verified Buyer',
            'rating': r.rating,
            'title': r.title,
            'review': r.review,
            'is_verified_purchase': r.is_verified_purchase,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        }
        for r in reviews_qs[:30]
    ]

    insights = []
    for prod in products:
        prod_revs = [r for r in reviews_data if r['product_id'] == prod.id]
        avg = float(prod.average_rating or 0.0)
        low_revs = [r for r in prod_revs if r['rating'] <= 3]
        keywords = [w for w in prod.name.lower().split() if len(w) > 2][:4]
        if prod_revs:
            combined = ' '.join((r['title'] + ' ' + r['review']).lower() for r in prod_revs)
            for kw in ('battery', 'playback', 'fast', 'wireless', 'quality', 'bass', 'charging', 'comfort'):
                if kw in combined and kw not in keywords:
                    keywords.append(kw)

        recommended_fix = (
            f'Update "{prod.name}" highlights with verified buyer specs & search keywords '
            f'({", ".join(keywords[:6])}) to boost AI buyer search matching and trust.'
        )
        if low_revs:
            recommended_fix = (
                f'Address {len(low_revs)} low-rating buyer feedback point(s) ("{low_revs[0]["title"]}") '
                f'in product description & consider a 5% confidence discount to raise {avg:.1f}★ rating.'
            )

        insights.append({
            'product_id': prod.id,
            'product_name': prod.name,
            'slug': prod.slug,
            'current_price': float(prod.price),
            'stock_quantity': int(prod.stock_quantity or 0),
            'average_rating': avg,
            'total_reviews': int(prod.total_reviews or len(prod_revs)),
            'recommended_keywords': keywords[:6],
            'recommended_fix': recommended_fix,
            'ai_improved_description': (
                f'{(prod.description or prod.name).strip()} '
                f'[Buyer-Verified Highlights: {", ".join(keywords[:5])}. Tested specs & fast dispatch.]'
            ),
        })

    all_ratings = [r['rating'] for r in reviews_data]
    overall_avg = round(sum(all_ratings) / len(all_ratings), 2) if all_ratings else 0.0
    return {
        'reviews': reviews_data,
        'product_insights': insights,
        'summary': {
            'total_reviews': len(reviews_data),
            'avg_rating': overall_avg,
        },
    }


def apply_review_fix_to_product(
    product_id: int,
    metrics: SellerShieldMetrics,
    seller_user=None,
    custom_description: str = '',
    apply_discount_pct: float = 0.0,
) -> dict:
    """Apply Buyer-Review-driven AI optimization to a Product so Seller & Buyer AI search both benefit."""
    qs = Product.objects.filter(id=product_id)
    if seller_user and not (seller_user.is_staff or seller_user.is_superuser):
        qs = qs.filter(seller__user=seller_user)
    product = qs.first()
    if not product:
        raise ValueError('Product not found for this seller.')

    revs = list(ProductReview.objects.filter(product=product, is_approved=True).order_by('-created_at')[:5])
    snippets = '; '.join(r.title for r in revs[:2]) or 'verified buyer feedback'
    new_desc = (custom_description or '').strip()
    if not new_desc:
        base_desc = (product.ai_generated_description or product.description or product.name).strip()
        new_desc = f'{base_desc} | Buyer-Review Verified Spec Update ({snippets}).'

    with transaction.atomic():
        product.ai_generated_description = new_desc
        product.use_ai_description = True
        if not product.description:
            product.description = new_desc
        old_price = float(product.price)
        if apply_discount_pct and float(apply_discount_pct) > 0:
            pct = min(float(apply_discount_pct), 30.0)
            if not product.compare_price or float(product.compare_price) < old_price:
                product.compare_price = _money_dec(old_price)
            product.price = _money_dec(old_price * (1.0 - pct / 100.0))
        product.save()

        AgentExecutionLog.objects.create(
            metrics=metrics,
            run_id=uuid.uuid4().hex[:12],
            trigger_event='BUYER_REVIEW_FIX',
            agent_name='return_fraud_vision_agent',
            llm_engine=GROQ_MODEL,
            engine_mode='ai-assisted',
            action=(
                f'Applied Buyer-Review AI optimization on "{product.name}" (avg {product.average_rating}★): '
                f'updated searchable description from buyer feedback ({snippets})'
                + (f' and applied {apply_discount_pct}% price polish.' if apply_discount_pct else '.')
            ),
            money_impact=Decimal('0.00'),
            handoff_to='LEDGER_SYNCED',
            is_autonomous=False,
            details={'product_id': product.id, 'new_price': float(product.price)},
        )

    return {
        'message': f'Updated "{product.name}" from Buyer Reviews & refreshed Buyer AI Search ranking!',
        'product_id': product.id,
        'updated_price': float(product.price),
        'ai_generated_description': product.ai_generated_description,
    }


def search_supply_chain_hub_cancelled_deals(query: str = '') -> list[dict]:
    """Return OPEN_FOR_DEAL cancelled orders available in Supply Chain Hub with clear discount info."""
    all_deals = [d for d in list_buyer_rescue_deals() if d.get('status') == 'OPEN_FOR_DEAL']
    if not all_deals:
        return []

    raw_q = (query or '').lower().strip()
    generic_cues = {'cancel', 'cancelled', 'discount', 'hub', 'supply', 'deal', 'all', 'sab', 'order'}
    tokens = [w for w in raw_q.replace('-', ' ').split() if len(w) > 2 and w not in generic_cues]

    results = []
    for deal in all_deals:
        haystack = ' '.join([
            str(deal.get('product_title', '')),
            str(deal.get('seller_edited_title', '')),
            str(deal.get('origin_city', '')),
            str(deal.get('cancel_reason', '')),
            str(deal.get('seller_offer_note', '')),
        ]).lower()
        is_match = True if not tokens else any(tok in haystack for tok in tokens)
        if not tokens or any(c in raw_q for c in generic_cues) or is_match:
            title = deal.get('seller_edited_title') or deal.get('product_title')
            city = deal.get('origin_city') or 'Karachi'
            orig = float(deal.get('original_price') or 0)
            deal_px = float(deal.get('ai_recommended_deal_price') or 0)
            disc = float(deal.get('ai_discount_pct') or 0)
            ship = deal.get('shipping_policy') or 'Free Same-City Hub Delivery'
            results.append({
                **deal,
                'matched_query': is_match,
                'hub_notice': (
                    f'Supply Chain Hub Deal: Order #{deal.get("order_number")} ({title}) is ready at '
                    f'{city} Supply Chain Hub with {disc:.0f}% discount (${deal_px:.2f} instead of '
                    f'${orig:.2f}) + {ship}.'
                ),
            })

    if not results:
        for deal in all_deals[:3]:
            title = deal.get('seller_edited_title') or deal.get('product_title')
            city = deal.get('origin_city') or 'Karachi'
            orig = float(deal.get('original_price') or 0)
            deal_px = float(deal.get('ai_recommended_deal_price') or 0)
            disc = float(deal.get('ai_discount_pct') or 0)
            ship = deal.get('shipping_policy') or 'Free Same-City Hub Delivery'
            results.append({
                **deal,
                'matched_query': False,
                'hub_notice': (
                    f'Supply Chain Hub Deal: Order #{deal.get("order_number")} ({title}) is ready at '
                    f'{city} Supply Chain Hub with {disc:.0f}% discount (${deal_px:.2f} instead of '
                    f'${orig:.2f}) + {ship}.'
                ),
            })
    return results[:5]


def format_supply_chain_hub_callout(deals: list[dict], query: str = '') -> str:
    """Build a clearly separated Supply Chain Hub notice for AI responses."""
    if not deals:
        return ''
    lines = [
        '\n\n---',
        '🚚 **[Supply Chain Hub — Cancelled Order Discount Alert]**',
        'Separate from the regular store catalog — these cancelled orders are currently available at our **Supply Chain Hub** at a special discount:',
    ]
    for d in deals[:3]:
        title = d.get('seller_edited_title') or d.get('product_title')
        orig = float(d.get('original_price') or 0)
        deal_px = float(d.get('ai_recommended_deal_price') or 0)
        disc = float(d.get('ai_discount_pct') or 0)
        city = d.get('origin_city') or 'Karachi'
        ship = d.get('shipping_policy') or 'Free Same-City Hub Delivery'
        tag = 'Search Match · ' if d.get('matched_query') else ''
        lines.append(
            f'- **Order #{d.get("order_number")} — {title}** ({tag}{city} Supply Chain Hub) | '
            f'Discounted Rate: **${deal_px:.2f}** ~~${orig:.2f}~~ (**{disc:.0f}% OFF**) · {ship}'
        )
    lines.append('👉 You can claim any deal below with 1-click from the **Supply Chain Hub Cancelled Deals** section.')
    return '\n'.join(lines)



