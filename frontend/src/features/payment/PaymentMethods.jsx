// src/features/payment/PaymentMethods.jsx
import { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentAPI } from '../../utils/api';
import { useCart } from '../../context/CartContext';
import Loader from '../../components/common/Loader';
import {
  CreditCardIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  CurrencyDollarIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const DEFAULT_METHODS = [
  { id: 'cod', name: 'Cash on Delivery (COD)', enabled: true },
  { id: 'stripe', name: 'Credit / Debit Card (Stripe)', enabled: true },
];

const PaymentMethods = () => {
  const navigate = useNavigate();
  const groupId = useId();
  const { totalItems } = useCart();
  const [methods, setMethods] = useState(DEFAULT_METHODS);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState('cod');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await paymentAPI.getMethods();
        const remote = response.data?.payment_methods || response.data?.methods;
        if (active && Array.isArray(remote) && remote.length > 0) {
          setMethods(remote);
        }
      } catch (error) {
        console.error('Error fetching payment methods:', error);
        if (active) toast.error('Using default payment options');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const getIcon = (id) => {
    switch (id) {
      case 'stripe':
        return <CreditCardIcon className="w-7 h-7 text-blue-600" aria-hidden="true" />;
      case 'paypal':
        return <BanknotesIcon className="w-7 h-7 text-sky-500" aria-hidden="true" />;
      case 'cod':
        return <CurrencyDollarIcon className="w-7 h-7 text-emerald-600" aria-hidden="true" />;
      case 'bank_transfer':
        return <BuildingOfficeIcon className="w-7 h-7 text-indigo-600" aria-hidden="true" />;
      default:
        return <CreditCardIcon className="w-7 h-7 text-slate-600" aria-hidden="true" />;
    }
  };

  const handleContinue = () => {
    if (selectedMethod === 'cod') {
      navigate('/checkout/cod');
    } else {
      navigate('/checkout/stripe');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">Payment Methods</h1>
        <p className="text-sm text-slate-600 mt-1">
          Choose how you want to pay ({totalItems} item(s) in cart)
        </p>
      </div>

      <fieldset className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <legend className="text-base font-bold text-slate-900 px-1">Select Payment Method</legend>

        <div className="space-y-3">
          {methods.map((method) => {
            const inputId = `${groupId}-${method.id}`;
            const isSelected = selectedMethod === method.id;
            return (
              <label
                key={method.id}
                htmlFor={inputId}
                className={`block border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="payment_method"
                  value={method.id}
                  checked={isSelected}
                  onChange={() => setSelectedMethod(method.id)}
                  className="sr-only"
                />
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {getIcon(method.id)}
                    <div>
                      <p className="font-bold text-slate-900">{method.name}</p>
                      <p className="text-xs text-slate-500">
                        {method.id === 'stripe' && 'Pay securely with credit or debit card'}
                        {method.id === 'paypal' && 'Pay with your PayPal balance'}
                        {method.id === 'cod' && 'Pay in cash when your order arrives'}
                        {method.id === 'bank_transfer' && 'Direct bank settlement'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        method.enabled !== false
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {method.enabled !== false ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Encrypted checkout powered by StoreHub Orders
          </p>
          <button
            type="button"
            onClick={handleContinue}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
          >
            <span>Continue to Checkout</span>
            <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </fieldset>
    </div>
  );
};

export default PaymentMethods;
