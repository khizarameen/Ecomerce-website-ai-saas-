import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { aiAPI, productAPI } from '../../utils/api';
import Loader from '../../components/common/Loader';
import ProductCard from '../buyer/components/ProductCard';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const Recommendation = () => {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [limit, setLimit] = useState(5);

  useEffect(() => {
    if (productId) {
      fetchProductAndRecommendations();
    } else {
      // If no product ID, show trending recommendations
      fetchTrendingRecommendations();
    }
  }, [productId, limit]);

  const fetchProductAndRecommendations = async () => {
    setLoading(true);
    try {
      // Fetch product details
      const productRes = await productAPI.getProduct(productId);
      setProduct(productRes.data);

      // Fetch AI recommendations
      const recRes = await aiAPI.getRecommendations(productId, { limit });
      setRecommendations(recRes.data.results || []);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      toast.error('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingRecommendations = async () => {
    setLoading(true);
    try {
      // Get featured products as recommendations
      const response = await productAPI.getFeatured();
      setRecommendations(response.data.products || []);
    } catch (error) {
      console.error('Error fetching trending:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshRecommendations = async () => {
    if (!productId) return;
    setRecommendLoading(true);
    try {
      const response = await aiAPI.getRecommendations(productId, { limit });
      setRecommendations(response.data.results || []);
      toast.success('Recommendations refreshed!');
    } catch (error) {
      toast.error('Failed to refresh recommendations');
    } finally {
      setRecommendLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <SparklesIcon className="w-8 h-8 text-yellow-500 mr-3" />
              AI Recommendations
            </h1>
            <p className="text-gray-600 mt-1">
              {product 
                ? `Based on your interest in "${product.name}"`
                : 'Personalized product recommendations for you'
              }
            </p>
          </div>
          {productId && (
            <button
              onClick={refreshRecommendations}
              disabled={recommendLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-2 ${recommendLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>

        {/* Product Info (if from product) */}
        {product && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-gray-200 rounded-lg overflow-hidden">
                {product.main_image_url ? (
                  <img src={product.main_image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No img</div>
                )}
              </div>
              <div>
                <Link to={`/products/${product.slug}`} className="text-xl font-bold hover:text-blue-600">
                  {product.name}
                </Link>
                <p className="text-gray-600">${product.price}</p>
                <p className="text-sm text-gray-500">Based on this product, we recommend:</p>
              </div>
            </div>
          </div>
        )}

        {/* Recommendations Grid */}
        {recommendations.length > 0 ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">
                {product ? 'You Might Also Like' : 'Trending Products'}
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Show:</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="px-3 py-1 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {recommendations.map((rec) => (
                <ProductCard key={rec.id} product={rec} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <SparklesIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No recommendations available</p>
            <p className="text-gray-400 text-sm">Try browsing more products to get personalized recommendations</p>
          </div>
        )}

        {/* AI Explanation */}
        {recommendations.length > 0 && (
          <div className="mt-8 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-start">
              <SparklesIcon className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
              <div>
                <p className="text-sm text-blue-800 font-medium">How AI recommendations work</p>
                <p className="text-sm text-blue-600 mt-1">
                  Our AI analyzes product features, categories, and user behavior to suggest 
                  items that match your interests. Recommendations are updated in real-time.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Recommendation;