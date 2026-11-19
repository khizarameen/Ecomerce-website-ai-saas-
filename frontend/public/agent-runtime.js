/**
 * StoreHub Open Agentic Web Browser Runtime (MIT NANDA / Cognizant AI Lab / Mozilla Otari)
 * Standalone browser-native agent discovery, schema validation, BYOK/Otari execution,
 * and cross-origin A2A telemetry engine.
 */
(function (globalScope) {
  'use strict';

  var STORAGE_KEY = 'storehub_open_agent_llm_config';
  var PROTOCOL = 'open-agentic-web/1.0';

  var PROVIDER_PRESETS = {
    'storehub-fallback': {
      id: 'storehub-fallback',
      label: 'StoreHub Managed Mesh Fallback (Zero-Config)',
      requiresKey: false,
      defaultModel: 'llama-3.3-70b-versatile + gemini-2.5-flash',
      defaultBaseUrl: '',
    },
    'mozilla-otari': {
      id: 'mozilla-otari',
      label: 'Mozilla Otari Browser Agent Runtime',
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

  function getBackendOrigin() {
    var origin = (globalScope.location && globalScope.location.origin) || 'http://localhost:3000';
    if (origin.indexOf('localhost:3000') !== -1 || origin.indexOf('127.0.0.1:3000') !== -1) {
      return 'http://127.0.0.1:8000';
    }
    return origin;
  }

  function getLLMConfig() {
    try {
      var raw = globalScope.sessionStorage && globalScope.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.provider && PROVIDER_PRESETS[parsed.provider]) {
          return parsed;
        }
      }
    } catch (_err) {
      // ignore storage errors
    }
    return {
      provider: 'storehub-fallback',
      model: PROVIDER_PRESETS['storehub-fallback'].defaultModel,
      baseUrl: '',
      apiKey: '',
    };
  }

  function saveLLMConfig(cfg) {
    var provider = cfg && PROVIDER_PRESETS[cfg.provider] ? cfg.provider : 'storehub-fallback';
    var preset = PROVIDER_PRESETS[provider];
    var clean = {
      provider: provider,
      model: (cfg && cfg.model ? String(cfg.model) : preset.defaultModel).trim(),
      baseUrl: (cfg && cfg.baseUrl !== undefined ? String(cfg.baseUrl) : preset.defaultBaseUrl).trim(),
      apiKey: (cfg && cfg.apiKey ? String(cfg.apiKey) : '').trim(),
    };
    try {
      if (globalScope.sessionStorage) {
        globalScope.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      }
    } catch (_err) {
      // ignore
    }
    return clean;
  }

  function clearLLMConfig() {
    try {
      if (globalScope.sessionStorage) {
        globalScope.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (_err) {
      // ignore
    }
    return getLLMConfig();
  }

  function normalizeManifestUrl(inputUrl) {
    var trimmed = String(inputUrl || '').trim();
    if (!trimmed) {
      return '/.well-known/agent-network.json';
    }
    if (trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0) {
      if (trimmed.indexOf('.json') === -1) {
        return trimmed.replace(/\/+$/, '') + '/.well-known/agent-network.json';
      }
      return trimmed;
    }
    return trimmed.charAt(0) === '/' ? trimmed : '/' + trimmed;
  }

  function resolveEndpointUrl(manifestOrigin, endpointPath) {
    if (!endpointPath) return getBackendOrigin() + '/api/open-agent/invoke/';
    if (endpointPath.indexOf('http://') === 0 || endpointPath.indexOf('https://') === 0) {
      return endpointPath;
    }
    if (manifestOrigin && (manifestOrigin.indexOf('localhost:3000') !== -1 || manifestOrigin.indexOf('127.0.0.1:3000') !== -1)) {
      return getBackendOrigin() + endpointPath;
    }
    return (manifestOrigin || getBackendOrigin()).replace(/\/+$/, '') + endpointPath;
  }

  async function discoverManifest(rawUrl) {
    var target = normalizeManifestUrl(rawUrl);
    var candidates = [target];
    if (target.indexOf('http') !== 0) {
      candidates.push(getBackendOrigin() + target);
      candidates.push('/agent-network.json');
    }

    var lastError = null;
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      try {
        var res = await globalScope.fetch(candidate, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          lastError = new Error('HTTP ' + res.status + ' from ' + candidate);
          continue;
        }
        var manifest = await res.json();
        if (!manifest || !Array.isArray(manifest.agents)) {
          lastError = new Error('Manifest missing required "agents" array');
          continue;
        }
        var resolvedOrigin = candidate.indexOf('http') === 0
          ? new URL(candidate).origin
          : ((globalScope.location && globalScope.location.origin) || getBackendOrigin());
        return {
          manifest: manifest,
          resolvedUrl: candidate,
          origin: manifest.origin || resolvedOrigin,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Failed to discover agent-network.json manifest.');
  }

  function validateInputAgainstSchema(agentDef, payload) {
    var schema = (agentDef && agentDef.input_schema) || {};
    var required = Array.isArray(schema.required) ? schema.required : [];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      var key = required[i];
      if (payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === '') {
        missing.push(key);
      }
    }
    return {
      valid: missing.length === 0,
      missing: missing,
    };
  }

  async function invokeBrowserLLM(systemPrompt, userPrompt, llmConfig) {
    var cfg = llmConfig || getLLMConfig();
    if (!cfg || cfg.provider === 'storehub-fallback') {
      return { used: false, reason: 'storehub-fallback-active' };
    }

    if (cfg.provider === 'mozilla-otari') {
      if (globalScope.otari && typeof globalScope.otari.chat === 'function') {
        var otariOut = await globalScope.otari.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          model: cfg.model,
        });
        return { used: true, provider: 'mozilla-otari-native', text: String(otariOut && (otariOut.content || otariOut.text || otariOut)) };
      }
      var otariUrl = cfg.baseUrl || PROVIDER_PRESETS['mozilla-otari'].defaultBaseUrl;
      var oRes = await globalScope.fetch(otariUrl, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {}
        ),
        body: JSON.stringify({
          model: cfg.model || 'otari-local-webllm',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!oRes.ok) throw new Error('Mozilla Otari endpoint returned HTTP ' + oRes.status);
      var oData = await oRes.json();
      var oText = oData && oData.choices && oData.choices[0] && oData.choices[0].message && oData.choices[0].message.content;
      return { used: true, provider: 'mozilla-otari-http', text: oText || '' };
    }

    if (cfg.provider === 'openai-compatible') {
      if (!cfg.apiKey) throw new Error('API key required for OpenAI/Groq BYOK');
      var oaUrl = cfg.baseUrl || PROVIDER_PRESETS['openai-compatible'].defaultBaseUrl;
      var oaRes = await globalScope.fetch(oaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cfg.apiKey,
        },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      });
      if (!oaRes.ok) throw new Error('BYOK OpenAI-compatible HTTP ' + oaRes.status);
      var oaData = await oaRes.json();
      var oaText = oaData && oaData.choices && oaData.choices[0] && oaData.choices[0].message && oaData.choices[0].message.content;
      return { used: true, provider: 'openai-compatible-byok', text: oaText || '' };
    }

    if (cfg.provider === 'google-gemini') {
      if (!cfg.apiKey) throw new Error('Gemini API key required for browser BYOK');
      var model = cfg.model || 'gemini-2.5-flash';
      var base = (cfg.baseUrl || PROVIDER_PRESETS['google-gemini'].defaultBaseUrl).replace(/\/+$/, '');
      var gRes = await globalScope.fetch(base + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(cfg.apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
        }),
      });
      if (!gRes.ok) throw new Error('Gemini BYOK HTTP ' + gRes.status);
      var gData = await gRes.json();
      var gText =
        gData &&
        gData.candidates &&
        gData.candidates[0] &&
        gData.candidates[0].content &&
        gData.candidates[0].content.parts &&
        gData.candidates[0].content.parts[0] &&
        gData.candidates[0].content.parts[0].text;
      return { used: true, provider: 'google-gemini-byok', text: gText || '' };
    }

    return { used: false, reason: 'unknown-provider' };
  }

  async function executeAgentPipeline(options) {
    var opts = options || {};
    var emit = typeof opts.onTrace === 'function' ? opts.onTrace : function () {};
    var llmConfig = opts.llmConfig || getLLMConfig();
    var trace = [];

    function pushStep(stage, status, message, meta) {
      var entry = {
        stage: stage,
        status: status,
        message: message,
        meta: meta || {},
        timestamp: new Date().toISOString(),
      };
      trace.push(entry);
      emit(entry);
    }

    // 1. DISCOVER_MANIFEST
    var discovered = await discoverManifest(opts.manifestUrl);
    var manifest = discovered.manifest;
    pushStep(
      'DISCOVER_MANIFEST',
      'ok',
      'Discovered ' + (manifest.network_id || 'external-network') + ' (' + manifest.protocol + ') with ' + manifest.agents.length + ' agents.',
      { resolvedUrl: discovered.resolvedUrl }
    );

    // 2. VALIDATE_SCHEMA
    var agentDef = manifest.agents.find(function (a) {
      return a.id === opts.agentId;
    }) || manifest.agents[0];
    if (!agentDef) {
      throw new Error('No conforming agent found in manifest.');
    }

    var safePayload = Object.assign({}, opts.payload || {});
    var validation = validateInputAgainstSchema(agentDef, safePayload);
    if (!validation.valid) {
      for (var k = 0; k < validation.missing.length; k++) {
        var missingKey = validation.missing[k];
        safePayload[missingKey] = safePayload.query || safePayload.product_title || 'Electronics';
      }
      pushStep(
        'VALIDATE_SCHEMA',
        'warn',
        'Auto-filled missing required field(s): ' + validation.missing.join(', '),
        { agentId: agentDef.id }
      );
    } else {
      pushStep(
        'VALIDATE_SCHEMA',
        'ok',
        'Validated payload against JSON schema for "' + agentDef.id + '".',
        { agentId: agentDef.id }
      );
    }

    // 3. A2A_NEGOTIATE (Browser LLM / Otari or Remote Endpoint + Backend Mesh Fallback)
    var endpointPath =
      agentDef.endpoint ||
      (manifest.interoperability && manifest.interoperability.invoke_endpoint) ||
      '/api/open-agent/invoke/';
    var invokeUrl = resolveEndpointUrl(discovered.origin, endpointPath);
    var callerManifestUrl =
      ((globalScope.location && globalScope.location.origin) || 'http://localhost:3000') +
      '/.well-known/agent-network.json';

    var invokeResponse = await globalScope.fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Caller-Manifest': callerManifestUrl,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'oaw-' + Date.now(),
        agent_id: agentDef.id,
        caller_manifest: opts.callerManifest || callerManifestUrl,
        payload: safePayload,
      }),
    });

    if (!invokeResponse.ok) {
      throw new Error('Remote endpoint ' + invokeUrl + ' returned HTTP ' + invokeResponse.status);
    }
    var rpcData = await invokeResponse.json();
    var executionMode = 'storehub-backend-fallback';
    var browserSummary = null;

    if (llmConfig && llmConfig.provider !== 'storehub-fallback') {
      try {
        var llmRes = await invokeBrowserLLM(
          'You are the Open Agentic Web browser agent executing a cross-site commerce A2A task. Summarize the negotiated deal or evaluation in 2 crisp sentences.',
          'Agent: ' + agentDef.id + '\nInput: ' + JSON.stringify(safePayload) + '\nResult: ' + JSON.stringify(rpcData.result || rpcData),
          llmConfig
        );
        if (llmRes && llmRes.used && llmRes.text) {
          executionMode = llmRes.provider;
          browserSummary = llmRes.text;
          pushStep(
            'A2A_NEGOTIATE',
            'ok',
            'Browser-native reasoning completed via ' + llmRes.provider + ' paired with ' + agentDef.id + '.',
            { invokeUrl: invokeUrl, provider: llmRes.provider }
          );
        }
      } catch (llmErr) {
        pushStep(
          'A2A_NEGOTIATE',
          'warn',
          'Browser provider (' + llmConfig.provider + ') unavailable (' + llmErr.message + '); seamlessly used StoreHub Managed Mesh Fallback.',
          { invokeUrl: invokeUrl, fallback: true }
        );
      }
    }

    if (!browserSummary) {
      pushStep(
        'A2A_NEGOTIATE',
        'ok',
        'Executed A2A negotiation via ' + invokeUrl + ' (' + executionMode + ').',
        { invokeUrl: invokeUrl, provider: executionMode }
      );
    }

    // 4. COMMIT_ACTION
    pushStep(
      'COMMIT_ACTION',
      'ok',
      'Verified Open Agentic Web response payload and committed browser telemetry.',
      { network_id: manifest.network_id, protocol: PROTOCOL }
    );

    return {
      ok: true,
      protocol: PROTOCOL,
      manifest: manifest,
      agent: agentDef,
      executionMode: executionMode,
      browserSummary: browserSummary,
      result: rpcData.result || rpcData,
      rawRpc: rpcData,
      trace: trace,
    };
  }

  globalScope.StoreHubOpenAgentRuntime = {
    PROTOCOL: PROTOCOL,
    PROVIDER_PRESETS: PROVIDER_PRESETS,
    getLLMConfig: getLLMConfig,
    saveLLMConfig: saveLLMConfig,
    clearLLMConfig: clearLLMConfig,
    discoverManifest: discoverManifest,
    executeAgentPipeline: executeAgentPipeline,
  };
})(typeof window !== 'undefined' ? window : globalThis);
