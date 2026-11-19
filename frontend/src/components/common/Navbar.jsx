// src/components/common/Navbar.jsx
import { useState, useId } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import {
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  UserIcon,
  Bars3Icon,
  XMarkIcon,
  HeartIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import OpenAgenticDrawer from '../../features/openagent/OpenAgenticDrawer';

const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { getCartCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const searchInputId = useId();
  const mobileSearchInputId = useId();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openAgentDrawer, setOpenAgentDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const cartCount = isAuthenticated ? getCartCount() : 0;

  const closeMenus = () => {
    setIsMenuOpen(false);
    setIsDropdownOpen(false);
  };

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
    navigate('/login');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/products');
    }
    setIsMenuOpen(false);
  };

  const navLinks = [
    { label: 'Buyer Hub', to: '/home' },
    { label: 'Catalog', to: '/products' },
    { label: 'Cancelled Deals', to: '/cancelled-deals' },
    { label: 'My Orders', to: '/orders' },
    { label: 'AI Assistant', to: '/ai-chat' },
  ];

  const isActivePath = (path) => {
    if (path === '/home') {
      return location.pathname === '/home' || location.pathname === '/buyer/dashboard';
    }
    return location.pathname === path || (path === '/products' && location.pathname.startsWith('/products'));
  };

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center gap-3 h-16">
          {/* Logo */}
          <Link to="/home" className="flex items-center gap-2 shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold shadow-sm">
              S
            </span>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              Store<span className="text-blue-600">Hub</span>
            </span>
          </Link>

          {/* Primary Nav Links (Desktop) */}
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-1 shrink-0">
            {navLinks.map((item) => {
              const active = isActivePath(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              to="/supplyshield"
              aria-current={location.pathname === '/supplyshield' ? 'page' : undefined}
              className="ml-1 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-900 text-cyan-300 border border-cyan-500/40 hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
            >
              <SparklesIcon className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
              <span>SupplyShield Mesh</span>
            </Link>
            <button
              type="button"
              onClick={() => setOpenAgentDrawer(true)}
              className="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              🌐 Open Agentic Node
            </button>
          </nav>

          {/* Search Bar (Desktop) */}
          <search className="hidden md:flex flex-1 max-w-xs xl:max-w-sm">
            <form onSubmit={handleSearch} className="w-full" role="search">
              <label htmlFor={searchInputId} className="sr-only">
                Search products
              </label>
              <div className="relative">
                <input
                  id={searchInputId}
                  name="search"
                  type="search"
                  placeholder="Search phones, laptops, chairs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-full focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <MagnifyingGlassIcon
                  className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
              </div>
            </form>
          </search>

          {/* Right Actions (Account-Only Link Between Buyer & Seller via /login) */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {isAuthenticated && (
              <Link
                to="/wishlist"
                aria-label="Wishlist"
                className="p-2 text-slate-600 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <HeartIcon className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}

            <Link
              to="/cart"
              aria-label={`Shopping cart${cartCount > 0 ? `, ${cartCount} items` : ''}`}
              className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ShoppingCartIcon className="h-5 w-5" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[1rem] px-1 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>

            {isAuthenticated ? (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  aria-expanded={isDropdownOpen}
                  aria-label="Open account menu"
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-slate-200 hover:border-blue-400 transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                    {user?.first_name?.[0] || user?.username?.[0] || 'U'}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 max-w-[90px] truncate">
                    {user?.username}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    Buyer
                  </span>
                </button>

                {isDropdownOpen && (
                  <div
                    onClick={closeMenus}
                    className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl py-2 border border-slate-200 z-50"
                  >
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {user?.full_name || user?.username}
                      </p>
                      <p className="text-[11px] text-slate-500">Buyer Account</p>
                    </div>
                    <Link
                      to="/profile"
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <UserIcon className="h-4 w-4 inline mr-2" aria-hidden="true" />
                      My Profile
                    </Link>
                    <Link
                      to="/orders"
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      My Orders
                    </Link>
                    <hr className="my-1 border-slate-100" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      Logout / Switch Account
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:text-blue-600"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-3.5 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            {isMenuOpen ? (
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div id="mobile-nav-drawer" onClick={closeMenus} className="md:hidden py-4 border-t border-slate-200 space-y-3">
            <search>
              <form onSubmit={handleSearch} role="search">
                <label htmlFor={mobileSearchInputId} className="sr-only">
                  Search products
                </label>
                <div className="relative">
                  <input
                    id={mobileSearchInputId}
                    name="search"
                    type="search"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 pl-10 border border-slate-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <MagnifyingGlassIcon
                    className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                    aria-hidden="true"
                  />
                </div>
              </form>
            </search>

            <nav aria-label="Mobile" className="space-y-1">
              {navLinks.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActivePath(item.to) ? 'page' : undefined}
                  className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                to="/supplyshield"
                className="block px-3 py-2 text-cyan-300 bg-slate-900 rounded-lg font-mono text-sm font-semibold"
              >
                SupplyShield Crisis Router
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  setOpenAgentDrawer(true);
                }}
                className="w-full text-left block px-3 py-2 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-bold"
              >
                🌐 Open Agentic Node
              </button>
            </nav>

            <div className="space-y-1 pt-2 border-t border-slate-100">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/orders"
                    className="block px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm"
                  >
                    My Orders
                  </Link>
                  <Link
                    to="/cart"
                    className="block px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm"
                  >
                    Cart ({cartCount})
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-sm"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    className="text-center py-2 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="text-center py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <OpenAgenticDrawer open={openAgentDrawer} onClose={() => setOpenAgentDrawer(false)} />
    </header>
  );
};

export default Navbar;
