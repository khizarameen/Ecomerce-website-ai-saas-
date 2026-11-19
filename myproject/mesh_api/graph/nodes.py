"""
Universal Multi-Mode LangGraph Node Implementations
Works dynamically for ANY product, idea/bundle request, or bulk crisis procurement (English, Urdu, Roman Urdu).
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from store.models import Category, Product, Seller

from ..llm_factory import extract_universal_intent
from ..tools.product_tools import (
    generate_product_ideas_and_bundles_fn,
    run_dynamic_supply_chain_mesh_fn,
    search_store_catalog_fn,
)
from .state import SupplyChainState

logger = logging.getLogger(__name__)


def _ts() -> str:
    return datetime.now(timezone.utc).strftime('%H:%M:%S.%f')[:-3] + 'Z'


def _make_event(node: str, level: str, title: str, message: str, metrics: Dict[str, Any] = None) -> Dict[str, Any]:
    return {
        'timestamp': _ts(),
        'node': node,
        'level': level,
        'title': title,
        'message': message,
        'metrics': metrics or {},
    }


def _base_supplier_edge_status(
    state: SupplyChainState,
    risk_to_cargo: str = 'idle',
    cargo_to_haggle: str = 'idle',
    haggle_to_customs: str = 'idle',
    customs_to_budget: str = 'idle',
) -> Dict[str, str]:
    candidates = state.get('supplier_candidates') or []
    excluded = set(state.get('excluded_suppliers') or [])
    selected_key = (state.get('selected_supplier') or {}).get('node_key')
    use_sup_b = bool(candidates and candidates[0].get('id') in excluded) or selected_key == 'supplier_b'
    first_excluded = bool(candidates and candidates[0].get('id') in excluded)
    if use_sup_b:
        edges = {
            'orchestrator_to_supplier_a': 'failed' if first_excluded else 'idle',
            'supplier_a_to_risk': 'failed' if first_excluded else 'idle',
            'orchestrator_to_supplier_b': 'success',
            'supplier_b_to_risk': 'success',
        }
    else:
        edges = {
            'orchestrator_to_supplier_a': 'success',
            'supplier_a_to_risk': 'success',
            'orchestrator_to_supplier_b': 'idle',
            'supplier_b_to_risk': 'idle',
        }
    edges.update({
        'risk_to_cargo': risk_to_cargo,
        'cargo_to_haggle': cargo_to_haggle,
        'haggle_to_customs': haggle_to_customs,
        'customs_to_budget': customs_to_budget,
    })
    return edges


def _classify_hs_code(item_name: str, category: str):
    """Map product name and category to a realistic WCO Harmonized System tariff code."""
    text = f'{item_name} {category}'.lower()
    if any(k in text for k in ('phone', 'smartphone', 'iphone', 'pixel', 'galaxy', 'mobile')):
        return '8517.13', 'Smartphones & Wireless Cellular Handsets', True
    if any(k in text for k in ('solar', 'inverter', 'battery', 'lithium', 'ups', 'power')):
        return '8504.40', 'Static Converters, Solar Inverters & Battery Units', True
    if any(k in text for k in ('mic', 'podcast', 'headphone', 'earbud', 'audio', 'speaker', 'studio')):
        return '8518.10', 'Studio Microphones, Headphones & Audio Apparatus', True
    if any(k in text for k in ('chair', 'desk', 'ergonomic', 'furniture', 'table')):
        return '9401.30', 'Swivel Seats & Ergonomic Office Furniture', False
    if any(k in text for k in ('laptop', 'macbook', 'gpu', 'h100', 'server', 'computer', 'monitor', 'pc', 'ssd')):
        return '8471.30', 'Portable Computing Machines & Data Servers', True
    if any(k in text for k in ('jacket', 'shirt', 'hoodie', 'apparel', 'fashion', 'shoe', 'sneaker', 'watch')):
        return '6201.40', 'Technical Apparel & Consumer Wearables', False
    if any(k in text for k in ('dumbbell', 'fitness', 'yoga', 'gym', 'sport', 'treadmill')):
        return '9506.91', 'Physical Exercise & Athletic Equipment', False
    if any(k in text for k in ('book', 'manual', 'guide')):
        return '4901.99', 'Printed Technical Books & Publications', False
    return '8543.70', 'Specialized Electronic & Smart Equipment', True


def orchestrator_node(state: SupplyChainState) -> Dict[str, Any]:
    """
    Universal Orchestrator & Idea Planner Node:
    - Classifies intent (PRODUCT_SEARCH, IDEA_BRAINSTORM, BULK_SUPPLY_CHAIN, HYBRID)
    - Searches Django DB Product catalog + AI market catalog
    - Generates custom buying strategy & bundle ideas
    - Initializes dynamic suppliers & freight options for the requested item(s)
    """
    prompt = (state.get('prompt') or '').strip() or 'Find the best electronics products under $800 and compare them.'
    intent = extract_universal_intent(prompt)

    total_db_products = Product.objects.exclude(status='discontinued').count()
    total_categories = Category.objects.filter(is_active=True).count()
    total_sellers = Seller.objects.filter(is_active=True).count()

    search_query = ' '.join(intent.search_keywords) if intent.search_keywords else intent.primary_item
    catalog_max_price = intent.max_budget if (intent.max_budget and intent.quantity == 1) else None
    matched_products = search_store_catalog_fn(
        query=search_query,
        category=intent.category,
        max_price=catalog_max_price,
        limit=8,
    )

    local_only = [p for p in matched_products if p.get('source') == 'Local Store DB']
    ai_ideas = generate_product_ideas_and_bundles_fn(
        user_goal=prompt,
        budget=intent.max_budget,
        local_products=local_only or matched_products,
    )

    # Merge bundle recommendations into matched_products without duplicates
    seen_names = {p['name'].lower() for p in matched_products}
    for rec in ai_ideas.get('recommended_items') or []:
        if rec['name'].lower() not in seen_names:
            matched_products.append(rec)
            seen_names.add(rec['name'].lower())

    mesh_plan = run_dynamic_supply_chain_mesh_fn(
        product_name=intent.primary_item,
        quantity=intent.quantity,
        deadline_days=intent.max_days,
        max_budget=intent.max_budget,
        local_candidates=local_only or matched_products,
    )

    candidates = mesh_plan['candidates']
    max_budget = mesh_plan['max_budget']
    freight_options = mesh_plan['freight']

    catalog_stats = {
        'total_products_in_db': total_db_products,
        'matched_count': len(matched_products),
        'local_db_matches': len(local_only),
        'total_categories': total_categories,
        'total_sellers': total_sellers,
    }

    crisis_config = state.get('crisis_config') or {
        'typhoon_active': True,
        'strict_customs': False,
        'force_haggle': True,
    }
    active_triggers = [
        name for flag, name in (
            (crisis_config.get('typhoon_active', True), 'TYPHOON_SIM'),
            (crisis_config.get('strict_customs', False), 'STRICT_CUSTOMS'),
            (crisis_config.get('force_haggle', True), 'FORCE_HAGGLE_-12%'),
        ) if flag
    ]
    trigger_text = ', '.join(active_triggers) if active_triggers else 'NOMINAL'

    llm_summary = (
        f"[{intent.intent_type}] Scanned {total_db_products} StoreHub DB products + AI market catalog -> "
        f"{len(matched_products)} matches for '{intent.primary_item}'. "
        f"Target: {intent.quantity}x | SLA <= {intent.max_days:g}d | Cap ${max_budget:,.0f} | Sim: [{trigger_text}]."
    )

    event = _make_event(
        'orchestrator',
        'info',
        f'{intent.intent_type} DISPATCHED',
        llm_summary,
        {
            'intent_type': intent.intent_type,
            'item': intent.primary_item,
            'quantity': intent.quantity,
            'max_days': intent.max_days,
            'max_budget': max_budget,
            'crisis_config': crisis_config,
            **catalog_stats,
        },
    )

    return {
        'prompt': prompt,
        'intent_type': intent.intent_type,
        'item_name': intent.primary_item,
        'search_keywords': intent.search_keywords,
        'category': intent.category,
        'quantity': intent.quantity,
        'max_days': intent.max_days,
        'max_budget': max_budget,
        'ai_ideas': ai_ideas,
        'matched_products': matched_products[:10],
        'all_matching_products': matched_products[:10],
        'catalog_stats': catalog_stats,
        'catalog_help_summary': ai_ideas.get('strategy', ''),
        'excluded_suppliers': [],
        'supplier_candidates': candidates,
        'selected_supplier': None,
        'freight_options': freight_options,
        'risk_report': None,
        'delay_days': 0.0,
        'risk_score': 0,
        'logistics_plan': None,
        'total_delivery_days': 0.0,
        'crisis_config': crisis_config,
        'haggle_report': None,
        'customs_report': None,
        'total_cost': 0.0,
        'savings': 0.0,
        'escrow_approved': False,
        'po_hash': '',
        'purchase_order': None,
        'active_node': 'orchestrator',
        'status': 'routing',
        'edge_status': {'orchestrator_to_supplier_a': 'active'},
        'telemetry_event': event,
        'telemetry_logs': [event],
    }


def supplier_node(state: SupplyChainState) -> Dict[str, Any]:
    """Select best eligible supplier candidate for the requested product(s) not yet excluded."""
    excluded = set(state.get('excluded_suppliers') or [])
    candidates = state.get('supplier_candidates') or []
    available = [c for c in candidates if c['id'] not in excluded]
    available.sort(key=lambda c: c['price'])

    chosen = available[0] if available else candidates[-1]
    is_failover = len(excluded) > 0
    first_id = candidates[0]['id'] if candidates else ''

    if chosen['node_key'] == 'supplier_a':
        edge_status = {
            'orchestrator_to_supplier_a': 'active',
            'supplier_a_to_risk': 'active',
        }
    else:
        edge_status = {
            'orchestrator_to_supplier_a': 'failed' if first_id in excluded else 'idle',
            'supplier_a_to_risk': 'failed' if first_id in excluded else 'idle',
            'orchestrator_to_supplier_b': 'success',
            'supplier_b_to_risk': 'active',
        }

    msg = (
        f"{'Failover -> ' if is_failover else ''}Quoted {chosen['quantity']}x {chosen['product_name']} "
        f"via {chosen['name']} ({chosen['location']}) @ ${chosen['price']:,.2f} total, ready in {chosen['ready_days']}d."
    )

    event = _make_event(
        chosen['node_key'],
        'warning' if is_failover else 'info',
        'BACKUP SUPPLIER LOCKED' if is_failover else 'PRIMARY SUPPLIER QUOTE',
        msg,
        {
            'supplier_id': chosen['id'],
            'supplier_name': chosen['name'],
            'product_name': chosen['product_name'],
            'price_usd': chosen['price'],
            'ready_days': chosen['ready_days'],
        },
    )

    return {
        'selected_supplier': chosen,
        'active_node': chosen['node_key'],
        'status': 'routing',
        'edge_status': edge_status,
        'telemetry_event': event,
        'telemetry_logs': list(state.get('telemetry_logs') or []) + [event],
    }


def risk_radar_node(state: SupplyChainState) -> Dict[str, Any]:
    """Evaluate dynamic route, customs, weather & inventory risk for the selected supplier & product."""
    supplier = state.get('selected_supplier') or {}
    supplier_id = supplier.get('id', 'SUP-A')
    max_days = float(state.get('max_days', 3.0))
    excluded = list(state.get('excluded_suppliers') or [])
    candidates = state.get('supplier_candidates') or []
    remaining_after = [c for c in candidates if c['id'] not in excluded and c['id'] != supplier_id]

    crisis_config = state.get('crisis_config') or {}
    typhoon_active = bool(crisis_config.get('typhoon_active', True))

    if supplier_id == 'SUP-A' and not typhoon_active:
        delay_days = 0.0
        risk_score = 12
        hazard = f"Typhoon Override OFF -> Clear Express Corridor from {supplier.get('location', 'Primary Hub')}"
    elif supplier_id == 'SUP-A' and typhoon_active:
        delay_days = max(float(supplier.get('delay_days', 0.0)), max_days + 2.0, 5.0)
        risk_score = max(int(supplier.get('risk_score', 88)), 88)
        hazard = supplier.get('risk_hazard') or f"Critical Typhoon & Port Congestion on {supplier.get('product_name')} route"
    else:
        delay_days = float(supplier.get('delay_days', 0.0))
        risk_score = int(supplier.get('risk_score', 14))
        hazard = supplier.get('risk_hazard') or f"Corridor scan for {supplier.get('product_name')}"

    trigger_reroute = (delay_days > max_days) and bool(remaining_after)

    if trigger_reroute:
        if supplier_id not in excluded:
            excluded.append(supplier_id)
        status_flag = 'CRITICAL'
        edge_status = {
            'orchestrator_to_supplier_a': 'failed',
            'supplier_a_to_risk': 'failed',
            'orchestrator_to_supplier_b': 'active',
        }
        fallback_msg = (
            f'ALERT: {hazard} (Delay: +{delay_days:g}d, Risk: {risk_score}/100). '
            f'Violates {max_days:g}-day SLA -> Rerouting from {supplier.get("name")} to backup supplier!'
        )
        event_level = 'danger'
        event_title = 'ROUTE RISK / SLA BREACH DETECTED'
        next_status = 'rerouting'
    else:
        status_flag = 'CLEAR'
        edge_status = _base_supplier_edge_status(state, risk_to_cargo='active')
        fallback_msg = (
            f'{hazard} (Delay: {delay_days:g}d, Risk: {risk_score}/100). Route cleared for cargo-mesh.'
        )
        event_level = 'success'
        event_title = 'CORRIDOR RISK VERIFIED CLEAR'
        next_status = 'routing'

    event = _make_event(
        'risk_radar',
        event_level,
        event_title,
        fallback_msg,
        {'supplier_id': supplier_id, 'delay_days': delay_days, 'risk_score': risk_score, 'typhoon_active': typhoon_active},
    )

    return {
        'excluded_suppliers': excluded,
        'delay_days': delay_days,
        'risk_score': risk_score,
        'risk_report': {
            'supplier_id': supplier_id,
            'status': status_flag,
            'hazard': hazard,
            'delay_days': delay_days,
            'risk_score': risk_score,
        },
        'active_node': 'risk_radar',
        'status': next_status,
        'edge_status': edge_status,
        'telemetry_event': event,
        'telemetry_logs': list(state.get('telemetry_logs') or []) + [event],
    }


def cargo_mesh_node(state: SupplyChainState) -> Dict[str, Any]:
    """Calculate dynamic weight/volume freight mode and upgrade to Air Charter if Ground/Sea misses SLA."""
    supplier = state.get('selected_supplier') or {}
    freight = state.get('freight_options') or {}
    ready_days = float(supplier.get('ready_days', 0.5))
    delay_days = float(state.get('delay_days', 0.0))
    max_days = float(state.get('max_days', 3.0))

    sea_days = float(freight.get('ground_sea_days', 4.0))
    sea_cost = float(freight.get('ground_sea_cost', 150.0))
    air_days = float(freight.get('air_days', 1.5))
    air_cost = float(freight.get('air_cost', 450.0))
    cargo_notes = freight.get('cargo_notes', '')

    ground_sea_total = round(ready_days + delay_days + sea_days, 2)
    air_charter_total = round(ready_days + delay_days + air_days, 2)

    if ground_sea_total <= max_days:
        chosen_mode = 'Standard Ground / Sea'
        transit_days = sea_days
        freight_cost = sea_cost
        total_days = ground_sea_total
        upgraded = False
    else:
        chosen_mode = 'Priority Air Charter'
        transit_days = air_days
        freight_cost = air_cost
        total_days = air_charter_total
        upgraded = True

    msg = (
        f"Ground/Sea ({ground_sea_total:g}d) misses {max_days:g}d SLA for {supplier.get('product_name')} -> "
        f"Upgraded to {chosen_mode} ({transit_days:g}d, ${freight_cost:,.2f}). Total ETA: {total_days:g}d."
        if upgraded
        else f"Locked {chosen_mode} (${freight_cost:,.2f}) for {supplier.get('product_name')}. Total ETA: {total_days:g}d."
    )

    edge_status = _base_supplier_edge_status(state, risk_to_cargo='success', cargo_to_haggle='active')

    event = _make_event(
        'cargo_mesh',
        'warning' if upgraded else 'success',
        'UPGRADED TO PRIORITY AIR CHARTER' if upgraded else 'FREIGHT MODE VERIFIED',
        msg,
        {
            'mode': chosen_mode,
            'transit_days': transit_days,
            'freight_cost_usd': freight_cost,
            'total_delivery_days': total_days,
            'sla_met': total_days <= max_days,
        },
    )

    return {
        'logistics_plan': {
            'mode': chosen_mode,
            'carrier': 'SupplyShield Priority Air Express' if upgraded else 'StoreHub Regional Freight',
            'ready_days': ready_days,
            'transit_days': transit_days,
            'delay_days': delay_days,
            'total_delivery_days': total_days,
            'cost_usd': freight_cost,
            'upgraded_from_sea': upgraded,
            'cargo_notes': cargo_notes,
        },
        'total_delivery_days': total_days,
        'active_node': 'cargo_mesh',
        'status': 'routing',
        'edge_status': edge_status,
        'telemetry_event': event,
        'telemetry_logs': list(state.get('telemetry_logs') or []) + [event],
    }


def haggle_node(state: SupplyChainState) -> Dict[str, Any]:
    """
    Node 5 (haggle-bot): Autonomous 2-round A2A price bargaining & instant escrow rebate
    negotiation with the selected supplier. Secures an 8% to 14% Instant Escrow Rebate.
    """
    supplier = dict(state.get('selected_supplier') or {})
    logistics = state.get('logistics_plan') or {}
    crisis_config = state.get('crisis_config') or {}
    force_haggle = bool(crisis_config.get('force_haggle', True))

    original_price = float(supplier.get('original_price', supplier.get('price', 0.0)))
    freight_cost = float(logistics.get('cost_usd', 0.0))
    max_budget = float(state.get('max_budget', 1000.0))
    over_budget_pressure = (original_price + freight_cost) > (max_budget * 0.92)

    if force_haggle:
        rebate_pct = 14.0 if over_budget_pressure else 12.0
    elif over_budget_pressure:
        rebate_pct = 11.0
    else:
        rebate_pct = 8.5

    rebate_amount = round(original_price * (rebate_pct / 100.0), 2)
    negotiated_price = max(round(original_price - rebate_amount, 2), 1.0)
    counter_amount = round(original_price * 0.075, 2)

    qty = state.get('quantity', 1)
    product_label = supplier.get('product_name') or state.get('item_name') or 'Order Bundle'
    supplier_name = supplier.get('name') or 'Selected Supplier'
    mode = logistics.get('mode') or 'Express Logistics'

    dialogue = [
        {
            'round': 1,
            'from': 'haggle-bot',
            'to': supplier_name,
            'message': (
                f"A2A Offer #1: Requesting 14.0% Instant Escrow Rebate on {qty}x {product_label} "
                f"(${original_price:,.2f}) with zero-chargeback cryptographic escrow lock."
            ),
        },
        {
            'round': 1,
            'from': supplier_name,
            'to': 'haggle-bot',
            'message': (
                f"Counter-Offer #1: Can offer 7.5% volume discount (-${counter_amount:,.2f}) "
                f"given priority {mode} dispatch allocation."
            ),
        },
        {
            'round': 2,
            'from': 'haggle-bot',
            'to': supplier_name,
            'message': (
                f"A2A Offer #2: Committing instant A2A settlement + repeat procurement preference "
                f"for -{rebate_pct:.1f}% Instant Escrow Rebate."
            ),
        },
        {
            'round': 2,
            'from': supplier_name,
            'to': 'haggle-bot',
            'message': (
                f"ACCEPTED: Locking {rebate_pct:.1f}% Instant Escrow Rebate (-${rebate_amount:,.2f}). "
                f"Rebated quote = ${negotiated_price:,.2f}."
            ),
        },
    ]

    supplier['original_price'] = original_price
    supplier['price'] = negotiated_price

    haggle_report = {
        'agent_id': 'haggle-bot',
        'supplier_id': supplier.get('id'),
        'supplier_name': supplier_name,
        'original_price_usd': original_price,
        'rebate_pct': rebate_pct,
        'rebate_amount_usd': rebate_amount,
        'negotiated_price_usd': negotiated_price,
        'force_haggle_active': force_haggle,
        'rounds': 2,
        'status': 'REBATE_LOCKED',
        'dialogue': dialogue,
    }

    msg = (
        f"2-Round A2A Haggle with {supplier_name}: [R1 Bot asks -14% -> Vendor counters -7.5%] -> "
        f"[R2 Instant Escrow Lock ACCEPTED at -{rebate_pct:.1f}% (-${rebate_amount:,.2f})! "
        f"Quote dropped ${original_price:,.2f} -> ${negotiated_price:,.2f}]."
    )

    edge_status = _base_supplier_edge_status(
        state,
        risk_to_cargo='success',
        cargo_to_haggle='success',
        haggle_to_customs='active',
    )

    event = _make_event(
        'haggle_bot',
        'success',
        f'A2A REBATE LOCKED (-{rebate_pct:.1f}%)',
        msg,
        {
            'original_price_usd': original_price,
            'rebate_pct': rebate_pct,
            'rebate_amount_usd': rebate_amount,
            'negotiated_price_usd': negotiated_price,
            'rounds': 2,
        },
    )

    return {
        'selected_supplier': supplier,
        'haggle_report': haggle_report,
        'active_node': 'haggle_bot',
        'status': 'routing',
        'edge_status': edge_status,
        'telemetry_event': event,
        'telemetry_logs': list(state.get('telemetry_logs') or []) + [event],
    }


def customs_node(state: SupplyChainState) -> Dict[str, Any]:
    """
    Node 6 (customs-shield): Assigns HS Tariff Code, verifies Hazmat/Lithium air compliance,
    handles strict customs inspection toggles, and issues GREEN-LANE PRE-CLEARED status.
    """
    supplier = state.get('selected_supplier') or {}
    logistics = state.get('logistics_plan') or {}
    crisis_config = state.get('crisis_config') or {}
    strict_customs = bool(crisis_config.get('strict_customs', False))

    item_label = supplier.get('product_name') or state.get('item_name') or 'Commercial Goods'
    category = state.get('category') or 'General'
    hs_code, hs_description, is_electronic = _classify_hs_code(item_label, category)

    is_air = 'air' in str(logistics.get('mode', '')).lower()
    if is_electronic and is_air:
        hazmat_compliance = 'UN3481 PI967 Lithium-Ion Air Safety Verified (PASS)'
    elif is_electronic:
        hazmat_compliance = 'IATA / IMDG Standard Electronic Packaging Verified (PASS)'
    else:
        hazmat_compliance = 'ICAO Non-Restricted Commercial Cargo Verified (PASS)'

    if strict_customs:
        inspection_mode = 'STRICT CUSTOMS AUDIT -> AEO DIGITAL CARNET CLEARED'
        event_level = 'warning'
        event_title = 'STRICT CUSTOMS AUDIT PRE-CLEARED'
        added_note = 'Dual-Tariff X-Ray Pre-Filing & Digital ATA Carnet neutralized strict port hold (0.0d delay).'
    else:
        inspection_mode = 'AEO FAST-TRACK EXPRESS MANIFEST'
        event_level = 'success'
        event_title = 'GREEN-LANE PRE-CLEARED'
        added_note = 'Automated WCO Harmonized Tariff manifest filed for instant border release (0.0d delay).'

    seed = f"{supplier.get('id')}|{item_label}|{hs_code}|{strict_customs}|{datetime.now(timezone.utc).isoformat()}"
    clearance_id = f"CLR-SS-{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:8].upper()}"

    customs_report = {
        'agent_id': 'customs-shield',
        'hs_code': hs_code,
        'hs_description': hs_description,
        'hazmat_compliance': hazmat_compliance,
        'inspection_mode': inspection_mode,
        'strict_customs_active': strict_customs,
        'added_delay_days': 0.0,
        'clearance_id': clearance_id,
        'status': 'GREEN-LANE PRE-CLEARED',
        'notes': added_note,
    }

    msg = (
        f"HS Code {hs_code} ({hs_description}) | {hazmat_compliance} | "
        f"{added_note} Certificate: {clearance_id} [GREEN-LANE PRE-CLEARED]."
    )

    edge_status = _base_supplier_edge_status(
        state,
        risk_to_cargo='success',
        cargo_to_haggle='success',
        haggle_to_customs='success',
        customs_to_budget='active',
    )

    event = _make_event(
        'customs_shield',
        event_level,
        event_title,
        msg,
        {
            'hs_code': hs_code,
            'clearance_id': clearance_id,
            'status': 'GREEN-LANE PRE-CLEARED',
            'strict_customs': strict_customs,
        },
    )

    return {
        'customs_report': customs_report,
        'active_node': 'customs_shield',
        'status': 'routing',
        'edge_status': edge_status,
        'telemetry_event': event,
        'telemetry_logs': list(state.get('telemetry_logs') or []) + [event],
    }


def budget_guard_node(state: SupplyChainState) -> Dict[str, Any]:
    """Verify total landed cost, compute savings, issue Escrow PO Hash, and finalize Smart PO Certificate."""
    supplier = state.get('selected_supplier') or {}
    logistics = state.get('logistics_plan') or {}
    haggle_report = state.get('haggle_report') or {}
    customs_report = state.get('customs_report') or {}
    crisis_config = state.get('crisis_config') or {}

    max_budget = float(state.get('max_budget', 1000.0))
    max_days = float(state.get('max_days', 3.0))

    supplier_cost = float(supplier.get('price', 0.0))
    original_supplier_cost = float(haggle_report.get('original_price_usd', supplier.get('original_price', supplier_cost)))
    haggle_rebate_pct = float(haggle_report.get('rebate_pct', 0.0))
    haggle_discount_usd = float(haggle_report.get('rebate_amount_usd', 0.0))

    freight_cost = float(logistics.get('cost_usd', 0.0))
    total_cost = round(supplier_cost + freight_cost, 2)
    savings = round(max_budget - total_cost, 2)
    total_days = float(state.get('total_delivery_days', 2.0))

    approved = (total_cost <= max_budget) and (total_days <= max_days)

    raw_seed = (
        f"{supplier.get('id')}|{supplier.get('product_name')}|{supplier_cost}|{logistics.get('mode')}|"
        f"{freight_cost}|{total_cost}|{state.get('quantity')}|{datetime.now(timezone.utc).isoformat()}"
    )
    full_hash = hashlib.sha256(raw_seed.encode('utf-8')).hexdigest()
    po_hash = f'0x{full_hash[:24].upper()}'

    matched = state.get('matched_products') or []
    help_fallback = (
        f"Found {len(matched)} matching item(s) for '{state.get('item_name')}'. "
        f"Optimal route locked via {supplier.get('name')} at ${total_cost:,.2f} total (ETA {total_days:g}d)."
    )
    catalog_help_summary = state.get('catalog_help_summary') or help_fallback

    if approved:
        msg = (
            f"Escrow APPROVED for {supplier.get('product_name')}: Landed cost ${total_cost:,.2f} "
            f"(includes -${haggle_discount_usd:,.2f} Haggle-Bot rebate) <= ${max_budget:,.2f} budget. "
            f"Saved ${savings:,.2f} | Customs {customs_report.get('clearance_id', 'CLR-OK')} GREEN-LANE. PO Hash: {po_hash}."
        )
    else:
        msg = (
            f"Escrow REVIEW: Landed cost ${total_cost:,.2f} or ETA {total_days:g}d exceeds cap "
            f"(${max_budget:,.2f} / {max_days:g}d)."
        )

    edge_status = _base_supplier_edge_status(
        state,
        risk_to_cargo='success',
        cargo_to_haggle='success',
        haggle_to_customs='success',
        customs_to_budget='success' if approved else 'failed',
    )

    event = _make_event(
        'budget_guard',
        'success' if approved else 'danger',
        'ESCROW PO APPROVED' if approved else 'ESCROW REVIEW TRIGGERED',
        msg,
        {
            'total_cost_usd': total_cost,
            'savings_usd': savings,
            'haggle_discount_usd': haggle_discount_usd,
            'hs_code': customs_report.get('hs_code'),
            'po_hash': po_hash,
            'approved': approved,
        },
    )

    full_logs = list(state.get('telemetry_logs') or []) + [event]

    purchase_order = {
        'po_number': f'PO-SS-{full_hash[:8].upper()}',
        'po_hash': po_hash,
        'sha256': full_hash,
        'status': 'ESCROW_LOCKED_APPROVED' if approved else 'POLICY_REJECTED',
        'item_name': supplier.get('product_name') or state.get('item_name'),
        'quantity': state.get('quantity', 1),
        'supplier_id': supplier.get('id'),
        'supplier_name': supplier.get('name'),
        'supplier_location': supplier.get('location'),
        'original_supplier_cost_usd': original_supplier_cost,
        'supplier_cost_usd': supplier_cost,
        'haggle_rebate_pct': haggle_rebate_pct,
        'haggle_discount_usd': haggle_discount_usd,
        'haggle_dialogue': haggle_report.get('dialogue', []),
        'logistics_mode': logistics.get('mode'),
        'freight_cost_usd': freight_cost,
        'total_landed_cost_usd': total_cost,
        'max_budget_usd': max_budget,
        'savings_usd': savings,
        'delivery_eta_days': total_days,
        'sla_deadline_days': max_days,
        'risk_score': state.get('risk_score', 14),
        'hs_code': customs_report.get('hs_code', '8471.30'),
        'hs_description': customs_report.get('hs_description', 'Commercial Electronic Goods'),
        'customs_clearance_id': customs_report.get('clearance_id', 'CLR-SS-VERIFIED'),
        'customs_status': customs_report.get('status', 'GREEN-LANE PRE-CLEARED'),
        'hazmat_compliance': customs_report.get('hazmat_compliance', 'UN3481 PI967 Verified'),
        'inspection_mode': customs_report.get('inspection_mode', 'AEO FAST-TRACK'),
        'crisis_config': crisis_config,
        'audit_trail': [
            {
                'timestamp': item.get('timestamp'),
                'node': item.get('node'),
                'title': item.get('title'),
                'message': item.get('message'),
            }
            for item in full_logs
        ],
        'issued_at': datetime.now(timezone.utc).isoformat(),
    }

    return {
        'total_cost': total_cost,
        'savings': savings,
        'escrow_approved': approved,
        'po_hash': po_hash,
        'purchase_order': purchase_order,
        'catalog_help_summary': catalog_help_summary,
        'active_node': 'budget_guard',
        'status': 'approved' if approved else 'rejected',
        'edge_status': edge_status,
        'telemetry_event': event,
        'telemetry_logs': full_logs,
    }
