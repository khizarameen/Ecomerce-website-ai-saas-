"""
Django Views for SupplyShield Universal AI Product Search, Idea Consultant & Agentic Mesh
- GET  /api/agents/             : Returns all 6 agent discovery manifests (+ live StoreHub DB stats)
- GET  /api/stream-order/?prompt=... : Real-time SSE stream of LangGraph execution (ai_ideas, matched_products, mesh_state)
- POST /api/agent-chat/         : Conversational LangChain tool-calling endpoint with follow-ups & cart action
"""

import json
import logging
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List

from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from rest_framework_simplejwt.authentication import JWTAuthentication

from ai_agent.tools.product_search import ProductSearchTool
from store.models import Category, Product, Seller
from store.services import CartService

from .graph.builder import supply_chain_graph
from .llm_factory import _extract_content_text, get_llm, invoke_mesh_llm
from .tools.product_tools import (
    MESH_TOOLS,
    generate_product_ideas_and_bundles,
    run_dynamic_supply_chain_mesh,
    search_store_catalog,
    search_store_catalog_fn,
)

logger = logging.getLogger(__name__)

MANIFESTS_DIR = Path(__file__).resolve().parent / 'agent_manifests'
MANIFEST_ORDER = ['supplier-node', 'risk-radar', 'cargo-mesh', 'haggle-bot', 'customs-shield', 'budget-guard']
_CHAT_SESSIONS: Dict[str, List[Dict[str, str]]] = defaultdict(list)

TOOL_REGISTRY = {
    'search_store_catalog': search_store_catalog,
    'generate_product_ideas_and_bundles': generate_product_ideas_and_bundles,
    'run_dynamic_supply_chain_mesh': run_dynamic_supply_chain_mesh,
}


