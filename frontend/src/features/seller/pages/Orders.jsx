// src/features/seller/pages/Orders.jsx
import { useState, useEffect, useId, Fragment } from 'react';
import { sellerAPI, orderAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import NextCustomerDealCopilot from '../components/NextCustomerDealCopilot';
import { formatPrice, formatDate } from '../../../utils/helpers';
import {
  CheckCircleIcon,
  TruckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ShoppingBagIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const filterId = useId();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await sellerAPI.getMyOrders();
        const data = res.data?.orders || res.data?.results || [];
        if (active) setOrders(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching seller orders:', error);
        if (active) {
          toast.error('Failed to load customer orders for your store');
          setOrders([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadNonce]);

  const updateOrderStatus = async (orderId, nextStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await orderAPI.updateOrderStatus(orderId, { status: nextStatus });
      const updatedOrder = res.data?.order;
      toast.success(`Order ${nextStatus === 'confirmed' ? 'confirmed (OK)' : `marked as ${nextStatus}`}`);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: updatedOrder?.status || nextStatus,
                payment_status: updatedOrder?.payment_status || o.payment_status,
              }
            : o
        )
      );
      if (nextStatus === 'cancelled') {
        setReloadNonce((n) => n + 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update order status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    if (!window.confirm(`Delete order #${orderNumber}?`)) return;
    setDeletingId(orderId);
    try {
      await orderAPI.deleteOrder(orderId);
      toast.success(`Order #${orderNumber} deleted`);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete order');
    } finally {
      setDeletingId(null);
    }
  };

  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'processing').length;
  const activeCount = orders.filter((o) => o.status === 'confirmed' || o.status === 'shipped').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  const visibleOrders = statusFilter
    ? orders.filter((o) => o.status === statusFilter)
    : orders;

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            Customer Orders for Your Products
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {visibleOrders.length} of {orders.length} order(s) shown · Confirm &amp; fulfill buyer purchases
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={filterId} className="text-xs font-semibold text-slate-600">
            Filter Status:
          </label>
          <select
            id={filterId}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[40px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Orders ({orders.length})</option>
            <option value="pending">Pending ({orders.filter((o) => o.status === 'pending').length})</option>
            <option value="processing">Processing</option>
            <option value="confirmed">Confirmed (OK)</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Live Buyer-Cancelled Order Recovery Desk (Compact Collapsible) */}
      <div id="next-customer-deal-desk">
        <NextCustomerDealCopilot
          collapsible
          defaultExpanded={false}
          refreshKey={reloadNonce}
          onDealClosed={() => setReloadNonce((n) => n + 1)}
        />
      </div>

      {/* Quick Seller Order Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs font-bold uppercase text-amber-800">Awaiting Confirmation</p>
          <p className="text-2xl font-extrabold text-amber-900 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs font-bold uppercase text-blue-800">Confirmed &amp; In Transit</p>
          <p className="text-2xl font-extrabold text-blue-900 mt-1">{activeCount}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-xs font-bold uppercase text-emerald-800">Delivered</p>
          <p className="text-2xl font-extrabold text-emerald-900 mt-1">{deliveredCount}</p>
        </div>
      </div>

      {visibleOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <ShoppingBagIcon className="w-10 h-10 text-slate-300 mx-auto" aria-hidden="true" />
          <p className="text-slate-700 font-semibold">No customer orders for your store yet</p>
          <p className="text-xs text-slate-500">
            When a buyer orders one of your published products, it will appear here for confirmation.
          </p>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="seller-orders-caption"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto"
        >
          <table className="w-full text-left border-collapse">
            <caption id="seller-orders-caption" className="sr-only">
              Customer orders for products sold by your store
            </caption>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Order #
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Buyer &amp; Address
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Ordered Items
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Your Earnings
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Payment
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Quick Action / Status
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOrders.map((order) => {
                const items =
                  Array.isArray(order.seller_items) && order.seller_items.length > 0
                    ? order.seller_items
                    : Array.isArray(order.order_items)
                    ? order.order_items
                    : [];
                const isExpanded = expandedOrderId === order.id;
                const isBusy = updatingId === order.id || deletingId === order.id;
                const addr = order.shipping_address || {};

                return (
                  <Fragment key={order.id}>
                    <tr className="hover:bg-slate-50/80 align-top">
                      <th scope="row" className="px-4 py-3.5 text-sm font-bold text-slate-900 whitespace-nowrap">
                        <p>{order.order_number}</p>
                        <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                          {formatDate(order.created_at)}
                        </p>
                      </th>

                      <td className="px-4 py-3.5 text-xs text-slate-700 min-w-[170px]">
                        <p className="font-bold text-slate-900">
                          {order.buyer_name || addr.name || order.user_name || 'Buyer'}
                        </p>
                        <p className="text-slate-500">{order.email}</p>
                        {order.phone && <p className="text-slate-500">{order.phone}</p>}
                        {addr.city && (
                          <p className="text-slate-500 truncate max-w-[200px]">
                            {addr.city}{addr.country ? `, ${addr.country}` : ''}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-700 min-w-[210px]">
                        {items.length > 0 ? (
                          <ul className="space-y-1">
                            {items.map((item, idx) => (
                              <li key={item.id || idx} className="font-medium text-slate-800">
                                {item.product_name}{' '}
                                <span className="text-indigo-700 font-bold">×{item.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400">
                            {(order.items_preview || []).join(', ') || `${order.total_items || 1} item(s)`}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-sm font-extrabold text-slate-900 whitespace-nowrap">
                        {formatPrice(order.seller_subtotal ?? order.total)}
                        {order.seller_subtotal && Number(order.seller_subtotal) !== Number(order.total) && (
                          <p className="text-[11px] font-normal text-slate-500">
                            Order Total: {formatPrice(order.total)}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                        <span className="block font-semibold uppercase text-slate-600 mb-1">
                          {order.payment_method || 'cod'}
                        </span>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            order.payment_status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.payment_status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {order.payment_status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs space-y-2 min-w-[190px]">
                        {(order.status === 'pending' || order.status === 'processing') && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => updateOrderStatus(order.id, 'confirmed')}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors disabled:opacity-50"
                          >
                            <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
                            <span>{updatingId === order.id ? 'Updating...' : 'OK / Confirm Order'}</span>
                          </button>
                        )}

                        {order.status === 'confirmed' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => updateOrderStatus(order.id, 'shipped')}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:opacity-50"
                          >
                            <TruckIcon className="w-4 h-4" aria-hidden="true" />
                            <span>{updatingId === order.id ? 'Updating...' : 'Mark Shipped'}</span>
                          </button>
                        )}

                        {order.status === 'shipped' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors disabled:opacity-50"
                          >
                            <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
                            <span>{updatingId === order.id ? 'Updating...' : 'Shift to Delivered'}</span>
                          </button>
                        )}

                        {order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold transition-colors disabled:opacity-50"
                          >
                            <XCircleIcon className="w-4 h-4" aria-hidden="true" />
                            <span>Cancel Order</span>
                          </button>
                        )}

                        {(order.status === 'delivered' || order.status === 'cancelled') && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteOrder(order.id, order.order_number)}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors disabled:opacity-50"
                          >
                            <TrashIcon className="w-4 h-4" aria-hidden="true" />
                            <span>{deletingId === order.id ? 'Deleting...' : 'Delete Order'}</span>
                          </button>
                        )}

                        {order.status === 'cancelled' && (
                          <a
                            href="#next-customer-deal-desk"
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors text-center"
                          >
                            <span>🤝 Deal Next Customer</span>
                          </a>
                        )}

                        <select
                          aria-label={`Order status for ${order.order_number}`}
                          value={order.status}
                          disabled={isBusy}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white capitalize"
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="confirmed">Confirmed (OK)</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                        >
                          <span>{isExpanded ? 'Hide' : 'Details'}</span>
                          {isExpanded ? (
                            <ChevronUpIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDownIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={7} className="px-6 py-4 text-xs text-slate-700">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="font-bold text-slate-900 uppercase">Shipping Details</p>
                              <p>Recipient: {addr.name || order.buyer_name || 'Buyer'}</p>
                              <p>
                                Address: {addr.address || 'N/A'}, {addr.city || ''}{' '}
                                {addr.state || ''} {addr.postal_code || ''}
                              </p>
                              <p>Phone: {order.phone || 'N/A'}</p>
                              {order.customer_notes && (
                                <p className="text-indigo-700 font-medium">
                                  Note: {order.customer_notes}
                                </p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <p className="font-bold text-slate-900 uppercase">Your Product Breakdown</p>
                              <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 px-3">
                                {items.map((item, idx) => (
                                  <div key={item.id || idx} className="py-2 flex justify-between gap-2">
                                    <span>
                                      {item.product_name} × {item.quantity}
                                    </span>
                                    <span className="font-bold text-slate-900">
                                      {formatPrice(item.total)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Orders;
