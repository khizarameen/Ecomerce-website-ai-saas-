"""
4-Agent LangGraph & LangChain Store Concierge - Searches across ALL products in StoreHub
Agents:
  1. catalog_search_agent  -> Searches all products, categories & sellers in PostgreSQL (+ Vector fallback)
  2. stock_risk_agent      -> Evaluates stock, status & seller availability across all matched products
  3. price_advisor_agent   -> Compares prices, discounts, ratings & budget fit across matched products
  4. concierge_agent       -> Synthesizes helpful multi-turn LangChain response via Groq / Google AI Studio
"""

import logging
import operator
import re
from typing import Annotated, Any, Dict, List, Optional
from typing_extensions import TypedDict

from django.conf import settings
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from ai_agent.tools.product_search import ProductSearchTool

logger = logging.getLogger(__name__)


# ============================================
# GROQ & GOOGLE AI STUDIO LANGCHAIN LLM SETUP
# ============================================

def get_llm():
    """Get LangChain LLM instance configured for Groq (with Google AI Studio fallback)."""
    groq_key = getattr(settings, 'GROQ_API_KEY', None)
    groq_url = getattr(settings, 'GROQ_BASE_URL', 'https://api.groq.com/openai/v1')
    groq_model = getattr(settings, 'GROQ_MODEL', getattr(settings, 'DEFAULT_LLM_MODEL', 'openai/gpt-oss-120b'))

    if groq_key:
        return ChatOpenAI(
            base_url=groq_url,
            api_key=groq_key,
            model=groq_model,
            temperature=settings.LLM_CONFIG.get('temperature', 0.7),
            max_tokens=settings.LLM_CONFIG.get('max_tokens', 1000),
            max_retries=0,
            timeout=15,
        )

    google_key = getattr(settings, 'GOOGLE_API_KEY', None)
    if google_key:
        google_base = getattr(settings, 'GOOGLE_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta').rstrip('/')
        google_model = getattr(settings, 'GOOGLE_MODEL', 'gemini-3.5-flash-lite')
        return ChatOpenAI(
            base_url=f'{google_base}/openai/',
            api_key=google_key,
            model=google_model,
            temperature=settings.LLM_CONFIG.get('temperature', 0.7),
            max_tokens=settings.LLM_CONFIG.get('max_tokens', 1000),
            max_retries=1,
            timeout=20,
        )

    raise ValueError('Neither GROQ_API_KEY nor GOOGLE_API_KEY is configured.')


# ============================================
# STATE DEFINITION
# ============================================

class AgentState(TypedDict):
    """Shared state passed across the 4 StoreHub LangGraph agents."""
    messages: Annotated[List[Dict[str, str]], operator.add]
    current_intent: str
    query: str
    search_query: str
    filters: Dict[str, Any]
    products: List[Dict]
    recommendations: List[Dict]
    supply_chain_hub_deals: List[Dict]
    stock_notes: List[str]
    price_summary: str
    agent_trace: List[str]
    response: str
    session_id: Optional[str]
    user_id: Optional[int]
    error: Optional[str]


# ============================================
# 4-AGENT LANGGRAPH NODES
# ============================================

