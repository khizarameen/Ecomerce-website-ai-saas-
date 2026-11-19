import { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { sellerMeshAPI } from '../../../utils/api';

const DISCOUNT_PRESETS = [5, 10, 15, 20];

const SHIPPING_POLICIES = [
  'Free Same-City Hub Delivery',
  'Free Priority 24h Courier',
  '50% Split Shipping Discount',
  'Warehouse Direct Dispatch',
];

const CHATBOT_QUICK_PROMPTS = [
  '📸 Check buyer uploaded photo — is this the original product?',
  '📉 How much discount should I offer while protecting my profit margin?',
  '🚚 What should I do with the cancelled parcel shipping? (Hold at Hub vs Recall)',
  '✏️ Should I publish an edited discount deal or recall to warehouse backup?',
];

const usd = (val) => `$${Number(val || 0).toFixed(2)}`;

export default function NextCustomerDealCopilot({
  onDealClosed,
  refreshKey = '',
  collapsible = false,
  defaultExpanded = true,
}) {
  const [recoveries, setRecoveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!collapsible || defaultExpanded);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('cand-1');
  const [customPrice, setCustomPrice] = useState('');
  const [sellerNote, setSellerNote] = useState('');
  const [chatQuestion, setChatQuestion] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [shippingPolicy, setShippingPolicy] = useState(SHIPPING_POLICIES[0]);
  const [offerNote, setOfferNote] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await sellerMeshAPI.getRecoveries();
        const list = res.data?.recoveries || [];
        if (active) {
          setRecoveries(list);
          setSelectedId((prev) =>
            prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null
          );
        }
      } catch {
        if (active) toast.error('Could not load cancelled order recoveries');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const activeRecovery = recoveries.find((r) => r.id === selectedId) || recoveries[0] || null;
  const candidates = activeRecovery?.candidate_buyers || [];
  const activeCandidate =
    candidates.find((c) => c.id === selectedCandidateId) || candidates[0] || null;

  const effectiveOfferPrice =
    customPrice !== '' && Number(customPrice) > 0
      ? Number(customPrice)
      : Number(activeCandidate?.suggested_total_price || activeRecovery?.ai_recommended_deal_price || 0);

  const handleSelectRecovery = (item) => {
    setSelectedId(item.id);
    setSelectedCandidateId(item.candidate_buyers?.[0]?.id || 'cand-1');
    setCustomPrice('');
    setSellerNote('');
    setEditedTitle(item.seller_edited_title || item.product_title || '');
    setShippingPolicy(item.shipping_policy || SHIPPING_POLICIES[0]);
    setOfferNote(item.seller_offer_note || '');
  };

  const handleSelectCandidate = (cand) => {
    setSelectedCandidateId(cand.id);
    setCustomPrice(String(Number(cand.suggested_total_price || 0).toFixed(2)));
  };

  const handleApplyDiscount = (pct) => {
    if (!activeRecovery) return;
    const discounted = Number(activeRecovery.original_price || 0) * (1 - pct / 100);
    setCustomPrice(discounted.toFixed(2));
  };

  const handleSimulateCancel = async () => {
    setBusyAction('simulate');
    try {
      const res = await sellerMeshAPI.simulateRecovery();
      const list = res.data?.recoveries || [];
      setRecoveries(list);
      if (res.data?.created?.id) {
        setSelectedId(res.data.created.id);
        setSelectedCandidateId(res.data.created.candidate_buyers?.[0]?.id || 'cand-1');
      }
      setCustomPrice('');
      toast.success('Simulated buyer product cancellation queued for Next-Customer deal!');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not simulate cancellation');
    } finally {
      setBusyAction('');
    }
  };

  const handleNegotiate = async () => {
    if (!activeRecovery || !activeCandidate) return;
    setBusyAction('negotiate');
    try {
      const res = await sellerMeshAPI.negotiateRecovery(activeRecovery.id, {
        candidate_id: activeCandidate.id,
        custom_price: effectiveOfferPrice,
        seller_message: sellerNote,
      });
      setRecoveries(res.data?.recoveries || []);
      setSellerNote('');
      toast.success(`AI Pitch sent & ${activeCandidate.name} replied!`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Negotiation failed');
    } finally {
      setBusyAction('');
    }
  };

  const handleCloseDeal = async () => {
    if (!activeRecovery || !activeCandidate) return;
    setBusyAction('close');
    try {
      const res = await sellerMeshAPI.closeRecoveryDeal(activeRecovery.id, {
        candidate_id: activeCandidate.id,
        final_price: effectiveOfferPrice,
      });
      const updatedList = res.data?.recoveries || [];
      setRecoveries(updatedList);
      const closed = res.data?.recovery;
      toast.success(
        `Deal Locked! Confirmed Order #${closed?.reassigned_order_number} assigned to ${activeCandidate.name}`
      );
      if (typeof onDealClosed === 'function') {
        onDealClosed(res.data);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not lock deal');
    } finally {
      setBusyAction('');
    }
  };

  const handleAskChatbot = async (questionOverride) => {
    if (!activeRecovery) return;
    const question = (questionOverride ?? chatQuestion).trim();
    if (!question) return;
    setBusyAction('chatbot');
    try {
      const res = await sellerMeshAPI.askRecoveryChatbot(activeRecovery.id, { question });
      setRecoveries(res.data?.recoveries || []);
      if (!questionOverride) setChatQuestion('');
      toast.success('Profit-Shield Advisor answered your query!');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Chatbot request failed');
    } finally {
      setBusyAction('');
    }
  };

  const handleVerifyPhoto = async (photoFile = null) => {
    if (!activeRecovery) return;
    setBusyAction('verify_photo');
    try {
      let payload = {};
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        payload = fd;
      }
      const res = await sellerMeshAPI.verifyRecoveryPhoto(activeRecovery.id, payload);
      setRecoveries(res.data?.recoveries || []);
      const verifiedRec = res.data?.recovery;
      const verdict = verifiedRec?.photo_verification_status || 'CHECKED';
      const conf = verifiedRec?.photo_verification_result?.confidence_score ?? '';
      toast.success(`AI Vision Verification: ${verdict}${conf ? ` (${conf}%)` : ''}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Photo verification failed');
    } finally {
      setBusyAction('');
    }
  };

  const handleSellerOption = async (optionType) => {
    if (!activeRecovery) return;
    setBusyAction(optionType);
    try {
      const res = await sellerMeshAPI.applySellerOption(activeRecovery.id, {
        option_type: optionType,
        edited_title: editedTitle || activeRecovery.seller_edited_title || activeRecovery.product_title,
        custom_price: effectiveOfferPrice,
        shipping_policy: shippingPolicy,
        offer_note: offerNote,
      });
      setRecoveries(res.data?.recoveries || []);
      toast.success(
        optionType === 'RETURN_TO_BACKUP'
          ? 'Item recalled to Warehouse Backup stock!'
          : 'Edited & discounted deal published to Buyers!'
      );
      if (typeof onDealClosed === 'function') {
        onDealClosed(res.data);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not apply seller option');
    } finally {
      setBusyAction('');
    }
  };

  const openCount = recoveries.filter((r) => r.status === 'OPEN_FOR_DEAL').length;
  const closedRecoveries = recoveries.filter((r) => r.status === 'DEAL_CLOSED');
  const totalRescuedRevenue = closedRecoveries.reduce(
    (sum, r) => sum + Number(r.final_deal_price || 0) + Number(r.shipping_fee_at_risk || 0),
    0
  );

  if (loading) {
    return (
      <div className="rounded-3xl bg-slate-900 p-6 text-white flex items-center gap-3">
        <ArrowPathIcon className="w-5 h-5 animate-spin text-emerald-400" aria-hidden="true" />
        <span className="text-sm font-semibold">Loading Cancelled Orders &amp; AI Next-Customer Deal Copilot...</span>
      </div>
    );
  }

  if (collapsible && !expanded) {
    return (
      <section
        aria-labelledby="next-customer-desk-heading"
        className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30">
              🚨 {openCount} Cancelled Ready for Deal
            </span>
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              🤝 {closedRecoveries.length} Closed · {usd(totalRescuedRevenue)} Rescued
            </span>
          </div>
          <h2 id="next-customer-desk-heading" className="text-base sm:text-lg font-extrabold flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-emerald-300 shrink-0" aria-hidden="true" />
            <span>Cancelled-Order &amp; Next-Customer Deal Desk</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={async () => {
              await handleSimulateCancel();
              setExpanded(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
          >
            Simulate Cancel
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(true)}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold cursor-pointer shadow"
          >
            🤝 Open Deal Desk ({recoveries.length})
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-customer-desk-heading"
      className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden"
    >
      {/* Top Dark Command Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {collapsible && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded(false)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  Minimize Panel ▲
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30">
                <span>🚨 {openCount} Cancelled Ready for Re-Deal</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                <span>🤝 {closedRecoveries.length} Deals Closed · {usd(totalRescuedRevenue)} Rescued</span>
              </span>
            </div>
            <h2 id="next-customer-desk-heading" className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <SparklesIcon className="w-6 h-6 text-emerald-300 shrink-0" aria-hidden="true" />
              <span>AI Next-Customer Deal Recovery Copilot</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Whenever a buyer cancels an order or product, AI automatically ranks the top ready replacement buyers,
              crafts a targeted discount pitch, and creates a Confirmed Order in 1 click.
            </p>
          </div>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={handleSimulateCancel}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:brightness-110 text-white text-xs font-extrabold inline-flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-60 transition-all"
          >
            {busyAction === 'simulate' ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <BoltIcon className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Simulate Buyer Product Cancel</span>
          </button>
        </div>
      </div>

      {/* Body Split: Cancelled Queue (Left) + AI Next-Customer Deal Room (Right) */}
      <div className="p-5 sm:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Queue */}
        <div className="xl:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cancelled Orders Queue ({recoveries.length})
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">Auto-synced from Buyer cancels</span>
          </div>

          {recoveries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
              No cancelled orders for your store products yet. When a buyer cancels an order containing your product, it
              will automatically appear here for AI Next-Customer recovery (or click{' '}
              <strong>Simulate Buyer Product Cancel</strong> above to test).
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
              {recoveries.map((item) => {
                const isSelected = activeRecovery?.id === item.id;
                const isClosed = item.status === 'DEAL_CLOSED';
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectRecovery(item)}
                    className={`w-full text-left rounded-2xl p-4 border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-200'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono font-bold text-slate-500">
                          #{item.order_number} · {item.origin_city}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 truncate mt-0.5">{item.product_title}</h4>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          isClosed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {isClosed ? 'DEAL CLOSED' : 'OPEN DEAL'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">
                      Cancelled by <strong>{item.cancelled_by_buyer}</strong> · {item.cancel_reason}
                    </p>

                    {item.has_cancel_photo && (
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.photo_verification_status === 'MATCHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.photo_verification_status === 'MISMATCH'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.photo_verification_status === 'MATCHED'
                            ? '✅ Photo Match'
                            : item.photo_verification_status === 'MISMATCH'
                            ? '🚨 Photo Mismatch'
                            : '⚠️ Check Photo'}
                          {item.photo_verification_result?.confidence_score !== undefined
                            ? ` (${item.photo_verification_result.confidence_score}%)`
                            : ''}
                        </span>
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">
                        Original: {usd(item.original_price)} (Qty {item.quantity})
                      </span>
                      <span className="font-bold text-emerald-700">
                        {isClosed
                          ? `Sold: ${usd(item.final_deal_price)}`
                          : `AI Target: ${usd(item.ai_recommended_deal_price)}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Deal Room */}
        <div className="xl:col-span-8">
          {!activeRecovery ? (
            <div className="h-full rounded-2xl border border-dashed border-slate-300 p-8 flex items-center justify-center text-xs text-slate-500">
              Select a cancelled order on the left to negotiate with the Next Customer.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Cancellation Brief + AI Strategy */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                      {activeRecovery.cancel_stage === 'IN_TRANSIT' ? '🚚 In-Transit Refusal' : '🕒 Pre-Dispatch Cancel'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                      {usd(activeRecovery.shipping_fee_at_risk)} Freight at Risk
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      Hub City: <strong>{activeRecovery.origin_city}</strong>
                    </span>
                  </div>
                  {activeRecovery.reassigned_order_number && (
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-600 text-white">
                      ✓ Reassigned to Order #{activeRecovery.reassigned_order_number}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  <strong>🤖 AI Copilot Strategy:</strong> {activeRecovery.ai_strategy_summary}
                </p>
              </div>

              {/* AI Vision Verification: Buyer Cancel Photo vs Seller Original Product */}
              {(() => {
                const vStatus = activeRecovery.photo_verification_status || 'NOT_PROVIDED';
                const vResult = activeRecovery.photo_verification_result || {};
                const bannerClass =
                  vStatus === 'MATCHED'
                    ? 'border-emerald-300 bg-emerald-50/70'
                    : vStatus === 'MISMATCH'
                    ? 'border-rose-300 bg-rose-50/70'
                    : vStatus === 'SUSPICIOUS'
                    ? 'border-amber-300 bg-amber-50/70'
                    : 'border-slate-200 bg-slate-50/70';
                const badgeClass =
                  vStatus === 'MATCHED'
                    ? 'bg-emerald-600 text-white'
                    : vStatus === 'MISMATCH'
                    ? 'bg-rose-600 text-white'
                    : vStatus === 'SUSPICIOUS'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-600 text-white';
                const verdictLabel =
                  vStatus === 'MATCHED'
                    ? '✅ Verified Same Original Product'
                    : vStatus === 'MISMATCH'
                    ? '🚨 Product Mismatch / Switch Alert'
                    : vStatus === 'SUSPICIOUS'
                    ? '⚠️ Needs Manual Seller Review'
                    : '📷 No Cancel Photo Uploaded Yet';

                return (
                  <div className={`rounded-2xl border p-4 space-y-3 ${bannerClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${badgeClass}`}>
                          {verdictLabel}
                        </span>
                        {vResult.confidence_score !== undefined && vStatus !== 'NOT_PROVIDED' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 text-slate-800 border border-slate-200">
                            {vResult.confidence_score}% Confidence
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {activeRecovery.buyer_cancel_photo_url && (
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => handleVerifyPhoto(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            {busyAction === 'verify_photo' ? 'Verifying...' : '🔍 Re-Verify Photo with AI'}
                          </button>
                        )}
                        <label className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold cursor-pointer">
                          <span>📸 Upload Photo to AI Check</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={Boolean(busyAction)}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) handleVerifyPhoto(file);
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-3">
                        {activeRecovery.original_image_url ? (
                          <button
                            type="button"
                            onClick={() => setZoomPhotoUrl(activeRecovery.original_image_url)}
                            className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0 cursor-pointer"
                            title="Click to enlarge Seller Original Product photo"
                          >
                            <img
                              src={activeRecovery.original_image_url}
                              alt={activeRecovery.original_product_name || activeRecovery.product_title}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl shrink-0">
                            📦
                          </div>
                        )}
                        <div className="min-w-0 text-xs">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Seller Original Listing
                          </p>
                          <p className="font-bold text-slate-900 truncate">
                            {activeRecovery.original_product_name || activeRecovery.product_title}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            Store Price: {usd(activeRecovery.original_store_price ?? activeRecovery.original_price)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-3">
                        {activeRecovery.buyer_cancel_photo_url ? (
                          <button
                            type="button"
                            onClick={() => setZoomPhotoUrl(activeRecovery.buyer_cancel_photo_url)}
                            className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0 cursor-pointer"
                            title="Click to enlarge Buyer Uploaded Cancel photo"
                          >
                            <img
                              src={activeRecovery.buyer_cancel_photo_url}
                              alt="Buyer uploaded cancel verification"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 shrink-0 text-center px-1">
                            No Photo
                          </div>
                        )}
                        <div className="min-w-0 text-xs">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Buyer Uploaded Cancel Photo
                          </p>
                          <p className="font-bold text-slate-900 truncate">
                            {vResult.detected_item ||
                              (activeRecovery.buyer_cancel_photo_url
                                ? 'Uploaded by buyer during cancel'
                                : 'Buyer did not attach a photo')}
                          </p>
                          <p className="text-[11px] text-slate-600 line-clamp-2">
                            {vResult.condition_assessment ||
                              'You can upload a parcel inspection photo above anytime for AI checking.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {vStatus !== 'NOT_PROVIDED' && (
                      <div className="rounded-xl bg-white/90 border border-slate-200 p-3 space-y-1.5 text-xs text-slate-700">
                        {(vResult.summary || vResult.roman_urdu_summary) && (
                          <p className="font-semibold text-slate-900">
                            🛡️ {vResult.summary || vResult.roman_urdu_summary}
                          </p>
                        )}
                        {vResult.visual_comparison && (
                          <p>
                            <strong>Visual Comparison:</strong> {vResult.visual_comparison}
                          </p>
                        )}
                        {vResult.seller_recommendation && (
                          <p className="text-indigo-900 font-medium">
                            <strong>AI Advice:</strong> {vResult.seller_recommendation}
                          </p>
                        )}
                        {Array.isArray(vResult.red_flags) && vResult.red_flags.length > 0 && (
                          <ul className="list-disc pl-5 text-rose-700 font-semibold space-y-0.5">
                            {vResult.red_flags.map((flag, i) => (
                              <li key={i}>{flag}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 3 AI-Ranked Next Customer Candidates */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <UserGroupIcon className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                    <span>Top 3 Next Customer Matches</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">Click any buyer to customize their deal</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {candidates.map((cand) => {
                    const isPicked = activeCandidate?.id === cand.id;
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        aria-pressed={isPicked}
                        disabled={activeRecovery.status === 'DEAL_CLOSED'}
                        onClick={() => handleSelectCandidate(cand)}
                        className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer disabled:cursor-default ${
                          isPicked
                            ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-200'
                            : 'border-slate-200 bg-white hover:border-indigo-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-600 text-white">
                            {cand.match_score}% Match
                          </span>
                          <span className="text-[11px] font-bold text-emerald-700">
                            Save {usd(cand.shipping_saved)}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-2">{cand.name}</h4>
                        <p className="text-[11px] font-medium text-indigo-700">{cand.city} · {cand.intent_badge}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{cand.payment_preference}</p>
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs font-extrabold text-emerald-800">
                            {usd(cand.suggested_total_price)}
                          </span>
                          <span className="text-[11px] font-bold text-amber-700">
                            {cand.discount_pct}% Off
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deal Controls & AI Negotiation Chat */}
              {activeRecovery.status === 'OPEN_FOR_DEAL' && activeCandidate && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                        Customize Deal Price for {activeCandidate.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {DISCOUNT_PRESETS.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => handleApplyDiscount(pct)}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold cursor-pointer"
                          >
                            -{pct}% Off
                          </button>
                        ))}
                        <div className="flex items-center gap-1.5 ml-1">
                          <label htmlFor="deal-price-input" className="text-xs font-semibold text-slate-700">
                            Offer $:
                          </label>
                          <input
                            id="deal-price-input"
                            type="number"
                            min="1"
                            step="0.50"
                            value={customPrice !== '' ? customPrice : Number(effectiveOfferPrice).toFixed(2)}
                            onChange={(e) => setCustomPrice(e.target.value)}
                            className="w-24 px-2.5 py-1 rounded-lg border border-indigo-300 bg-white text-xs font-bold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={handleCloseDeal}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white text-xs font-extrabold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-60"
                    >
                      {busyAction === 'close' ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckBadgeIcon className="w-4 h-4" aria-hidden="true" />
                      )}
                      <span>Lock Deal ({usd(effectiveOfferPrice)}) &amp; Assign Order</span>
                    </button>
                  </div>

                  {/* AI Pitch & Live Negotiation Bar */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={sellerNote}
                      onChange={(e) => setSellerNote(e.target.value)}
                      placeholder={`Add bonus perk or custom note for ${activeCandidate.name} (e.g., Free Priority Express + Quality Seal)...`}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={handleNegotiate}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {busyAction === 'negotiate' ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <PaperAirplaneIcon className="w-4 h-4" aria-hidden="true" />
                      )}
                      <span>AI Pitch &amp; Test Buyer Reply</span>
                    </button>
                  </div>

                  {/* Seller 2 Options: Edit/Discount for Buyers vs Wapsi Backup */}
                  <div className="pt-3 border-t border-indigo-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Seller 2 Options: Edit &amp; Publish Deal to Buyers OR Recall Backup
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {activeRecovery.published_to_buyers ? '✓ Visible in Buyer Cancelled Deals' : '📦 Warehouse Backup Only'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        aria-label="Edited product title for buyers"
                        value={editedTitle || activeRecovery.seller_edited_title || activeRecovery.product_title}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        placeholder="Edit title / offer tag (e.g., Sealed Box Mint + Free Shipping)"
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
                      />
                      <select
                        aria-label="Shipping policy for cancelled deal"
                        value={shippingPolicy || activeRecovery.shipping_policy || SHIPPING_POLICIES[0]}
                        onChange={(e) => setShippingPolicy(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
                      >
                        {SHIPPING_POLICIES.map((pol) => (
                          <option key={pol} value={pol}>
                            Shipping: {pol}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      aria-label="Offer note for buyers"
                      value={offerNote}
                      onChange={(e) => setOfferNote(e.target.value)}
                      placeholder="Seller note for Buyers (e.g., Freshly inspected at Karachi Hub, 10% flash rate cut!)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        onClick={() => handleSellerOption('EDIT_AND_DISCOUNT')}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <span>
                          {busyAction === 'EDIT_AND_DISCOUNT'
                            ? 'Publishing...'
                            : `📢 Option 1: Publish Edit & Discount (${usd(effectiveOfferPrice)}) to Buyers`}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        onClick={() => handleSellerOption('RETURN_TO_BACKUP')}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <span>
                          {busyAction === 'RETURN_TO_BACKUP'
                            ? 'Recalling...'
                            : '📦 Option 2: Recall to Warehouse Backup'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Profit-Shield AI Discussion Chatbot (Rate / Shipping / Backup Decision) */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                    <span>Profit-Shield AI Discussion Chatbot (Rate · Shipping · Backup Advisor)</span>
                  </h4>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {CHATBOT_QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleAskChatbot(q)}
                      className="px-2.5 py-1 rounded-full bg-white hover:bg-emerald-100 border border-emerald-200 text-[11px] font-semibold text-emerald-900 cursor-pointer disabled:opacity-60"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    aria-label="Ask Profit-Shield AI Advisor"
                    value={chatQuestion}
                    onChange={(e) => setChatQuestion(e.target.value)}
                    placeholder="Ask Profit-Shield AI: how much discount to offer, hold at hub, or recall backup stock?"
                    className="flex-1 px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    disabled={Boolean(busyAction) || !chatQuestion.trim()}
                    onClick={() => handleAskChatbot()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" aria-hidden="true" />
                    <span>{busyAction === 'chatbot' ? 'Thinking...' : 'Ask Profit-Shield Bot'}</span>
                  </button>
                </div>
              </div>

              {/* Live Negotiation Transcript */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                  <span>AI Advisor, Negotiation &amp; Next-Customer Conversation Log</span>
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {(activeRecovery.chat_history || []).map((msg, idx) => {
                    const isBuyer = msg.sender === 'NEXT_CUSTOMER';
                    const isLocked = msg.sender === 'DEAL_LOCKED';
                    const isBot = msg.sender === 'PROFIT_SHIELD_BOT';
                    const isSellerChat = msg.sender === 'SELLER_CHAT';
                    const isBackup = msg.sender === 'BACKUP_RECALLED';
                    const isVision = msg.sender === 'AI_VISION_CHECK';
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl px-3.5 py-2.5 text-xs ${
                          isLocked
                            ? 'bg-emerald-600 text-white font-semibold'
                            : isVision
                            ? 'bg-purple-50 border border-purple-300 text-purple-950 font-medium'
                            : isBot
                            ? 'bg-indigo-50 border border-indigo-200 text-indigo-950'
                            : isSellerChat
                            ? 'bg-slate-900 text-white'
                            : isBackup
                            ? 'bg-amber-50 border border-amber-300 text-amber-950 font-semibold'
                            : isBuyer
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-950'
                            : 'bg-slate-50 border border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5 text-[10px] font-bold uppercase opacity-80">
                          <span>
                            {msg.sender === 'NEXT_CUSTOMER'
                              ? `💬 Next Customer (${msg.candidate_name})`
                              : msg.sender === 'AI_VISION_CHECK'
                              ? `👁️ AI Vision Verifier (${msg.verdict || 'CHECKED'})`
                              : msg.sender === 'SELLER_OFFER'
                              ? `📢 Seller / AI Offer -> ${msg.candidate_name}`
                              : msg.sender === 'SELLER_CHAT'
                              ? '🧑‍💼 Seller Asked Advisor'
                              : msg.sender === 'PROFIT_SHIELD_BOT'
                              ? '🛡️ Profit-Shield AI Advisor'
                              : msg.sender === 'BACKUP_RECALLED'
                              ? '📦 Warehouse Backup Recalled'
                              : msg.sender === 'DEAL_LOCKED'
                              ? '✅ Confirmed Deal Reassigned'
                              : '🤖 AI Recovery Copilot'}
                          </span>
                          {msg.offered_price && <span>{usd(msg.offered_price)}</span>}
                        </div>
                        <p className="leading-relaxed">{msg.text}</p>
                        {msg.recommended_shipping && (
                          <p className="mt-1 text-[11px] font-semibold text-indigo-700">
                            🚚 Recommended Shipping: {msg.recommended_shipping}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {zoomPhotoUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
          onClick={() => setZoomPhotoUrl('')}
        >
          <div
            className="max-w-2xl w-full bg-white rounded-2xl p-3 space-y-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-800">Product Inspection Photo</span>
              <button
                type="button"
                onClick={() => setZoomPhotoUrl('')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
            <img
              src={zoomPhotoUrl}
              alt="Enlarged inspection preview"
              className="w-full max-h-[75vh] object-contain rounded-xl bg-slate-50"
            />
          </div>
        </div>
      )}
    </section>
  );
}
