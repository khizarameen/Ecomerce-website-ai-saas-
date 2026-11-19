import { useEffect, useState } from 'react';
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  KeyIcon,
  PlayIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  clearLLMConfig,
  DEFAULT_LOCAL_MANIFEST_URL,
  discoverManifest,
  executeAgentPipeline,
  getLLMConfig,
  PROVIDER_PRESETS,
  saveLLMConfig,
} from '../../utils/openAgentRuntime';

const TABS = [
  { id: 'playground', label: '⚡ Cross-Site A2A Playground' },
  { id: 'manifest', label: '🌐 Manifest & Schemas' },
  { id: 'llm', label: '🔑 LLM & Mozilla Otari Config' },
];

export default function OpenAgenticWorkspace({ compact = false, initialTab = 'playground' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [manifestUrlInput, setManifestUrlInput] = useState(DEFAULT_LOCAL_MANIFEST_URL);
  const [manifestInfo, setManifestInfo] = useState(null);
  const [manifestError, setManifestError] = useState('');
  const [showRawSchema, setShowRawSchema] = useState(false);

  const [llmConfig, setLlmConfig] = useState(() => getLLMConfig());
  const [selectedAgentId, setSelectedAgentId] = useState('anti_rto_rerouter_agent');

  // Playground inputs
  const [productQuery, setProductQuery] = useState('ProBass Wireless Earbuds');
  const [cityInput, setCityInput] = useState('Karachi');
  const [offerPriceInput, setOfferPriceInput] = useState('39.50');
  const [quantityInput, setQuantityInput] = useState('2');
  const [phoneInput, setPhoneInput] = useState('0300-0000000');
  const [addressInput, setAddressInput] = useState('Near Masjid Street 4');

  const [running, setRunning] = useState(false);
  const [traceLogs, setTraceLogs] = useState([]);
  const [runOutcome, setRunOutcome] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await discoverManifest(DEFAULT_LOCAL_MANIFEST_URL);
        if (active) {
          setManifestInfo(res);
          setManifestError('');
        }
      } catch (err) {
        if (active) setManifestError(err?.message || 'Could not load manifest');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleDiscoverManifest = async (e) => {
    e?.preventDefault();
    try {
      const res = await discoverManifest(manifestUrlInput);
      setManifestInfo(res);
      setManifestError('');
      if (res.manifest?.agents?.length > 0) {
        setSelectedAgentId(res.manifest.agents[0].id);
      }
      toast.success(`Discovered ${res.manifest?.agents?.length || 0} Open Agent(s)`);
    } catch (err) {
      setManifestError(err?.message || 'Failed to discover manifest');
      toast.error(err?.message || 'Manifest discovery failed');
    }
  };

  const handleCopyManifestUrl = async (targetPath) => {
    const origin =
      targetPath.startsWith('http')
        ? targetPath
        : `${window.location.origin}${targetPath}`;
    try {
      await navigator.clipboard.writeText(origin);
      toast.success(`Copied ${origin}`);
    } catch {
      toast.success(origin);
    }
  };

  const handleProviderSelect = (providerId) => {
    const preset = PROVIDER_PRESETS[providerId] || PROVIDER_PRESETS['storehub-fallback'];
    setLlmConfig((prev) => ({
      ...prev,
      provider: providerId,
      model: preset.defaultModel,
      baseUrl: preset.defaultBaseUrl,
    }));
  };

  const handleSaveLLMConfig = (e) => {
    e.preventDefault();
    const saved = saveLLMConfig(llmConfig);
    setLlmConfig(saved);
    toast.success(`Saved "${PROVIDER_PRESETS[saved.provider]?.label || saved.provider}" in browser sessionStorage`);
  };

  const handleResetLLMConfig = () => {
    const cleared = clearLLMConfig();
    setLlmConfig(cleared);
    toast.success('Reset to zero-config StoreHub Managed Mesh Fallback');
  };

  const buildAgentPayload = (agentId) => {
    if (agentId === 'buyer_catalog_concierge') {
      return {
        query: productQuery.trim() || 'electronics',
        max_price: Number(offerPriceInput) > 0 ? Number(offerPriceInput) * 10 : undefined,
      };
    }
    if (agentId === 'supplyshield_haggle_agent') {
      return {
        product_name: productQuery.trim() || 'Smart Wireless Kit',
        quantity: Math.max(1, Number(quantityInput) || 1),
        target_price: Number(offerPriceInput) > 0 ? Number(offerPriceInput) * 4 : 180,
        category: 'Electronics',
      };
    }
    if (agentId === 'cod_risk_gatekeeper_agent') {
      return {
        phone: phoneInput,
        address: addressInput,
        city: cityInput,
        payment_method: 'cod',
        order_value: Number(offerPriceInput) || 45,
      };
    }
    return {
      product_title: productQuery.trim(),
      city: cityInput.trim() || 'Karachi',
      buyer_offer_price: Number(offerPriceInput) > 0 ? Number(offerPriceInput) : undefined,
      max_discount_pct: 18,
    };
  };

  const handleRunPlayground = async (presetAgentId = null) => {
    const targetAgentId = presetAgentId || selectedAgentId;
    if (presetAgentId) {
      setSelectedAgentId(presetAgentId);
    }
    setRunning(true);
    setTraceLogs([]);
    setRunOutcome(null);
    try {
      const outcome = await executeAgentPipeline({
        manifestUrl: manifestUrlInput || DEFAULT_LOCAL_MANIFEST_URL,
        agentId: targetAgentId,
        payload: buildAgentPayload(targetAgentId),
        llmConfig,
        onTrace: (entry) => setTraceLogs((prev) => [...prev, entry]),
      });
      setRunOutcome(outcome);
      toast.success(`Executed "${targetAgentId}" via ${outcome.executionMode}`);
    } catch (err) {
      toast.error(err?.message || 'Browser agent execution failed');
    } finally {
      setRunning(false);
    }
  };

  const manifest = manifestInfo?.manifest;
  const agents = manifest?.agents || [];

  return (
    <div className={`space-y-4 ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Active Protocol & Provider Status Strip */}
      <div className="rounded-2xl bg-slate-900 text-white p-3.5 flex flex-wrap items-center justify-between gap-2 border border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 text-[11px] font-mono font-bold">
            <GlobeAltIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{manifest?.protocol || 'open-agentic-web/1.0'}</span>
          </span>
          <span className="text-[11px] font-mono text-emerald-300 font-semibold">
            {manifest?.network_id || 'storehub-anti-rto-commerce-mesh'}
          </span>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/25 text-indigo-200 border border-indigo-400/30 text-[11px] font-semibold">
          Engine: {PROVIDER_PRESETS[llmConfig.provider]?.label || llmConfig.provider}
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              activeTab === t.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Cross-Site A2A Playground */}
      {activeTab === 'playground' && (
        <div className="space-y-4">
          <form onSubmit={handleDiscoverManifest} className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="oaw-manifest-url" className="text-xs font-bold uppercase text-slate-700">
                1. Discover Local or External Agent Network URL (`agent-network.json`)
              </label>
              <button
                type="button"
                onClick={() => {
                  setManifestUrlInput(DEFAULT_LOCAL_MANIFEST_URL);
                  setProductQuery('ProBass Wireless Earbuds');
                  setCityInput('Karachi');
                  setOfferPriceInput('39.50');
                  handleRunPlayground('anti_rto_rerouter_agent');
                }}
                disabled={running}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
              >
                🤝 1-Click Anti-RTO Cancelled Deal A2A Demo
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="oaw-manifest-url"
                type="text"
                value={manifestUrlInput}
                onChange={(e) => setManifestUrlInput(e.target.value)}
                placeholder="/.well-known/agent-network.json or https://external-site.com/.well-known/agent-network.json"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Discover Manifest
              </button>
            </div>
            {manifestError && (
              <p className="text-xs text-rose-600 font-semibold">{manifestError}</p>
            )}
          </form>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="oaw-agent-select" className="block text-xs font-bold text-slate-700 mb-1">
                  2. Select Open Agent
                </label>
                <select
                  id="oaw-agent-select"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="oaw-prod-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Product / Search Query
                </label>
                <input
                  id="oaw-prod-input"
                  type="text"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            {selectedAgentId === 'cod_risk_gatekeeper_agent' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Buyer Phone"
                  aria-label="Buyer Phone"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
                <input
                  type="text"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="Street Address"
                  aria-label="Street Address"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="City"
                  aria-label="City"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="Hub City (e.g. Karachi)"
                  aria-label="Hub City"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
                <input
                  type="number"
                  step="0.50"
                  value={offerPriceInput}
                  onChange={(e) => setOfferPriceInput(e.target.value)}
                  placeholder="Target / Offer Price ($)"
                  aria-label="Target or Offer Price"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
                <input
                  type="number"
                  min="1"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  placeholder="Quantity"
                  aria-label="Quantity"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            )}

            <button
              type="button"
              disabled={running}
              onClick={() => handleRunPlayground()}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:brightness-110 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <PlayIcon className="w-4 h-4" aria-hidden="true" />
              <span>{running ? 'Executing Browser Agent Pipeline...' : '▶ Run Browser Agent Pipeline'}</span>
            </button>
          </div>

          {/* Live Browser Telemetry Log */}
          {traceLogs.length > 0 && (
            <div className="rounded-2xl bg-slate-950 text-slate-100 p-4 border border-slate-800 space-y-2">
              <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <CpuChipIcon className="w-4 h-4" aria-hidden="true" />
                <span>Browser Runtime Live Execution Telemetry (`/agent-runtime.js`)</span>
              </p>
              <div className="space-y-1.5 font-mono text-[11px]">
                {traceLogs.map((step, i) => (
                  <div key={`${step.stage}-${i}`} className="flex items-start gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                        step.status === 'warn'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {step.stage}
                    </span>
                    <span className="text-slate-200">{step.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resulting Deal / Output Card */}
          {runOutcome && (
            <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span>Agent Output: {runOutcome.agent?.name}</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-300 text-[10px] font-mono font-bold text-emerald-800">
                  {runOutcome.executionMode}
                </span>
              </div>

              {runOutcome.browserSummary && (
                <p className="text-xs bg-white rounded-xl border border-emerald-200 p-3 text-slate-800">
                  <strong className="text-indigo-700">Browser LLM Summary: </strong>
                  {runOutcome.browserSummary}
                </p>
              )}

              {runOutcome.result?.deal_card && (
                <div className="rounded-xl bg-white border border-emerald-200 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-600">
                      #{runOutcome.result.deal_card.order_number} · 📍 {runOutcome.result.deal_card.hub_city} Hub
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
                      {runOutcome.result.deal_card.discount_pct}% OFF · Saved ${runOutcome.result.deal_card.freight_saved_usd} Freight
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-slate-900">
                    {runOutcome.result.deal_card.product_title}
                  </p>
                  <p className="text-slate-600">
                    Agreed A2A Price:{' '}
                    <strong className="text-emerald-700 text-sm">
                      ${runOutcome.result.deal_card.agreed_price_usd}
                    </strong>{' '}
                    <span className="line-through text-slate-400">
                      ${runOutcome.result.deal_card.original_price_usd}
                    </span>{' '}
                    · {runOutcome.result.deal_card.shipping_policy}
                  </p>
                  {Array.isArray(runOutcome.result.a2a_transcript) && (
                    <div className="space-y-1 pt-1">
                      {runOutcome.result.a2a_transcript.map((m, idx) => (
                        <p key={idx} className="text-[11px] bg-slate-50 rounded-lg px-2.5 py-1.5 text-slate-700">
                          <strong>{m.sender}: </strong>
                          {m.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!runOutcome.result?.deal_card && (
                <pre className="rounded-xl bg-slate-900 text-emerald-200 p-3 text-[11px] font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(runOutcome.result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Manifest Inspector */}
      {activeTab === 'manifest' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                Public Conforming Discovery Endpoints (`CORS: *`)
              </p>
              <p className="text-[11px] font-mono text-slate-600">
                /.well-known/agent-network.json · /agent-network.json · /agent-runtime.js
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleCopyManifestUrl('/.well-known/agent-network.json')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Public Manifest URL</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRawSchema((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
              >
                <CodeBracketIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showRawSchema ? 'Hide JSON Schema' : 'Inspect JSON Schema'}</span>
              </button>
            </div>
          </div>

          {showRawSchema && manifest && (
            <pre className="rounded-2xl bg-slate-950 text-cyan-200 p-4 text-[11px] font-mono overflow-x-auto max-h-80">
              {JSON.stringify(manifest, null, 2)}
            </pre>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents.map((agent) => (
              <div key={agent.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-900">{agent.name}</h3>
                    <p className="text-[11px] font-mono text-indigo-600">{agent.id}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                    {agent.execution_mode}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{agent.description}</p>
                <div className="flex flex-wrap gap-1">
                  {(agent.capabilities || []).map((cap) => (
                    <span key={cap} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">
                      {cap}
                    </span>
                  ))}
                </div>
                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-slate-500">POST {agent.endpoint}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAgentId(agent.id);
                      setActiveTab('playground');
                    }}
                    className="font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Test in Playground →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: LLM & Key Configurator (BYOK + Mozilla Otari) */}
      {activeTab === 'llm' && (
        <form onSubmit={handleSaveLLMConfig} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            <KeyIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Browser-Only Session Key Isolation (Mozilla Otari &amp; BYOK)</p>
              <p className="text-[11px]">
                Any optional BYOK key you enter here stays strictly in browser <code>sessionStorage</code> for direct
                browser-to-LLM calls and is never logged or saved on StoreHub servers. Leave empty to use StoreHub
                Managed Mesh Fallback seamlessly.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.values(PROVIDER_PRESETS).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleProviderSelect(preset.id)}
                className={`text-left rounded-xl border p-3 cursor-pointer transition-all ${
                  llmConfig.provider === preset.id
                    ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                  <span>{preset.label}</span>
                </p>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">Default: {preset.defaultModel}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="oaw-llm-model" className="block text-xs font-bold text-slate-700 mb-1">
                Model Name
              </label>
              <input
                id="oaw-llm-model"
                type="text"
                value={llmConfig.model}
                onChange={(e) => setLlmConfig((prev) => ({ ...prev, model: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>

            <div>
              <label htmlFor="oaw-llm-baseurl" className="block text-xs font-bold text-slate-700 mb-1">
                Endpoint Base URL (Optional)
              </label>
              <input
                id="oaw-llm-baseurl"
                type="text"
                value={llmConfig.baseUrl}
                onChange={(e) => setLlmConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1/chat/completions"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>

            <div>
              <label htmlFor="oaw-llm-key" className="block text-xs font-bold text-slate-700 mb-1">
                Browser BYOK API Key (sessionStorage only)
              </label>
              <input
                id="oaw-llm-key"
                type="password"
                autoComplete="off"
                value={llmConfig.apiKey}
                onChange={(e) => setLlmConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={llmConfig.provider === 'storehub-fallback' ? 'Not required for fallback' : 'Paste browser API key...'}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>
          </div>

          {llmConfig.provider !== 'storehub-fallback' && !llmConfig.apiKey && llmConfig.provider !== 'mozilla-otari' && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-amber-800 font-semibold">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-600" aria-hidden="true" />
              <span>No browser key entered — runtime will gracefully fall back to StoreHub Managed Mesh.</span>
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleResetLLMConfig}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Reset to StoreHub Fallback
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
            >
              Save Browser Config
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
