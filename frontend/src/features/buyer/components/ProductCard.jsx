// src/features/buyer/components/ProductCard.jsx
import { Link } from 'react-router-dom';
import { ShoppingBagIcon, HeartIcon, CheckBadgeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { formatPrice } from '../../../utils/helpers';

const ProductCard = ({
  product,
  onClick,
  onAddToCart,
  onBuyNow,
  onWishlistToggle,
  isWishlisted = false,
  isAdding = false,
  showAI = false,
}) => {
  if (!product) return null;

  const outOfStock =
    (product.stock_quantity !== undefined && Number(product.stock_quantity) <= 0) ||
    product.status === 'out_of_stock';

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200 flex flex-col justify-between group">
      {/* Image + Badges */}
      <div className="relative h-48 bg-slate-100 overflow-hidden">
        <Link
          to={`/products/${product.slug}`}
          onClick={(e) => {
            if (onClick) {
              e.preventDefault();
              onClick();
            }
          }}
          className="block w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {product.main_image_url ? (
            <img
              src={product.main_image_url}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-700 text-slate-200 text-sm font-semibold px-4 text-center">
              {product.name}
            </div>
          )}
        </Link>

        {/* AI / Category Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {showAI && (
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
              AI Pick
            </span>
          )}
          {product.category_name && (
            <span className="bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              {product.category_name}
            </span>
          )}
        </div>

        {/* Discount Pill */}
        {Number(product.discount_percentage) > 0 && (
          <span className="absolute top-2.5 right-2.5 bg-rose-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            -{Math.round(Number(product.discount_percentage))}%
          </span>
        )}

        {/* Wishlist Toggle */}
        {onWishlistToggle && (
          <button
            type="button"
            aria-pressed={isWishlisted}
            aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
            onClick={(e) => {
              e.stopPropagation();
              onWishlistToggle(product.id);
            }}
            className="absolute bottom-2.5 right-2.5 p-2 bg-white/90 rounded-full hover:bg-white shadow-sm transition-colors"
          >
            {isWishlisted ? (
              <HeartSolid className="w-4 h-4 text-rose-500" aria-hidden="true" />
            ) : (
              <HeartIcon className="w-4 h-4 text-slate-600" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                outOfStock
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {outOfStock ? (
                <ExclamationTriangleIcon className="w-3 h-3" aria-hidden="true" />
              ) : (
                <CheckBadgeIcon className="w-3 h-3" aria-hidden="true" />
              )}
              <span>
                {outOfStock
                  ? 'Out of Stock'
                  : product.stock_quantity !== undefined
                  ? `In Stock (${product.stock_quantity})`
                  : 'In Stock'}
              </span>
            </span>

            {Number(product.average_rating) > 0 && (
              <span className="text-xs font-medium text-amber-600">
                ★ {Number(product.average_rating).toFixed(1)} ({product.total_reviews || 0})
              </span>
            )}
          </div>

          <Link
            to={`/products/${product.slug}`}
            onClick={(e) => {
              if (onClick) {
                e.preventDefault();
                onClick();
              }
            }}
            className="block font-bold text-slate-900 line-clamp-1 hover:text-blue-600 transition-colors"
          >
            {product.name}
          </Link>

          {(product.short_description || product.final_description) && (
            <p className="text-xs text-slate-500 line-clamp-2 mt-1">
              {product.short_description || product.final_description}
            </p>
          )}
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold text-slate-900">
                {formatPrice(product.price)}
              </span>
              {product.compare_price && Number(product.compare_price) > Number(product.price) && (
                <span className="text-xs text-slate-400 line-through">
                  {formatPrice(product.compare_price)}
                </span>
              )}
            </div>
            {product.seller_name && (
              <span className="text-[11px] text-slate-500 truncate max-w-[110px]">
                by {product.seller_name}
              </span>
            )}
          </div>

          <div className={onBuyNow ? 'grid grid-cols-2 gap-2' : ''}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onAddToCart) onAddToCart(e);
              }}
              disabled={isAdding || outOfStock}
              className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                isAdding || outOfStock
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <ShoppingBagIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{isAdding ? 'Adding...' : outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
            </button>

            {onBuyNow && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBuyNow(e);
                }}
                disabled={isAdding || outOfStock}
                className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isAdding || outOfStock
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                Buy Now
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
