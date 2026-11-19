// src/features/payment/CODCheckout.jsx
import { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { orderAPI } from '../../utils/api';
import { formatPrice } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { CurrencyDollarIcon, TruckIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const CODCheckout = () => {
  const navigate = useNavigate();
  const baseId = useId();
  const { cart, cartItems, fetchCart } = useCart();
  const { isAuthenticated, user } = useAuth();

  const [loading, setLoading] = useState(false);
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
    notes: '',
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
    setLoading(true);
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
        payment_method: 'cod',
        customer_notes: formData.notes || 'Cash on Delivery',
      };

      const response = await orderAPI.createOrder(orderData);
      if (response.data?.success && response.data?.order?.id) {
        setOrderPlaced(true);
        toast.success('Order placed successfully!');
        await fetchCart();
        navigate(`/orders/${response.data.order.id}`);
      } else {
        toast.error(response.data?.error || 'Failed to place order');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error.response?.data?.error || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated || (!orderPlaced && (!cartItems || cartItems.length === 0))) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CurrencyDollarIcon className="w-8 h-8 text-emerald-600" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Cash on Delivery Checkout</h1>
          <p className="text-sm text-slate-600">Pre-filled shipping details — verify and place order in 1 click</p>
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
              <span className="text-emerald-600">{formatPrice(cart?.total || 0)}</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
              <TruckIcon className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <p className="text-xs text-emerald-800">Pay cash upon doorstep delivery</p>
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
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${baseId}-notes`} className="block text-xs font-semibold text-slate-700 mb-1">
                Delivery Notes
              </label>
              <textarea
                id={`${baseId}-notes`}
                name="notes"
                rows={2}
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Any delivery instructions..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 flex items-start gap-3">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-emerald-800">
                <strong>Cash on Delivery:</strong> Order is created immediately in Seller &amp; Buyer order tracking.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 transition-colors font-bold text-sm flex items-center justify-center disabled:opacity-50"
            >
              {loading ? 'Placing Order...' : `Place COD Order — ${formatPrice(cart?.total || 0)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CODCheckout;
