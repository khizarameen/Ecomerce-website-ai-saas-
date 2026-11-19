"""REST endpoints for the Seller Profit-Shield & Anti-RTO Mesh.

GET  /api/seller-mesh/dashboard/                 live metrics, KPIs, twin, logs, approvals
POST /api/seller-mesh/trigger/                   {"trigger_event": "..."} runs the LangGraph mesh
POST /api/seller-mesh/approvals/<pk>/decide/     {"decision": "APPROVED" | "REJECTED"}
"""

import uuid
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from store.models import Order, Product, Seller
from .agents import AGENT_CHAINS, AUDIT_SHIPMENTS, UNIT_PRICE, get_engine_status
from .models import (
    AgentExecutionLog,
    CancelledOrderRecovery,
    PendingApprovalAction,
    SellerShieldMetrics,
)
from .recovery_service import (
    apply_review_fix_to_product,
    apply_seller_recovery_option,
    ask_profit_shield_chatbot,
    buyer_act_on_cancelled_deal,
    close_deal_with_next_customer,
    create_simulated_recovery,
    get_seller_review_insights,
    list_buyer_rescue_deals,
    negotiate_with_next_customer,
    reverify_recovery_photo,
    serialize_recovery,
    sync_and_list_recoveries,
)
from .workflow import profit_shield_graph

SKU = 'PROBASS-X1'
PRODUCT_TITLE = 'ProBass Wireless Earbuds X1'
HUMAN_ENGINE = 'seller-human-in-the-loop'
AUDIT_REVENUE = AUDIT_SHIPMENTS * UNIT_PRICE
TWIN_KEYS = ('orders_batch', 'rto_reroute_data', 'return_forensics_data', 'margin_audit_data')

BASELINE = {
    'product_title': PRODUCT_TITLE,
    'unit_price': Decimal('45.00'),
    'unit_cost': Decimal('22.00'),
    'active_orders': 12,
    'blocked_fake_cod_count': 0,
    'cod_shipping_saved': Decimal('0.00'),
    'rerouted_parcels_count': 0,
    'reroute_saved': Decimal('0.00'),
    'fraud_claims_won': 0,
    'courier_disputes_won': 0,
    'claims_recovered': Decimal('0.00'),
    'gross_margin_pct': 51.11,
    'true_net_margin_pct': 34.65,
    'total_money_saved_today': Decimal('0.00'),
    'last_trigger_event': '',
}

AGENTS_META = [
    {
        'id': 'cod_risk_gatekeeper_agent', 'step': 1, 'name': 'COD Risk Gatekeeper', 'role': 'The Gatekeeper',
        'category': 'Risk Gatekeeper',
        'mission': 'Blocks fake COD orders, prank numbers & incomplete addresses before dispatch.',
    },
    {
        'id': 'intransit_rto_rerouter_agent', 'step': 2, 'name': 'In-Transit RTO Rerouter', 'role': 'The Parcel Saver',
        'category': 'Hub Rerouting',
        'mission': 'Holds refused parcels at the destination hub and diverts them to fresh local orders.',
    },
    {
        'id': 'return_fraud_vision_agent', 'step': 3, 'name': 'Return Fraud Vision', 'role': 'The Forensic Inspector',
        'category': 'Visual Verification',
        'mission': 'Diffs dispatch vs return evidence to catch box-swap fraud and build claim dossiers.',
    },
    {
        'id': 'profit_bleed_auditor_agent', 'step': 4, 'name': 'Profit Bleed Auditor', 'role': 'The Margin Auditor',
        'category': 'Margin Audit',
        'mission': 'Catches courier weight overcharges & defective batches; computes true net margin.',
    },
]


class IsSellerUser(BasePermission):
    """Only seller accounts (or staff) may use the seller mesh."""

    message = 'A seller account is required for the Profit-Shield Mesh.'

    def has_permission(self, request, view) -> bool:
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        return getattr(getattr(user, 'profile', None), 'user_type', None) == 'seller'


def _money(value) -> Decimal:
    return Decimal(str(round(float(value or 0), 2)))


