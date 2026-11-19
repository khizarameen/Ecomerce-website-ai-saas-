import { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowRightIcon,
  BanknotesIcon,
  BoltIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  StarIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import api, { sellerMeshAPI } from '../utils/api';
import NextCustomerDealCopilot from '../features/seller/components/NextCustomerDealCopilot';

const HUMAN_ENGINE = 'seller-human-in-the-loop';

const TABS = [
  { id: 'mesh', emoji: '🛡️', label: '4-Agent Mesh & Approvals' },
  { id: 'deals', emoji: '🤝', label: 'Cancelled Orders & Deal Bot' },
  { id: 'reviews', emoji: '⭐', label: 'Buyer Reviews & AI Fix' },
  { id: 'twins', emoji: '🔬', label: 'Forensic & Hub Twins' },
  { id: 'feed', emoji: '📜', label: 'Activity Feed' },
];

const AGENT_STYLE = {
  cod_risk_gatekeeper_agent: {
    emoji: '🛑',
    gradient: 'from-rose-500 to-orange-500',
  },
  intransit_rto_rerouter_agent: {
    emoji: '🔄',
    gradient: 'from-sky-500 to-indigo-500',
  },
  return_fraud_vision_agent: {
    emoji: '🕵️‍♂️',
    gradient: 'from-violet-500 to-fuchsia-500',
  },
  profit_bleed_auditor_agent: {
    emoji: '⚖️',
    gradient: 'from-amber-500 to-emerald-500',
  },
};

const AGENT_NAMES = {
  cod_risk_gatekeeper_agent: 'COD Risk Gatekeeper',
  intransit_rto_rerouter_agent: 'In-Transit RTO Rerouter',
  return_fraud_vision_agent: 'Return Fraud Vision',
  profit_bleed_auditor_agent: 'Profit Bleed Auditor',
  END: 'Sweep Complete',
  LEDGER_SYNCED: 'Ledger Synced',
};

const ACTION_META = {
  HUB_REROUTE: { emoji: '🔄', label: 'Hub Re-Label & Diversion', cta: 'Approve & Reroute' },
  FRAUD_CLAIM: { emoji: '📸', label: 'Return-Swap Fraud Claim', cta: 'Approve & Submit Claim' },
  COURIER_WEIGHT_DISPUTE: { emoji: '⚖️', label: 'Courier Weight Dispute', cta: 'Approve & File Dispute' },
};

const SCENARIOS = [
  { trigger: 'FAKE_COD_WAVE', emoji: '🛑', label: 'Fake COD Wave' },
  { trigger: 'IN_TRANSIT_RTO_ALERT', emoji: '🔄', label: 'RTO Reroute' },
  { trigger: 'RETURN_FRAUD_INSPECTION', emoji: '📸', label: 'Return Fraud Vision' },
  { trigger: 'COURIER_WEIGHT_BLEED', emoji: '⚖️', label: 'Weight Audit' },
];

const usd = (value) => `$${Number(value || 0).toFixed(2)}`;

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function errorText(err, fallback) {
  return err?.response?.data?.error || err?.response?.data?.detail || fallback;
}

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-rose-50 text-rose-700 ring-rose-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

function CompactKpi({ emoji, label, value, sub, highlight }) {
  return (
    <div
      className={`rounded-2xl p-3.5 ring-1 ${
        highlight
          ? 'bg-gradient-to-br from-emerald-500/30 to-teal-500/10 ring-emerald-300/40'
          : 'bg-white/[0.06] ring-white/10'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
        <span aria-hidden="true">{emoji}</span>
        <span>{label}</span>
      </p>
      <p className={`mt-1 text-xl sm:text-2xl font-extrabold tabular-nums ${highlight ? 'text-emerald-200' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-[11px] text-slate-300 truncate">{sub}</p>
    </div>
  );
}

function ReviewsInsightsTab({ reviewData, applyingId, onApplyFix }) {
  const insights = reviewData?.product_insights || [];
  const reviews = reviewData?.reviews || [];
  const summary = reviewData?.summary || {};

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <div className="xl:col-span-7 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">AI Product Improvements from Buyer Reviews</h3>
          <StatusPill tone="amber">
            Avg {summary.avg_rating || 0}★ · {summary.total_reviews || 0} Reviews
          </StatusPill>
        </div>

        {insights.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
            Add a product first to collect Buyer Reviews &amp; AI optimization tips.
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((ins) => (
              <div key={ins.product_id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{ins.product_name}</h4>
                    <p className="text-xs text-slate-500">
                      Live Price: <strong>{usd(ins.current_price)}</strong> · Stock: {ins.stock_quantity} · Rating:{' '}
                      <strong>{ins.average_rating}★</strong> ({ins.total_reviews} reviews)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(ins.recommended_keywords || []).map((kw) => (
                      <span key={kw} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-xs bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 text-amber-950">
                  <strong>🤖 AI Review Insight:</strong> {ins.recommended_fix}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={applyingId === ins.product_id}
                    onClick={() => onApplyFix(ins, 0)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                  >
                    {applyingId === ins.product_id ? 'Applying...' : '✨ Apply AI Spec Fix to Search Catalog'}
                  </button>
                  <button
                    type="button"
                    disabled={applyingId === ins.product_id}
                    onClick={() => onApplyFix(ins, 5)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                  >
                    ✨ Apply Spec Fix + 5% Confidence Discount
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="xl:col-span-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <StarIcon className="w-4 h-4 text-amber-500" aria-hidden="true" />
          <span>Recent Buyer Reviews ({reviews.length})</span>
        </h3>
        {reviews.length === 0 ? (
          <p className="text-xs text-slate-500">No buyer reviews recorded yet.</p>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {reviews.map((rev) => (
              <div key={rev.id} className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 truncate">{rev.product_name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold shrink-0">
                    {rev.rating} ★
                  </span>
                </div>
                <p className="font-semibold text-indigo-800">{rev.title}</p>
                <p className="text-slate-600 leading-relaxed">{rev.review}</p>
                <p className="text-[11px] text-slate-400">By {rev.user_name}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ForensicTwinsTab({ twin, metrics }) {
  const batch = twin.orders_batch;
  const rto = twin.rto_reroute_data;
  const forensics = twin.return_forensics_data;
  const audit = twin.margin_audit_data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">🛑 COD Gatekeeper</h3>
          {batch && <StatusPill tone="red">{batch.flagged_high_risk} held</StatusPill>}
        </div>
        {!batch?.total_incoming ? (
          <p className="text-xs text-slate-500">Click Fake COD Wave or Full Sweep above to scan orders.</p>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              ✅ {batch.verified_safe} verified · 🛑 {batch.flagged_high_risk} high-risk COD held · Saved{' '}
              <strong>{usd(batch.shipping_fee_saved)}</strong>
            </p>
            <ul className="space-y-1.5">
              {(batch.held_orders || []).map((o) => (
                <li key={o.order_id} className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-900 ring-1 ring-rose-200">
                  <strong>{o.order_id} ({o.city})</strong> · {o.rto_score}% RTO — {o.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">🔄 In-Transit Hub Diversion</h3>
          {rto && <StatusPill tone="sky">{rto.hub_city} Hub</StatusPill>}
        </div>
        {!rto?.stranded_awb ? (
          <p className="text-xs text-slate-500">Click RTO Reroute above to rescue a refused parcel.</p>
        ) : (
          <div className="text-xs space-y-2">
            <p className="text-slate-700">
              Parcel <strong>{rto.stranded_awb}</strong> matched to <strong>{rto.matched_new_order_id}</strong> at{' '}
              {rto.hub_city} Hub.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone="amber">{String(rto.reroute_status).replaceAll('_', ' ')}</StatusPill>
              <StatusPill tone="green">{usd(rto.rto_penalty_saved)} freight saved</StatusPill>
              <StatusPill tone="sky">{usd(rto.sale_rescued)} sale rescued</StatusPill>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">📸 Return Vision Forensics</h3>
          {forensics && <StatusPill tone="violet">{forensics.return_awb}</StatusPill>}
        </div>
        {!forensics?.return_awb ? (
          <p className="text-xs text-slate-500">Click Return Fraud Vision above to compare serials &amp; weight.</p>
        ) : (
          <div className="text-xs space-y-2">
            <p className="text-slate-700">
              Dispatched <strong>{forensics.dispatch_serial}</strong> vs Returned{' '}
              <strong className="text-rose-700">{forensics.returned_serial}</strong> ({forensics.weight_delta_g}g delta)
            </p>
            <p className="rounded-xl bg-rose-600 text-white px-3 py-1.5 font-bold">
              🚨 {forensics.verdict} ({forensics.confidence_pct}%) · Claim {usd(forensics.claim_amount)}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">⚖️ Profit Bleed &amp; Slab Audit</h3>
          <StatusPill tone="amber">Net {metrics.true_net_margin_pct}%</StatusPill>
        </div>
        {!audit?.shipments_audited ? (
          <p className="text-xs text-slate-500">Click Weight Audit above to reconcile courier slabs.</p>
        ) : (
          <div className="text-xs space-y-2 text-slate-700">
            <p>
              {audit.shipments_audited} AWBs billed at <strong>{audit.billed_weight_kg}kg</strong> vs actual{' '}
              <strong>{audit.actual_weight_kg}kg</strong> ={' '}
              <strong className="text-rose-700">{usd(audit.courier_overcharge_detected)} overcharged</strong>.
            </p>
            <p>
              Gross {audit.gross_margin_pct}% · True Net {audit.true_net_margin_pct}% · Projected{' '}
              <strong className="text-emerald-700">{audit.projected_net_margin_pct}%</strong>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function SellerCopilotMesh() {
  const [dashboard, setDashboard] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [activeTab, setActiveTab] = useState('mesh');
  const [loading, setLoading] = useState(true);
  const [runningTrigger, setRunningTrigger] = useState('');
  const [decidingId, setDecidingId] = useState(null);
  const [applyingReviewId, setApplyingReviewId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [banner, setBanner] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [dashRes, revRes] = await Promise.allSettled([
          api.get('/seller-mesh/dashboard/'),
          sellerMeshAPI.getReviewInsights(),
        ]);
        if (active) {
          if (dashRes.status === 'fulfilled') setDashboard(dashRes.value.data);
          else setErrorMsg(errorText(dashRes.reason, 'Could not load Profit-Shield dashboard.'));
          if (revRes.status === 'fulfilled') setReviewData(revRes.value.data);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshAll = async () => {
    try {
      const [dashRes, revRes] = await Promise.allSettled([
        api.get('/seller-mesh/dashboard/'),
        sellerMeshAPI.getReviewInsights(),
      ]);
      if (dashRes.status === 'fulfilled') setDashboard(dashRes.value.data);
      if (revRes.status === 'fulfilled') setReviewData(revRes.value.data);
    } catch {
      // ignore silent refresh error
    }
  };

  const runScenario = async (trigger, label) => {
    setRunningTrigger(trigger);
    setErrorMsg('');
    setBanner('');
    try {
      const res = await api.post('/seller-mesh/trigger/', { trigger_event: trigger });
      setDashboard(res.data);
      if (trigger === 'RESET_BASELINE') {
        setBanner('Baseline restored.');
      } else {
        const names = (res.data.execution_chain || []).map((id) => AGENT_NAMES[id] || id).join(' → ');
        setBanner(`${label}: ${names}`);
      }
    } catch (err) {
      setErrorMsg(errorText(err, `"${label}" failed.`));
    } finally {
      setRunningTrigger('');
    }
  };

  const decide = async (id, decision) => {
    setDecidingId(id);
    setErrorMsg('');
    try {
      const res = await api.post(`/seller-mesh/approvals/${id}/decide/`, { decision });
      setDashboard(res.data);
      const item = res.data?.decided_approval;
      setBanner(
        decision === 'APPROVED'
          ? `Approved: ${item?.title} (+${usd(item?.dollar_impact)})`
          : `Rejected: ${item?.title}`
      );
    } catch (err) {
      setErrorMsg(errorText(err, 'Could not process decision.'));
    } finally {
      setDecidingId(null);
    }
  };

  const handleApplyReviewFix = async (ins, discountPct) => {
    setApplyingReviewId(ins.product_id);
    setErrorMsg('');
    try {
      const res = await sellerMeshAPI.applyReviewFix({
        product_id: ins.product_id,
        custom_description: ins.ai_improved_description,
        discount_pct: discountPct,
      });
      setReviewData(res.data);
      setBanner(res.data?.message || `Updated "${ins.product_name}" from Buyer Reviews!`);
      await refreshAll();
    } catch (err) {
      setErrorMsg(errorText(err, 'Could not apply review fix.'));
    } finally {
      setApplyingReviewId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-950 p-8 text-center text-white">
        <ArrowPathIcon className="mx-auto h-7 w-7 animate-spin text-emerald-400" aria-hidden="true" />
        <p className="mt-2 text-xs font-semibold">Loading Profit-Shield Command Center…</p>
      </div>
    );
  }

  const kpis = dashboard?.kpis || {};
  const metrics = dashboard?.metrics || {};
  const twin = dashboard?.twin || {};
  const logs = dashboard?.agent_logs || [];
  const approvals = dashboard?.pending_approvals || [];
  const agentsMeta = dashboard?.agents_meta || [];
  const pending = approvals.filter((a) => a.status === 'PENDING');
  const latestRunId = logs.find((l) => l.llm_engine !== HUMAN_ENGINE)?.run_id;
  const runLogs = logs.filter((l) => l.run_id === latestRunId && l.llm_engine !== HUMAN_ENGINE).reverse();
  const chain = runLogs.map((l) => l.agent_name);
  const busy = Boolean(runningTrigger);

  return (
    <div className="space-y-4">
      {/* Compact Hero + 4 KPI Strip + Quick Buttons */}
      <section className="rounded-3xl bg-slate-950 text-white p-5 shadow-lg ring-1 ring-white/10 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-emerald-300">
              <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
              <span>Profit-Shield &amp; Anti-RTO Hub · {metrics.sku}</span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight">
              Seller Profit-Shield AI Control Center
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runScenario('FULL_PROFIT_SHIELD_SWEEP', '4-Agent Sweep')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <BoltIcon className="h-4 w-4" aria-hidden="true" />
              <span>{runningTrigger === 'FULL_PROFIT_SHIELD_SWEEP' ? 'Running...' : '🛡️ Full 4-Agent Sweep'}</span>
            </button>
            {SCENARIOS.map((s) => (
              <button
                key={s.trigger}
                type="button"
                disabled={busy}
                onClick={() => runScenario(s.trigger, s.label)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {s.emoji} {s.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => runScenario('RESET_BASELINE', 'Reset')}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
            >
              ↺ Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CompactKpi
            highlight
            emoji="💰"
            label="Money Protected"
            value={usd(kpis.total_money_protected)}
            sub={`+${usd(kpis.pending_recoverable)} pending`}
          />
          <CompactKpi
            emoji="🛑"
            label="Fake COD Held"
            value={`${kpis.fake_cod_blocked || 0} Held`}
            sub={`${usd(kpis.cod_shipping_saved)} saved`}
          />
          <CompactKpi
            emoji="🔄"
            label="RTO Rerouted"
            value={`${kpis.rto_rerouted || 0} Deals`}
            sub={`${usd(kpis.reroute_saved)} saved at hub`}
          />
          <CompactKpi
            emoji="🕵️‍♂️"
            label="Claims & Audits"
            value={usd(kpis.claims_recoverable)}
            sub={`${usd(kpis.claims_recovered)} won`}
          />
        </div>

        {banner && (
          <p role="status" className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-3.5 py-2 text-xs font-semibold text-emerald-100">
            ✓ {banner}
          </p>
        )}
        {errorMsg && (
          <p role="alert" className="rounded-xl bg-rose-500/20 border border-rose-400/30 px-3.5 py-2 text-xs font-semibold text-rose-100">
            ✕ {errorMsg}
          </p>
        )}
      </section>

      {/* Clean Compact Tab Bar Buttons */}
      <nav aria-label="Profit-Shield sections" className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
        {TABS.map((tab) => {
          const isCurrent = activeTab === tab.id;
          let countBadge = '';
          if (tab.id === 'mesh' && pending.length > 0) countBadge = ` (${pending.length})`;
          if (tab.id === 'reviews' && reviewData?.summary?.total_reviews) {
            countBadge = ` (${reviewData.summary.total_reviews})`;
          }
          if (tab.id === 'feed' && logs.length > 0) countBadge = ` (${logs.length})`;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                isCurrent
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span aria-hidden="true">{tab.emoji}</span>
              <span>
                {tab.label}
                {countBadge}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Active Tab Content (Compact Single View) */}
      {activeTab === 'mesh' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {agentsMeta.map((meta) => {
              const style = AGENT_STYLE[meta.id];
              const pos = chain.indexOf(meta.id);
              const log = pos !== -1 ? runLogs[pos] : null;
              return (
                <article
                  key={meta.id}
                  className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${
                    pos !== -1 ? 'ring-2 ring-emerald-500' : 'ring-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${style.gradient} flex items-center justify-center text-base text-white`}>
                      {style.emoji}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {meta.category && <StatusPill tone="sky">{meta.category}</StatusPill>}
                      {pos !== -1 && <StatusPill tone="green">Step {pos + 1}</StatusPill>}
                    </div>
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-slate-900">{meta.name}</h3>
                  <p className="text-[11px] font-semibold text-indigo-700">{meta.role}</p>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                    {log ? log.action : meta.mission}
                  </p>
                  {log && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="font-bold text-emerald-700">+{usd(log.money_impact)}</span>
                      {log.handoff_to && (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                          <ArrowRightIcon className="h-3 w-3" aria-hidden="true" />
                          {AGENT_NAMES[log.handoff_to] || log.handoff_to}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <aside className="xl:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-3 self-start">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <BanknotesIcon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span>1-Click Approval Hub</span>
              </h2>
              <StatusPill tone="amber">{pending.length} pending</StatusPill>
            </div>
            {pending.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No pending approvals. Run Full 4-Agent Sweep above to generate actions.
              </p>
            ) : (
              <div className="space-y-2.5">
                {pending.map((item) => {
                  const meta = ACTION_META[item.action_type] || { emoji: '📝', cta: 'Approve' };
                  return (
                    <div key={item.id} className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-200 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-bold text-slate-900">
                          {meta.emoji} {item.title}
                        </h3>
                        <span className="text-xs font-extrabold text-emerald-700 shrink-0">
                          +{usd(item.dollar_impact)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">{item.description}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={decidingId === item.id}
                          onClick={() => decide(item.id, 'APPROVED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{meta.cta}</span>
                        </button>
                        <button
                          type="button"
                          disabled={decidingId === item.id}
                          onClick={() => decide(item.id, 'REJECTED')}
                          className="px-2.5 py-1.5 rounded-lg bg-white text-slate-700 ring-1 ring-slate-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <XCircleIcon className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      )}

      {activeTab === 'deals' && (
        <NextCustomerDealCopilot refreshKey={metrics.updated_at || ''} onDealClosed={refreshAll} />
      )}

      {activeTab === 'reviews' && (
        <ReviewsInsightsTab
          reviewData={reviewData}
          applyingId={applyingReviewId}
          onApplyFix={handleApplyReviewFix}
        />
      )}

      {activeTab === 'twins' && <ForensicTwinsTab twin={twin} metrics={metrics} />}

      {activeTab === 'feed' && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Agent &amp; Seller Activity Feed</h2>
            <StatusPill>{logs.length} events</StatusPill>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-500">No events yet. Trigger a scenario above.</p>
          ) : (
            <ol className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {logs.map((entry) => (
                <li key={entry.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900">{AGENT_NAMES[entry.agent_name] || entry.agent_name}</span>
                      <StatusPill tone={entry.llm_engine === HUMAN_ENGINE ? 'green' : 'sky'}>
                        {entry.llm_engine === HUMAN_ENGINE ? 'Seller Decision' : 'Automated'}
                      </StatusPill>
                      {entry.money_impact > 0 && <StatusPill tone="green">+{usd(entry.money_impact)}</StatusPill>}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {entry.trigger_event} · {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-slate-700">{entry.action}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
