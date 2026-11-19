"""
Store Services Module
"""

import logging
from typing import Dict, List, Optional
from decimal import Decimal
from django.db import transaction
from django.contrib.auth.models import User
from django.db.models import Sum
from django.utils import timezone
from datetime import datetime

from .models import (
    Product, Category, ProductVariant, Cart, CartItem,
    Order, OrderItem, ProductReview, Wishlist, Coupon,
    ProductAnalytics, UserActivity, Notification, InventoryLog
)
from .serializers import (
    ProductListSerializer, ProductDetailSerializer,
    CartSerializer, CartItemSerializer,
    OrderListSerializer, OrderDetailSerializer,
    ReviewSerializer, WishlistSerializer,
    CouponSerializer, NotificationSerializer,
    ProductAnalyticsSerializer
)

# Import AI functions
from myproject.services import (
    search_products as ai_search,
    search_products_by_image as ai_image_search,
    get_recommendations as ai_recommendations,
    chat_with_ai as ai_chat,
    analyze_product_image as ai_analyze,
    index_products as ai_index,
    get_agent_status
)

logger = logging.getLogger(__name__)


# ============================================
# PRODUCT SERVICES
# ============================================

class ProductService:
    """Product services with AI"""
    
    @staticmethod
    def search_products(query, limit=20, **filters):
        try:
            # ✅ Ensure products are indexed before search
            ProductService.ensure_indexed()
            results = ai_search(query, limit, **filters)
            return {'success': True, 'results': results, 'count': len(results)}
        except Exception as e:
            logger.error(f"Search products error: {e}")
            return {'success': False, 'error': str(e), 'results': []}
    
    @staticmethod
    def search_by_image(image_file, limit=20):
        try:
            # ✅ Ensure products are indexed before image search
            ProductService.ensure_indexed()
            results = ai_image_search(image_file, limit)
            analysis = ai_analyze(image_file)
            return {'success': True, 'results': results, 'analysis': analysis}
        except Exception as e:
            logger.error(f"Search by image error: {e}")
            return {'success': False, 'error': str(e), 'results': []}
    
    @staticmethod
    def get_product_recommendations(product_id, limit=5):
        try:
            results = ai_recommendations(product_id, limit)
            return {'success': True, 'recommendations': results, 'count': len(results)}
        except Exception as e:
            logger.error(f"Get recommendations error: {e}")
            return {'success': False, 'error': str(e), 'recommendations': []}
    
    @staticmethod
    def analyze_image(image_file):
        try:
            return ai_analyze(image_file)
        except Exception as e:
            logger.error(f"Analyze image error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def index_products():
        try:
            return ai_index()
        except Exception as e:
            logger.error(f"Index products error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def ensure_indexed():
        """Ensure all products with images are indexed"""
        try:
            from ai_agent.vector.chroma import ChromaVectorStore
            from store.models import Product
            from ai_agent.vector.index import VectorIndex
            
            store = ChromaVectorStore()
            count = store.get_count()
            products_with_images = Product.objects.filter(main_image__isnull=False).count()
            
            if count < products_with_images:
                logger.info(f"📊 Indexing {products_with_images - count} products...")
                index = VectorIndex()
                for product in Product.objects.filter(main_image__isnull=False):
                    try:
                        index.index_product(product)
                    except Exception as e:
                        logger.error(f"Error indexing {product.name}: {e}")
                logger.info("✅ Indexing complete")
            return True
        except Exception as e:
            logger.error(f"Index check error: {e}")
            return False


# ============================================
# CART SERVICES
# ============================================

class CartService:
    """Cart services"""
    
    @staticmethod
    def get_or_create_cart(user=None, session_id=None):
        try:
            if user and user.is_authenticated:
                cart, _ = Cart.objects.get_or_create(user=user, defaults={'is_active': True})
                return cart
            elif session_id:
                cart, _ = Cart.objects.get_or_create(session_id=session_id, defaults={'is_active': True})
                return cart
            return None
        except Exception as e:
            logger.error(f"Get or create cart error: {e}")
            return None
    
    @staticmethod
    def add_item(cart, product_id, quantity=1, variant_id=None):
        try:
            if not cart:
                return {'success': False, 'error': 'Cart not found'}
            
            product = Product.objects.get(id=product_id, status='published')
            
            if variant_id:
                variant = ProductVariant.objects.get(id=variant_id, product=product)
                if variant.stock_quantity < quantity:
                    return {'success': False, 'error': f"Only {variant.stock_quantity} in stock"}
                price = variant.final_price
            else:
                if product.stock_quantity < quantity:
                    return {'success': False, 'error': f"Only {product.stock_quantity} in stock"}
                price = product.price
            
            cart_item, created = CartItem.objects.get_or_create(
                cart=cart,
                product=product,
                variant_id=variant_id,
                defaults={'quantity': quantity, 'price_at_add': price}
            )
            if not created:
                cart_item.quantity += quantity
                cart_item.save()
            
            return {'success': True, 'item': CartItemSerializer(cart_item).data}
        except Product.DoesNotExist:
            return {'success': False, 'error': 'Product not found'}
        except Exception as e:
            logger.error(f"Add item error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def remove_item(cart, item_id):
        try:
            if not cart:
                return {'success': False, 'error': 'Cart not found'}
            
            CartItem.objects.get(id=item_id, cart=cart).delete()
            return {'success': True, 'message': 'Item removed'}
        except CartItem.DoesNotExist:
            return {'success': False, 'error': 'Item not found'}
        except Exception as e:
            logger.error(f"Remove item error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def update_quantity(cart, item_id, quantity):
        try:
            if not cart:
                return {'success': False, 'error': 'Cart not found'}
            
            if quantity <= 0:
                return CartService.remove_item(cart, item_id)
            
            item = CartItem.objects.get(id=item_id, cart=cart)
            
            if item.variant:
                if item.variant.stock_quantity < quantity:
                    return {'success': False, 'error': f"Only {item.variant.stock_quantity} in stock"}
            else:
                if item.product.stock_quantity < quantity:
                    return {'success': False, 'error': f"Only {item.product.stock_quantity} in stock"}
            
            item.quantity = quantity
            item.save()
            return {'success': True, 'item': CartItemSerializer(item).data}
        except CartItem.DoesNotExist:
            return {'success': False, 'error': 'Item not found'}
        except Exception as e:
            logger.error(f"Update quantity error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_cart_summary(cart):
        try:
            if not cart:
                return {'success': False, 'error': 'Cart not found'}
            return {'success': True, 'cart': CartSerializer(cart).data}
        except Exception as e:
            logger.error(f"Get cart summary error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def clear_cart(cart):
        try:
            if not cart:
                return {'success': False, 'error': 'Cart not found'}
            cart.items.all().delete()
            return {'success': True, 'message': 'Cart cleared'}
        except Exception as e:
            logger.error(f"Clear cart error: {e}")
            return {'success': False, 'error': str(e)}


# ============================================
# ORDER SERVICES
# ============================================

class OrderService:
    """Order services"""
    
    @staticmethod
    def create_order(user, data):
        try:
            cart = Cart.objects.get(user=user, is_active=True)
            if not cart.items.exists():
                return {'success': False, 'error': 'Cart is empty'}
            
            subtotal = cart.subtotal
            tax = Decimal('0.10') * subtotal
            shipping = Decimal('5.99')
            discount = Decimal('0')
            total = subtotal + tax + shipping
            
            with transaction.atomic():
                order = Order.objects.create(
                    user=user,
                    email=data.get('email', user.email),
                    phone=data['phone'],
                    shipping_address=data['shipping_address'],
                    billing_address=data.get('billing_address', data['shipping_address']),
                    subtotal=subtotal,
                    tax=tax,
                    shipping_cost=shipping,
                    discount=discount,
                    total=total,
                    payment_method=data['payment_method'],
                    items=[],
                    customer_notes=data.get('customer_notes', '')
                )
                
                items_snapshot = []
                for cart_item in cart.items.select_related('product', 'product__seller', 'variant').all():
                    OrderItem.objects.create(
                        order=order,
                        product=cart_item.product,
                        product_name=cart_item.product.name,
                        variant_name=cart_item.variant.name if cart_item.variant else '',
                        price=cart_item.price_at_add,
                        quantity=cart_item.quantity,
                        total=cart_item.subtotal
                    )
                    items_snapshot.append({
                        'product_id': cart_item.product_id,
                        'product_name': cart_item.product.name,
                        'variant_name': cart_item.variant.name if cart_item.variant else '',
                        'seller_id': cart_item.product.seller_id,
                        'seller_name': cart_item.product.seller.store_name if cart_item.product.seller else '',
                        'price': str(cart_item.price_at_add),
                        'quantity': cart_item.quantity,
                        'total': str(cart_item.subtotal),
                    })
                    
                    if cart_item.variant:
                        cart_item.variant.stock_quantity -= cart_item.quantity
                        cart_item.variant.save()
                    else:
                        cart_item.product.stock_quantity -= cart_item.quantity
                        cart_item.product.save()

                order.items = items_snapshot
                order.save(update_fields=['items'])
                
                cart.clear()
                
                return {'success': True, 'order': OrderDetailSerializer(order).data}
        except Cart.DoesNotExist:
            return {'success': False, 'error': 'Cart not found'}
        except Exception as e:
            logger.error(f"Create order error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_user_orders(user, status=None):
        try:
            orders = Order.objects.filter(user=user)
            if status:
                orders = orders.filter(status=status)
            orders = orders.order_by('-created_at')
            return {
                'success': True, 
                'orders': OrderListSerializer(orders, many=True).data, 
                'count': orders.count()
            }
        except Exception as e:
            logger.error(f"Get user orders error: {e}")
            return {'success': False, 'error': str(e), 'orders': []}
    
    @staticmethod
    def update_order_status(order_id, status, note=None):
        try:
            order = Order.objects.get(id=order_id)
            if status == 'shipped' and not order.shipped_at:
                order.shipped_at = timezone.now()
            elif status == 'delivered':
                if not order.delivered_at:
                    order.delivered_at = timezone.now()
                if order.payment_method == 'cod' and order.payment_status != 'paid':
                    order.payment_status = 'paid'
                    order.paid_at = timezone.now()
            order.update_status(status, note)
            order.save()
            return {'success': True, 'order': OrderDetailSerializer(order).data}
        except Order.DoesNotExist:
            return {'success': False, 'error': 'Order not found'}
        except Exception as e:
            logger.error(f"Update order status error: {e}")
            return {'success': False, 'error': str(e)}


# ============================================
# REVIEW SERVICES
# ============================================

class ReviewService:
    """Review services"""
    
    @staticmethod
    def create_review(user, data):
        try:
            product = data.get('product') or Product.objects.get(id=data['product_id'])
            has_purchased = OrderItem.objects.filter(order__user=user, product=product).exists()

            review, created = ProductReview.objects.update_or_create(
                product=product,
                user=user,
                defaults={
                    'order': data.get('order'),
                    'rating': data['rating'],
                    'title': data.get('title', ''),
                    'review': data.get('review', ''),
                    'is_verified_purchase': has_purchased,
                    'is_approved': True,
                    'images': data.get('images', []),
                },
            )

            product.update_rating()
            return {
                'success': True,
                'updated': not created,
                'review': ReviewSerializer(review).data,
                'average_rating': product.average_rating,
                'total_reviews': product.total_reviews,
            }
        except Product.DoesNotExist:
            return {'success': False, 'error': 'Product not found'}
        except Exception as e:
            logger.error(f"Create review error: {e}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def get_product_reviews(product_id, limit=25):
        try:
            reviews = ProductReview.objects.filter(
                product_id=product_id,
                is_approved=True
            ).select_related('user').order_by('-created_at')[:limit]
            return {
                'success': True,
                'reviews': ReviewSerializer(reviews, many=True).data,
                'count': reviews.count(),
            }
        except Exception as e:
            logger.error(f"Get product reviews error: {e}")
            return {'success': False, 'error': str(e), 'reviews': []}


# ============================================
# WISHLIST SERVICES - FIXED
# ============================================

class WishlistService:
    """Wishlist services - FIXED"""
    
    @staticmethod
    def get_wishlist(user):
        """
        Get user's wishlist products
        Returns products directly for frontend compatibility
        """
        try:
            wishlist, created = Wishlist.objects.get_or_create(user=user)
            products = wishlist.products.filter(status='published')
            
            # Return products directly (not wrapped in 'wishlist')
            return {
                'success': True,
                'products': ProductListSerializer(products, many=True).data,
                'total_items': products.count()
            }
        except Exception as e:
            logger.error(f"Get wishlist error: {e}")
            return {'success': False, 'error': str(e), 'products': []}
    
    @staticmethod
    def add_to_wishlist(user, product_id):
        """
        Add product to user's wishlist
        """
        try:
            # Check if product exists and is published
            product = Product.objects.filter(id=product_id, status='published').first()
            if not product:
                return {
                    'success': False,
                    'error': 'Product not found or not available'
                }
            
            # Get or create wishlist
            wishlist, created = Wishlist.objects.get_or_create(user=user)
            
            # Check if already in wishlist
            if wishlist.products.filter(id=product_id).exists():
                return {
                    'success': False,
                    'error': 'Product already in wishlist'
                }
            
            # Add to wishlist
            wishlist.products.add(product)
            
            return {
                'success': True,
                'message': 'Added to wishlist',
                'product_id': product_id
            }
        except Exception as e:
            logger.error(f"Add to wishlist error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def remove_from_wishlist(user, product_id):
        """
        Remove product from user's wishlist
        """
        try:
            # Check if product exists
            product = Product.objects.filter(id=product_id).first()
            if not product:
                return {
                    'success': False,
                    'error': 'Product not found'
                }
            
            # Get wishlist
            try:
                wishlist = Wishlist.objects.get(user=user)
            except Wishlist.DoesNotExist:
                return {
                    'success': False,
                    'error': 'Wishlist not found'
                }
            
            # Check if in wishlist
            if not wishlist.products.filter(id=product_id).exists():
                return {
                    'success': False,
                    'error': 'Product not in wishlist'
                }
            
            # Remove from wishlist
            wishlist.products.remove(product)
            
            return {
                'success': True,
                'message': 'Removed from wishlist',
                'product_id': product_id
            }
        except Exception as e:
            logger.error(f"Remove from wishlist error: {e}")
            return {
                'success': False,
                'error': str(e)
            }


# ============================================
# COUPON SERVICES
# ============================================

class CouponService:
    """Coupon services"""
    
    @staticmethod
    def validate_coupon(code, subtotal):
        try:
            coupon = Coupon.objects.get(code=code, is_active=True)
            if not coupon.is_valid():
                return {'success': False, 'error': 'Coupon is invalid or expired'}
            if subtotal < coupon.minimum_order:
                return {'success': False, 'error': f'Minimum order of ${coupon.minimum_order} required'}
            discount = coupon.calculate_discount(subtotal)
            return {'success': True, 'coupon': CouponSerializer(coupon).data, 'discount': discount}
        except Coupon.DoesNotExist:
            return {'success': False, 'error': 'Coupon not found'}
        except Exception as e:
            logger.error(f"Validate coupon error: {e}")
            return {'success': False, 'error': str(e)}


# ============================================
# NOTIFICATION SERVICES
# ============================================

class NotificationService:
    """Notification services"""
    
    @staticmethod
    def get_user_notifications(user, unread_only=False):
        try:
            notifications = Notification.objects.filter(user=user)
            if unread_only:
                notifications = notifications.filter(is_read=False)
            notifications = notifications.order_by('-created_at')
            return {
                'success': True,
                'notifications': NotificationSerializer(notifications, many=True).data,
                'count': notifications.count(),
                'unread_count': Notification.objects.filter(user=user, is_read=False).count()
            }
        except Exception as e:
            logger.error(f"Get notifications error: {e}")
            return {'success': False, 'error': str(e), 'notifications': []}
    
    @staticmethod
    def mark_as_read(user, notification_ids=None, mark_all=False):
        try:
            if mark_all:
                Notification.objects.filter(user=user, is_read=False).update(is_read=True)
            elif notification_ids:
                Notification.objects.filter(user=user, id__in=notification_ids).update(is_read=True)
            return {'success': True, 'message': 'Notifications marked as read'}
        except Exception as e:
            logger.error(f"Mark as read error: {e}")
            return {'success': False, 'error': str(e)}


# ============================================
# ANALYTICS SERVICES
# ============================================

class AnalyticsService:
    """Analytics services"""
    
    @staticmethod
    def track_product_view(user, product_id, session_id):
        try:
            UserActivity.objects.create(
                user=user if user and user.is_authenticated else None,
                session_id=session_id,
                activity_type='view',
                product_id=product_id
            )
            analytics, created = ProductAnalytics.objects.get_or_create(product_id=product_id)
            analytics.views += 1
            analytics.last_viewed = datetime.now()
            analytics.save()
        except Exception as e:
            logger.warning(f"Track view error: {e}")
    
    @staticmethod
    def get_product_analytics(product_id):
        try:
            analytics = ProductAnalytics.objects.get(product_id=product_id)
            return {'success': True, 'analytics': ProductAnalyticsSerializer(analytics).data}
        except ProductAnalytics.DoesNotExist:
            return {'success': False, 'error': 'No analytics found'}
        except Exception as e:
            logger.error(f"Get product analytics error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_store_stats():
        try:
            total_products = Product.objects.filter(status='published').count()
            total_orders = Order.objects.count()
            total_users = User.objects.count()
            total_revenue = Order.objects.filter(status='delivered').aggregate(
                total=Sum('total')
            )['total'] or Decimal('0')
            
            return {
                'success': True,
                'stats': {
                    'total_products': total_products,
                    'total_orders': total_orders,
                    'total_users': total_users,
                    'total_revenue': float(total_revenue),
                    'average_order_value': float(total_revenue / total_orders) if total_orders > 0 else 0
                }
            }
        except Exception as e:
            logger.error(f"Get store stats error: {e}")
            return {'success': False, 'error': str(e)}


# ============================================
# AI CHAT SERVICE
# ============================================

class AIChatService:
    """AI Chat Service"""
    
    @staticmethod
    def chat(message, session_id=None, user=None, image=None):
        try:
            return ai_chat(message, session_id, user, image=image)
        except Exception as e:
            logger.error(f"Chat error: {e}")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_status():
        """Get AI agent status"""
        try:
            return get_agent_status()
        except Exception as e:
            logger.error(f"Get status error: {e}")
            return {'success': False, 'error': str(e)}