"""
Dual LLM Factory for SupplyShield Universal AI Mesh
Supports Groq (ChatGroq) and Google AI Studio (ChatGoogleGenerativeAI) with JSON extraction & deterministic fallback.
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from django.conf import settings
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class UniversalIntent(BaseModel):
    """Structured intent and parameter extraction for any e-commerce or supply-chain query."""
    intent_type: str = Field(
        default='HYBRID',
        description='One of PRODUCT_SEARCH, IDEA_BRAINSTORM, BULK_SUPPLY_CHAIN, or HYBRID',
    )
    primary_item: str = Field(default='All Store Products')
    search_keywords: List[str] = Field(default_factory=list)
    category: str = Field(default='All')
    quantity: int = Field(default=1, ge=1)
    max_days: float = Field(default=3.0, gt=0)
    max_budget: Optional[float] = Field(default=None)
    is_urgent_procurement: bool = Field(default=False)


def _get_setting(name: str, default: Any = None) -> Any:
    val = os.getenv(name)
    if val:
        return val
    try:
        if settings.configured:
            return getattr(settings, name, default) or default
    except Exception:
        pass
    return default


def _extract_content_text(res: Any) -> str:
    """Safely extract plain text from LangChain AIMessage.content (str or list of content parts)."""
    raw = getattr(res, 'content', '')
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, list):
        parts = []
        for item in raw:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get('text'):
                parts.append(str(item['text']))
        return '\n'.join(parts).strip()
    return str(raw or '').strip()


def get_llm(provider: Optional[str] = None, temperature: float = 0.25):
    """
    Create a LangChain chat model instance for either 'groq' or 'google'.
    Uses max_retries=0 on Groq so 429 rate limits fail over to Google AI Studio immediately.
    """
    selected = (provider or _get_setting('LLM_PROVIDER', 'groq')).strip().lower()

    if selected == 'google':
        google_key = _get_setting('GOOGLE_API_KEY')
        google_model = _get_setting('GOOGLE_MODEL', 'gemini-3.5-flash-lite')
        if google_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                return ChatGoogleGenerativeAI(
                    model=google_model,
                    google_api_key=google_key,
                    temperature=temperature,
                    max_retries=1,
                )
            except Exception as err:
                logger.warning(f'ChatGoogleGenerativeAI init failed: {err}')

    groq_key = _get_setting('GROQ_API_KEY')
    groq_model = _get_setting('GROQ_MODEL', 'openai/gpt-oss-120b')
    groq_base = str(_get_setting('GROQ_BASE_URL', 'https://api.groq.com')).replace('/openai/v1', '').rstrip('/')
    if groq_key:
        try:
            from langchain_groq import ChatGroq
            return ChatGroq(
                model=groq_model,
                api_key=groq_key,
                base_url=groq_base or 'https://api.groq.com',
                temperature=temperature,
                max_tokens=1400,
                max_retries=0,
                timeout=15,
            )
        except Exception as err:
            logger.warning(f'ChatGroq init failed: {err}')

    if selected != 'google':
        google_key = _get_setting('GOOGLE_API_KEY')
        google_model = _get_setting('GOOGLE_MODEL', 'gemini-3.5-flash-lite')
        if google_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                return ChatGoogleGenerativeAI(
                    model=google_model,
                    google_api_key=google_key,
                    temperature=temperature,
                    max_retries=1,
                )
            except Exception as err:
                logger.warning(f'Google fallback ChatGoogleGenerativeAI init failed: {err}')

    return None


def invoke_mesh_llm(system_prompt: str, user_prompt: str, fallback_text: str, temperature: float = 0.3) -> str:
    """Invoke active LLM provider (Groq -> Google fallback -> deterministic fallback_text)."""
    primary_provider = (_get_setting('LLM_PROVIDER', 'groq')).strip().lower()
    alternate_provider = 'google' if primary_provider == 'groq' else 'groq'

    for provider in (primary_provider, alternate_provider):
        llm = get_llm(provider=provider, temperature=temperature)
        if llm is None:
            continue
        try:
            res = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ])
            content = _extract_content_text(res)
            if content:
                return content
        except Exception as err:
            logger.warning(f'Mesh LLM ({provider}) call failed, trying fallback: {err}')

    return fallback_text


def invoke_mesh_json(system_prompt: str, user_prompt: str, fallback_data: Any) -> Any:
    """Invoke LLM expecting JSON output, parsing cleanly with deterministic fallback_data."""
    raw = invoke_mesh_llm(
        system_prompt + '\nReturn ONLY valid JSON with no markdown code fences or extra text.',
        user_prompt,
        fallback_text='',
        temperature=0.2,
    )
    if not raw:
        return fallback_data

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'(\{.*\}|\[.*\])', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
    logger.warning(f'Failed to parse JSON from mesh LLM; using fallback. Raw: {raw[:160]}')
    return fallback_data


def extract_universal_intent(prompt: str) -> UniversalIntent:
    """
    Classify ANY English, Urdu, or Roman Urdu prompt into intent_type, keywords, category,
    quantity, deadline days, and budget cap using LLM with regex safety fallback.
    """
    text = (prompt or '').strip()
    if not text:
        return UniversalIntent()

    text_lower = text.lower()

    # Regex fallbacks for numeric parameters (handles Roman Urdu like '4 din', 'budget $75,000', '$1200 mein')
    days_match = re.search(r'(?:within|in|under|<=?|me|mein)?\s*(\d+(?:\.\d+)?)\s*(?:days?|din|d\b)', text_lower)
    fallback_days = float(days_match.group(1)) if days_match else 3.0

    budget_match = re.search(
        r'(?:budget(?:\s+is|\s+hai)?|max(?:imum)?(?:\s+budget)?(?:\s+is)?|under|below|mein)\s*\$?\s*([\d,]+(?:\.\d+)?)',
        text_lower,
    )
    if budget_match:
        fallback_budget = float(budget_match.group(1).replace(',', ''))
    else:
        dollar_match = re.search(r'\$\s*([\d,]+(?:\.\d+)?)', text_lower)
        fallback_budget = float(dollar_match.group(1).replace(',', '')) if dollar_match else None

    qty_matches = re.findall(r'\b(\d{1,5})\s+(?!(?:days?|din|dollars?|\$))([a-zA-Z]{3,})', text_lower)
    fallback_qty = sum(int(m[0]) for m in qty_matches) if qty_matches else 1

    idea_cues = ('idea', 'setup', 'bundle', 'suggest', 'recommend', 'chahiye idea', 'best products for', 'ka idea')
    bulk_cues = ('urgent', 'deliver', 'procure', 'supply', 'din mein', 'within', 'days', 'bulk', 'b2b')
    search_cues = ('find', 'search', 'compare', 'in stock', 'under $', 'best ', 'show me', 'sab product')

    if any(c in text_lower for c in bulk_cues) and (fallback_qty > 1 or 'urgent' in text_lower or days_match):
        fb_intent = 'BULK_SUPPLY_CHAIN'
    elif any(c in text_lower for c in idea_cues):
        fb_intent = 'IDEA_BRAINSTORM'
    elif any(c in text_lower for c in search_cues):
        fb_intent = 'PRODUCT_SEARCH'
    else:
        fb_intent = 'HYBRID'

    fallback_obj = {
        'intent_type': fb_intent,
        'primary_item': text[:80],
        'search_keywords': [w for w in re.findall(r'[a-zA-Z0-9]{3,}', text_lower) if w not in {
            'mujhe', 'mein', 'aur', 'liye', 'best', 'products', 'idea', 'find', 'the', 'and',
            'for', 'with', 'under', 'within', 'days', 'din', 'chahiye', 'budget', 'hai', 'max', 'urgent', 'deliver',
        }][:6],
        'category': 'All',
        'quantity': max(fallback_qty, 1),
        'max_days': max(fallback_days, 0.5),
        'max_budget': fallback_budget,
        'is_urgent_procurement': fb_intent == 'BULK_SUPPLY_CHAIN',
    }

    system_prompt = (
        'You are a multilingual (English, Urdu, Roman Urdu) AI Procurement & Shopping Intent Parser.\n'
        'Extract JSON with exact keys:\n'
        '{\n'
        '  "intent_type": "PRODUCT_SEARCH" | "IDEA_BRAINSTORM" | "BULK_SUPPLY_CHAIN" | "HYBRID",\n'
        '  "primary_item": "concise English summary of requested item(s) or setup (e.g. Podcast & Video Editing Studio, Laptops & Headphones, 200 Ergonomic Office Chairs & 50 MacBooks)",\n'
        '  "search_keywords": ["keyword1", "keyword2", ...],\n'
        '  "category": "Electronics" | "Studio Gear" | "Office & Furniture" | "Solar & Energy" | "Fashion" | "All",\n'
        '  "quantity": integer >= 1 (total units if specified, else 1),\n'
        '  "max_days": number of delivery days if mentioned else 3.0,\n'
        '  "max_budget": numeric USD budget if mentioned else null,\n'
        '  "is_urgent_procurement": boolean\n'
        '}'
    )
    parsed = invoke_mesh_json(system_prompt, f'Prompt: {text}', fallback_obj)

    try:
        intent_val = str(parsed.get('intent_type') or fb_intent).upper()
        if intent_val not in {'PRODUCT_SEARCH', 'IDEA_BRAINSTORM', 'BULK_SUPPLY_CHAIN', 'HYBRID'}:
            intent_val = fb_intent
        return UniversalIntent(
            intent_type=intent_val,
            primary_item=str(parsed.get('primary_item') or fallback_obj['primary_item']).strip(),
            search_keywords=[str(k).strip() for k in (parsed.get('search_keywords') or fallback_obj['search_keywords']) if k],
            category=str(parsed.get('category') or 'All').strip(),
            quantity=max(int(parsed.get('quantity') or fallback_qty or 1), 1),
            max_days=max(float(parsed.get('max_days') or fallback_days or 3.0), 0.5),
            max_budget=float(parsed['max_budget']) if parsed.get('max_budget') not in (None, '', 'null') else fallback_budget,
            is_urgent_procurement=bool(parsed.get('is_urgent_procurement', fb_intent == 'BULK_SUPPLY_CHAIN')),
        )
    except Exception:
        return UniversalIntent(**fallback_obj)
