// src/context/CartContext.jsx
import { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { cartAPI } from '../utils/api';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const CartContext = createContext();

const INITIAL_META = {
  id: null,
  subtotal: 0,
  tax: 0,
  shipping: 0,
  discount: 0,
  total: 0,
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [cartMeta, setCartMeta] = useState(INITIAL_META);
  const [loading, setLoading] = useState(false);
  const [cartTotal, setCartTotal] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const { isAuthenticated, user } = useAuth();

  const applyCartPayload = useCallback((rawData) => {
    const cartData = rawData?.cart || rawData?.data?.cart || rawData || {};
    const items = Array.isArray(cartData?.items) ? cartData.items : [];
    const total = items.reduce((sum, item) => {
      const price = Number(item.price_at_add ?? item.price ?? item.product?.price ?? 0);
      const quantity = Number(item.quantity || 1);
      return sum + price * quantity;
    }, 0);
    const count = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);

    setCartItems(items);
    setCartTotal(total);
    setItemCount(count);
    setCartMeta({
      id: cartData.id || null,
      subtotal: Number(cartData.subtotal ?? total),
      tax: cartData.tax !== undefined ? Number(cartData.tax) : +(total * 0.1).toFixed(2),
      shipping:
        cartData.shipping !== undefined
          ? Number(cartData.shipping)
          : items.length > 0
          ? 5.99
          : 0,
      discount: Number(cartData.discount ?? 0),
      total:
        cartData.total !== undefined
          ? Number(cartData.total)
          : items.length > 0
          ? +(total * 1.1 + 5.99).toFixed(2)
          : 0,
    });
  }, []);

  const fetchCart = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setCartItems([]);
      setCartMeta(INITIAL_META);
      setCartTotal(0);
      setItemCount(0);
      setLoading(false);
      setInitialized(true);
      return;
    }

    try {
      setLoading(true);
      const response = await cartAPI.getCart();
      applyCartPayload(response.data);
    } catch (error) {
      console.error('Error fetching cart:', error);
      setCartItems([]);
      setCartMeta(INITIAL_META);
      setCartTotal(0);
      setItemCount(0);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [applyCartPayload, isAuthenticated, user]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated || !user) {
        await Promise.resolve();
        if (active) {
          setCartItems([]);
          setCartMeta(INITIAL_META);
          setCartTotal(0);
          setItemCount(0);
          setLoading(false);
          setInitialized(true);
        }
        return;
      }

      try {
        const response = await cartAPI.getCart();
        if (active) applyCartPayload(response.data);
      } catch (error) {
        console.error('Error initializing cart:', error);
        if (active) {
          setCartItems([]);
          setCartMeta(INITIAL_META);
          setCartTotal(0);
          setItemCount(0);
        }
      } finally {
        if (active) {
          setLoading(false);
          setInitialized(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [applyCartPayload, isAuthenticated, user]);

  const addToCart = async (productId, quantity = 1, variantData = null) => {
    if (!isAuthenticated) {
      toast.error('Please login to add items to cart');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const data = {
        product_id: productId,
        product: productId,
        quantity,
        ...variantData,
      };
      const response = await cartAPI.addToCart(data);
      if (response.data?.success === false) {
        const msg = response.data?.error || 'Failed to add to cart';
        toast.error(msg);
        return { success: false, error: msg };
      }
      toast.success('Added to cart!');
      await fetchCart();
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error adding to cart:', error);
      const errData = error.response?.data;
      const msg =
        errData?.product_id?.[0] ||
        errData?.quantity?.[0] ||
        errData?.error ||
        errData?.message ||
        'Failed to add to cart';
      toast.error(error.response?.status === 401 ? 'Please login to add items to cart' : msg);
      return { success: false, error: errData || msg };
    }
  };

  const removeFromCart = async (itemId) => {
    if (!isAuthenticated) {
      toast.error('Please login to manage cart');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await cartAPI.removeFromCart(itemId);
      await fetchCart();
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error removing from cart:', error);
      toast.error(error.response?.status === 401 ? 'Please login to manage cart' : 'Failed to remove from cart');
      return { success: false, error: error.response?.data || 'Failed to remove from cart' };
    }
  };

  const updateCartItem = async (itemId, quantity) => {
    if (!isAuthenticated) {
      toast.error('Please login to update cart');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await cartAPI.updateCartItem(itemId, { quantity });
      await fetchCart();
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error updating cart:', error);
      toast.error(error.response?.status === 401 ? 'Please login to update cart' : 'Failed to update cart');
      return { success: false, error: error.response?.data || 'Failed to update cart' };
    }
  };

  const clearCart = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to clear cart');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      await cartAPI.clearCart();
      setCartItems([]);
      setCartMeta(INITIAL_META);
      setCartTotal(0);
      setItemCount(0);
      return { success: true };
    } catch (error) {
      console.error('Error clearing cart:', error);
      toast.error(error.response?.status === 401 ? 'Please login to clear cart' : 'Failed to clear cart');
      return { success: false, error: error.response?.data || 'Failed to clear cart' };
    }
  };

  const cart = useMemo(
    () => ({
      ...cartMeta,
      items: cartItems,
      subtotal: cartMeta.subtotal || cartTotal,
      shipping: cartItems.length > 0 ? (cartMeta.shipping ?? 5.99) : 0,
      tax: cartMeta.tax ?? +(cartTotal * 0.1).toFixed(2),
      discount: cartMeta.discount || 0,
      total:
        cartMeta.total ||
        (cartItems.length > 0 ? +(cartTotal * 1.1 + 5.99).toFixed(2) : 0),
      total_items: itemCount,
    }),
    [cartItems, cartMeta, cartTotal, itemCount]
  );

  const getCartCount = () => itemCount;
  const getCartTotal = () => cartTotal;
  const isInCart = (productId) =>
    cartItems.some((item) => item.product === productId || item.product?.id === productId);
  const getItemQuantity = (productId) => {
    const found = cartItems.find((item) => item.product === productId || item.product?.id === productId);
    return found ? found.quantity : 0;
  };

  const value = {
    cart,
    cartItems,
    loading,
    cartTotal,
    subtotal: cart.subtotal,
    total: cart.total,
    itemCount,
    totalItems: itemCount,
    initialized,
    fetchCart,
    addToCart,
    removeFromCart,
    updateCartItem,
    updateQuantity: updateCartItem,
    clearCart,
    getCartCount,
    getCartTotal,
    isInCart,
    getItemQuantity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
