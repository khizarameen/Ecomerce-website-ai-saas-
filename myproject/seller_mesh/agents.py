"""4 collaborative agents of the Seller Profit-Shield & Anti-RTO Mesh.

Engines (backend-only keys from .env):
- Agent 3 return_fraud_vision_agent  -> Google Gemini `gemini-2.5-flash`
- Agents 1, 2, 4                    -> Groq `llama-3.3-70b-versatile`

The LLMs only write the narrative summary. Every number (money, weights,
counts) is computed deterministically so the dashboard stays consistent, and
each call falls back to a deterministic summary when a key is missing, the
model errors, or the provider is rate-limited. A short circuit breaker stops
retrying a failing engine for a few minutes so demos never hang.
"""

import json
import logging
import os
import re
import time
from datetime import datetime, timezone

from django.conf import settings

from .graph_state import SellerProfitShieldState

logger = logging.getLogger(__name__)

GEMINI_MODEL = 'gemini-2.5-flash'
GROQ_MODEL = 'llama-3.3-70b-versatile'
LLM_TIMEOUT_SECONDS = 8
CIRCUIT_COOLDOWN_SECONDS = 300

AGENT_1 = 'cod_risk_gatekeeper_agent'
AGENT_2 = 'intransit_rto_rerouter_agent'
AGENT_3 = 'return_fraud_vision_agent'
AGENT_4 = 'profit_bleed_auditor_agent'
ALL_AGENTS = (AGENT_1, AGENT_2, AGENT_3, AGENT_4)

AGENT_CHAINS = {
    'FULL_PROFIT_SHIELD_SWEEP': [AGENT_1, AGENT_2, AGENT_3, AGENT_4],
    'FAKE_COD_WAVE': [AGENT_1, AGENT_2],
    'IN_TRANSIT_RTO_ALERT': [AGENT_2],
    'RETURN_FRAUD_INSPECTION': [AGENT_3, AGENT_4],
    'COURIER_WEIGHT_BLEED': [AGENT_4],
}

# ---------------------------------------------------------------------------
# Scenario data (deterministic demo telemetry for SKU PROBASS-X1)
# ---------------------------------------------------------------------------
UNIT_PRICE = 45.00
UNIT_COST = 22.00
COD_WASTE_PER_ORDER = 8.00  # $3.50 outbound + $4.50 return freight

INCOMING_ORDERS = [
    {'order_id': '#ORD-9911', 'city': 'Lahore', 'payment': 'Prepaid', 'rto_score': 4},
    {'order_id': '#ORD-9912', 'city': 'Islamabad', 'payment': 'COD', 'rto_score': 11},
    {'order_id': '#ORD-9913', 'city': 'Lahore', 'payment': 'COD', 'rto_score': 9},
    {
        'order_id': '#ORD-9914', 'city': 'Karachi', 'payment': 'COD', 'rto_score': 82,
        'risk_reason': 'Incomplete address: "Near Masjid Street 4" (no house / block number)',
    },
    {'order_id': '#ORD-9915', 'city': 'Faisalabad', 'payment': 'Prepaid', 'rto_score': 3},
    {'order_id': '#ORD-9916', 'city': 'Rawalpindi', 'payment': 'COD', 'rto_score': 14},
    {
        'order_id': '#ORD-9917', 'city': 'Multan', 'payment': 'COD', 'rto_score': 91,
        'risk_reason': 'Unreachable prank number 0300-0000000 with 3 prior doorstep refusals',
    },
    {'order_id': '#ORD-9918', 'city': 'Lahore', 'payment': 'COD', 'rto_score': 12},
    {'order_id': '#ORD-9919', 'city': 'Islamabad', 'payment': 'Prepaid', 'rto_score': 2},
    {'order_id': '#ORD-9920', 'city': 'Karachi', 'payment': 'COD', 'rto_score': 8},
    {'order_id': '#ORD-9921', 'city': 'Lahore', 'payment': 'Prepaid', 'rto_score': 5},
    {
        'order_id': '#ORD-9923', 'city': 'Peshawar', 'payment': 'COD', 'rto_score': 77,
        'risk_reason': '4 duplicate COD orders from one device with mismatched buyer names',
    },
]
RTO_RISK_THRESHOLD = 60

