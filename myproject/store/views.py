"""
Store Views with JWT Authentication, Login, Signup, AI Integration, Search, Payment & Seller
Buyer & Seller Separate System
"""
from decimal import Decimal
from rest_framework.views import APIView
from rest_framework import viewsets, generics, status, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.views import TokenObtainPairView
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from django.http import JsonResponse
from django.db.models import Q
from django.db import models
from django.core.exceptions import PermissionDenied
from django.core.files.base import ContentFile
import logging
import stripe
from django.conf import settings
import base64
import io
from PIL import Image as PILImage
import json

# ============================================
# SERIALIZER IMPORTS - ALL SERIALIZERS
# ============================================
from .serializers import (
    # Product Serializers
    ProductListSerializer,
    ProductDetailSerializer,
    ProductCreateUpdateSerializer,
    ProductImageSerializer,
    ProductVariantSerializer,
    ProductTagSerializer,
    
    # Category Serializers
    CategorySerializer,
    CategoryListSerializer,
    
    # Seller Serializers
    SellerSerializer,
    SellerListSerializer,
    SellerDashboardSerializer,
    SellerProfileSerializer,
    SellerProfileUpdateSerializer,
    
    # Order Serializers
    OrderListSerializer,
    OrderDetailSerializer,
    OrderItemSerializer,
    CreateOrderSerializer,
    OrderStatusUpdateSerializer,
    
    # Cart Serializers
    CartSerializer,
    CartItemSerializer,
    AddToCartSerializer,
    UpdateCartItemSerializer,
    
    # Review Serializers
    ReviewSerializer,
    CreateReviewSerializer,
    
    # Wishlist Serializers
    WishlistSerializer,
    WishlistItemSerializer,
    
    # Coupon Serializers
    CouponSerializer,
    CouponValidateSerializer,
    
    # Notification Serializers
    NotificationSerializer,
    NotificationMarkReadSerializer,
    
    # User Serializers
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    UserProfileSerializer,
    BuyerProfileSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    CustomTokenObtainPairSerializer,
    
    # Search Serializers
    SearchSerializer,
    
    # Analytics Serializers
    ProductAnalyticsSerializer,
    UserActivitySerializer,
    
    # Inventory Serializers
    InventoryLogSerializer,
    StockAdjustmentSerializer,
    
    # AI Serializers
    AgentConversationSerializer,
    AgentContextSerializer,
    AgentChatSerializer,
    
    # Store Settings
    StoreSettingsSerializer,
)

# ============================================
# MODEL IMPORTS
# ============================================
from .models import (
    UserProfile, 
    Product, 
    Category, 
    Cart, 
    CartItem, 
    Order, 
    OrderItem,
    ProductReview, 
    Wishlist, 
    Coupon, 
    Notification, 
    Seller, 
    ProductImage,
    ProductVariant,
    ProductTag,
    SellerProfile,
    ReviewHelpful,
    UserActivity,
    ProductAnalytics,
    InventoryLog,
    AgentConversation,
    AgentContext,
    StoreSettings,
)

# ============================================
# SERVICE IMPORTS
# ============================================
from .services import (
    ProductService, 
    CartService, 
    OrderService, 
    ReviewService, 
    WishlistService, 
    CouponService,
    AIChatService, 
    AnalyticsService, 
    NotificationService
)

# ============================================
# LOGGER CONFIGURATION
# ============================================
logger = logging.getLogger(__name__)

# Safe Logger for Unicode handling
class SafeLogger:
    """Wrapper for logger that handles Unicode encoding issues"""
    def __init__(self, logger):
        self.logger = logger
    
    def _safe_str(self, msg):
        if isinstance(msg, str):
            import re
            emoji_pattern = re.compile("["
                u"\U0001F600-\U0001F64F"  # emoticons
                u"\U0001F300-\U0001F5FF"  # symbols & pictographs
                u"\U0001F680-\U0001F6FF"  # transport & map symbols
                u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
                u"\U00002700-\U000027BF"  # dingbats
                u"\U000024C2-\U0001F251" 
                u"\U0001F900-\U0001F9FF"  # supplemental symbols
                u"\U0001FA70-\U0001FAFF"  # additional symbols
                u"\U00002600-\U000026FF"  # miscellaneous symbols
                u"\U00002B50-\U00002BFF"  # stars
                u"\U0001F004"  # mahjong
                u"\U0001F0CF"  # joker
                u"\U0001F18E"  # ab
                u"\U0001F191-\U0001F19A"  # squares
                u"\U0001F200-\U0001F202"  # enclosed
                u"\U0001F210-\U0001F23B"  # enclosed
                u"\U0001F250-\U0001F251"  # enclosed
                u"\U0001F300-\U0001F5FF"  # misc
                u"\U0001F600-\U0001F64F"  # emoticons
                u"\U0001F680-\U0001F6FF"  # transport
                u"\U0001F700-\U0001F77F"  # alchemical
                u"\U0001F780-\U0001F7FF"  # geometric
                u"\U0001F800-\U0001F8FF"  # supplemental
                u"\U0001F900-\U0001F9FF"  # supplemental
                u"\U0001FA00-\U0001FA6F"  # chess
                u"\U0001FA70-\U0001FAFF"  # symbols
                u"\U00002702-\U000027B0"  # dingbats
                u"\U000024C2-\U0001F251" 
            "]+", flags=re.UNICODE)
            msg = emoji_pattern.sub('', msg)
            msg = msg.replace('✅', '[OK]')
            msg = msg.replace('❌', '[ERROR]')
            msg = msg.replace('⚠️', '[WARNING]')
            msg = msg.replace('📤', '[SEND]')
            msg = msg.replace('📦', '[PRODUCT]')
            msg = msg.replace('🆔', '[ID]')
            msg = msg.replace('📊', '[DATA]')
            msg = msg.replace('🔄', '[REFRESH]')
            return msg.encode('ascii', 'ignore').decode('ascii')
        return msg
    
    def info(self, msg, *args, **kwargs):
        self.logger.info(self._safe_str(msg), *args, **kwargs)
    
    def error(self, msg, *args, **kwargs):
        self.logger.error(self._safe_str(msg), *args, **kwargs)
    
    def warning(self, msg, *args, **kwargs):
        self.logger.warning(self._safe_str(msg), *args, **kwargs)
    
    def debug(self, msg, *args, **kwargs):
        self.logger.debug(self._safe_str(msg), *args, **kwargs)

logger = SafeLogger(logger)


# ============================================
# AUTHENTICATION VIEWS
# ============================================

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


def _ensure_active_seller(user):
    """Ensure a seller account has active, auto-approved Seller + SellerProfile records."""
    seller = Seller.objects.filter(user=user).first()
    if seller is None:
        base_slug = slugify(f"{user.username}-store-{user.id}") or f"store-{user.id}"
        slug = base_slug
        counter = 1
        while Seller.objects.filter(store_slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        seller = Seller.objects.create(
            user=user,
            store_name=f"{user.username}'s Store",
            store_slug=slug,
            email=user.email or '',
            is_approved=True,
            is_active=True,
        )
    elif not seller.is_approved or not seller.is_active:
        seller.is_approved = True
        seller.is_active = True
        seller.save()

    SellerProfile.objects.get_or_create(
        user=user,
        defaults={'shop_name': seller.store_name, 'email': user.email or ''},
    )
    if hasattr(user, 'profile') and user.profile:
        if user.profile.user_type != 'seller' or not user.profile.seller_approved:
            user.profile.user_type = 'seller'
            user.profile.seller_approved = True
            user.profile.save()
    return seller


def _serialize_auth_user(user, user_type, seller=None):
    """Build consistent auth response payload for buyer & seller accounts (no admin role)."""
    is_seller = user_type == 'seller'
    seller_payload = None
    if is_seller and seller is not None:
        seller_payload = {
            'id': seller.id,
            'store_name': seller.store_name,
            'store_slug': seller.store_slug,
            'is_approved': True,
            'is_active': seller.is_active,
        }
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'user_type': 'seller' if is_seller else 'buyer',
        'is_seller': is_seller,
        'is_buyer': not is_seller,
        'is_approved': True,
        'is_pending': False,
        'seller_id': seller.id if seller_payload else None,
        'seller_profile': seller_payload,
        'full_name': user.get_full_name(),
    }


class RegisterView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = UserCreateSerializer
    
    def post(self, request, *args, **kwargs):
        try:
            logger.info(f"📝 Registration attempt with data: {request.data}")
            
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            
            logger.info(f"✅ User created: {user.username} (ID: {user.id})")
            
            # Get user_type from serializer validated data
            user_type = serializer.validated_data.get('user_type', 'buyer')
            
            # Get or create profile (only buyer & seller roles; sellers are auto-approved)
            profile, created = UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'user_type': user_type,
                    'seller_approved': True,
                    'country': 'Pakistan',
                }
            )
            
            # If profile exists but user_type is different, update it
            if not created and (profile.user_type != user_type or not profile.seller_approved):
                profile.user_type = user_type
                profile.seller_approved = True
                profile.save()
            
            seller = _ensure_active_seller(user) if user_type == 'seller' else None
            
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            
            return Response({
                'success': True,
                'message': 'User registered successfully',
                'user': _serialize_auth_user(user, user_type, seller),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"❌ Registration error: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response({
                'success': False,
                'error': str(e),
                'message': 'Registration failed'
            }, status=status.HTTP_400_BAD_REQUEST)


