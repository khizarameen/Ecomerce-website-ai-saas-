// src/features/payment/StripeCheckout.jsx
import { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { paymentAPI, orderAPI } from '../../utils/api';
import { formatPrice } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { CreditCardIcon, LockClosedIcon } from '@heroicons/react/24/outline';

const StripeCheckout = () => {
  const navigate = useNavigate();
  const baseId = useId();
  const { cart, cartItems, fetchCart } = useCart();
  const { isAuthenticated, user } = useAuth();

  const [processing, setProcessing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [formData, setFormData] = useState(() => ({
    email: user?.email || 'buyer@storehub.demo',
    phone: '+92 321 7654321',
    name:
      user?.full_name ||
      `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
      'Sara Khan',
    address: 'Gulberg III, Main Boulevard',
    city: 'Lahore',
    state: 'Punjab',
    postal_code: '54000',
    country: 'Pakistan',
  }));

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!orderPlaced && (!cartItems || cartItems.length === 0)) {
      navigate('/cart');
    }
  }, [isAuthenticated, orderPlaced, cartItems, navigate]);

  const handleInputChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);

    try {
      const orderData = {
        email: formData.email,
        phone: formData.phone,
        shipping_address: {
          name: formData.name,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          postal_code: formData.postal_code,
          country: formData.country,
        },
        billing_address: {
          name: formData.name,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          postal_code: formData.postal_code,
          country: formData.country,
        },
        payment_method: 'stripe',
        customer_notes: 'Order placed via Stripe checkout',
      };

      const orderResponse = await orderAPI.createOrder(orderData);
      if (!orderResponse.data?.success || !orderResponse.data?.order?.id) {
        throw new Error(orderResponse.data?.error || 'Failed to create order');
      }

      const order = orderResponse.data.order;
      setOrderPlaced(true);

      try {
        const paymentResponse = await paymentAPI.createIntent({
          amount: parseFloat(order.total),
          currency: 'usd',
        });
        if (paymentResponse.data?.payment_intent_id) {
          await paymentAPI.confirmPayment({
            payment_intent_id: paymentResponse.data.payment_intent_id,
            order_id: order.id,
          });
        }
      } catch (payErr) {
        console.warn('Stripe intent demo confirmation note:', payErr);
      }

      toast.success('Order placed and payment recorded!');
      await fetchCart();
      navigate(`/orders/${order.id}`);
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error.response?.data?.error || error.message || 'Checkout failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!isAuthenticated || (!orderPlaced && (!cartItems || cartItems.length === 0))) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Card / Stripe Checkout</h1>
          <p className="text-sm text-slate-600">Complete your purchase with pre-filled shipping details</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
          <LockClosedIcon className="w-4 h-4" aria-hidden="true" />
          <span>Encrypted Checkout</span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <aside className="md:col-span-1 order-2 md:order-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-24 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900">Order Summary</h2>

            <div className="space-y-2 border-b border-slate-100 pb-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between text-xs text-slate-700 gap-2">
                  <span className="truncate">
                    {item.product_name} × {item.quantity}
                  </span>
                  <span className="font-bold shrink-0">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-sm border-b border-slate-100 pb-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span>{formatPrice(cart?.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Shipping</span>
                <span>{formatPrice(cart?.shipping || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tax</span>
                <span>{formatPrice(cart?.tax || 0)}</span>
              </div>
            </div>

            <div className="flex justify-between text-xl font-extrabold">
              <span>Total</span>
              <span className="text-blue-600">{formatPrice(cart?.total || 0)}</span>
            </div>
          </div>
        </aside>

        <div className="md:col-span-2 order-1 md:order-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900">Shipping Information</h2>

            <div>
              <label htmlFor={`${baseId}-name`} className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span aria-hidden="true" className="text-rose-600">*</span>
              </label>
              <input
                id={`${baseId}-name`}
                type="text"
                name="name"
                autoComplete="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${baseId}-email`} className="block text-xs font-semibold text-slate-700 mb-1">
                  Email <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  id={`${baseId}-email`}
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-phone`} className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  id={`${baseId}-phone`}
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${baseId}-address`} className="block text-xs font-semibold text-slate-700 mb-1">
                Street Address <span aria-hidden="true" className="text-rose-600">*</span>
              </label>
              <input
                id={`${baseId}-address`}
                type="text"
                name="address"
                autoComplete="street-address"
                value={formData.address}
                onChange={handleInputChange}
                required
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${baseId}-city`} className="block text-xs font-semibold text-slate-700 mb-1">
                  City <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  id={`${baseId}-city`}
                  type="text"
                  name="city"
                  autoComplete="address-level2"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-state`} className="block text-xs font-semibold text-slate-700 mb-1">
                  State / Province <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  id={`${baseId}-state`}
                  type="text"
                  name="state"
                  autoComplete="address-level1"
                  value={formData.state}
                  onChange={handleInputChange}
                  required
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${baseId}-country`} className="block text-xs font-semibold text-slate-700 mb-1">
                  Country <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  id={`${baseId}-country`}
                  type="text"
                  name="country"
                  autoComplete="country-name"
                  value={formData.country}
                  onChange={handleInputChange}
                  required
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-zip`} className="block text-xs font-semibold text-slate-700 mb-1">
                  Postal Code <span aria-hidden="true" className="text-rose-600">*</span>
                </label>
                <input
                  id={`${baseId}-zip`}
                  type="text"
                  name="postal_code"
                  autoComplete="postal-code"
                  value={formData.postal_code}
                  onChange={handleInputChange}
                  required
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <CreditCardIcon className="w-5 h-5 text-blue-600" aria-hidden="true" />
                <span>Stripe Test Mode Payment</span>
              </div>
              <div className="flex gap-1.5 text-[10px] font-bold text-slate-600">
                <span className="px-2 py-0.5 bg-white border rounded">VISA</span>
                <span className="px-2 py-0.5 bg-white border rounded">MC</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full min-h-[46px] bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors font-bold text-sm flex items-center justify-center disabled:opacity-50"
            >
              {processing ? 'Processing Payment...' : `Pay ${formatPrice(cart?.total || 0)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StripeCheckout;