class AgentNodes:
    """4 collaborative LangGraph + LangChain agents operating over the full product catalog."""

    def __init__(self):
        self.product_tool = ProductSearchTool()
        self.llm = get_llm()

    def _invoke_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Invoke Groq via LangChain with Google AI Studio fallback."""
        lc_messages = [SystemMessage(content=system_prompt)]
        if history:
            for msg in history[-8:]:
                role = msg.get('role')
                content = msg.get('content')
                if not content:
                    continue
                if role == 'assistant':
                    lc_messages.append(AIMessage(content=content))
                elif role == 'user':
                    lc_messages.append(HumanMessage(content=content))
        lc_messages.append(HumanMessage(content=user_prompt))

        try:
            res = self.llm.invoke(lc_messages)
            content = (getattr(res, 'content', '') or '').strip()
            if content:
                return content
        except Exception as e:
            logger.warning(f'Groq LangChain invoke error ({e}); falling back to GoogleStudioLLM')

        try:
            from ai_agent.llm.google_studio import GoogleStudioLLM
            google_llm = GoogleStudioLLM()
            if google_llm.api_key:
                return google_llm.generate(user_prompt, system_prompt=system_prompt, messages=history)
        except Exception as fallback_err:
            logger.error(f'Google fallback invoke error: {fallback_err}')

        return "I'm sorry, I'm having trouble connecting to the AI service right now."

    # ---- AGENT 1: Catalog Search Agent ----
    def catalog_search_agent(self, state: AgentState) -> Dict[str, Any]:
        """Agent 1: Detect intent and search across ALL products, categories, and sellers."""
        message = state['messages'][-1]['content'] if state['messages'] else state.get('query', '')
        msg_lower = message.lower().strip()

        filters: Dict[str, Any] = {}
        max_match = re.search(r'(?:under|below|less than|max|<=?)\s*\$?\s*(\d+(?:\.\d+)?)', msg_lower)
        if max_match:
            filters['max_price'] = float(max_match.group(1))
        min_match = re.search(r'(?:above|over|more than|min|>=?)\s*\$?\s*(\d+(?:\.\d+)?)', msg_lower)
        if min_match:
            filters['min_price'] = float(min_match.group(1))

        followup_cues = [
            'did i', 'i just', 'earlier', 'previous', 'remember', 'we talked',
            'last message', 'you said', 'tell me more', 'explain more',
        ]
        recommend_cues = ['recommend', 'suggest', 'similar', 'alternative', 'what else']
        help_cues = ['what can you do', 'how does this work', 'guide me', 'support']

        product_id_match = re.search(r'(?:product|item|#)\s*(\d+)', msg_lower)
        product_id = int(product_id_match.group(1)) if product_id_match else None

        is_followup = any(cue in msg_lower for cue in followup_cues)
        if is_followup:
            intent = 'general_chat'
        elif any(cue in msg_lower for cue in recommend_cues):
            intent = 'recommendation'
        elif any(re.search(rf'\b{re.escape(cue)}\b', msg_lower) for cue in help_cues):
            intent = 'help'
        else:
            intent = 'product_search'

        # Always search across the entire product catalog (except pure conversation follow-ups)
        products: List[Dict] = []
        recommendations: List[Dict] = []

        if intent == 'recommendation' and product_id:
            recommendations = self.product_tool.get_recommendations(product_id, limit=8)
            products = recommendations
        elif not is_followup:
            products = self.product_tool.search(message, limit=25, **filters)
            # Only fall back to full catalog when query was generic (not a specific unmatched product name)
            tokens = self.product_tool._extract_tokens(message)
            is_generic = not tokens or any(
                w in msg_lower for w in ['all', 'everything', 'catalog', 'popular', 'trending', 'recommend', 'suggest']
            )
            if not products and is_generic:
                products = self.product_tool.get_all_products(limit=25)
                if intent == 'product_search' and not any(
                    w in msg_lower for w in ['search', 'find', 'show', 'buy', 'under', 'price', 'all', 'product']
                ):
                    intent = 'general_chat'
            if intent == 'recommendation':
                recommendations = products[:5]

        hub_deals: List[Dict] = []
        try:
            from seller_mesh.recovery_service import search_supply_chain_hub_cancelled_deals
            hub_deals = search_supply_chain_hub_cancelled_deals(message)
        except Exception as hub_err:
            logger.warning(f'Supply Chain Hub cancelled-deal check failed: {hub_err}')

        # Ensure Seller Original Store Products (including original items from cancelled deals) always appear
        if hub_deals:
            hub_orig_ids = [
                int(d.get('original_product_id') or d.get('product_id'))
                for d in hub_deals
                if (d.get('original_product_id') or d.get('product_id'))
            ]
            if hub_orig_ids:
                existing_ids = {p.get('id') for p in products}
                missing_ids = [pid for pid in dict.fromkeys(hub_orig_ids) if pid not in existing_ids]
                if missing_ids:
                    from store.models import Product as StoreProduct
                    orig_qs = (
                        StoreProduct.objects.select_related('category', 'subcategory', 'seller')
                        .filter(id__in=missing_ids)
                        .exclude(status='discontinued')
                    )
                    orig_serialized = self.product_tool._serialize_products(orig_qs)
                    products = orig_serialized + products

        if not products:
            products = self.product_tool.get_all_products(limit=12)

        trace = [
            f'Agent 1 (Catalog Search): scanned catalog -> {len(products)} matching original store product(s)',
            f'Supply Chain Hub Check: found {len(hub_deals)} separate cancelled-order discount deal(s)',
        ]
        return {
            'current_intent': intent,
            'query': message,
            'search_query': message,
            'filters': filters,
            'products': products,
            'recommendations': recommendations,
            'supply_chain_hub_deals': hub_deals,
            'agent_trace': trace,
        }

    # ---- AGENT 2: Stock & Seller Risk Evaluator Agent ----
    def stock_risk_agent(self, state: AgentState) -> Dict[str, Any]:
        """Agent 2: Check stock levels, status, and seller details across all matched products."""
        products = state.get('products') or []
        stock_notes: List[str] = []
        in_stock_count = 0

        for p in products[:15]:
            qty = int(p.get('stock_quantity') or 0)
            status = p.get('status') or 'published'
            seller = p.get('seller_name') or 'StoreHub Verified Seller'
            if qty > 0 and status == 'published':
                in_stock_count += 1
                stock_notes.append(f"{p.get('name')} ({seller}): Ready ({qty} in stock)")
            elif qty > 0:
                stock_notes.append(f"{p.get('name')} ({seller}): {qty} units listed [status: {status}]")
            else:
                stock_notes.append(f"{p.get('name')} ({seller}): Out of stock [status: {status}]")

        trace = list(state.get('agent_trace') or []) + [
            f'Agent 2 (Stock & Seller Check): evaluated {len(products)} product(s), {in_stock_count} published & ready'
        ]
        return {
            'stock_notes': stock_notes,
            'agent_trace': trace,
        }

    # ---- AGENT 3: Price & Deal Advisor Agent ----
    def price_advisor_agent(self, state: AgentState) -> Dict[str, Any]:
        """Agent 3: Compare prices, budget fit, categories, and discounts across matched products."""
        products = state.get('products') or []
        filters = state.get('filters') or {}
        max_price = filters.get('max_price')
        min_price = filters.get('min_price')

        if not products:
            price_summary = 'No products currently in database catalog.'
        else:
            prices = [float(p.get('price') or 0) for p in products]
            categories = sorted({p.get('category_name') or 'Uncategorized' for p in products})
            within_budget = [
                p for p in products
                if (max_price is None or float(p.get('price') or 0) <= max_price)
                and (min_price is None or float(p.get('price') or 0) >= min_price)
            ]
            price_summary = (
                f'Catalog range: ${min(prices):,.2f} - ${max(prices):,.2f} across categories {categories}. '
                f'{len(within_budget)} of {len(products)} product(s) match budget constraints.'
            )

        trace = list(state.get('agent_trace') or []) + [f'Agent 3 (Price Advisor): {price_summary}']
        return {
            'price_summary': price_summary,
            'agent_trace': trace,
        }

    # ---- AGENT 4: Shopping Concierge Agent ----
    def concierge_agent(self, state: AgentState) -> Dict[str, Any]:
        """Agent 4: Generate final helpful response via LangChain + Groq/Google across all products."""
        intent = state.get('current_intent', 'general_chat')
        query = state.get('query', '')
        products = state.get('products') or []
        stock_notes = state.get('stock_notes') or []
        price_summary = state.get('price_summary') or ''
        history = state.get('messages', [])[:-1]

        if intent == 'help':
            response = (
                'I am powered by a **4-Agent LangGraph + LangChain** pipeline searching all products in StoreHub:\n\n'
                '1. **Catalog Search Agent** - Searches every category, seller, and product\n'
                '2. **Stock & Seller Agent** - Verifies real inventory and seller availability\n'
                '3. **Price Advisor Agent** - Compares prices, discounts, and budget fit\n'
                '4. **Shopping Concierge Agent** - Guides you to the best match!\n\n'
                'Try asking: *"Show me all products"*, *"Best electronics under $500"*, or *"Recommend a phone"*.'
            )
        else:
            if products:
                product_lines = []
                for p in products[:10]:
                    highlights = p.get('review_highlights') or []
                    rev_text = (
                        f" | Latest Buyer Review ({highlights[0].get('rating')}★): \"{highlights[0].get('title')}\""
                        if highlights
                        else ''
                    )
                    product_lines.append(
                        f"- **{p.get('name')}** | ${p.get('price')} | Rating: {p.get('average_rating', 0)}★ "
                        f"({p.get('total_reviews', 0)} reviews) | Stock: {p.get('stock_quantity', 'N/A')} "
                        f"| Seller: {p.get('seller_name') or 'N/A'}{rev_text}"
                    )
                catalog_context = (
                    f'Store catalog matches ({len(products)} total):\n' + '\n'.join(product_lines) +
                    f'\n\nStock Assessment:\n' + '\n'.join(stock_notes[:8]) +
                    f'\n\nPricing Summary: {price_summary}'
                )
            else:
                catalog_context = 'Store catalog currently has 0 products matching.'

            system_prompt = (
                'You are the StoreHub Shopping Concierge backed by 4 collaborative AI agents (Catalog Search, Stock/Risk, Price Advisor, Concierge). '
                'Help the user across ALL matching Seller Original Store Products listed in context, citing real prices, seller store names, stock, and buyer review ratings. '
                'Always be truthful about real prices, categories, sellers, and stock/status (never invent products not in context). '
                'Use conversation history for follow-up questions. Be clear, helpful, and concise.'
            )
            user_prompt = (
                f'User message: "{query}"\n\n'
                f'{catalog_context}\n\n'
                'Provide a helpful response recommending or explaining the available Seller Original Store Products.'
            )
            response = self._invoke_llm(system_prompt, user_prompt, history=history)
            if response.startswith("I'm sorry, I'm having trouble connecting"):
                if products:
                    summary_bullets = '\n'.join(
                        f"- **{p.get('name')}** (Seller: {p.get('seller_name') or 'Verified Seller'}) — "
                        f"${p.get('price')} ({p.get('average_rating', 0)}★ / {p.get('total_reviews', 0)} reviews, "
                        f"{p.get('stock_quantity', 0)} in stock)"
                        for p in products[:5]
                    )
                    response = (
                        f'🏪 **[Seller Original Store Products — Fresh Seller Catalog]**\n'
                        f'Here are the live original products directly from our Sellers for "{query}":\n\n'
                        f'{summary_bullets}'
                    )
                else:
                    response = (
                        f'No exact store products matched "{query}". Try searching by category or browsing '
                        'the catalog / Cancelled Order Deals.'
                    )

        trace = list(state.get('agent_trace') or []) + ['Agent 4 (Concierge): synthesized final answer']
        hub_deals = state.get('supply_chain_hub_deals') or []
        if products and 'Seller Original Store Products' not in response:
            orig_lines = '\n'.join(
                f"- **{p.get('name')}** | Seller: {p.get('seller_name') or 'Verified Seller'} | "
                f"Original Price: **${p.get('price')}** | Stock: {p.get('stock_quantity', 0)}"
                for p in products[:4]
            )
            response = (
                f'🏪 **[Seller Original Store Products — Fresh Seller Catalog]**\n'
                f'{orig_lines}\n\n{response}'
            )
        if hub_deals:
            try:
                from seller_mesh.recovery_service import format_supply_chain_hub_callout
                callout = format_supply_chain_hub_callout(hub_deals, query)
                if callout:
                    response = f'{response}{callout}'
            except Exception as callout_err:
                logger.warning(f'Could not append Supply Chain Hub callout: {callout_err}')

        return {
            'response': response,
            'agent_trace': trace,
            'messages': [{'role': 'assistant', 'content': response}] if response else [],
        }


# ============================================
# BUILD 4-AGENT LANGGRAPH WORKFLOW
# ============================================

def build_agent_graph():
    """Build and compile the 4-Agent LangGraph workflow."""
    nodes = AgentNodes()
    workflow = StateGraph(AgentState)

    workflow.add_node('catalog_search_agent', nodes.catalog_search_agent)
    workflow.add_node('stock_risk_agent', nodes.stock_risk_agent)
    workflow.add_node('price_advisor_agent', nodes.price_advisor_agent)
    workflow.add_node('concierge_agent', nodes.concierge_agent)

    workflow.set_entry_point('catalog_search_agent')
    workflow.add_edge('catalog_search_agent', 'stock_risk_agent')
    workflow.add_edge('stock_risk_agent', 'price_advisor_agent')
    workflow.add_edge('price_advisor_agent', 'concierge_agent')
    workflow.add_edge('concierge_agent', END)

    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)


# ============================================
# MAIN AGENT CLASS
# ============================================

class Agent:
    """Main AI Agent using 4-Agent LangGraph + LangChain + Groq (LLM) & Google AI Studio (Vision)."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.graph = build_agent_graph()
            self.product_tool = ProductSearchTool()
            self.initialized = True
            logger.info(
                f'4-Agent LangGraph + LangChain Agent Initialized (LLM: {getattr(settings, "GROQ_MODEL", "qwen/qwen3.8-27b")})'
            )

    def process(self, message: str, session_id: str = None, user_id: int = None) -> Dict:
        """Process user message through the 4-Agent LangGraph pipeline."""
        state: AgentState = {
            'messages': [{'role': 'user', 'content': message}],
            'current_intent': '',
            'query': message,
            'search_query': '',
            'filters': {},
            'products': [],
            'recommendations': [],
            'supply_chain_hub_deals': [],
            'stock_notes': [],
            'price_summary': '',
            'agent_trace': [],
            'response': '',
            'session_id': session_id,
            'user_id': user_id,
            'error': None,
        }

        config = {'configurable': {'thread_id': session_id or 'default'}}
        result = self.graph.invoke(state, config)

        return {
            'success': True,
            'response': result.get('response', ''),
            'message': result.get('response', ''),
            'intent': result.get('current_intent', ''),
            'products': result.get('products', []),
            'recommendations': result.get('recommendations', []),
            'supply_chain_hub_deals': result.get('supply_chain_hub_deals', []),
            'agent_trace': result.get('agent_trace', []),
            'session_id': session_id,
        }

    def search_products(self, query: str, limit: int = 20, **filters) -> List[Dict]:
        return self.product_tool.search(query, limit, **filters)

    def get_recommendations(self, product_id: int, limit: int = 5) -> List[Dict]:
        return self.product_tool.get_recommendations(product_id, limit)

    def search_by_image(self, image_file, limit: int = 10) -> List[Dict]:
        from ai_agent.tools.image_search import ImageSearchTool
        return ImageSearchTool().search(image_file, limit=limit)

    def chat(self, message: str, context: dict = None, session_id: str = None) -> Dict:
        user_id = (context or {}).get('user_id') if isinstance(context, dict) else None
        return self.process(message, session_id=session_id, user_id=user_id)

    def analyze_image(self, image_file) -> Dict:
        """Analyze image using Google AI Studio Vision model."""
        from ai_agent.vision.image_analyzer import ImageAnalyzer
        return ImageAnalyzer().analyze(image_file)

    def get_status(self) -> Dict:
        return {
            'status': 'active',
            'framework': '4-Agent LangGraph + LangChain + Groq + Google AI Studio',
            'agents': ['catalog_search_agent', 'stock_risk_agent', 'price_advisor_agent', 'concierge_agent'],
            'llm_provider': 'Groq',
            'model': getattr(settings, 'GROQ_MODEL', 'qwen/qwen3.8-27b'),
            'vision_provider': 'Google AI Studio',
            'vision_model': getattr(settings, 'GOOGLE_VISION_MODEL', 'gemini-3.5-flash-lite'),
            'vision_capable': True,
            'memory': 'MemorySaver',
        }


agent = Agent()
