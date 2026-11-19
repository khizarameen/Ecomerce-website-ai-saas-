"""
Image Analyzer - Using Google AI Studio (Gemini Vision Model)
"""

import base64
import io
import json
import logging
import re
from typing import Dict, List, Tuple

from PIL import Image

from ..llm.google_studio import GoogleStudioLLM

logger = logging.getLogger(__name__)


class ImageAnalyzer:
    """
    Analyzes product images using Google AI Studio Gemini Vision.
    """

    def __init__(self, use_deep_learning: bool = False):
        self.use_deep_learning = use_deep_learning
        self.vision_llm = GoogleStudioLLM()
        logger.info('ImageAnalyzer initialized (Google AI Studio Vision Mode)')

    def analyze(self, image_file) -> Dict:
        """Analyze image using Google AI Studio Vision Model."""
        try:
            image_base64, mime_type = self._image_to_base64_and_mime(image_file)
            analysis = self._analyze_with_llm(image_base64, mime_type)

            objects = [
                str(o).strip()
                for o in (analysis.get('objects') or [])
                if o and str(o).strip().lower() != 'none'
            ]
            colors = [
                str(c).strip()
                for c in (analysis.get('colors') or [])
                if c and str(c).strip().lower() != 'none'
            ]
            suggestions = [
                str(s).strip()
                for s in (analysis.get('suggestions') or [])
                if s and str(s).strip().lower() != 'none'
            ]
            raw_text = analysis.get('text', '')
            extracted_text = '' if not raw_text or str(raw_text).strip().lower() == 'none' else str(raw_text).strip()
            attributes = self._normalize_attributes(analysis.get('attributes'), colors, objects)

            return {
                'success': True,
                'objects': objects or ['product'],
                'text': extracted_text,
                'colors': colors,
                'dominant_colors': colors[:5],
                'attributes': attributes,
                'suggestions': suggestions,
                'extracted_text': extracted_text,
            }

        except Exception as e:
            logger.error(f'Image analysis error: {e}')
            return self._get_fallback_analysis(str(e))

    def _image_to_base64_and_mime(self, image_file) -> Tuple[str, str]:
        """Read image bytes, determine MIME type, and encode to base64."""
        if hasattr(image_file, 'read'):
            if hasattr(image_file, 'seek'):
                image_file.seek(0)
            file_bytes = image_file.read()
            if hasattr(image_file, 'seek'):
                image_file.seek(0)
        elif isinstance(image_file, str):
            with open(image_file, 'rb') as f:
                file_bytes = f.read()
        elif isinstance(image_file, bytes):
            file_bytes = image_file
        else:
            raise ValueError(f'Unsupported image input type: {type(image_file)}')

        if not file_bytes:
            raise ValueError('Empty image file provided')

        mime_type = 'image/jpeg'
        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                fmt = (img.format or 'JPEG').upper()
                mime_map = {
                    'JPEG': 'image/jpeg',
                    'JPG': 'image/jpeg',
                    'PNG': 'image/png',
                    'WEBP': 'image/webp',
                    'GIF': 'image/gif',
                }
                if fmt in mime_map:
                    mime_type = mime_map[fmt]
                else:
                    buf = io.BytesIO()
                    img.convert('RGB').save(buf, format='JPEG')
                    file_bytes = buf.getvalue()
                    mime_type = 'image/jpeg'
        except Exception as img_err:
            logger.warning(f'Could not inspect image format via PIL, defaulting to image/jpeg: {img_err}')

        return base64.b64encode(file_bytes).decode('utf-8'), mime_type

    def _analyze_with_llm(self, image_base64: str, mime_type: str) -> Dict:
        """Analyze image using Google AI Studio Gemini Vision."""
        prompt = """Analyze this product image and extract:
1. objects: list of visible product/object names (short keywords)
2. colors: list of main colors visible
3. text: any visible brand/label text in the image (empty string if none)
4. attributes: a JSON object with string keys/values such as {"brand": "...", "category": "...", "material": "...", "style": "..."} (omit unknown keys or set empty string)
5. suggestions: list of 3-5 concise e-commerce search keywords for finding similar products

Return ONLY valid JSON matching this schema:
{
    "objects": ["item1", "item2"],
    "colors": ["color1", "color2"],
    "text": "visible text",
    "attributes": {"brand": "brand_name", "category": "category_name", "material": "material_name"},
    "suggestions": ["keyword1", "keyword2"]
}"""

        content = self.vision_llm.analyze_image(
            image_base64=image_base64,
            prompt=prompt,
            mime_type=mime_type,
            json_mode=True,
            max_tokens=600,
            temperature=0.2,
        )

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            logger.warning(f'Failed to parse Gemini Vision JSON response: {content[:200]}')
            raise ValueError('Invalid JSON returned from vision model')

    @staticmethod
    def _normalize_attributes(raw_attributes, colors: List[str], objects: List[str]) -> Dict[str, str]:
        """Ensure attributes is always a flat string dictionary for frontend rendering."""
        normalized: Dict[str, str] = {}
        if isinstance(raw_attributes, dict):
            for k, v in raw_attributes.items():
                if v is None:
                    continue
                val_str = ', '.join(str(x) for x in v) if isinstance(v, list) else str(v)
                val_str = val_str.strip()
                if val_str and val_str.lower() != 'none':
                    normalized[str(k)] = val_str
        elif isinstance(raw_attributes, list):
            items = [str(x).strip() for x in raw_attributes if x]
            if items:
                normalized['features'] = ', '.join(items)

        if 'color' not in normalized and colors:
            normalized['color'] = colors[0]
        if 'category' not in normalized and objects:
            normalized['category'] = objects[0]
        return normalized

    def _get_fallback_analysis(self, error: str = '') -> Dict:
        """Return structured error/fallback payload when vision API fails."""
        logger.warning(f'Vision analysis failed, returning error payload: {error[:150]}')
        return {
            'success': False,
            'error': error or 'Image analysis unavailable',
            'objects': [],
            'colors': [],
            'dominant_colors': [],
            'text': '',
            'extracted_text': '',
            'attributes': {},
            'suggestions': [],
        }
