"""
Central service module for AI agent integration
Imports and exposes all AI agent functionality for use in views
"""

import logging
from typing import Dict, Any, List, Optional

from django.conf import settings
from django.contrib.auth.models import User

from ai_agent.agent import agent as ai_agent_instance
from ai_agent.llm.embeddings import EmbeddingGenerator
from ai_agent.llm.google_studio import GoogleStudioLLM
from ai_agent.llm.groq_client import GroqLLM
from ai_agent.llm.prompts import PromptTemplates
from ai_agent.memory.history import ConversationHistory
from ai_agent.services.chat_service import ChatService
from ai_agent.services.image_service import ImageService
from ai_agent.services.vector_service import VectorService
from ai_agent.tools.chatbot import ChatbotTool
from ai_agent.tools.image_search import ImageSearchTool
from ai_agent.tools.product_search import ProductSearchTool

logger = logging.getLogger(__name__)


# ============================================
# AI AGENT SERVICE INITIALIZATION
# ============================================

class AIService:
    """
    Central AI Service class that provides access to all AI agent functionality.
    Uses Groq for LLM Agent / Chat and Google AI Studio for Vision / Image Analysis.
    """

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self._initialize_services()
            AIService._initialized = True

    def _initialize_services(self):
        """Initialize all AI services."""
        try:
            self.llm = GroqLLM(
                api_key=getattr(settings, 'GROQ_API_KEY', None),
                model=getattr(settings, 'GROQ_MODEL', 'qwen/qwen3.8-27b'),
                base_url=getattr(settings, 'GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
                config=getattr(settings, 'LLM_CONFIG', {}),
            )

            self.vision_llm = GoogleStudioLLM(
                api_key=getattr(settings, 'GOOGLE_API_KEY', None),
                model=getattr(settings, 'GOOGLE_VISION_MODEL', 'gemini-3.5-flash-lite'),
                base_url=getattr(settings, 'GOOGLE_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
                config=getattr(settings, 'LLM_CONFIG', {}),
            )

            self.embeddings = EmbeddingGenerator()

            self.product_search = ProductSearchTool()
            self.image_search = ImageSearchTool()
            self.chatbot = ChatbotTool(llm=self.llm)

            self.history = ConversationHistory()
            self.chat_service = ChatService(
                llm=self.llm,
                product_tool=self.product_search,
                history=self.history,
            )
            self.image_service = ImageService(product_tool=self.product_search)
            self.vector_service = VectorService()
            self.agent = ai_agent_instance

            logger.info('AI Services initialized successfully (Groq LLM + Google AI Studio Vision)')

        except Exception as e:
            logger.error(f'Failed to initialize AI services: {e}')
            raise

    # ============================================
    # PRODUCT SEARCH METHODS
    # ============================================

    def search_products(self, query: str, limit: int = 10, **filters) -> List[Dict]:
        """Search products using AI-powered search."""
        return self.product_search.search(query, limit=limit, **filters)

    def search_products_by_image(self, image_file, limit: int = 10) -> List[Dict]:
        """Search products using image (Google AI Studio Vision -> product search)."""
        return self.image_search.search(image_file, limit=limit)

    def get_product_recommendations(self, product_id: int, limit: int = 5) -> List[Dict]:
        """Get AI-powered product recommendations."""
        return self.product_search.get_recommendations(product_id, limit=limit)

    # ============================================
    # CHAT METHODS (LangGraph + Groq Agent)
    # ============================================

    def chat(self, message: str, session_id: str = None, user: User = None, image=None) -> Dict:
        """Process chat message with LangGraph + Groq AI agent."""
        effective_message = (message or '').strip()
        image_analysis = None

        if image is not None:
            image_analysis = self.analyze_image(image)
            if image_analysis.get('success'):
                summary_parts = []
                if image_analysis.get('objects'):
                    summary_parts.append(f"Objects: {', '.join(image_analysis['objects'])}")
                if image_analysis.get('colors'):
                    summary_parts.append(f"Colors: {', '.join(image_analysis['colors'])}")
                if image_analysis.get('suggestions'):
                    summary_parts.append(f"Keywords: {', '.join(image_analysis['suggestions'])}")
                image_context = '; '.join(summary_parts)
                effective_message = (
                    f'{effective_message}\n[Uploaded image analysis: {image_context}]'
                    if effective_message
                    else f'Find products matching this uploaded image ({image_context})'
                )

        if session_id and effective_message:
            self.history.add(session_id, 'user', effective_message)

        try:
            user_id = user.id if user and getattr(user, 'is_authenticated', False) else None
            result = self.agent.process(
                message=effective_message,
                session_id=session_id or 'default',
                user_id=user_id,
            )
            if image_analysis:
                result['image_analysis'] = image_analysis
            if session_id and result.get('response'):
                self.history.add(session_id, 'assistant', result['response'])
            return result
        except Exception as agent_err:
            logger.error(f'LangGraph agent error, falling back to ChatService: {agent_err}')
            context: Dict[str, Any] = {}
            if user and getattr(user, 'is_authenticated', False):
                context['user_id'] = user.id
                context['username'] = user.username
            return self.chat_service.process(
                message=effective_message,
                context=context,
                session_id=session_id,
            )

    def get_chat_history(self, session_id: str) -> List[Dict]:
        """Get chat history for a session."""
        return self.history.get(session_id)

    # ============================================
    # VECTOR EMBEDDING METHODS
    # ============================================

    def index_product(self, product_id: int) -> bool:
        """Index a product for vector search."""
        return self.vector_service.index_product(product_id)

    def index_all_products(self) -> Dict:
        """Index all products."""
        return self.vector_service.index_all_products()

    # ============================================
    # VISION / IMAGE ANALYSIS METHODS
    # ============================================

    def analyze_image(self, image_file) -> Dict:
        """Analyze an image using Google AI Studio Vision."""
        from ai_agent.vision.image_analyzer import ImageAnalyzer
        return ImageAnalyzer().analyze(image_file)

    def get_status(self) -> Dict:
        """Get agent status."""
        return {
            'status': 'active',
            'framework': 'LangGraph + LangChain + Groq + Google AI Studio',
            'llm_provider': 'Groq',
            'llm_model': getattr(self.llm, 'model', 'qwen/qwen3.8-27b'),
            'vision_provider': 'Google AI Studio',
            'vision_model': getattr(self.vision_llm, 'model', 'gemini-3.5-flash-lite'),
            'embedding_model': getattr(self.embeddings, 'model_name', 'all-MiniLM-L6-v2'),
        }


# ============================================
# SINGLETON INSTANCE
# ============================================

ai_service = AIService()


# ============================================
# CONVENIENCE FUNCTIONS
# ============================================

def get_ai_service() -> AIService:
    return ai_service


def search_products(query: str, limit: int = 10, **filters) -> List[Dict]:
    return ai_service.search_products(query, limit, **filters)


def search_products_by_image(image_file, limit: int = 10) -> List[Dict]:
    return ai_service.search_products_by_image(image_file, limit)


def get_recommendations(product_id: int, limit: int = 5) -> List[Dict]:
    return ai_service.get_product_recommendations(product_id, limit)


def chat_with_ai(message: str, session_id: str = None, user: User = None, image=None) -> Dict:
    return ai_service.chat(message, session_id, user, image=image)


def analyze_product_image(image_file) -> Dict:
    return ai_service.analyze_image(image_file)


def index_products() -> Dict:
    return ai_service.index_all_products()


def get_ai_status() -> Dict:
    return ai_service.get_status()


def get_agent_status() -> Dict:
    return ai_service.get_status()


__all__ = [
    'AIService',
    'ai_service',
    'get_ai_service',
    'search_products',
    'search_products_by_image',
    'get_recommendations',
    'chat_with_ai',
    'analyze_product_image',
    'index_products',
    'get_ai_status',
    'get_agent_status',
]
