// src/features/seller/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sellerAPI, orderAPI } from '../../../utils/api';
import { useAuth } from '../../../context/AuthContext';
import Loader from '../../../components/common/Loader';
import NextCustomerDealCopilot from '../components/NextCustomerDealCopilot';
import { formatPrice, formatDate } from '../../../utils/helpers';
import toast from 'react-hot-toast';
import {
  ChartBarIcon,
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  PlusIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  TrashIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user, sellerProfile } = useAuth();
  const [stats, setStats] = useState({
    total_products: 0,
    published_products: 0,
    total_orders: 0,
    total_revenue: 0,
    total_sales: 0,
  });
  const [sellerInfo, setSellerInfo] = useState({
    id: sellerProfile?.id || null,
    store_name: sellerProfile?.store_name || `${user?.username || 'Seller'}'s Store`,
    store_slug: sellerProfile?.store_slug || '',
    average_rating: 0,
    total_reviews: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingOrderId, setConfirmingOrderId] = useState(null);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [dealRefreshKey, setDealRefreshKey] = useState(0);

  const handleDealClosed = async () => {
    try {
      const ordRes = await sellerAPI.getMyOrders();
      const myOrders = ordRes.data?.orders || ordRes.data?.results || [];
      setRecentOrders(Array.isArray(myOrders) ? myOrders : []);
    } catch {
      // ignore background refresh error
    }
  };

  const handleQuickStatus = async (orderId, nextStatus) => {
    setConfirmingOrderId(orderId);
    try {
      await orderAPI.updateOrderStatus(orderId, { status: nextStatus });
      toast.success(`Order ${nextStatus === 'confirmed' ? 'confirmed (OK)' : `marked ${nextStatus}`}!`);
      setRecentOrders((prev) =>
        prev.map((ord) => (ord.id === orderId ? { ...ord, status: nextStatus } : ord))
      );
      if (nextStatus === 'cancelled') {
        setDealRefreshKey((k) => k + 1);
      }
    } catch {
      toast.error('Failed to update order');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    if (!window.confirm(`Delete order #${orderNumber}?`)) return;
    setDeletingOrderId(orderId);
    try {
      await orderAPI.deleteOrder(orderId);
      toast.success(`Order #${orderNumber} deleted`);
      setRecentOrders((prev) => prev.filter((ord) => ord.id !== orderId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete order');
    } finally {
      setDeletingOrderId(null);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [dashRes, prodRes, ordRes] = await Promise.allSettled([
          sellerAPI.getDashboard(),
          sellerAPI.getMyProducts(),
          sellerAPI.getMyOrders(),
        ]);
        if (!active) return;

        const myProducts =
          prodRes.status === 'fulfilled'
            ? prodRes.value.data?.products || prodRes.value.data?.results || []
            : [];
        const myOrders =
          ordRes.status === 'fulfilled'
            ? ordRes.value.data?.orders || ordRes.value.data?.results || []
            : [];

        setRecentProducts(Array.isArray(myProducts) ? myProducts : []);
        setRecentOrders(Array.isArray(myOrders) ? myOrders : []);

        if (dashRes.status === 'fulfilled') {
          const d = dashRes.value.data?.data || dashRes.value.data || {};
          setSellerInfo({
            id: d.id || sellerProfile?.id || null,
            store_name: d.store_name || sellerProfile?.store_name || `${user?.username || 'Seller'}'s Store`,
            store_slug: d.store_slug || sellerProfile?.store_slug || '',
            average_rating: Number(d.average_rating || 0),
            total_reviews: Number(d.total_reviews || 0),
          });
          setStats({
            total_products: Number(d.total_products ?? myProducts.length),
            published_products: Number(
              d.published_products ?? myProducts.filter((p) => p.status === 'published').length
            ),
            total_orders: Number(d.total_orders ?? myOrders.length),
            total_revenue: Number(d.total_revenue || 0),
            total_sales: Number(d.total_sales || 0),
          });
        } else {
          setStats((prev) => ({
            ...prev,
            total_products: myProducts.length,
            published_products: myProducts.filter((p) => p.status === 'published').length,
            total_orders: myOrders.length,
          }));
        }
      } catch (error) {
        console.error('Error fetching seller dashboard:', error);
        if (active) toast.error('Failed to load seller dashboard data');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sellerProfile, user]);

  if (loading) return <Loader />;

  const kpiCards = [
    {
      title: 'Total Products',
      value: stats.total_products,
      subtitle: `${stats.published_products} published live`,
      icon: ShoppingBagIcon,
      accent: 'bg-blue-600',
      link: '/seller/products',
    },
    {
      title: 'Units Sold',
      value: stats.total_sales,
      subtitle: 'Completed items shipped',
      icon: ChartBarIcon,
      accent: 'bg-emerald-600',
      link: '/seller/orders',
    },
    {
      title: 'Store Revenue',
      value: formatPrice(stats.total_revenue),
      subtitle: 'Gross store sales',
      icon: CurrencyDollarIcon,
      accent: 'bg-indigo-600',
      link: '/seller/analytics',
    },
    {
      title: 'Store Orders',
      value: stats.total_orders,
      subtitle: 'Customer orders placed',
      icon: ShoppingCartIcon,
      accent: 'bg-amber-600',
      link: '/seller/orders',
    },
  ];

  const getProductStatusBadge = (status) => {
    if (status === 'published') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (status === 'out_of_stock') {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <section className="rounded-3xl bg-gradient-to-r from-indigo-700 via-blue-700 to-slate-900 text-white p-6 md:p-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">
                <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
                <span>Verified Active Store</span>
              </span>
              {sellerInfo.average_rating > 0 && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40">
                  ★ {sellerInfo.average_rating.toFixed(1)} ({sellerInfo.total_reviews} reviews)
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {sellerInfo.store_name}
            </h1>
            <p className="text-sm text-blue-100">
              Welcome back, {user?.first_name || user?.username}. Manage products, inventory, and orders directly — no admin approval required.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/seller/products/add"
              className="bg-white text-indigo-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors inline-flex items-center gap-2 shadow-sm"
            >
              <PlusIcon className="w-5 h-5" aria-hidden="true" />
              <span>Add Product</span>
            </Link>
            <Link
              to="/seller/orders"
              className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-600 transition-colors inline-flex items-center gap-2 shadow-sm"
            >
              <ShoppingCartIcon className="w-5 h-5" aria-hidden="true" />
              <span>Customer Orders</span>
            </Link>
            <Link
              to="/seller/profit-shield"
              className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:brightness-110 transition-all inline-flex items-center gap-2 shadow-sm ring-1 ring-white/20"
            >
              <ShieldCheckIcon className="w-5 h-5" aria-hidden="true" />
              <span>Profit-Shield AI Agent</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured AI Profit-Shield Callout */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 text-white p-6 shadow-md ring-1 ring-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
              <ShieldCheckIcon className="w-4 h-4" aria-hidden="true" />
              <span>Automated 4-Agent Store Protection</span>
            </span>
            <h2 className="text-xl font-extrabold tracking-tight">
              Seller Profit-Shield &amp; Anti-RTO Command Center
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Collaborating AI agents protect your margin automatically: <strong>Gatekeeper</strong> (Fake COD holds) →{' '}
              <strong>Parcel Saver</strong> (In-transit hub reroute) → <strong>Forensic Inspector</strong> (Return-swap
              photo verification) → <strong>Margin Auditor</strong> (Courier weight bleed).
            </p>
          </div>
          <Link
            to="/seller/profit-shield"
            className="shrink-0 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition-all"
          >
            <ShieldCheckIcon className="w-5 h-5" aria-hidden="true" />
            <span>Launch 4-Agent Profit-Shield →</span>
          </Link>
        </div>
      </section>

      {/* KPI Cards */}
      <section aria-label="Store performance metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((card) => (
          <Link
            key={card.title}
            to={card.link}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {card.title}
                </p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{card.value}</p>
                <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.accent} text-white shrink-0`}>
                <card.icon className="w-6 h-6" aria-hidden="true" />
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Quick Actions */}
      <section aria-label="Quick actions" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link
          to="/seller/products/add"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors"
        >
          <div>
            <p className="font-bold text-sm">Add New Product</p>
            <p className="text-xs text-blue-100">Publish immediately to Buyer catalog</p>
          </div>
          <PlusIcon className="w-7 h-7 shrink-0" aria-hidden="true" />
        </Link>

        <Link
          to="/seller/products"
          className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors"
        >
          <div>
            <p className="font-bold text-sm">Manage Products</p>
            <p className="text-xs text-slate-300">Edit pricing, stock &amp; status</p>
          </div>
          <ShoppingBagIcon className="w-7 h-7 shrink-0" aria-hidden="true" />
        </Link>

        <Link
          to="/seller/orders"
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors"
        >
          <div>
            <p className="font-bold text-sm">Fulfill Orders</p>
            <p className="text-xs text-emerald-100">Track buyer purchases</p>
          </div>
          <ShoppingCartIcon className="w-7 h-7 shrink-0" aria-hidden="true" />
        </Link>

        <Link
          to="/seller/analytics"
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors"
        >
          <div>
            <p className="font-bold text-sm">Store Analytics</p>
            <p className="text-xs text-indigo-100">Track store revenue &amp; sales</p>
          </div>
          <ChartBarIcon className="w-7 h-7 shrink-0" aria-hidden="true" />
        </Link>

        <Link
          to="/seller/profit-shield"
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-sm transition-all"
        >
          <div>
            <p className="font-bold text-sm">Profit-Shield Mesh</p>
            <p className="text-xs text-emerald-100">Stop fake COD, RTO &amp; fraud</p>
          </div>
          <ShieldCheckIcon className="w-7 h-7 shrink-0" aria-hidden="true" />
        </Link>
      </section>

      {/* AI Next-Customer ("Agla Customer") Cancelled-Order Deal Copilot (Compact Collapsible) */}
      <NextCustomerDealCopilot
        collapsible
        defaultExpanded={false}
        refreshKey={dealRefreshKey}
        onDealClosed={handleDealClosed}
      />

      {/* Two-Column Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Products */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-slate-900">My Recent Products</h2>
            <Link to="/seller/products" className="text-xs font-semibold text-blue-600 hover:underline">
              View All ({recentProducts.length}) →
            </Link>
          </div>

          {recentProducts.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-slate-600 font-medium">No products listed yet</p>
              <Link
                to="/seller/products/add"
                className="inline-block px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
              >
                Add First Product
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentProducts.slice(0, 6).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                    {product.main_image_url ? (
                      <img
                        src={product.main_image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                        IMG
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/seller/products/${product.id}/edit`}
                      className="font-semibold text-sm text-slate-900 hover:text-indigo-600 truncate block"
                    >
                      {product.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5">
                      <span className="font-bold text-blue-600">{formatPrice(product.price)}</span>
                      <span className="text-slate-500">
                        Stock: {product.stock_quantity ?? 0}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${getProductStatusBadge(
                          product.status
                        )}`}
                      >
                        {product.status || 'published'}
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/seller/products/${product.id}/edit`}
                    aria-label={`Edit ${product.name}`}
                    className="p-2 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                  >
                    <PencilSquareIcon className="w-5 h-5" aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Seller Orders */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-slate-900">Recent Store Orders</h2>
            <Link to="/seller/orders" className="text-xs font-semibold text-blue-600 hover:underline">
              Manage Orders ({recentOrders.length}) →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <ShoppingBagIcon className="w-10 h-10 text-slate-300 mx-auto" aria-hidden="true" />
              <p className="text-slate-500 text-sm">No store orders yet</p>
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="dash-orders-caption"
              className="overflow-x-auto"
            >
              <table className="w-full text-left border-collapse">
                <caption id="dash-orders-caption" className="sr-only">
                  Recent orders for {sellerInfo.store_name}
                </caption>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-xs font-semibold text-slate-600">
                      Order
                    </th>
                    <th scope="col" className="px-3 py-2 text-xs font-semibold text-slate-600">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-2 text-xs font-semibold text-slate-600">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2 text-xs font-semibold text-slate-600">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.slice(0, 6).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <th scope="row" className="px-3 py-2.5 text-xs font-bold text-indigo-600">
                        <Link to="/seller/orders" className="hover:underline">
                          #{order.order_number || order.id}
                        </Link>
                      </th>
                      <td className="px-3 py-2.5 text-xs font-semibold text-slate-900">
                        {formatPrice(order.seller_subtotal ?? order.total)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                              order.status === 'delivered'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.status === 'confirmed'
                                ? 'bg-teal-100 text-teal-800'
                                : order.status === 'shipped'
                                ? 'bg-blue-100 text-blue-800'
                                : order.status === 'cancelled'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {order.status || 'pending'}
                          </span>
                          {(order.status === 'pending' || order.status === 'processing') && (
                            <button
                              type="button"
                              disabled={confirmingOrderId === order.id}
                              onClick={() => handleQuickStatus(order.id, 'confirmed')}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                            >
                              {confirmingOrderId === order.id ? '...' : 'OK / Confirm'}
                            </button>
                          )}
                          {order.status === 'confirmed' && (
                            <button
                              type="button"
                              disabled={confirmingOrderId === order.id}
                              onClick={() => handleQuickStatus(order.id, 'shipped')}
                              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold"
                            >
                              {confirmingOrderId === order.id ? '...' : 'Ship'}
                            </button>
                          )}
                          {order.status === 'shipped' && (
                            <button
                              type="button"
                              disabled={confirmingOrderId === order.id}
                              onClick={() => handleQuickStatus(order.id, 'delivered')}
                              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold"
                            >
                              {confirmingOrderId === order.id ? '...' : 'Shift to Delivered'}
                            </button>
                          )}
                          {(order.status === 'delivered' || order.status === 'cancelled') && (
                            <button
                              type="button"
                              disabled={deletingOrderId === order.id}
                              onClick={() => handleDeleteOrder(order.id, order.order_number || order.id)}
                              aria-label={`Delete order ${order.order_number || order.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold"
                            >
                              <TrashIcon className="w-3 h-3" aria-hidden="true" />
                              <span>{deletingOrderId === order.id ? '...' : 'Delete'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {formatDate(order.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
