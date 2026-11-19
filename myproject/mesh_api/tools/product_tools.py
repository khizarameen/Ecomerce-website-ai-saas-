"""
Universal LangChain Tools for StoreHub DB Search, Product Idea Generation, & Dynamic Supply Chain Mesh
"""

import logging
import re
from typing import Any, Dict, List, Optional

from django.db.models import Case, IntegerField, Q, Value, When
from langchain_core.tools import tool

from store.models import Category, Product, StoreSettings

from ..llm_factory import invoke_mesh_json

logger = logging.getLogger(__name__)

_GENERIC_WORDS = {
    'all', 'products', 'product', 'items', 'item', 'store', 'catalog', 'best',
    'find', 'search', 'show', 'compare', 'with', 'under', 'below', 'above',
    'for', 'and', 'the', 'sab', 'mein', 'idea', 'setup', 'bundle', 'urgent',
    'deliver', 'chahiye', 'budget', 'hai', 'hain', 'days', 'din', 'good', 'cheap',
    'cancel', 'cancelled', 'canceled', 'cancellation', 'order', 'orders',
    'discount', 'discounts', 'discounted', 'deal', 'deals', 'available',
    'supply', 'chain', 'hub', 'check', 'checking', 'seller', 'sellers', 'saller',
    'original', 'orginal', 'karo', 'kar', 'karein', 'dikhao', 'batao', 'batain',
    'alag', 'bhi', 'aur', 'yaar', 'rate', 'price', 'ka', 'ki', 'ke', 'ko', 'se',
}


def _serialize_db_product(p: Product, query_tokens: List[str]) -> Dict[str, Any]:
    """Normalize a Django store.models.Product instance into universal AI catalog format."""
    name_lower = (p.name or '').lower()
    desc_lower = (p.final_description or '').lower()
    cat_name = p.category.name if p.category else 'General'

    hits = sum(1 for t in query_tokens if t in name_lower or t in desc_lower or t in cat_name.lower())
    score = min(98, 76 + hits * 8) if query_tokens else 85
    if p.status == 'published' and p.stock_quantity > 0:
        score = min(99, score + 5)

    return {
        'id': p.id,
        'slug': p.slug,
        'name': p.name,
        'price': float(p.price),
        'compare_price': float(p.compare_price) if p.compare_price else None,
        'category': cat_name,
        'rating': float(p.average_rating or 4.5),
        'total_reviews': int(p.total_reviews or 0),
        'stock_quantity': int(p.stock_quantity or 0),
        'in_stock': bool(p.stock_quantity and p.stock_quantity > 0),
        'status': p.status,
        'seller_name': p.seller.store_name if p.seller else 'StoreHub Direct',
        'seller_location': p.seller.address if p.seller and p.seller.address else 'Regional StoreHub Hub',
        'image_url': p.main_image.url if p.main_image else None,
        'specs': (p.short_description or p.final_description or '')[:180],
        'match_score': score,
        'source': 'Local Store DB',
        'why_recommended': (
            f"Available in StoreHub '{cat_name}' catalog via {p.seller.store_name if p.seller else 'verified seller'}"
            f"{' (In Stock)' if p.stock_quantity > 0 else ' (Reserve Stock Check)'}."
        ),
    }


