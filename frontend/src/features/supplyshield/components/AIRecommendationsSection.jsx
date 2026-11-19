import { Link } from 'react-router-dom';
import {
  Sparkles,
  ShoppingCart,
  Route,
  Star,
  Database,
  Globe,
  Lightbulb,
  CheckCircle2,
  Truck,
} from 'lucide-react';

const AIRecommendationsSection = ({
  aiIdeas,
  matchedProducts = [],
  supplyChainHubDeals = [],
  onClaimHubDeal,
  claimingHubDealId = null,
  onAddToCart,
  onProcureViaMesh,
  addingProductKey = null,
}) => {
  const hasIdeas = aiIdeas && (aiIdeas.strategy || (aiIdeas.budget_split && aiIdeas.budget_split.length > 0));
  const sellerOriginalProducts = matchedProducts.filter((p) => p.source === 'Local Store DB' || p.id != null);
  const globalMeshProducts = matchedProducts.filter((p) => p.source !== 'Local Store DB' && p.id == null);
  const hasProducts = matchedProducts && matchedProducts.length > 0;
  const hasHubDeals = supplyChainHubDeals && supplyChainHubDeals.length > 0;

  if (!hasIdeas && !hasProducts && !hasHubDeals) {
    return null;
  }

  const renderProductCard = (product, idx) => {
    const isLocal = product.source === 'Local Store DB' || product.id != null;
    const cardKey = `${product.id || product.name}-${idx}`;
    const isAdding = addingProductKey === cardKey;

    return (
      <article
        key={cardKey}
        className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/85 p-4 hover:border-cyan-500/50 transition-all shadow-lg"
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-cyan-300 border border-slate-700 truncate">
              {product.category || product.category_name || 'General'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shrink-0">
              {product.match_score || 90}% Match
            </span>
          </div>

          {product.seller_name && (
            <p className="text-[11px] font-mono font-bold text-indigo-300 mb-1 truncate">
              🏪 Seller: {product.seller_name}
            </p>
          )}

          <h3 className="text-sm font-bold text-slate-100 leading-snug mb-1.5">
            {product.name}
          </h3>

          <div className="flex items-baseline justify-between gap-2 mb-2">
            <span className="text-lg font-mono font-bold text-slate-100">
              ${Number(product.price || 0).toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-300">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {product.rating || product.average_rating || 4.6}
            </span>
          </div>

          {product.why_recommended && (
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/75 border border-slate-800/80 rounded-lg p-2.5 mb-3">
              <span className="text-cyan-300 font-semibold">Why AI recommends: </span>
              {product.why_recommended}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${
                isLocal
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40'
                  : 'bg-purple-500/15 text-purple-200 border-purple-500/40'
              }`}
            >
              {isLocal ? (
                <Database className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Globe className="w-3 h-3" aria-hidden="true" />
              )}
              {isLocal ? 'Seller Original Catalog' : (product.source || 'Global AI Mesh')}
            </span>

            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                product.in_stock || Number(product.stock_quantity || 0) > 0
                  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
                  : 'bg-amber-500/15 text-amber-200 border-amber-500/40'
              }`}
            >
              {product.in_stock || Number(product.stock_quantity || 0) > 0
                ? `In Stock (${product.stock_quantity})`
                : `Status: ${product.status || 'Check Stock'}`}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          {isLocal && product.id != null && (
            <Link
              to={`/products/${product.slug || product.id}`}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 transition-colors"
            >
              <span>View Seller Original Product →</span>
            </Link>
          )}
          {isLocal && product.id != null && (
            <button
              type="button"
              disabled={isAdding}
              onClick={() => onAddToCart?.(product, cardKey)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors disabled:opacity-50"
            >
              <ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />
              {isAdding ? 'Adding...' : 'Add Original Product to Cart'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onProcureViaMesh?.(product)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-colors"
          >
            <Route className="w-3.5 h-3.5" aria-hidden="true" />
            Procure via 4-Node Mesh
          </button>
        </div>
      </article>
    );
  };

  return (
    <section
      aria-label="AI Buying Strategy and Product Recommendations"
      className="space-y-6"
    >
      {/* AI Buying Strategy & Bundle Breakdown */}
      {hasIdeas && (
        <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/30 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-300">
                <Lightbulb className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-purple-300">
                  AI Idea &amp; Bundle Strategist
                </p>
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  {aiIdeas.bundle_name || 'Smart AI Shopping & Procurement Strategy'}
                </h2>
              </div>
            </div>
          </div>

          {aiIdeas.strategy && (
            <p className="text-sm text-slate-200 leading-relaxed mb-4">
              {aiIdeas.strategy}
            </p>
          )}

          {Array.isArray(aiIdeas.budget_split) && aiIdeas.budget_split.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {aiIdeas.budget_split.map((slice, idx) => (
                <div
                  key={`${slice.category}-${idx}`}
                  className="rounded-xl bg-slate-950/80 border border-slate-800 p-3"
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span className="text-slate-300 truncate">{slice.category}</span>
                    <span className="text-cyan-300 font-bold">{slice.allocation_pct}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-1.5">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-purple-400"
                      style={{ width: `${Math.min(Number(slice.allocation_pct || 0), 100)}%` }}
                    />
                  </div>
                  <p className="text-xs font-mono text-emerald-300 font-semibold">
                    ${Number(slice.amount_usd || 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {Array.isArray(aiIdeas.pro_tips) && aiIdeas.pro_tips.length > 0 && (
            <ul className="space-y-1.5 text-xs text-slate-300">
              {aiIdeas.pro_tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Section 1: Seller Original Store Products (Fresh Seller Catalog) */}
      {sellerOriginalProducts.length > 0 && (
        <section
          aria-label="Seller Original Store Products"
          className="rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 p-5 shadow-xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-300 font-bold">
                Direct Store Inventory · Original Seller Listings
              </p>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                <span>🏪 Seller Original Store Products — Fresh Seller Catalog ({sellerOriginalProducts.length})</span>
              </h2>
            </div>
            <Link
              to="/products"
              className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 text-xs font-bold"
            >
              Browse Full Store →
            </Link>
          </div>
          <p className="text-xs text-slate-300">
            Original store products directly from sellers (fresh stock &amp; store pricing). Separate Supply Chain Hub
            cancelled discounted deals are listed below.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {sellerOriginalProducts.map((product, idx) => renderProductCard(product, idx))}
          </div>
        </section>
      )}

      {/* Global AI Mesh & Bundle Products */}
      {globalMeshProducts.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-mono uppercase tracking-wider text-slate-200 font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" aria-hidden="true" />
              🌐 Global AI Mesh &amp; Bundle Matches ({globalMeshProducts.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {globalMeshProducts.map((product, idx) => renderProductCard(product, idx))}
          </div>
        </div>
      )}

      {/* Separate Supply Chain Hub — Cancelled Orders on Discount */}
      {hasHubDeals && (
        <section
          aria-label="Supply Chain Hub Cancelled Order Deals"
          className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-slate-900 via-amber-950/20 to-emerald-950/30 p-5 shadow-xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                Separate Section · Isolated From Regular Store Inventory
              </p>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                <span>🚚 Supply Chain Hub — Cancelled Orders on Discount ({supplyChainHubDeals.length})</span>
              </h2>
            </div>
            <Link
              to="/cancelled-deals"
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 text-xs font-bold"
            >
              View All Cancelled Deals →
            </Link>
          </div>

          <p className="text-xs text-slate-300">
            These cancelled buyer parcels are held at our Supply Chain Hub — claim them immediately at a special
            discount with zero return delay.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {supplyChainHubDeals.map((deal) => (
              <article
                key={deal.id}
                className="rounded-2xl border border-amber-400/30 bg-slate-950/85 p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-cyan-300 font-bold">
                      #{deal.order_number} · 📍 {deal.origin_city} Hub
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/40 font-bold">
                      Cancelled · {Number(deal.ai_discount_pct || 10).toFixed(0)}% OFF
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {deal.seller_edited_title || deal.product_title}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    🏪 Seller: <strong className="text-cyan-300">{deal.seller_store_name || deal.seller_username || 'Verified Seller'}</strong>
                    {(deal.original_product_slug || deal.original_product_id) && (
                      <>
                        {' · '}
                        <Link
                          to={`/products/${deal.original_product_slug || deal.original_product_id}`}
                          className="text-indigo-300 hover:underline font-semibold"
                        >
                          View Original Product →
                        </Link>
                      </>
                    )}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-mono font-extrabold text-emerald-300">
                      ${Number(deal.ai_recommended_deal_price || 0).toFixed(2)}
                    </span>
                    <span className="text-xs font-mono text-slate-400 line-through">
                      ${Number(deal.original_price || 0).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    🚚 {deal.shipping_policy || 'Free Same-City Hub Delivery'}
                  </p>
                  {deal.ai_strategy_summary && (
                    <p className="text-[11px] text-slate-400 line-clamp-2">{deal.ai_strategy_summary}</p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={claimingHubDealId === deal.id}
                  onClick={() => onClaimHubDeal?.(deal.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 cursor-pointer disabled:opacity-50"
                >
                  <ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {claimingHubDealId === deal.id ? 'Claiming...' : '🛒 Claim Discounted Hub Order'}
                  </span>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
};

export default AIRecommendationsSection;