def _seller_baseline(seller_user=None) -> dict:
    """Compute an isolated baseline dict strictly from this seller's own store/products."""
    username = (
        seller_user.username
        if (seller_user and getattr(seller_user, 'is_authenticated', False))
        else 'demo_seller'
    )
    if seller_user and getattr(seller_user, 'is_authenticated', False):
        lead_product = Product.objects.filter(seller__user=seller_user).order_by('-created_at').first()
        active_ord_count = (
            Order.objects.filter(order_items__product__seller__user=seller_user)
            .exclude(status='cancelled')
            .distinct()
            .count()
        )
    else:
        lead_product = None
        active_ord_count = 0

    if lead_product is not None:
        unit_price = _money(lead_product.price or 45.00)
        raw_cost = getattr(lead_product, 'cost_price', None)
        unit_cost = _money(raw_cost) if raw_cost else _money(float(unit_price) * 0.50)
        gross_margin = round(float((unit_price - unit_cost) / unit_price * 100), 2) if unit_price > 0 else 50.0
        net_margin = round(max(0.0, gross_margin - 12.0), 2)
        return {
            **BASELINE,
            'sku': (lead_product.sku or f'SKU-{lead_product.id}')[:64],
            'product_title': lead_product.name[:255],
            'unit_price': unit_price,
            'unit_cost': unit_cost,
            'active_orders': active_ord_count,
            'gross_margin_pct': gross_margin,
            'true_net_margin_pct': net_margin,
        }

    if username == 'demo_seller':
        return {**BASELINE, 'sku': SKU}

    seller_obj = Seller.objects.filter(user=seller_user).first() if seller_user else None
    store_label = (seller_obj.store_name if seller_obj else f"{username}'s Store")[:180]
    return {
        **BASELINE,
        'sku': f'STORE-{username.upper()[:12]}',
        'product_title': f'{store_label} (No product listed yet)',
        'unit_price': Decimal('0.00'),
        'unit_cost': Decimal('0.00'),
        'active_orders': active_ord_count,
        'gross_margin_pct': 0.0,
        'true_net_margin_pct': 0.0,
    }


def ensure_seed_metrics(seller_user=None) -> SellerShieldMetrics:
    """Return or create the SellerShieldMetrics row strictly isolated to one seller account."""
    username = (
        seller_user.username
        if (seller_user and getattr(seller_user, 'is_authenticated', False))
        else 'demo_seller'
    )

    # Migrate or discard any legacy unowned metrics row so demo data never leaks
    legacy = SellerShieldMetrics.objects.filter(seller_username='').first()
    if legacy is not None:
        if SellerShieldMetrics.objects.filter(seller_username='demo_seller').exists():
            legacy.delete()
        else:
            legacy.seller_username = 'demo_seller'
            legacy.save(update_fields=['seller_username'])

    metrics = SellerShieldMetrics.objects.filter(seller_username=username).first()
    base = _seller_baseline(seller_user)
    if metrics is None:
        metrics = SellerShieldMetrics.objects.create(seller_username=username, twin_state={}, **base)
    elif username != 'demo_seller':
        changed_fields = []
        if '(No product listed yet)' in metrics.product_title and '(No product listed yet)' not in base['product_title']:
            for fld in ('sku', 'product_title', 'unit_price', 'unit_cost', 'gross_margin_pct', 'true_net_margin_pct'):
                setattr(metrics, fld, base[fld])
                changed_fields.append(fld)
        if not metrics.last_trigger_event and metrics.active_orders != base['active_orders']:
            metrics.active_orders = base['active_orders']
            changed_fields.append('active_orders')
        if changed_fields:
            metrics.save(update_fields=changed_fields)
    return metrics


def _get_owned_recovery(request, pk: int) -> CancelledOrderRecovery:
    if request.user.is_staff or request.user.is_superuser:
        return get_object_or_404(CancelledOrderRecovery, pk=pk)
    return get_object_or_404(CancelledOrderRecovery, pk=pk, seller_username=request.user.username)


