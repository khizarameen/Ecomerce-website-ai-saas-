// src/components/layout/SellerLayout.jsx
import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HomeIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  ChartBarIcon,
  UserIcon,
  CogIcon,
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  PlusIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import OpenAgenticDrawer from '../../features/openagent/OpenAgenticDrawer';

const SellerLayout = () => {
  const { user, logout, sellerProfile, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openAgentDrawer, setOpenAgentDrawer] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      toast.error('Please login to access seller workspace');
      navigate('/login');
    }
  }, [isAuthenticated, loading, navigate]);

  const storeName = sellerProfile?.store_name || `${user?.username || 'Seller'}'s Store`;
  const storeSlug = sellerProfile?.store_slug || user?.username;

  const menuItems = [
    { icon: HomeIcon, label: 'Dashboard', path: '/seller/dashboard' },
    { icon: ShoppingBagIcon, label: 'My Products', path: '/seller/products' },
    { icon: PlusIcon, label: 'Add Product', path: '/seller/products/add' },
    { icon: ShoppingCartIcon, label: 'Customer Orders', path: '/seller/orders' },
    { icon: ShieldCheckIcon, label: 'Profit-Shield AI Agent', path: '/seller/profit-shield', badge: '4-Agent' },
    { icon: GlobeAltIcon, label: 'Open Agentic Hub', path: '/open-agentic-hub', badge: 'NANDA' },
    { icon: ChartBarIcon, label: 'Analytics', path: '/seller/analytics' },
    { icon: UserIcon, label: 'Store Profile', path: '/seller/profile' },
    { icon: CogIcon, label: 'Settings', path: '/seller/settings' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-slate-600">Loading Seller Hub...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Mobile Sidebar Toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-expanded={sidebarOpen}
        aria-controls="seller-sidebar"
        aria-label={sidebarOpen ? 'Close seller sidebar' : 'Open seller sidebar'}
        className="lg:hidden fixed bottom-4 right-4 z-50 p-3 bg-indigo-600 text-white rounded-full shadow-lg"
      >
        {sidebarOpen ? (
          <XMarkIcon className="w-6 h-6" aria-hidden="true" />
        ) : (
          <Bars3Icon className="w-6 h-6" aria-hidden="true" />
        )}
      </button>

      {/* Dark Slate Seller Sidebar */}
      <aside
        id="seller-sidebar"
        aria-label="Seller workspace navigation"
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-100 shadow-xl transform transition-transform duration-200 ease-in-out flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Store Identity */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-extrabold">
              {storeName[0]?.toUpperCase() || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-white truncate">{storeName}</p>
              <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 mt-0.5">
                Seller Account
              </span>
            </div>
          </div>
          {storeSlug && (
            <p className="text-[11px] text-slate-400 font-mono truncate mt-2">/{storeSlug}</p>
          )}
        </div>

        {/* Seller-Only Navigation */}
        <nav aria-label="Seller Hub" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Actions — Account Switch Only via Logout/Login */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <p className="px-2 text-[11px] text-slate-400">
            Seller Mode: Only your store&apos;s products &amp; orders are shown.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3.5 py-2.5 text-rose-300 hover:bg-rose-950/60 hover:text-rose-200 rounded-xl text-sm font-medium transition-colors"
          >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" aria-hidden="true" />
            <span>Logout / Switch Account</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-slate-900">StoreHub Seller Center</span>
              <span className="hidden sm:inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {user?.username}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/seller/products/add"
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5"
              >
                <PlusIcon className="w-4 h-4" aria-hidden="true" />
                <span>Add Product</span>
              </Link>
              <Link
                to="/seller/orders"
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
              >
                <ShoppingCartIcon className="w-4 h-4" aria-hidden="true" />
                <span>Customer Orders</span>
              </Link>
              <Link
                to="/seller/profit-shield"
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm inline-flex items-center gap-1.5"
              >
                <ShieldCheckIcon className="w-4 h-4" aria-hidden="true" />
                <span>Profit-Shield AI Agent</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpenAgentDrawer(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-cyan-200 border border-cyan-500/40 hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>🌐 Open Agentic Node</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <OpenAgenticDrawer open={openAgentDrawer} onClose={() => setOpenAgentDrawer(false)} />
    </div>
  );
};

export default SellerLayout;
