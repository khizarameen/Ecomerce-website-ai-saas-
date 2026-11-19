"""Silent LangGraph analytics workflow powering Seller Analytics smart search, graphs, and insights."""

import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from .agents import _invoke

_STOP_WORDS = {
    'show', 'me', 'find', 'search', 'for', 'product', 'products', 'item', 'items',
    'the', 'a', 'an', 'in', 'on', 'with', 'of', 'to', 'and', 'or', 'is', 'are',
    'sab', 'se', 'zyada', 'zada', 'kam', 'kis', 'par', 'hua', 'hue', 'kia', 'kiya',
    'ka', 'ki', 'ke', 'ko', 'mein', 'hai', 'hain', 'karo', 'dikhao', 'batao',
    'most', 'highest', 'top', 'best', 'worst', 'lowest', 'least', 'zero', 'no',
    'view', 'views', 'viewed', 'dekha', 'nahi', 'unviewed', 'like', 'likes', 'liked',
    'pasand', 'cancel', 'cancelled', 'canceled', 'cancellation', 'order', 'orders',
    'under', 'below', 'above', 'over', 'less', 'more', 'than', 'price', 'revenue',
    'stock', 'my', 'store', 'seller', 'all', 'yaar',
}


class AnalyticsPipelineState(TypedDict):
    search_query: str
    all_products: list[dict[str, Any]]
    order_status_bars: list[dict[str, Any]]
    parsed_intent: dict[str, Any]
    matched_products: list[dict[str, Any]]
    engagement_bars: list[dict[str, Any]]
    smart_summary: str
    action_tip: str


def parse_analytics_query_node(state: AnalyticsPipelineState) -> dict[str, Any]:
    """Extract structured filter/sort intent from Seller's natural-language or keyword search."""
    raw_q = (state.get('search_query') or '').strip()
    q_low = raw_q.lower()

    max_price = None
    min_price = None
    m_max = re.search(r'(?:under|below|less than|max|<=?)\s*\$?\s*(\d+(?:\.\d+)?)', q_low)
    if m_max:
        max_price = float(m_max.group(1))
    m_min = re.search(r'(?:above|over|more than|min|>=?)\s*\$?\s*(\d+(?:\.\d+)?)', q_low)
    if m_min:
        min_price = float(m_min.group(1))

    sort_metric = 'relevance'
    only_cancelled = False
    only_low_views = False

    if any(k in q_low for k in ('cancel', 'rto')):
        sort_metric = 'cancelled_count'
        if any(k in q_low for k in ('only', 'sirf', 'which', 'kis', 'most', 'zyada', 'zada', 'high')):
            only_cancelled = True
    elif any(k in q_low for k in ('nahi dekha', 'not viewed', 'unviewed', 'low view', 'kam view', 'zero view')):
        sort_metric = 'not_viewed_count'
        only_low_views = True
    elif any(k in q_low for k in ('dekha', 'view', 'views', 'viewed')):
        sort_metric = 'viewed_count'
    elif any(k in q_low for k in ('pasand', 'like', 'liked', 'wishlist', 'rating', 'review')):
        sort_metric = 'liked_count'
    elif any(k in q_low for k in ('revenue', 'earning', 'sale', 'sales', 'order')):
        sort_metric = 'orders_count'

    cleaned = re.sub(r'\$\s*[\d,]+(?:\.\d+)?', ' ', q_low)
    cleaned = re.sub(r'[^a-z0-9\s]', ' ', cleaned)
    keywords = [t for t in cleaned.split() if len(t) > 1 and t not in _STOP_WORDS and not t.isdigit()]

    return {
        'parsed_intent': {
            'raw_query': raw_q,
            'keywords': keywords,
            'sort_metric': sort_metric,
            'max_price': max_price,
            'min_price': min_price,
            'only_cancelled': only_cancelled,
            'only_low_views': only_low_views,
        }
    }


def filter_and_rank_products_node(state: AnalyticsPipelineState) -> dict[str, Any]:
    """Filter and rank strictly this Seller's products and build engagement graph bars."""
    products = list(state.get('all_products') or [])
    intent = state.get('parsed_intent') or {}
    keywords = intent.get('keywords') or []
    max_price = intent.get('max_price')
    min_price = intent.get('min_price')
    sort_metric = intent.get('sort_metric') or 'relevance'
    only_cancelled = bool(intent.get('only_cancelled'))
    only_low_views = bool(intent.get('only_low_views'))

    filtered = products
    if keywords:
        kw_matches = []
        for p in filtered:
            hay = f"{p.get('name', '')} {p.get('sku', '')} {p.get('category_name', '')}".lower()
            if all(k in hay for k in keywords):
                kw_matches.append(p)
        if not kw_matches:
            for p in filtered:
                hay = f"{p.get('name', '')} {p.get('sku', '')} {p.get('category_name', '')}".lower()
                if any(k in hay for k in keywords):
                    kw_matches.append(p)
        filtered = kw_matches

    if max_price is not None:
        filtered = [p for p in filtered if float(p.get('price') or 0) <= max_price]
    if min_price is not None:
        filtered = [p for p in filtered if float(p.get('price') or 0) >= min_price]

    if only_cancelled:
        with_cancels = [p for p in filtered if int(p.get('cancelled_count') or 0) > 0]
        if with_cancels:
            filtered = with_cancels

    if only_low_views:
        filtered = sorted(filtered, key=lambda p: (int(p.get('viewed_count') or 0), -int(p.get('not_viewed_count') or 0)))
    elif sort_metric != 'relevance':
        filtered = sorted(filtered, key=lambda p: float(p.get(sort_metric) or 0), reverse=True)

    agg_viewed = sum(int(p.get('viewed_count') or 0) for p in filtered)
    agg_not_viewed = sum(int(p.get('not_viewed_count') or 0) for p in filtered)
    agg_liked = sum(int(p.get('liked_count') or 0) for p in filtered)
    agg_ordered = sum(int(p.get('orders_count') or 0) for p in filtered)
    agg_cancelled = sum(int(p.get('cancelled_count') or 0) for p in filtered)

    engagement_bars = [
        {'key': 'viewed', 'label': '👁️ Viewed', 'value': agg_viewed},
        {'key': 'notViewed', 'label': '🙈 Not Viewed', 'value': agg_not_viewed},
        {'key': 'liked', 'label': '❤️ Liked / Reviews', 'value': agg_liked},
        {'key': 'ordered', 'label': '📦 Orders Placed', 'value': agg_ordered},
        {'key': 'cancelled', 'label': '❌ Cancelled', 'value': agg_cancelled},
    ]

    return {
        'matched_products': filtered,
        'engagement_bars': engagement_bars,
    }