def _serialize_log(entry: AgentExecutionLog) -> dict:
    is_human = entry.llm_engine == HUMAN_ENGINE
    return {
        'id': entry.id,
        'run_id': entry.run_id,
        'trigger_event': entry.trigger_event,
        'agent_name': entry.agent_name,
        'llm_engine': HUMAN_ENGINE if is_human else 'automated-agent',
        'action': entry.action,
        'money_impact': float(entry.money_impact),
        'handoff_to': entry.handoff_to,
        'is_autonomous': entry.is_autonomous,
        'details': {
            k: v for k, v in (entry.details or {}).items()
            if k not in ('engine_used', 'llm_engine')
        },
        'timestamp': entry.created_at.isoformat() if entry.created_at else None,
    }


def _serialize_approval(item: PendingApprovalAction) -> dict:
    return {
        'id': item.id,
        'run_id': item.run_id,
        'title': item.title,
        'agent_name': item.agent_name,
        'action_type': item.action_type,
        'description': item.description,
        'dollar_impact': float(item.dollar_impact),
        'payload': item.payload or {},
        'status': item.status,
        'decided_at': item.decided_at.isoformat() if item.decided_at else None,
        'created_at': item.created_at.isoformat() if item.created_at else None,
    }


def _pending_sum(metrics: SellerShieldMetrics, *action_types: str) -> float:
    qs = metrics.approvals.filter(status='PENDING')
    if action_types:
        qs = qs.filter(action_type__in=action_types)
    return float(qs.aggregate(total=Sum('dollar_impact'))['total'] or 0)


def _build_kpis(metrics: SellerShieldMetrics) -> dict:
    total = float(metrics.total_money_saved_today)
    pending_total = _pending_sum(metrics)
    return {
        'total_money_protected': total,
        'pending_recoverable': round(pending_total, 2),
        'projected_protection': round(total + pending_total, 2),
        'fake_cod_blocked': metrics.blocked_fake_cod_count,
        'cod_shipping_saved': float(metrics.cod_shipping_saved),
        'rto_rerouted': metrics.rerouted_parcels_count,
        'reroute_saved': float(metrics.reroute_saved),
        'rto_pending_holds': metrics.approvals.filter(status='PENDING', action_type='HUB_REROUTE').count(),
        'rto_pending_amount': round(_pending_sum(metrics, 'HUB_REROUTE'), 2),
        'claims_recoverable': round(_pending_sum(metrics, 'FRAUD_CLAIM', 'COURIER_WEIGHT_DISPUTE'), 2),
        'claims_recovered': float(metrics.claims_recovered),
        'claims_won': metrics.fraud_claims_won + metrics.courier_disputes_won,
    }


def _build_dashboard(metrics: SellerShieldMetrics, seller_user=None) -> dict:
    return {
        'metrics': {
            'sku': metrics.sku,
            'product_title': metrics.product_title,
            'unit_price': float(metrics.unit_price),
            'unit_cost': float(metrics.unit_cost),
            'active_orders': metrics.active_orders,
            'blocked_fake_cod_count': metrics.blocked_fake_cod_count,
            'rerouted_parcels_count': metrics.rerouted_parcels_count,
            'fraud_claims_won': metrics.fraud_claims_won,
            'courier_disputes_won': metrics.courier_disputes_won,
            'gross_margin_pct': metrics.gross_margin_pct,
            'true_net_margin_pct': metrics.true_net_margin_pct,
            'total_money_saved_today': float(metrics.total_money_saved_today),
            'last_trigger_event': metrics.last_trigger_event,
            'updated_at': metrics.updated_at.isoformat() if metrics.updated_at else None,
        },
        'kpis': _build_kpis(metrics),
        'twin': metrics.twin_state or {},
        'agent_logs': [_serialize_log(e) for e in metrics.execution_logs.all()[:40]],
        'pending_approvals': [_serialize_approval(a) for a in metrics.approvals.all()[:20]],
        'cancelled_recoveries': sync_and_list_recoveries(seller_user=seller_user),
        'agents_meta': AGENTS_META,
        'available_triggers': list(AGENT_CHAINS.keys()) + ['RESET_BASELINE'],
    }


class _SellerMeshView(APIView):
    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated, IsSellerUser]


