"""
Google AI Studio (Gemini) Integration for Vision and Multimodal Generation
"""

import json
import logging
from typing import Dict, List, Optional, Any

import requests

logger = logging.getLogger(__name__)


def _get_django_setting(name: str, default: Any = None) -> Any:
    try:
        from django.conf import settings
        if settings.configured:
            return getattr(settings, name, default)
    except Exception:
        pass
    return default


class GoogleStudioLLM:
    """
    Google AI Studio Gemini client using the Generative Language REST API.
    Supports text generation, streaming, and multimodal image vision analysis.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        config: Optional[Dict] = None,
    ):
        """Initialize Google AI Studio LLM client."""
        self.api_key = api_key or _get_django_setting('GOOGLE_API_KEY')
        self.model = model or _get_django_setting('GOOGLE_MODEL', 'gemini-3.5-flash-lite')
        self.base_url = (
            base_url
            or _get_django_setting('GOOGLE_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
        ).rstrip('/')
        default_cfg = _get_django_setting('LLM_CONFIG', {}) or {}
        self.config = {
            'max_tokens': default_cfg.get('max_tokens', 1000),
            'temperature': default_cfg.get('temperature', 0.7),
            'top_p': default_cfg.get('top_p', 0.9),
            **(config or {}),
        }
        logger.info(f'GoogleStudioLLM initialized with model: {self.model}')

    def _endpoint(self, action: str = 'generateContent', model: Optional[str] = None) -> str:
        target_model = model or self.model
        return f'{self.base_url}/models/{target_model}:{action}?key={self.api_key}'

    def _build_generation_config(self, json_mode: bool = False, **kwargs) -> Dict[str, Any]:
        gen_cfg: Dict[str, Any] = {
            'maxOutputTokens': kwargs.get('max_tokens', self.config.get('max_tokens', 1000)),
            'temperature': kwargs.get('temperature', self.config.get('temperature', 0.7)),
            'topP': kwargs.get('top_p', self.config.get('top_p', 0.9)),
        }
        if json_mode:
            gen_cfg['responseMimeType'] = 'application/json'
        return gen_cfg

    @staticmethod
    def _extract_text(result: Dict[str, Any]) -> str:
        candidates = result.get('candidates') or []
        if not candidates:
            return ''
        parts = candidates[0].get('content', {}).get('parts') or []
        texts = [p.get('text', '') for p in parts if isinstance(p, dict) and p.get('text')]
        return '\n'.join(texts).strip()

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ) -> str:
        """Generate a text response using Google AI Studio Gemini."""
        if not self.api_key:
            return 'Error: GOOGLE_API_KEY is not configured.'

        contents: List[Dict[str, Any]] = []
        if messages:
            for msg in messages:
                role = 'model' if msg.get('role') == 'assistant' else 'user'
                text = msg.get('content', '')
                if text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        if prompt:
            contents.append({'role': 'user', 'parts': [{'text': prompt}]})

        payload: Dict[str, Any] = {
            'contents': contents,
            'generationConfig': self._build_generation_config(**kwargs),
        }
        if system_prompt:
            payload['systemInstruction'] = {'parts': [{'text': system_prompt}]}

        try:
            response = requests.post(
                self._endpoint('generateContent'),
                headers={'Content-Type': 'application/json'},
                json=payload,
                timeout=60,
            )
            response.raise_for_status()
            return self._extract_text(response.json())
        except requests.exceptions.Timeout:
            logger.error('Google AI Studio request timeout')
            return "I'm sorry, the request timed out. Please try again."
        except requests.exceptions.RequestException as e:
            logger.error(f'Google AI Studio request error: {e}')
            return f'Error: {str(e)}'
        except Exception as e:
            logger.error(f'Google AI Studio error: {e}')
            return f'Error: {str(e)}'

    def analyze_image(
        self,
        image_base64: str,
        prompt: str,
        mime_type: str = 'image/jpeg',
        json_mode: bool = True,
        model: Optional[str] = None,
        **kwargs,
    ) -> str:
        """Analyze a base64-encoded image with Gemini Vision."""
        if not self.api_key:
            raise ValueError('GOOGLE_API_KEY is not configured.')

        vision_model = model or _get_django_setting('GOOGLE_VISION_MODEL', self.model)
        payload: Dict[str, Any] = {
            'contents': [
                {
                    'role': 'user',
                    'parts': [
                        {'text': prompt},
                        {
                            'inline_data': {
                                'mime_type': mime_type,
                                'data': image_base64,
                            }
                        },
                    ],
                }
            ],
            'generationConfig': self._build_generation_config(
                json_mode=json_mode,
                max_tokens=kwargs.pop('max_tokens', 600),
                temperature=kwargs.pop('temperature', 0.2),
                **kwargs,
            ),
        }

        response = requests.post(
            self._endpoint('generateContent', model=vision_model),
            headers={'Content-Type': 'application/json'},
            json=payload,
            timeout=90,
        )
        response.raise_for_status()
        return self._extract_text(response.json())

    def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        **kwargs,
    ):
        """Stream response chunks from Google AI Studio Gemini."""
        if not self.api_key:
            yield 'Error: GOOGLE_API_KEY is not configured.'
            return

        payload: Dict[str, Any] = {
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': self._build_generation_config(**kwargs),
        }
        if system_prompt:
            payload['systemInstruction'] = {'parts': [{'text': system_prompt}]}

        try:
            url = f"{self._endpoint('streamGenerateContent')}&alt=sse"
            response = requests.post(
                url,
                headers={'Content-Type': 'application/json'},
                json=payload,
                stream=True,
                timeout=60,
            )
            response.raise_for_status()

            for line in response.iter_lines():
                if not line:
                    continue
                decoded = line.decode('utf-8')
                if decoded.startswith('data: '):
                    chunk = json.loads(decoded[6:])
                    text = self._extract_text(chunk)
                    if text:
                        yield text
        except Exception as e:
            logger.error(f'Google AI Studio stream error: {e}')
            yield f'Error: {str(e)}'