@require_GET
def list_agents(request):
    """Return all 6 SupplyShield agent discovery manifests enriched with live StoreHub catalog metadata."""
    manifests = []
    live_products = ProductSearchTool().get_all_products(limit=20)
    live_categories = list(Category.objects.filter(is_active=True).values_list('name', flat=True))
    live_seller_count = Seller.objects.filter(is_active=True).count()

    for agent_dir in MANIFEST_ORDER:
        manifest_path = MANIFESTS_DIR / agent_dir / 'agent.json'
        if manifest_path.exists():
            with open(manifest_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if agent_dir == 'supplier-node':
                data['live_store_catalog'] = {
                    'total_products': Product.objects.exclude(status='discontinued').count(),
                    'categories': live_categories,
                    'active_sellers': live_seller_count,
                    'sample_products': [
                        {
                            'id': p.get('id'),
                            'name': p.get('name'),
                            'price': str(p.get('price')),
                            'category': p.get('category_name'),
                            'seller': p.get('seller_name'),
                            'stock_quantity': p.get('stock_quantity'),
                            'status': p.get('status'),
                        }
                        for p in live_products
                    ],
                }
            manifests.append(data)

    return JsonResponse({
        'success': True,
        'count': len(manifests),
        'agents': manifests,
    })


def _parse_flag(value: Any, default: bool) -> bool:
    if value is None:
        return default
    norm = str(value).strip().lower()
    if norm in ('1', 'true', 'yes', 'on'):
        return True
    if norm in ('0', 'false', 'no', 'off'):
        return False
    return default


def _build_mesh_state(merged: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'active_node': merged.get('active_node'),
        'status': merged.get('status'),
        'edge_status': merged.get('edge_status', {}),
        'excluded_suppliers': merged.get('excluded_suppliers', []),
        'supplier_candidates': merged.get('supplier_candidates', []),
        'selected_supplier': merged.get('selected_supplier'),
        'risk_report': merged.get('risk_report'),
        'logistics_plan': merged.get('logistics_plan'),
        'crisis_config': merged.get('crisis_config', {}),
        'haggle_report': merged.get('haggle_report'),
        'customs_report': merged.get('customs_report'),
        'total_cost': merged.get('total_cost'),
        'savings': merged.get('savings'),
        'escrow_approved': merged.get('escrow_approved'),
        'po_hash': merged.get('po_hash'),
        'purchase_order': merged.get('purchase_order'),
        'telemetry_logs': merged.get('telemetry_logs', []),
    }


@require_GET
def stream_order(request):
    """
    Real-Time SSE endpoint streaming Universal LangGraph execution for ANY product/idea/supply query.
    """
    prompt = request.GET.get(
        'prompt',
        'Find the best electronics & smart gear in stock under $900 and compare them.',
    ).strip()

    if not prompt:
        prompt = 'Find the best electronics & smart gear in stock under $900 and compare them.'

    crisis_config = {
        'typhoon_active': _parse_flag(request.GET.get('typhoon'), True),
        'strict_customs': _parse_flag(request.GET.get('strict_customs'), False),
        'force_haggle': _parse_flag(request.GET.get('force_haggle'), True),
    }

    initial_state = {
        'prompt': prompt,
        'intent_type': 'HYBRID',
        'item_name': '',
        'search_keywords': [],
        'category': 'All',
        'quantity': 1,
        'max_days': 3.0,
        'max_budget': 1500.0,
        'ai_ideas': {},
        'matched_products': [],
        'all_matching_products': [],
        'catalog_stats': {},
        'catalog_help_summary': '',
        'excluded_suppliers': [],
        'supplier_candidates': [],
        'selected_supplier': None,
        'freight_options': {},
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
        'edge_status': {},
        'telemetry_event': None,
        'telemetry_logs': [],
    }

    def event_stream():
        merged_state = dict(initial_state)
        step_index = 0
        hub_deals = []
        try:
            from seller_mesh.recovery_service import search_supply_chain_hub_cancelled_deals
            hub_deals = search_supply_chain_hub_cancelled_deals(prompt)
        except Exception as hub_err:
            logger.warning(f'SupplyShield SSE hub deals lookup failed: {hub_err}')

        try:
            for update in supply_chain_graph.stream(initial_state, stream_mode='updates'):
                for graph_node_name, node_payload in update.items():
                    step_index += 1
                    merged_state.update(node_payload)

                    mesh_state = _build_mesh_state(merged_state)
                    payload = {
                        'step': step_index,
                        'graph_node': graph_node_name,
                        'intent_type': merged_state.get('intent_type'),
                        'item_name': merged_state.get('item_name'),
                        'quantity': merged_state.get('quantity'),
                        'max_days': merged_state.get('max_days'),
                        'max_budget': merged_state.get('max_budget'),
                        'ai_ideas': merged_state.get('ai_ideas', {}),
                        'matched_products': merged_state.get('matched_products', []),
                        'all_matching_products': merged_state.get('all_matching_products', []),
                        'supply_chain_hub_deals': hub_deals,
                        'catalog_stats': merged_state.get('catalog_stats', {}),
                        'catalog_help_summary': merged_state.get('catalog_help_summary', ''),
                        'mesh_state': mesh_state,
                        # Top-level convenience mirrors for live graph subscribers
                        **mesh_state,
                        'telemetry_event': node_payload.get('telemetry_event'),
                    }
                    yield f'event: step\ndata: {json.dumps(payload)}\n\n'
                    time.sleep(1.2)

            final_mesh = _build_mesh_state(merged_state)
            final_payload = {
                'status': merged_state.get('status', 'approved'),
                'intent_type': merged_state.get('intent_type'),
                'item_name': merged_state.get('item_name'),
                'quantity': merged_state.get('quantity'),
                'max_days': merged_state.get('max_days'),
                'max_budget': merged_state.get('max_budget'),
                'ai_ideas': merged_state.get('ai_ideas', {}),
                'matched_products': merged_state.get('matched_products', []),
                'all_matching_products': merged_state.get('all_matching_products', []),
                'supply_chain_hub_deals': hub_deals,
                'catalog_stats': merged_state.get('catalog_stats', {}),
                'catalog_help_summary': merged_state.get('catalog_help_summary', ''),
                'mesh_state': final_mesh,
                **final_mesh,
            }
            yield f'event: complete\ndata: {json.dumps(final_payload)}\n\n'
        except Exception as err:
            logger.exception('Error streaming SupplyShield universal order')
            yield f'event: error\ndata: {json.dumps({"error": str(err)})}\n\n'

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


@csrf_exempt
@require_POST
def agent_chat(request):
    """
    Conversational LangChain Tool-Calling endpoint (/api/agent-chat/) for follow-up questions,
    product comparisons, cheaper alternatives, and direct E-commerce cart additions.
    """
    try:
        body = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON payload'}, status=400)

    message = (body.get('message') or '').strip()
    session_id = str(body.get('session_id') or 'default_mesh_chat')
    context_products = body.get('context_products') or []
    add_product_id = body.get('add_to_cart_product_id')
    quantity = max(int(body.get('quantity') or 1), 1)

    # Optional authenticated cart action
    cart_result = None
    if add_product_id:
        try:
            auth_res = JWTAuthentication().authenticate(request)
            user = auth_res[0] if auth_res else getattr(request, 'user', None)
            if user and getattr(user, 'is_authenticated', False):
                cart = CartService.get_or_create_cart(user=user)
                cart_result = CartService.add_item(cart, int(add_product_id), quantity)
            else:
                cart_result = {'success': False, 'error': 'Login required to add local DB product to StoreHub cart.'}
        except Exception as cart_err:
            cart_result = {'success': False, 'error': str(cart_err)}

    if not message and cart_result is not None:
        return JsonResponse({'success': True, 'cart_result': cart_result, 'response': 'Cart updated.'})

    if not message:
        return JsonResponse({'success': False, 'error': 'message is required'}, status=400)

    history = _CHAT_SESSIONS[session_id][-8:]
    tools_used: List[str] = []
    discovered_products: List[Dict[str, Any]] = list(context_products)

    system_prompt = (
        'You are the Universal StoreHub & SupplyShield AI Shopping & Supply Chain Consultant.\n'
        'Always respond clearly in concise, professional English.\n'
        'You have tools to search the Django store catalog + global market (search_store_catalog), '
        'generate bundle/setup ideas (generate_product_ideas_and_bundles), and run dynamic 6-node supply chain routing '
        '(run_dynamic_supply_chain_mesh). Use tools whenever the user asks about products, comparisons, cheaper alternatives, or procurement!\n'
        'Be concise, practical, and transparent about prices and Local Store DB vs Global AI Mesh availability.'
    )

    context_hint = ''
    if context_products:
        context_hint = '\nCurrent recommended products in session:\n' + '\n'.join(
            f"- {p.get('name')} (${p.get('price')}, {p.get('category')}, {p.get('source', 'Catalog')}, id={p.get('id')})"
            for p in context_products[:8]
        )

    lc_messages = [SystemMessage(content=system_prompt + context_hint)]
    for h in history:
        if h['role'] == 'user':
            lc_messages.append(HumanMessage(content=h['content']))
        else:
            lc_messages.append(AIMessage(content=h['content']))
    lc_messages.append(HumanMessage(content=message))

    reply_text = ''
    primary_provider = (getattr(settings, 'LLM_PROVIDER', 'groq') or 'groq').strip().lower()
    alternate_provider = 'google' if primary_provider == 'groq' else 'groq'

    for provider in (primary_provider, alternate_provider):
        llm = get_llm(provider=provider, temperature=0.3)
        if llm is None:
            continue
        try:
            run_messages = list(lc_messages)
            llm_with_tools = llm.bind_tools(MESH_TOOLS)
            ai_msg = llm_with_tools.invoke(run_messages)

            for _ in range(2):
                tool_calls = getattr(ai_msg, 'tool_calls', None) or []
                if not tool_calls:
                    break
                run_messages.append(ai_msg)
                for tc in tool_calls:
                    t_name = tc.get('name')
                    t_args = tc.get('args') or {}
                    t_id = tc.get('id') or t_name
                    tools_used.append(t_name)
                    fn = TOOL_REGISTRY.get(t_name)
                    try:
                        t_out = fn.invoke(t_args) if fn else {'error': f'Unknown tool {t_name}'}
                        if t_name == 'search_store_catalog' and isinstance(t_out, list):
                            discovered_products = t_out
                        elif t_name == 'generate_product_ideas_and_bundles' and isinstance(t_out, dict):
                            if t_out.get('recommended_items'):
                                discovered_products = t_out['recommended_items']
                    except Exception as t_err:
                        t_out = {'error': str(t_err)}

                    run_messages.append(ToolMessage(content=json.dumps(t_out, default=str)[:4000], tool_call_id=t_id))

                ai_msg = llm_with_tools.invoke(run_messages)

            reply_text = _extract_content_text(ai_msg)
            if reply_text:
                break
        except Exception as err:
            logger.warning(f'Tool-calling chat ({provider}) failed ({err}); trying next fallback')

    if not discovered_products:
        discovered_products = search_store_catalog_fn(query=message, limit=8)

    if not reply_text:
        items_text = '\n'.join(
            f"- {p.get('name')} (Seller: {p.get('seller_name', 'Verified Seller')}, ${p.get('price')}, "
            f"{p.get('category')}, {p.get('source')})"
            for p in discovered_products[:6]
        )
        fallback_reply = (
            f"🏪 **[Seller Original Store Products — Fresh Seller Catalog]**\n"
            f"Here are matching Seller Original Store products for '{message}':\n{items_text}"
            if discovered_products
            else 'Tell me your budget and product goal so I can search and route the best options for you.'
        )
        reply_text = invoke_mesh_llm(
            system_prompt,
            f'User question: "{message}"\nAvailable Seller Original Store Products:\n{items_text}',
            fallback_reply,
        )

    _CHAT_SESSIONS[session_id].append({'role': 'user', 'content': message})
    _CHAT_SESSIONS[session_id].append({'role': 'assistant', 'content': reply_text})

    hub_deals = []
    try:
        from seller_mesh.recovery_service import (
            format_supply_chain_hub_callout,
            search_supply_chain_hub_cancelled_deals,
        )
        hub_deals = search_supply_chain_hub_cancelled_deals(message)
        if discovered_products and 'Seller Original Store Products' not in reply_text:
            orig_lines = '\n'.join(
                f"- **{p.get('name')}** (Seller: {p.get('seller_name') or 'Verified Seller'}) — "
                f"Original Price: **${p.get('price')}** | Stock: {p.get('stock_quantity', 0)}"
                for p in discovered_products[:4]
            )
            reply_text = (
                f'🏪 **[Seller Original Store Products — Fresh Seller Catalog]**\n'
                f'{orig_lines}\n\n{reply_text}'
            )
        callout = format_supply_chain_hub_callout(hub_deals, message)
        if callout:
            reply_text = f'{reply_text}{callout}'
    except Exception as hub_err:
        logger.warning(f'SupplyShield chat hub deals lookup failed: {hub_err}')

    return JsonResponse({
        'success': True,
        'session_id': session_id,
        'response': reply_text,
        'tools_used': tools_used,
        'products': discovered_products[:8],
        'supply_chain_hub_deals': hub_deals,
        'cart_result': cart_result,
    })