class SellerMeshDashboardView(_SellerMeshView):
    def get(self, request):
        return Response(_build_dashboard(ensure_seed_metrics(request.user), seller_user=request.user))


class SellerMeshTriggerView(_SellerMeshView):
    def post(self, request):
        metrics = ensure_seed_metrics(request.user)
        trigger = str(request.data.get('trigger_event', 'FULL_PROFIT_SHIELD_SWEEP')).upper().strip()

        if trigger in ('RESET_BASELINE', 'RESET'):
            with transaction.atomic():
                metrics.execution_logs.all().delete()
                metrics.approvals.all().delete()
                for field, value in _seller_baseline(request.user).items():
                    setattr(metrics, field, value)
                metrics.twin_state = {}
                metrics.save()
            payload = _build_dashboard(metrics, seller_user=request.user)
            payload.update({'run_id': None, 'trigger_event': 'RESET_BASELINE', 'execution_chain': []})
            return Response(payload)

        if trigger not in AGENT_CHAINS:
            return Response(
                {'error': f'Unsupported trigger_event "{trigger}". Use one of '
                          f'{sorted(list(AGENT_CHAINS.keys()) + ["RESET_BASELINE"])}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        final_state = profit_shield_graph.invoke({
            'sku': metrics.sku,
            'trigger_event': trigger,
            'orders_batch': {},
            'rto_reroute_data': {},
            'return_forensics_data': {},
            'margin_audit_data': {},
            'next_agent': '',
            'agent_logs': [],
            'pending_approvals': [],
        })

        run_id = uuid.uuid4().hex[:12]
        run_logs = final_state.get('agent_logs', [])
        new_approvals = final_state.get('pending_approvals', [])
        batch = final_state.get('orders_batch') or {}
        audit = final_state.get('margin_audit_data') or {}

        with transaction.atomic():
            # Autonomous wins (Agent 1) are realized immediately.
            if batch:
                saved = _money(batch.get('shipping_fee_saved', 0))
                metrics.blocked_fake_cod_count += int(batch.get('flagged_high_risk', 0))
                metrics.cod_shipping_saved += saved
                metrics.total_money_saved_today += saved
                metrics.active_orders = int(batch.get('verified_safe', metrics.active_orders))
            if audit:
                metrics.gross_margin_pct = float(audit.get('gross_margin_pct', metrics.gross_margin_pct))
                metrics.true_net_margin_pct = float(audit.get('true_net_margin_pct', metrics.true_net_margin_pct))

            twin = dict(metrics.twin_state or {})
            for key in TWIN_KEYS:
                if final_state.get(key):
                    twin[key] = final_state[key]
            metrics.twin_state = twin
            metrics.last_trigger_event = trigger
            metrics.save()

            created_logs = [
                AgentExecutionLog.objects.create(
                    metrics=metrics,
                    run_id=run_id,
                    trigger_event=trigger,
                    agent_name=item.get('agent_name', 'unknown'),
                    llm_engine=item.get('llm_engine', ''),
                    engine_mode=(item.get('details') or {}).get('engine_mode', 'fallback'),
                    action=item.get('action', ''),
                    money_impact=_money(item.get('money_impact', 0)),
                    handoff_to=item.get('handoff_to', ''),
                    is_autonomous=bool(item.get('is_autonomous', True)),
                    details=item.get('details') or {},
                )
                for item in run_logs
            ]

            # A fresh draft replaces any stale pending draft of the same type.
            new_types = {a.get('action_type') for a in new_approvals}
            if new_types:
                metrics.approvals.filter(status='PENDING', action_type__in=new_types).delete()
            created_approvals = [
                PendingApprovalAction.objects.create(
                    metrics=metrics,
                    run_id=run_id,
                    title=item.get('title', 'Pending seller approval'),
                    agent_name=item.get('agent_name', ''),
                    action_type=item.get('action_type', ''),
                    description=item.get('description', ''),
                    dollar_impact=_money(item.get('dollar_impact', 0)),
                    payload=item.get('payload') or {},
                )
                for item in new_approvals
            ]

        payload = _build_dashboard(metrics, seller_user=request.user)
        payload.update({
            'run_id': run_id,
            'trigger_event': trigger,
            'execution_chain': [e.agent_name for e in created_logs],
            'run_total_protected': float(audit.get('total_money_saved_today', 0) or 0),
            'new_approvals': [_serialize_approval(a) for a in created_approvals],
        })
        return Response(payload)


