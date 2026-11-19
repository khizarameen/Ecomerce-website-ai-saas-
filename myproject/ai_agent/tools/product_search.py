"""
Product Search Tool - Searches across ALL products in the PostgreSQL store catalog
"""

import logging
from typing import Dict, List, Optional
from django.db.models import Case, IntegerField, Q, Value, When

from store.models import Product

try:
    from store.models import ProductVariant
except ImportError:
    ProductVariant = None
    logging.warning('ProductVariant not available')

logger = logging.getLogger(__name__)


class ProductSearchTool:
    """
    Tool for searching products across the entire store database
    (all categories, sellers, tags, descriptions, and statuses).
    """

    GENERIC_ALL_QUERIES = {
        '', 'all', 'all product', 'all products', 'product', 'products',
        'everything', 'catalog', 'store', 'items', 'list all', 'show all',
        'sab', 'sab product', 'sab products',
    }

    STOP_WORDS = {
        'show', 'me', 'find', 'search', 'for', 'looking', 'give', 'get', 'want',
        'need', 'buy', 'shop', 'recommend', 'suggest', 'similar', 'products',
        'product', 'items', 'item', 'best', 'good', 'cheap', 'under', 'below',
        'above', 'over', 'less', 'than', 'more', 'please', 'can', 'you', 'the',
        'a', 'an', 'in', 'with', 'of', 'to', 'are', 'what', 'which', 'some',
        'any', 'all', 'help', 'from', 'across', 'available', 'deliver', 'within',
        'days', 'day', 'budget', 'max', 'is', 'urgent', 'sab', 'mein', 'par',
        'cancel', 'cancelled', 'canceled', 'cancellation', 'order', 'orders',
        'discount', 'discounts', 'discounted', 'deal', 'deals', 'supply',
        'chain', 'hub', 'check', 'checking', 'seller', 'sellers', 'saller',
        'original', 'orginal', 'store', 'catalog', 'karo', 'kar', 'karein',
        'dikhao', 'batao', 'batain', 'aur', 'hai', 'hain', 'ka', 'ki', 'ke',
        'ko', 'se', 'yaar', 'bhi', 'jo', 'woh', 'alag', 'rate', 'price',
    }

    def _base_queryset(self, published_only: bool = False):
        qs = Product.objects.select_related('category', 'subcategory', 'seller').exclude(
            status='discontinued'
        )
        if published_only:
            qs = qs.filter(status='published')
        else:
            # Prioritize published & in-stock items first, then other catalog items
            qs = qs.annotate(
                status_priority=Case(
                    When(status='published', stock_quantity__gt=0, then=Value(0)),
                    When(status='published', then=Value(1)),
                    When(stock_quantity__gt=0, then=Value(2)),
                    default=Value(3),
                    output_field=IntegerField(),
                )
            )
        return qs

    def _serialize_products(self, qs) -> List[Dict]:
        from store.models import ProductReview
        from store.serializers import ProductListSerializer

        product_list = list(qs)
        data = list(ProductListSerializer(product_list, many=True).data)
        by_id = {p.id: p for p in product_list}

        reviews_by_product: Dict[int, List[Dict]] = {}
        if by_id:
            recent_reviews = (
                ProductReview.objects.filter(product_id__in=by_id.keys(), is_approved=True)
                .select_related('user')
                .order_by('-created_at')
            )
            for rev in recent_reviews:
                bucket = reviews_by_product.setdefault(rev.product_id, [])
                if len(bucket) < 2:
                    bucket.append({
                        'rating': rev.rating,
                        'title': rev.title,
                        'review': rev.review,
                        'user_name': rev.user.username if rev.user else 'Buyer',
                    })

        for item in data:
            prod = by_id.get(item.get('id'))
            if prod:
                pid = prod.id
                item['stock_quantity'] = prod.stock_quantity
                item['status'] = prod.status
                item['seller_name'] = prod.seller.store_name if prod.seller else 'Verified Seller'
                item['category_name'] = prod.category.name if prod.category else 'General'
                item['main_image_url'] = prod.main_image.url if prod.main_image else item.get('main_image_url')
                item['average_rating'] = float(prod.average_rating or 0)
                item['total_reviews'] = int(prod.total_reviews or 0)
                item['review_highlights'] = reviews_by_product.get(pid, [])
                item['seller_location'] = prod.seller.address if prod.seller and prod.seller.address else 'Global Hub'
                item['description'] = prod.final_description or ''
        return data

    def _extract_tokens(self, query: str) -> List[str]:
        import re
        cleaned = re.sub(r'\$\s*[\d,]+(?:\.\d+)?', ' ', (query or '').lower())
        cleaned = re.sub(r'[^a-z0-9\s]', ' ', cleaned)
        return [
            t for t in cleaned.split()
            if len(t) > 1 and t not in self.STOP_WORDS and not t.isdigit()
        ]

    def search(self, query: str = '', limit: int = 20, **filters) -> List[Dict]:
        """
        Search products across the entire catalog with smart token matching and filters.
        Automatically includes all active/non-discontinued products if no published matches exist.
        """
        try:
            published_only = bool(filters.get('published_only', False))
            qs = self._base_queryset(published_only=published_only)

            raw_query = (query or '').strip().lower()
            is_all_query = raw_query in self.GENERIC_ALL_QUERIES

            if raw_query and not is_all_query:
                tokens = self._extract_tokens(raw_query)
                if tokens:
                    # Try strict AND across tokens first, then broader OR across tokens
                    and_qs = qs
                    for tok in tokens:
                        tok_q = (
                            Q(name__icontains=tok) |
                            Q(description__icontains=tok) |
                            Q(short_description__icontains=tok) |
                            Q(ai_generated_description__icontains=tok) |
                            Q(category__name__icontains=tok) |
                            Q(subcategory__name__icontains=tok) |
                            Q(seller__store_name__icontains=tok) |
                            Q(sku__icontains=tok) |
                            Q(tags__name__icontains=tok) |
                            Q(reviews__title__icontains=tok) |
                            Q(reviews__review__icontains=tok)
                        )
                        and_qs = and_qs.filter(tok_q)

                    and_qs = and_qs.distinct()
                    if and_qs.exists():
                        qs = and_qs
                    else:
                        or_q = Q()
                        for tok in tokens:
                            or_q |= (
                                Q(name__icontains=tok) |
                                Q(description__icontains=tok) |
                                Q(short_description__icontains=tok) |
                                Q(category__name__icontains=tok) |
                                Q(seller__store_name__icontains=tok) |
                                Q(sku__icontains=tok) |
                                Q(tags__name__icontains=tok) |
                                Q(reviews__title__icontains=tok) |
                                Q(reviews__review__icontains=tok)
                            )
                        qs = qs.filter(or_q).distinct()

                    # Boost products whose name directly matches the primary query or tokens
                    name_q = Q(name__icontains=raw_query)
                    for tok in tokens:
                        name_q |= Q(name__icontains=tok)
                    qs = qs.annotate(
                        name_match_rank=Case(
                            When(name__icontains=raw_query, then=Value(0)),
                            When(name_q, then=Value(1)),
                            default=Value(2),
                            output_field=IntegerField(),
                        )
                    )
                else:
                    qs = qs.filter(
                        Q(name__icontains=raw_query) |
                        Q(description__icontains=raw_query) |
                        Q(category__name__icontains=raw_query) |
                        Q(seller__store_name__icontains=raw_query)
                    ).distinct().annotate(
                        name_match_rank=Case(
                            When(name__icontains=raw_query, then=Value(0)),
                            default=Value(1),
                            output_field=IntegerField(),
                        )
                    )
            else:
                qs = qs.annotate(name_match_rank=Value(0, output_field=IntegerField()))

            if filters.get('category'):
                cat = filters['category']
                if str(cat).isdigit():
                    qs = qs.filter(category_id=int(cat))
                else:
                    qs = qs.filter(category__name__icontains=str(cat))

            if filters.get('seller'):
                seller = filters['seller']
                if str(seller).isdigit():
                    qs = qs.filter(seller_id=int(seller))
                else:
                    qs = qs.filter(seller__store_name__icontains=str(seller))

            if filters.get('min_price') is not None:
                qs = qs.filter(price__gte=filters['min_price'])

            if filters.get('max_price') is not None:
                qs = qs.filter(price__lte=filters['max_price'])

            if filters.get('rating') is not None:
                qs = qs.filter(average_rating__gte=filters['rating'])

            if filters.get('in_stock'):
                qs = qs.filter(stock_quantity__gt=0)

            sort_by = filters.get('sort_by', 'relevance')
            sort_mapping = {
                'relevance': ('name_match_rank', 'status_priority', '-average_rating', '-created_at')
                if not published_only
                else ('name_match_rank', '-average_rating', '-created_at'),
                'price_low': ('price',),
                'price_high': ('-price',),
                'rating': ('-average_rating',),
                'newest': ('-created_at',),
                'popular': ('-total_reviews',),
            }
            order_fields = sort_mapping.get(sort_by, ('name_match_rank', '-created_at'))
            qs = qs.order_by(*order_fields)[:limit]

            return self._serialize_products(qs)

        except Exception as e:
            logger.error(f'Product search error: {e}')
            return []

    def get_all_products(self, limit: int = 50) -> List[Dict]:
        """Return all non-discontinued products across the entire store."""
        try:
            qs = self._base_queryset(published_only=False).order_by('status_priority', '-created_at')[:limit]
            return self._serialize_products(qs)
        except Exception as e:
            logger.error(f'Get all products error: {e}')
            return []

    def get_recommendations(self, product_id: int, limit: int = 5) -> List[Dict]:
        """Get product recommendations across the store based on a product."""
        try:
            product = Product.objects.select_related('category').get(id=product_id)
            recommendations = (
                self._base_queryset(published_only=False)
                .filter(category=product.category)
                .exclude(id=product_id)
                .order_by('status_priority', '-average_rating')[:limit]
            )
            if not recommendations:
                recommendations = (
                    self._base_queryset(published_only=False)
                    .exclude(id=product_id)
                    .order_by('status_priority', '-created_at')[:limit]
                )
            return self._serialize_products(recommendations)

        except Product.DoesNotExist:
            logger.error(f'Product {product_id} not found')
            return []
        except Exception as e:
            logger.error(f'Recommendation error: {e}')
            return []

    def get_popular_products(self, limit: int = 10) -> List[Dict]:
        """Get popular products across the store."""
        try:
            products = self._base_queryset(published_only=False).order_by(
                'status_priority', '-total_reviews', '-created_at'
            )[:limit]
            return self._serialize_products(products)
        except Exception as e:
            logger.error(f'Popular products error: {e}')
            return []

    def get_featured_products(self, limit: int = 10) -> List[Dict]:
        """Get featured products across the store."""
        try:
            products = self._base_queryset(published_only=False).filter(
                is_featured=True
            ).order_by('status_priority', '-created_at')[:limit]
            if not products:
                return self.get_popular_products(limit=limit)
            return self._serialize_products(products)
        except Exception as e:
            logger.error(f'Featured products error: {e}')
            return []

    def get_products_by_variant(self, variant_id: int) -> Optional[Dict]:
        """Get product by variant ID."""
        try:
            if ProductVariant is None:
                logger.error('ProductVariant model not available')
                return None

            variant = ProductVariant.objects.get(id=variant_id)
            product = variant.product

            from store.serializers import ProductDetailSerializer
            return ProductDetailSerializer(product).data

        except Exception as e:
            logger.error(f'Get product by variant error: {e}')
            return None
