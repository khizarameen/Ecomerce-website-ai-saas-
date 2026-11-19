// src/utils/openAgentRuntime.js
// React wrapper around the standalone browser-native runtime (`/agent-runtime.js`).

export const DEFAULT_LOCAL_MANIFEST_URL = '/.well-known/agent-network.json';

export const PROVIDER_PRESETS = {
  'storehub-fallback': {
    id: 'storehub-fallback',
    label: 'StoreHub Managed Mesh Fallback (Zero-Config)',
    requiresKey: false,
    defaultModel: 'llama-3.3-70b-versatile + gemini-2.5-flash',
    defaultBaseUrl: '',
  },
  'mozilla-otari': {
    id: 'mozilla-otari',
    label: 'Mozilla Otari Browser Runtime',
    requiresKey: false,
    defaultModel: 'otari-local-webllm',
    defaultBaseUrl: 'http://127.0.0.1:8787/v1/chat/completions',
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI / Groq Compatible (BYOK in Browser)',
    requiresKey: true,
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  'google-gemini': {
    id: 'google-gemini',
    label: 'Google Gemini Direct Browser (BYOK)',
    requiresKey: true,
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
};

const STORAGE_KEY = 'storehub_open_agent_llm_config';

function getRuntimeGlobal() {
  if (typeof window !== 'undefined' && window.StoreHubOpenAgentRuntime) {
    return window.StoreHubOpenAgentRuntime;
  }
  return null;
}

export function getLLMConfig() {
  const rt = getRuntimeGlobal();
  if (rt) return rt.getLLMConfig();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && PROVIDER_PRESETS[parsed.provider]) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return {
    provider: 'storehub-fallback',
    model: PROVIDER_PRESETS['storehub-fallback'].defaultModel,
    baseUrl: '',
    apiKey: '',
  };
}

export function saveLLMConfig(cfg) {
  const rt = getRuntimeGlobal();
  if (rt) return rt.saveLLMConfig(cfg);
  const provider = cfg && PROVIDER_PRESETS[cfg.provider] ? cfg.provider : 'storehub-fallback';
  const preset = PROVIDER_PRESETS[provider];
  const clean = {
    provider,
    model: (cfg?.model || preset.defaultModel).trim(),
    baseUrl: (cfg?.baseUrl !== undefined ? String(cfg.baseUrl) : preset.defaultBaseUrl).trim(),
    apiKey: (cfg?.apiKey || '').trim(),
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // ignore
  }
  return clean;
}

export function clearLLMConfig() {
  const rt = getRuntimeGlobal();
  if (rt) return rt.clearLLMConfig();
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return getLLMConfig();
}

export async function discoverManifest(manifestUrl = DEFAULT_LOCAL_MANIFEST_URL) {
  const rt = getRuntimeGlobal();
  if (rt) return rt.discoverManifest(manifestUrl);
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const manifest = await res.json();
  return { manifest, resolvedUrl: manifestUrl, origin: window.location.origin };
}

export async function executeAgentPipeline(options) {
  const rt = getRuntimeGlobal();
  if (rt) return rt.executeAgentPipeline(options);
  throw new Error('Browser agent runtime (/agent-runtime.js) is still loading; please retry.');
}
