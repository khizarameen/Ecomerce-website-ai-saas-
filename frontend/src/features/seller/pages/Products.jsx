// src/features/seller/pages/Products.jsx
import { useState, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import { sellerAPI, productAPI, categoryAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import { formatPrice } from '../../../utils/helpers';
import toast from 'react-hot-toast';
import {
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const baseId = useId();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          sellerAPI.getMyProducts(),
          categoryAPI.getCategories(),
        ]);
        if (!active) return;
        const pList = prodRes.data?.products || prodRes.data?.results || [];
        const cList = catRes.data?.results || catRes.data?.categories || catRes.data || [];
        setProducts(Array.isArray(pList) ? pList : []);
        setCategories(Array.isArray(cList) ? cList : []);
      } catch (error) {
        console.error('Error fetching seller products:', error);
        if (active) {
          toast.error('Failed to load your store products');
          setProducts([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleToggleStatus = async (product) => {
    const nextStatus = product.status === 'published' ? 'draft' : 'published';
    setTogglingId(product.id);
    try {
      await productAPI.patchProduct(product.id, { status: nextStatus });
      toast.success(`Product marked as ${nextStatus}`);
      setProducts((prev) =>
        prev.map((item) => (item.id === product.id ? { ...item, status: nextStatus } : item))
      );
    } catch (error) {
      console.error('Status update error:', error);
      toast.error('Could not update product status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await productAPI.deleteProduct(id);
      toast.success('Product deleted');
      setProducts((prev) => prev.filter((item) => item.id !== id));
    } catch {
      toast.error('Failed to delete product');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchTerm.trim() ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      !selectedCategory || String(p.category) === String(selectedCategory);
    const matchesStatus = !selectedStatus || p.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const map = {
      published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      draft: 'bg-slate-100 text-slate-700 border-slate-200',
      out_of_stock: 'bg-rose-100 text-rose-800 border-rose-200',
    };
    return (
      <span
        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border capitalize ${
          map[status] || map.draft
        }`}
      >
        {(status || 'draft').replace('_', ' ')}
      </span>
    );
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            My Store Products
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {filteredProducts.length} of {products.length} product(s) shown
          </p>
        </div>

        <Link
          to="/seller/products/add"
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 shadow-sm"
        >
          <PlusIcon className="w-5 h-5" aria-hidden="true" />
          <span>Add Product</span>
        </Link>
      </div>

      {/* Filters */}
      <search>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div>
            <label htmlFor={`${baseId}-search`} className="block text-xs font-semibold text-slate-700 mb-1">
              Search Product / SKU
            </label>
            <div className="relative">
              <input
                id={`${baseId}-search`}
                name="search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by product name or SKU..."
                className="w-full min-h-[40px] pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <MagnifyingGlassIcon
                className="w-4 h-4 text-slate-400 absolute left-3 top-3"
                aria-hidden="true"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${baseId}-cat`} className="block text-xs font-semibold text-slate-700 mb-1">
              Category
            </label>
            <select
              id={`${baseId}-cat`}
              name="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-status`} className="block text-xs font-semibold text-slate-700 mb-1">
              Publish Status
            </label>
            <select
              id={`${baseId}-status`}
              name="status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
        </form>
      </search>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <p className="text-xl font-bold text-slate-800">No products found</p>
          <p className="text-sm text-slate-500">
            Create a product to immediately list it on the Buyer Storefront.
          </p>
          <Link
            to="/seller/products/add"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
          >
            <PlusIcon className="w-4 h-4" aria-hidden="true" />
            <span>Add Your First Product</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredProducts.map((product) => (
            <article
              key={product.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div className="relative h-44 bg-slate-100">
                {product.main_image_url ? (
                  <img
                    src={product.main_image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                    Auto Cover
                  </div>
                )}
                <div className="absolute top-2.5 right-2.5">
                  {getStatusBadge(product.status)}
                </div>
                {product.category_name && (
                  <span className="absolute top-2.5 left-2.5 bg-slate-900/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    {product.category_name}
                  </span>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900 line-clamp-1">{product.name}</h2>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-extrabold text-blue-600">
                      {formatPrice(product.price)}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Stock: {product.stock_quantity ?? 0}
                    </span>
                  </div>
                  {product.sku && (
                    <p className="text-[11px] text-slate-400 font-mono mt-1 truncate">
                      SKU: {product.sku}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={togglingId === product.id}
                    onClick={() => handleToggleStatus(product)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      product.status === 'published'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {togglingId === product.id
                      ? 'Updating...'
                      : product.status === 'published'
                      ? 'Move to Draft'
                      : 'Publish Live'}
                  </button>

                  <div className="flex gap-2">
                    <Link
                      to={`/seller/products/${product.id}/edit`}
                      className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-lg text-center text-xs font-bold hover:bg-indigo-700 inline-flex items-center justify-center gap-1"
                    >
                      <PencilSquareIcon className="w-4 h-4" aria-hidden="true" />
                      <span>Edit</span>
                    </Link>
                    <button
                      type="button"
                      aria-label={`Delete ${product.name}`}
                      onClick={() => handleDelete(product.id, product.name)}
                      className="bg-rose-600 text-white px-3 py-2 rounded-lg hover:bg-rose-700 inline-flex items-center justify-center"
                    >
                      <TrashIcon className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default Products;
