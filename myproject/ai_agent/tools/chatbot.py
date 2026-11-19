"""
Chatbot Tool - Powered by Groq LLM
"""

import logging
from typing import Any, Dict, Optional

try:
    from ..llm.groq_client import GroqLLM
    LLM_AVAILABLE = True
except ImportError:
    GroqLLM = None  # type: ignore
    LLM_AVAILABLE = False
    logging.warning('GroqLLM not available')

try:
    from ..llm.prompts import PromptTemplates
    PROMPTS_AVAILABLE = True
except ImportError:
    PromptTemplates = None  # type: ignore
    PROMPTS_AVAILABLE = False
    logging.warning('PromptTemplates not available')

logger = logging.getLogger(__name__)


class ChatbotTool:
    """Chatbot tool for AI conversations."""

    def __init__(self, llm: Any = None):
        if llm is not None:
            self.llm = llm
        elif LLM_AVAILABLE:
            self.llm = GroqLLM()
        else:
            self.llm = None

        self.prompts = PromptTemplates() if PROMPTS_AVAILABLE else None
        logger.info(f"ChatbotTool initialized (LLM: {'available' if self.llm else 'unavailable'})")

    def respond(self, message: str, context: Optional[Dict] = None) -> Dict:
        """Generate chatbot response."""
        try:
            intent = self._detect_intent(message)
            if intent == 'product_search':
                response = self._handle_product_search(message, context)
            elif intent == 'recommendation':
                response = self._handle_recommendation(message, context)
            elif intent == 'help':
                response = self._handle_help(message, context)
            else:
                response = self._handle_general_chat(message, context)

            return {'response': response, 'intent': intent, 'success': True}
        except Exception as e:
            logger.error(f'Chatbot error: {e}')
            return {
                'response': "I'm sorry, I'm having trouble processing your request.",
                'intent': 'error',
                'success': False,
                'error': str(e),
            }

    def _detect_intent(self, message: str) -> str:
        msg = message.lower()
        search_keywords = ['search', 'find', 'looking for', 'show me', 'get me', 'list', 'browse']
        recommend_keywords = ['recommend', 'suggest', 'similar', 'alternative', 'what else']
        help_keywords = ['help', 'how to', 'what is', 'explain', 'guide']

        if any(word in msg for word in search_keywords):
            return 'product_search'
        if any(word in msg for word in recommend_keywords):
            return 'recommendation'
        if any(word in msg for word in help_keywords):
            return 'help'
        return 'general_chat'

    def _handle_product_search(self, message: str, context: Optional[Dict] = None) -> str:
        return f"I can help you search for products. What specific product are you looking for? You mentioned: '{message}'"

    def _handle_recommendation(self, message: str, context: Optional[Dict] = None) -> str:
        return 'I can recommend products based on your preferences. What type of products do you like?'

    def _handle_help(self, message: str, context: Optional[Dict] = None) -> str:
        return "I'm here to help! You can: \n1. Search for products\n2. Get recommendations\n3. Ask about prices\n4. Get order help"

    def _handle_general_chat(self, message: str, context: Optional[Dict] = None) -> str:
        if self.llm:
            try:
                return self.llm.generate(
                    message,
                    system_prompt='You are a helpful AI shopping assistant for an e-commerce store.',
                )
            except Exception as e:
                logger.error(f'LLM error: {e}')
        return f"Hello! How can I help you with '{message}'? I can search products, give recommendations, or answer questions."
