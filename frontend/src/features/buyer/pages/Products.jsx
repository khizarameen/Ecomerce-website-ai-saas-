// src/features/buyer/pages/Products.jsx
import { useState, useEffect, useCallback, useId } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { productAPI, categoryAPI, wishlistAPI } from '../../../utils/api';
import { useAuth } from '../../../context/AuthContext';
import { useCart } from '../../../context/CartContext';
import ProductCard from '../components/ProductCard';
import Loader from '../../../components/common/Loader';
import toast from 'react-hot-toast';
import { MagnifyingGlassIcon, FunnelIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const Products = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { addToCart } = useCart();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [wishlistedIds, setWishlistedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('category') || '');
  const [minPrice, setMinPrice] = useState(() => searchParams.get('min_price') || '');
  const [maxPrice, setMaxPrice] = useState(() => searchParams.get('max_price') || '');
  const [sortBy, setSortBy] = useState(() => searchParams.get('ordering') || '-created_at');

  const baseId = useId();

  const fetchCatalog = useCallback(
    async ({ search = searchTerm, category = selectedCategory, min = minPrice, max = maxPrice, sort = sortBy } = {}) => {
      setLoading(true);
      try {
        const params = { limit: 100 };
        if (search?.trim()) params.search = search.trim();
        if (category) params.category = category;
        if (min !== '') params.min_price = min;
        if (max !== '') params.max_price = max;
        if (sort) params.ordering = sort;

        const res = await productAPI.getProducts(params);
        const list = res.data?.results || res.data?.products || (Array.isArray(res.data) ? res.data : []);
        setProducts(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error('Error loading catalog:', error);
        toast.error('Failed to load marketplace catalog');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    [searchTerm, selectedCategory, minPrice, maxPrice, sortBy]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await categoryAPI.getCategories();
        const list = res.data?.results || res.data?.categories || res.data || [];
        if (active) setCategories(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated) {
        await Promise.resolve();
        if (active) setWishlistedIds(new Set());
        return;
      }
      try {
        const res = await wishlistAPI.getWishlist();
        const items = res.data?.wishlist?.items || res.data?.items || res.data?.results || [];
        const ids = new Set(items.map((item) => item.product?.id || item.product_id || item.id).filter(Boolean));
        if (active) setWishlistedIds(ids);
      } catch {
        // Optional enhancement; ignore wishlist failures
      }
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;
    const nextSearch = searchParams.get('search') || '';
    const nextCat = searchParams.get('category') || '';
    (async () => {
      try {
        const params = { limit: 100 };
        if (nextSearch.trim()) params.search = nextSearch.trim();
        if (nextCat) params.category = nextCat;
        if (minPrice !== '') params.min_price = minPrice;
        if (maxPrice !== '') params.max_price = maxPrice;
        if (sortBy) params.ordering = sortBy;

        const res = await productAPI.getProducts(params);
        const list = res.data?.results || res.data?.products || (Array.isArray(res.data) ? res.data : []);
        if (active) {
          setSearchTerm(nextSearch);
          setSelectedCategory(nextCat);
          setProducts(Array.isArray(list) ? list : []);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading catalog:', error);
        if (active) {
          toast.error('Failed to load marketplace catalog');
          setProducts([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sortBy]);

  const applyFilters = (e) => {
    if (e) e.preventDefault();
    const next = {};
    if (searchTerm.trim()) next.search = searchTerm.trim();
    if (selectedCategory) next.category = selectedCategory;
    if (minPrice !== '') next.min_price = minPrice;
    if (maxPrice !== '') next.max_price = maxPrice;
    if (sortBy) next.ordering = sortBy;
    setSearchParams(next);
    fetchCatalog({ search: searchTerm, category: selectedCategory, min: minPrice, max: maxPrice, sort: sortBy });
  };

  const handleCategoryPick = (catId) => {
    setSelectedCategory(catId);
    const next = {};
    if (searchTerm.trim()) next.search = searchTerm.trim();
    if (catId) next.category = catId;
    if (sortBy) next.ordering = sortBy;
    setSearchParams(next);
    fetchCatalog({ search: searchTerm, category: catId, min: minPrice, max: maxPrice, sort: sortBy });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('-created_at');
    setSearchParams({});
    fetchCatalog({ search: '', category: '', min: '', max: '', sort: '-created_at' });
  };

  const handleAddToCart = async (productId) => {
    if (!isAuthenticated) {
      toast.error('Please login (or launch Demo Buyer) to add items to cart');
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

  const handleWishlistToggle = async (productId) => {
    if (!isAuthenticated) {
      toast.error('Please login to save wishlist items');
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
        toast.success('Added to wishlist');
      }
    } catch {
      toast.error('Could not update wishlist');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Marketplace Catalog
          </h1>
          <p className="text-sm text-slate-600 mt-1" aria-live="polite">
            {loading ? 'Loading products...' : `Showing ${products.length} verified product(s)`}
          </p>
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="self-start md:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
        >
          <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
          <span>Reset Filters</span>
        </button>
      </div>

      {/* Category Filter Pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => handleCategoryPick('')}
            aria-pressed={selectedCategory === ''}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              selectedCategory === ''
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryPick(String(cat.id))}
              aria-pressed={String(selectedCategory) === String(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                String(selectedCategory) === String(cat.id)
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Search & Price Filters */}
      <search>
        <form
          onSubmit={applyFilters}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
        >
          <div className="lg:col-span-2">
            <label htmlFor={`${baseId}-q`} className="block text-xs font-semibold text-slate-700 mb-1">
              Keyword Search
            </label>
            <div className="relative">
              <input
                id={`${baseId}-q`}
                name="search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, category, specs..."
                className="w-full min-h-[42px] pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <MagnifyingGlassIcon
                className="w-4 h-4 text-slate-400 absolute left-3 top-3"
                aria-hidden="true"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${baseId}-min`} className="block text-xs font-semibold text-slate-700 mb-1">
              Min Price ($)
            </label>
            <input
              id={`${baseId}-min`}
              name="min_price"
              type="number"
              min="0"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-max`} className="block text-xs font-semibold text-slate-700 mb-1">
              Max Price ($)
            </label>
            <input
              id={`${baseId}-max`}
              name="max_price"
              type="number"
              min="0"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Any"
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-sort`} className="block text-xs font-semibold text-slate-700 mb-1">
              Sort By
            </label>
            <select
              id={`${baseId}-sort`}
              name="ordering"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="-created_at">Newest Arrivals</option>
              <option value="price">Price: Low to High</option>
              <option value="-price">Price: High to Low</option>
              <option value="-average_rating">Top Rated</option>
            </select>
          </div>

          <button
            type="submit"
            className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <FunnelIcon className="w-4 h-4" aria-hidden="true" />
            <span>Apply Filters</span>
          </button>
        </form>
      </search>

      {/* Product Grid */}
      {loading ? (
        <Loader />
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <p className="text-xl font-bold text-slate-800">No matching products found</p>
          <p className="text-sm text-slate-500">
            Try clearing filters or try our 4-Agent AI Search for global product bundles.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              Show All Products
            </button>
            <button
              type="button"
              onClick={() => navigate('/supplyshield')}
              className="px-4 py-2 rounded-xl bg-slate-900 text-cyan-300 text-sm font-semibold hover:bg-slate-800"
            >
              Open SupplyShield AI Search
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isWishlisted={wishlistedIds.has(product.id)}
              onWishlistToggle={handleWishlistToggle}
              onClick={() => navigate(`/products/${product.slug}`)}
              onAddToCart={() => handleAddToCart(product.id)}
              isAdding={addingId === product.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Products;
