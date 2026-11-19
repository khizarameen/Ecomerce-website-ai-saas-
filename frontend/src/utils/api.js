// src/utils/api.js
import axios from 'axios';

const rawEnvApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
const isLocalhostEnv = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(rawEnvApiUrl);

export const API_ORIGIN =
  import.meta.env.PROD && (!rawEnvApiUrl || isLocalhostEnv)
    ? ''
    : (rawEnvApiUrl || 'http://127.0.0.1:8000').replace(/\/api$/i, '');

export const API_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================
// ✅ REQUEST INTERCEPTOR - Add Token
// ============================================
api.interceptors.request.use(
  (config) => {
    // Support both token formats
    const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    console.log('🔑 API Request:', {
      url: config.url,
      method: config.method,
      hasToken: !!token,
    });
    
    // If FormData, remove Content-Type to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================
// ✅ RESPONSE INTERCEPTOR - Handle Errors
// ============================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    console.log('❌ API Error:', {
      status: error.response?.status,
      url: originalRequest?.url,
      message: error.message
    });
    
    // ✅ Handle 401 Unauthorized
    if (error.response?.status === 401) {
      // Don't redirect if already on login page or trying to login
      if (originalRequest.url.includes('/auth/login/') || 
          originalRequest.url.includes('/auth/register/')) {
        return Promise.reject(error);
      }
      
      console.log('⚠️ Unauthorized - Clearing tokens and redirecting to login');
      
      // Clear all tokens
      localStorage.removeItem('access_token');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login') && 
          !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
      }
      
      return Promise.reject(error);
    }
    
    // ✅ Handle 404 Not Found - Just log it
    if (error.response?.status === 404) {
      console.warn('⚠️ Endpoint not found:', originalRequest.url);
      // Don't clear tokens for 404
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

// ============================================
// ✅ AUTH API
// ============================================
export const authAPI = {
  login: (credentials) => api.post('/auth/login/', credentials),
  googleLogin: (data) => api.post('/auth/google/', data),
  register: (data) => api.post('/auth/register/', data),
  logout: () => api.post('/auth/logout/'),
  getProfile: () => api.get('/auth/profile/'),
  updateProfile: (data) => api.put('/auth/profile/', data),
  changePassword: (data) => api.post('/auth/change-password/', data),
  getToken: (data) => api.post('/auth/token/', data),
  requestPasswordReset: (email) => api.post('/auth/password-reset/', { email }),
  resetPassword: (data) => api.post('/auth/password-reset/confirm/', data),
};

// ============================================
// ✅ SELLER API - FIXED
// ============================================
export const sellerAPI = {
  // ✅ Dashboard - matches urls.py
  getDashboard: () => api.get('/sellers/dashboard/'),
  
  // ✅ Seller's own products - using the specific endpoint
  getMyProducts: () => {
    console.log('📦 Fetching my products...');
    return api.get('/sellers/my-products/');  // ✅ FIXED: Use seller-specific endpoint
  },
  
  // ✅ Get products for a specific seller (public)
  getSellerProducts: (sellerId) => {
    console.log(`📦 Fetching products for seller ${sellerId}...`);
    return api.get(`/products/?seller=${sellerId}`);
  },
  
  // ✅ Seller's own orders - using the specific endpoint
  getMyOrders: () => {
    console.log('📦 Fetching my orders...');
    return api.get('/sellers/my-orders/');  // ✅ FIXED: Use seller-specific endpoint
  },
  
  // ✅ Seller stats - FIXED
  getMyStats: (params) => {
    console.log('📊 Fetching my stats...');
    return api.get('/sellers/my-stats/', { params });
  },

  createBuyerCustomer: (data) => api.post('/sellers/create-buyer-customer/', data),
  
  // ✅ Public seller endpoints
  getPublicSellers: () => api.get('/sellers/public/'),
  getSellerDetail: (slug) => api.get(`/sellers/public/${slug}/`),
  getSellerProductsPublic: (slug) => api.get(`/sellers/public/${slug}/products/`),
  
  // ✅ Admin seller management
  approveSeller: (id) => api.post(`/sellers/${id}/approve/`),
  rejectSeller: (id, data) => api.post(`/sellers/${id}/reject/`, data),
  toggleStatus: (id) => api.post(`/sellers/${id}/toggle-status/`),
  
  // ✅ Seller profile - using auth profile
  getProfile: () => {
    console.log('👤 Fetching seller profile...');
    return api.get('/auth/profile/');
  },
  updateProfile: (data) => api.put('/auth/profile/', data),
  
  // ✅ Seller payment profile - matches SellerProfileView
  updateSellerProfile: (data) => {
    console.log('💳 Updating seller payment profile...');
    return api.put('/seller/profile/', data);  // ✅ Correct - matches urls.py
  },
  
  // ✅ Create product
  createProduct: (data) => {
    console.log('📝 Creating product...');
    return api.post('/products/', data);
  },
};

// ============================================
// ✅ PRODUCT API
// ============================================
export const productAPI = {
  getProducts: (params) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          queryParams.append(key, params[key]);
        }
      });
    }
    const url = `/products/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    console.log(`🔍 Fetching products: ${url}`);
    return api.get(url);
  },
  getProduct: (id) => api.get(`/products/${id}/`),
  createProduct: (data) => {
    console.log('📝 Creating product with data:', data);
    return api.post('/products/', data);
  },
  updateProduct: (id, data) => api.put(`/products/${id}/`, data),
  patchProduct: (id, data) => api.patch(`/products/${id}/`, data),
  deleteProduct: (id) => api.delete(`/products/${id}/`),
  getFeatured: () => api.get('/products/featured/'),
  getBestsellers: () => api.get('/products/bestsellers/'),
  getNewArrivals: () => api.get('/products/new_arrivals/'),
  getRecommendations: (id) => api.get(`/products/${id}/recommendations/`),
  trackView: (id) => api.post(`/products/${id}/track_view/`),
  generateDescription: (id) => api.post(`/products/${id}/generate_description/`),
  uploadImage: (id, data) => api.post(`/products/${id}/upload_image/`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getImages: (id) => api.get(`/products/${id}/get_images/`),
  deleteImage: (id, data) => api.delete(`/products/${id}/delete_image/`, { data }),
  setPrimaryImage: (id, data) => api.post(`/products/${id}/set_primary_image/`, data),
};

// ============================================
// ✅ CATEGORY API
// ============================================
export const categoryAPI = {
  getCategories: () => api.get('/categories/'),
  getCategory: (id) => api.get(`/categories/${id}/`),
  createCategory: (data) => api.post('/categories/', data),
  updateCategory: (id, data) => api.put(`/categories/${id}/`, data),
  deleteCategory: (id) => api.delete(`/categories/${id}/`),
};

// ============================================
// ✅ BUYER API
// ============================================
export const buyerAPI = {
  getProfile: () => api.get('/buyer/profile/'),
  getOrders: () => api.get('/orders/'),
  getWishlist: () => api.get('/wishlist/'),
};

// ============================================
// ✅ CART API
// ============================================
export const cartAPI = {
  getCart: () => api.get('/cart/'),
  addToCart: (data) => api.post('/cart/add/', data),
  removeFromCart: (itemId) => api.delete(`/cart/remove/${itemId}/`),
  updateCartItem: (itemId, data) => api.put(`/cart/update/${itemId}/`, data),
  clearCart: () => api.delete('/cart/'),
};

// ============================================
// ✅ ORDER API
// ============================================
export const orderAPI = {
  getOrders: (params) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          queryParams.append(key, params[key]);
        }
      });
    }
    const url = `/orders/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return api.get(url);
  },
  createOrder: (data) => api.post('/orders/create/', data),
  getOrder: (id) => api.get(`/orders/${id}/`),
  updateOrderStatus: (id, data) => api.put(`/orders/${id}/update-status/`, data),
  deleteOrder: (id) => api.delete(`/orders/${id}/`),
};

