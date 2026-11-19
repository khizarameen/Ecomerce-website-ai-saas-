# ai_agent/tools/image_search.py
"""
Image Search Tool - Using LLM Vision
"""

import logging
from typing import Dict, List, Optional

# ✅ Import using absolute path
from ai_agent.tools.product_search import ProductSearchTool
from ai_agent.vision.image_analyzer import ImageAnalyzer

logger = logging.getLogger(__name__)

class ImageSearchTool:
    """
    Tool for searching products using images
    Uses LLM Vision for image analysis
    """
    
    def __init__(self):
        self.product_search = ProductSearchTool()
        self.image_analyzer = ImageAnalyzer()
        logger.info("ImageSearchTool initialized with LLM Vision")
    
    def search(self, image_file, limit: int = 10, analysis: Optional[Dict] = None) -> List[Dict]:
        """
        Search products using image
        
        Args:
            image_file: Image file (UploadedFile or path)
            limit: Maximum number of results
            analysis: Pre-computed analysis (optional)
        
        Returns:
            List of matching products
        """
        try:
            # Analyze image with LLM if not provided
            if not analysis:
                analysis = self.image_analyzer.analyze(image_file)
            
            # Check if analysis was successful
            if not analysis.get('success'):
                logger.warning(f"Image analysis failed: {analysis.get('error')}")
                return []
            
            # Extract search terms from analysis
            search_terms = self._extract_search_terms(analysis)
            logger.info(f"Search terms extracted: {search_terms}")
            
            # Search for each term and combine results
            all_results = []
            seen_ids = set()
            
            for term in search_terms:
                if term and len(term) > 1:
                    results = self.product_search.search(term, limit=limit)
                    for result in results:
                        if result.get('id') not in seen_ids:
                            seen_ids.add(result.get('id'))
                            all_results.append(result)
                            if len(all_results) >= limit:
                                break
                if len(all_results) >= limit:
                    break
            
            return all_results[:limit]
            
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
        
        # Get colors
        colors = analysis.get('colors', [])
        if colors:
            terms.extend(colors[:2])
        
        # Get attributes
        attributes = analysis.get('attributes', {})
        if attributes.get('brand'):
            terms.append(attributes['brand'])
        if attributes.get('color'):
            terms.append(attributes['color'])
        if attributes.get('category'):
            terms.append(attributes['category'])
        
        # Get suggestions
        suggestions = analysis.get('suggestions', [])
        if suggestions:
            terms.extend(suggestions[:2])
        
        # Get extracted text
        extracted_text = analysis.get('extracted_text', '')
        if extracted_text:
            words = extracted_text.split()[:3]
            terms.extend(words)
        
        # If no terms, return default
        if not terms:
            terms = ['product']
        
        # Remove duplicates and empty strings
        return list(set([t for t in terms if t and len(t) > 1]))