STRANDED_PARCEL = {
    'stranded_awb': '#TRK-8841',
    'hub_city': 'Karachi',
    'original_buyer_status': 'REFUSED_AT_DOORSTEP',
    'return_freight_cost': 14.50,
    'transit_days_saved': 7,
}

DISPATCH_EVIDENCE = {
    'serial': '#PB-X1-9042',
    'finish': 'Pristine matte-black charging case',
    'seal': 'Tamper seal intact, laser-etched serial on hinge',
    'weight_g': 52.4,
}
RETURN_EVIDENCE = {
    'serial': '#UNKNOWN',
    'finish': 'Scratched glossy counterfeit shell',
    'seal': 'Tamper seal missing, no laser-etched serial',
    'weight_g': 48.3,
}

AUDIT_SHIPMENTS = 18
BILLED_WEIGHT_KG = 1.50
ACTUAL_WEIGHT_KG = 0.35
BILLED_SLAB_RATE = 4.10  # $ per shipment at the 1.5 kg slab
COURIER_OVERCHARGE = 38.50  # vs correct 0.5 kg slab across 18 AWBs
RETURN_LOSSES_IN_WINDOW = 59.50  # one swapped unit ($45) + one RTO return freight ($14.50)
SUPPLIER_BATCH_ID = 'B-2611'
SUPPLIER_BATCH_DEFECT_PCT = 5.0

