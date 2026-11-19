// // src/features/ai/Chat.jsx

import { useState, useRef, useEffect, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { aiAPI, productAPI, sellerMeshAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { PaperAirplaneIcon, UserIcon, ChatBubbleLeftIcon, ShoppingBagIcon, XMarkIcon, TruckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import ProductCard from '../buyer/components/ProductCard';

const Chat = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! 👋 I'm your AI shopping assistant. Below you can explore both **Seller Original Store Products** and **Cancelled Orders on Discount (Supply Chain Hub)**!",
      products: [],
      hubDeals: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [claimingDealId, setClaimingDealId] = useState(null);
  const [sessionId, setSessionId] = useState(
    () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  );
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [prodRes, dealRes] = await Promise.allSettled([
          productAPI.getProducts({ limit: 8 }),
          sellerMeshAPI.getBuyerRescueDeals(),
        ]);
        if (!active) return;
        const initProducts =
          prodRes.status === 'fulfilled'
            ? prodRes.value.data?.results || prodRes.value.data?.products || []
            : [];
        const initHubDeals =
          dealRes.status === 'fulfilled'
            ? (dealRes.value.data?.deals || []).filter((d) => d.status === 'OPEN_FOR_DEAL')
            : [];
        if (initProducts.length > 0 || initHubDeals.length > 0) {
          setMessages((prev) =>
            prev.map((m, idx) =>
              idx === 0
                ? { ...m, products: initProducts, hubDeals: initHubDeals }
                : m
            )
          );
        }
      } catch {
        // ignore initial load error
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const searchProducts = async (query) => {
    try {
      const keywords = (query || '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .split(' ')
        .filter((word) => word.length > 2)
        .slice(0, 8);

      let products = [];
      try {
        const aiResponse = await aiAPI.search({
          query: keywords.join(' '),
          limit: 12,
          sort_by: 'relevance',
        });
        if (aiResponse.data?.success && aiResponse.data.results?.length > 0) {
          products = aiResponse.data.results;
        }
      } catch {
        // ignore and fall back
      }

      if (products.length === 0) {
        const response = await productAPI.getProducts({
          search: keywords.join(' '),
          limit: 12,
        });
        const list = response.data?.results || response.data?.products || [];
        if (list.length > 0) {
          products = list;
        }
      }
      if (products.length === 0) {
        const fallbackAll = await productAPI.getProducts({ limit: 8 });
        products = fallbackAll.data?.results || fallbackAll.data?.products || [];
      }
      return products;
    } catch {
      return [];
    }
  };

  const submitQuery = async (rawText) => {
    const userMessage = String(rawText || '').trim();
    if (!userMessage || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    setShowResults(false);
    setSearchResults([]);

    try {
      let aiResponse = null;
      let products = [];
      let hubDeals = [];

      try {
        const response = await aiAPI.chat({
          message: userMessage,
          session_id: sessionId,
        });
        if (response.data?.success) {
          aiResponse = response.data;
          if (response.data.session_id) setSessionId(response.data.session_id);
          if (Array.isArray(response.data.products) && response.data.products.length > 0) {
            products = response.data.products;
          }
          if (Array.isArray(response.data.supply_chain_hub_deals)) {
            hubDeals = response.data.supply_chain_hub_deals;
          }
        }
      } catch (aiError) {
        console.error('AI chat error:', aiError);
      }

      if (products.length === 0) {
        products = await searchProducts(userMessage);
      }
      if (hubDeals.length === 0) {
        try {
          const dealRes = await sellerMeshAPI.getBuyerRescueDeals();
          hubDeals = (dealRes.data?.deals || []).filter((d) => d.status === 'OPEN_FOR_DEAL');
        } catch {
          // ignore
        }
      }

      if (products.length > 0) {
        setSearchResults(products);
        setShowResults(true);
      }

      let responseContent = aiResponse?.message || aiResponse?.response || '';
      if (!responseContent && products.length > 0) {
        responseContent = `I found ${products.length} Seller Original Store product(s) with buyer reviews below 👇`;
      } else if (!responseContent) {
        responseContent = `Showing available Seller Original Products and Supply Chain Hub Cancelled Deals.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: responseContent,
          products,
          hubDeals,
        },
      ]);

      if (products.length > 0 || hubDeals.length > 0) {
        toast.success(
          `Found ${products.length} store product(s)` +
            (hubDeals.length ? ` + ${hubDeals.length} Supply Chain Hub deal(s)` : '')
        );
      }
    } catch {
      const products = await searchProducts(userMessage);
      setSearchResults(products);
      setShowResults(products.length > 0);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: products.length
            ? 'Here are the matching store products & buyer ratings 👇'
            : 'Could not find matching products right now. Try browsing the Catalog.',
          products,
          hubDeals: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimHubDeal = async (dealId) => {
    if (!isAuthenticated) {
      toast.error('Please login as a Buyer to claim this discounted Supply Chain Hub order.');
      navigate('/login');
      return;
    }
    setClaimingDealId(dealId);
    try {
      const res = await sellerMeshAPI.actOnBuyerRescueDeal(dealId, {
        option_type: 'CLAIM_DISCOUNT_DEAL',
      });
      toast.success(res.data?.message || 'Cancelled Supply Chain Hub order claimed!');
      const updatedDeals = (res.data?.deals || []).filter((d) => d.status === 'OPEN_FOR_DEAL');
      setMessages((prev) =>
        prev.map((m) =>
          Array.isArray(m.hubDeals) ? { ...m, hubDeals: updatedDeals } : m
        )
      );
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not claim discounted deal');
    } finally {
      setClaimingDealId(null);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    submitQuery(input);
  };

  const handleSuggestionClick = (question) => {
    setInput(question);
    inputRef.current?.focus();
    submitQuery(question);
  };

  const formatMessage = (content) => {
    if (!content) return '';
    return content.split('\n').map((line, i) => (
      <Fragment key={i}>
        {line}
        {i < content.split('\n').length - 1 && <br />}
      </Fragment>
    ));
  };

  const suggestedQuestions = [
    '🚚 Check Cancelled Orders & Discounts in Supply Chain Hub',
    'Show me popular electronics',
    'Recommend a laptop for gaming',
    'Find smartphones under $500',
    'What are the new arrivals?',
    'Looking for a smart watch',
    'Wireless headphones recommendations',
  ];

  const clearResults = () => {
    setShowResults(false);
    setSearchResults([]);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
            <div className="flex items-center">
              <ChatBubbleLeftIcon className="w-8 h-8 mr-3" />
              <div>
                <h1 className="text-2xl font-bold">AI Shopping Assistant</h1>
                <p className="text-sm opacity-90">Ask me about products, get recommendations, and discover new items!</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="h-[400px] overflow-y-auto p-4 bg-gray-50">
            {messages.map((message, index) => (
              <div key={index}>
                <div
                  className={`flex items-start mb-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center mr-2 flex-shrink-0">
                      <ChatBubbleLeftIcon className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm">
                      {formatMessage(message.content)}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center ml-2 flex-shrink-0">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )}
                </div>
                
                {/* Heading 1: Seller Original Store Products (Fresh Seller Catalog) */}
                {message.products && message.products.length > 0 && (
                  <div className="ml-10 mb-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-950">
                        <ShoppingBagIcon className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                        <span>
                          🏪 Seller Original Store Products — Fresh Seller Catalog ({message.products.length})
                        </span>
                      </span>
                      <Link
                        to="/products"
                        className="text-[11px] font-bold text-indigo-700 hover:underline"
                      >
                        Browse All Store Products →
                      </Link>
                    </div>
                    <p className="text-[11px] text-indigo-900/80">
                      Original store products directly from sellers (fresh inventory &amp; store pricing):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {message.products.slice(0, 8).map((product) => {
                        const topReview = product.review_highlights?.[0];
                        return (
                          <Link
                            key={product.id}
                            to={`/products/${product.slug || product.id}`}
                            className="bg-white rounded-xl border border-indigo-100 p-2.5 hover:shadow-md hover:border-indigo-400 transition-all flex flex-col justify-between gap-1.5"
                          >
                            <div>
                              <img
                                src={product.main_image || product.main_image_url || '/placeholder.jpg'}
                                alt={product.name}
                                className="w-full h-24 object-cover rounded-lg bg-slate-100"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = '/placeholder.jpg';
                                }}
                              />
                              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 mt-1.5 truncate">
                                🏪 {product.seller_name || 'Verified Seller'}
                              </p>
                              <p className="text-xs font-bold text-slate-900 line-clamp-1">{product.name}</p>
                              <div className="flex items-center justify-between text-xs mt-0.5">
                                <span className="font-extrabold text-blue-600">${product.price}</span>
                                <span className="text-[11px] font-semibold text-amber-700">
                                  ★ {Number(product.average_rating || 0).toFixed(1)} ({product.total_reviews || 0})
                                </span>
                              </div>
                              <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                                {(product.stock_quantity ?? 0) > 0
                                  ? `In Stock (${product.stock_quantity} fresh units)`
                                  : `Status: ${product.status || 'Available'}`}
                              </p>
                              {topReview && (
                                <p className="text-[10px] text-slate-600 mt-1 line-clamp-2 bg-amber-50 rounded px-1.5 py-0.5">
                                  &ldquo;{topReview.title}&rdquo; — {topReview.user_name}
                                </p>
                              )}
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700">
                              View Original Product →
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Heading 2: Separate Supply Chain Hub Cancelled Orders on Discount */}
                {message.hubDeals && message.hubDeals.length > 0 && (
                  <div className="ml-10 mb-4 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-emerald-50 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
                        <TruckIcon className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                        <span>
                          🚚 Supply Chain Hub — Cancelled Orders Available on Discount ({message.hubDeals.length})
                        </span>
                      </span>
                      <Link
                        to="/cancelled-deals"
                        className="text-[11px] font-bold text-indigo-700 hover:underline"
                      >
                        Open Full Cancelled Deals →
                      </Link>
                    </div>
                    <p className="text-[11px] text-amber-900/90">
                      Separate from regular store listings — these cancelled parcels are held at our Supply Chain Hub
                      at a special discount:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {message.hubDeals.slice(0, 4).map((deal) => (
                        <div
                          key={deal.id}
                          className="rounded-xl bg-white border border-amber-200 p-3 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-mono font-bold text-slate-600">
                                #{deal.order_number} · 📍 {deal.origin_city} Hub
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold">
                                Cancelled · {Number(deal.ai_discount_pct || 10).toFixed(0)}% OFF
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900 mt-1">
                              {deal.seller_edited_title || deal.product_title}
                            </p>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              🏪 Seller: <strong>{deal.seller_store_name || deal.seller_username || 'Verified Seller'}</strong>
                              {(deal.original_product_slug || deal.original_product_id) && (
                                <>
                                  {' · '}
                                  <Link
                                    to={`/products/${deal.original_product_slug || deal.original_product_id}`}
                                    className="text-indigo-700 font-semibold hover:underline"
                                  >
                                    View Original Item →
                                  </Link>
                                </>
                              )}
                            </p>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-sm font-extrabold text-emerald-700">
                                ${Number(deal.ai_recommended_deal_price || 0).toFixed(2)}
                              </span>
                              <span className="text-[11px] text-slate-400 line-through">
                                ${Number(deal.original_price || 0).toFixed(2)}
                              </span>
                              <span className="text-[11px] text-slate-600">· {deal.shipping_policy}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={claimingDealId === deal.id}
                            onClick={() => handleClaimHubDeal(deal.id)}
                            className="w-full px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                          >
                            {claimingDealId === deal.id
                              ? 'Claiming...'
                              : '🛒 Claim Supply Chain Hub Discount Deal'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start items-center mb-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center mr-2">
                  <ChatBubbleLeftIcon className="w-4 h-4" />
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Questions */}
          {messages.length <= 2 && (
            <div className="p-4 bg-gray-50 border-t">
              <p className="text-sm text-gray-600 mb-2">💡 Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(question)}
                    className="text-xs bg-white border border-gray-300 rounded-full px-3 py-1 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Results Section */}
          {showResults && searchResults.length > 0 && !loading && (
            <div className="p-4 border-t bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">🛍️ Products You Might Like</h3>
                <button 
                  onClick={clearResults}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {searchResults.slice(0, 8).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="p-4 border-t bg-white">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about products, get recommendations..."
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              AI responses are generated based on our product catalog. For accurate info, check product details.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Chat;