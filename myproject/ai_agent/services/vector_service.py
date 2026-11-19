"""
Vector Service
"""

import logging
from typing import Dict, List, Optional
from store.models import Product
from ..vector.index import VectorIndex
from ..vector.search import VectorSearch
from ..llm.embeddings import EmbeddingGenerator

logger = logging.getLogger(__name__)

class VectorService:
    """
    Service for vector operations
    """
    
    def __init__(
        self,
        vector_index: Optional[VectorIndex] = None,
        vector_search: Optional[VectorSearch] = None
    ):
        self.vector_index = vector_index or VectorIndex()
        self.vector_search = vector_search or VectorSearch()
        self.embeddings = EmbeddingGenerator()
    
    def index_product(self, product_id: int) -> bool:
        """
        Index a product
        """
        try:
            product = Product.objects.get(id=product_id)
            return self.vector_index.index_product(product)
        except Product.DoesNotExist:
            logger.error(f"Product {product_id} not found")
            return False
        except Exception as e:
            logger.error(f"Index product error: {e}")
            return False
    
    def index_all_products(self) -> Dict:
        """
        Index all products
        """
        try:
            return self.vector_index.index_all_products()
        except Exception as e:
            logger.error(f"Index all error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def update_embedding(self, product_id: int) -> bool:
        """
        Update product embedding
        """
        try:
            return self.vector_index.update_product(product_id)
        except Exception as e:
            logger.error(f"Update embedding error: {e}")
            return False
    
    def get_recommendations(self, product_id: int, limit: int = 5) -> List[Dict]:
        """
        Get recommendations using vector search
        """
        try:
            product = Product.objects.get(id=product_id)
            
            # Create product text
            text = self.vector_index._create_product_text(product)
            
            # Generate embedding
            embedding = self.embeddings.encode(text)
            
            # Search similar products
            results = self.vector_search.search_by_embedding(
                embedding, 
                limit=limit + 1,  # +1 to exclude the product itself
                filters={'status': 'published'}
            )
            
            # Filter out the product itself
            filtered_results = [
                r for r in results 
                if r.get('metadata', {}).get('product_id') != str(product_id)
            ]
            
            # Format results
            recommendations = []
            for result in filtered_results[:limit]:
                product_id_from_metadata = result.get('metadata', {}).get('product_id')
                if product_id_from_metadata:
                    try:
                        recommended_product = Product.objects.get(id=product_id_from_metadata)
                        from store.serializers import ProductListSerializer
                        recommendations.append(
                            ProductListSerializer(recommended_product).data
                        )
                    except Product.DoesNotExist:
                        continue
            
            return recommendations
            
        except Product.DoesNotExist:
            logger.error(f"Product {product_id} not found")
            return []
        except Exception as e:
            logger.error(f"Get recommendations error: {e}")
            return []
    
    def get_indexed_count(self) -> int:
        """
        Get number of indexed products
        """
        return self.vector_index.get_indexed_count()