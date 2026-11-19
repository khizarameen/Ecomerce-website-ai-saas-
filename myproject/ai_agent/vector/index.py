"""
Vector Index for Product Embeddings
"""

import logging
import uuid
from typing import Dict, List, Optional
from django.db import transaction
from store.models import Product
from .chroma import ChromaVectorStore
from ..llm.embeddings import EmbeddingGenerator

logger = logging.getLogger(__name__)

class VectorIndex:
    """
    Index products for vector search
    """
    
    def __init__(
        self,
        vector_store: Optional[ChromaVectorStore] = None,
        embedding_generator: Optional[EmbeddingGenerator] = None
    ):
        self.vector_store = vector_store or ChromaVectorStore()
        self.embeddings = embedding_generator or EmbeddingGenerator()
    
    def index_product(self, product: Product) -> bool:
        """
        Index a single product
        """
        try:
            # Create text representation
            text = self._create_product_text(product)
            
            # Generate embedding
            embedding = self.embeddings.encode(text)
            
            # Prepare metadata
            metadata = {
                'product_id': str(product.id),
                'name': product.name,
                'category': product.category.name if product.category else '',
                'price': str(product.price),
                'sku': product.sku,
                'status': product.status
            }
            
            # Add to vector store
            success = self.vector_store.add(
                ids=[str(product.id)],
                embeddings=[embedding.tolist()],
                metadatas=[metadata],
                documents=[text]
            )
            
            return success
            
        except Exception as e:
            logger.error(f"Product indexing error: {e}")
            return False
    
    def index_products(self, products: List[Product]) -> Dict:
        """
        Index multiple products
        """
        indexed = 0
        errors = []
        
        with transaction.atomic():
            for product in products:
                try:
                    if self.index_product(product):
                        indexed += 1
                except Exception as e:
                    errors.append(f"Product {product.id}: {e}")
        
        return {
            'success': True,
            'indexed': indexed,
            'errors': errors
        }
    
    def index_all_products(self) -> Dict:
        """
        Index all published products
        """
        try:
            products = Product.objects.filter(status='published')
            return self.index_products(products)
        except Exception as e:
            logger.error(f"Index all products error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def update_product(self, product_id: int) -> bool:
        """
        Update a product's embedding
        """
        try:
            product = Product.objects.get(id=product_id)
            
            # Delete existing
            self.vector_store.delete([str(product_id)])
            
            # Re-index
            return self.index_product(product)
            
        except Product.DoesNotExist:
            logger.error(f"Product {product_id} not found")
            return False
        except Exception as e:
            logger.error(f"Product update error: {e}")
            return False
    
    def delete_product(self, product_id: int) -> bool:
        """
        Remove product from index
        """
        try:
            return self.vector_store.delete([str(product_id)])
        except Exception as e:
            logger.error(f"Delete error: {e}")
            return False
    
    def _create_product_text(self, product: Product) -> str:
        """
        Create text representation of product for embedding
        """
        parts = [
            product.name,
            product.description or '',
            product.short_description or '',
            product.category.name if product.category else '',
            ' '.join([tag.name for tag in product.tags.all()])
        ]
        return ' '.join(filter(None, parts))
    
    def get_indexed_count(self) -> int:
        """
        Get number of indexed products
        """
        return self.vector_store.get_count()