class SellerMeshApprovalDecideView(_SellerMeshView):
    def post(self, request, pk: int):
        if request.user.is_staff or request.user.is_superuser:
            approval = get_object_or_404(PendingApprovalAction, pk=pk)
        else:
            approval = get_object_or_404(
                PendingApprovalAction,
                pk=pk,
                metrics__seller_username=request.user.username,
            )
        if approval.status != 'PENDING':
            return Response({'error': f'Action #{approval.id} is already {approval.status}.'},
                            status=status.HTTP_400_BAD_REQUEST)

        raw = str(request.data.get('decision', '')).upper().strip()
        if raw in ('APPROVE', 'APPROVED'):
            decision = 'APPROVED'
        elif raw in ('REJECT', 'REJECTED'):
            decision = 'REJECTED'
        else:
            return Response({'error': 'decision must be APPROVED or REJECTED.'},
                            status=status.HTTP_400_BAD_REQUEST)

        metrics = approval.metrics
        impact = approval.dollar_impact
        payload = approval.payload or {}
        twin = dict(metrics.twin_state or {})

        with transaction.atomic():
            approval.status = decision
            approval.decided_at = timezone.now()
            approval.save(update_fields=['status', 'decided_at'])

            if decision == 'APPROVED':
                metrics.total_money_saved_today += impact
                metrics.true_net_margin_pct = round(
                    min(metrics.gross_margin_pct,
                        metrics.true_net_margin_pct + float(impact) / AUDIT_REVENUE * 100), 2)
                if approval.action_type == 'HUB_REROUTE':
                    metrics.rerouted_parcels_count += 1
                    metrics.reroute_saved += impact
                    rto = dict(twin.get('rto_reroute_data') or {})
                    rto['reroute_status'] = f'DIVERTED_RELABELED_TO_{payload.get("matched_new_order_id", "")}'
                    twin['rto_reroute_data'] = rto
                    summary = (f'Seller approved hub re-label: {payload.get("stranded_awb")} diverted at '
                               f'{payload.get("hub_city")} Hub to {payload.get("matched_new_order_id")} '
                               f'(+${impact} freight saved, ${payload.get("sale_rescued", 0):.2f} sale rescued).')
                elif approval.action_type == 'FRAUD_CLAIM':
                    metrics.fraud_claims_won += 1
                    metrics.claims_recovered += impact
                    forensics = dict(twin.get('return_forensics_data') or {})
                    forensics['claim_status'] = 'CLAIM_SUBMITTED'
                    twin['return_forensics_data'] = forensics
                    summary = f'Seller submitted fraud claim dossier {payload.get("return_awb")} (+${impact} recoverable).'
                elif approval.action_type == 'COURIER_WEIGHT_DISPUTE':
                    metrics.courier_disputes_won += 1
                    metrics.claims_recovered += impact
                    audit = dict(twin.get('margin_audit_data') or {})
                    audit['dispute_status'] = 'DISPUTE_FILED'
                    twin['margin_audit_data'] = audit
                    summary = (f'Seller filed courier weight dispute + supplier debit note for batch '
                               f'{payload.get("supplier_batch_id")} (+${impact} recovery).')
                else:
                    summary = f'Seller approved "{approval.title}" (+${impact}).'
            else:
                if approval.action_type == 'HUB_REROUTE':
                    rto = dict(twin.get('rto_reroute_data') or {})
                    rto['reroute_status'] = 'RETURN_TO_ORIGIN'
                    twin['rto_reroute_data'] = rto
                elif approval.action_type == 'FRAUD_CLAIM':
                    forensics = dict(twin.get('return_forensics_data') or {})
                    forensics['claim_status'] = 'CLAIM_DISMISSED'
                    twin['return_forensics_data'] = forensics
                elif approval.action_type == 'COURIER_WEIGHT_DISPUTE':
                    audit = dict(twin.get('margin_audit_data') or {})
                    audit['dispute_status'] = 'DISPUTE_DISMISSED'
                    twin['margin_audit_data'] = audit
                summary = f'Seller rejected "{approval.title}" - no money recovered.'

            metrics.twin_state = twin
            metrics.save()
            AgentExecutionLog.objects.create(
                metrics=metrics,
                run_id=approval.run_id,
                trigger_event='SELLER_DECISION',
                agent_name=approval.agent_name,
                llm_engine=HUMAN_ENGINE,
                engine_mode='human',
                action=summary,
                money_impact=impact if decision == 'APPROVED' else Decimal('0.00'),
                handoff_to='LEDGER_SYNCED',
                is_autonomous=False,
                details={'approval_id': approval.id, 'decision': decision},
            )

        payload_out = _build_dashboard(metrics, seller_user=request.user)
        payload_out['decided_approval'] = _serialize_approval(approval)
        return Response(payload_out)