# ---------------------------------------------------------------------------
# LLM plumbing with circuit breaker
# ---------------------------------------------------------------------------
_ENGINE_COOLDOWN_UNTIL = {'gemini': 0.0, 'groq': 0.0}
_ENGINE_LAST = {
    'gemini': {'mode': 'idle', 'reason': ''},
    'groq': {'mode': 'idle', 'reason': ''},
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gemini_key() -> str:
    return (
        getattr(settings, 'GEMINI_API_KEY', '')
        or os.getenv('GEMINI_API_KEY', '')
        or os.getenv('GOOGLE_API_KEY', '')
    )


def _groq_key() -> str:
    return getattr(settings, 'GROQ_API_KEY', '') or os.getenv('GROQ_API_KEY', '')


def get_engine_status() -> dict:
    """Engine readiness for the dashboard (never exposes key values)."""
    now = time.monotonic()
    return {
        'gemini': {
            'model': GEMINI_MODEL,
            'key_configured': bool(_gemini_key()),
            'cooling_down': now < _ENGINE_COOLDOWN_UNTIL['gemini'],
            'last_mode': _ENGINE_LAST['gemini']['mode'],
        },
        'groq': {
            'model': GROQ_MODEL,
            'key_configured': bool(_groq_key()),
            'cooling_down': now < _ENGINE_COOLDOWN_UNTIL['groq'],
            'last_mode': _ENGINE_LAST['groq']['mode'],
        },
    }


def _extract_json_block(raw_text: str) -> dict | None:
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    fence = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    else:
        brace = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if brace:
            cleaned = brace.group(0)
    try:
        parsed = json.loads(cleaned)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _content_text(response) -> str:
    content = getattr(response, 'content', '')
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get('text'):
                parts.append(str(part['text']))
        return '\n'.join(parts)
    return str(content or '')


def _mark(engine: str, mode: str, reason: str = '') -> None:
    _ENGINE_LAST[engine] = {'mode': mode, 'reason': reason}


def _invoke(engine: str, prompt: str) -> tuple[dict | None, str, str]:
    """Return (parsed_json | None, 'live' | 'fallback', fallback_reason)."""
    key = _gemini_key() if engine == 'gemini' else _groq_key()
    if not key:
        _mark(engine, 'fallback', 'no_api_key')
        return None, 'fallback', 'no_api_key'
    if time.monotonic() < _ENGINE_COOLDOWN_UNTIL[engine]:
        _mark(engine, 'fallback', 'circuit_cooldown')
        return None, 'fallback', 'circuit_cooldown'

    try:
        if engine == 'gemini':
            from langchain_google_genai import ChatGoogleGenerativeAI

            llm = ChatGoogleGenerativeAI(
                model=GEMINI_MODEL,
                google_api_key=key,
                temperature=0.2,
                max_retries=0,
                timeout=LLM_TIMEOUT_SECONDS,
            )
        else:
            from langchain_groq import ChatGroq

            base_url = (
                str(getattr(settings, 'GROQ_BASE_URL', '') or 'https://api.groq.com')
                .replace('/openai/v1', '')
                .rstrip('/')
            ) or 'https://api.groq.com'
            llm = ChatGroq(
                model=GROQ_MODEL,
                api_key=key,
                base_url=base_url,
                temperature=0.2,
                max_retries=0,
                timeout=LLM_TIMEOUT_SECONDS,
            )
        parsed = _extract_json_block(_content_text(llm.invoke(prompt)))
        if parsed:
            _mark(engine, 'live')
            return parsed, 'live', ''
        _mark(engine, 'fallback', 'unparseable_response')
        return None, 'fallback', 'unparseable_response'
    except Exception as err:  # rate limit, 404 model, network, auth ...
        _ENGINE_COOLDOWN_UNTIL[engine] = time.monotonic() + CIRCUIT_COOLDOWN_SECONDS
        reason = f'{type(err).__name__}'
        logger.warning('Profit-Shield %s call failed (%s); deterministic fallback for %ss',
                       engine, reason, CIRCUIT_COOLDOWN_SECONDS)
        _mark(engine, 'fallback', reason)
        return None, 'fallback', reason


def _summary(llm_json: dict | None, fallback_text: str) -> str:
    text = (llm_json or {}).get('action_summary')
    if isinstance(text, str) and 20 <= len(text.strip()) <= 600:
        return text.strip()
    return fallback_text


def next_in_chain(trigger: str, current: str) -> str:
    chain = AGENT_CHAINS.get(trigger, AGENT_CHAINS['FULL_PROFIT_SHIELD_SWEEP'])
    if current in chain:
        idx = chain.index(current)
        if idx + 1 < len(chain):
            return chain[idx + 1]
    return 'END'


def _log(agent: str, engine_model: str, action: str, money: float, handoff: str,
         autonomous: bool, mode: str, reason: str, **details) -> dict:
    return {
        'agent_name': agent,
        'llm_engine': engine_model,
        'action': action,
        'money_impact': round(float(money), 2),
        'handoff_to': handoff,
        'is_autonomous': autonomous,
        'timestamp': _utc_now_iso(),
        'details': {'engine_mode': mode, 'fallback_reason': reason, **details},
    }


# ---------------------------------------------------------------------------
# Agent 1: The Gatekeeper (Groq)
# ---------------------------------------------------------------------------
def cod_risk_gatekeeper_agent(state: SellerProfitShieldState) -> dict:
    trigger = state.get('trigger_event', 'FULL_PROFIT_SHIELD_SWEEP')
    held = [o for o in INCOMING_ORDERS if o['rto_score'] >= RTO_RISK_THRESHOLD]
    verified = [o for o in INCOMING_ORDERS if o['rto_score'] < RTO_RISK_THRESHOLD]
    saved = round(len(held) * COD_WASTE_PER_ORDER, 2)
    handoff = next_in_chain(trigger, AGENT_1)

    prompt = (
        'You are cod_risk_gatekeeper_agent, a COD fraud gatekeeper for an e-commerce seller. '
        'Respond ONLY with JSON {"action_summary": string} in 1-2 sentences. Use these exact numbers.\n'
        f'Incoming unshipped orders: {len(INCOMING_ORDERS)}. Cleared for dispatch: {len(verified)}. '
        f'Placed on pre-dispatch hold: {len(held)} -> '
        + '; '.join(f"{o['order_id']} ({o['risk_reason']}, {o['rto_score']}% RTO score)" for o in held)
        + f'. WhatsApp/SMS confirmation links sent. Courier waste avoided: ${saved:.2f}.'
    )
    llm_json, mode, reason = _invoke('groq', prompt)
    fallback = (
        f'Scanned {len(INCOMING_ORDERS)} unshipped orders: auto-cleared {len(verified)} verified orders for '
        f'dispatch and placed a Pre-Dispatch Hold on {len(held)} high-risk COD orders (worst: '
        f'{held[0]["order_id"]} - incomplete address "Near Masjid Street 4", {held[0]["rto_score"]}% RTO score). '
        f'WhatsApp/SMS confirmation links sent; ${saved:.2f} in outbound + return freight avoided.'
    )

    orders_batch = {
        'total_incoming': len(INCOMING_ORDERS),
        'verified_safe': len(verified),
        'flagged_high_risk': len(held),
        'blocked_addresses': [f"{o['order_id']} - {o['city']}: {o['risk_reason']}" for o in held],
        'shipping_fee_saved': saved,
        'held_orders': [
            {
                'order_id': o['order_id'],
                'city': o['city'],
                'payment': o['payment'],
                'rto_score': o['rto_score'],
                'reason': o['risk_reason'],
            }
            for o in held
        ],
        'verified_orders': [
            {'order_id': o['order_id'], 'city': o['city'], 'payment': o['payment']} for o in verified
        ],
        'confirmation_channel': 'WhatsApp + SMS confirmation links',
    }
    return {
        'orders_batch': orders_batch,
        'next_agent': handoff,
        'agent_logs': [_log(AGENT_1, GROQ_MODEL, _summary(llm_json, fallback), saved, handoff, True,
                            mode, reason, held=len(held), cleared=len(verified))],
    }


# ---------------------------------------------------------------------------
# Agent 2: The Parcel Saver (Groq)
# ---------------------------------------------------------------------------
def intransit_rto_rerouter_agent(state: SellerProfitShieldState) -> dict:
    trigger = state.get('trigger_event', 'FULL_PROFIT_SHIELD_SWEEP')
    handoff = next_in_chain(trigger, AGENT_2)
    batch = state.get('orders_batch') or {}
    verified = batch.get('verified_orders')
    demand_source = 'Agent 1 live verified-order list'
    if not verified:
        verified = [
            {'order_id': o['order_id'], 'city': o['city'], 'payment': o['payment']}
            for o in INCOMING_ORDERS if o['rto_score'] < RTO_RISK_THRESHOLD
        ]
        demand_source = 'Last verified-order cache (Agent 1 not in this run)'

    hub_city = STRANDED_PARCEL['hub_city']
    match = next((o for o in verified if o['city'] == hub_city), None)
    saved = STRANDED_PARCEL['return_freight_cost'] if match else 0.0

    rto = {
        'stranded_awb': STRANDED_PARCEL['stranded_awb'],
        'hub_city': hub_city,
        'original_buyer_status': STRANDED_PARCEL['original_buyer_status'],
        'matched_new_order_id': match['order_id'] if match else '',
        'reroute_status': 'HUB_HOLD_48H_AWAITING_RELABEL' if match else 'RETURN_TO_ORIGIN',
        'rto_penalty_saved': saved,
        'sale_rescued': UNIT_PRICE if match else 0.0,
        'hold_window_hours': 48,
        'transit_days_saved': STRANDED_PARCEL['transit_days_saved'] if match else 0,
        'demand_source': demand_source,
    }

    prompt = (
        'You are intransit_rto_rerouter_agent, an in-transit RTO rescuer. Respond ONLY with JSON '
        '{"action_summary": string} in 1-2 sentences using these exact facts.\n'
        f'Parcel AWB {rto["stranded_awb"]} was refused at the doorstep in {hub_city}. Held at {hub_city} hub for 48h. '
        f'Matched fresh verified order: {rto["matched_new_order_id"] or "none"}. '
        f'Return freight avoided: ${saved:.2f}; sale rescued: ${rto["sale_rescued"]:.2f}; 7 transit days saved. '
        'Re-label needs seller approval.'
    )
    llm_json, mode, reason = _invoke('groq', prompt)

    approvals = []
    if match:
        fallback = (
            f'Parcel {rto["stranded_awb"]} refused at the doorstep - held at {hub_city} Hub for 48h instead of '
            f'paying return freight. Cross-matched against verified demand and found fresh order '
            f'{match["order_id"]} in {hub_city}. Drafted a Hub Re-Label & Local Diversion: '
            f'${saved:.2f} RTO freight saved + ${UNIT_PRICE:.2f} sale rescued, awaiting 1-click approval.'
        )
        approvals.append({
            'agent_name': AGENT_2,
            'action_type': 'HUB_REROUTE',
            'title': f'Re-Label {rto["stranded_awb"]} at {hub_city} Hub -> Order {match["order_id"]}',
            'description': (
                f'Buyer refused {rto["stranded_awb"]}. Instead of a 7-day return trip, re-label the parcel at the '
                f'{hub_city} hub and deliver it locally to verified order {match["order_id"]}.'
            ),
            'dollar_impact': saved,
            'payload': {
                'stranded_awb': rto['stranded_awb'],
                'hub_city': hub_city,
                'matched_new_order_id': match['order_id'],
                'sale_rescued': UNIT_PRICE,
                'transit_days_saved': rto['transit_days_saved'],
            },
        })
    else:
        fallback = (
            f'Parcel {rto["stranded_awb"]} refused in {hub_city}; no verified local order found, '
            'so standard return-to-origin applies.'
        )

    return {
        'rto_reroute_data': rto,
        'next_agent': handoff,
        'agent_logs': [_log(AGENT_2, GROQ_MODEL, _summary(llm_json, fallback), saved, handoff, False,
                            mode, reason, matched=rto['matched_new_order_id'])],
        'pending_approvals': approvals,
    }


# ---------------------------------------------------------------------------
# Agent 3: The Forensic Inspector (Gemini 2.5 Flash)
# ---------------------------------------------------------------------------
def return_fraud_vision_agent(state: SellerProfitShieldState) -> dict:
    trigger = state.get('trigger_event', 'FULL_PROFIT_SHIELD_SWEEP')
    handoff = next_in_chain(trigger, AGENT_3)

    serial_match = DISPATCH_EVIDENCE['serial'] == RETURN_EVIDENCE['serial']
    weight_delta = round(DISPATCH_EVIDENCE['weight_g'] - RETURN_EVIDENCE['weight_g'], 1)
    fraud = (not serial_match) and abs(weight_delta) >= 2.0
    claim = UNIT_PRICE if fraud else 0.0

    prompt = (
        'You are return_fraud_vision_agent, a multimodal return-forensics inspector. Compare the pre-dispatch '
        'packing evidence with the customer return evidence and respond ONLY with JSON '
        '{"action_summary": string, "dossier_summary": string, "returned_item_finding": string}.\n'
        f'Pre-dispatch snapshot: {json.dumps(DISPATCH_EVIDENCE)}\n'
        f'Return unboxing photo: {json.dumps(RETURN_EVIDENCE)}\n'
        'Buyer claim: "Left earbud dead / not charging - full refund requested". Return AWB #RTN-5512. '
        f'Claim value ${claim:.2f}. Keep every serial and number exactly as given.'
    )
    llm_json, mode, reason = _invoke('gemini', prompt)

    finding_fallback = (
        f'Returned unit carries serial {RETURN_EVIDENCE["serial"]} (dispatched {DISPATCH_EVIDENCE["serial"]}), '
        f'scratched glossy counterfeit shell, tamper seal missing, {weight_delta}g lighter than the dispatched unit.'
    )
    dossier_fallback = (
        f'Return AWB #RTN-5512: serial mismatch ({DISPATCH_EVIDENCE["serial"]} dispatched vs '
        f'{RETURN_EVIDENCE["serial"]} returned), missing laser-etch, {weight_delta}g weight delta and counterfeit '
        f'shell confirm a box-swap. Requesting ${claim:.2f} courier/marketplace reimbursement.'
    )
    llm = llm_json or {}
    finding = llm.get('returned_item_finding') if isinstance(llm.get('returned_item_finding'), str) else ''
    dossier = llm.get('dossier_summary') if isinstance(llm.get('dossier_summary'), str) else ''

    forensics = {
        'return_awb': '#RTN-5512',
        'claimed_reason': 'Left earbud dead / not charging - full refund requested',
        'dispatch_serial': DISPATCH_EVIDENCE['serial'],
        'returned_serial': RETURN_EVIDENCE['serial'],
        'returned_item_finding': finding.strip() or finding_fallback,
        'fraud_detected': fraud,
        'verdict': 'SWAP_FRAUD_CONFIRMED' if fraud else 'GENUINE_RETURN',
        'confidence_pct': 96 if fraud else 40,
        'claim_amount': claim,
        'claim_status': 'DOSSIER_READY' if fraud else 'NO_CLAIM',
        'dossier_summary': dossier.strip() or dossier_fallback,
        'dispatch_evidence': DISPATCH_EVIDENCE,
        'return_evidence': RETURN_EVIDENCE,
        'weight_delta_g': weight_delta,
    }

    fallback = (
        f'Visual forensic diff on return #RTN-5512: dispatched {DISPATCH_EVIDENCE["serial"]} (pristine matte-black '
        f'case) vs returned {RETURN_EVIDENCE["serial"]} (scratched counterfeit shell, {weight_delta}g lighter). '
        f'Verdict SWAP_FRAUD_CONFIRMED (96%) - ${claim:.2f} reimbursement dossier queued for 1-click submission.'
    )
    approvals = []
    if fraud:
        approvals.append({
            'agent_name': AGENT_3,
            'action_type': 'FRAUD_CLAIM',
            'title': f'Submit Return-Swap Fraud Claim Dossier #RTN-5512 (${claim:.2f})',
            'description': forensics['dossier_summary'],
            'dollar_impact': claim,
            'payload': {
                'return_awb': '#RTN-5512',
                'dispatch_serial': DISPATCH_EVIDENCE['serial'],
                'returned_serial': RETURN_EVIDENCE['serial'],
                'confidence_pct': 96,
                'verdict': 'SWAP_FRAUD_CONFIRMED',
            },
        })

    return {
        'return_forensics_data': forensics,
        'next_agent': handoff,
        'agent_logs': [_log(AGENT_3, GEMINI_MODEL, _summary(llm_json, fallback), claim, handoff, False,
                            mode, reason, verdict=forensics['verdict'])],
        'pending_approvals': approvals,
    }


# ---------------------------------------------------------------------------
# Agent 4: The Margin Auditor (Groq)
# ---------------------------------------------------------------------------
def profit_bleed_auditor_agent(state: SellerProfitShieldState) -> dict:
    revenue = AUDIT_SHIPMENTS * UNIT_PRICE
    cogs = AUDIT_SHIPMENTS * UNIT_COST
    courier_billed = AUDIT_SHIPMENTS * BILLED_SLAB_RATE
    gross_pct = round((revenue - cogs) / revenue * 100, 2)
    net_profit = revenue - cogs - courier_billed - RETURN_LOSSES_IN_WINDOW
    true_net_pct = round(net_profit / revenue * 100, 2)

    batch = state.get('orders_batch') or {}
    rto = state.get('rto_reroute_data') or {}
    forensics = state.get('return_forensics_data') or {}
    cod_saved = float(batch.get('shipping_fee_saved', 0) or 0)
    reroute_saved = float(rto.get('rto_penalty_saved', 0) or 0)
    claim = float(forensics.get('claim_amount', 0) or 0) if forensics.get('fraud_detected') else 0.0
    recoverable = reroute_saved + claim + COURIER_OVERCHARGE
    total_protected = round(cod_saved + recoverable, 2)
    projected_net_pct = round(min(gross_pct, true_net_pct + recoverable / revenue * 100), 2)

    audit = {
        'gross_margin_pct': gross_pct,
        'true_net_margin_pct': true_net_pct,
        'projected_net_margin_pct': projected_net_pct,
        'courier_overcharge_detected': COURIER_OVERCHARGE,
        'billed_weight_kg': BILLED_WEIGHT_KG,
        'actual_weight_kg': ACTUAL_WEIGHT_KG,
        'shipments_audited': AUDIT_SHIPMENTS,
        'supplier_batch_id': SUPPLIER_BATCH_ID,
        'batch_defect_rate_pct': SUPPLIER_BATCH_DEFECT_PCT,
        'audit_revenue': round(revenue, 2),
        'total_money_saved_today': total_protected,
    }

    prompt = (
        'You are profit_bleed_auditor_agent, an e-commerce margin auditor. Respond ONLY with JSON '
        '{"action_summary": string} in 1-2 sentences using these exact numbers.\n'
        f'{AUDIT_SHIPMENTS} AWBs billed at {BILLED_WEIGHT_KG}kg slab, actual SKU weight {ACTUAL_WEIGHT_KG}kg -> '
        f'${COURIER_OVERCHARGE:.2f} overcharged. Supplier batch {SUPPLIER_BATCH_ID} defect rate '
        f'{SUPPLIER_BATCH_DEFECT_PCT}%. Gross margin {gross_pct}% vs true net margin {true_net_pct}% '
        f'(projected {projected_net_pct}% after recoveries). Total protected this run: ${total_protected:.2f}.'
    )
    llm_json, mode, reason = _invoke('groq', prompt)
    fallback = (
        f'Reconciled {AUDIT_SHIPMENTS} courier AWBs: billed {BILLED_WEIGHT_KG}kg slab vs {ACTUAL_WEIGHT_KG}kg actual '
        f'= ${COURIER_OVERCHARGE:.2f} overcharged; supplier batch {SUPPLIER_BATCH_ID} at '
        f'{SUPPLIER_BATCH_DEFECT_PCT}% defects. True net margin {true_net_pct}% (gross {gross_pct}%) -> '
        f'{projected_net_pct}% after recoveries. ${total_protected:.2f} protected this sweep.'
    )

    approvals = [{
        'agent_name': AGENT_4,
        'action_type': 'COURIER_WEIGHT_DISPUTE',
        'title': f'1-Click Courier Weight Dispute & Supplier Debit Note (${COURIER_OVERCHARGE:.2f})',
        'description': (
            f'{AUDIT_SHIPMENTS} AWBs were billed at the {BILLED_WEIGHT_KG}kg slab although PROBASS-X1 ships at '
            f'{ACTUAL_WEIGHT_KG}kg. File a weight dispute for ${COURIER_OVERCHARGE:.2f} and attach a debit note to '
            f'supplier batch {SUPPLIER_BATCH_ID} ({SUPPLIER_BATCH_DEFECT_PCT}% defects).'
        ),
        'dollar_impact': COURIER_OVERCHARGE,
        'payload': {
            'shipments': AUDIT_SHIPMENTS,
            'billed_weight_kg': BILLED_WEIGHT_KG,
            'actual_weight_kg': ACTUAL_WEIGHT_KG,
            'supplier_batch_id': SUPPLIER_BATCH_ID,
            'batch_defect_rate_pct': SUPPLIER_BATCH_DEFECT_PCT,
        },
    }]

    return {
        'margin_audit_data': audit,
        'next_agent': 'END',
        'agent_logs': [_log(AGENT_4, GROQ_MODEL, _summary(llm_json, fallback), COURIER_OVERCHARGE, 'END', False,
                            mode, reason, total_protected=total_protected)],
        'pending_approvals': approvals,
    }