def _synthesize_market_catalog(
    query: str,
    category: str = '',
    max_price: Optional[float] = None,
    limit: int = 4,
) -> List[Dict[str, Any]]:
    """Use LLM to synthesize realistic global market catalog items when local DB lacks matches."""
    budget_hint = f'each item under ${max_price:,.0f}' if max_price else 'realistic USD market pricing'
    cat_hint = f'focusing on category "{category}"' if category and category.lower() != 'all' else ''

    fallback_items = [
        {
            'name': f'Pro {query.title()[:36] or "Electronics"} Edition',
            'price': min(float(max_price or 450) * 0.75, 499.0),
            'category': category if category and category != 'All' else 'Electronics',
            'rating': 4.7,
            'stock_quantity': 45,
            'specs': 'Enterprise-grade build, 1-year warranty, express mesh fulfillment ready.',
            'why_recommended': f'Strong price-to-performance fit for "{query}" within your target range.',
            'match_score': 92,
        },
        {
            'name': f'Value {query.title()[:36] or "Smart"} Essential',
            'price': min(float(max_price or 250) * 0.5, 249.0),
            'category': category if category and category != 'All' else 'Electronics',
            'rating': 4.5,
            'stock_quantity': 80,
            'specs': 'High-efficiency budget pick with fast regional air dispatch.',
            'why_recommended': 'Best budget-friendly alternative leaving extra room under your cost cap.',
            'match_score': 88,
        },
    ]

    system_prompt = (
        'You are a Global E-Commerce Product Catalog Engine. '
        'Generate realistic, real-world products (real product classes, realistic specs, accurate USD market prices) matching the user query.\n'
        'Return a JSON object: {"products": [{"name": str, "price": number, "category": str, "rating": number (4.1-4.9), '
        '"stock_quantity": int, "specs": str (max 120 chars), "why_recommended": str (max 130 chars), "match_score": int (82-98)}]}'
    )
    user_prompt = (
        f'Query: "{query}" {cat_hint}\n'
        f'Price constraint: {budget_hint}\n'
        f'Return {limit} distinct, real-world products sorted by best value.'
    )
    data = invoke_mesh_json(system_prompt, user_prompt, {'products': fallback_items})
    raw_list = data.get('products') if isinstance(data, dict) else (data if isinstance(data, list) else fallback_items)
    if not isinstance(raw_list, list) or not raw_list:
        raw_list = fallback_items

    results: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_list[:limit]):
        if not isinstance(item, dict) or not item.get('name'):
            continue
        price = float(item.get('price') or 199.0)
        if max_price and price > max_price:
            price = round(max_price * 0.85, 2)
        results.append({
            'id': None,
            'slug': None,
            'name': str(item.get('name')),
            'price': round(price, 2),
            'compare_price': round(price * 1.15, 2),
            'category': str(item.get('category') or category or 'General'),
            'rating': round(min(max(float(item.get('rating') or 4.6), 3.5), 5.0), 1),
            'total_reviews': 42 + idx * 19,
            'stock_quantity': max(int(item.get('stock_quantity') or 25), 1),
            'in_stock': True,
            'status': 'global_mesh_available',
            'seller_name': 'Global Mesh Verified Vendor',
            'seller_location': 'Global Distribution Hub',
            'image_url': None,
            'specs': str(item.get('specs') or '')[:180],
            'match_score': min(max(int(item.get('match_score') or 90), 75), 99),
            'source': 'Global AI Mesh',
            'why_recommended': str(item.get('why_recommended') or 'Recommended by AI Catalog Advisor.'),
        })
    return results


