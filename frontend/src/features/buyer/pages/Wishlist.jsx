// src/features/buyer/pages/Wishlist.jsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { wishlistAPI, cartAPI } from '../../../utils/api';
import { useCart } from '../../../context/CartContext';
import { useAuth } from '../../../context/AuthContext';
import Loader from '../../../components/common/Loader';
import toast from 'react-hot-toast';
import { TrashIcon, ShoppingBagIcon, HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { formatPrice } from '../../../utils/helpers';

const Wishlist = () => {
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(null);
  const { fetchCart } = useCart();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchWishlist();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchWishlist = async () => {
    setLoading(true);
    try {
      console.log('Fetching wishlist...');
      const response = await wishlistAPI.getWishlist();
      console.log('Wishlist response:', response.data);
      
      // ✅ FIX: Handle both response formats
      let products = [];
      if (response.data.products) {
        products = response.data.products;
      } else if (response.data.wishlist && response.data.wishlist.products) {
        products = response.data.wishlist.products;
      } else if (Array.isArray(response.data)) {
        products = response.data;
      }
      
      console.log('Products extracted:', products);
      setWishlist(products);
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      toast.error(error.response?.data?.error || 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  };

  const removeFromWishlist = async (productId) => {
    try {
      await wishlistAPI.removeFromWishlist(productId);
      setWishlist(wishlist.filter(p => p.id !== productId));
      toast.success('Removed from wishlist');
    } catch (error) {
      console.error('Remove from wishlist error:', error);
      toast.error(error.response?.data?.error || 'Failed to remove from wishlist');
    }
  };

  const handleAddToCart = async (product) => {
    setAddingToCart(product.id);
    try {
      await cartAPI.addToCart({ product_id: product.id, quantity: 1 });
      toast.success('Added to cart!');
      await removeFromWishlist(product.id);
      await fetchCart();
    } catch (error) {
      console.error('Add to cart error:', error);
      toast.error(error.response?.data?.error || 'Failed to add to cart');
    } finally {
      setAddingToCart(null);
    }
  };

  if (loading) return <Loader />;

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <HeartIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-4">Please Login ❤️</h2>
          <p className="text-gray-600 mb-8">Login to view and manage your wishlist</p>
          <Link to="/login" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
            Login Now
          </Link>
        </div>
      </div>
    );
  }

  if (wishlist.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <HeartIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-4">Your Wishlist is Empty ❤️</h2>
          <p className="text-gray-600 mb-8">Save your favorite items here</p>
          <Link to="/products" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">My Wishlist ❤️</h1>
        <span className="text-gray-600">{wishlist.length} items</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {wishlist.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
            <Link to={`/products/${product.slug}`}>
              <div className="h-48 bg-gray-200 relative">
                {product.main_image_url ? (
                  <img src={product.main_image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                )}
                <div className="absolute top-2 right-2">
                  <HeartSolid className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </Link>

            <div className="p-4">
              <Link to={`/products/${product.slug}`}>
                <h3 className="font-semibold hover:text-blue-600 line-clamp-1">{product.name}</h3>
              </Link>
              <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                {product.final_description || product.description || ''}
              </p>
              
              <div className="flex items-center justify-between mt-2">
                <span className="text-xl font-bold text-blue-600">{formatPrice(product.price)}</span>
                {product.compare_price && product.compare_price > product.price && (
                  <span className="text-sm text-gray-400 line-through">{formatPrice(product.compare_price)}</span>
                )}
              </div>

              {product.discount_percentage > 0 && (
                <div className="mt-1">
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                    -{product.discount_percentage}% OFF
                  </span>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => handleAddToCart(product)} 
                  disabled={addingToCart === product.id}
                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <ShoppingBagIcon className="w-4 h-4 mr-1" /> 
                  {addingToCart === product.id ? 'Adding...' : 'Add to Cart'}
                </button>
                <button 
                  onClick={() => removeFromWishlist(product.id)} 
                  className="bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 transition-colors"
                  aria-label="Remove from wishlist"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Wishlist;