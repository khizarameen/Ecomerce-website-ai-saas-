// src/features/buyer/pages/Home.jsx
import { useState, useEffect, useMemo, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productAPI, categoryAPI, orderAPI, wishlistAPI } from '../../../utils/api';
import { useCart } from '../../../context/CartContext';
import { useAuth } from '../../../context/AuthContext';
import ProductCard from '../components/ProductCard';
import Loader from '../../../components/common/Loader';
import { formatPrice, formatDate, getStatusColor } from '../../../utils/helpers';
import {
  ShoppingCartIcon,
  ClipboardDocumentListIcon,
  HeartIcon,
  CurrencyDollarIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  BoltIcon,
  ArrowRightIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const Home = () => {
  const navigate = useNavigate();
  const searchInputId = useId();
  const sortSelectId = useId();

  const { cartItems, totalItems, cartTotal, addToCart } = useCart();
  const { isAuthenticated, user, loginAsDemo } = useAuth();

  const [allProducts, setAllProducts] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [wishlistedIds, setWishlistedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [collectionTab, setCollectionTab] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [addingId, setAddingId] = useState(null);
  const [switchingRole, setSwitchingRole] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [allRes, featRes, bestRes, newRes, catRes] = await Promise.allSettled([
          productAPI.getProducts({ limit: 40 }),
          productAPI.getFeatured(),
          productAPI.getBestsellers(),
          productAPI.getNewArrivals(),
          categoryAPI.getCategories(),
        ]);
        if (!active) return;

        const extract = (res) => {
          if (res.status !== 'fulfilled') return [];
          const d = res.value?.data;
          if (Array.isArray(d)) return d;
          return d?.results || d?.products || d?.categories || d?.data || [];
        };

        setAllProducts(extract(allRes));
        setFeatured(extract(featRes));
        setBestsellers(extract(bestRes));
        setNewArrivals(extract(newRes));
        setCategories(extract(catRes));
      } catch (err) {
        console.error('Error fetching buyer storefront:', err);
        if (active) toast.error('Failed to load storefront products');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated || !user?.id) {
        await Promise.resolve();
        if (active) {
          setMyOrders([]);
          setWishlistedIds(new Set());
        }
        return;
      }

      const [ordRes, wishRes] = await Promise.allSettled([
        orderAPI.getOrders({ limit: 10 }),
        wishlistAPI.getWishlist(),
      ]);
      if (!active) return;

      if (ordRes.status === 'fulfilled') {
        const d = ordRes.value?.data;
        const ordersList = d?.orders || d?.results || (Array.isArray(d) ? d : []);
        setMyOrders(Array.isArray(ordersList) ? ordersList : []);
      }
      if (wishRes.status === 'fulfilled') {
        const wd = wishRes.value?.data;
        const items = wd?.products || wd?.wishlist?.products || wd?.items || [];
        setWishlistedIds(new Set(items.map((p) => p.id || p.product?.id).filter(Boolean)));
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.id]);

  const totalSpent = useMemo(
    () =>
      myOrders.reduce((sum, ord) => {
        if (ord.status === 'cancelled') return sum;
        return sum + Number(ord.total || ord.amount || 0);
      }, 0),
    [myOrders]
  );

  const visibleProducts = useMemo(() => {
    const baseList =
      collectionTab === 'featured'
        ? featured
        : collectionTab === 'bestsellers'
        ? bestsellers
        : collectionTab === 'new_arrivals'
        ? newArrivals
        : allProducts;

    const q = searchQuery.trim().toLowerCase();
    const filtered = baseList.filter((item) => {
      const matchesCat =
        !selectedCategory || String(item.category) === String(selectedCategory);
      const matchesQ =
        !q ||
        item.name?.toLowerCase().includes(q) ||
        item.category_name?.toLowerCase().includes(q) ||
        item.short_description?.toLowerCase().includes(q) ||
        item.seller_name?.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });

    const sorted = [...filtered];
    if (sortBy === 'price_asc') {
      sorted.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === 'price_desc') {
      sorted.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0));
    }
    return sorted;
  }, [allProducts, featured, bestsellers, newArrivals, collectionTab, selectedCategory, searchQuery, sortBy]);

  const handleDemoSwitch = async (role) => {
    setSwitchingRole(role);
    try {
      const res = await loginAsDemo(role);
      if (res?.success && role === 'seller') {
        navigate('/seller/dashboard');
      }
    } finally {
      setSwitchingRole(null);
    }
  };

  const handleAddToCart = async (productId) => {
    if (!isAuthenticated) {
      toast.error('Please click "Launch Demo Buyer" or login to add items to cart');
      navigate('/login');
      return;
    }
    setAddingId(productId);
    try {
      await addToCart(productId, 1);
    } finally {
      setAddingId(null);
    }
  };

  const handleBuyNow = async (productId) => {
    if (!isAuthenticated) {
      toast.error('Please click "Launch Demo Buyer" or login first');
      navigate('/login');
      return;
    }
    setAddingId(productId);
    try {
      const res = await addToCart(productId, 1);
      if (res?.success) {
        navigate('/cart');
      }
    } finally {
      setAddingId(null);
    }
  };

  const handleWishlistToggle = async (productId) => {
    if (!isAuthenticated) {
      toast.error('Please login to save items to your wishlist');
      navigate('/login');
      return;
    }
    try {
      if (wishlistedIds.has(productId)) {
        await wishlistAPI.removeFromWishlist(productId);
        setWishlistedIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
        toast.success('Removed from wishlist');
      } else {
        await wishlistAPI.addToWishlist({ product_id: productId });
        setWishlistedIds((prev) => new Set(prev).add(productId));
        toast.success('Saved to wishlist');
      }
    } catch {
      toast.error('Could not update wishlist');
    }
  };

  if (loading) return <Loader />;

  const kpiCards = [
    {
      title: 'My Cart',
      value: `${totalItems} item${totalItems === 1 ? '' : 's'}`,
      sub: totalItems > 0 ? `Subtotal ${formatPrice(cartTotal)}` : 'Ready to shop',
      icon: ShoppingCartIcon,
      accent: 'bg-blue-600',
      to: '/cart',
    },
    {
      title: 'My Orders',
      value: isAuthenticated ? myOrders.length : 'Demo',
      sub: isAuthenticated ? 'Track deliveries' : 'Sign in as Buyer',
      icon: ClipboardDocumentListIcon,
      accent: 'bg-emerald-600',
      to: '/orders',
    },
    {
      title: 'Saved Wishlist',
      value: isAuthenticated ? wishlistedIds.size : 0,
      sub: 'Favorite products',
      icon: HeartIcon,
      accent: 'bg-rose-600',
      to: '/wishlist',
    },
    {
      title: 'Total Spent',
      value: formatPrice(totalSpent),
      sub: isAuthenticated ? 'Verified purchases' : 'Launch Demo Buyer',
      icon: CurrencyDollarIcon,
      accent: 'bg-indigo-600',
      to: '/buyer/profile',
    },
  ];

  const tabs = [
    { id: 'all', label: `All Products (${allProducts.length})` },
    { id: 'featured', label: `Featured (${featured.length})` },
    { id: 'bestsellers', label: `Bestsellers (${bestsellers.length})` },
    { id: 'new_arrivals', label: `New Arrivals (${newArrivals.length})` },
  ];

  return (
    <div className="space-y-8">
      {/* Top Buyer Dashboard Control Center */}
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 text-white p-6 md:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-200">
                <SparklesIcon className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                <span>
                  {isAuthenticated
                    ? `Buyer Dashboard • ${user?.full_name || user?.username}`
                    : 'StoreHub Buyer Dashboard & Marketplace'}
                </span>
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">
              {isAuthenticated
                ? `Welcome back, ${user?.first_name || user?.username}!`
                : 'Discover, Compare & Order Verified Products'}
            </h1>
            <p className="text-sm md:text-base text-slate-200">
              Search live seller inventory, track your orders and cart, or test 1-click AI procurement in SupplyShield Mesh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {(!isAuthenticated || user?.username !== 'demo_buyer') && (
              <button
                type="button"
                onClick={() => handleDemoSwitch('buyer')}
                disabled={switchingRole !== null}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-blue-50 transition-colors inline-flex items-center gap-1.5 shadow-sm"
              >
                <BoltIcon className="w-4 h-4 text-amber-500" aria-hidden="true" />
                <span>{switchingRole === 'buyer' ? 'Switching...' : 'Launch Demo Buyer'}</span>
              </button>
            )}
            <Link
              to="/cancelled-deals"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs font-bold hover:brightness-110 transition-all inline-flex items-center gap-1.5 shadow-sm"
            >
              <span>🔥 Cancelled Order Deals</span>
            </Link>
            <Link
              to="/supplyshield"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-950/90 text-cyan-300 border border-cyan-400/50 text-xs font-mono font-bold hover:bg-slate-900 transition-colors inline-flex items-center"
            >
              SupplyShield AI Mesh
            </Link>
          </div>
        </div>
      </section>

      {/* 4 Live Buyer KPI Cards */}
      <section aria-label="Buyer account summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex items-start justify-between gap-3"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {card.title}
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
            </div>
            <div className={`p-3 rounded-xl ${card.accent} text-white shrink-0`}>
              <card.icon className="w-6 h-6" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </section>

      {/* Live Interactive Storefront Explorer */}
      <section aria-labelledby="explorer-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="explorer-heading" className="text-xl md:text-2xl font-extrabold text-slate-900">
              Live Storefront Explorer
            </h2>
            <p className="text-xs text-slate-500 mt-0.5" aria-live="polite">
              Showing {visibleProducts.length} product(s) from verified sellers
            </p>
          </div>
          <Link
            to="/products"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <span>Open Full Catalog Filters</span>
            <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Inline Search + Sort + Category + Collection Controls */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <search className="md:col-span-2">
              <form onSubmit={(e) => e.preventDefault()} role="search">
                <label htmlFor={searchInputId} className="block text-xs font-semibold text-slate-700 mb-1">
                  Search Live Products
                </label>
                <div className="relative">
                  <input
                    id={searchInputId}
                    name="search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter instantly by name, seller, or category..."
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <MagnifyingGlassIcon
                    className="w-4 h-4 text-slate-400 absolute left-3 top-3"
                    aria-hidden="true"
                  />
                </div>
              </form>
            </search>

            <div>
              <label htmlFor={sortSelectId} className="block text-xs font-semibold text-slate-700 mb-1">
                Sort Products
              </label>
              <select
                id={sortSelectId}
                name="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">Newest First</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating">Top Rated</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {/* Collection Tabs */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Product collections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={collectionTab === tab.id}
                  onClick={() => setCollectionTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    collectionTab === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              <button
                type="button"
                aria-pressed={selectedCategory === ''}
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedCategory === ''
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={String(selectedCategory) === String(cat.id)}
                  onClick={() => setSelectedCategory(String(cat.id))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    String(selectedCategory) === String(cat.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Product Cards Grid */}
        {visibleProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
            <p className="text-lg font-bold text-slate-800">No products match your filter</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('');
                setCollectionTab('all');
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {visibleProducts.slice(0, 12).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isWishlisted={wishlistedIds.has(product.id)}
                onWishlistToggle={handleWishlistToggle}
                onClick={() => navigate(`/products/${product.slug}`)}
                onAddToCart={() => handleAddToCart(product.id)}
                onBuyNow={() => handleBuyNow(product.id)}
                isAdding={addingId === product.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Buyer Activity Split Panel: Recent Orders + Active Cart Quick-Checkout */}
      <section aria-label="Recent orders and cart quick checkout" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: My Recent Orders */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900">My Recent Orders</h2>
            <Link to="/orders" className="text-xs font-semibold text-blue-600 hover:underline">
              View All Orders →
            </Link>
          </div>

          {!isAuthenticated ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                Sign in with 1-click Demo Buyer to inspect seeded orders &amp; checkout flows
              </p>
              <button
                type="button"
                onClick={() => handleDemoSwitch('buyer')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
              >
                Launch Demo Buyer (demo_buyer)
              </button>
            </div>
          ) : myOrders.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center space-y-2">
              <TruckIcon className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-700">No orders placed yet</p>
              <p className="text-xs text-slate-500">
                Use &ldquo;Buy Now&rdquo; on any product card above to place an instant order.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myOrders.slice(0, 4).map((ord) => {
                const status = ord.status || 'pending';
                const itemCountText =
                  ord.items_count ||
                  ord.order_items?.length ||
                  ord.items?.length ||
                  1;
                return (
                  <div
                    key={ord.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">
                        Order #{ord.order_number || ord.id}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(ord.created_at)} • {itemCountText} item(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${getStatusColor(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {formatPrice(ord.total || 0)}
                      </span>
                      <Link
                        to={`/orders/${ord.id}`}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Active Cart Quick-Checkout */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-900">Active Cart Quick-Checkout</h2>
              <Link to="/cart" className="text-xs font-semibold text-blue-600 hover:underline">
                Open Full Cart ({totalItems}) →
              </Link>
            </div>

            {cartItems.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center space-y-2">
                <ShoppingCartIcon className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-700">Your cart is currently empty</p>
                <p className="text-xs text-slate-500">
                  Click &ldquo;Add to Cart&rdquo; or &ldquo;Buy Now&rdquo; on any item above to test live checkout.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.product_image ? (
                        <img
                          src={item.product_image}
                          alt={item.product_name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                          ITEM
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Qty {item.quantity} × {formatPrice(item.price_at_add)}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-blue-600 shrink-0">
                      {formatPrice(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">Cart Subtotal</span>
              <span className="text-xl font-extrabold text-slate-900">{formatPrice(cartTotal)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Link
                to="/cart"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold hover:bg-slate-200 transition-colors flex items-center justify-center"
              >
                Go to Cart ({totalItems})
              </Link>
              <Link
                to={cartItems.length > 0 ? '/checkout/cod' : '/products'}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center"
              >
                {cartItems.length > 0 ? 'Instant COD Checkout →' : 'Shop Products →'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
