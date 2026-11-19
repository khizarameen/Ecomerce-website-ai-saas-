"""
Vector Search
"""

import logging
from typing import List, Dict, Optional
import numpy as np
from .chroma import ChromaVectorStore
from ..llm.embeddings import EmbeddingGenerator

logger = logging.getLogger(__name__)

class VectorSearch:
    """
    Vector search engine for semantic product search
    """
    
    def __init__(
        self,
        vector_store: Optional[ChromaVectorStore] = None,
        embedding_generator: Optional[EmbeddingGenerator] = None
    ):
        self.vector_store = vector_store or ChromaVectorStore()
        self.embeddings = embedding_generator or EmbeddingGenerator()
    
    def search(
        self,
        query: str,
        limit: int = 10,
        filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search using text query
        """
        try:
            # Generate query embedding
            query_embedding = self.embeddings.encode(query)
            
            # Search in vector store
            results = self.vector_store.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=limit,
                where=filters
            )
            
            # Format results
            formatted_results = []
            for i in range(len(results.get('ids', [[]])[0])):
                formatted_results.append({
                    'id': results['ids'][0][i],
                    'distance': results['distances'][0][i],
                    'metadata': results['metadatas'][0][i] if results.get('metadatas') else {},
                    'document': results['documents'][0][i] if results.get('documents') else ''
                })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Vector search error: {e}")
            return []
    
    def search_by_embedding(
        self,
        embedding: np.ndarray,
        limit: int = 10,
        filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search using embedding vector directly
        """
        try:
            results = self.vector_store.query(
                query_embeddings=[embedding.tolist()],
                n_results=limit,
                where=filters
            )
            
            formatted_results = []
            for i in range(len(results.get('ids', [[]])[0])):
                formatted_results.append({
                    'id': results['ids'][0][i],
                    'distance': results['distances'][0][i],
                    'metadata': results['metadatas'][0][i] if results.get('metadatas') else {},
                    'document': results['documents'][0][i] if results.get('documents') else ''
                })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Embedding search error: {e}")
            return []
    
    def batch_search(self, queries: List[str], limit: int = 10) -> List[List[Dict]]:
        """
        Search multiple queries at once
        """
        try:
            # Generate embeddings for all queries
            embeddings = self.embeddings.encode_batch(queries)
            
            results = []
            for embedding in embeddings:
                result = self.search_by_embedding(embedding, limit)
                results.append(result)
            
            return results
            
        except Exception as e:
            logger.error(f"Batch search error: {e}")
            return []