class SellerRecoveryListView(_SellerMeshView):
    """List buyer-cancelled orders & AI Next-Customer recovery matches for the seller."""

    def get(self, request):
        metrics = ensure_seed_metrics(request.user)
        recoveries = sync_and_list_recoveries(seller_user=request.user)
        return Response({
            'recoveries': recoveries,
            'kpis': _build_kpis(metrics),
        })


class SellerRecoverySimulateView(_SellerMeshView):
    """Create a simulated buyer-cancelled order so the seller can test Next-Customer deals."""

    def post(self, request):
        metrics = ensure_seed_metrics(request.user)
        rec = create_simulated_recovery(seller_user=request.user)
        return Response({
            'created': serialize_recovery(rec),
            'recoveries': sync_and_list_recoveries(seller_user=request.user),
            'kpis': _build_kpis(metrics),
        }, status=status.HTTP_201_CREATED)


class SellerRecoveryNegotiateView(_SellerMeshView):
    """Run AI Deal Copilot pitch & simulated next-customer response."""

    def post(self, request, pk: int):
        recovery = _get_owned_recovery(request, pk)
        candidate_id = str(request.data.get('candidate_id') or 'cand-1')
        raw_price = request.data.get('custom_price')
        custom_price = float(raw_price) if raw_price not in (None, '') else None
        seller_message = str(request.data.get('seller_message') or '')
        try:
            updated = negotiate_with_next_customer(
                recovery,
                candidate_id=candidate_id,
                custom_price=custom_price,
                seller_message=seller_message,
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'recovery': serialize_recovery(updated),
            'recoveries': sync_and_list_recoveries(seller_user=request.user),
        })


class SellerRecoveryCloseDealView(_SellerMeshView):
    """Lock deal with the Next Customer, create a confirmed replacement Order, and update ROI."""

    def post(self, request, pk: int):
        recovery = _get_owned_recovery(request, pk)
        candidate_id = str(request.data.get('candidate_id') or 'cand-1')
        raw_price = request.data.get('final_price')
        final_price = float(raw_price) if raw_price not in (None, '') else None
        metrics = ensure_seed_metrics(request.user)
        try:
            closed = close_deal_with_next_customer(
                recovery,
                candidate_id=candidate_id,
                final_price=final_price,
                metrics=metrics,
                seller_user=request.user,
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'recovery': serialize_recovery(closed),
            'recoveries': sync_and_list_recoveries(seller_user=request.user),
            'kpis': _build_kpis(metrics),
        })


class SellerRecoveryAdvisorChatView(_SellerMeshView):
    """Seller asks Profit-Shield Chatbot about rate cuts, shipping, or backup recall."""

    def post(self, request, pk: int):
        recovery = _get_owned_recovery(request, pk)
        question = str(request.data.get('question') or '')
        metrics = ensure_seed_metrics(request.user)
        try:
            updated = ask_profit_shield_chatbot(recovery, question=question, metrics=metrics)
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'recovery': serialize_recovery(updated),
            'recoveries': sync_and_list_recoveries(seller_user=request.user),
        })


