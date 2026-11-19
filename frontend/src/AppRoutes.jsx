// src/AppRoutes.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Layouts
import BuyerLayout from './components/layout/BuyerLayout';
import SellerLayout from './components/layout/SellerLayout';

// Components
import ProtectedRoute from './components/common/ProtectedRoute';

// Buyer Pages
import Home from './features/buyer/pages/Home';
import BuyerProducts from './features/buyer/pages/Products';
import ProductDetail from './features/buyer/pages/ProductDetail';
import Cart from './features/buyer/pages/Cart';
import Wishlist from './features/buyer/pages/Wishlist';
import Orders from './features/buyer/pages/Orders';
import BuyerProfile from './features/buyer/pages/BuyerProfile';
import OrderDetail from './features/buyer/pages/OrderDetail';
import CancelledDeals from './features/buyer/pages/CancelledDeals';

// Seller Pages
import SellerDashboard from './features/seller/pages/Dashboard';
import SellerProducts from './features/seller/pages/Products';
import SellerOrders from './features/seller/pages/Orders';
import SellerAnalytics from './features/seller/pages/Analytics';
import SellerProfile from './features/seller/pages/Profile';
import SellerSettings from './features/seller/pages/Settings';
import ProductForm from './features/seller/components/ProductForm';
import SellerCopilotMesh from './pages/SellerCopilotMesh';

// Auth Pages
import Login from './features/auth/Login';
import Register from './features/auth/Register';
import Profile from './features/auth/Profile';

// AI Pages
import AIChat from './features/ai/Chat';
import AISearch from './features/ai/AISearch';
import ImageAnalysis from './features/ai/ImageAnalysis';
import Recommendation from './features/ai/Recommendation';

// Payment Pages
import PaymentMethods from './features/payment/PaymentMethods';
import StripeCheckout from './features/payment/StripeCheckout';
import CODCheckout from './features/payment/CODCheckout';

// SupplyShield Crisis Router
import SupplyShieldDashboard from './features/supplyshield/SupplyShieldDashboard';

// Open Agentic Web Hub (MIT NANDA / Mozilla Otari / Cognizant AI Lab)
import OpenAgenticHub from './features/openagent/OpenAgenticHub';

function BuyerOnlyWorkspace({ isAuthenticated, isSeller }) {
  if (isAuthenticated && isSeller) {
    return <Navigate to="/seller/dashboard" replace />;
  }
  return <BuyerLayout />;
}

function AppRoutes() {
  const { user, loading, isAuthenticated, isSeller, isPending } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  console.log('🔍 AppRoutes - Auth State:', { 
    isAuthenticated, 
    isSeller,
    isPending,
    user: user?.username,
    userType: user?.user_type
  });

  const defaultHome = isAuthenticated && isSeller ? '/seller/dashboard' : '/home';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Routes>
        {/* ============ ROOT PATH - Strict Account Role Home ============ */}
        <Route path="/" element={<Navigate to={defaultHome} replace />} />
        
        {/* ============ AUTH & STANDALONE ROUTES ============ */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/open-agentic-hub" element={<OpenAgenticHub />} />
        <Route
          path="/supplyshield"
          element={
            isAuthenticated && isSeller ? (
              <Navigate to="/seller/dashboard" replace />
            ) : (
              <SupplyShieldDashboard />
            )
          }
        />
        
        {/* ============ PUBLIC / BUYER ROUTES (Blocked for Seller Accounts) ============ */}
        <Route element={<BuyerOnlyWorkspace isAuthenticated={isAuthenticated} isSeller={isSeller} />}>
          <Route path="/home" element={<Home />} />
          <Route path="/buyer/dashboard" element={<Home />} />
          <Route path="/products" element={<BuyerProducts />} />
          <Route path="/products/:slug" element={<ProductDetail />} />
          <Route path="/cancelled-deals" element={<CancelledDeals />} />
          <Route path="/ai-chat" element={<AIChat />} />
          <Route path="/ai-search" element={<AISearch />} />
          <Route path="/ai-image-analysis" element={<ImageAnalysis />} />
          <Route path="/ai-recommendations" element={<Recommendation />} />
          <Route path="/ai-recommendations/:productId" element={<Recommendation />} />
        </Route>

        {/* ============ BUYER PROTECTED ROUTES ============ */}
        <Route element={<ProtectedRoute allowedRoles={['buyer']} />}>
          <Route element={<BuyerLayout />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/buyer/profile" element={<BuyerProfile />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/payment/methods" element={<PaymentMethods />} />
            <Route path="/checkout/stripe" element={<StripeCheckout />} />
            <Route path="/checkout/cod" element={<CODCheckout />} />
          </Route>
        </Route>

        {/* ============ SELLER PROTECTED ROUTES (Seller Only: Own Products & Customer Orders) ============ */}
        <Route element={<ProtectedRoute allowedRoles={['seller']} />}>
          <Route element={<SellerLayout />}>
            <Route path="/seller/dashboard" element={<SellerDashboard />} />
            <Route path="/seller/products" element={<SellerProducts />} />
            <Route path="/seller/products/add" element={<ProductForm />} />
            <Route path="/seller/products/:id/edit" element={<ProductForm />} />
            <Route path="/seller/products/edit/:id" element={<ProductForm />} />
            <Route path="/seller/orders" element={<SellerOrders />} />
            <Route path="/seller/profit-shield" element={<SellerCopilotMesh />} />
            <Route path="/seller/copilot-mesh" element={<SellerCopilotMesh />} />
            <Route path="/seller/analytics" element={<SellerAnalytics />} />
            <Route path="/seller/profile" element={<SellerProfile />} />
            <Route path="/seller/settings" element={<SellerSettings />} />
          </Route>
        </Route>

        {/* ============ CATCH ALL ============ */}
        <Route path="*" element={<Navigate to={defaultHome} replace />} />
      </Routes>
    </div>
  );
}

export default AppRoutes;