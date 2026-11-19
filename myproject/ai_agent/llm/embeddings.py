# ai_agent/llm/embeddings.py
"""
Text Embedding Generation
"""

import numpy as np
import logging
from typing import List, Union

logger = logging.getLogger(__name__)

class EmbeddingGenerator:
    """Generate embeddings for text"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self.embedding_dim = 384
        self._load_model()
    
    def _load_model(self):
        """Load sentence transformer model"""
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(self.model_name)
            # ✅ FIX: Use new method name
            self.embedding_dim = self.model.get_embedding_dimension()
            logger.info(f"Embedding model loaded: {self.model_name} (dim: {self.embedding_dim})")
        except ImportError:
            logger.warning("sentence-transformers not installed. Using dummy embeddings.")
        except Exception as e:
            logger.error(f"Error loading embedding model: {e}")
    
    def encode(self, text: Union[str, List[str]]) -> np.ndarray:
        """Encode text to embeddings"""
        if self.model is None:
            return np.zeros(self.embedding_dim)
        try:
            if isinstance(text, str):
                return self.model.encode([text])[0]
            return self.model.encode(text)
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return np.zeros(self.embedding_dim)
    
    def encode_batch(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        """Encode multiple texts"""
        if self.model is None:
            return np.zeros((len(texts), self.embedding_dim))
        try:
            return self.model.encode(texts, batch_size=batch_size, show_progress_bar=False)
        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            return np.zeros((len(texts), self.embedding_dim))