class SellerRecoveryVerifyPhotoView(_SellerMeshView):
    """Run or re-run AI Vision product verification on a buyer cancel photo or seller inspection photo."""

    def post(self, request, pk: int):
        recovery = _get_owned_recovery(request, pk)
        metrics = ensure_seed_metrics(request.user)
        uploaded = (
            request.FILES.get('photo')
            or request.FILES.get('cancel_photo')
            or request.data.get('photo')
        )
        try:
            updated = reverify_recovery_photo(
                recovery,
                metrics=metrics,
                uploaded_photo=uploaded if uploaded else None,
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'recovery': serialize_recovery(updated),
            'recoveries': sync_and_list_recoveries(seller_user=request.user),
        })


class SellerRecoveryOptionView(_SellerMeshView):
    """Seller chooses Option 1 (Edit + Discount & publish to buyers) or Option 2 (Recall to backup)."""

    def post(self, request, pk: int):
        recovery = _get_owned_recovery(request, pk)
        metrics = ensure_seed_metrics(request.user)
        raw_disc = request.data.get('discount_pct')
        raw_price = request.data.get('custom_price')
        try:
            updated = apply_seller_recovery_option(
                recovery,
                option_type=str(request.data.get('option_type') or ''),
                metrics=metrics,
                edited_title=str(request.data.get('edited_title') or ''),
                discount_pct=float(raw_disc) if raw_disc not in (None, '') else None,
                custom_price=float(raw_price) if raw_price not in (None, '') else None,
                shipping_policy=str(request.data.get('shipping_policy') or ''),
                offer_note=str(request.data.get('offer_note') or ''),
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'recovery': serialize_recovery(updated),
            'recoveries': sync_and_list_recoveries(seller_user=request.user),
            'kpis': _build_kpis(metrics),
        })


class BuyerRescueDealListView(APIView):
    """Public/Buyer view of cancelled items that Sellers edited/discounted for Buyers."""

    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'deals': list_buyer_rescue_deals()})


class BuyerRescueDealActionView(APIView):
    """Buyer acts on a Seller-published cancelled deal (Buy/Ask Edit-Discount or Request Backup)."""

    authentication_classes = [JWTAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        profile = getattr(request.user, 'profile', None)
        if getattr(profile, 'user_type', 'buyer') == 'seller' and not request.user.is_staff:
            return Response(
                {'error': 'Seller accounts cannot claim Buyer deals; use a Buyer account.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        recovery = get_object_or_404(CancelledOrderRecovery, pk=pk)
        raw_price = request.data.get('offered_price')
        seller_owner = (
            User.objects.filter(username=recovery.seller_username).first()
            if recovery.seller_username
            else None
        )
        metrics = ensure_seed_metrics(seller_owner)
        try:
            result = buyer_act_on_cancelled_deal(
                recovery=recovery,
                buyer_user=request.user,
                option_type=str(request.data.get('option_type') or ''),
                custom_note=str(request.data.get('custom_note') or ''),
                offered_price=float(raw_price) if raw_price not in (None, '') else None,
                metrics=metrics,
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({**result, 'deals': list_buyer_rescue_deals()})


class SellerReviewInsightsView(_SellerMeshView):
    """Return Buyer Reviews + AI Review Optimization Insights for Seller's Profit-Shield tab."""

    def get(self, request):
        return Response(get_seller_review_insights(seller_user=request.user))


class SellerApplyReviewFixView(_SellerMeshView):
    """Apply Buyer-Review AI fix to a Product description/price and refresh review insights."""

    def post(self, request):
        product_id = request.data.get('product_id')
        if not product_id:
            return Response({'error': 'product_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        metrics = ensure_seed_metrics(request.user)
        raw_disc = request.data.get('discount_pct')
        try:
            res = apply_review_fix_to_product(
                product_id=int(product_id),
                metrics=metrics,
                seller_user=request.user,
                custom_description=str(request.data.get('custom_description') or ''),
                apply_discount_pct=float(raw_disc) if raw_disc not in (None, '') else 0.0,
            )
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({**res, **get_seller_review_insights(seller_user=request.user)})
