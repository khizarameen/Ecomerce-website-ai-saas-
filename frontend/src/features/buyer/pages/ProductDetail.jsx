// src/features/buyer/pages/ProductDetail.jsx

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useAuth } from '../../../context/AuthContext';
import { publicAPI, wishlistAPI, reviewAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import { formatPrice, formatDate } from '../../../utils/helpers';
import { 
  StarIcon, 
  ShoppingBagIcon, 
  HeartIcon, 
  ArrowLeftIcon,
  ShoppingCartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  TruckIcon,
  ShieldCheckIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

// Helper function to extract wishlist products from different response formats
const extractWishlistProducts = (data) => {
  if (!data) return [];
  
  if (data.products) {
    return data.products;
  }
  
  if (data.wishlist && data.wishlist.products) {
    return data.wishlist.products;
  }
  
  if (Array.isArray(data)) {
    return data;
  }
  
  return [];
};

const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, fetchCart } = useCart();
  const { isAuthenticated } = useAuth();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isWishlist, setIsWishlist] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [addingToCart, setAddingToCart] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [buyNowLoading, setBuyNowLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await publicAPI.getProduct(slug);
        const productData = response.data.product;
        if (!active || !productData) return;

        setProduct(productData);
        if (productData.main_image_url) {
          setSelectedImage(productData.main_image_url);
        }
        if (productData.related_products) {
          setRelatedProducts(productData.related_products);
        }

        const revRes = await reviewAPI.getReviews({ product_id: productData.id }).catch(() => null);
        if (active && revRes?.data?.reviews) {
          setReviews(revRes.data.reviews);
        }

        if (isAuthenticated) {
          try {
            const wishlistRes = await wishlistAPI.getWishlist();
            const wishlistProducts = extractWishlistProducts(wishlistRes.data);
            if (active) setIsWishlist(wishlistProducts.some((p) => p.id === productData.id));
          } catch {
            if (active) setIsWishlist(false);
          }
        }
      } catch (error) {
        if (active) {
          const errorMsg = error.response?.data?.error || error.response?.data?.detail || 'Product not found';
          toast.error(errorMsg);
          navigate('/products');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, isAuthenticated, navigate]);

  const checkWishlistStatus = async (productId) => {
    try {
      const wishlistRes = await wishlistAPI.getWishlist();
      const wishlistProducts = extractWishlistProducts(wishlistRes.data);
      setIsWishlist(wishlistProducts.some((p) => p.id === productId));
    } catch {
      setIsWishlist(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error('Please login as a Buyer to write a review');
      navigate('/login');
      return;
    }
    if (!reviewTitle.trim() || !reviewBody.trim()) {
      toast.error('Please add a review headline and details');
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await reviewAPI.createReview({
        product: product.id,
        rating: reviewRating,
        title: reviewTitle.trim(),
        review: reviewBody.trim(),
      });
      toast.success(
        res.data?.updated
          ? 'Review updated! AI Search & Seller Insights refreshed.'
          : 'Thank you! Your review is live and helps other buyers & the AI agent.'
      );
      setReviewTitle('');
      setReviewBody('');
      const revRes = await reviewAPI.getReviews({ product_id: product.id });
      if (revRes?.data?.reviews) setReviews(revRes.data.reviews);
      if (res.data?.average_rating !== undefined) {
        setProduct((prev) => ({
          ...prev,
          average_rating: res.data.average_rating,
          total_reviews: res.data.total_reviews,
        }));
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || 'Could not submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to add items to cart');
      navigate('/login');
      return;
    }
    
    if (!product) {
      toast.error('Product not available');
      return;
    }
    
    if (product.stock_quantity <= 0) {
      toast.error('Product is out of stock');
      return;
    }
    
    setAddingToCart(true);
    try {
      console.log('Adding to cart:', { product_id: product.id, quantity });
      const result = await addToCart(product.id, quantity);
      console.log('Add to cart result:', result);
      
      if (result && result.success) {
        toast.success(`Added ${quantity} x ${product.name} to cart!`);
        // Refresh cart
        await fetchCart();
      } else {
        toast.error(result?.error || 'Failed to add to cart');
      }
    } catch (error) {
      console.error('Add to cart error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to add to cart';
      toast.error(errorMsg);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleWishlist = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to add to wishlist');
      navigate('/login');
      return;
    }
    
    try {
      console.log('Toggling wishlist for product:', product.id);
      console.log('Current wishlist state:', isWishlist);
      
      if (isWishlist) {
        console.log('Removing from wishlist...');
        await wishlistAPI.removeFromWishlist(product.id);
        setIsWishlist(false);
        toast.success('Removed from wishlist');
      } else {
        console.log('Adding to wishlist...');
        await wishlistAPI.addToWishlist({ product_id: product.id });
        setIsWishlist(true);
        toast.success('Added to wishlist');
      }
      
      // Refresh wishlist status to ensure consistency
      await checkWishlistStatus(product.id);
      
    } catch (error) {
      console.error('Wishlist error:', error);
      console.error('Error response:', error.response);
      toast.error(error.response?.data?.error || 'Failed to update wishlist');
    }
  };

  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      toast.error('Please login to checkout');
      navigate('/login');
      return;
    }
    
    if (!product) {
      toast.error('Product not available');
      return;
    }
    
    if (product.stock_quantity <= 0) {
      toast.error('Product is out of stock');
      return;
    }
    
    setBuyNowLoading(true);
    try {
      console.log('Buy now:', { product_id: product.id, quantity });
      
      // Add to cart first
      const result = await addToCart(product.id, quantity);
      console.log('Add to cart result:', result);
      
      if (result && result.success) {
        // Refresh cart
        await fetchCart();
        // Navigate to checkout/payment
        navigate('/payment/methods');
      } else {
        toast.error(result?.error || 'Failed to add to cart');
      }
    } catch (error) {
      console.error('Buy now error:', error);
      toast.error('Failed to process purchase');
    } finally {
      setBuyNowLoading(false);
    }
  };

  const handleQuantityChange = (e) => {
    const val = parseInt(e.target.value);
    if (val >= 1 && val <= (product?.stock_quantity || 10)) {
      setQuantity(val);
    }
  };

  const incrementQuantity = () => {
    if (quantity < (product?.stock_quantity || 10)) {
      setQuantity(quantity + 1);
    } else {
      toast.error(`Only ${product?.stock_quantity || 0} items available`);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const nextImage = () => {
    if (product?.images?.length) {
      const nextIndex = (currentImageIndex + 1) % product.images.length;
      setCurrentImageIndex(nextIndex);
      setSelectedImage(product.images[nextIndex].image_url);
    }
  };

  const prevImage = () => {
    if (product?.images?.length) {
      const prevIndex = (currentImageIndex - 1 + product.images.length) % product.images.length;
      setCurrentImageIndex(prevIndex);
      setSelectedImage(product.images[prevIndex].image_url);
    }
  };

  if (loading) return <Loader />;
  
  if (!product) return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-600">Product not found</h2>
        <Link to="/products" className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
          ← Back to Products
        </Link>
      </div>
    </div>
  );

  const isOutOfStock = product.stock_quantity <= 0;
  const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <Link to="/" className="hover:text-blue-600">Home</Link>
        <span>/</span>
        <Link to="/products" className="hover:text-blue-600">Products</Link>
        <span>/</span>
        {product.category && (
          <>
            <Link 
              to={`/products?category=${product.category.id}`} 
              className="hover:text-blue-600"
            >
              {product.category.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-800 font-medium truncate">{product.name}</span>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6">
          {/* Product Images Section */}
          <div>
            {/* Main Image */}
            <div className="relative bg-gray-100 rounded-lg overflow-hidden h-96 mb-4 group">
              {selectedImage ? (
                <>
                  <img
                    src={selectedImage}
                    alt={product.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.target.src = '/placeholder-image.jpg';
                    }}
                  />
                  {/* Navigation arrows for multiple images */}
                  {product.images && product.images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md transition-all opacity-0 group-hover:opacity-100"
                        aria-label="Previous image"
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md transition-all opacity-0 group-hover:opacity-100"
                        aria-label="Next image"
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  {/* Image counter */}
                  {product.images && product.images.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full">
                      {currentImageIndex + 1} / {product.images.length}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    No Image Available
                  </div>
                </div>
              )}
            </div>
            
            {/* Thumbnail Images */}
            {product.images && product.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSelectedImage(img.image_url);
                      setCurrentImageIndex(index);
                    }}
                    className={`w-20 h-20 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                      selectedImage === img.image_url 
                        ? 'border-blue-600 shadow-md' 
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                    aria-label={`Thumbnail ${index + 1}`}
                  >
                    <img
                      src={img.image_url}
                      alt={img.alt_text || product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = '/placeholder-image.jpg';
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info Section */}
          <div className="space-y-6">
            {/* Title & Wishlist */}
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{product.name}</h1>
                {product.category && (
                  <Link 
                    to={`/products?category=${product.category.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700 inline-block mt-1"
                  >
                    {product.category.name}
                  </Link>
                )}
              </div>
              <button
                onClick={handleWishlist}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 ml-2"
                aria-label={isWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                {isWishlist ? (
                  <HeartSolid className="w-6 h-6 text-red-500" />
                ) : (
                  <HeartIcon className="w-6 h-6 text-gray-400 hover:text-red-500" />
                )}
              </button>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  i < Math.floor(product.average_rating || 0) ? (
                    <StarSolid key={i} className="w-5 h-5 text-yellow-400" />
                  ) : (
                    <StarIcon key={i} className="w-5 h-5 text-gray-300" />
                  )
                ))}
              </div>
              {product.average_rating > 0 && (
                <>
                  <span className="text-sm font-medium text-gray-700">
                    {product.average_rating.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({product.total_reviews || 0} reviews)
                  </span>
                </>
              )}
              {!product.average_rating && (
                <span className="text-sm text-gray-500">No reviews yet</span>
              )}
            </div>

            {/* Price */}
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold text-blue-600">
                {formatPrice(product.price)}
              </span>
              {product.compare_price && product.compare_price > product.price && (
                <>
                  <span className="text-lg text-gray-400 line-through">
                    {formatPrice(product.compare_price)}
                  </span>
                  <span className="bg-red-500 text-white px-2 py-1 rounded text-sm font-semibold">
                    -{product.discount_percentage || 0}%
                  </span>
                </>
              )}
            </div>

            {/* Stock Status */}
            <div className="flex items-center gap-2">
              {isOutOfStock ? (
                <span className="text-red-600 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                  Out of Stock
                </span>
              ) : isLowStock ? (
                <span className="text-orange-500 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                  Only {product.stock_quantity} left in stock
                </span>
              ) : (
                <span className="text-green-600 font-semibold flex items-center gap-1">
                  <CheckCircleIcon className="w-5 h-5" />
                  In Stock ({product.stock_quantity} available)
                </span>
              )}
            </div>

            {/* Quick Info Badges */}
            <div className="flex flex-wrap gap-3">
              {product.is_featured && (
                <span className="bg-purple-100 text-purple-700 text-xs px-3 py-1 rounded-full font-medium">
                  ⭐ Featured
                </span>
              )}
              {product.is_bestseller && (
                <span className="bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full font-medium">
                  🏆 Bestseller
                </span>
              )}
              {product.is_new_arrival && (
                <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-medium">
                  ✨ New Arrival
                </span>
              )}
            </div>

            {/* Description */}
            <div className="border-t border-b py-4">
              <h3 className="font-semibold mb-2 text-gray-700">Description</h3>
              <p className="text-gray-600 whitespace-pre-wrap">
                {product.final_description || product.description || 'No description available'}
              </p>
            </div>

            {/* Specifications */}
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <div className="border-b pb-4">
                <h3 className="font-semibold mb-2 text-gray-700">Specifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-sm text-gray-600 capitalize">{key.replace('_', ' ')}</span>
                      <span className="text-sm font-medium text-gray-800">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seller Info */}
            {product.seller && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    {product.seller.logo ? (
                      <img 
                        src={product.seller.logo} 
                        alt={product.seller.store_name} 
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-500 text-xl font-bold">
                        {product.seller.store_name?.charAt(0) || 'S'}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Sold by</p>
                    <Link 
                      to={`/seller/${product.seller.store_slug || product.seller.id}`} 
                      className="font-semibold hover:text-blue-600"
                    >
                      {product.seller.store_name || product.seller.name || 'Unknown Seller'}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <StarIcon className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-gray-600">
                        {product.seller.average_rating || 0} ({product.seller.total_reviews || 0} reviews)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shipping & Returns */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <TruckIcon className="w-5 h-5 text-gray-400" />
                <span>Free Shipping</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <ArrowPathIcon className="w-5 h-5 text-gray-400" />
                <span>30 Days Return</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <ShieldCheckIcon className="w-5 h-5 text-gray-400" />
                <span>Secure Payment</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <CheckCircleIcon className="w-5 h-5 text-gray-400" />
                <span>Genuine Products</span>
              </div>
            </div>

            {/* Quantity & Actions */}
            <div className="space-y-4">
              {/* Quantity Selector */}
              <div className="flex items-center gap-4">
                <label className="font-medium text-gray-700">Quantity:</label>
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button
                    onClick={decrementQuantity}
                    className="px-3 py-2 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isOutOfStock || quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={handleQuantityChange}
                    min="1"
                    max={product.stock_quantity || 10}
                    className="w-16 text-center border-x py-2 outline-none"
                    disabled={isOutOfStock}
                    aria-label="Quantity"
                  />
                  <button
                    onClick={incrementQuantity}
                    className="px-3 py-2 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isOutOfStock || quantity >= (product.stock_quantity || 10)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm text-gray-500">
                  Max: {product.stock_quantity || 0}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock || addingToCart}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                    isOutOfStock || addingToCart
                      ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <ShoppingBagIcon className="w-5 h-5" />
                  {addingToCart ? 'Adding...' : 'Add to Cart'}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={isOutOfStock || buyNowLoading}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                    isOutOfStock || buyNowLoading
                      ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  <ShoppingCartIcon className="w-5 h-5" />
                  {buyNowLoading ? 'Processing...' : 'Buy Now'}
                </button>
              </div>

              {/* Quick Links */}
              <div className="flex flex-wrap justify-center gap-4 text-sm pt-2">
                <Link to="/products" className="text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <ArrowLeftIcon className="w-4 h-4" />
                  Continue Shopping
                </Link>
                <Link to="/cart" className="text-blue-600 hover:text-blue-700">
                  View Cart
                </Link>
                {isAuthenticated && (
                  <>
                    <Link to="/orders" className="text-blue-600 hover:text-blue-700">
                      My Orders
                    </Link>
                    <Link to="/wishlist" className="text-blue-600 hover:text-blue-700">
                      My Wishlist
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buyer Reviews & Ratings Section (Powers AI Search & Seller Improvements) */}
      <section className="mt-10 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Buyer Reviews &amp; Verified Feedback</h2>
            <p className="text-xs text-slate-500">
              Reviews directly help our AI Shopping Agent recommend the right product &amp; help the Seller improve listings.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl">
            <StarSolid className="w-5 h-5 text-amber-500" aria-hidden="true" />
            <span className="font-extrabold text-slate-900">
              {Number(product.average_rating || 0).toFixed(1)}
            </span>
            <span className="text-xs text-slate-600">({product.total_reviews || reviews.length} reviews)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Review Submission Form */}
          <form onSubmit={handleSubmitReview} className="lg:col-span-5 rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Write a Review</h3>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} stars`}
                  onClick={() => setReviewRating(star)}
                  className="p-1 cursor-pointer"
                >
                  {star <= reviewRating ? (
                    <StarSolid className="w-6 h-6 text-amber-500" />
                  ) : (
                    <StarIcon className="w-6 h-6 text-slate-300" />
                  )}
                </button>
              ))}
              <span className="ml-2 text-xs font-bold text-slate-700">{reviewRating} / 5 Stars</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['Great Quality', 'Accurate Specs', 'Fast Shipping', 'Needs Clearer Description'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setReviewTitle(tag)}
                  className="px-2.5 py-1 rounded-full bg-white border border-slate-300 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 cursor-pointer"
                >
                  + {tag}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Review headline (e.g., Great battery & deep bass)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
            />
            <textarea
              rows={3}
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="Share product quality, battery/size accuracy, or delivery experience..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
            />
            <button
              type="submit"
              disabled={submittingReview}
              className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {submittingReview ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>

          {/* Reviews List */}
          <div className="lg:col-span-7 space-y-3">
            {reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                No reviews yet for this product. Be the first Buyer to share helpful feedback!
              </div>
            ) : (
              reviews.map((rev) => (
                <article key={rev.id} className="rounded-2xl border border-slate-200 p-4 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold">
                        {rev.rating} ★
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{rev.title}</h4>
                    </div>
                    {rev.is_verified_purchase && (
                      <span className="text-[11px] font-bold text-emerald-700">✓ Verified Buyer</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{rev.review}</p>
                  <p className="text-[11px] text-slate-400">
                    By {rev.user_name || 'Buyer'} · {formatDate(rev.created_at)}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">You Might Also Like</h2>
            <Link to="/products" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {relatedProducts.slice(0, 4).map((related) => (
              <Link to={`/products/${related.slug}`} key={related.id}>
                <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full">
                  <div className="h-48 bg-gray-200">
                    {related.main_image_url ? (
                      <img 
                        src={related.main_image_url} 
                        alt={related.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = '/placeholder-image.jpg';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold line-clamp-1 text-gray-800">{related.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-blue-600 font-bold">{formatPrice(related.price)}</p>
                      {related.discount_percentage > 0 && (
                        <span className="text-xs text-red-500 font-medium">-{related.discount_percentage}%</span>
                      )}
                    </div>
                    {related.average_rating > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <StarIcon className="w-3 h-3 text-yellow-400 fill-current" />
                        <span className="text-xs text-gray-600">{related.average_rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;