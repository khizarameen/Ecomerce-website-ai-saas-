import { useState, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { sellerAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import { formatPrice, formatDate } from '../../../utils/helpers';
import {
  ChartBarIcon,
  ShoppingBagIcon,
  CurrencyDollarIcon,
  UsersIcon,
  MagnifyingGlassIcon,
  UserPlusIcon,
  EyeIcon,
  HeartIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

const ORDER_BAR_COLORS = {
  pending: 'bg-amber-500',
  processing: 'bg-sky-500',
  confirmed: 'bg-teal-500',
  shipped: 'bg-indigo-500',
  delivered: 'bg-emerald-500',
  cancelled: 'bg-rose-500',
};

const Analytics = () => {
  const [stats, setStats] = useState({});
  const [orderBars, setOrderBars] = useState([]);
  const [productAnalytics, setProductAnalytics] = useState([]);
  const [allProductsList, setAllProductsList] = useState([]);
  const [engagementBarsData, setEngagementBarsData] = useState([]);
  const [smartSummary, setSmartSummary] = useState('');
  const [actionTip, setActionTip] = useState('');
  const [customers, setCustomers] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [creatingBuyer, setCreatingBuyer] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [buyerForm, setBuyerForm] = useState({
    name: '',
    email: '',
    city: 'Karachi',
    product_id: '',
    action_type: 'place_order',
  });

  const baseId = useId();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = {};
        if (activeSearch.trim()) params.search = activeSearch.trim();
        if (selectedProductId) params.product_id = selectedProductId;

        const [statsRes, ordersRes] = await Promise.all([
          sellerAPI.getMyStats(params),
          sellerAPI.getMyOrders(),
        ]);
        if (!active) return;
        const d = statsRes.data || {};
        setStats(d.stats || {});
        setOrderBars(Array.isArray(d.order_status_bars) ? d.order_status_bars : []);
        setProductAnalytics(Array.isArray(d.product_analytics) ? d.product_analytics : []);
        setAllProductsList(
          Array.isArray(d.all_products)
            ? d.all_products
            : Array.isArray(d.product_analytics)
            ? d.product_analytics
            : []
        );
        setEngagementBarsData(Array.isArray(d.engagement_bars) ? d.engagement_bars : []);
        setSmartSummary(d.smart_summary || '');
        setActionTip(d.action_tip || '');
        setCustomers(Array.isArray(d.customers) ? d.customers : []);
        const myOrders = ordersRes.data?.orders || ordersRes.data?.results || [];
        setRecentOrders(Array.isArray(myOrders) ? myOrders.slice(0, 10) : []);
      } catch (error) {
        console.error('Error fetching analytics:', error);
        if (active) toast.error('Failed to load store analytics');
      } finally {
        if (active) {
          setLoading(false);
          setSearching(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshNonce, activeSearch, selectedProductId]);

  const handleSmartSearchSubmit = (e) => {
    e.preventDefault();
    setSearching(true);
    setActiveSearch(searchInput);
  };

  const handleQuickFilter = (queryText) => {
    setSearching(true);
    setSearchInput(queryText);
    setActiveSearch(queryText);
  };

  const handleCreateBuyer = async (e) => {
    e.preventDefault();
    if (!buyerForm.name.trim() || !buyerForm.email.trim()) {
      toast.error('Please enter buyer name and email.');
      return;
    }
    setCreatingBuyer(true);
    try {
      const res = await sellerAPI.createBuyerCustomer({
        ...buyerForm,
        product_id: buyerForm.product_id || selectedProductId || productAnalytics[0]?.id || undefined,
      });
      toast.success(res.data?.message || 'Buyer customer created!');
      setBuyerForm({
        name: '',
        email: '',
        city: 'Karachi',
        product_id: '',
        action_type: 'place_order',
      });
      setShowAddBuyer(false);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create buyer customer');
    } finally {
      setCreatingBuyer(false);
    }
  };

  if (loading) return <Loader />;

  const filteredProducts = productAnalytics;

  const barColors = {
    viewed: { color: 'bg-blue-600', text: 'text-blue-700' },
    notViewed: { color: 'bg-slate-400', text: 'text-slate-700' },
    liked: { color: 'bg-pink-500', text: 'text-pink-700' },
    ordered: { color: 'bg-indigo-600', text: 'text-indigo-700' },
    cancelled: { color: 'bg-rose-600', text: 'text-rose-700' },
  };
  const engagementBars = (engagementBarsData.length > 0
    ? engagementBarsData
    : [
        { key: 'viewed', label: '👁️ Viewed', value: 0 },
        { key: 'notViewed', label: '🙈 Not Viewed', value: 0 },
        { key: 'liked', label: '❤️ Liked / Reviews', value: 0 },
        { key: 'ordered', label: '📦 Orders Placed', value: 0 },
        { key: 'cancelled', label: '❌ Cancelled', value: 0 },
      ]
  ).map((b) => ({
    ...b,
    color: barColors[b.key]?.color || 'bg-indigo-600',
    text: barColors[b.key]?.text || 'text-indigo-700',
  }));
  const maxEngagement = Math.max(1, ...engagementBars.map((b) => Number(b.value || 0)));
  const maxOrderBar = Math.max(1, ...orderBars.map((b) => Number(b.count || 0)));

  const byMetricDesc = (key) =>
    [...filteredProducts].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))[0] || null;
  const mostViewedProd = byMetricDesc('viewed_count');
  const mostLikedProd = byMetricDesc('liked_count');
  const mostCancelledProd = byMetricDesc('cancelled_count');
  const bestPerformingProd =
    [...filteredProducts].sort(
      (a, b) =>
        Number(b.orders_count || 0) * 3 +
        Number(b.liked_count || 0) * 2 +
        Number(b.viewed_count || 0) -
        Number(b.cancelled_count || 0) * 2 -
        (Number(a.orders_count || 0) * 3 +
          Number(a.liked_count || 0) * 2 +
          Number(a.viewed_count || 0) -
          Number(a.cancelled_count || 0) * 2)
    )[0] || null;
  const lowViewedProd =
    [...filteredProducts].sort((a, b) => Number(a.viewed_count || 0) - Number(b.viewed_count || 0))[0] || null;

  const activeScopeLabel =
    selectedProductId && filteredProducts.length === 1
      ? filteredProducts[0].name
      : filteredProducts.length === 1
      ? filteredProducts[0].name
      : `${filteredProducts.length} Matched Product(s)`;

  const statCards = [
    { title: 'Store Revenue', value: formatPrice(stats?.total_revenue || 0), icon: CurrencyDollarIcon, color: 'bg-emerald-600' },
    { title: 'Store Orders', value: stats?.total_orders || 0, icon: ShoppingBagIcon, color: 'bg-blue-600' },
    { title: 'My Products', value: stats?.total_products || 0, icon: ChartBarIcon, color: 'bg-purple-600' },
    { title: 'Store Customers (Buyers)', value: stats?.total_customers || 0, icon: UsersIcon, color: 'bg-orange-500' },
  ];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Store Analytics &amp; Customer Insights 📊
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Search your products to see views, likes, cancellations, order bars, and buyer customers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddBuyer((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm cursor-pointer"
        >
          <UserPlusIcon className="w-4 h-4" aria-hidden="true" />
          <span>{showAddBuyer ? 'Close Buyer Form' : '+ Create Buyer Customer'}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((stat) => (
          <div key={stat.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.title}</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color} text-white`}>
                <stat.icon className="w-6 h-6" aria-hidden="true" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Buyer Customer Form */}
      {showAddBuyer && (
        <form
          onSubmit={handleCreateBuyer}
          className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-indigo-950">
                Create Buyer Customer (Store Customer)
              </h2>
              <p className="text-xs text-indigo-800">
                Register a Buyer customer and optionally record a product view/like or COD order on your product.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              required
              value={buyerForm.name}
              onChange={(e) => setBuyerForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Buyer Name (e.g. Ali Raza)"
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs"
            />
            <input
              type="email"
              required
              value={buyerForm.email}
              onChange={(e) => setBuyerForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Buyer Email"
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs"
            />
            <input
              type="text"
              value={buyerForm.city}
              onChange={(e) => setBuyerForm((p) => ({ ...p, city: e.target.value }))}
              placeholder="City (e.g. Lahore)"
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs"
            />
            <select
              value={buyerForm.product_id}
              onChange={(e) => setBuyerForm((p) => ({ ...p, product_id: e.target.value }))}
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs"
            >
              <option value="">Lead Store Product</option>
              {allProductsList.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name}
                </option>
              ))}
            </select>
            <select
              value={buyerForm.action_type}
              onChange={(e) => setBuyerForm((p) => ({ ...p, action_type: e.target.value }))}
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs"
            >
              <option value="place_order">View + Like + Place Order</option>
              <option value="view_and_like">View + Like (Wishlist)</option>
              <option value="none">Register Buyer Only</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creatingBuyer}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              {creatingBuyer ? 'Creating...' : 'Save Buyer Customer'}
            </button>
          </div>
        </form>
      )}

      {/* Seller AI Smart Product Search + Filter */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <form onSubmit={handleSmartSearchSubmit} className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="flex-1">
            <label htmlFor={`${baseId}-search`} className="block text-xs font-bold uppercase text-slate-600 mb-1">
              ✨ Smart Search Your Store Products (e.g. &ldquo;most cancelled&rdquo;, &ldquo;most liked&rdquo;, &ldquo;low views&rdquo;, or product name)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id={`${baseId}-search`}
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ask or search your products (e.g. most cancelled, most liked, under $100)..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {searching ? 'Searching...' : 'Smart Search'}
              </button>
            </div>
          </div>

          <div className="w-full md:w-72">
            <label htmlFor={`${baseId}-select`} className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Filter Specific Product
            </label>
            <select
              id={`${baseId}-select`}
              value={selectedProductId}
              onChange={(e) => {
                setSearching(true);
                setSelectedProductId(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All My Products ({allProductsList.length})</option>
              {allProductsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Quick AI Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: 'All Products', q: '' },
            { label: '❌ Most Cancelled', q: 'most cancelled' },
            { label: '👁️ Most Viewed', q: 'most viewed' },
            { label: '❤️ Most Liked', q: 'most liked' },
            { label: '🙈 Low Views', q: 'low views' },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleQuickFilter(chip.q)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                activeSearch === chip.q
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Smart Insights Banner (Zero internal jargon) */}
        {(smartSummary || actionTip) && (
          <div className="rounded-xl bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-200 p-4 space-y-1">
            {smartSummary && (
              <p className="text-xs font-bold text-slate-900">
                💡 Store Insight: <span className="font-normal text-slate-700">{smartSummary}</span>
              </p>
            )}
            {actionTip && (
              <p className="text-xs font-bold text-emerald-900">
                ✅ Recommendation: <span className="font-normal text-emerald-800">{actionTip}</span>
              </p>
            )}
          </div>
        )}

        {allProductsList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700">No products in your store yet</p>
            <Link
              to="/seller/products/add"
              className="inline-block px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
            >
              Add Your First Product
            </Link>
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No seller product matched &ldquo;{activeSearch}&rdquo;.
          </p>
        ) : (
          <div className="space-y-5 pt-2">
            {/* Named Product Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {[
                {
                  label: '👁️ Most Viewed',
                  prod: mostViewedProd,
                  stat: mostViewedProd ? `${mostViewedProd.viewed_count} views` : '0 views',
                  tone: 'border-blue-200 bg-blue-50/70 text-blue-900',
                },
                {
                  label: '⭐ Top Performing',
                  prod: bestPerformingProd,
                  stat: bestPerformingProd
                    ? `${bestPerformingProd.orders_count} orders · ${bestPerformingProd.liked_count} likes`
                    : '0',
                  tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
                },
                {
                  label: '❤️ Most Liked',
                  prod: mostLikedProd,
                  stat: mostLikedProd ? `${mostLikedProd.liked_count} likes` : '0 likes',
                  tone: 'border-pink-200 bg-pink-50/70 text-pink-900',
                },
                {
                  label: '❌ Most Cancelled',
                  prod: mostCancelledProd,
                  stat: mostCancelledProd ? `${mostCancelledProd.cancelled_count} cancelled` : '0 cancelled',
                  tone: 'border-rose-200 bg-rose-50/70 text-rose-900',
                },
                {
                  label: '🙈 Lowest Views',
                  prod: lowViewedProd,
                  stat: lowViewedProd ? `${lowViewedProd.viewed_count} views` : '0 views',
                  tone: 'border-slate-200 bg-slate-50 text-slate-900',
                },
              ].map((h) => (
                <button
                  key={h.label}
                  type="button"
                  disabled={!h.prod}
                  onClick={() => {
                    if (h.prod) {
                      setSearching(true);
                      setSelectedProductId(String(h.prod.id));
                    }
                  }}
                  className={`text-left rounded-xl border p-3 transition-all cursor-pointer hover:shadow-sm ${h.tone}`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{h.label}</p>
                  <p className="text-xs font-extrabold truncate mt-1">
                    {h.prod ? h.prod.name : 'N/A'}
                  </p>
                  <p className="text-[11px] font-semibold opacity-75 mt-0.5">{h.stat}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Graph 1: Product Views / Not Viewed / Likes / Cancels */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      📈 Product Views, Likes &amp; Cancellations Graph
                    </h2>
                    <p className="text-xs text-slate-500">
                      Showing: <strong className="text-indigo-700">{activeScopeLabel}</strong>
                    </p>
                  </div>
                  {selectedProductId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearching(true);
                        setSelectedProductId('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-[11px] font-bold cursor-pointer"
                    >
                      Show All Products
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {engagementBars.map((bar) => {
                    const widthPct = Math.round((bar.value / maxEngagement) * 100);
                    return (
                      <div key={bar.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{bar.label}</span>
                          <span className={`font-extrabold tabular-nums ${bar.text}`}>{bar.value}</span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${bar.color} transition-all duration-500`}
                            style={{ width: `${Math.max(widthPct, bar.value > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Clickable Per-Product Breakdown (click any product to move both graphs) */}
                <div className="pt-2 border-t border-slate-200 space-y-2 max-h-56 overflow-y-auto">
                  {filteredProducts.map((p) => {
                    const isPicked = String(selectedProductId) === String(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSearching(true);
                          setSelectedProductId(isPicked ? '' : String(p.id));
                        }}
                        className={`w-full text-left rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 text-xs cursor-pointer transition-all ${
                          isPicked
                            ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                            : 'bg-white border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatPrice(p.price)} · Stock: {p.stock_quantity} · {p.orders_count} order(s)
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            <EyeIcon className="w-3.5 h-3.5" aria-hidden="true" />
                            {p.viewed_count} Viewed
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {p.not_viewed_count} Not Viewed
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">
                            <HeartIcon className="w-3.5 h-3.5" aria-hidden="true" />
                            {p.liked_count} Liked
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                            <XCircleIcon className="w-3.5 h-3.5" aria-hidden="true" />
                            {p.cancelled_count} Cancelled
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Graph 2: Store Orders Bar Chart (moves dynamically with searched/selected product) */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-4 flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    📊 Store Orders Bar Chart (By Status)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Orders for: <strong className="text-indigo-700">{activeScopeLabel}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-6 gap-2 items-end h-52 pt-4 pb-2 px-2 bg-white rounded-xl border border-slate-200">
                  {orderBars.map((bar) => {
                    const pct = Math.round((Number(bar.count || 0) / maxOrderBar) * 100);
                    const barColor = ORDER_BAR_COLORS[bar.status] || 'bg-indigo-500';
                    return (
                      <div key={bar.status} className="flex flex-col items-center justify-end h-full gap-1.5">
                        <span className="text-xs font-extrabold text-slate-800 tabular-nums">{bar.count}</span>
                        <div className="w-full max-w-[36px] flex-1 flex items-end bg-slate-100 rounded-t-lg overflow-hidden">
                          <div
                            className={`w-full ${barColor} rounded-t-lg transition-all duration-500`}
                            style={{ height: `${Math.max(pct, bar.count > 0 ? 12 : 4)}%` }}
                            title={`${bar.label}: ${bar.count} orders (${formatPrice(bar.revenue)})`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">
                          {bar.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-center">
                    <p className="text-[11px] text-slate-500">Delivered</p>
                    <p className="font-extrabold text-emerald-700">
                      {orderBars.find((b) => b.status === 'delivered')?.count || 0}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-center">
                    <p className="text-[11px] text-slate-500">Active / Pending</p>
                    <p className="font-extrabold text-indigo-700">
                      {orderBars
                        .filter((b) => ['pending', 'processing', 'confirmed', 'shipped'].includes(b.status))
                        .reduce((s, b) => s + Number(b.count || 0), 0)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-center">
                    <p className="text-[11px] text-slate-500">Cancelled</p>
                    <p className="font-extrabold text-rose-700">
                      {orderBars.find((b) => b.status === 'cancelled')?.count || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Store Customers (Buyers) Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              👥 Store Customers &amp; Buyer Engagement ({customers.length})
            </h2>
            <p className="text-xs text-slate-500">
              Buyers who ordered, liked (wishlisted), or reviewed your store products
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddBuyer(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold cursor-pointer"
          >
            + Add Buyer Customer
          </button>
        </div>

        {customers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
            No buyer customers have engaged with your products yet. Click <strong>+ Create Buyer Customer</strong> above
            or share your products on the Buyer Storefront.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-bold text-slate-600">Buyer Name</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600">Email &amp; City</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600">Orders</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600">Liked</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600">Cancelled</th>
                  <th className="px-3 py-2.5 font-bold text-slate-600">Total Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{c.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {c.email} · {c.city}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-indigo-700">{c.orders_count}</td>
                    <td className="px-3 py-2.5 font-semibold text-pink-600">{c.liked_count}</td>
                    <td className="px-3 py-2.5 font-semibold text-rose-600">{c.cancelled_count}</td>
                    <td className="px-3 py-2.5 font-bold text-emerald-700">{formatPrice(c.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Store Orders */}
      {recentOrders.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-extrabold text-slate-900 mb-4">Recent Store Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-xs font-bold text-slate-600">Order #</th>
                  <th className="px-4 py-2 text-xs font-bold text-slate-600">Customer</th>
                  <th className="px-4 py-2 text-xs font-bold text-slate-600">Your Earnings</th>
                  <th className="px-4 py-2 text-xs font-bold text-slate-600">Status</th>
                  <th className="px-4 py-2 text-xs font-bold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-2 text-sm font-bold text-slate-900">{order.order_number}</td>
                    <td className="px-4 py-2 text-sm text-slate-700">{order.buyer_name || order.email}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-emerald-700">
                      {formatPrice(order.seller_subtotal ?? order.total)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                          order.status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-800'
                            : order.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-500">{formatDate(order.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500">
          No customer orders for your store yet.
        </div>
      )}
    </div>
  );
};

export default Analytics;
