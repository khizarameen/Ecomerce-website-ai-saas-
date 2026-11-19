import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArchiveBoxArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TagIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { sellerMeshAPI } from '../../../utils/api';

const usd = (val) => `$${Number(val || 0).toFixed(2)}`;

export default function CancelledDeals() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [editTargetId, setEditTargetId] = useState(null);
  const [customNote, setCustomNote] = useState('');
  const [offeredPrice, setOfferedPrice] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await sellerMeshAPI.getBuyerRescueDeals();
        if (active) setDeals(res.data?.deals || []);
      } catch {
        if (active) toast.error('Could not load cancelled order rescue deals');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const requireBuyerAuth = () => {
    if (!isAuthenticated) {
      toast.error('Please login with a Buyer account first to claim or request deals.');
      navigate('/login');
      return false;
    }
    return true;
  };

  const handleAction = async (dealId, optionType, extra = {}) => {
    if (!requireBuyerAuth()) return;
    setBusyKey(`${dealId}-${optionType}`);
    try {
      const res = await sellerMeshAPI.actOnBuyerRescueDeal(dealId, {
        option_type: optionType,
        ...extra,
      });
      setDeals(res.data?.deals || []);
      toast.success(res.data?.message || 'Request submitted!');
      if (optionType === 'REQUEST_EDIT_DISCOUNT') {
        setEditTargetId(null);
        setCustomNote('');
        setOfferedPrice('');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not process buyer request');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <ArrowPathIcon className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-600">Loading Seller Cancelled Order Deals...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Hero Banner */}
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-emerald-950 text-white p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-bold">
              <SparklesIcon className="w-4 h-4" aria-hidden="true" />
              <span>Flash Rescue Inventory · Seller Discounted Cancelled Orders</span>
            </span>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">
              Cancelled Order Deals Marketplace 🔥
            </h1>
            <p className="text-sm text-slate-200">
              Here you can browse orders recently cancelled by buyers where sellers have offered special discounts or
              updated listings. Choose from 2 options:
              <strong className="text-emerald-300"> Claim a Discounted Deal / Request Custom Edit</strong> or{' '}
              <strong className="text-sky-300">Request a Fresh Warehouse Backup Unit</strong>.
            </p>
          </div>
          <Link
            to="/orders"
            className="shrink-0 px-4 py-2.5 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 inline-flex items-center gap-2 self-start md:self-auto"
          >
            <ShoppingBagIcon className="w-4 h-4" aria-hidden="true" />
            <span>Back to My Orders</span>
          </Link>
        </div>
      </section>

      {deals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <p className="text-lg font-bold text-slate-800">No cancelled rescue deals published right now</p>
          <p className="text-sm text-slate-500">Check back shortly or browse the full store catalog.</p>
          <Link to="/products" className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold">
            Browse Catalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {deals.map((deal) => {
            const isClosed = deal.status === 'DEAL_CLOSED';
            const showEditBox = editTargetId === deal.id;
            const lastNotes = (deal.chat_history || []).slice(-2);

            return (
              <article
                key={deal.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between p-6 space-y-5"
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-500">#{deal.order_number}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                          📍 {deal.origin_city} Hub
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-extrabold ${
                            isClosed ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isClosed ? '✓ Claimed' : `${Number(deal.ai_discount_pct || 10).toFixed(0)}% OFF Rescue Deal`}
                        </span>
                      </div>
                      <h2 className="text-xl font-extrabold text-slate-900 mt-1.5">
                        {deal.seller_edited_title || deal.product_title}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Original Item: {deal.product_title} · Qty: {deal.quantity} · Cancelled reason: {deal.cancel_reason}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-400 line-through">{usd(deal.original_price)}</p>
                      <p className="text-2xl font-extrabold text-emerald-600">
                        {usd(isClosed ? deal.final_deal_price : deal.ai_recommended_deal_price)}
                      </p>
                    </div>
                  </div>

                  {/* Seller Edited Offer Details & Shipping */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
                    <p className="flex items-center gap-2 font-semibold text-slate-800">
                      <TruckIcon className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>Shipping Policy: {deal.shipping_policy || 'Free Same-City Hub Delivery'}</span>
                    </p>
                    {deal.seller_offer_note && (
                      <p className="flex items-start gap-2 text-indigo-800 font-medium">
                        <TagIcon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Seller Note: {deal.seller_offer_note}</span>
                      </p>
                    )}
                    <p className="text-slate-600">{deal.ai_strategy_summary}</p>
                  </div>

                  {/* Latest updates */}
                  {lastNotes.length > 0 && (
                    <div className="space-y-1.5">
                      {lastNotes.map((m, idx) => (
                        <div key={idx} className="text-[11px] bg-indigo-50/60 border border-indigo-100 rounded-xl px-3 py-2 text-slate-700">
                          <span className="font-bold text-indigo-800">{m.sender}: </span>
                          <span>{m.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Buyer 2 Options */}
                {isClosed ? (
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-bold text-emerald-900 flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>Confirmed Order #{deal.reassigned_order_number} locked!</span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Buyer 2 Options (Choose What Helps You Best):
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {/* Option 1A: Claim Discount Deal Now */}
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => handleAction(deal.id, 'CLAIM_DISCOUNT_DEAL')}
                        className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
                      >
                        <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {busyKey === `${deal.id}-CLAIM_DISCOUNT_DEAL`
                            ? 'Claiming...'
                            : `Option 1: Claim Discount Deal (${usd(deal.ai_recommended_deal_price)})`}
                        </span>
                      </button>

                      {/* Option 1B: Request Product Edit / Extra Discount */}
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => {
                          setEditTargetId(showEditBox ? null : deal.id);
                          setOfferedPrice(String(Number(deal.ai_recommended_deal_price || 0).toFixed(2)));
                        }}
                        className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                        <span>Ask Seller for Edit / Extra Discount</span>
                      </button>

                      {/* Option 2: Wapsi Backup Unit Request */}
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => handleAction(deal.id, 'REQUEST_BACKUP_UNIT')}
                        className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <ArchiveBoxArrowDownIcon className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {busyKey === `${deal.id}-REQUEST_BACKUP_UNIT`
                            ? 'Requesting...'
                            : 'Option 2: Request Fresh Backup Stock'}
                        </span>
                      </button>
                    </div>

                    {showEditBox && (
                      <div className="rounded-2xl bg-indigo-50/70 border border-indigo-200 p-3.5 space-y-2.5">
                        <p className="text-xs font-bold text-indigo-900">
                          Send Product Edit or Custom Discount Request to Seller:
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="number"
                            min="1"
                            step="0.50"
                            aria-label="Proposed price"
                            value={offeredPrice}
                            onChange={(e) => setOfferedPrice(e.target.value)}
                            placeholder="Offer $"
                            className="w-28 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs font-bold"
                          />
                          <input
                            type="text"
                            aria-label="Edit or discount request note"
                            value={customNote}
                            onChange={(e) => setCustomNote(e.target.value)}
                            placeholder="e.g. Confirm box condition or drop price by $2 extra..."
                            className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs"
                          />
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() =>
                              handleAction(deal.id, 'REQUEST_EDIT_DISCOUNT', {
                                offered_price: offeredPrice,
                                custom_note: customNote,
                              })
                            }
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                          >
                            Send to Seller
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
