import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { orderAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import { formatPrice, formatDate, getStatusColor } from '../../../utils/helpers';
import toast from 'react-hot-toast';

const CANCEL_REASONS = [
  'Changed my mind / Found a better deal',
  'Delivery taking too long',
  'Ordered wrong variant or quantity',
  'Prefer not to accept COD at doorstep',
  'Received wrong or damaged product',
];

const OrderDetail = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCancelPanel, setShowCancelPanel] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelPhotoFile, setCancelPhotoFile] = useState(null);
  const [cancelPhotoPreview, setCancelPhotoPreview] = useState('');
  const [cancelling, setCancelling] = useState(false);

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
        const response = await orderAPI.getOrder(id);
        let orderData = null;
        if (response.data.order) {
          orderData = response.data.order;
        } else if (response.data) {
          orderData = response.data;
        }
        if (active) {
          if (orderData) {
            setOrder(orderData);
          } else {
            toast.error('Order not found');
          }
        }
      } catch (error) {
        if (active) {
          toast.error(error.response?.data?.error || 'Failed to load order');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const getOrderItems = (order) => {
    // Handle different order item structures
    if (order.order_items && order.order_items.length > 0) {
      return order.order_items;
    }
    if (order.items && order.items.length > 0) {
      return order.items;
    }
    if (order.orderItems && order.orderItems.length > 0) {
      return order.orderItems;
    }
    return [];
  };

  const getShippingAddress = (order) => {
    if (order.shipping_address) {
      return order.shipping_address;
    }
    if (order.shippingAddress) {
      return order.shippingAddress;
    }
    if (order.address) {
      return order.address;
    }
    return null;
  };

  if (loading) return <Loader />;
  
  if (!order) return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-bold text-gray-600">Order not found</h2>
        <Link to="/orders" className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
          ← Back to Orders
        </Link>
      </div>
    </div>
  );

  const orderItems = getOrderItems(order);
  const shippingAddress = getShippingAddress(order);

  const currentStatus = String(order.status || order.order_status || 'pending').toLowerCase();
  const canCancel = currentStatus !== 'delivered' && currentStatus !== 'cancelled' && currentStatus !== 'refunded';

  const handleConfirmCancel = async () => {
    setCancelling(true);
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
      const res = await orderAPI.updateOrderStatus(order.id, payload);
      const updated = res.data?.order;
      const recovery = res.data?.recovery;
      setOrder((prev) => ({
        ...prev,
        ...(updated || {}),
        status: updated?.status || 'cancelled',
        order_status: 'cancelled',
      }));
      setShowCancelPanel(false);
      clearCancelPhoto();
      if (recovery?.has_cancel_photo) {
        const verdict = recovery.photo_verification_status || 'CHECKED';
        const conf = recovery.photo_verification_result?.confidence_score ?? '';
        toast.success(
          `Order cancelled & photo sent to Seller AI Agent (${verdict}${conf ? ` ${conf}%` : ''}).`
        );
      } else {
        toast.success('Order cancelled and sent to the seller for Next-Customer deal recovery.');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not cancel order');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between mb-6 gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">
            Order #{order.order_number || order.id}
          </h1>
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status || order.order_status || 'pending')}`}>
              {(order.status || order.order_status || 'pending').charAt(0).toUpperCase() + (order.status || order.order_status || 'pending').slice(1)}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              (order.payment_status || 'pending') === 'paid' ? 'bg-green-100 text-green-800' : 
              (order.payment_status || 'pending') === 'failed' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {(order.payment_status || 'pending').charAt(0).toUpperCase() + (order.payment_status || 'pending').slice(1)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Order Info */}
          <div className="p-6 border-b bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Order Date</p>
                <p className="font-semibold text-gray-800">
                  {formatDate(order.created_at || order.created_date || order.order_date)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Status</p>
                <p className={`font-semibold ${
                  (order.payment_status || 'pending') === 'paid' ? 'text-green-600' : 
                  (order.payment_status || 'pending') === 'failed' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {(order.payment_status || 'pending').charAt(0).toUpperCase() + (order.payment_status || 'pending').slice(1)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="font-semibold text-blue-600">{formatPrice(order.total || order.amount || 0)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-semibold capitalize">{order.payment_method || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {shippingAddress && (
            <div className="p-6 border-b">
              <h2 className="font-semibold mb-2 text-gray-700">Shipping Address</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium text-gray-800">{shippingAddress.name || 'N/A'}</p>
                <p className="text-gray-600">{shippingAddress.address || shippingAddress.line1 || 'N/A'}</p>
                <p className="text-gray-600">
                  {shippingAddress.city || 'N/A'}, {shippingAddress.state || 'N/A'}
                </p>
                <p className="text-gray-600">
                  {shippingAddress.country || 'N/A'} - {shippingAddress.postal_code || shippingAddress.zip || 'N/A'}
                </p>
                {order.phone && (
                  <p className="mt-2 text-sm text-gray-600">📞 {order.phone}</p>
                )}
                {order.email && (
                  <p className="text-sm text-gray-600">📧 {order.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Order Items */}
          <div className="p-6 border-b">
            <h2 className="font-semibold mb-4 text-gray-700">Order Items</h2>
            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id || item.product_id} className="flex flex-wrap items-center justify-between border-b pb-3 last:border-b-0">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                      {item.product_image || item.image ? (
                        <img 
                          src={item.product_image || item.image} 
                          alt={item.product_name || item.name} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                          📦
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{item.product_name || item.name || 'Product'}</p>
                      {item.variant_name && (
                        <p className="text-sm text-gray-500">Variant: {item.variant_name}</p>
                      )}
                      <p className="text-sm text-gray-500">Qty: {item.quantity || 1}</p>
                      <p className="text-sm text-gray-500">{formatPrice(item.price || 0)} each</p>
                    </div>
                  </div>
                  <p className="font-semibold text-blue-600">{formatPrice(item.total || (item.price || 0) * (item.quantity || 1))}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="p-6 border-t bg-gray-50">
            <div className="flex justify-end">
              <div className="w-full md:w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatPrice(order.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span>{formatPrice(order.shipping_cost || order.shipping || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tax</span>
                  <span>{formatPrice(order.tax || 0)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount</span>
                    <span>-{formatPrice(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total</span>
                  <span className="text-blue-600">{formatPrice(order.total || order.amount || 0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tracking Info */}
          {order.tracking_number && (
            <div className="p-6 border-t">
              <h2 className="font-semibold mb-2 text-gray-700">Tracking Information</h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-600">
                  Tracking Number: <span className="font-semibold text-gray-800">{order.tracking_number}</span>
                </p>
                <p className="text-gray-600">
                  Carrier: {order.shipping_carrier || 'N/A'}
                </p>
                {order.estimated_delivery && (
                  <p className="text-gray-600">
                    Estimated Delivery: {formatDate(order.estimated_delivery)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Customer Notes */}
          {order.customer_notes && (
            <div className="p-6 border-t">
              <h2 className="font-semibold mb-2 text-gray-700">Order Notes</h2>
              <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{order.customer_notes}</p>
            </div>
          )}

          {/* Admin Notes */}
          {order.admin_notes && (
            <div className="p-6 border-t">
              <h2 className="font-semibold mb-2 text-gray-700">Admin Notes</h2>
              <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{order.admin_notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="p-6 border-t bg-gray-50 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/orders" className="text-blue-600 hover:text-blue-700 inline-flex items-center">
                ← Back to Orders
              </Link>
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setShowCancelPanel((prev) => !prev)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
                >
                  {showCancelPanel ? 'Keep Order' : 'Cancel Product / Order'}
                </button>
              )}
              {order.status !== 'delivered' && order.status !== 'cancelled' && (
                <Link
                  to="/support"
                  className="text-gray-600 hover:text-gray-700 inline-flex items-center ml-auto"
                >
                  Need Help? Contact Support →
                </Link>
              )}
            </div>

            {showCancelPanel && canCancel && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
                <p className="text-xs font-bold text-rose-900">
                  Confirm Product / Order Cancellation (alerts Seller AI Next-Customer Recovery):
                </p>
                <select
                  aria-label="Cancellation reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-rose-300 bg-white"
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
                      htmlFor={`order-detail-cancel-photo-${order.id}`}
                      className="text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      📸 Upload Product Photo (Optional — sent to Seller AI to verify original item)
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
                    id={`order-detail-cancel-photo-${order.id}`}
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
                          Will be verified by Seller AI Vision Agent on cancel.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {cancelling ? 'Uploading & Notifying Seller AI...' : 'Confirm Cancel & Notify Seller'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;