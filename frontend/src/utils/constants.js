export { API_URL, API_ORIGIN } from './api';

export const PAYMENT_METHODS = [
  { id: 'stripe', name: 'Credit Card (Stripe)', icon: 'credit_card' },
  { id: 'paypal', name: 'PayPal', icon: 'paypal' },
  { id: 'cod', name: 'Cash on Delivery', icon: 'cash' },
  { id: 'bank_transfer', name: 'Bank Transfer', icon: 'bank' },
];

export const ORDER_STATUS = {
  pending: 'Pending',
  processing: 'Processing',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const USER_TYPES = {
  buyer: 'Buyer',
  seller: 'Seller',
  admin: 'Admin',
};

export const ORDER_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
};

export const PAYMENT_STATUS = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};