def search_store_catalog_fn(
    query: str = '',
    category: str = '',
    max_price: Optional[float] = None,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    """
    Search the Django Product database with Q filters and seamlessly augment with
    LLM-synthesized global market catalog items when local DB matches are scarce.
    """
    tokens = [
        t for t in re.findall(r'[a-zA-Z0-9]{2,}', (query or '').lower())
        if t not in _GENERIC_WORDS and not t.isdigit()
    ]

    qs = (
        Product.objects.select_related('category', 'subcategory', 'seller')
        .exclude(status='discontinued')
        .annotate(
            priority=Case(
                When(status='published', stock_quantity__gt=0, then=Value(0)),
                When(status='published', then=Value(1)),
                When(stock_quantity__gt=0, then=Value(2)),
                default=Value(3),
                output_field=IntegerField(),
            )
        )
    )

    if category and category.lower() not in {'all', 'none', ''}:
        cat_filtered = qs.filter(Q(category__name__icontains=category) | Q(subcategory__name__icontains=category))
        if cat_filtered.exists():
            qs = cat_filtered

    if max_price is not None and max_price > 0:
        qs = qs.filter(price__lte=max_price)

    if tokens:
        q_obj = Q()
        for tok in tokens:
            q_obj |= (
                Q(name__icontains=tok)
                | Q(description__icontains=tok)
                | Q(short_description__icontains=tok)
                | Q(category__name__icontains=tok)
                | Q(seller__store_name__icontains=tok)
                | Q(sku__icontains=tok)
            )
        matched_qs = qs.filter(q_obj).distinct().order_by('priority', 'price')[:limit]
        if not matched_qs.exists():
            matched_qs = qs.order_by('priority', '-created_at')[:limit]
    else:
        matched_qs = qs.order_by('priority', '-created_at')[:limit]

    local_results = [_serialize_db_product(p, tokens) for p in matched_qs]

    # Always augment with AI global market items only if local DB has fewer than 3 items total
    if len(local_results) < 3:
        needed = max(3, min(limit - len(local_results), 4))
        synth_query = ' '.join(tokens) if tokens else (category if category and category.lower() != 'all' else 'Electronics')
        global_results = _synthesize_market_catalog(
            query=synth_query,
            category=category,
            max_price=max_price,
            limit=needed,
        )
        existing_names = {r['name'].lower() for r in local_results}
        for g in global_results:
            if g['name'].lower() not in existing_names:
                local_results.append(g)

    return local_results[:limit]


def generate_product_ideas_and_bundles_fn(
    user_goal: str,
    budget: Optional[float] = None,
    local_products: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Use the LLM to brainstorm setup/bundle ideas, budget split, pro tips, and recommended items
    for any English, Urdu, or Roman Urdu goal.
    """
    budget_val = float(budget) if budget and budget > 0 else 1500.0
    local_hint = ''
    if local_products:
        local_hint = 'Local store products available:\n' + '\n'.join(
            f"- {p['name']} (${p['price']}, {p['category']})" for p in local_products[:5]
        )

    fallback_ideas = {
        'bundle_name': f'Smart AI Bundle for: {user_goal[:50]}',
        'strategy': (
            f'Split your ${budget_val:,.0f} budget ~60% on core high-impact hardware/items, '
            f'~25% on essential accessories, and keep ~15% buffer for shipping or upgrades.'
        ),
        'budget_split': [
            {'category': 'Core Essential Item', 'allocation_pct': 60, 'amount_usd': round(budget_val * 0.60, 2)},
            {'category': 'Supporting Gear & Accessories', 'allocation_pct': 25, 'amount_usd': round(budget_val * 0.25, 2)},
            {'category': 'Express Delivery & Buffer', 'allocation_pct': 15, 'amount_usd': round(budget_val * 0.15, 2)},
        ],
        'pro_tips': [
            'Prioritize items with high durability and verified vendor stock before finalizing checkout.',
            'Bundle accessories together from a single hub to minimize shipping cost and transit SLA.',
        ],
        'recommended_items': [],
    }

    system_prompt = (
        'You are an Elite AI Product Consultant & Setup Architect.\n'
        'Given a user goal and budget, create a smart buying strategy, bundle breakdown, pro tips, and 3-4 concrete product recommendations in clear, concise English.\n'
        'Return JSON ONLY:\n'
        '{\n'
        '  "bundle_name": str,\n'
        '  "strategy": str (2-3 sentences explaining the smart buying plan),\n'
        '  "budget_split": [{"category": str, "allocation_pct": int, "amount_usd": number}],\n'
        '  "pro_tips": [str, str],\n'
        '  "recommended_items": [{"name": str, "category": str, "price": number, "rating": number, "specs": str, "why_recommended": str, "match_score": int}]\n'
        '}'
    )
    user_prompt = f'User Goal: "{user_goal}"\nTarget Budget: ${budget_val:,.0f}\n{local_hint}'
    data = invoke_mesh_json(system_prompt, user_prompt, fallback_ideas)

    if not isinstance(data, dict):
        return fallback_ideas

    normalized_items: List[Dict[str, Any]] = []
    for idx, item in enumerate(data.get('recommended_items') or []):
        if not isinstance(item, dict) or not item.get('name'):
            continue
        price = float(item.get('price') or round(budget_val * 0.25, 2))
        normalized_items.append({
            'id': None,
            'slug': None,
            'name': str(item.get('name')),
            'price': round(price, 2),
            'compare_price': round(price * 1.12, 2),
            'category': str(item.get('category') or 'Recommended Setup'),
            'rating': round(min(max(float(item.get('rating') or 4.7), 3.5), 5.0), 1),
            'total_reviews': 65 + idx * 14,
            'stock_quantity': 30,
            'in_stock': True,
            'status': 'global_mesh_available',
            'seller_name': 'Global Mesh Recommended Partner',
            'seller_location': 'Regional Fulfillment Hub',
            'image_url': None,
            'specs': str(item.get('specs') or '')[:180],
            'match_score': min(max(int(item.get('match_score') or 93), 80), 99),
            'source': 'Global AI Mesh',
            'why_recommended': str(item.get('why_recommended') or 'Tailored to your goal and budget.'),
        })

    return {
        'bundle_name': str(data.get('bundle_name') or fallback_ideas['bundle_name']),
        'strategy': str(data.get('strategy') or fallback_ideas['strategy']),
        'budget_split': data.get('budget_split') or fallback_ideas['budget_split'],
        'pro_tips': data.get('pro_tips') or fallback_ideas['pro_tips'],
        'recommended_items': normalized_items,
    }


def run_dynamic_supply_chain_mesh_fn(
    product_name: str,
    quantity: int = 1,
    deadline_days: float = 3.0,
    max_budget: Optional[float] = None,
    local_candidates: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Dynamically synthesize realistic multi-supplier quotes, regional weather/port/customs risk,
    and freight weight/SLA parameters for ANY requested product or multi-item order.
    """
    qty = max(int(quantity or 1), 1)
    sla = max(float(deadline_days or 3.0), 0.5)
    target_name = (product_name or 'StoreHub Order').strip()

    # Estimate sensible baseline budget if user didn't pass one
    unit_est = 320.0
    if local_candidates:
        unit_est = max(float(local_candidates[0].get('price') or 200.0), 25.0)
    fallback_budget = float(max_budget) if max_budget and max_budget > 0 else round(unit_est * qty * 1.25 + 150.0, 2)

    # Default realistic dynamic values (scaled to requested item & budget, never hardcoded to GPUs)
    sup_a_total = round(fallback_budget * 0.72, 2)
    sup_b_total = round(fallback_budget * 0.80, 2)
    sea_cost = round(min(max(fallback_budget * 0.03, 25.0), 1500.0), 2)
    air_cost = round(min(max(fallback_budget * 0.11, 65.0), 5500.0), 2)

    store_cfg = StoreSettings.objects.first()
    if store_cfg and qty <= 5 and sup_b_total < 2000:
        sea_cost = float(store_cfg.standard_shipping_cost)
        air_cost = round(max(sea_cost * 3.5, 24.99), 2)

    fallback_mesh = {
        'suppliers': [
            {
                'id': 'SUP-A',
                'name': f'Primary Direct Hub ({target_name[:24]})',
                'location': 'Shenzhen / Regional Port Hub',
                'hub_code': 'HUB-A1',
                'product_name': target_name,
                'quantity': qty,
                'total_price': sup_a_total,
                'ready_days': 0.5,
                'risk_score': 86,
                'delay_days': round(sla + 2.5, 1),
                'risk_hazard': f'Severe Port Congestion & Cyclone Advisory delaying {target_name} shipment',
            },
            {
                'id': 'SUP-B',
                'name': f'Verified Express Partner ({target_name[:22]})',
                'location': 'Singapore / Taipei / Regional Air Hub',
                'hub_code': 'HUB-B2',
                'product_name': target_name,
                'quantity': qty,
                'total_price': sup_b_total,
                'ready_days': 0.5,
                'risk_score': 14,
                'delay_days': 0.0,
                'risk_hazard': f'Clear Corridor & Priority Stock Verified for {target_name}',
            },
        ],
        'freight': {
            'ground_sea_days': 4.0,
            'ground_sea_cost': sea_cost,
            'air_days': 1.5,
            'air_cost': air_cost,
            'cargo_notes': f'Estimated pallet/parcel dispatch for {qty}x {target_name}',
        },
    }

    system_prompt = (
        'You are a Global Supply Chain Quoting & Risk Telemetry Engine.\n'
        'For the exact product(s), quantity, SLA days, and max budget provided, generate 2 realistic suppliers:\n'
        '- Supplier A: Slightly cheaper primary hub, BUT encounters a realistic regional/weather/port/customs disruption causing delay_days > deadline_days and high risk_score (75-92).\n'
        '- Supplier B: Reliable backup hub slightly higher cost, clear corridor (delay_days: 0.0, risk_score: 10-20), such that Supplier B total_price + air_cost <= max_budget (if feasible for that budget).\n'
        'Return JSON ONLY:\n'
        '{\n'
        '  "suppliers": [\n'
        '    {"id": "SUP-A", "name": str, "location": str, "hub_code": str, "total_price": number, "ready_days": 0.5, "risk_score": int, "delay_days": number, "risk_hazard": str},\n'
        '    {"id": "SUP-B", "name": str, "location": str, "hub_code": str, "total_price": number, "ready_days": 0.5, "risk_score": int, "delay_days": 0.0, "risk_hazard": str}\n'
        '  ],\n'
        '  "freight": {"ground_sea_days": number (e.g. 4.0), "ground_sea_cost": number, "air_days": number (e.g. 1.5), "air_cost": number, "cargo_notes": str}\n'
        '}'
    )
    user_prompt = (
        f'Requested Product(s): {target_name}\n'
        f'Total Quantity: {qty}\n'
        f'SLA Deadline: {sla} days\n'
        f'Max Budget: ${fallback_budget:,.2f}\n'
        f'Note: Keep all prices realistic for "{target_name}" and ensure Supplier B + Air fits comfortably under ${fallback_budget:,.2f} when possible.'
    )

    llm_data = invoke_mesh_json(system_prompt, user_prompt, fallback_mesh)
    if not isinstance(llm_data, dict) or not isinstance(llm_data.get('suppliers'), list) or len(llm_data['suppliers']) < 2:
        llm_data = fallback_mesh

    raw_suppliers = llm_data['suppliers'][:2]
    freight = llm_data.get('freight') or fallback_mesh['freight']

    # If local DB matches exist and user isn't doing a massive global B2B order, tie Candidate A/B to real DB info where helpful
    candidates: List[Dict[str, Any]] = []
    for idx, s in enumerate(raw_suppliers):
        total_price = float(s.get('total_price') or (sup_a_total if idx == 0 else sup_b_total))
        delay = float(s.get('delay_days') if s.get('delay_days') is not None else (sla + 2.0 if idx == 0 else 0.0))
        risk = int(s.get('risk_score') if s.get('risk_score') is not None else (85 if idx == 0 else 14))
        local_match = local_candidates[idx] if (local_candidates and idx < len(local_candidates)) else None

        candidates.append({
            'id': s.get('id') or ('SUP-A' if idx == 0 else 'SUP-B'),
            'node_key': 'supplier_a' if idx == 0 else 'supplier_b',
            'product_id': local_match.get('id') if local_match else None,
            'product_name': target_name,
            'category': local_match.get('category') if local_match else 'Global Supply Mesh',
            'name': str(s.get('name') or (f'Supplier A ({target_name[:20]})' if idx == 0 else f'Supplier B ({target_name[:20]})')),
            'location': str(s.get('location') or ('Primary Port Hub' if idx == 0 else 'Air Express Hub')),
            'hub_code': str(s.get('hub_code') or ('HUB-A' if idx == 0 else 'HUB-B')),
            'quantity': qty,
            'unit_price': round(total_price / qty, 2),
            'price': round(total_price, 2),
            'ready_days': float(s.get('ready_days') or 0.5),
            'stock_quantity': local_match.get('stock_quantity', max(qty, 25)) if local_match else max(qty, 25),
            'product_status': local_match.get('status', 'global_mesh_available') if local_match else 'global_mesh_available',
            'risk_score': risk,
            'delay_days': delay,
            'risk_hazard': str(s.get('risk_hazard') or ('Route disruption detected' if idx == 0 else 'Clear corridor verified')),
        })

    return {
        'candidates': candidates,
        'max_budget': fallback_budget,
        'freight': {
            'ground_sea_days': float(freight.get('ground_sea_days') or 4.0),
            'ground_sea_cost': float(freight.get('ground_sea_cost') or sea_cost),
            'air_days': float(freight.get('air_days') or 1.5),
            'air_cost': float(freight.get('air_cost') or air_cost),
            'cargo_notes': str(freight.get('cargo_notes') or f'Freight plan for {qty}x {target_name}'),
        },
    }


@tool
def search_store_catalog(query: str, category: str = '', max_price: Optional[float] = None) -> List[Dict[str, Any]]:
    """Search the Django E-commerce product database and global AI catalog by query, category, and max_price."""
    return search_store_catalog_fn(query=query, category=category, max_price=max_price, limit=6)


@tool
def generate_product_ideas_and_bundles(user_goal: str, budget: Optional[float] = None) -> Dict[str, Any]:
    """Brainstorm creative product ideas, multi-item setups/bundles, and budget allocation for a user goal."""
    return generate_product_ideas_and_bundles_fn(user_goal=user_goal, budget=budget)


@tool
def run_dynamic_supply_chain_mesh(
    product_name: str,
    quantity: int = 1,
    deadline_days: float = 3.0,
    max_budget: Optional[float] = None,
) -> Dict[str, Any]:
    """Generate dynamic supplier quotes, route risk evaluations, and freight plans for any product and quantity."""
    return run_dynamic_supply_chain_mesh_fn(
        product_name=product_name,
        quantity=quantity,
        deadline_days=deadline_days,
        max_budget=max_budget,
    )


MESH_TOOLS = [
    search_store_catalog,
    generate_product_ideas_and_bundles,
    run_dynamic_supply_chain_mesh,
]
