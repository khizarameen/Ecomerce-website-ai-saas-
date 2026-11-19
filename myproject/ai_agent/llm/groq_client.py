"""
Groq LLM Integration for AI Agent (with Google AI Studio fallback)
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


class GroqLLM:
    """
    Groq LLM client using Groq's OpenAI-compatible Chat Completions API.
    Falls back to Google AI Studio Gemini if Groq fails or is unconfigured.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        config: Optional[Dict] = None,
    ):
        """Initialize Groq LLM client."""
        self.api_key = api_key or _get_django_setting('GROQ_API_KEY')
        self.model = model or _get_django_setting('GROQ_MODEL', 'openai/gpt-oss-120b')
        self.base_url = (base_url or _get_django_setting('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')).rstrip('/')
        default_cfg = _get_django_setting('LLM_CONFIG', {}) or {}
        self.config = {
            'max_tokens': default_cfg.get('max_tokens', 1000),
            'temperature': default_cfg.get('temperature', 0.7),
            'top_p': default_cfg.get('top_p', 0.9),
            **(config or {}),
        }

        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        logger.info(f'GroqLLM initialized with model: {self.model}')

    def _build_messages(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        built: List[Dict[str, str]] = []
        if system_prompt:
            built.append({'role': 'system', 'content': system_prompt})
        if messages:
            for msg in messages:
                if msg.get('role') and msg.get('content'):
                    built.append({'role': msg['role'], 'content': msg['content']})
        if prompt:
            built.append({'role': 'user', 'content': prompt})
        return built

    def _fallback_google(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ) -> Optional[str]:
        try:
            from .google_studio import GoogleStudioLLM
            google_llm = GoogleStudioLLM()
            if not google_llm.api_key:
                return None
            logger.warning('Falling back to GoogleStudioLLM for text generation')
            return google_llm.generate(
                prompt=prompt,
                system_prompt=system_prompt,
                messages=messages,
                **kwargs,
            )
        except Exception as fallback_err:
            logger.error(f'Google fallback error: {fallback_err}')
            return None

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ) -> str:
        """Generate a response from Groq LLM."""
        if not self.api_key:
            fallback = self._fallback_google(prompt, system_prompt=system_prompt, messages=messages, **kwargs)
            if fallback:
                return fallback
            return 'Error: GROQ_API_KEY is not configured.'

        built_messages = self._build_messages(prompt, system_prompt=system_prompt, messages=messages)
        payload = {
            'model': self.model,
            'messages': built_messages,
            **self.config,
            **kwargs,
        }

        try:
            response = requests.post(
                f'{self.base_url}/chat/completions',
                headers=self.headers,
                json=payload,
                timeout=60,
            )
            response.raise_for_status()
            result = response.json()
            message = result['choices'][0]['message']
            content = (message.get('content') or '').strip()
            if not content and message.get('reasoning'):
                content = str(message['reasoning']).strip()
            return content

        except requests.exceptions.Timeout:
            logger.error('Groq request timeout')
            fallback = self._fallback_google(prompt, system_prompt=system_prompt, messages=messages, **kwargs)
            return fallback or "I'm sorry, the request timed out. Please try again."
        except requests.exceptions.RequestException as e:
            logger.error(f'Groq request error: {e}')
            fallback = self._fallback_google(prompt, system_prompt=system_prompt, messages=messages, **kwargs)
            return fallback or f'Error: {str(e)}'
        except Exception as e:
            logger.error(f'Groq error: {e}')
            fallback = self._fallback_google(prompt, system_prompt=system_prompt, messages=messages, **kwargs)
            return fallback or f'Error: {str(e)}'

    def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        messages: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ):
        """Generate a streaming response from Groq LLM."""
        if not self.api_key:
            yield 'Error: GROQ_API_KEY is not configured.'
            return

        built_messages = self._build_messages(prompt, system_prompt=system_prompt, messages=messages)
        payload = {
            'model': self.model,
            'messages': built_messages,
            'stream': True,
            **self.config,
            **kwargs,
        }

        try:
            response = requests.post(
                f'{self.base_url}/chat/completions',
                headers=self.headers,
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
                    data = decoded[6:]
                    if data == '[DONE]':
                        break
                    chunk = json.loads(data)
                    choices = chunk.get('choices') or []
                    if choices:
                        content = choices[0].get('delta', {}).get('content', '')
                        if content:
                            yield content

        except Exception as e:
            logger.error(f'Groq stream generation error: {e}')
            yield f'Error: {str(e)}'
