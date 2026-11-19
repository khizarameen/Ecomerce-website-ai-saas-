"""
Image Service
"""

import logging
from typing import Dict, List, Optional
from ..vision.image_analyzer import ImageAnalyzer
from ..tools.product_search import ProductSearchTool

logger = logging.getLogger(__name__)

class ImageService:
    """
    Service for handling image-related AI operations
    """
    
    def __init__(
        self,
        image_analyzer: Optional[ImageAnalyzer] = None,
        product_tool: Optional[ProductSearchTool] = None
    ):
        self.image_analyzer = image_analyzer or ImageAnalyzer()
        self.product_tool = product_tool or ProductSearchTool()
    
    def analyze(self, image_file) -> Dict:
        """
        Analyze an image
        """
        try:
            return self.image_analyzer.analyze(image_file)
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return {
                'success': False,
                'error': str(e),
                'objects': [],
                'attributes': {},
                'text': ''
            }
    
    def search_products_by_image(self, image_file, limit: int = 10) -> List[Dict]:
        """
        Search products using image
        """
        try:
            # Analyze image
            analysis = self.analyze(image_file)
            
            # Extract search terms
            search_terms = self._extract_search_terms(analysis)
            
            # Search products
            results = []
            seen_ids = set()
            
            for term in search_terms:
                term_results = self.product_tool.search(term, limit=limit)
                for result in term_results:
                    if result.get('id') not in seen_ids:
                        seen_ids.add(result.get('id'))
                        results.append(result)
                        if len(results) >= limit:
                            break
                if len(results) >= limit:
                    break
            
            return results
            
        except Exception as e:
            logger.error(f"Image search error: {e}")
            return []
    
    def _extract_search_terms(self, analysis: Dict) -> List[str]:
        """
        Extract search terms from image analysis
        """
        terms = []
        
        # Get objects
        objects = analysis.get('objects', [])
        if objects:
            terms.extend(objects[:3])
        
        # Get text
        text = analysis.get('text', '')
        if text:
            terms.append(text)
        
        # Get attributes
        attributes = analysis.get('attributes', {})
        if attributes.get('color'):
            terms.append(attributes['color'])
        if attributes.get('brand'):
            terms.append(attributes['brand'])
        
        return list(set(terms)) if terms else ['product']