// src/features/seller/components/ProductForm.jsx
import { useState, useEffect, useId } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productAPI, categoryAPI } from '../../../utils/api';
import { useAuth } from '../../../context/AuthContext';
import toast from 'react-hot-toast';
import Loader from '../../../components/common/Loader';

const buildUniqueSku = () => `SKU-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

const generateSlugFromName = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, sellerProfile } = useAuth();
  const isEdit = Boolean(id);
  const baseId = useId();

  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categories, setCategories] = useState([]);
  const [existingImage, setExistingImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    short_description: '',
    price: '',
    compare_price: '',
    stock_quantity: '20',
    sku: buildUniqueSku(),
    category: '',
    status: 'published',
    is_featured: false,
    is_bestseller: false,
    is_new_arrival: true,
  });

  const storeName = sellerProfile?.store_name || `${user?.username || 'Seller'}'s Store`;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await categoryAPI.getCategories();
        const catList = res.data?.results || res.data?.categories || res.data || [];
        const normalized = Array.isArray(catList) ? catList : [];
        if (active) {
          setCategories(normalized);
          if (!isEdit && normalized.length > 0) {
            setFormData((prev) => (prev.category ? prev : { ...prev, category: String(normalized[0].id) }));
          }
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        if (active) toast.error('Failed to load categories');
      } finally {
        if (active) setLoadingCategories(false);
      }

      if (isEdit && id) {
        try {
          const response = await productAPI.getProduct(id);
          const product = response.data;
          const productCatId = product.category?.id ?? product.category_id ?? product.category ?? '';
          if (active) {
            setFormData({
              name: product.name || '',
              slug: product.slug || '',
              description: product.description || '',
              short_description: product.short_description || '',
              price: product.price ?? '',
              compare_price: product.compare_price ?? '',
              stock_quantity: product.stock_quantity ?? '0',
              sku: product.sku || buildUniqueSku(),
              category: productCatId ? String(productCatId) : '',
              status: product.status || 'published',
              is_featured: Boolean(product.is_featured),
              is_bestseller: Boolean(product.is_bestseller),
              is_new_arrival: Boolean(product.is_new_arrival),
            });
            setExistingImage(product.main_image_url || product.main_image || null);
          }
        } catch (error) {
          console.error('Error fetching product:', error);
          if (active) {
            toast.error('Failed to load product');
            navigate('/seller/products');
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id, isEdit, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'file') {
      const file = files?.[0];
      if (file) {
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setFilePreview(ev.target.result);
        reader.readAsDataURL(file);
        setExistingImage(null);
      } else {
        setSelectedFile(null);
        setFilePreview(null);
      }
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: generateSlugFromName(name),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      toast.error('Please enter a valid price');
      return;
    }
    if (formData.stock_quantity === '' || parseInt(formData.stock_quantity, 10) < 0) {
      toast.error('Please enter a valid stock quantity');
      return;
    }
    if (!formData.category) {
      toast.error('Please select a category');
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      payload.append('name', formData.name.trim());
      payload.append('slug', (formData.slug || generateSlugFromName(formData.name)).trim());
      payload.append('price', parseFloat(formData.price));
      payload.append('stock_quantity', parseInt(formData.stock_quantity, 10));
      payload.append('category', parseInt(formData.category, 10));
      payload.append('sku', (formData.sku || buildUniqueSku()).trim());
      payload.append('status', formData.status || 'published');
      payload.append('is_featured', formData.is_featured ? 'true' : 'false');
      payload.append('is_bestseller', formData.is_bestseller ? 'true' : 'false');
      payload.append('is_new_arrival', formData.is_new_arrival ? 'true' : 'false');

      if (formData.description) payload.append('description', formData.description);
      if (formData.short_description) payload.append('short_description', formData.short_description);
      if (formData.compare_price && parseFloat(formData.compare_price) > 0) {
        payload.append('compare_price', parseFloat(formData.compare_price));
      }
      if (selectedFile instanceof File) {
        payload.append('main_image', selectedFile);
      }

      if (isEdit) {
        await productAPI.updateProduct(id, payload);
        toast.success('Product updated successfully!');
      } else {
        await productAPI.createProduct(payload);
        toast.success('Product created and ready!');
      }
      navigate('/seller/products');
    } catch (error) {
      console.error('Error saving product:', error);
      const errData = error.response?.data;
      let msg = errData?.error || errData?.message || 'Failed to save product';
      if (!errData?.error && typeof errData === 'object' && errData !== null) {
        const joined = Object.entries(errData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        if (joined) msg = joined;
      }
      toast.error(msg);
      if (msg.toLowerCase().includes('sku')) {
        setFormData((prev) => ({ ...prev, sku: buildUniqueSku() }));
      }
    } finally {
      setLoading(false);
    }
  };

  if (loadingCategories || (loading && isEdit)) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">
            {isEdit ? 'Edit Product' : 'Add New Product'}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Publishing directly to <strong>{storeName}</strong> (no admin approval needed)
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${baseId}-name`} className="block text-sm font-semibold text-slate-700 mb-1">
              Product Name <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <input
              id={`${baseId}-name`}
              type="text"
              name="name"
              value={formData.name}
              onChange={handleNameChange}
              required
              placeholder="e.g. Sony WH-1000XM5 Headphones"
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-slug`} className="block text-sm font-semibold text-slate-700 mb-1">
              URL Slug
            </label>
            <input
              id={`${baseId}-slug`}
              type="text"
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              placeholder="auto-generated-from-name"
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${baseId}-short`} className="block text-sm font-semibold text-slate-700 mb-1">
            Short Summary
          </label>
          <input
            id={`${baseId}-short`}
            type="text"
            name="short_description"
            value={formData.short_description}
            onChange={handleChange}
            placeholder="One-line highlight shown on Buyer cards"
            className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-desc`} className="block text-sm font-semibold text-slate-700 mb-1">
            Full Description
          </label>
          <textarea
            id={`${baseId}-desc`}
            name="description"
            rows={4}
            value={formData.description}
            onChange={handleChange}
            placeholder="Detailed features, specs, and warranty info..."
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor={`${baseId}-price`} className="block text-sm font-semibold text-slate-700 mb-1">
              Price ($) <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <input
              id={`${baseId}-price`}
              type="number"
              step="0.01"
              min="0.01"
              name="price"
              value={formData.price}
              onChange={handleChange}
              required
              placeholder="199.00"
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-cprice`} className="block text-sm font-semibold text-slate-700 mb-1">
              Compare Price ($)
            </label>
            <input
              id={`${baseId}-cprice`}
              type="number"
              step="0.01"
              min="0"
              name="compare_price"
              value={formData.compare_price}
              onChange={handleChange}
              placeholder="249.00"
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-stock`} className="block text-sm font-semibold text-slate-700 mb-1">
              Stock Quantity <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <input
              id={`${baseId}-stock`}
              type="number"
              min="0"
              name="stock_quantity"
              value={formData.stock_quantity}
              onChange={handleChange}
              required
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor={`${baseId}-cat`} className="block text-sm font-semibold text-slate-700 mb-1">
              Category <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <select
              id={`${baseId}-cat`}
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-status`} className="block text-sm font-semibold text-slate-700 mb-1">
              Listing Status
            </label>
            <select
              id={`${baseId}-status`}
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="published">Published (Live on Storefront)</option>
              <option value="draft">Draft (Hidden from Buyers)</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>

          <div>
            <label htmlFor={`${baseId}-sku`} className="block text-sm font-semibold text-slate-700 mb-1">
              SKU
            </label>
            <div className="flex gap-2">
              <input
                id={`${baseId}-sku`}
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                className="flex-1 min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, sku: buildUniqueSku() }))}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                New
              </button>
            </div>
          </div>
        </div>

        {/* Optional Image Upload */}
        <div>
          <label htmlFor={`${baseId}-img`} className="block text-sm font-semibold text-slate-700 mb-1">
            Product Image (Optional)
          </label>
          <span id={`${baseId}-img-hint`} className="block text-xs text-slate-500 mb-2">
            Optional — if no image is uploaded, StoreHub auto-generates a crisp product cover.
          </span>

          {(filePreview || existingImage) && (
            <div className="mb-3">
              <img
                src={filePreview || existingImage}
                alt={formData.name ? `${formData.name} preview` : 'Product cover preview'}
                className="h-28 w-28 object-cover rounded-xl border border-slate-200"
              />
            </div>
          )}

          <input
            id={`${baseId}-img`}
            type="file"
            name="main_image"
            accept="image/*"
            aria-describedby={`${baseId}-img-hint`}
            onChange={handleChange}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {/* Merchandise Flags */}
        <fieldset className="pt-2">
          <legend className="text-sm font-semibold text-slate-700 mb-2">Storefront Placements</legend>
          <div className="flex flex-wrap gap-5">
            <label htmlFor={`${baseId}-feat`} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                id={`${baseId}-feat`}
                type="checkbox"
                name="is_featured"
                checked={formData.is_featured}
                onChange={handleChange}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Featured</span>
            </label>
            <label htmlFor={`${baseId}-best`} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                id={`${baseId}-best`}
                type="checkbox"
                name="is_bestseller"
                checked={formData.is_bestseller}
                onChange={handleChange}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Bestseller</span>
            </label>
            <label htmlFor={`${baseId}-new`} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                id={`${baseId}-new`}
                type="checkbox"
                name="is_new_arrival"
                checked={formData.is_new_arrival}
                onChange={handleChange}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>New Arrival</span>
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200">
          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Publish Product'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/seller/products')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
