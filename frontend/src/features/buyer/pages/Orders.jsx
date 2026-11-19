import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { orderAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import { formatDate, formatPrice, getStatusColor } from '../../../utils/helpers';
import toast from 'react-hot-toast';

const CANCEL_REASONS = [
  'Changed my mind / Found a better deal',
  'Delivery taking too long',
  'Ordered wrong variant or quantity',
  'Prefer not to accept COD at doorstep',
  'Received wrong or damaged product',
];

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelPhotoFile, setCancelPhotoFile] = useState(null);
  const [cancelPhotoPreview, setCancelPhotoPreview] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
  });

  useEffect(() => {
    return () => {
      if (cancelPhotoPreview) {
        URL.revokeObjectURL(cancelPhotoPreview);
      }
    };
  }, [cancelPhotoPreview]);

  const clearCancelPhoto = () => {
    if (cancelPhotoPreview) {
      URL.revokeObjectURL(cancelPhotoPreview);
    }
    setCancelPhotoFile(null);
    setCancelPhotoPreview('');
  };

  const handleSelectCancelPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG, or WebP).');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo size must be under 5 MB.');
      e.target.value = '';
      return;
    }
    if (cancelPhotoPreview) {
      URL.revokeObjectURL(cancelPhotoPreview);
    }
    setCancelPhotoFile(file);
    setCancelPhotoPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = statusFilter ? { status: statusFilter } : {};
        const response = await orderAPI.getOrders(params);
        let ordersData = [];
        let count = 0;

        if (response.data.results) {
          ordersData = response.data.results;
          count = response.data.count || ordersData.length;
        } else if (response.data.orders) {
          ordersData = response.data.orders;
          count = response.data.count || ordersData.length;
        } else if (Array.isArray(response.data)) {
          ordersData = response.data;
          count = ordersData.length;
        }

        if (active) {
          setOrders(ordersData);
          setPagination({
            count,
            next: response.data.next || null,
            previous: response.data.previous || null,
          });
        }
      } catch (error) {
        if (active) {
          toast.error(error.response?.data?.error || 'Failed to load orders');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [statusFilter]);

  const getOrderItemsPreview = (order) => {
    // Handle different order item structures
    if (order.order_items && order.order_items.length > 0) {
      return order.order_items.map(item => item.product_name || item.name || 'Product');
    }
    if (order.items && order.items.length > 0) {
      return order.items.map(item => item.product_name || item.name || 'Product');
    }
    if (order.items_preview) {
      return order.items_preview;
    }
    return ['No items'];
  };

  const getOrderTotal = (order) => {
    return order.total || order.amount || 0;
  };

  const getOrderStatus = (order) => {
    return order.status || order.order_status || 'pending';
  };

  const getPaymentStatus = (order) => {
    return order.payment_status || 'pending';
  };

  const canCancelOrder = (orderStatus) => {
    const normalized = String(orderStatus || '').toLowerCase();
    return normalized !== 'delivered' && normalized !== 'cancelled' && normalized !== 'refunded';
  };

  const handleConfirmCancel = async (orderId) => {
    setCancellingId(orderId);
    try {
      let payload;
      if (cancelPhotoFile) {
        payload = new FormData();
        payload.append('status', 'cancelled');
        payload.append('note', cancelReason);
        payload.append('cancel_photo', cancelPhotoFile);
      } else {
        payload = {
          status: 'cancelled',
          note: cancelReason,
        };
      }
      const res = await orderAPI.updateOrderStatus(orderId, payload);
      const updated = res.data?.order;
      const recovery = res.data?.recovery;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: updated?.status || 'cancelled', order_status: 'cancelled' } : o
        )
      );
      setCancelTargetId(null);
      clearCancelPhoto();
      if (recovery?.has_cancel_photo) {
        const verdict = recovery.photo_verification_status || 'CHECKED';
        const conf = recovery.photo_verification_result?.confidence_score ?? '';
        toast.success(
          `Order cancelled & photo sent to Seller AI Agent (${verdict}${conf ? ` ${conf}%` : ''}).`
        );
      } else {
        toast.success('Order cancelled and sent to the seller for Next-Customer reassignment.');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel order');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <Loader />;

  if (orders.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <div className="text-6xl mb-4">📦</div>
          <h2 className="text-3xl font-bold mb-4">No Orders Yet</h2>
          <p className="text-gray-600 mb-8">Start shopping to place your first order</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/products" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors inline-block font-semibold">
              Start Shopping
            </Link>
            <Link to="/cancelled-deals" className="bg-gradient-to-r from-amber-500 to-rose-500 text-white px-6 py-3 rounded-lg hover:brightness-110 transition-all inline-block font-bold">
              🔥 Cancelled Order Deals
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">My Orders 📦</h1>
          {pagination.count > 0 && (
            <span className="text-gray-600 text-sm">
              {pagination.count} order{pagination.count > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Link
          to="/cancelled-deals"
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:brightness-110 text-white text-xs font-extrabold shadow-sm inline-flex items-center gap-1.5"
        >
          <span>🔥 Browse Cancelled Order Deals</span>
        </Link>
      </div>

      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Orders</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="confirmed">Confirmed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="space-y-4">
        {orders.map((order) => {
          const orderStatus = getOrderStatus(order);
          const paymentStatus = getPaymentStatus(order);
          const itemsPreview = getOrderItemsPreview(order);
          const total = getOrderTotal(order);
          
          return (
            <div key={order.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-4 border-b bg-gray-50">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <span className="font-semibold text-gray-800">
                      Order #{order.order_number || order.id}
                    </span>
                    <span className="text-sm text-gray-600 ml-4">
                      {formatDate(order.created_at || order.created_date || order.order_date)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(orderStatus)}`}>
                      {orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 
                      paymentStatus === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="space-y-1">
                  {itemsPreview.slice(0, 3).map((item, index) => (
                    <div key={index} className="flex justify-between text-sm text-gray-600">
                      <span>• {item}</span>
                    </div>
                  ))}
                  {itemsPreview.length > 3 && (
                    <div className="text-sm text-gray-500">
                      + {itemsPreview.length - 3} more items
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-between items-center gap-3 mt-4 pt-4 border-t">
                  <div>
                    <span className="text-sm text-gray-600">Total</span>
                    <span className="text-xl font-bold text-blue-600 ml-2">{formatPrice(total)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {canCancelOrder(orderStatus) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelTargetId(cancelTargetId === order.id ? null : order.id);
                          setCancelReason(CANCEL_REASONS[0]);
                          clearCancelPhoto();
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
                      >
                        Cancel Product / Order
                      </button>
                    )}
                    <Link
                      to={`/orders/${order.id}`}
                      className="text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>

                {cancelTargetId === order.id && canCancelOrder(orderStatus) && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-rose-900">
                        Select cancellation reason (notify seller immediately):
                      </p>
                      <button
                        type="button"
                        onClick={() => setCancelTargetId(null)}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
                      >
                        Keep Order
                      </button>
                    </div>
                    <select
                      aria-label={`Cancellation reason for order ${order.order_number || order.id}`}
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-rose-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      {CANCEL_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>

                    <div className="rounded-lg border border-dashed border-rose-300 bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor={`cancel-photo-${order.id}`}
                          className="text-xs font-bold text-slate-800 cursor-pointer"
                        >
                          📸 Upload Product Photo (Optional — helps Seller AI verify original item)
                        </label>
                        {cancelPhotoFile && (
                          <button
                            type="button"
                            onClick={clearCancelPhoto}
                            className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                      <input
                        id={`cancel-photo-${order.id}`}
                        type="file"
                        accept="image/*"
                        onChange={handleSelectCancelPhoto}
                        className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-rose-100 file:text-rose-800 hover:file:bg-rose-200 cursor-pointer"
                      />
                      {cancelPhotoPreview && (
                        <div className="flex items-center gap-3 pt-1">
                          <img
                            src={cancelPhotoPreview}
                            alt="Selected product preview"
                            className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                          />
                          <div className="text-[11px] text-slate-600">
                            <p className="font-semibold text-slate-800 truncate max-w-[220px]">
                              {cancelPhotoFile?.name}
                            </p>
                            <p className="text-emerald-700 font-medium">
                              Will be inspected by Seller AI Vision Agent on cancel.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={cancellingId === order.id}
                        onClick={() => handleConfirmCancel(order.id)}
                        className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {cancellingId === order.id
                          ? 'Uploading & Notifying Seller AI...'
                          : 'Confirm Cancel & Notify Seller'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Orders;