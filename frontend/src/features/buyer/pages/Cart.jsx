// src/features/buyer/pages/Cart.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { TrashIcon, PlusIcon, MinusIcon, ShoppingBagIcon, ArrowLeftIcon, BanknotesIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../utils/helpers';

const Cart = () => {
  const {
    cart,
    cartItems,
    removeFromCart,
    updateQuantity,
    clearCart,
    total,
    subtotal,
    totalItems,
    loading,
  } = useCart();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(null);

  const handleRemoveItem = async (itemId) => {
    setUpdating(itemId);
    try {
      const result = await removeFromCart(itemId);
      if (result?.success) {
        toast.success('Item removed from cart');
      }
    } finally {
      setUpdating(null);
    }
  };

  const handleUpdateQuantity = async (itemId, newQuantity) => {
    if (newQuantity < 1) {
      await handleRemoveItem(itemId);
      return;
    }

    setUpdating(itemId);
    try {
      const result = await updateQuantity(itemId, newQuantity);
      if (result?.success) {
        toast.success('Cart updated');
      }
    } finally {
      setUpdating(null);
    }
  };

  const handleClearCart = async () => {
    if (!cartItems || cartItems.length === 0) return;
    if (window.confirm('Are you sure you want to clear your cart?')) {
      const result = await clearCart();
      if (result?.success) {
        toast.success('Cart cleared');
      }
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-slate-600">Loading your cart...</p>
      </div>
    );
  }

  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="py-16">
        <div className="text-center max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-10 shadow-sm space-y-4">
          <ShoppingBagIcon className="w-12 h-12 text-slate-300 mx-auto" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold text-slate-900">Your Cart is Empty</h1>
          <p className="text-sm text-slate-600">
            Browse our verified marketplace or launch Demo Buyer to explore live products.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link
              to="/home"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              <ShoppingBagIcon className="w-4 h-4" aria-hidden="true" />
              <span>Buyer Dashboard</span>
            </Link>
            <Link
              to="/products"
              className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
            >
              Browse Catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Shopping Cart</h1>
          <p className="text-sm text-slate-600 mt-1">{totalItems} item(s) ready for checkout</p>
        </div>
        <button
          type="button"
          onClick={handleClearCart}
          className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
        >
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600">
              <div className="col-span-5">Product</div>
              <div className="col-span-3 text-center">Quantity</div>
              <div className="col-span-2 text-center">Price</div>
              <div className="col-span-2 text-right">Subtotal</div>
            </div>

            {cartItems.map((item) => (
              <div key={item.id} className="p-4 md:px-5 hover:bg-slate-50/70 transition-colors">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-5 flex items-center gap-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl shrink-0 overflow-hidden border border-slate-200">
                      {item.product_image ? (
                        <img
                          src={item.product_image}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/products/${item.product_slug}`}
                        className="font-bold text-sm text-slate-900 hover:text-blue-600 transition-colors truncate block"
                      >
                        {item.product_name}
                      </Link>
                      {item.variant_name && (
                        <p className="text-xs text-slate-500">Variant: {item.variant_name}</p>
                      )}
                      <p className="text-xs text-slate-500 md:hidden mt-0.5">
                        {formatPrice(item.price_at_add)} each
                      </p>
                    </div>
                  </div>

                  <div className="md:col-span-3 flex items-center md:justify-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.product_name}`}
                      onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                      disabled={updating === item.id || item.quantity <= 1}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <MinusIcon className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">
                      {updating === item.id ? '...' : item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.product_name}`}
                      onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                      disabled={updating === item.id}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <PlusIcon className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="hidden md:block md:col-span-2 text-center text-sm font-medium text-slate-700">
                    {formatPrice(item.price_at_add)}
                  </div>

                  <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-3">
                    <span className="font-extrabold text-sm text-blue-600">
                      {formatPrice(item.subtotal)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.product_name} from cart`}
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={updating === item.id}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    >
                      <TrashIcon className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/home"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
            <span>Back to Buyer Dashboard</span>
          </Link>
        </div>

        {/* Order Summary */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-24 space-y-4">
            <h2 className="text-lg font-extrabold text-slate-900">Order Summary</h2>

            <div className="space-y-2.5 border-b border-slate-100 pb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-semibold text-slate-900">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Shipping</span>
                <span className="font-semibold text-slate-900">
                  {Number(cart?.shipping) > 0 ? formatPrice(cart.shipping) : 'Free'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Estimated Tax (10%)</span>
                <span className="font-semibold text-slate-900">{formatPrice(cart?.tax || 0)}</span>
              </div>
              {Number(cart?.discount) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span className="font-semibold">-{formatPrice(cart.discount)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between text-xl font-extrabold text-slate-900">
              <span>Total</span>
              <span className="text-blue-600">{formatPrice(total)}</span>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => navigate('/checkout/cod')}
                className="w-full min-h-[44px] bg-emerald-600 text-white px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors font-bold text-sm flex items-center justify-center gap-2"
              >
                <BanknotesIcon className="w-5 h-5" aria-hidden="true" />
                <span>Cash on Delivery Checkout</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/checkout/stripe')}
                className="w-full min-h-[44px] bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-bold text-sm flex items-center justify-center gap-2"
              >
                <CreditCardIcon className="w-5 h-5" aria-hidden="true" />
                <span>Card / Stripe Checkout</span>
              </button>

              <Link
                to="/payment/methods"
                className="block w-full text-center py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition-colors"
              >
                Compare All Payment Methods →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Cart;
