"""URL routes for the Seller Profit-Shield & Anti-RTO Mesh."""

from django.urls import path

from .views import (
    BuyerRescueDealActionView,
    BuyerRescueDealListView,
    SellerApplyReviewFixView,
    SellerMeshApprovalDecideView,
    SellerMeshDashboardView,
    SellerMeshTriggerView,
    SellerRecoveryAdvisorChatView,
    SellerRecoveryCloseDealView,
    SellerRecoveryListView,
    SellerRecoveryNegotiateView,
    SellerRecoveryOptionView,
    SellerRecoverySimulateView,
    SellerRecoveryVerifyPhotoView,
    SellerReviewInsightsView,
)

urlpatterns = [
    path('dashboard/', SellerMeshDashboardView.as_view(), name='seller-mesh-dashboard'),
    path('trigger/', SellerMeshTriggerView.as_view(), name='seller-mesh-trigger'),
    path('approvals/<int:pk>/decide/', SellerMeshApprovalDecideView.as_view(), name='seller-mesh-decide'),
    path('recoveries/', SellerRecoveryListView.as_view(), name='seller-mesh-recoveries'),
    path('recoveries/simulate/', SellerRecoverySimulateView.as_view(), name='seller-mesh-recoveries-simulate'),
    path('recoveries/<int:pk>/negotiate/', SellerRecoveryNegotiateView.as_view(), name='seller-mesh-recoveries-negotiate'),
    path('recoveries/<int:pk>/close-deal/', SellerRecoveryCloseDealView.as_view(), name='seller-mesh-recoveries-close-deal'),
    path('recoveries/<int:pk>/advisor-chat/', SellerRecoveryAdvisorChatView.as_view(), name='seller-mesh-recoveries-advisor-chat'),
    path('recoveries/<int:pk>/verify-photo/', SellerRecoveryVerifyPhotoView.as_view(), name='seller-mesh-recoveries-verify-photo'),
    path('recoveries/<int:pk>/seller-option/', SellerRecoveryOptionView.as_view(), name='seller-mesh-recoveries-seller-option'),
    path('reviews-insights/', SellerReviewInsightsView.as_view(), name='seller-mesh-reviews-insights'),
    path('reviews-insights/apply-fix/', SellerApplyReviewFixView.as_view(), name='seller-mesh-reviews-apply-fix'),
    path('buyer-deals/', BuyerRescueDealListView.as_view(), name='seller-mesh-buyer-deals'),
    path('buyer-deals/<int:pk>/action/', BuyerRescueDealActionView.as_view(), name='seller-mesh-buyer-deals-action'),
]
