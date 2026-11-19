import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useAuth } from '../../../context/AuthContext';
import { ShoppingBagIcon, HeartIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../utils/helpers';

const ProductCard = ({ product, showAI = false, onClick }) => {
  const { addToCart } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isWishlist, setIsWishlist] = React.useState(false);

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error('Please login to add items to cart');
      navigate('/login');
      return;
    }
    addToCart(product.id, 1);
  };

  const handleWishlist = (e) => {
    e.stopPropagation();
    setIsWishlist(!isWishlist);
    toast.success(isWishlist ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/products/${product.slug}`);
    }
  };

  return (
    <div 
      className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 cursor-pointer relative"
      onClick={handleCardClick}
    >
      {showAI && (
        <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs px-2 py-1 rounded-full flex items-center shadow-md">
          <SparklesIcon className="w-3 h-3 mr-1" />
          AI Pick
        </div>
      )}
      
      {/* Product Image */}
      <div className="relative h-48 bg-gray-200">
        {product.main_image_url ? (
          <img
            src={product.main_image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            No Image
          </div>
        )}
        {product.discount_percentage > 0 && (
          <span className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-sm font-semibold shadow-md">
            -{product.discount_percentage}%
          </span>
        )}
        {!product.is_in_stock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-1 hover:text-blue-600 transition-colors line-clamp-1">
          {product.name}
        </h3>
        <p className="text-sm text-gray-600 mb-2 line-clamp-2">
          {product.final_description || product.short_description || ''}
        </p>
        
        {/* Rating */}
        {product.average_rating > 0 && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-2">
            <span>⭐</span>
            <span>{product.average_rating}</span>
            <span className="text-gray-400">({product.total_reviews})</span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xl font-bold text-blue-600">{formatPrice(product.price)}</span>
            {product.compare_price && (
              <span className="text-sm text-gray-400 line-through ml-2">
                {formatPrice(product.compare_price)}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleWishlist}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              aria-label="Add to wishlist"
            >
              {isWishlist ? (
                <HeartSolid className="w-5 h-5 text-red-500" />
              ) : (
                <HeartIcon className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={handleAddToCart}
              disabled={!product.is_in_stock}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <ShoppingBagIcon className="w-4 h-4 mr-1" />
              {product.is_in_stock ? 'Add' : 'Out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;