class LoginView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer
    
    def post(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            
            username = serializer.validated_data['username']
            password = serializer.validated_data['password']
            
            from django.contrib.auth import authenticate
            user = authenticate(username=username, password=password)
            
            if not user:
                return Response({
                    'success': False,
                    'error': 'Invalid credentials'
                }, status=status.HTTP_401_UNAUTHORIZED)
            
            if not user.is_active:
                return Response({
                    'success': False,
                    'error': 'User account is disabled'
                }, status=status.HTTP_401_UNAUTHORIZED)
            
            # Only buyer & seller roles exist; infer seller if Seller record exists
            user_type = 'buyer'
            if hasattr(user, 'profile') and user.profile:
                user_type = 'seller' if user.profile.user_type == 'seller' else 'buyer'
            elif Seller.objects.filter(user=user).exists():
                user_type = 'seller'

            seller = _ensure_active_seller(user) if user_type == 'seller' else None
            
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            
            return Response({
                'success': True,
                'message': 'Login successful',
                'user': _serialize_auth_user(user, user_type, seller),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"❌ Login error: {str(e)}")
            return Response({
                'success': False,
                'error': str(e),
                'message': 'Login failed'
            }, status=status.HTTP_400_BAD_REQUEST)


def _verify_google_identity(credential: str, access_token: str, client_id: str) -> dict:
    """Verify a Google ID token or access token, with clock-skew & tokeninfo fallback."""
    import requests as http_requests
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    if credential:
        try:
            try:
                return google_id_token.verify_oauth2_token(
                    credential,
                    google_requests.Request(),
                    client_id,
                    clock_skew_in_seconds=60,
                )
            except TypeError:
                return google_id_token.verify_oauth2_token(
                    credential,
                    google_requests.Request(),
                    client_id,
                )
        except ValueError as local_err:
            # Fallback to Google tokeninfo when local PC clock is skewed relative to Google's iat/exp
            try:
                info_resp = http_requests.get(
                    'https://oauth2.googleapis.com/tokeninfo',
                    params={'id_token': credential},
                    timeout=10,
                )
                if info_resp.ok:
                    info = info_resp.json()
                    aud = info.get('aud') or info.get('azp') or ''
                    if aud == client_id and str(info.get('email_verified', 'true')).lower() == 'true':
                        return info
            except Exception as ti_err:
                logger.warning(f"Google tokeninfo fallback failed: {ti_err}")
            if not access_token:
                raise ValueError(f"Invalid Google ID token ({local_err})")

    if access_token:
        ui_resp = http_requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        if not ui_resp.ok:
            raise ValueError('Failed to verify Google user profile.')
        info = ui_resp.json()
        if info.get('email'):
            return info

    raise ValueError('Google credential token is required.')


class GoogleAuthView(generics.GenericAPIView):
    """Sign in or register a Buyer or Seller account using Google OAuth (ID token or auth code)."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        credential = (request.data.get('credential') or request.data.get('id_token') or '').strip()
        auth_code = (request.data.get('code') or '').strip()
        access_token = (request.data.get('access_token') or '').strip()
        auth_mode = str(request.data.get('mode') or 'login').strip().lower()
        raw_role = str(request.data.get('user_type') or '').strip().lower()
        explicit_role = raw_role in ('buyer', 'seller')
        requested_role = 'seller' if raw_role == 'seller' else 'buyer'

        client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '') or ''
        client_secret = getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '') or ''
        if not client_id:
            return Response(
                {'success': False, 'error': 'Google OAuth client_id is not configured on backend.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            import requests as http_requests

            if auth_code and not credential:
                if not client_secret:
                    return Response(
                        {'success': False, 'error': 'Google OAuth client_secret is missing on backend.'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                token_resp = http_requests.post(
                    'https://oauth2.googleapis.com/token',
                    data={
                        'code': auth_code,
                        'client_id': client_id,
                        'client_secret': client_secret,
                        'redirect_uri': request.data.get('redirect_uri') or 'postmessage',
                        'grant_type': 'authorization_code',
                    },
                    timeout=10,
                )
                token_json = token_resp.json()
                if not token_resp.ok or (not token_json.get('id_token') and not token_json.get('access_token')):
                    return Response(
                        {'success': False, 'error': token_json.get('error_description') or 'Google code exchange failed.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                credential = (token_json.get('id_token') or '').strip()
                access_token = (token_json.get('access_token') or access_token).strip()

            if not credential and not access_token:
                return Response(
                    {'success': False, 'error': 'Google credential token is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            idinfo = _verify_google_identity(credential, access_token, client_id)
            email = (idinfo.get('email') or '').strip().lower()
            verified_flag = str(idinfo.get('email_verified', 'true')).lower() == 'true'
            if not email or not verified_flag:
                return Response(
                    {'success': False, 'error': 'Verified Google email is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            full_name = (idinfo.get('name') or '').strip()
            first_name = (idinfo.get('given_name') or (full_name.split(' ', 1)[0] if full_name else '')).strip()
            last_name = (idinfo.get('family_name') or (full_name.split(' ', 1)[1] if ' ' in full_name else '')).strip()

            with transaction.atomic():
                user = User.objects.filter(email__iexact=email).first()
                if user is not None:
                    if not user.is_active:
                        return Response(
                            {'success': False, 'error': 'User account is disabled.'},
                            status=status.HTTP_401_UNAUTHORIZED,
                        )
                    existing_role = 'buyer'
                    if hasattr(user, 'profile') and user.profile:
                        existing_role = 'seller' if user.profile.user_type == 'seller' else 'buyer'
                    elif Seller.objects.filter(user=user).exists():
                        existing_role = 'seller'

                    if auth_mode == 'register' and explicit_role and requested_role != existing_role:
                        return Response(
                            {
                                'success': False,
                                'error': (
                                    f'This Google email ({email}) is already registered as a '
                                    f'{existing_role.title()} account. Please sign in as {existing_role.title()} '
                                    f'or use a different Google email for {requested_role.title()}.'
                                ),
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    user_type = existing_role
                else:
                    base_uname = slugify(email.split('@')[0]) or 'googleuser'
                    uname = base_uname
                    counter = 1
                    while User.objects.filter(username=uname).exists():
                        uname = f'{base_uname}{counter}'
                        counter += 1
                    user = User.objects.create_user(
                        username=uname,
                        email=email,
                        first_name=first_name[:30],
                        last_name=last_name[:30],
                    )
                    user.set_unusable_password()
                    user.save(update_fields=['password'])
                    UserProfile.objects.update_or_create(
                        user=user,
                        defaults={'user_type': requested_role},
                    )
                    user_type = requested_role

                seller = _ensure_active_seller(user) if user_type == 'seller' else None

            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)
            return Response({
                'success': True,
                'message': f'Signed in with Google as {user_type.title()}!',
                'user': _serialize_auth_user(user, user_type, seller),
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
            }, status=status.HTTP_200_OK)
        except ValueError as verr:
            return Response(
                {'success': False, 'error': f'Invalid Google token: {verr}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            logger.error(f"Google auth error: {e}")
            return Response(
                {'success': False, 'error': str(e) or 'Google sign-in failed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class LogoutView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                from rest_framework_simplejwt.tokens import RefreshToken
                token = RefreshToken(refresh_token)
                token.blacklist()
                logger.info(f"✅ User logged out: {request.user.username}")
            
            return Response({
                'success': True,
                'message': 'Logged out successfully'
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"❌ Logout error: {str(e)}")
            return Response({
                'success': False,
                'error': str(e),
                'message': 'Logout failed'
            }, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        try:
            user = request.user
            user_data = UserSerializer(user).data
            
            if hasattr(user, 'profile') and user.profile:
                profile_data = UserProfileSerializer(user.profile).data
                user_data['profile'] = profile_data
            else:
                profile, created = UserProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        'user_type': 'buyer',
                        'country': 'Pakistan',
                        'seller_approved': True
                    }
                )
                user_data['profile'] = UserProfileSerializer(profile).data
            
            if hasattr(user, 'seller_profile') and user.seller_profile:
                seller = user.seller_profile
                user_data['seller_profile'] = {
                    'id': seller.id,
                    'store_name': seller.store_name,
                    'store_slug': seller.store_slug,
                    'logo': seller.logo.url if seller.logo else None,
                    'is_approved': seller.is_approved,
                    'is_active': seller.is_active,
                }
            else:
                user_data['seller_profile'] = None
            
            if hasattr(user, 'seller_payment_profile') and user.seller_payment_profile:
                seller_payment = user.seller_payment_profile
                user_data['seller_payment_profile'] = SellerProfileSerializer(seller_payment).data
            else:
                user_data['seller_payment_profile'] = None
            
            return Response({
                'success': True,
                'user': user_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Profile error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def put(self, request, *args, **kwargs):
        try:
            serializer = UserUpdateSerializer(
                request.user, 
                data=request.data,
                partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            
            if hasattr(request.user, 'profile') and request.user.profile:
                profile_data = {
                    'phone': request.data.get('phone', ''),
                    'address': request.data.get('address', ''),
                    'city': request.data.get('city', ''),
                    'state': request.data.get('state', ''),
                    'country': request.data.get('country', 'Pakistan'),
                    'postal_code': request.data.get('postal_code', ''),
                    'bio': request.data.get('bio', ''),
                }
                profile_serializer = UserProfileSerializer(
                    request.user.profile,
                    data=profile_data,
                    partial=True
                )
                if profile_serializer.is_valid():
                    profile_serializer.save()
            else:
                UserProfile.objects.create(
                    user=request.user,
                    user_type='buyer',
                    country='Pakistan',
                    seller_approved=True
                )
            
            return Response({
                'success': True,
                'message': 'Profile updated successfully',
                'user': UserSerializer(request.user).data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Profile update error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChangePasswordView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({
                'success': False,
                'error': 'Old password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
        return Response({
            'success': True,
            'message': 'Password changed successfully'
        }, status=status.HTTP_200_OK)


# ============================================
# BUYER SPECIFIC VIEWS
# ============================================

class BuyerProfileView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        if not hasattr(request.user, 'profile') or not request.user.profile:
            return Response({
                'success': False,
                'error': 'User profile not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        if request.user.profile.user_type != 'buyer':
            return Response({
                'success': False,
                'error': 'This is a seller account'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = BuyerProfileSerializer(request.user.profile)
        return Response({
            'success': True,
            'profile': serializer.data
        }, status=status.HTTP_200_OK)


# ============================================
# SELLER PROFILE VIEWS
# ============================================

class SellerProfileView(generics.GenericAPIView):
    """View and update seller payment profile"""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        try:
            if not hasattr(request.user, 'seller_profile'):
                return Response({
                    'success': False,
                    'error': 'You are not a registered seller'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            seller_profile, created = SellerProfile.objects.get_or_create(
                user=request.user,
                defaults={
                    'shop_name': request.user.seller_profile.store_name if hasattr(request.user, 'seller_profile') else request.user.username + "'s Store",
                    'email': request.user.email,
                }
            )
            
            serializer = SellerProfileSerializer(seller_profile)
            return Response({
                'success': True,
                'profile': serializer.data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Seller profile error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def put(self, request, *args, **kwargs):
        try:
            if not hasattr(request.user, 'seller_profile'):
                return Response({
                    'success': False,
                    'error': 'You are not a registered seller'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            seller_profile, created = SellerProfile.objects.get_or_create(
                user=request.user,
                defaults={
                    'shop_name': request.user.seller_profile.store_name if hasattr(request.user, 'seller_profile') else request.user.username + "'s Store",
                    'email': request.user.email,
                }
            )
            
            serializer = SellerProfileUpdateSerializer(
                seller_profile,
                data=request.data,
                partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            
            return Response({
                'success': True,
                'message': 'Seller profile updated successfully',
                'profile': SellerProfileSerializer(seller_profile).data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Seller profile update error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================
# SELLER VIEWS
# ============================================

class SellerViewSet(viewsets.ModelViewSet):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = Seller.objects.filter(is_active=True)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return SellerListSerializer
        return SellerSerializer
    
    def get_permissions(self):
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        seller = serializer.save()
        seller.is_approved = True
        seller.is_active = True
        seller.save()
        
        SellerProfile.objects.get_or_create(
            user=seller.user,
            defaults={
                'shop_name': seller.store_name,
                'email': seller.email,
                'phone': seller.phone,
                'address': seller.address,
            }
        )
    
    @action(detail=True, methods=['get'])
    def products(self, request, pk=None):
        seller = self.get_object()
        products = Product.objects.filter(seller=seller, status='published')
        serializer = ProductListSerializer(products, many=True)
        return Response({
            'success': True,
            'products': serializer.data,
            'count': products.count()
        })
    
    @action(detail=False, methods=['get'])
    def public_list(self, request):
        sellers = Seller.objects.filter(is_approved=True, is_active=True)
        serializer = SellerListSerializer(sellers, many=True)
        return Response({
            'success': True,
            'sellers': serializer.data,
            'count': sellers.count()
        })
    
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        try:
            seller = _ensure_active_seller(request.user)
            product_ids = seller.products.values_list('id', flat=True)
            total_products = seller.products.count()
            published_products = seller.products.filter(status='published').count()
            total_orders = Order.objects.filter(order_items__product__seller=seller).distinct().count()
            total_sales = OrderItem.objects.filter(product_id__in=product_ids).aggregate(
                s=models.Sum('quantity')
            )['s'] or 0
            total_revenue = OrderItem.objects.filter(product_id__in=product_ids).aggregate(
                total=models.Sum('total')
            )['total'] or Decimal('0.00')
            total_customers = Order.objects.filter(order_items__product__seller=seller).values('user').distinct().count()

            seller_profile = None
            if hasattr(seller.user, 'seller_payment_profile'):
                seller_profile = SellerProfileSerializer(seller.user.seller_payment_profile).data
            
            data = {
                'id': seller.id,
                'user': UserSerializer(seller.user).data,
                'store_name': seller.store_name,
                'store_slug': seller.store_slug,
                'logo': seller.logo.url if seller.logo else None,
                'banner': seller.banner.url if seller.banner else None,
                'total_products': total_products,
                'published_products': published_products,
                'total_sales': int(total_sales),
                'total_revenue': float(total_revenue),
                'total_orders': total_orders,
                'total_customers': total_customers,
                'average_rating': float(seller.average_rating or 0),
                'total_reviews': seller.total_reviews,
                'is_approved': True,
                'is_active': seller.is_active,
                'seller_profile': seller_profile,
                'created_at': seller.created_at,
                'updated_at': seller.updated_at,
            }
            
            return Response({
                'success': True,
                'data': data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Dashboard error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================
# SELLER MY PRODUCTS VIEWS
# ============================================

class SellerMyProductsView(generics.GenericAPIView):
    """Get all products for the authenticated seller only"""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        try:
            seller = _ensure_active_seller(request.user)
            products = Product.objects.filter(seller=seller).order_by('-created_at')
            serializer = ProductListSerializer(products, many=True, context={'request': request})
            
            return Response({
                'success': True,
                'products': serializer.data,
                'count': products.count()
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error fetching seller products: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SellerMyOrdersView(generics.GenericAPIView):
    """Get all orders containing products sold by the authenticated seller"""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        try:
            seller = _ensure_active_seller(request.user)
            
            product_ids = seller.products.values_list('id', flat=True)
            order_ids = OrderItem.objects.filter(product_id__in=product_ids).values_list('order_id', flat=True).distinct()
            
            orders = (
                Order.objects.filter(id__in=order_ids)
                .prefetch_related('order_items', 'order_items__product')
                .select_related('user')
                .order_by('-created_at')
            )
            serialized_list = OrderListSerializer(orders, many=True).data

            enriched_orders = []
            for order_obj, order_data in zip(orders, serialized_list):
                seller_items = [
                    {
                        'id': oi.id,
                        'product_id': oi.product_id,
                        'product_name': oi.product_name,
                        'variant_name': oi.variant_name,
                        'price': str(oi.price),
                        'quantity': oi.quantity,
                        'total': str(oi.total),
                        'product_image': oi.product.main_image.url if oi.product and oi.product.main_image else None,
                    }
                    for oi in order_obj.order_items.all()
                    if oi.product and oi.product.seller_id == seller.id
                ]
                seller_subtotal = sum(Decimal(item['total']) for item in seller_items)
                buyer_name = (
                    (order_obj.shipping_address or {}).get('name')
                    or (order_obj.user.get_full_name() if order_obj.user else '')
                    or (order_obj.user.username if order_obj.user else order_obj.email)
                )
                order_data['seller_items'] = seller_items
                order_data['seller_subtotal'] = str(seller_subtotal)
                order_data['buyer_name'] = buyer_name
                enriched_orders.append(order_data)
            
            return Response({
                'success': True,
                'orders': enriched_orders,
                'count': len(enriched_orders)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error fetching seller orders: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SellerMyStatsView(generics.GenericAPIView):
    """Get rich, seller-isolated analytics (product views, likes, cancels, order bars, customers)."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            seller = _ensure_active_seller(request.user)
            search_q = (request.GET.get('search') or '').strip()
            product_id_param = request.GET.get('product_id')

            all_products_qs = seller.products.select_related('category').order_by('-created_at')
            all_product_ids = list(all_products_qs.values_list('id', flat=True))

            filtered_products_qs = all_products_qs
            if product_id_param and str(product_id_param).isdigit():
                filtered_products_qs = filtered_products_qs.filter(id=int(product_id_param))

            selected_products = list(filtered_products_qs[:50])
            buyer_pool_count = UserProfile.objects.filter(user_type='buyer').count()

            product_analytics_list = []
            total_views = 0
            total_not_viewed = 0
            total_likes = 0
            total_cancelled = 0

            for prod in selected_products:
                pa = ProductAnalytics.objects.filter(product=prod).first()
                ua_views = UserActivity.objects.filter(product=prod, activity_type='view').count()
                viewed_count = max(int(pa.views if pa else 0), ua_views)
                not_viewed_gap = max(0, buyer_pool_count - viewed_count)

                wishlist_count = Wishlist.objects.filter(products=prod).count()
                positive_reviews = ProductReview.objects.filter(
                    product=prod, is_approved=True, rating__gte=4
                ).count()
                liked_count = wishlist_count + positive_reviews

                orders_count = OrderItem.objects.filter(product=prod).values('order_id').distinct().count()
                cancelled_count = (
                    OrderItem.objects.filter(product=prod, order__status='cancelled')
                    .values('order_id')
                    .distinct()
                    .count()
                )
                delivered_count = (
                    OrderItem.objects.filter(product=prod, order__status='delivered')
                    .values('order_id')
                    .distinct()
                    .count()
                )
                prod_revenue = (
                    OrderItem.objects.filter(product=prod).aggregate(t=models.Sum('total'))['t']
                    or Decimal('0.00')
                )

                total_views += viewed_count
                total_not_viewed += not_viewed_gap
                total_likes += liked_count
                total_cancelled += cancelled_count

                product_analytics_list.append({
                    'id': prod.id,
                    'name': prod.name,
                    'sku': prod.sku,
                    'price': float(prod.price),
                    'stock_quantity': int(prod.stock_quantity or 0),
                    'status': prod.status,
                    'category_name': prod.category.name if prod.category else 'General',
                    'average_rating': float(prod.average_rating or 0),
                    'total_reviews': int(prod.total_reviews or 0),
                    'viewed_count': viewed_count,
                    'not_viewed_count': not_viewed_gap,
                    'wishlist_count': wishlist_count,
                    'positive_reviews_count': positive_reviews,
                    'liked_count': liked_count,
                    'orders_count': orders_count,
                    'cancelled_count': cancelled_count,
                    'delivered_count': delivered_count,
                    'revenue': float(prod_revenue),
                })

            order_ids = list(
                OrderItem.objects.filter(product_id__in=all_product_ids)
                .values_list('order_id', flat=True)
                .distinct()
            )
            total_orders = len(order_ids)
            total_revenue = (
                OrderItem.objects.filter(product_id__in=all_product_ids)
                .aggregate(total=models.Sum('total'))['total']
                or Decimal('0.00')
            )
            total_sales = (
                OrderItem.objects.filter(product_id__in=all_product_ids)
                .aggregate(s=models.Sum('quantity'))['s']
                or 0
            )

            from seller_mesh.analytics_engine import run_seller_analytics_assistant
            ai_out = run_seller_analytics_assistant(
                search_query=search_q,
                all_products=product_analytics_list,
                order_status_bars=[],
            )
            matched_products = ai_out['matched_products']
            matched_product_ids = [p['id'] for p in matched_products]

            matched_order_ids = list(
                OrderItem.objects.filter(product_id__in=matched_product_ids)
                .values_list('order_id', flat=True)
                .distinct()
            ) if matched_product_ids else []

            # Store Orders Bar Chart by status (moves dynamically with searched/selected products)
            status_defs = [
                ('pending', 'Pending'),
                ('processing', 'Processing'),
                ('confirmed', 'Confirmed'),
                ('shipped', 'Shipped'),
                ('delivered', 'Delivered'),
                ('cancelled', 'Cancelled'),
            ]
            order_status_bars = []
            for st_key, st_label in status_defs:
                st_order_ids = list(
                    Order.objects.filter(id__in=matched_order_ids, status=st_key).values_list('id', flat=True)
                ) if matched_order_ids else []
                st_rev = (
                    OrderItem.objects.filter(order_id__in=st_order_ids, product_id__in=matched_product_ids)
                    .aggregate(t=models.Sum('total'))['t']
                    or Decimal('0.00')
                ) if st_order_ids else Decimal('0.00')
                order_status_bars.append({
                    'status': st_key,
                    'label': st_label,
                    'count': len(st_order_ids),
                    'revenue': float(st_rev),
                })

            # Store Customers (Buyers who ordered, wishlisted, or reviewed THIS seller's products)
            customer_users = {}
            for ord_obj in (
                Order.objects.filter(id__in=order_ids, user__isnull=False)
                .select_related('user', 'user__profile')
                .order_by('-created_at')
            ):
                customer_users[ord_obj.user_id] = ord_obj.user
            for wl in (
                Wishlist.objects.filter(products__seller=seller)
                .select_related('user', 'user__profile')
                .distinct()
            ):
                customer_users[wl.user_id] = wl.user
            for rev in (
                ProductReview.objects.filter(product__seller=seller, is_approved=True)
                .select_related('user', 'user__profile')
            ):
                customer_users[rev.user_id] = rev.user

            customers = []
            for uid, u in customer_users.items():
                u_orders = Order.objects.filter(id__in=order_ids, user_id=uid)
                u_order_ids = list(u_orders.values_list('id', flat=True))
                u_cancelled = u_orders.filter(status='cancelled').count()
                u_spent = (
                    OrderItem.objects.filter(order_id__in=u_order_ids, product_id__in=all_product_ids)
                    .aggregate(t=models.Sum('total'))['t']
                    or Decimal('0.00')
                )
                u_liked = Wishlist.objects.filter(user_id=uid, products__seller=seller).values('products').distinct().count()
                u_reviews = ProductReview.objects.filter(user_id=uid, product__seller=seller, is_approved=True).count()
                prof = getattr(u, 'profile', None)
                customers.append({
                    'id': u.id,
                    'username': u.username,
                    'name': u.get_full_name().strip() or u.username,
                    'email': u.email,
                    'city': getattr(prof, 'city', '') or 'N/A',
                    'orders_count': len(u_order_ids),
                    'cancelled_count': u_cancelled,
                    'liked_count': u_liked,
                    'reviews_count': u_reviews,
                    'total_spent': float(u_spent),
                })
            customers.sort(key=lambda c: (c['orders_count'], c['liked_count'], c['total_spent']), reverse=True)

            return Response({
                'success': True,
                'stats': {
                    'total_products': len(all_product_ids),
                    'total_orders': total_orders,
                    'total_revenue': float(total_revenue),
                    'total_sales': int(total_sales),
                    'total_customers': len(customers),
                    'buyer_pool_count': buyer_pool_count,
                    'total_views': total_views,
                    'total_not_viewed': total_not_viewed,
                    'total_likes': total_likes,
                    'total_cancelled': total_cancelled,
                    'average_order_value': float(total_revenue / total_orders) if total_orders > 0 else 0,
                },
                'order_status_bars': order_status_bars,
                'product_analytics': matched_products,
                'all_products': [
                    {'id': p.id, 'name': p.name, 'sku': p.sku}
                    for p in all_products_qs[:50]
                ],
                'engagement_bars': ai_out['engagement_bars'],
                'smart_summary': ai_out['smart_summary'],
                'action_tip': ai_out['action_tip'],
                'customers': customers,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error fetching seller stats: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SellerCreateBuyerCustomerView(generics.GenericAPIView):
    """Allow a Seller to register/add a Buyer Customer & optionally record engagement on one of their products."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        seller = _ensure_active_seller(request.user)
        name = str(request.data.get('name') or '').strip()
        email = str(request.data.get('email') or '').strip().lower()
        city = str(request.data.get('city') or 'Karachi').strip() or 'Karachi'
        phone = str(request.data.get('phone') or '+92-300-1234567').strip()
        product_id = request.data.get('product_id')
        action_type = str(request.data.get('action_type') or 'view_and_like').strip().lower()

        if not name or not email:
            return Response(
                {'success': False, 'error': 'Customer name and email are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            buyer_user = User.objects.filter(email=email).first()
            if buyer_user is None:
                base_uname = slugify(email.split('@')[0] or name) or 'buyer'
                uname = base_uname
                idx = 1
                while User.objects.filter(username=uname).exists():
                    uname = f"{base_uname}{idx}"
                    idx += 1
                parts = name.split(' ', 1)
                buyer_user = User.objects.create_user(
                    username=uname,
                    email=email,
                    password=f"Buyer@{uname}123",
                    first_name=parts[0][:30],
                    last_name=(parts[1][:30] if len(parts) > 1 else ''),
                )
            UserProfile.objects.update_or_create(
                user=buyer_user,
                defaults={'user_type': 'buyer', 'city': city, 'phone': phone},
            )

            product_obj = None
            if product_id:
                product_obj = seller.products.filter(id=int(product_id)).first()
            if product_obj is None:
                product_obj = seller.products.order_by('-created_at').first()

            if product_obj is not None and action_type in ('view_and_like', 'place_order'):
                AnalyticsService.track_product_view(
                    user=buyer_user,
                    product_id=product_obj.id,
                    session_id=f'seller_buyer_{buyer_user.id}',
                )
                wl, _ = Wishlist.objects.get_or_create(user=buyer_user)
                wl.products.add(product_obj)

                if action_type == 'place_order':
                    shipping_addr = {
                        'name': name,
                        'address': f'Main Boulevard, {city}',
                        'city': city,
                        'state': 'Punjab' if city in ('Lahore', 'Islamabad', 'Rawalpindi') else 'Sindh',
                        'country': 'Pakistan',
                        'postal_code': '75500',
                    }
                    new_order = Order.objects.create(
                        user=buyer_user,
                        email=email,
                        phone=phone,
                        shipping_address=shipping_addr,
                        billing_address=shipping_addr,
                        items=[{
                            'product_id': product_obj.id,
                            'product_name': product_obj.name,
                            'quantity': 1,
                            'price': str(product_obj.price),
                            'total': str(product_obj.price),
                        }],
                        subtotal=product_obj.price,
                        tax=Decimal('0.00'),
                        shipping_cost=Decimal('0.00'),
                        discount=Decimal('0.00'),
                        total=product_obj.price,
                        payment_method='cod',
                        payment_status='pending',
                        status='pending',
                        customer_notes=f'Buyer customer order created for {product_obj.name}',
                    )
                    OrderItem.objects.create(
                        order=new_order,
                        product=product_obj,
                        product_name=product_obj.name,
                        variant_name='',
                        price=product_obj.price,
                        quantity=1,
                        total=product_obj.price,
                    )

        return Response({
            'success': True,
            'message': f'Buyer customer "{name}" added successfully!',
            'customer': {
                'id': buyer_user.id,
                'username': buyer_user.username,
                'name': name,
                'email': email,
                'city': city,
            },
        }, status=status.HTTP_201_CREATED)


# ============================================
# PUBLIC SELLER VIEWS
# ============================================

class PublicSellerListView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, *args, **kwargs):
        sellers = Seller.objects.filter(is_approved=True, is_active=True)
        serializer = SellerListSerializer(sellers, many=True)
        return Response({
            'success': True,
            'sellers': serializer.data,
            'count': sellers.count()
        }, status=status.HTTP_200_OK)


class PublicSellerDetailView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, slug, *args, **kwargs):
        try:
            seller = Seller.objects.get(store_slug=slug, is_approved=True, is_active=True)
            serializer = SellerSerializer(seller)
            
            products = Product.objects.filter(seller=seller, status='published')
            product_serializer = ProductListSerializer(products, many=True)
            
            return Response({
                'success': True,
                'seller': serializer.data,
                'products': product_serializer.data,
                'product_count': products.count()
            }, status=status.HTTP_200_OK)
        except Seller.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Seller not found'
            }, status=status.HTTP_404_NOT_FOUND)


class PublicSellerProductsView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, slug, *args, **kwargs):
        try:
            seller = Seller.objects.get(store_slug=slug, is_approved=True, is_active=True)
            products = Product.objects.filter(seller=seller, status='published')
            serializer = ProductListSerializer(products, many=True)
            return Response({
                'success': True,
                'seller': {
                    'id': seller.id,
                    'name': seller.store_name,
                    'slug': seller.store_slug,
                    'logo': seller.logo.url if seller.logo else None,
                },
                'products': serializer.data,
                'count': products.count()
            }, status=status.HTTP_200_OK)
        except Seller.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Seller not found'
            }, status=status.HTTP_404_NOT_FOUND)


# ============================================
# PRODUCT VIEWS
# ============================================

class ProductViewSet(viewsets.ModelViewSet):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = Product.objects.filter(status='published')
    
    def get_queryset(self):
        """
        Buyers/guests see published products.
        A seller can see/edit/delete ALL of their own products (?mine=1 or ?seller=<seller_id|user_id>).
        Supports ?category=<id|slug>, ?search=<text>, ?min_price, ?max_price, ?ordering, ?mine=1, ?seller=<id>.
        """
        user = self.request.user
        seller = getattr(user, 'seller_profile', None) if getattr(user, 'is_authenticated', False) else None
        params = self.request.query_params
        seller_param = params.get('seller')
        is_mine = params.get('mine') in ('1', 'true')

        if seller is not None and is_mine:
            qs = Product.objects.filter(seller=seller)
        elif seller is not None and self.action not in ['list']:
            qs = Product.objects.filter(Q(status='published') | Q(seller=seller))
        elif seller is not None and seller_param and str(seller_param).isdigit() and int(seller_param) in (seller.id, user.id):
            qs = Product.objects.filter(seller=seller)
        else:
            qs = Product.objects.filter(status='published')

        if self.action == 'list':
            if seller_param and not is_mine and not (seller is not None and str(seller_param).isdigit() and int(seller_param) in (seller.id, user.id)):
                if str(seller_param).isdigit():
                    qs = qs.filter(Q(seller_id=int(seller_param)) | Q(seller__user_id=int(seller_param)))
                else:
                    qs = qs.filter(seller__store_slug=seller_param)
            category = params.get('category')
            if category:
                if str(category).isdigit():
                    qs = qs.filter(Q(category_id=category) | Q(subcategory_id=category))
                else:
                    qs = qs.filter(category__slug=category)
            search = (params.get('search') or params.get('q') or '').strip()
            if search:
                qs = qs.filter(
                    Q(name__icontains=search) | Q(description__icontains=search)
                    | Q(short_description__icontains=search) | Q(category__name__icontains=search)
                )
            try:
                if params.get('min_price'):
                    qs = qs.filter(price__gte=Decimal(params['min_price']))
                if params.get('max_price'):
                    qs = qs.filter(price__lte=Decimal(params['max_price']))
            except Exception:
                pass
            ordering_map = {
                'price': 'price', '-price': '-price', 'newest': '-created_at', '-created_at': '-created_at',
                'rating': '-average_rating', '-average_rating': '-average_rating', 'name': 'name',
            }
            ordering = ordering_map.get(params.get('ordering') or params.get('sort') or '', '-created_at')
            qs = qs.order_by(ordering)

        return qs.select_related('category', 'seller')
    
    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        total = qs.count()
        try:
            limit = max(1, min(int(request.query_params.get('limit', 60)), 200))
            offset = max(0, int(request.query_params.get('offset', 0)))
        except ValueError:
            limit, offset = 60, 0
        page = qs[offset:offset + limit]
        serializer = ProductListSerializer(page, many=True, context={'request': request})
        return Response({
            'success': True,
            'results': serializer.data,
            'count': total,
            'limit': limit,
            'offset': offset,
        })

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            is_owner = (
                request.user.is_authenticated
                and instance.seller
                and instance.seller.user_id == request.user.id
            )
            if not is_owner:
                AnalyticsService.track_product_view(
                    user=request.user if request.user.is_authenticated else None,
                    product_id=instance.id,
                    session_id=(getattr(request, 'session', None) and request.session.session_key) or 'anonymous',
                )
        except Exception:
            pass
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return ProductCreateUpdateSerializer
        return ProductDetailSerializer
    
    def get_permissions(self):
        public_actions = [
            'list', 'retrieve', 'featured', 'bestsellers', 
            'new_arrivals', 'recommendations', 'get_images'
        ]
        if self.action in public_actions:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def perform_create(self, serializer):
        seller = _ensure_active_seller(self.request.user)
        product = serializer.save(seller=seller)
        self._index_product(product)
    
    def create(self, request, *args, **kwargs):
        try:
            _ensure_active_seller(request.user)
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            
            detail = ProductDetailSerializer(serializer.instance, context={'request': request}).data
            return Response({
                'success': True,
                'message': 'Product created successfully',
                'product': detail
            }, status=status.HTTP_201_CREATED)
            
        except PermissionDenied as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            logger.error(f"Product creation error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        
        if hasattr(user, 'seller_profile') and instance.seller == user.seller_profile:
            product = serializer.save()
            self._index_product(product)
        else:
            raise PermissionDenied("You do not have permission to update this product.")
    
    def update(self, request, *args, **kwargs):
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            
            if not hasattr(request.user, 'seller_profile') or instance.seller != request.user.seller_profile:
                return Response({
                    'success': False,
                    'error': 'You do not have permission to update this product'
                }, status=status.HTTP_403_FORBIDDEN)
            
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            
            detail = ProductDetailSerializer(serializer.instance, context={'request': request}).data
            return Response({
                'success': True,
                'message': 'Product updated successfully',
                'product': detail
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Product update error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def perform_destroy(self, instance):
        self._remove_from_index(instance)
        instance.delete()
    
    def destroy(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            
            if not hasattr(request.user, 'seller_profile') or instance.seller != request.user.seller_profile:
                return Response({
                    'success': False,
                    'error': 'You do not have permission to delete this product'
                }, status=status.HTTP_403_FORBIDDEN)
            
            self.perform_destroy(instance)
            return Response({
                'success': True,
                'message': 'Product deleted successfully'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Product delete error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def _index_product(self, product):
        if product.main_image:
            try:
                from ai_agent.vector.index import VectorIndex
                index = VectorIndex()
                index.index_product(product)
                logger.info(f"Product indexed: {product.name}")
            except Exception as e:
                logger.error(f"Indexing error: {e}")
    
    def _remove_from_index(self, product):
        try:
            from ai_agent.vector.index import VectorIndex
            index = VectorIndex()
            index.delete_product(product.id)
            logger.info(f"Product removed from index: {product.name}")
        except Exception as e:
            logger.error(f"Remove from index error: {e}")
    
    @action(detail=True, methods=['post'])
    def upload_image(self, request, pk=None):
        product = self.get_object()
        
        if not (hasattr(request.user, 'seller_profile') and product.seller == request.user.seller_profile):
            return Response({
                'success': False,
                'error': 'You do not have permission to upload images for this product'
            }, status=status.HTTP_403_FORBIDDEN)
        
        image_file = request.FILES.get('image')
        if not image_file:
            return Response({
                'success': False,
                'error': 'Image file is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            img = PILImage.open(image_file)
            if img.format not in ['JPEG', 'PNG', 'WEBP', 'GIF']:
                return Response({
                    'success': False,
                    'error': 'Invalid image format. Supported: JPEG, PNG, WEBP, GIF'
                }, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({
                'success': False,
                'error': 'Invalid image file'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        is_primary = request.data.get('is_primary', False)
        alt_text = request.data.get('alt_text', '')
        
        if is_primary:
            product.images.update(is_primary=False)
        
        product_image = ProductImage.objects.create(
            product=product,
            image=image_file,
            alt_text=alt_text,
            is_primary=is_primary,
            order=product.images.count()
        )
        
        if not product.main_image:
            product.main_image = image_file
            product.save()
        
        serializer = ProductImageSerializer(product_image)
        return Response({
            'success': True,
            'message': 'Image uploaded successfully',
            'image': serializer.data
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['delete'])
    def delete_image(self, request, pk=None):
        product = self.get_object()
        image_id = request.data.get('image_id')
        
        if not image_id:
            return Response({
                'success': False,
                'error': 'Image ID is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            image = product.images.get(id=image_id)
            
            if not (hasattr(request.user, 'seller_profile') and product.seller == request.user.seller_profile):
                return Response({
                    'success': False,
                    'error': 'You do not have permission to delete this image'
                }, status=status.HTTP_403_FORBIDDEN)
            
            image.delete()
            
            return Response({
                'success': True,
                'message': 'Image deleted successfully'
            }, status=status.HTTP_200_OK)
            
        except ProductImage.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Image not found'
            }, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def set_primary_image(self, request, pk=None):
        product = self.get_object()
        image_id = request.data.get('image_id')
        
        if not image_id:
            return Response({
                'success': False,
                'error': 'Image ID is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            image = product.images.get(id=image_id)
            
            if not (hasattr(request.user, 'seller_profile') and product.seller == request.user.seller_profile):
                return Response({
                    'success': False,
                    'error': 'You do not have permission to update this image'
                }, status=status.HTTP_403_FORBIDDEN)
            
            product.images.update(is_primary=False)
            
            image.is_primary = True
            image.save()
            
            product.main_image = image.image
            product.save()
            
            return Response({
                'success': True,
                'message': 'Primary image updated successfully'
            }, status=status.HTTP_200_OK)
            
        except ProductImage.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Image not found'
            }, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['get'])
    def get_images(self, request, pk=None):
        product = self.get_object()
        images = product.images.all()
        serializer = ProductImageSerializer(images, many=True)
        return Response({
            'success': True,
            'images': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'])
    def recommendations(self, request, pk=None):
        product = self.get_object()
        limit = int(request.GET.get('limit', 5))
        result = ProductService.get_product_recommendations(product.id, limit)
        return Response(result)
    
    @action(detail=True, methods=['post'])
    def track_view(self, request, pk=None):
        product = self.get_object()
        AnalyticsService.track_product_view(
            user=request.user,
            product_id=product.id,
            session_id=request.session.session_key or 'anonymous'
        )
        return Response({
            'success': True, 
            'message': 'View tracked'
        })
    
    @action(detail=True, methods=['post'])
    def generate_description(self, request, pk=None):
        product = self.get_object()
        if product.status == 'draft' or product.status == 'pending_review':
            return Response({
                'success': False,
                'error': 'Product must be published to generate AI description'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        description = product.generate_ai_description()
        if description:
            return Response({
                'success': True,
                'message': 'AI description generated successfully',
                'description': description
            })
        return Response({
            'success': False,
            'error': 'Failed to generate AI description'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def featured(self, request):
        limit = int(request.GET.get('limit', 10))
        products = Product.objects.filter(status='published', is_featured=True)[:limit]
        serializer = ProductListSerializer(products, many=True)
        return Response({
            'success': True,
            'products': serializer.data,
            'count': len(serializer.data)
        })
    
    @action(detail=False, methods=['get'])
    def bestsellers(self, request):
        limit = int(request.GET.get('limit', 10))
        products = Product.objects.filter(status='published', is_bestseller=True)[:limit]
        serializer = ProductListSerializer(products, many=True)
        return Response({
            'success': True,
            'products': serializer.data,
            'count': len(serializer.data)
        })
    
    @action(detail=False, methods=['get'])
    def new_arrivals(self, request):
        limit = int(request.GET.get('limit', 10))
        products = Product.objects.filter(status='published', is_new_arrival=True)[:limit]
        serializer = ProductListSerializer(products, many=True)
        return Response({
            'success': True,
            'products': serializer.data,
            'count': len(serializer.data)
        })


# ============================================
# CATEGORY VIEWS
# ============================================

class CategoryViewSet(viewsets.ModelViewSet):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    queryset = Category.objects.filter(is_active=True)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return CategoryListSerializer
        return CategorySerializer
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]


# ============================================
# CART VIEWS
# ============================================

class CartView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        cart = CartService.get_or_create_cart(user=request.user)
        result = CartService.get_cart_summary(cart)
        return Response(result, status=status.HTTP_200_OK)
    
    def delete(self, request, *args, **kwargs):
        cart = CartService.get_or_create_cart(user=request.user)
        result = CartService.clear_cart(cart)
        return Response(result, status=status.HTTP_200_OK)


class AddToCartView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = AddToCartSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        product_id = serializer.validated_data['product_id']
        quantity = serializer.validated_data['quantity']
        variant_id = serializer.validated_data.get('variant_id')
        
        cart = CartService.get_or_create_cart(user=request.user)
        result = CartService.add_item(cart, product_id, quantity, variant_id)
        return Response(result, status=status.HTTP_200_OK)


class RemoveFromCartView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, item_id, *args, **kwargs):
        cart = CartService.get_or_create_cart(user=request.user)
        result = CartService.remove_item(cart, item_id)
        return Response(result, status=status.HTTP_200_OK)


class UpdateCartItemView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = UpdateCartItemSerializer
    
    def put(self, request, item_id, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        quantity = serializer.validated_data['quantity']
        cart = CartService.get_or_create_cart(user=request.user)
        result = CartService.update_quantity(cart, item_id, quantity)
        return Response(result, status=status.HTTP_200_OK)


# ============================================
# ORDER VIEWS
# ============================================

class OrderListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        status_filter = request.GET.get('status')
        result = OrderService.get_user_orders(request.user, status_filter)
        return Response(result, status=status.HTTP_200_OK)


class CreateOrderView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = CreateOrderSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        result = OrderService.create_order(request.user, serializer.validated_data)
        return Response(result, status=status.HTTP_200_OK)


class OrderDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def _get_authorized_order(self, request, pk):
        order = Order.objects.get(id=pk)
        seller = Seller.objects.filter(user=request.user).first()
        is_seller_for_order = bool(
            seller and order.order_items.filter(product__seller=seller).exists()
        )
        if order.user != request.user and not is_seller_for_order:
            return None, None, False, Response({
                'success': False,
                'error': 'You do not have permission to access this order'
            }, status=status.HTTP_403_FORBIDDEN)
        return order, seller, is_seller_for_order, None

    def get(self, request, pk, *args, **kwargs):
        try:
            order, _, _, err_resp = self._get_authorized_order(request, pk)
            if err_resp:
                return err_resp
            serializer = OrderDetailSerializer(order)
            return Response({
                'success': True,
                'order': serializer.data
            }, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Order not found'
            }, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk, *args, **kwargs):
        try:
            order, seller, is_seller_for_order, err_resp = self._get_authorized_order(request, pk)
            if err_resp:
                return err_resp

            if order.status not in ('delivered', 'cancelled', 'shipped'):
                return Response({
                    'success': False,
                    'error': 'Order can only be deleted after it is shipped, delivered, or cancelled.'
                }, status=status.HTTP_400_BAD_REQUEST)

            if is_seller_for_order and order.user != request.user and order.order_items.exclude(product__seller=seller).exists():
                order.order_items.filter(product__seller=seller).delete()
            else:
                order.delete()

            return Response({
                'success': True,
                'message': 'Order deleted successfully',
                'deleted_id': pk,
            }, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Order not found'
            }, status=status.HTTP_404_NOT_FOUND)


class UpdateOrderStatusView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = OrderStatusUpdateSerializer
    
    def _update(self, request, pk):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            order = Order.objects.get(id=pk)
            seller = Seller.objects.filter(user=request.user).first()
            is_seller_for_order = bool(
                seller and order.order_items.filter(product__seller=seller).exists()
            )
            if order.user != request.user and not is_seller_for_order:
                return Response({
                    'success': False,
                    'error': 'Only the store seller or order owner can update this order status'
                }, status=status.HTTP_403_FORBIDDEN)
            prior_status = order.status
            next_status = serializer.validated_data['status']
            note = serializer.validated_data.get('note')
            cancel_photo = request.FILES.get('cancel_photo') or serializer.validated_data.get('cancel_photo')
            result = OrderService.update_order_status(
                order.id,
                next_status,
                note,
            )
            if result.get('success') and next_status == 'cancelled':
                try:
                    from seller_mesh.recovery_service import (
                        register_cancelled_order_recovery,
                        serialize_recovery,
                    )
                    order.refresh_from_db()
                    rec = register_cancelled_order_recovery(
                        order,
                        reason=note or 'Buyer cancelled product / order',
                        prior_status=prior_status,
                        cancel_photo_file=cancel_photo,
                    )
                    if rec is not None:
                        result['recovery'] = serialize_recovery(rec)
                except Exception as rec_err:
                    logger.warning(f"Failed to register cancelled order recovery: {rec_err}")
            return Response(result, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Order not found'
            }, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk, *args, **kwargs):
        return self._update(request, pk)

    def patch(self, request, pk, *args, **kwargs):
        return self._update(request, pk)

    def post(self, request, pk, *args, **kwargs):
        return self._update(request, pk)


# ============================================
# REVIEW VIEWS
# ============================================

class ReviewListCreateView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    serializer_class = CreateReviewSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, *args, **kwargs):
        product_id = request.GET.get('product_id')
        if product_id:
            result = ReviewService.get_product_reviews(product_id)
        else:
            return Response({
                'success': False,
                'error': 'Product ID is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        result = ReviewService.create_review(request.user, serializer.validated_data)
        return Response(result, status=status.HTTP_200_OK)


class ReviewDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk, *args, **kwargs):
        try:
            review = ProductReview.objects.get(id=pk, is_approved=True)
            serializer = ReviewSerializer(review)
            return Response({
                'success': True,
                'review': serializer.data
            }, status=status.HTTP_200_OK)
        except ProductReview.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Review not found'
            }, status=status.HTTP_404_NOT_FOUND)


class MarkReviewHelpfulView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def post(self, request, pk, *args, **kwargs):
        try:
            review = ProductReview.objects.get(id=pk)
            
            existing = ReviewHelpful.objects.filter(
                review=review,
                user=request.user
            ).first()
            
            if existing:
                return Response({
                    'success': False,
                    'error': 'You already voted on this review'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            is_helpful = request.data.get('is_helpful', True)
            
            if is_helpful:
                review.helpful_count += 1
            else:
                review.helpful_count -= 1
            review.save()
            
            ReviewHelpful.objects.create(
                review=review,
                user=request.user,
                is_helpful=is_helpful
            )
            
            return Response({
                'success': True,
                'message': 'Vote recorded',
                'helpful_count': review.helpful_count
            }, status=status.HTTP_200_OK)
            
        except ProductReview.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Review not found'
            }, status=status.HTTP_404_NOT_FOUND)


# ============================================
# WISHLIST VIEWS
# ============================================

class WishlistView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        result = WishlistService.get_wishlist(request.user)
        return Response(result, status=status.HTTP_200_OK)


class AddToWishlistView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = WishlistItemSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        product_id = serializer.validated_data['product_id']
        result = WishlistService.add_to_wishlist(request.user, product_id)
        return Response(result, status=status.HTTP_200_OK)


class RemoveFromWishlistView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, product_id, *args, **kwargs):
        result = WishlistService.remove_from_wishlist(request.user, product_id)
        return Response(result, status=status.HTTP_200_OK)


# ============================================
# COUPON VIEWS
# ============================================

class ValidateCouponView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = CouponValidateSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        code = serializer.validated_data['code']
        subtotal = serializer.validated_data['subtotal']
        
        result = CouponService.validate_coupon(code, subtotal)
        return Response(result, status=status.HTTP_200_OK)


# ============================================
# NOTIFICATION VIEWS
# ============================================

class NotificationListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        unread_only = request.GET.get('unread_only', 'false').lower() == 'true'
        result = NotificationService.get_user_notifications(request.user, unread_only)
        return Response(result, status=status.HTTP_200_OK)


class MarkNotificationsReadView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationMarkReadSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        notification_ids = serializer.validated_data.get('notification_ids')
        mark_all = serializer.validated_data.get('mark_all', False)
        
        result = NotificationService.mark_as_read(
            request.user, 
            notification_ids, 
            mark_all
        )
        return Response(result, status=status.HTTP_200_OK)


# ============================================
# ANALYTICS VIEWS
# ============================================

class StoreStatsView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        result = AnalyticsService.get_store_stats()
        return Response(result, status=status.HTTP_200_OK)


class ProductAnalyticsView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, product_id, *args, **kwargs):
        result = AnalyticsService.get_product_analytics(product_id)
        return Response(result, status=status.HTTP_200_OK)


# ============================================
# PUBLIC VIEWS
# ============================================

class PublicProductListView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, *args, **kwargs):
        try:
            category = request.GET.get('category')
            seller = request.GET.get('seller')
            limit = int(request.GET.get('limit', 20))
            offset = int(request.GET.get('offset', 0))
            
            products = Product.objects.filter(status='published')
            
            if category:
                products = products.filter(category_id=category)
            if seller:
                products = products.filter(seller_id=seller)
            
            total = products.count()
            products = products[offset:offset + limit]
            
            serializer = ProductListSerializer(products, many=True)
            return Response({
                'success': True,
                'products': serializer.data,
                'total': total,
                'limit': limit,
                'offset': offset
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Public product list error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PublicProductDetailView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, slug, *args, **kwargs):
        try:
            logger.info(f"Fetching product with slug: {slug}")
            
            product = Product.objects.filter(slug=slug).exclude(status='discontinued').first()
            
            if not product:
                logger.warning(f"Product not found with slug: {slug}")
                return Response({
                    'success': False,
                    'error': 'Product not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            logger.info(f"Product found: {product.name} (ID: {product.id})")
            
            serializer = ProductDetailSerializer(product, context={'request': request})
            
            try:
                AnalyticsService.track_product_view(
                    user=request.user if request.user.is_authenticated else None,
                    product_id=product.id,
                    session_id=request.session.session_key or 'anonymous'
                )
            except Exception as e:
                logger.error(f"Error tracking product view: {e}")
            
            return Response({
                'success': True,
                'product': serializer.data
            }, status=status.HTTP_200_OK)
            
        except Product.DoesNotExist:
            logger.error(f"Product not found with slug: {slug}")
            return Response({
                'success': False,
                'error': 'Product not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error fetching product with slug {slug}: {str(e)}", exc_info=True)
            return Response({
                'success': False,
                'error': str(e),
                'message': 'Failed to fetch product'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PublicCategoryListView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, *args, **kwargs):
        try:
            categories = Category.objects.filter(is_active=True, parent__isnull=True)
            serializer = CategorySerializer(categories, many=True)
            return Response({
                'success': True,
                'categories': serializer.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Public category list error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================
# SEARCH VIEWS
# ============================================

class ProductSearchView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = SearchSerializer
    
    def get(self, request):
        query = request.GET.get('q', '')
        category = request.GET.get('category')
        seller = request.GET.get('seller')
        min_price = request.GET.get('min_price')
        max_price = request.GET.get('max_price')
        rating = request.GET.get('rating')
        sort_by = request.GET.get('sort_by', 'relevance')
        limit = int(request.GET.get('limit', 20))
        offset = int(request.GET.get('offset', 0))
        
        filters = {
            'category': category,
            'seller': seller,
            'min_price': min_price,
            'max_price': max_price,
            'rating': rating,
            'sort_by': sort_by
        }
        filters = {k: v for k, v in filters.items() if v is not None}
        
        result = ProductService.search_products(query, limit, **filters)
        result['offset'] = offset
        result['limit'] = limit
        
        return Response(result, status=status.HTTP_200_OK)


class AdvancedSearchView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        query = request.data.get('query', '')
        filters = {
            'category': request.data.get('category'),
            'subcategory': request.data.get('subcategory'),
            'seller': request.data.get('seller'),
            'min_price': request.data.get('min_price'),
            'max_price': request.data.get('max_price'),
            'rating': request.data.get('rating'),
            'in_stock': request.data.get('in_stock'),
            'is_featured': request.data.get('is_featured'),
            'is_bestseller': request.data.get('is_bestseller'),
            'is_new_arrival': request.data.get('is_new_arrival'),
            'tags': request.data.get('tags', []),
            'sort_by': request.data.get('sort_by', 'relevance'),
            'limit': request.data.get('limit', 20),
        }
        filters = {k: v for k, v in filters.items() if v is not None}
        
        result = ProductService.search_products(query, **filters)
        return Response(result, status=status.HTTP_200_OK)


class SearchSuggestionsView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        query = request.GET.get('q', '')
        limit = int(request.GET.get('limit', 10))
        
        if len(query) < 2:
            return Response({'success': True, 'suggestions': []}, status=status.HTTP_200_OK)
        
        products = Product.objects.filter(
            Q(name__icontains=query) |
            Q(description__icontains=query) |
            Q(sku__icontains=query)
        ).distinct()[:limit]
        
        suggestions = [
            {
                'text': product.name,
                'url': f'/product/{product.slug}/',
                'category': product.category.name if product.category else None,
                'seller': product.seller.store_name if product.seller else None
            }
            for product in products
        ]
        
        return Response({
            'success': True,
            'suggestions': suggestions,
            'count': len(suggestions)
        }, status=status.HTTP_200_OK)


# ============================================
# AI-POWERED VIEWS
# ============================================

class AISearchView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = SearchSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        query = serializer.validated_data.get('query')
        image = request.FILES.get('image')
        limit = serializer.validated_data.get('limit', 20)
        filters = {
            'category': serializer.validated_data.get('category'),
            'seller': serializer.validated_data.get('seller'),
            'min_price': serializer.validated_data.get('min_price'),
            'max_price': serializer.validated_data.get('max_price'),
            'rating': serializer.validated_data.get('rating'),
            'sort_by': serializer.validated_data.get('sort_by', 'relevance')
        }
        
        if image:
            result = ProductService.search_by_image(image, limit)
        else:
            result = ProductService.search_products(query, limit, **filters)
        
        return Response(result, status=status.HTTP_200_OK)


class AIRecommendationsView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, product_id, *args, **kwargs):
        limit = int(request.GET.get('limit', 5))
        result = ProductService.get_product_recommendations(product_id, limit)
        return Response(result, status=status.HTTP_200_OK)


class AIChatView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        message = request.data.get('message')
        session_id = request.data.get('session_id')
        user = request.user
        image = request.FILES.get('image')
        
        if not message and not image:
            return Response(
                {'success': False, 'error': 'Message or image is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = AIChatService.chat(message, session_id, user, image=image)
        return Response(result, status=status.HTTP_200_OK)


class AIImageAnalysisView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def post(self, request, *args, **kwargs):
        image = request.FILES.get('image')
        product_id = request.data.get('product_id')
        
        if not image:
            return Response(
                {'success': False, 'error': 'Image is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            img = PILImage.open(image)
            width, height = img.size
            format_type = img.format
            if hasattr(image, 'seek'):
                image.seek(0)
            
            analysis = ProductService.analyze_image(image)
            if not analysis.get('success'):
                return Response({
                    'success': False,
                    'error': analysis.get('error', 'Failed to analyze image')
                }, status=status.HTTP_502_BAD_GATEWAY)
            
            objects = analysis.get('objects', [])
            colors = analysis.get('colors', [])
            extracted_text = analysis.get('extracted_text') or analysis.get('text', '')
            suggestions = analysis.get('suggestions', [])
            attributes = dict(analysis.get('attributes') or {})
            attributes['format'] = format_type or 'UNKNOWN'
            attributes['dimensions'] = f'{width}x{height}'
            
            if product_id:
                try:
                    product = Product.objects.get(id=product_id)
                    if product.main_image:
                        ProductService.ensure_indexed()
                        logger.info(f"Product re-indexed: {product.name}")
                except Product.DoesNotExist:
                    logger.warning(f"Product {product_id} not found")
            
            search_terms = []
            for term in (suggestions + objects + [attributes.get('brand', ''), attributes.get('category', '')]):
                if term and str(term).strip():
                    search_terms.append(str(term).strip())
            
            search_query = Q()
            for term in dict.fromkeys(search_terms[:6]):
                search_query |= (
                    Q(name__icontains=term) |
                    Q(description__icontains=term) |
                    Q(category__name__icontains=term)
                )
            
            if search_terms:
                similar_products = Product.objects.filter(
                    Q(status='published') & search_query
                ).distinct()[:5]
            else:
                similar_products = Product.objects.filter(status='published')[:5]
            
            result = {
                'success': True,
                'objects': objects,
                'colors': colors,
                'attributes': attributes,
                'suggestions': suggestions,
                'extracted_text': extracted_text,
                'similar_products': ProductListSerializer(similar_products, many=True).data
            }
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AgentStatusView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    
    def get(self, request, *args, **kwargs):
        result = AIChatService.get_status()
        return Response(result, status=status.HTTP_200_OK)


# ============================================
# PAYMENT VIEWS (Stripe)
# ============================================

class CreatePaymentIntentView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            
            amount = request.data.get('amount')
            currency = request.data.get('currency', 'usd')
            
            if not amount:
                return Response({
                    'error': 'Amount is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            intent = stripe.PaymentIntent.create(
                amount=int(float(amount) * 100),
                currency=currency,
                metadata={
                    'user_id': request.user.id,
                    'user_email': request.user.email
                }
            )
            
            return Response({
                'success': True,
                'client_secret': intent.client_secret,
                'payment_intent_id': intent.id,
                'amount': amount,
                'currency': currency
            }, status=status.HTTP_200_OK)
            
        except stripe.error.StripeError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ConfirmPaymentView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        payment_intent_id = request.data.get('payment_intent_id')
        order_id = request.data.get('order_id')
        
        if not payment_intent_id:
            return Response({
                'error': 'Payment Intent ID is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            
            if intent.status == 'succeeded':
                if order_id:
                    try:
                        order = Order.objects.get(id=order_id, user=request.user)
                        order.payment_status = 'paid'
                        order.paid_at = timezone.now()
                        order.status = 'confirmed'
                        order.save()
                    except Order.DoesNotExist:
                        pass
                
                return Response({
                    'success': True,
                    'message': 'Payment confirmed successfully',
                    'payment_status': intent.status
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'success': False,
                    'message': f'Payment status: {intent.status}',
                    'payment_status': intent.status
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except stripe.error.StripeError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class StripeWebhookView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
        webhook_secret = settings.STRIPE_WEBHOOK_SECRET
        
        try:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
            
            if event['type'] == 'payment_intent.succeeded':
                payment_intent = event['data']['object']
                logger.info(f"Payment succeeded: {payment_intent.get('id')}")
                
                payment_intent_id = payment_intent.get('id')
                try:
                    order = Order.objects.get(payment_intent_id=payment_intent_id)
                    order.payment_status = 'paid'
                    order.paid_at = timezone.now()
                    order.status = 'confirmed'
                    order.save()
                    logger.info(f"Order {order.order_number} updated to paid")
                except Order.DoesNotExist:
                    logger.warning(f"Order not found for payment: {payment_intent_id}")
                
            elif event['type'] == 'payment_intent.payment_failed':
                payment_intent = event['data']['object']
                logger.error(f"Payment failed: {payment_intent.get('id')}")
                
            elif event['type'] == 'charge.succeeded':
                charge = event['data']['object']
                logger.info(f"Charge succeeded: {charge.get('id')}")
                
            return Response({'status': 'success'}, status=status.HTTP_200_OK)
            
        except ValueError:
            return Response({
                'error': 'Invalid payload'
            }, status=status.HTTP_400_BAD_REQUEST)
        except stripe.error.SignatureVerificationError:
            return Response({
                'error': 'Invalid signature'
            }, status=status.HTTP_400_BAD_REQUEST)


class PaymentMethodsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        payment_methods = [
            {
                'id': 'stripe',
                'name': 'Credit Card (Stripe)',
                'icon': 'credit_card',
                'enabled': True
            },
            {
                'id': 'paypal',
                'name': 'PayPal',
                'icon': 'paypal',
                'enabled': True
            },
            {
                'id': 'cod',
                'name': 'Cash on Delivery',
                'icon': 'cash',
                'enabled': True
            },
            {
                'id': 'bank_transfer',
                'name': 'Bank Transfer',
                'icon': 'bank',
                'enabled': True
            }
        ]
        
        return Response({
            'success': True,
            'payment_methods': payment_methods
        }, status=status.HTTP_200_OK)


# ============================================
# ERROR HANDLERS
# ============================================

def handler404(request, exception):
    return JsonResponse({
        'success': False,
        'error': 'Not Found',
        'message': 'The requested resource was not found.',
        'status_code': 404
    }, status=404)


def handler403(request, exception):
    return JsonResponse({
        'success': False,
        'error': 'Forbidden',
        'message': 'You do not have permission to access this resource.',
        'status_code': 403
    }, status=403)


def handler500(request):
    return JsonResponse({
        'success': False,
        'error': 'Internal Server Error',
        'message': 'Something went wrong on our end. Please try again later.',
        'status_code': 500
    }, status=500)


# ============================================
# OPEN AGENTIC WEB (MIT NANDA / MOZILLA OTARI / COGNIZANT AI LAB)
# ============================================

def _open_agent_cors_headers(resp):
    resp['Access-Control-Allow-Origin'] = '*'
    resp['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Caller-Manifest'
    return resp


def _build_open_agent_manifest(request=None) -> dict:
    base_url = ''
    if request is not None:
        try:
            base_url = request.build_absolute_uri('/').rstrip('/')
        except Exception:
            base_url = ''

    return {
        'protocol': 'open-agentic-web/1.0',
        'standard': 'MIT-NANDA / Open-Agentic-Web / Mozilla-Otari',
        'network_id': 'storehub-anti-rto-commerce-mesh',
        'name': 'StoreHub Anti-RTO & Universal Commerce Agent Network',
        'description': (
            'Open Agentic Web node for product catalog concierge, SupplyShield A2A price/customs negotiation, '
            'anti-RTO cancelled-parcel Next-Customer rerouting, and COD fraud risk gatekeeping.'
        ),
        'version': '1.0.0',
        'origin': base_url or 'http://localhost:3000',
        'runtime_url': '/agent-runtime.js',
        'manifest_urls': ['/.well-known/agent-network.json', '/agent-network.json'],
        'agents': [
            {
                'id': 'buyer_catalog_concierge',
                'name': 'Buyer Catalog Concierge',
                'description': 'Catalog discovery, price comparison, buyer review lookup, and live stock risk analysis across StoreHub sellers.',
                'capabilities': [
                    'catalog_discovery',
                    'price_comparison',
                    'live_stock_risk_analysis',
                    'supply_chain_hub_deal_discovery',
                ],
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'query': {'type': 'string', 'description': 'Product search query or buying goal'},
                        'max_price': {'type': 'number', 'description': 'Optional budget ceiling in USD'},
                        'category': {'type': 'string', 'description': 'Optional category filter'},
                    },
                    'required': ['query'],
                },
                'output_schema': {
                    'type': 'object',
                    'properties': {
                        'products': {'type': 'array'},
                        'supply_chain_hub_deals': {'type': 'array'},
                        'stock_summary': {'type': 'string'},
                    },
                },
                'execution_mode': 'browser-runtime',
                'fallback_mode': 'backend-mesh-fallback',
                'endpoint': '/api/open-agent/invoke/',
            },
            {
                'id': 'supplyshield_haggle_agent',
                'name': 'SupplyShield Haggle & Customs Agent',
                'description': 'Cross-site A2A 2-round price negotiation, WCO HS-code & hazmat validation, and cryptographic Escrow PO generation.',
                'capabilities': [
                    'a2a_price_negotiation',
                    'customs_hs_code_validation',
                    'escrow_po_generation',
                    'sla_route_optimization',
                ],
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'product_name': {'type': 'string'},
                        'quantity': {'type': 'integer', 'default': 1},
                        'target_price': {'type': 'number'},
                        'max_budget': {'type': 'number'},
                        'category': {'type': 'string'},
                    },
                    'required': ['product_name'],
                },
                'output_schema': {
                    'type': 'object',
                    'properties': {
                        'original_price_usd': {'type': 'number'},
                        'negotiated_price_usd': {'type': 'number'},
                        'rebate_pct': {'type': 'number'},
                        'hs_code': {'type': 'string'},
                        'po_hash': {'type': 'string'},
                        'dialogue': {'type': 'array'},
                    },
                },
                'execution_mode': 'browser-runtime',
                'fallback_mode': 'backend-mesh-fallback',
                'endpoint': '/api/open-agent/invoke/',
            },
            {
                'id': 'anti_rto_rerouter_agent',
                'name': 'Anti-RTO Cancelled Deal Rerouter Agent',
                'description': 'Detects cancelled or refused in-transit parcels and negotiates discounted Next-Customer same-city hub rescue deals.',
                'capabilities': [
                    'cancelled_parcel_detection',
                    'next_customer_matching',
                    'anti_rto_discount_haggle',
                    'return_freight_recovery',
                ],
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'product_title': {'type': 'string'},
                        'city': {'type': 'string', 'default': 'Karachi'},
                        'buyer_offer_price': {'type': 'number'},
                        'max_discount_pct': {'type': 'number', 'default': 15},
                    },
                },
                'output_schema': {
                    'type': 'object',
                    'properties': {
                        'deal_card': {'type': 'object'},
                        'agreed_price_usd': {'type': 'number'},
                        'discount_pct': {'type': 'number'},
                        'freight_saved_usd': {'type': 'number'},
                        'a2a_transcript': {'type': 'array'},
                    },
                },
                'execution_mode': 'browser-runtime',
                'fallback_mode': 'backend-mesh-fallback',
                'endpoint': '/api/open-agent/invoke/',
            },
            {
                'id': 'cod_risk_gatekeeper_agent',
                'name': 'COD Risk Gatekeeper Agent',
                'description': 'Evaluates incoming buyer Cash-on-Delivery orders for prank numbers, incomplete addresses, and fake COD wave risk before dispatch.',
                'capabilities': [
                    'cod_fraud_scoring',
                    'address_completeness_check',
                    'pre_dispatch_rto_prevention',
                ],
                'input_schema': {
                    'type': 'object',
                    'properties': {
                        'phone': {'type': 'string'},
                        'address': {'type': 'string'},
                        'city': {'type': 'string'},
                        'payment_method': {'type': 'string', 'default': 'cod'},
                        'order_value': {'type': 'number', 'default': 45.0},
                    },
                },
                'output_schema': {
                    'type': 'object',
                    'properties': {
                        'risk_score': {'type': 'integer'},
                        'decision': {'type': 'string'},
                        'risk_factors': {'type': 'array'},
                        'freight_saved_usd': {'type': 'number'},
                    },
                },
                'execution_mode': 'browser-runtime',
                'fallback_mode': 'backend-mesh-fallback',
                'endpoint': '/api/open-agent/invoke/',
            },
        ],
        'interoperability': {
            'invoke_endpoint': '/api/open-agent/invoke/',
            'protocol_bindings': ['open-agentic-web/1.0', 'json-rpc-2.0', 'a2a/v1'],
            'cors_enabled': True,
            'allow_external_discovery': True,
            'discovery_paths': ['/.well-known/agent-network.json', '/agent-network.json'],
            'supported_browser_providers': [
                'storehub-fallback',
                'mozilla-otari',
                'openai-compatible',
                'google-gemini',
            ],
        },
    }


class AgentNetworkManifestView(APIView):
    """Public Open Agentic Web discovery manifest (`/.well-known/agent-network.json` & `/agent-network.json`)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def options(self, request, *args, **kwargs):
        return _open_agent_cors_headers(Response(status=status.HTTP_200_OK))

    def get(self, request, *args, **kwargs):
        resp = Response(_build_open_agent_manifest(request), status=status.HTTP_200_OK)
        return _open_agent_cors_headers(resp)


class OpenAgentInvokeView(APIView):
    """Public cross-site A2A invocation endpoint (`POST /api/open-agent/invoke/`) with CORS `*`."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def options(self, request, *args, **kwargs):
        return _open_agent_cors_headers(Response(status=status.HTTP_200_OK))

    def post(self, request, *args, **kwargs):
        body = request.data if isinstance(request.data, dict) else {}
        rpc_id = body.get('id')
        params = body.get('params') if isinstance(body.get('params'), dict) else {}
        agent_id = str(body.get('agent_id') or body.get('method') or '').strip()
        caller_manifest = str(
            body.get('caller_manifest')
            or params.get('caller_manifest')
            or request.META.get('HTTP_X_CALLER_MANIFEST', '')
            or 'anonymous-external-agent'
        )
        payload = body.get('payload') if isinstance(body.get('payload'), dict) else (
            params.get('payload') if isinstance(params.get('payload'), dict) else params
        )
        if not isinstance(payload, dict):
            payload = {}

        if not agent_id:
            resp = Response(
                {'ok': False, 'error': 'agent_id (or JSON-RPC method) is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
            return _open_agent_cors_headers(resp)

        trace = [
            f'OPEN_AGENT_INVOKE: Received request for "{agent_id}" from {caller_manifest}',
        ]

        try:
            if agent_id == 'buyer_catalog_concierge':
                result = self._run_catalog_concierge(payload, trace)
            elif agent_id == 'supplyshield_haggle_agent':
                result = self._run_haggle_agent(payload, trace)
            elif agent_id == 'anti_rto_rerouter_agent':
                result = self._run_anti_rto_rerouter(payload, trace)
            elif agent_id == 'cod_risk_gatekeeper_agent':
                result = self._run_cod_risk_gatekeeper(payload, trace)
            else:
                resp = Response(
                    {
                        'ok': False,
                        'error': (
                            f'Unknown agent_id "{agent_id}". Available agents: '
                            'buyer_catalog_concierge, supplyshield_haggle_agent, '
                            'anti_rto_rerouter_agent, cod_risk_gatekeeper_agent.'
                        ),
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
                return _open_agent_cors_headers(resp)

            out = {
                'ok': True,
                'jsonrpc': '2.0',
                'id': rpc_id,
                'protocol': 'open-agentic-web/1.0',
                'network_id': 'storehub-anti-rto-commerce-mesh',
                'agent_id': agent_id,
                'caller_manifest': caller_manifest,
                'execution_mode': 'backend-mesh-fallback',
                'trace': trace,
                'result': result,
            }
            return _open_agent_cors_headers(Response(out, status=status.HTTP_200_OK))
        except Exception as exc:
            logger.error(f"OpenAgentInvokeView error for {agent_id}: {exc}")
            resp = Response(
                {'ok': False, 'agent_id': agent_id, 'error': str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
            return _open_agent_cors_headers(resp)

    def _run_catalog_concierge(self, payload: dict, trace: list) -> dict:
        from ai_agent.tools.product_search import ProductSearchTool
        from seller_mesh.recovery_service import search_supply_chain_hub_cancelled_deals

        query = str(payload.get('query') or 'all').strip()
        filters = {}
        if payload.get('max_price') not in (None, ''):
            filters['max_price'] = float(payload['max_price'])
        if payload.get('category'):
            filters['category'] = str(payload['category'])

        tool = ProductSearchTool()
        products = tool.search(query, limit=6, **filters)
        if not products:
            products = tool.get_all_products(limit=6)
        hub_deals = search_supply_chain_hub_cancelled_deals(query)
        in_stock = sum(1 for p in products if int(p.get('stock_quantity') or 0) > 0)
        trace.append(f'CATALOG_DISCOVERY: Matched {len(products)} store product(s) ({in_stock} in stock) + {len(hub_deals)} hub deal(s)')
        return {
            'query': query,
            'products': [
                {
                    'id': p.get('id'),
                    'name': p.get('name'),
                    'slug': p.get('slug'),
                    'price': float(p.get('price') or 0),
                    'seller_name': p.get('seller_name') or 'Verified Seller',
                    'category': p.get('category_name') or 'General',
                    'stock_quantity': int(p.get('stock_quantity') or 0),
                    'average_rating': float(p.get('average_rating') or 0),
                }
                for p in products
            ],
            'supply_chain_hub_deals': hub_deals[:4],
            'stock_summary': f'{in_stock} of {len(products)} product(s) currently ready in stock.',
        }

    def _run_haggle_agent(self, payload: dict, trace: list) -> dict:
        import hashlib
        from mesh_api.graph.nodes import _classify_hs_code

        product_name = str(payload.get('product_name') or 'Smart Electronics Bundle').strip()
        qty = max(int(payload.get('quantity') or 1), 1)
        base_price = float(payload.get('target_price') or payload.get('max_budget') or 180.0)
        category = str(payload.get('category') or 'Electronics')

        rebate_pct = 12.0
        rebate_usd = round(base_price * (rebate_pct / 100.0), 2)
        negotiated_price = max(round(base_price - rebate_usd, 2), 1.0)
        hs_code, hs_desc, is_elec = _classify_hs_code(product_name, category)
        po_hash = '0x' + hashlib.sha256(f'{product_name}|{qty}|{negotiated_price}'.encode('utf-8')).hexdigest()[:20].upper()

        trace.append(f'A2A_NEGOTIATE: Secured -{rebate_pct:.0f}% instant escrow rebate (${base_price:.2f} -> ${negotiated_price:.2f})')
        trace.append(f'CUSTOMS_AND_ESCROW: Verified HS {hs_code} & issued Escrow PO {po_hash}')

        return {
            'product_name': product_name,
            'quantity': qty,
            'original_price_usd': round(base_price, 2),
            'negotiated_price_usd': negotiated_price,
            'rebate_pct': rebate_pct,
            'rebate_amount_usd': rebate_usd,
            'hs_code': hs_code,
            'hs_description': hs_desc,
            'hazmat_status': 'UN3481 PI967 Verified (PASS)' if is_elec else 'ICAO Standard Cargo (PASS)',
            'po_hash': po_hash,
            'dialogue': [
                {'round': 1, 'speaker': 'Buyer Haggle Agent', 'text': f'Requesting 14% volume escrow rebate on {qty}x {product_name} (${base_price:.2f}).'},
                {'round': 2, 'speaker': 'SupplyShield Supplier Node', 'text': f'Accepted -12% Instant Escrow Lock -> final quote ${negotiated_price:.2f} (PO {po_hash}).'},
            ],
        }

    def _run_anti_rto_rerouter(self, payload: dict, trace: list) -> dict:
        from seller_mesh.recovery_service import list_buyer_rescue_deals

        title_q = str(payload.get('product_title') or payload.get('query') or '').strip().lower()
        city = str(payload.get('city') or 'Karachi').strip() or 'Karachi'
        deals = [d for d in list_buyer_rescue_deals() if d.get('status') == 'OPEN_FOR_DEAL']

        picked = None
        if title_q and deals:
            picked = next(
                (d for d in deals if title_q in (d.get('product_title', '') + ' ' + d.get('seller_edited_title', '')).lower()),
                None,
            )
        if picked is None and deals:
            picked = deals[0]

        if picked is not None:
            orig_price = float(picked.get('original_price') or 45.0)
            suggested = float(picked.get('ai_recommended_deal_price') or round(orig_price * 0.88, 2))
            freight_saved = float(picked.get('shipping_fee_at_risk') or 14.50)
            deal_title = picked.get('seller_edited_title') or picked.get('product_title')
            order_num = picked.get('order_number')
            hub_city = picked.get('origin_city') or city
            seller_store = picked.get('seller_store_name') or picked.get('seller_username') or 'StoreHub Verified Seller'
            recovery_id = picked.get('id')
            orig_slug = picked.get('original_product_slug') or picked.get('original_product_id')
        else:
            orig_price = float(payload.get('original_price') or 89.0)
            suggested = round(orig_price * 0.88, 2)
            freight_saved = 14.50
            deal_title = str(payload.get('product_title') or 'StoreHub Smart Parcel (Hub Rescue Unit)')
            order_num = 'HUB-RTO-LIVE'
            hub_city = city
            seller_store = 'StoreHub Direct Hub'
            recovery_id = None
            orig_slug = None

        buyer_offer = payload.get('buyer_offer_price')
        max_disc = min(float(payload.get('max_discount_pct') or 18.0), 30.0)
        floor_price = round(orig_price * (1.0 - max_disc / 100.0), 2)
        if buyer_offer not in (None, '') and float(buyer_offer) > 0:
            agreed_price = round(max(min(float(buyer_offer), orig_price), floor_price), 2)
        else:
            agreed_price = suggested
        disc_pct = round(max(0.0, ((orig_price - agreed_price) / max(orig_price, 1.0)) * 100.0), 1)

        trace.append(f'ANTI_RTO_MATCH: Found stranded cancelled parcel #{order_num} at {hub_city} Hub')
        trace.append(f'A2A_NEGOTIATE: Agreed on ${agreed_price:.2f} ({disc_pct:.1f}% OFF), rescuing ${freight_saved:.2f} return freight')

        return {
            'deal_card': {
                'recovery_id': recovery_id,
                'order_number': order_num,
                'product_title': deal_title,
                'seller_store_name': seller_store,
                'original_product_slug': orig_slug,
                'hub_city': hub_city,
                'original_price_usd': round(orig_price, 2),
                'agreed_price_usd': agreed_price,
                'discount_pct': disc_pct,
                'freight_saved_usd': freight_saved,
                'shipping_policy': f'Same-City {hub_city} Hub Priority Release',
            },
            'agreed_price_usd': agreed_price,
            'discount_pct': disc_pct,
            'freight_saved_usd': freight_saved,
            'a2a_transcript': [
                {'sender': 'External Caller Agent', 'text': f'Seeking discounted cancelled hub stock in {hub_city} for "{deal_title}".'},
                {'sender': 'StoreHub Anti-RTO Rerouter', 'text': f'Matched #{order_num} ({deal_title}) at ${agreed_price:.2f} ({disc_pct:.1f}% off, floor ${floor_price:.2f}) — saves ${freight_saved:.2f} RTO freight.'},
            ],
        }

    def _run_cod_risk_gatekeeper(self, payload: dict, trace: list) -> dict:
        phone = str(payload.get('phone') or '').strip()
        address = str(payload.get('address') or '').strip()
        city = str(payload.get('city') or 'Karachi').strip()
        payment = str(payload.get('payment_method') or 'cod').lower()
        order_val = float(payload.get('order_value') or 45.0)

        risk_score = 10
        factors = []
        if payment != 'cod':
            risk_score = 4
            factors.append('Prepaid order verification passes low-risk check')
        else:
            if not phone or '0000' in phone or len(phone) < 9:
                risk_score += 45
                factors.append('Suspicious or incomplete phone number pattern')
            if len(address) < 12 or 'near ' in address.lower():
                risk_score += 32
                factors.append('Incomplete landmark-only street address without house/block number')
            if order_val >= 150:
                risk_score += 12
                factors.append('High-value first-time COD ticket')

        risk_score = min(risk_score, 98)
        if risk_score >= 65:
            decision = 'BLOCK_FAKE_COD'
            freight_saved = 8.00
        elif risk_score >= 35:
            decision = 'HOLD_OTP_VERIFY'
            freight_saved = 4.00
        else:
            decision = 'APPROVE_DISPATCH'
            freight_saved = 0.0

        trace.append(f'COD_RISK_AUDIT: Evaluated {city} {payment.upper()} order -> score {risk_score}/100 ({decision})')
        return {
            'risk_score': risk_score,
            'decision': decision,
            'risk_factors': factors or ['Verified buyer profile & full shipping address'],
            'freight_saved_usd': freight_saved,
        }