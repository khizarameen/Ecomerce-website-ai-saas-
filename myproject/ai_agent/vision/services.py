"""
Image Analyzer
"""

import logging
from typing import Dict, List, Optional
import numpy as np
from PIL import Image
import io

logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("OpenCV not installed. Image processing will be limited.")

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    logger.warning("Tesseract not installed. OCR will be disabled.")

try:
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("Scikit-learn not installed. Color extraction will be limited.")


class ImageAnalyzer:
    """
    Analyzes images for product features using computer vision
    """
    
    def __init__(self, use_deep_learning: bool = False):
        """
        Initialize image analyzer
        """
        self.use_deep_learning = use_deep_learning
        logger.info("ImageAnalyzer initialized")
    
    def analyze(self, image_file) -> Dict:
        """
        Analyze image and extract features
        """
        try:
            # Read image
            image = self._read_image(image_file)
            
            # Extract features
            objects = self._detect_objects(image) if CV2_AVAILABLE else []
            text = self._extract_text(image) if TESSERACT_AVAILABLE else ""
            colors = self._extract_colors(image) if SKLEARN_AVAILABLE else []
            attributes = self._extract_attributes(objects, text, colors)
            
            return {
                'success': True,
                'objects': objects,
                'text': text,
                'colors': colors,
                'dominant_colors': colors[:5] if colors else [],
                'attributes': attributes,
                'suggestions': self._generate_suggestions(attributes)
            }
            
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return {
                'success': False,
                'error': str(e),
                'objects': [],
                'text': '',
                'colors': [],
                'attributes': {},
                'suggestions': []
            }
    
    def _read_image(self, image_file):
        """
        Read image from file
        """
        if hasattr(image_file, 'read'):
            # Django UploadedFile
            file_bytes = image_file.read()
            image = Image.open(io.BytesIO(file_bytes))
            return np.array(image)
        elif isinstance(image_file, str):
            # File path
            if CV2_AVAILABLE:
                return cv2.imread(image_file)
            else:
                return Image.open(image_file)
        elif isinstance(image_file, np.ndarray):
            return image_file
        else:
            raise ValueError("Unsupported image input")
    
    def _detect_objects(self, image: np.ndarray) -> List[str]:
        """
        Detect objects in image using OpenCV
        """
        objects = []
        
        if not CV2_AVAILABLE:
            return objects
        
        try:
            # Simple object detection using contours (placeholder)
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # For now, return placeholder categories
            if len(contours) > 5:
                objects.append('product')
            if len(contours) > 10:
                objects.append('multiple_items')
            
            return objects
            
        except Exception as e:
            logger.warning(f"Object detection error: {e}")
            return objects
    
    def _extract_text(self, image: np.ndarray) -> str:
        """
        Extract text from image using OCR
        """
        if not TESSERACT_AVAILABLE:
            return ""
        
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Apply threshold
            _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
            
            # Extract text
            text = pytesseract.image_to_string(thresh)
            return text.strip()
            
        except Exception as e:
            logger.warning(f"OCR error: {e}")
            return ""
    
    def _extract_colors(self, image: np.ndarray) -> List[str]:
        """
        Extract dominant colors from image
        """
        if not SKLEARN_AVAILABLE:
            return []
        
        try:
            # Reshape image to list of pixels
            pixels = image.reshape(-1, 3)
            
            # Use k-means to find dominant colors
            kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
            kmeans.fit(pixels)
            
            colors = kmeans.cluster_centers_
            
            # Convert to color names (simplified)
            color_names = []
            color_map = {
                (0, 0, 0): 'black',
                (255, 255, 255): 'white',
                (255, 0, 0): 'red',
                (0, 255, 0): 'green',
                (0, 0, 255): 'blue',
                (255, 255, 0): 'yellow',
                (255, 0, 255): 'purple',
                (0, 255, 255): 'cyan',
                (128, 128, 128): 'gray',
                (255, 165, 0): 'orange',
                (255, 192, 203): 'pink',
                (139, 69, 19): 'brown'
            }
            
            for color in colors:
                # Find nearest color name
                min_dist = float('inf')
                nearest_name = 'unknown'
                for (r, g, b), name in color_map.items():
                    dist = np.sqrt((color[0]-r)**2 + (color[1]-g)**2 + (color[2]-b)**2)
                    if dist < min_dist:
                        min_dist = dist
                        nearest_name = name
                color_names.append(nearest_name)
            
            return list(set(color_names))
            
        except Exception as e:
            logger.warning(f"Color extraction error: {e}")
            return []
    
    def _extract_attributes(self, objects: List[str], text: str, colors: List[str]) -> Dict:
        """
        Extract product attributes from analysis
        """
        attributes = {}
        
        # Extract from text
        text_lower = text.lower()
        if 'size' in text_lower:
            attributes['size'] = self._extract_size(text)
        if 'brand' in text_lower:
            attributes['brand'] = self._extract_brand(text)
        
        # Extract from objects
        if objects:
            attributes['category'] = objects[0]
        
        # Extract from colors
        if colors:
            attributes['color'] = colors[0]
        
        return attributes
    
    def _extract_size(self, text: str) -> Optional[str]:
        """
        Extract size from text
        """
        import re
        size_patterns = [
            r'S[MXL]{1,2}',
            r'\d+\.?\d*[-\s]*(cm|mm|in|inch)',
            r'[0-9]+(?:x[0-9]+)+'
        ]
        for pattern in size_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group()
        return None
    
    def _extract_brand(self, text: str) -> Optional[str]:
        """
        Extract brand from text
        """
        common_brands = ['nike', 'adidas', 'puma', 'apple', 'samsung', 'sony', 'dell', 'hp', 'lenovo']
        text_lower = text.lower()
        for brand in common_brands:
            if brand in text_lower:
                return brand
        return None
    
    def _generate_suggestions(self, attributes: Dict) -> List[str]:
        """
        Generate search suggestions based on attributes
        """
        suggestions = []
        
        if attributes.get('category'):
            suggestions.append(attributes['category'])
        if attributes.get('brand'):
            suggestions.append(attributes['brand'])
        if attributes.get('color'):
            suggestions.append(attributes['color'])
        
        return suggestions