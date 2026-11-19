## store/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'products', views.ProductViewSet, basename='product')
router.register(r'categories', views.CategoryViewSet, basename='category')
router.register(r'sellers', views.SellerViewSet, basename='seller')

urlpatterns = [
    # Specific seller routes MUST come before DefaultRouter so sellers/<pk>/ doesn't swallow them!
    path('sellers/dashboard/', views.SellerViewSet.as_view({'get': 'dashboard'}), name='seller-dashboard'),
    path('sellers/my-stats/', views.SellerMyStatsView.as_view(), name='seller-my-stats'),
    path('sellers/create-buyer-customer/', views.SellerCreateBuyerCustomerView.as_view(), name='seller-create-buyer-customer'),
    path('sellers/my-products/', views.SellerMyProductsView.as_view(), name='seller-my-products'),
    path('sellers/my-orders/', views.SellerMyOrdersView.as_view(), name='seller-my-orders'),
    path('sellers/public/', views.PublicSellerListView.as_view(), name='public-sellers'),
    path('sellers/public/<slug:slug>/', views.PublicSellerDetailView.as_view(), name='public-seller-detail'),
    path('sellers/public/<slug:slug>/products/', views.PublicSellerProductsView.as_view(), name='public-seller-products'),

    # Router URLs
    path('', include(router.urls)),
    
    # Auth
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/google/', views.GoogleAuthView.as_view(), name='google-auth'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('auth/profile/', views.UserProfileView.as_view(), name='profile'),
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='change_password'),
    
    # Buyer
    path('buyer/profile/', views.BuyerProfileView.as_view(), name='buyer-profile'),
    
    # Seller Profile
    path('seller/profile/', views.SellerProfileView.as_view(), name='seller-profile'),
    
    # ============ CART ============
    path('cart/', views.CartView.as_view(), name='cart'),
    path('cart/add/', views.AddToCartView.as_view(), name='add-to-cart'),
    path('cart/remove/<int:item_id>/', views.RemoveFromCartView.as_view(), name='remove-from-cart'),
    path('cart/update/<int:item_id>/', views.UpdateCartItemView.as_view(), name='update-cart-item'),
    
    # ============ ORDERS ============
    path('orders/', views.OrderListView.as_view(), name='order-list'),
    path('orders/create/', views.CreateOrderView.as_view(), name='create-order'),
    path('orders/<int:pk>/', views.OrderDetailView.as_view(), name='order-detail'),
    path('orders/<int:pk>/update-status/', views.UpdateOrderStatusView.as_view(), name='update-order-status'),
    
    # ============ REVIEWS ============
    path('reviews/', views.ReviewListCreateView.as_view(), name='review-list-create'),
    path('reviews/<int:pk>/', views.ReviewDetailView.as_view(), name='review-detail'),
    path('reviews/<int:pk>/helpful/', views.MarkReviewHelpfulView.as_view(), name='mark-review-helpful'),
    
    # ============ WISHLIST ============
    path('wishlist/', views.WishlistView.as_view(), name='wishlist'),
    path('wishlist/add/', views.AddToWishlistView.as_view(), name='add-to-wishlist'),
    path('wishlist/remove/<int:product_id>/', views.RemoveFromWishlistView.as_view(), name='remove-from-wishlist'),
    
    # ============ COUPONS ============
    path('coupons/validate/', views.ValidateCouponView.as_view(), name='validate-coupon'),
    
    # ============ NOTIFICATIONS ============
    path('notifications/', views.NotificationListView.as_view(), name='notification-list'),
    path('notifications/mark-read/', views.MarkNotificationsReadView.as_view(), name='mark-notifications-read'),
    
    # ============ ANALYTICS ============
    path('analytics/store-stats/', views.StoreStatsView.as_view(), name='store-stats'),
    path('analytics/product/<int:product_id>/', views.ProductAnalyticsView.as_view(), name='product-analytics'),
    
    # ============ PUBLIC ============
    path('public/products/', views.PublicProductListView.as_view(), name='public-products'),
    path('public/products/<slug:slug>/', views.PublicProductDetailView.as_view(), name='public-product-detail'),
    path('public/categories/', views.PublicCategoryListView.as_view(), name='public-categories'),
    
    # ============ PAYMENT ============
    path('payment/create-intent/', views.CreatePaymentIntentView.as_view(), name='create-payment-intent'),
    path('payment/confirm/', views.ConfirmPaymentView.as_view(), name='confirm-payment'),
    path('payment/methods/', views.PaymentMethodsView.as_view(), name='payment-methods'),
    path('payment/webhook/', views.StripeWebhookView.as_view(), name='stripe-webhook'),
    
    # ============ SEARCH ============
    path('search/', views.ProductSearchView.as_view(), name='product-search'),
    path('search/advanced/', views.AdvancedSearchView.as_view(), name='advanced-search'),
    path('search/suggestions/', views.SearchSuggestionsView.as_view(), name='search-suggestions'),
    
    # ============ AI ============
    path('ai/search/', views.AISearchView.as_view(), name='ai-search'),
    path('ai/recommendations/<int:product_id>/', views.AIRecommendationsView.as_view(), name='ai-recommendations'),
    path('ai/chat/', views.AIChatView.as_view(), name='ai-chat'),
    path('ai/analyze-image/', views.AIImageAnalysisView.as_view(), name='ai-analyze-image'),
    path('ai/status/', views.AgentStatusView.as_view(), name='ai-status'),

    # ============ OPEN AGENTIC WEB PROTOCOL ============
    path('open-agent/invoke/', views.OpenAgentInvokeView.as_view(), name='open-agent-invoke'),
]