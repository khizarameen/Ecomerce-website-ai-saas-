import React, { useState } from 'react';
import { aiAPI, productAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/common/Loader';
import ProductCard from '../buyer/components/ProductCard';
import { MagnifyingGlassIcon, PhotoIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const AISearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState('text');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const { isAuthenticated } = useAuth();

  // Enhanced search with AI
  const performAISearch = async (searchQuery, filters = {}) => {
    try {
      // First, get AI recommendations based on query
      const aiResponse = await aiAPI.search({
        query: searchQuery,
        limit: 20,
        sort_by: filters.sort_by || 'relevance',
        category: filters.category,
        min_price: filters.min_price,
        max_price: filters.max_price,
        rating: filters.rating
      });

      if (aiResponse.data.success) {
        const products = aiResponse.data.results || [];
        
        // If no products found with AI, fallback to regular search
        if (products.length === 0) {
          const fallbackResponse = await productAPI.getProducts({
            search: searchQuery,
            limit: 20
          });
          if (fallbackResponse.data.success) {
            return fallbackResponse.data.products || [];
          }
        }
        
        return products;
      }
      return [];
    } catch (error) {
      console.error('AI Search error:', error);
      // Fallback to regular search
      try {
        const response = await productAPI.getProducts({
          search: searchQuery,
          limit: 20
        });
        return response.data.products || [];
      } catch (fallbackError) {
        console.error('Fallback search error:', fallbackError);
        return [];
      }
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (searchType === 'text' && !query.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    if (searchType === 'image' && !imageFile) {
      toast.error('Please select an image');
      return;
    }

    setLoading(true);
    setResults([]);
    setAiAnalysis(null);
    setSimilarProducts([]);

    try {
      if (searchType === 'text') {
        // Perform AI-powered text search
        const products = await performAISearch(query.trim());
        setResults(products);
        
        // Add to search history
        setSearchHistory(prev => [query.trim(), ...prev.slice(0, 9)]);
        
        if (products.length > 0) {
          toast.success(`Found ${products.length} products`);
        } else {
          toast.info('No products found. Try a different search term.');
        }
      } else {
        // Image search with AI analysis
        const formData = new FormData();
        formData.append('image', imageFile);
        
        const analysisResponse = await aiAPI.analyzeImage(formData);
        
        if (analysisResponse.data.success) {
          const analysisData = analysisResponse.data;
          setAiAnalysis(analysisData);
          
          // Extract product suggestions from analysis
          const suggestions = analysisData.suggestions || [];
          const detectedObjects = analysisData.objects || [];
          
          // Build search query from analysis
          let searchQueries = [];
          
          // Use suggestions first
          if (suggestions.length > 0) {
            searchQueries.push(suggestions[0]);
          }
          
          // Add detected objects
          if (detectedObjects.length > 0) {
            searchQueries.push(detectedObjects.join(' '));
          }
          
          // Add attributes if available
          if (analysisData.attributes) {
            const attrValues = Object.values(analysisData.attributes).filter(v => v);
            if (attrValues.length > 0) {
              searchQueries.push(attrValues.join(' '));
            }
          }
          
          // Perform searches with each query
          let allResults = [];
          for (const searchQuery of searchQueries) {
            if (searchQuery) {
              const products = await performAISearch(searchQuery);
              allResults = [...allResults, ...products];
            }
          }
          
          // Remove duplicates
          const uniqueResults = allResults.filter((product, index, self) => 
            index === self.findIndex(p => p.id === product.id)
          );
          
          setResults(uniqueResults);
          setSimilarProducts(uniqueResults.slice(0, 8));
          
          if (uniqueResults.length > 0) {
            toast.success(`Found ${uniqueResults.length} similar products`);
          } else {
            toast.info('No similar products found. Try a different image.');
          }
        } else {
          toast.error(analysisResponse.data.error || 'Image analysis failed');
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error(error.response?.data?.error || 'Failed to search');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a JPEG, PNG, WEBP, or GIF image');
        return;
      }
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }
      
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setAiAnalysis(null);
    setSimilarProducts([]);
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    // Auto-search after a brief delay
    setTimeout(() => {
      handleSearch(new Event('submit'));
    }, 100);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-4">
          <SparklesIcon className="w-8 h-8 text-yellow-500 mr-3" />
          <div>
            <h1 className="text-3xl font-bold">AI-Powered Search 🔍</h1>
            <p className="text-gray-600">Search products using text or images with AI intelligence</p>
          </div>
        </div>

        {/* Search Type Toggle */}
        <div className="flex rounded-lg shadow-sm border border-gray-200 mb-6">
          <button
            type="button"
            onClick={() => setSearchType('text')}
            className={`flex-1 py-3 px-4 text-center rounded-l-lg transition-colors ${
              searchType === 'text'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <MagnifyingGlassIcon className="w-5 h-5 inline mr-2" />
            Text Search
          </button>
          <button
            type="button"
            onClick={() => setSearchType('image')}
            className={`flex-1 py-3 px-4 text-center rounded-r-lg transition-colors ${
              searchType === 'image'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <PhotoIcon className="w-5 h-5 inline mr-2" />
            Image Search
          </button>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          {searchType === 'text' ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products with AI... (e.g., 'iPhone 15', 'gaming laptop', 'wireless headphones')"
                className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch(e);
                  }
                }}
              />
              <button
                type="submit"
                onClick={handleSearch}
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-center w-full">
                <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                  imagePreview ? 'border-green-500 bg-green-50' : 'border-gray-300'
                }`}>
                  {imagePreview ? (
                    <div className="relative w-full h-full">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6">
                      <PhotoIcon className="w-12 h-12 text-gray-400 mb-3" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG, JPEG, WEBP, GIF (Max 5MB)</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
              {imagePreview && (
                <button
                  type="submit"
                  onClick={handleSearch}
                  disabled={loading}
                  className="mt-4 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Analyzing...' : 'Analyze Image with AI'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search History */}
        {searchHistory.length > 0 && (
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">Recent searches:</p>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((term, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(term)}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis Results */}
        {aiAnalysis && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 mb-8 border border-purple-200">
            <h3 className="font-semibold text-purple-800 mb-3">🤖 AI Image Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiAnalysis.objects?.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600">Detected Objects:</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {aiAnalysis.objects.map((obj, i) => (
                      <span key={i} className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {aiAnalysis.colors?.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600">Colors:</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {aiAnalysis.colors.map((color, i) => (
                      <span key={i} className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs flex items-center">
                        <span className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: color }} />
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {aiAnalysis.suggestions?.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-gray-600">Suggested Search Terms:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {aiAnalysis.suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs hover:bg-blue-200 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiAnalysis.attributes && Object.keys(aiAnalysis.attributes).length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-gray-600">Detected Attributes:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(aiAnalysis.attributes).map(([key, value]) => (
                    <span key={key} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                      {key}: {value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <Loader />
            <p className="text-gray-500 mt-4">Searching with AI...</p>
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">
              Results ({results.length})
              {aiAnalysis && <span className="text-sm font-normal text-gray-500 ml-2">from image analysis</span>}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        {/* No Results */}
        {!loading && results.length === 0 && (query || imageFile) && (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500 text-lg">No products found</p>
            <p className="text-gray-400 text-sm mt-2">
              {searchType === 'text' 
                ? 'Try a different search term or be more specific' 
                : 'Try uploading a different image or use text search instead'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AISearch;