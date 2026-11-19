"""
Chat Service - Uses Groq LLM and Conversation History
"""

import logging
from typing import Dict, Optional

from ..llm.groq_client import GroqLLM
from ..memory.history import ConversationHistory
from ..tools.product_search import ProductSearchTool

logger = logging.getLogger(__name__)


class ChatService:
    """Service for handling AI chat conversations."""

    def __init__(
        self,
        llm: Optional[GroqLLM] = None,
        product_tool: Optional[ProductSearchTool] = None,
        history: Optional[ConversationHistory] = None,
    ):
        self.llm = llm or GroqLLM()
        self.product_tool = product_tool or ProductSearchTool()
        self.history = history or ConversationHistory()

    def process(
        self,
        message: str,
        context: Optional[Dict] = None,
        session_id: Optional[str] = None,
    ) -> Dict:
        """Process chat message."""
        try:
            if session_id:
                self.history.add(session_id, 'user', message)

            conversation_context = self._get_context(session_id, context)
            response = self._generate_response(message, conversation_context)

            if session_id:
                self.history.add(session_id, 'assistant', response)

            return {
                'success': True,
                'response': response,
                'message': response,
                'session_id': session_id,
                'context': conversation_context,
            }

        except Exception as e:
            logger.error(f'Chat process error: {e}')
            return {
                'success': False,
                'error': str(e),
                'response': "I'm sorry, I encountered an error processing your request.",
            }

    def _get_context(self, session_id: Optional[str], context: Optional[Dict]) -> Dict:
        ctx = {'session_id': session_id}
        if session_id:
            ctx['history'] = self.history.get(session_id)[-6:]
        if context:
            ctx.update(context)
        return ctx

    def _generate_response(self, message: str, context: Dict) -> str:
        system_prompt = (
            'You are a helpful AI shopping assistant for an e-commerce store. '
            'Your goal is to help users find products, answer questions, and provide recommendations.'
        )
        history_messages = context.get('history') or []
        return self.llm.generate(
            prompt=message,
            system_prompt=system_prompt,
            messages=history_messages[:-1] if history_messages else None,
        )