// ============================================
// ✅ REVIEW API
// ============================================
export const reviewAPI = {
  getReviews: (params) => api.get('/reviews/', { params }),
  createReview: (data) => api.post('/reviews/', data),
  getReview: (id) => api.get(`/reviews/${id}/`),
  markHelpful: (id, data) => api.post(`/reviews/${id}/helpful/`, data),
};

// ============================================
// ✅ WISHLIST API
// ============================================
export const wishlistAPI = {
  getWishlist: () => api.get('/wishlist/'),
  addToWishlist: (data) => api.post('/wishlist/add/', data),
  removeFromWishlist: (productId) => api.delete(`/wishlist/remove/${productId}/`),
};

// ============================================
// ✅ SEARCH API
// ============================================
export const searchAPI = {
  search: (params) => api.get('/search/', { params }),
  advancedSearch: (data) => api.post('/search/advanced/', data),
  getSuggestions: (params) => api.get('/search/suggestions/', { params }),
};

// ============================================
// ✅ AI API
// ============================================
export const aiAPI = {
  search: (data) => api.post('/ai/search/', data),
  getRecommendations: (productId, params) => api.get(`/ai/recommendations/${productId}/`, { params }),
  chat: (data) => api.post('/ai/chat/', data),
  analyzeImage: (data) => api.post('/ai/analyze-image/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getStatus: () => api.get('/ai/status/'),
};

// ============================================
// ✅ PUBLIC API
// ============================================
export const publicAPI = {
  getProducts: (params) => api.get('/public/products/', { params }),
  getProduct: (slug) => api.get(`/public/products/${slug}/`),
  getCategories: () => api.get('/public/categories/'),
  getSellers: () => api.get('/sellers/public/'),  // ✅ FIXED: Use correct endpoint
  getSeller: (slug) => api.get(`/sellers/public/${slug}/`),  // ✅ FIXED: Use correct endpoint
};

// ============================================
// ✅ PAYMENT API
// ============================================
export const paymentAPI = {
  createIntent: (data) => api.post('/payment/create-intent/', data),
  confirmPayment: (data) => api.post('/payment/confirm/', data),
  getMethods: () => api.get('/payment/methods/'),
};

// ============================================
// ✅ NOTIFICATION API
// ============================================
export const notificationAPI = {
  getNotifications: (params) => api.get('/notifications/', { params }),
  markRead: (data) => api.post('/notifications/mark-read/', data),
};

// ============================================
// ✅ COUPON API
// ============================================
export const couponAPI = {
  validate: (data) => api.post('/coupons/validate/', data),
};

// ============================================
// ✅ ANALYTICS API
// ============================================
export const analyticsAPI = {
  getStoreStats: () => api.get('/analytics/store-stats/'),
  getProductAnalytics: (productId) => api.get(`/analytics/product/${productId}/`),
};

// ============================================
// ✅ SHIPPING API
// ============================================
export const shippingAPI = {
  getShippingMethods: () => api.get('/shipping/methods/'),
  calculateShipping: (data) => api.post('/shipping/calculate/', data),
  getTrackingInfo: (trackingNumber) => api.get(`/shipping/tracking/${trackingNumber}/`),
};

// ============================================
// ✅ UPLOAD API
// ============================================
export const uploadAPI = {
  uploadFile: (data) => api.post('/upload/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteFile: (fileId) => api.delete(`/upload/${fileId}/`),
};

// ============================================
// ✅ SETTINGS API
// ============================================
export const settingsAPI = {
  getSettings: () => api.get('/settings/'),
  updateSettings: (data) => api.put('/settings/', data),
  getPaymentSettings: () => api.get('/settings/payment/'),
  updatePaymentSettings: (data) => api.put('/settings/payment/', data),
};

// ============================================
// ✅ SELLER PROFIT-SHIELD & NEXT-CUSTOMER MESH API
// ============================================
export const sellerMeshAPI = {
  getDashboard: () => api.get('/seller-mesh/dashboard/'),
  triggerScenario: (triggerEvent) => api.post('/seller-mesh/trigger/', { trigger_event: triggerEvent }),
  decideApproval: (id, decision) => api.post(`/seller-mesh/approvals/${id}/decide/`, { decision }),
  getRecoveries: () => api.get('/seller-mesh/recoveries/'),
  simulateRecovery: () => api.post('/seller-mesh/recoveries/simulate/'),
  negotiateRecovery: (id, data) => api.post(`/seller-mesh/recoveries/${id}/negotiate/`, data),
  closeRecoveryDeal: (id, data) => api.post(`/seller-mesh/recoveries/${id}/close-deal/`, data),
  askRecoveryChatbot: (id, data) => api.post(`/seller-mesh/recoveries/${id}/advisor-chat/`, data),
  verifyRecoveryPhoto: (id, data = {}) => api.post(`/seller-mesh/recoveries/${id}/verify-photo/`, data),
  applySellerOption: (id, data) => api.post(`/seller-mesh/recoveries/${id}/seller-option/`, data),
  getBuyerRescueDeals: () => api.get('/seller-mesh/buyer-deals/'),
  actOnBuyerRescueDeal: (id, data) => api.post(`/seller-mesh/buyer-deals/${id}/action/`, data),
  getReviewInsights: () => api.get('/seller-mesh/reviews-insights/'),
  applyReviewFix: (data) => api.post('/seller-mesh/reviews-insights/apply-fix/', data),
};

// ============================================
// ✅ DEFAULT EXPORT
// ============================================
export default api;