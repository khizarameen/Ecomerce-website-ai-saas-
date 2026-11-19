import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ShieldAlert,
  Play,
  Square,
  RotateCcw,
  ArrowLeft,
  Radio,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Mic,
  MicOff,
  Flame,
  CloudRainWind,
  Stamp,
  Handshake,
} from 'lucide-react';
import { API_URL, cartAPI, productAPI, sellerMeshAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import AgentMeshGraph from './components/AgentMeshGraph';
import TelemetryFeed from './components/TelemetryFeed';
import EscrowPOCard from './components/EscrowPOCard';
import AgentManifestModal from './components/AgentManifestModal';
import POReceiptModal from './components/POReceiptModal';
import AIRecommendationsSection from './components/AIRecommendationsSection';
import MeshChatPanel from './components/MeshChatPanel';

const API_BASE = API_URL.replace(/\/$/, '');
const DEFAULT_PROMPT = 'Find me the best laptops, headphones, or electronics in stock under $800 and compare them';

const PRESET_PROMPTS = [
  {
    label: '🚚 Supply Chain Hub: Cancelled Orders & Discounts',
    prompt: 'Check cancelled orders and discounted deals available in the Supply Chain Hub',
  },
  {
    label: '💡 Idea & Bundle: YouTube & Coding Setup (< $2,000)',
    prompt: 'Complete YouTube & Coding Setup bundle idea under $2,000',
  },
  {
    label: '🛒 Search: Smartphones & Headphones (< $900)',
    prompt: 'Best Smartphones & Noise-Cancelling Headphones in stock under $900 and compare them',
  },
  {
    label: '🏢 B2B: 100 Office Chairs & 30 Laptops in 3d ($45,000)',
    prompt: 'Urgent: Deliver 100 Ergonomic Office Chairs and 30 Laptops within 3 days. Max budget is $45,000.',
  },
  {
    label: '☀️ Solar Crisis: 40 Solar Inverters & Batteries ($30,000)',
    prompt: 'Urgent: Deliver 40 Hybrid Solar Inverters and Lithium Batteries within 4 days. Max budget is $30,000.',
  },
  {
    label: '🎙️ Bundle Idea: $1,200 Podcast & Video Editing Studio',
    prompt: 'Recommend the best products and complete bundle idea for a podcast and video editing studio under $1,200',
  },
];

const ORCHESTRATOR_MANIFEST = {
  agent_id: 'supplyshield-orchestrator',
  name: 'Universal StoreHub & SupplyShield Orchestrator',
  version: '4.0.0',
  protocol: 'a2a/v1',
  role: 'Universal 6-Node LangGraph StateGraph orchestrating DB search, AI ideas, dynamic supplier routing, risk radar, cargo, A2A haggle-bot, customs-shield, and escrow.',
  endpoint: '/api/stream-order/',
  capabilities: [
    'multilingual_intent_parsing_en_ur',
    'django_catalog_plus_ai_market_search',
    'bundle_and_idea_brainstorming',
    'conditional_supply_chain_rerouting',
    'a2a_price_negotiation_and_customs_clearance',
    'real_time_sse_streaming',
  ],
};

const SupplyShieldDashboard = () => {
  const { isAuthenticated } = useAuth();
  const { fetchCart } = useCart();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [manifests, setManifests] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState('IDLE');
  const [intentType, setIntentType] = useState('');
  const [itemName, setItemName] = useState('');
  const [maxDays, setMaxDays] = useState(3);
  const [maxBudget, setMaxBudget] = useState(null);

  const [crisisConfig, setCrisisConfig] = useState({
    typhoon_active: true,
    strict_customs: false,
    force_haggle: true,
  });

  const [activeNode, setActiveNode] = useState(null);
  const [edgeStatus, setEdgeStatus] = useState({});
  const [excludedSuppliers, setExcludedSuppliers] = useState([]);
  const [supplierCandidates, setSupplierCandidates] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [riskReport, setRiskReport] = useState(null);
  const [logisticsPlan, setLogisticsPlan] = useState(null);
  const [haggleReport, setHaggleReport] = useState(null);
  const [customsReport, setCustomsReport] = useState(null);
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [aiIdeas, setAiIdeas] = useState(null);
  const [matchedProducts, setMatchedProducts] = useState([]);
  const [supplyChainHubDeals, setSupplyChainHubDeals] = useState([]);
  const [claimingHubDealId, setClaimingHubDealId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [streamError, setStreamError] = useState('');
  const [addingProductKey, setAddingProductKey] = useState(null);
  const [modalData, setModalData] = useState({ manifest: null, title: '' });
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isSyncingCart, setIsSyncingCart] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatSessionId] = useState(() => `mesh_${Date.now()}`);

  const eventSourceRef = useRef(null);
  const recognitionRef = useRef(null);
  const initialProductsRef = useRef([]);

  const normalizeOriginalProduct = (p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: Number(p.price || 0),
    category: p.category_name || 'Store Catalog',
    seller_name: p.seller_name || 'Verified Seller',
    stock_quantity: Number(p.stock_quantity ?? 0),
    in_stock: Number(p.stock_quantity ?? 0) > 0,
    status: p.status || 'published',
    rating: Number(p.average_rating || 4.7),
    match_score: 96,
    source: 'Local Store DB',
    why_recommended: `Direct original product from ${p.seller_name || 'Verified Seller'} (${Number(p.stock_quantity ?? 0)} in stock).`,
  });

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [agentsRes, dealsRes, prodRes] = await Promise.allSettled([
          axios.get(`${API_BASE}/agents/`),
          sellerMeshAPI.getBuyerRescueDeals(),
          productAPI.getProducts({ limit: 8 }),
        ]);
        if (agentsRes.status === 'fulfilled' && agentsRes.value.data?.agents) {
          setManifests(agentsRes.value.data.agents);
        }
        if (dealsRes.status === 'fulfilled' && Array.isArray(dealsRes.value.data?.deals)) {
          setSupplyChainHubDeals(dealsRes.value.data.deals.filter((d) => d.status === 'OPEN_FOR_DEAL'));
        }
        if (prodRes.status === 'fulfilled') {
          const rawProducts = prodRes.value.data?.results || prodRes.value.data?.products || [];
          const normalized = Array.isArray(rawProducts) ? rawProducts.map(normalizeOriginalProduct) : [];
          initialProductsRef.current = normalized;
          setMatchedProducts(normalized);
        }
      } catch (err) {
        console.error('Failed to load initial SupplyShield data:', err);
      }
    };
    loadInitial();

    return () => {
      eventSourceRef.current?.close();
      recognitionRef.current?.stop?.();
    };
  }, []);

  const resetMesh = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
    setStatusLabel('IDLE');
    setIntentType('');
    setItemName('');
    setMaxDays(3);
    setMaxBudget(null);
    setActiveNode(null);
    setEdgeStatus({});
    setExcludedSuppliers([]);
    setSupplierCandidates([]);
    setSelectedSupplier(null);
    setRiskReport(null);
    setLogisticsPlan(null);
    setHaggleReport(null);
    setCustomsReport(null);
    setPurchaseOrder(null);
    setAiIdeas(null);
    setMatchedProducts(initialProductsRef.current);
    setLogs([]);
    setStreamError('');
  };

  const executePrompt = (targetPrompt, overrideCrisis = null) => {
    const cleanPrompt = (targetPrompt || prompt).trim() || DEFAULT_PROMPT;
    const cfg = overrideCrisis || crisisConfig;
    setPrompt(cleanPrompt);
    resetMesh();
    setIsStreaming(true);
    setStatusLabel('ROUTING');

    const params = new URLSearchParams({
      prompt: cleanPrompt,
      typhoon: cfg.typhoon_active ? '1' : '0',
      strict_customs: cfg.strict_customs ? '1' : '0',
      force_haggle: cfg.force_haggle ? '1' : '0',
    });
    const url = `${API_BASE}/stream-order/?${params.toString()}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('step', (evt) => {
      const data = JSON.parse(evt.data);
      setActiveNode(data.active_node || null);
      setStatusLabel((data.status || 'routing').toUpperCase());
      if (data.intent_type) setIntentType(data.intent_type);
      if (data.item_name) setItemName(data.item_name);
      if (data.max_days) setMaxDays(data.max_days);
      if (data.max_budget != null) setMaxBudget(data.max_budget);
      setEdgeStatus(data.edge_status || {});
      setExcludedSuppliers(data.excluded_suppliers || []);
      if (Array.isArray(data.supplier_candidates) && data.supplier_candidates.length > 0) {
        setSupplierCandidates(data.supplier_candidates);
      }
      if (data.selected_supplier) setSelectedSupplier(data.selected_supplier);
      if (data.risk_report) setRiskReport(data.risk_report);
      if (data.logistics_plan) setLogisticsPlan(data.logistics_plan);
      if (data.haggle_report) setHaggleReport(data.haggle_report);
      if (data.customs_report) setCustomsReport(data.customs_report);
      if (data.purchase_order) setPurchaseOrder(data.purchase_order);
      if (data.ai_ideas && Object.keys(data.ai_ideas).length > 0) setAiIdeas(data.ai_ideas);
      if (Array.isArray(data.matched_products) && data.matched_products.length > 0) {
        setMatchedProducts(data.matched_products);
      }
      if (Array.isArray(data.supply_chain_hub_deals)) {
        setSupplyChainHubDeals(data.supply_chain_hub_deals);
      }
      if (data.telemetry_event) {
        setLogs((prev) => [...prev, data.telemetry_event]);
      }
    });

    es.addEventListener('complete', (evt) => {
      const data = JSON.parse(evt.data);
      setStatusLabel((data.status || 'approved').toUpperCase());
      if (data.haggle_report) setHaggleReport(data.haggle_report);
      if (data.customs_report) setCustomsReport(data.customs_report);
      if (data.purchase_order) setPurchaseOrder(data.purchase_order);
      if (data.edge_status) setEdgeStatus(data.edge_status);
      if (data.excluded_suppliers) setExcludedSuppliers(data.excluded_suppliers);
      if (Array.isArray(data.supplier_candidates) && data.supplier_candidates.length > 0) {
        setSupplierCandidates(data.supplier_candidates);
      }
      if (data.ai_ideas && Object.keys(data.ai_ideas).length > 0) setAiIdeas(data.ai_ideas);
      if (Array.isArray(data.matched_products) && data.matched_products.length > 0) {
        setMatchedProducts(data.matched_products);
      }
      if (Array.isArray(data.supply_chain_hub_deals)) {
        setSupplyChainHubDeals(data.supply_chain_hub_deals);
      }
      setIsStreaming(false);
      es.close();
    });

    es.addEventListener('error', () => {
      setStreamError('Live SSE connection closed or backend server is unreachable.');
      setIsStreaming(false);
      setStatusLabel('ERROR');
      es.close();
    });
  };

  const toggleCrisisFlag = (key) => {
    const nextConfig = { ...crisisConfig, [key]: !crisisConfig[key] };
    setCrisisConfig(nextConfig);
    if (statusLabel !== 'IDLE' || logs.length > 0) {
      toast.success('Chaos trigger updated — re-routing 6-Node Mesh!');
      executePrompt(prompt, nextConfig);
    }
  };

  const handleToggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice input requires Chrome or Edge SpeechRecognition support.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      toast('Listening... Speak your query clearly', { icon: '🎙️' });
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        setPrompt(transcript);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Microphone capture interrupted.');
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSyncBundleToCart = async () => {
    if (!purchaseOrder) return;
    setIsSyncingCart(true);
    try {
      const localItems = matchedProducts.filter((p) => p?.source === 'Local Store DB' && p?.id).slice(0, 3);
      let addedCount = 0;

      if (isAuthenticated && localItems.length > 0) {
        for (const prod of localItems) {
          try {
            const res = await cartAPI.addToCart({ product_id: prod.id, quantity: 1 });
            if (res.data?.success) addedCount += 1;
          } catch {
            // Skip individual item errors and continue bundle sync
          }
        }
        await fetchCart();
      }

      localStorage.setItem(
        'supplyshield_negotiated_po',
        JSON.stringify({
          po_number: purchaseOrder.po_number,
          po_hash: purchaseOrder.po_hash,
          item_name: purchaseOrder.item_name,
          quantity: purchaseOrder.quantity,
          total_landed_cost_usd: purchaseOrder.total_landed_cost_usd,
          haggle_rebate_pct: purchaseOrder.haggle_rebate_pct,
          haggle_discount_usd: purchaseOrder.haggle_discount_usd,
          hs_code: purchaseOrder.hs_code,
          synced_at: new Date().toISOString(),
        })
      );

      toast.success(
        addedCount > 0
          ? `Synced ${addedCount} item(s) to StoreHub Cart at Negotiated Mesh Price!`
          : 'Synced to StoreHub Cart at Negotiated Mesh Price!'
      );
    } finally {
      setIsSyncingCart(false);
    }
  };

  const handleStartStream = (e) => {
    e?.preventDefault();
    executePrompt(prompt);
  };

  const handleStopStream = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
    setStatusLabel('STOPPED');
  };

  const handleAddToCart = async (product, cardKey) => {
    if (!isAuthenticated) {
      toast.error('Please login to add local store items to your StoreHub cart');
      navigate('/login');
      return;
    }
    setAddingProductKey(cardKey);
    try {
      const res = await cartAPI.addToCart({ product_id: product.id, quantity: 1 });
      if (res.data?.success) {
        toast.success(`Added "${product.name}" to StoreHub cart!`);
        await fetchCart();
      } else {
        toast.error(res.data?.error || 'Could not add item to cart');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add to cart');
    } finally {
      setAddingProductKey(null);
    }
  };

  const handleProcureViaMesh = (product) => {
    const budgetEstimate = Math.max(Math.round(Number(product.price || 200) * 1.3 + 80), 100);
    const dynamicPrompt = `Urgent: Deliver 1 ${product.name} within 3 days. Max budget is $${budgetEstimate.toLocaleString()}.`;
    executePrompt(dynamicPrompt);
  };

  const handleClaimHubDeal = async (dealId) => {
    if (!isAuthenticated) {
      toast.error('Please login as a Buyer to claim this discounted Supply Chain Hub deal.');
      navigate('/login');
      return;
    }
    setClaimingHubDealId(dealId);
    try {
      const res = await sellerMeshAPI.actOnBuyerRescueDeal(dealId, {
        option_type: 'CLAIM_DISCOUNT_DEAL',
      });
      toast.success(res.data?.message || 'Supply Chain Hub discounted deal claimed!');
      setSupplyChainHubDeals((res.data?.deals || []).filter((d) => d.status === 'OPEN_FOR_DEAL'));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not claim discounted deal');
    } finally {
      setClaimingHubDealId(null);
    }
  };

  const handleNodeSelect = (nodeData) => {
    const manifestId = nodeData?.manifestId;
    if (manifestId === 'orchestrator') {
      setModalData({ manifest: ORCHESTRATOR_MANIFEST, title: nodeData.title });
      return;
    }
    const found = manifests.find((m) => m.agent_id === manifestId);
    if (found) {
      setModalData({ manifest: found, title: nodeData.title });
    }
  };

  const openManifestById = (agentId) => {
    const found = manifests.find((m) => m.agent_id === agentId);
    if (found) {
      setModalData({ manifest: found, title: found.name });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Control Header */}
      <header className="border-b border-slate-800/90 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)]">
              <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
                  SupplyShield Universal Hub
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  AI Search + Idea + Mesh
                </span>
                {intentType && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/50">
                    MODE: {intentType}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Universal Product Search, Bundle Consultant &amp; Autonomous Supply Chain Router
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                statusLabel === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60'
                  : statusLabel === 'REROUTING'
                  ? 'bg-red-500/20 text-red-200 border-red-400/60'
                  : isStreaming
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60'
                  : 'bg-slate-900 text-slate-300 border-slate-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isStreaming ? 'animate-pulse' : ''}`} aria-hidden="true" />
              STATUS: {statusLabel}
            </span>

            <Link
              to="/home"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to StoreHub
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Universal Prompt Console & Presets */}
        <section
          aria-label="Universal AI Product and Supply Chain Prompt Bar"
          className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5 shadow-xl"
        >
          <form onSubmit={handleStartStream} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="universal-mesh-prompt"
                className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-semibold flex items-center gap-1.5"
              >
                <Cpu className="w-4 h-4" aria-hidden="true" />
                Ask Anything (Product Search, Setup Idea, or Urgent Procurement)
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {manifests.map((m) => (
                  <button
                    key={m.agent_id}
                    type="button"
                    onClick={() => openManifestById(m.agent_id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                  >
                    <FileCode2 className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                    {m.agent_id}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1 flex items-center">
                <input
                  id="universal-mesh-prompt"
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 pl-4 pr-12 py-3 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  placeholder="Type or speak any product search, bundle goal, or procurement query..."
                />
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  aria-pressed={isListening}
                  aria-label="Speak query"
                  title="Voice Command"
                  className={`absolute right-2 p-2 rounded-lg border transition-colors ${
                    isListening
                      ? 'bg-red-500/25 border-red-400 text-red-300 animate-pulse'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-cyan-300'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Mic className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isStreaming ? (
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-colors shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                  >
                    <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                    Run Universal Agents
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopStream}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors"
                  >
                    <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                    Stop Stream
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetMesh}
                  aria-label="Reset mesh simulation"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>

            {/* 1-Click Diverse Preset Chips */}
            <div className="flex flex-wrap gap-2 pt-1">
              {PRESET_PROMPTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => executePrompt(preset.prompt)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-cyan-500/40 transition-colors disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {streamError && (
              <div
                role="alert"
                className="flex items-center gap-2 text-xs font-mono text-red-200 bg-red-950/60 border border-red-500/50 rounded-lg px-3 py-2"
              >
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
                <span>{streamError}</span>
              </div>
            )}
          </form>
        </section>

        {/* AI Ideas & Smart Product Recommendations */}
        <AIRecommendationsSection
          aiIdeas={aiIdeas}
          matchedProducts={matchedProducts}
          supplyChainHubDeals={supplyChainHubDeals}
          onClaimHubDeal={handleClaimHubDeal}
          claimingHubDealId={claimingHubDealId}
          onAddToCart={handleAddToCart}
          onProcureViaMesh={handleProcureViaMesh}
          addingProductKey={addingProductKey}
        />

        {/* Interactive Dynamic React Flow 6-Node Agent Mesh + Chaos Simulator */}
        <section aria-label="Dynamic Agent Mesh Topology" className="space-y-3">
          {/* Feature A: Chaos Engineering / Crisis Simulator Toggle Bar */}
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                Chaos Engineering / Crisis Simulator
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={crisisConfig.typhoon_active}
                onClick={() => toggleCrisisFlag('typhoon_active')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-colors ${
                  crisisConfig.typhoon_active
                    ? 'bg-red-500/20 text-red-200 border-red-400/70 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                <CloudRainWind className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  &#127786;&#65039; Typhoon on Primary Route ({crisisConfig.typhoon_active ? 'Active' : 'Off'})
                </span>
              </button>

              <button
                type="button"
                aria-pressed={crisisConfig.strict_customs}
                onClick={() => toggleCrisisFlag('strict_customs')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-colors ${
                  crisisConfig.strict_customs
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/70 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                <Stamp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  &#128707; Strict Customs Inspection ({crisisConfig.strict_customs ? 'Active' : 'Standard'})
                </span>
              </button>

              <button
                type="button"
                aria-pressed={crisisConfig.force_haggle}
                onClick={() => toggleCrisisFlag('force_haggle')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-colors ${
                  crisisConfig.force_haggle
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                <Handshake className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  &#129309; Force Aggressive Price Haggle (-12% Target)
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-mono uppercase tracking-wider text-slate-300 font-bold">
              Dynamic 6-Node Supply &amp; Search Mesh (Click any node for agent.json)
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <span className="inline-flex items-center gap-1.5 text-cyan-300">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" aria-hidden="true" /> Active Hop
              </span>
              <span className="inline-flex items-center gap-1.5 text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" /> Risk / Rerouted
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" /> Verified Route
              </span>
            </div>
          </div>

          <AgentMeshGraph
            activeNode={activeNode}
            edgeStatus={edgeStatus}
            excludedSuppliers={excludedSuppliers}
            supplierCandidates={supplierCandidates}
            selectedSupplier={selectedSupplier}
            riskReport={riskReport}
            logisticsPlan={logisticsPlan}
            haggleReport={haggleReport}
            customsReport={customsReport}
            purchaseOrder={purchaseOrder}
            itemName={itemName}
            maxDays={maxDays}
            maxBudget={maxBudget}
            onNodeSelect={handleNodeSelect}
          />
        </section>

        {/* Telemetry Feed + Escrow PO Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <TelemetryFeed logs={logs} isStreaming={isStreaming} />
          </div>
          <div className="lg:col-span-5">
            <EscrowPOCard
              purchaseOrder={purchaseOrder}
              onOpenReceipt={() => setIsReceiptOpen(true)}
              onSyncCart={handleSyncBundleToCart}
              isSyncingCart={isSyncingCart}
            />
          </div>
        </div>

        {/* Conversational Follow-up Chat */}
        <MeshChatPanel
          sessionId={chatSessionId}
          contextProducts={matchedProducts}
          onProductsDiscovered={(newProducts) => {
            if (Array.isArray(newProducts) && newProducts.length > 0) {
              setMatchedProducts(newProducts);
            }
          }}
          onHubDealsDiscovered={(newDeals) => {
            if (Array.isArray(newDeals)) {
              setSupplyChainHubDeals(newDeals);
            }
          }}
        />
      </main>

      <AgentManifestModal
        manifest={modalData.manifest}
        nodeTitle={modalData.title}
        onClose={() => setModalData({ manifest: null, title: '' })}
      />

      <POReceiptModal
        isOpen={isReceiptOpen}
        purchaseOrder={purchaseOrder}
        onClose={() => setIsReceiptOpen(false)}
      />
    </div>
  );
};

export default SupplyShieldDashboard;