def synthesize_insights_node(state: AnalyticsPipelineState) -> dict[str, Any]:
    """Produce plain-language store insights & recommendations without any internal jargon."""
    raw_q = (state.get('search_query') or '').strip()
    matched = state.get('matched_products') or []
    bars = state.get('engagement_bars') or []
    by_key = {b['key']: b['value'] for b in bars}

    if not matched:
        return {
            'smart_summary': (
                f'No products in your store matched "{raw_q}". Try searching by product name, SKU, '
                'or filters like "most cancelled", "most liked", or "low views".'
                if raw_q
                else 'Add products to your store to unlock live views, likes, order bars, and smart insights.'
            ),
            'action_tip': 'Publish products with clear titles and specs so buyers discover them easily.',
        }

    top = matched[0]
    viewed = by_key.get('viewed', 0)
    not_viewed = by_key.get('notViewed', 0)
    liked = by_key.get('liked', 0)
    ordered = by_key.get('ordered', 0)
    cancelled = by_key.get('cancelled', 0)

    if raw_q:
        prompt = (
            'You are a Store Analytics Advisor for an e-commerce seller. '
            'Respond ONLY in JSON {"smart_summary": string, "action_tip": string} in 1-2 short, clear sentences each. '
            'IMPORTANT: Never use the words "agent", "agents", "LangGraph", or "mesh".\n'
            f'Seller search: "{raw_q}"\n'
            f'Matched store products ({len(matched)}): top item "{top.get("name")}" '
            f'(price ${top.get("price")}, views {top.get("viewed_count")}, likes {top.get("liked_count")}, '
            f'orders {top.get("orders_count")}, cancelled {top.get("cancelled_count")}).\n'
            f'Totals for graph: Viewed={viewed}, NotViewed={not_viewed}, Liked={liked}, Orders={ordered}, Cancelled={cancelled}.'
        )
        llm_json, _mode, _reason = _invoke('groq', prompt)
        if isinstance(llm_json, dict):
            s = str(llm_json.get('smart_summary') or '').strip()
            t = str(llm_json.get('action_tip') or '').strip()
            if s and t and 'agent' not in s.lower() and 'agent' not in t.lower():
                return {'smart_summary': s, 'action_tip': t}

    if cancelled > 0:
        summary = (
            f'Across {len(matched)} matching product(s), buyers viewed {viewed} time(s), '
            f'liked {liked} time(s), placed {ordered} order(s), and cancelled {cancelled} order(s). '
            f'Top item: "{top.get("name")}" ({top.get("cancelled_count")} cancelled).'
        )
        tip = (
            f'Review delivery speed or offer a rescue discount on "{top.get("name")}" '
            'to convert cancelled units into confirmed sales.'
        )
    elif liked > 0 or viewed > 0:
        summary = (
            f'Across {len(matched)} store product(s): {viewed} buyer view(s), {not_viewed} untapped buyer(s), '
            f'{liked} like(s)/positive review(s), and {ordered} order(s).'
        )
        tip = (
            f'"{top.get("name")}" is getting traction ({top.get("viewed_count")} views, {top.get("liked_count")} likes). '
            'Keep stock ready and highlight top buyer reviews.'
        )
    else:
        summary = (
            f'Showing {len(matched)} product(s) from your store. '
            f'{not_viewed} registered buyer(s) have not viewed these items yet.'
        )
        tip = 'Share or feature these products with clear descriptions to attract your first buyer views and likes.'

    return {
        'smart_summary': summary,
        'action_tip': tip,
    }


def _build_analytics_graph():
    workflow = StateGraph(AnalyticsPipelineState)
    workflow.add_node('parse_query', parse_analytics_query_node)
    workflow.add_node('filter_and_rank', filter_and_rank_products_node)
    workflow.add_node('synthesize_insights', synthesize_insights_node)

    workflow.set_entry_point('parse_query')
    workflow.add_edge('parse_query', 'filter_and_rank')
    workflow.add_edge('filter_and_rank', 'synthesize_insights')
    workflow.add_edge('synthesize_insights', END)
    return workflow.compile()


_ANALYTICS_GRAPH = _build_analytics_graph()


def run_seller_analytics_assistant(
    search_query: str,
    all_products: list[dict[str, Any]],
    order_status_bars: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run the silent LangGraph analytics assistant over a single seller's products."""
    result = _ANALYTICS_GRAPH.invoke({
        'search_query': search_query or '',
        'all_products': all_products,
        'order_status_bars': order_status_bars,
        'parsed_intent': {},
        'matched_products': [],
        'engagement_bars': [],
        'smart_summary': '',
        'action_tip': '',
    })
    return {
        'matched_products': result.get('matched_products', []),
        'engagement_bars': result.get('engagement_bars', []),
        'smart_summary': result.get('smart_summary', ''),
        'action_tip': result.get('action_tip', ''),
    }
