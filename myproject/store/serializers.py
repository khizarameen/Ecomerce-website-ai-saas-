from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.files.base import ContentFile
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from django.db import models  
import io
import json
from .models import (
    UserProfile, Category, Seller, Product, ProductVariant, ProductImage, ProductTag,
    Cart, CartItem, Order, OrderItem, ProductReview, ReviewHelpful,
    Wishlist, Coupon, AgentConversation, AgentContext, 
    ProductEmbedding, UserActivity, ProductAnalytics,
    Notification, InventoryLog, StoreSettings, SellerProfile  # ✅ Added SellerProfile
)
import logging

logger = logging.getLogger(__name__)


# ============================================
# JWT SERIALIZERS
# ============================================

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['email'] = user.email
        token['full_name'] = user.get_full_name()
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name
        token['is_staff'] = user.is_staff
        token['is_superuser'] = user.is_superuser
        token['user_id'] = user.id
        
        if hasattr(user, 'profile'):
            token['user_type'] = user.profile.user_type
            token['is_seller'] = user.profile.user_type == 'seller'
            token['is_buyer'] = user.profile.user_type == 'buyer'
        else:
            token['user_type'] = 'buyer'
            token['is_seller'] = False
            token['is_buyer'] = True
        
        return token
    
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user_id'] = self.user.id
        data['username'] = self.user.username
        data['email'] = self.user.email
        data['full_name'] = self.user.get_full_name()
        data['first_name'] = self.user.first_name
        data['last_name'] = self.user.last_name
        data['is_staff'] = self.user.is_staff
        data['is_superuser'] = self.user.is_superuser
        
        if hasattr(self.user, 'profile'):
            data['user_type'] = self.user.profile.user_type
            data['is_seller'] = self.user.profile.user_type == 'seller'
            data['is_buyer'] = self.user.profile.user_type == 'buyer'
            data['is_approved'] = True
        else:
            data['user_type'] = 'buyer'
            data['is_seller'] = False
            data['is_buyer'] = True
            data['is_approved'] = True
        
        return data


# ============================================
# USER PROFILE SERIALIZERS
# ============================================

class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    initials = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'user_type', 'phone', 'address', 'city', 'state', 
            'country', 'postal_code', 'profile_picture', 'bio',
            'is_email_verified', 'is_phone_verified',
            'default_shipping_address', 'default_billing_address',
            'seller_approved', 'seller_approved_at', 'seller_rejection_reason',
            'full_name', 'initials', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_full_name(self, obj):
        if obj and hasattr(obj, 'user') and obj.user:
            return obj.user.get_full_name()
        return ''
    
    def get_initials(self, obj):
        if obj and hasattr(obj, 'user') and obj.user:
            user = obj.user
            if user.first_name and user.last_name:
                return f"{user.first_name[0]}{user.last_name[0]}".upper()
            elif user.first_name:
                return user.first_name[0].upper()
            elif user.username:
                return user.username[0].upper()
        return "U"


class UserSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    initials = serializers.SerializerMethodField()
    is_seller = serializers.SerializerMethodField()
    is_buyer = serializers.SerializerMethodField()
    user_type = serializers.SerializerMethodField()
    is_approved = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 
            'full_name', 'initials', 'profile',
            'is_seller', 'is_buyer', 'user_type', 'is_approved',
            'date_joined', 'last_login', 'is_staff', 'is_superuser', 'is_active'
        ]
        read_only_fields = ['id', 'date_joined', 'last_login', 'is_staff', 'is_superuser', 'is_active']
    
    def get_profile(self, obj):
        try:
            if hasattr(obj, 'profile') and obj.profile:
                return UserProfileSerializer(obj.profile).data
            return None
        except:
            return None
    
    def get_full_name(self, obj):
        return obj.get_full_name()
    
    def get_initials(self, obj):
        if obj.first_name and obj.last_name:
            return f"{obj.first_name[0]}{obj.last_name[0]}".upper()
        elif obj.first_name:
            return obj.first_name[0].upper()
        elif obj.username:
            return obj.username[0].upper()
        return "U"
    
    def get_is_seller(self, obj):
        try:
            if hasattr(obj, 'profile') and obj.profile:
                return obj.profile.user_type == 'seller'
            return False
        except:
            return False
    
    def get_is_buyer(self, obj):
        try:
            if hasattr(obj, 'profile') and obj.profile:
                return obj.profile.user_type == 'buyer'
            return True
        except:
            return True
    
    def get_user_type(self, obj):
        try:
            if hasattr(obj, 'profile') and obj.profile:
                return obj.profile.user_type
            return 'buyer'
        except:
            return 'buyer'
    
    def get_is_approved(self, obj):
        return True


# ============================================
class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, required=True)
    email = serializers.EmailField(required=True, validators=[validate_email])
    user_type = serializers.ChoiceField(
        choices=['buyer', 'seller'],
        default='buyer',
        write_only=True
    )
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'user_type'
        ]
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False}
        }
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        if User.objects.filter(email=attrs['email']).exists():
            raise serializers.ValidationError({"email": "Email already exists."})
        if User.objects.filter(username=attrs['username']).exists():
            raise serializers.ValidationError({"username": "Username already exists."})
        return attrs
    
    def create(self, validated_data):
        from django.utils.text import slugify
        
        user_type = validated_data.pop('user_type', 'buyer')
        validated_data.pop('password_confirm')
        
        # ✅ Create user
        user = User.objects.create_user(**validated_data)
        
        # ✅ Create UserProfile (only two roles: buyer & seller — sellers are auto-approved, no admin step)
        UserProfile.objects.create(
            user=user,
            user_type=user_type,
            country='Pakistan',
            seller_approved=True
        )
        
        # ✅ If seller, create seller profile
        if user_type == 'seller':
            base_slug = slugify(user.username + "-store")
            slug = base_slug
            counter = 1
            while Seller.objects.filter(store_slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            
            seller = Seller.objects.create(
                user=user,
                store_name=f"{user.username}'s Store",
                store_slug=slug,
                email=user.email,
                is_approved=True,  # ✅ Auto-approved (no admin role)
                is_active=True
            )
            
            # ✅ Create SellerProfile
            SellerProfile.objects.create(
                user=user,
                shop_name=f"{user.username}'s Store",
                email=user.email,
            )
            
            logger.info(f"✅ Seller account created for: {user.username}")
        
        return user

    

class UserUpdateSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, validators=[validate_email])
    
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name']
    
    def validate_username(self, value):
        if User.objects.filter(username=value).exclude(id=self.instance.id).exists():
            raise serializers.ValidationError("Username already exists.")
        return value
    
    def validate_email(self, value):
        if User.objects.filter(email=value).exclude(id=self.instance.id).exists():
            raise serializers.ValidationError("Email already exists.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(required=True, write_only=True)
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords don't match."})
        return attrs


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)


# ============================================
# SELLER PROFILE SERIALIZER - ALL FIELDS OPTIONAL
# ============================================

class SellerProfileSerializer(serializers.ModelSerializer):
    """
    Seller Profile Serializer - All fields are optional
    Sellers can choose what information to provide
    """
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        source='user', queryset=User.objects.all(), write_only=True
    )
    has_payment_details = serializers.SerializerMethodField()
    payment_method_display = serializers.SerializerMethodField()
    
    class Meta:
        model = SellerProfile
        fields = [
            'id', 'user', 'user_id',
            'shop_name', 'shop_description',
            'phone', 'email', 'address',
            'payment_method', 'payment_method_display',
            'bank_name', 'account_holder', 'account_number', 'iban',
            'mobile_number',
            'payoneer_email',
            'business_registration', 'tax_id',
            'has_payment_details',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'phone': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'address': {'required': False, 'allow_blank': True},
            'payment_method': {'required': False, 'allow_null': True, 'allow_blank': True},
            'bank_name': {'required': False, 'allow_blank': True},
            'account_holder': {'required': False, 'allow_blank': True},
            'account_number': {'required': False, 'allow_blank': True},
            'iban': {'required': False, 'allow_blank': True},
            'mobile_number': {'required': False, 'allow_blank': True},
            'payoneer_email': {'required': False, 'allow_blank': True},
            'business_registration': {'required': False, 'allow_blank': True},
            'tax_id': {'required': False, 'allow_blank': True},
        }
    
    def get_has_payment_details(self, obj):
        """Check if seller has provided any payment details"""
        return obj.has_payment_details()
    
    def get_payment_method_display(self, obj):
        """Get human-readable payment method"""
        return obj.get_payment_method_display()


class SellerProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating seller profile - All fields optional
    """
    class Meta:
        model = SellerProfile
        fields = [
            'shop_name', 'shop_description',
            'phone', 'email', 'address',
            'payment_method',
            'bank_name', 'account_holder', 'account_number', 'iban',
            'mobile_number',
            'payoneer_email',
            'business_registration', 'tax_id',
        ]
        extra_kwargs = {
            'shop_name': {'required': False},
            'shop_description': {'required': False},
            'phone': {'required': False, 'allow_blank': True},
            'email': {'required': False, 'allow_blank': True},
            'address': {'required': False, 'allow_blank': True},
            'payment_method': {'required': False, 'allow_null': True, 'allow_blank': True},
            'bank_name': {'required': False, 'allow_blank': True},
            'account_holder': {'required': False, 'allow_blank': True},
            'account_number': {'required': False, 'allow_blank': True},
            'iban': {'required': False, 'allow_blank': True},
            'mobile_number': {'required': False, 'allow_blank': True},
            'payoneer_email': {'required': False, 'allow_blank': True},
            'business_registration': {'required': False, 'allow_blank': True},
            'tax_id': {'required': False, 'allow_blank': True},
        }
    
    def validate(self, data):
        """Validate that if payment_method is set, at least one payment detail is provided"""
        payment_method = data.get('payment_method')
        
        if payment_method == 'bank':
            if not data.get('account_number') and not data.get('iban'):
                raise serializers.ValidationError({
                    'account_number': 'Bank account number or IBAN is required for bank transfer'
                })
        
        elif payment_method in ['jazzcash', 'easypaisa']:
            if not data.get('mobile_number'):
                raise serializers.ValidationError({
                    'mobile_number': 'Mobile number is required for JazzCash/EasyPaisa'
                })
        
        elif payment_method == 'payoneer':
            if not data.get('payoneer_email'):
                raise serializers.ValidationError({
                    'payoneer_email': 'Payoneer email is required for Payoneer'
                })
        
        return data


# ============================================
# SELLER SERIALIZERS (Legacy)
# ============================================

class SellerSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        source='user', queryset=User.objects.all(), write_only=True
    )
    store_url = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    seller_profile = SellerProfileSerializer(source='user.seller_payment_profile', read_only=True, allow_null=True)
    
    class Meta:
        model = Seller
        fields = [
            'id', 'user', 'user_id', 'store_name', 'store_slug', 
            'store_description', 'logo', 'banner',
            'phone', 'email', 'address', 'website',
            'facebook', 'instagram', 'twitter', 'youtube',
            'business_registration', 'tax_id',
            'average_rating', 'total_reviews', 'total_products', 
            'total_sales', 'total_revenue',
            'is_approved', 'is_active',
            'store_url', 'is_owner',
            'seller_profile',  # ✅ Added seller profile
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'average_rating', 'total_reviews', 'total_products', 
            'total_sales', 'total_revenue', 'created_at', 'updated_at'
        ]
    
    def get_store_url(self, obj):
        return obj.get_absolute_url()
    
    def get_is_owner(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            return obj.user == request.user
        return False


class SellerListSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    store_url = serializers.SerializerMethodField()
    seller_profile = SellerProfileSerializer(source='user.seller_payment_profile', read_only=True, allow_null=True)
    
    class Meta:
        model = Seller
        fields = [
            'id', 'store_name', 'store_slug', 'logo', 'logo_url',
            'average_rating', 'total_reviews', 'total_products',
            'store_url', 'is_active', 'is_approved',
            'seller_profile',  # ✅ Added seller profile
        ]
    
    def get_logo_url(self, obj):
        return obj.logo.url if obj.logo else None
    
    def get_store_url(self, obj):
        return obj.get_absolute_url()


# ============================================
# CATEGORY SERIALIZERS - FIXED
# ============================================

class CategorySerializer(serializers.ModelSerializer):
    subcategories = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    full_path = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = [
            'id', 'name', 'slug', 'description', 'image', 
            'parent', 'subcategories', 'is_active', 
            'product_count', 'full_path', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_subcategories(self, obj):
        if hasattr(obj, 'subcategories') and obj.subcategories.exists():
            return CategorySerializer(obj.subcategories.filter(is_active=True), many=True).data
        return []
    
    def get_product_count(self, obj):
        return obj.products.filter(status='published').count()
    
    def get_full_path(self, obj):
        """Generate full path for category - FIXED: Uses model method if available"""
        if hasattr(obj, 'get_full_path'):
            return obj.get_full_path()
        path_parts = []
        current = obj
        while current:
            path_parts.insert(0, current.name)
            current = current.parent
        return ' / '.join(path_parts) if path_parts else obj.name


class CategoryListSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image', 'product_count']


# ============================================
# PRODUCT SERIALIZERS WITH IMAGES
# ============================================

class ProductVariantSerializer(serializers.ModelSerializer):
    final_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    is_in_stock = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = ProductVariant
        fields = [
            'id', 'name', 'sku', 'price_adjustment', 'stock_quantity',
            'attributes', 'image', 'is_active', 'final_price', 'is_in_stock'
        ]
        read_only_fields = ['id']
    
    def get_is_in_stock(self, obj):
        return obj.stock_quantity > 0


class ProductImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'image_url', 'alt_text', 'is_primary', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_image_url(self, obj):
        return obj.image.url if obj.image else None


class ProductTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTag
        fields = ['id', 'name', 'slug']


class ProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    seller_name = serializers.CharField(source='seller.store_name', read_only=True, allow_null=True)
    seller_slug = serializers.CharField(source='seller.store_slug', read_only=True, allow_null=True)
    main_image_url = serializers.SerializerMethodField()
    discount_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    is_in_stock = serializers.BooleanField(read_only=True)
    final_description = serializers.CharField(read_only=True)
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'main_image', 'main_image_url', 
            'price', 'compare_price', 'discount_percentage', 
            'stock_quantity', 'status', 'short_description', 'sku',
            'average_rating', 'total_reviews', 
            'category', 'category_name', 
            'seller', 'seller_name', 'seller_slug',
            'is_in_stock', 'is_featured', 'is_bestseller', 'is_new_arrival',
            'final_description', 'created_at'
        ]
    
    def get_main_image_url(self, obj):
        return obj.main_image.url if obj.main_image else None


class ProductDetailSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    seller = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    related_products = serializers.SerializerMethodField()
    specifications = serializers.SerializerMethodField()
    main_image_url = serializers.SerializerMethodField()
    final_description = serializers.CharField(read_only=True)
    
    is_in_stock = serializers.BooleanField(read_only=True)
    discount_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    profit_margin = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'description', 'short_description',
            'ai_generated_description', 'use_ai_description', 'final_description',
            'description_generated_by', 'description_generated_at',
            'category', 'subcategory', 'seller',
            'price', 'compare_price', 'cost_price',
            'seller_commission', 'seller_price',
            'discount_percentage', 'profit_margin',
            'stock_quantity', 'is_in_stock', 'low_stock_threshold',
            'sku', 'barcode', 'product_type',
            'weight', 'dimensions',
            'main_image', 'main_image_url', 'images', 'variants', 'tags',
            'status', 'is_featured', 'is_bestseller', 'is_new_arrival',
            'average_rating', 'total_reviews',
            'meta_title', 'meta_description', 'meta_keywords',
            'seller_notes', 'admin_notes',
            'related_products', 'specifications',
            'created_at', 'updated_at', 'published_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'published_at']
    
    def get_category(self, obj):
        try:
            if obj and hasattr(obj, 'category') and obj.category:
                return CategorySerializer(obj.category).data
            return None
        except Exception as e:
            logger.error(f"Error getting category: {e}")
            return None
    
    def get_seller(self, obj):
        try:
            if obj and hasattr(obj, 'seller') and obj.seller:
                return SellerListSerializer(obj.seller).data
            return None
        except Exception as e:
            logger.error(f"Error getting seller: {e}")
            return None
    
    def get_variants(self, obj):
        try:
            if obj and hasattr(obj, 'variants'):
                return ProductVariantSerializer(obj.variants.all(), many=True).data
            return []
        except Exception as e:
            logger.error(f"Error getting variants: {e}")
            return []
    
    def get_images(self, obj):
        try:
            if obj and hasattr(obj, 'images'):
                return ProductImageSerializer(obj.images.all(), many=True).data
            return []
        except Exception as e:
            logger.error(f"Error getting images: {e}")
            return []
    
    def get_tags(self, obj):
        try:
            if obj and hasattr(obj, 'tags'):
                return ProductTagSerializer(obj.tags.all(), many=True).data
            return []
        except Exception as e:
            logger.error(f"Error getting tags: {e}")
            return []
    
    def get_main_image_url(self, obj):
        try:
            if obj and hasattr(obj, 'main_image') and obj.main_image:
                return obj.main_image.url
            return None
        except Exception as e:
            logger.error(f"Error getting main image URL: {e}")
            return None
    
    def get_related_products(self, obj):
        try:
            if obj and hasattr(obj, 'category') and obj.category:
                related = Product.objects.filter(
                    category=obj.category,
                    status='published'
                ).exclude(id=obj.id)[:10]
                return ProductListSerializer(related, many=True).data
            return []
        except Exception as e:
            logger.error(f"Error getting related products: {e}")
            return []
    
    def get_specifications(self, obj):
        specs = {}
        try:
            if obj and hasattr(obj, 'description') and obj.description:
                lines = obj.description.split('\n')
                for line in lines:
                    if ':' in line and len(line.split(':', 1)) == 2:
                        key, value = line.split(':', 1)
                        specs[key.strip()] = value.strip()
        except Exception as e:
            logger.error(f"Error getting specifications: {e}")
        return specs


def generate_product_cover_png(title: str, subtitle: str = '', accent_index: int = 0) -> ContentFile:
    """Generate a clean 600x600 PNG product cover in memory when no image file is uploaded."""
    from PIL import Image, ImageDraw, ImageFont

    palettes = [
        ((15, 23, 42), (37, 99, 235), (96, 165, 250)),
        ((24, 24, 27), (124, 58, 237), (192, 132, 252)),
        ((6, 78, 59), (16, 185, 129), (110, 231, 183)),
        ((30, 41, 59), (14, 165, 233), (125, 211, 252)),
        ((67, 20, 7), (234, 88, 12), (253, 186, 116)),
        ((49, 46, 129), (79, 70, 229), (165, 180, 252)),
    ]
    bg, accent, highlight = palettes[abs(accent_index) % len(palettes)]
    img = Image.new('RGB', (600, 600), bg)
    draw = ImageDraw.Draw(img)

    # Layered geometric card motif
    draw.rectangle([24, 24, 576, 576], outline=accent, width=4)
    draw.ellipse([140, 90, 460, 410], fill=accent, outline=highlight, width=4)
    draw.rounded_rectangle([195, 165, 405, 335], radius=24, fill=bg, outline=highlight, width=3)

    font_title = ImageFont.load_default()
    clean_title = (title or 'StoreHub Product').strip()[:28]
    clean_sub = (subtitle or 'StoreHub Catalog').strip()[:32]
    initials = ''.join(part[0].upper() for part in clean_title.split()[:2]) or 'SH'

    draw.text((285, 240), initials, fill=highlight, font=font_title)
    draw.rounded_rectangle([54, 435, 546, 535], radius=14, fill=(15, 23, 42), outline=highlight, width=2)
    draw.text((78, 462), clean_title, fill=(255, 255, 255), font=font_title)
    draw.text((78, 495), clean_sub, fill=highlight, font=font_title)

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    safe_name = ''.join(ch if ch.isalnum() else '-' for ch in clean_title.lower()).strip('-') or 'product'
    return ContentFile(buf.getvalue(), name=f'{safe_name[:40]}-cover.png')


class ProductCreateUpdateSerializer(serializers.ModelSerializer):
    variants = ProductVariantSerializer(many=True, required=False)
    images = ProductImageSerializer(many=True, required=False)
    tags = serializers.ListField(
        child=serializers.CharField(), 
        required=False,
        write_only=True  # ✅ CRITICAL FIX
    )
    generate_ai_description = serializers.BooleanField(default=False, required=False)
    main_image = serializers.ImageField(required=False, allow_null=True)
    
    class Meta:
        model = Product
        fields = [
            'name', 'slug', 'description', 'short_description',
            'category', 'subcategory', 'seller',
            'price', 'compare_price', 'cost_price',
            'seller_commission', 'seller_price',
            'stock_quantity', 'low_stock_threshold',
            'sku', 'barcode', 'product_type',
            'weight', 'dimensions',
            'main_image', 'variants', 'images', 'tags',
            'status', 'is_featured', 'is_bestseller', 'is_new_arrival',
            'meta_title', 'meta_description', 'meta_keywords',
            'seller_notes', 'admin_notes',
            'generate_ai_description'
        ]
        extra_kwargs = {
            'tags': {'write_only': True},
            # Seller is always taken from the logged-in user (never trusted from the client)
            'seller': {'read_only': True},
            'admin_notes': {'read_only': True},
            'description': {'required': False, 'allow_blank': True},
            'slug': {'required': False, 'allow_blank': True},
            'sku': {'required': False},
            'status': {'required': False},
        }
    
    def validate_sku(self, value):
        if Product.objects.filter(sku=value).exclude(id=self.instance.id if self.instance else None).exists():
            raise serializers.ValidationError("SKU already exists.")
        return value
    
    def validate_slug(self, value):
        if value and Product.objects.filter(slug=value).exclude(id=self.instance.id if self.instance else None).exists():
            # Silently make slug unique instead of failing the seller's form
            from django.utils.text import slugify
            import uuid
            return f"{slugify(value)[:180]}-{uuid.uuid4().hex[:6]}"
        return value
    
    def validate_seller(self, value):
        request = self.context.get('request')
        if request and request.user:
            if not hasattr(request.user, 'seller_profile'):
                raise serializers.ValidationError("You are not a registered seller.")
        return value
    
    @transaction.atomic
    def create(self, validated_data):
        generate_ai = validated_data.pop('generate_ai_description', False)
        variants_data = validated_data.pop('variants', [])
        images_data = validated_data.pop('images', [])
        tags_data = validated_data.pop('tags', [])
        main_image = validated_data.pop('main_image', None)
        
        validated_data.setdefault('description', '')
        if not validated_data.get('sku'):
            import uuid
            validated_data['sku'] = f"SKU-{uuid.uuid4().hex[:10].upper()}"
        if not validated_data.get('status'):
            validated_data['status'] = 'published'
        if validated_data.get('status') == 'published':
            validated_data.setdefault('published_at', timezone.now())
        
        if 'slug' not in validated_data or not validated_data.get('slug'):
            from django.utils.text import slugify
            base_slug = slugify(validated_data.get('name', ''))
            slug = base_slug
            counter = 1
            while Product.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            validated_data['slug'] = slug
        
        product = Product.objects.create(**validated_data)
        
        if main_image:
            product.main_image = main_image
            product.save()
        else:
            cat_name = product.category.name if product.category_id else 'StoreHub'
            cover = generate_product_cover_png(product.name, cat_name, accent_index=product.id or 0)
            product.main_image.save(cover.name, cover, save=True)
        
        for variant_data in variants_data:
            ProductVariant.objects.create(product=product, **variant_data)
        
        for image_data in images_data:
            ProductImage.objects.create(product=product, **image_data)
        
        for tag_name in tags_data:
            if tag_name and tag_name.strip():
                tag, _ = ProductTag.objects.get_or_create(name=tag_name.strip())
                product.tags.add(tag)
        
        if generate_ai and product.name:
            product.generate_ai_description()
        
        return product
    
    @transaction.atomic
    def update(self, instance, validated_data):
        generate_ai = validated_data.pop('generate_ai_description', False)
        variants_data = validated_data.pop('variants', [])
        images_data = validated_data.pop('images', [])
        tags_data = validated_data.pop('tags', [])
        main_image = validated_data.pop('main_image', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        if main_image:
            instance.main_image = main_image
        
        instance.save()
        
        if variants_data:
            instance.variants.all().delete()
            for variant_data in variants_data:
                ProductVariant.objects.create(product=instance, **variant_data)
        
        if images_data:
            instance.images.all().delete()
            for image_data in images_data:
                ProductImage.objects.create(product=instance, **image_data)
        
        if tags_data:
            instance.tags.clear()
            for tag_name in tags_data:
                if tag_name and tag_name.strip():
                    tag, _ = ProductTag.objects.get_or_create(name=tag_name.strip())
                    instance.tags.add(tag)
        
        if generate_ai:
            instance.generate_ai_description()
        
        return instance
# ============================================
# CART SERIALIZERS
# ============================================

class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_slug = serializers.CharField(source='product.slug', read_only=True)
    product_image = serializers.SerializerMethodField()
    variant_name = serializers.CharField(source='variant.name', read_only=True, allow_null=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    max_quantity = serializers.SerializerMethodField()
    
    class Meta:
        model = CartItem
        fields = [
            'id', 'product', 'product_name', 'product_slug', 'product_image',
            'variant', 'variant_name', 'quantity', 'price_at_add', 
            'subtotal', 'max_quantity', 'is_active', 'added_at'
        ]
        read_only_fields = ['id', 'price_at_add', 'added_at']
    
    def get_product_image(self, obj):
        return obj.product.main_image.url if obj.product.main_image else None
    
    def get_max_quantity(self, obj):
        return obj.variant.stock_quantity if obj.variant else obj.product.stock_quantity


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    tax = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    shipping = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    
    class Meta:
        model = Cart
        fields = [
            'id', 'user', 'items', 'total_items', 
            'subtotal', 'tax', 'shipping', 'discount', 'total',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=False)
    product = serializers.IntegerField(required=False, write_only=True)
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(required=True, min_value=1, max_value=999)
    
    def validate(self, data):
        pid = data.get('product_id') or data.get('product')
        if not pid:
            raise serializers.ValidationError({"product_id": "This field is required."})
        data['product_id'] = pid

        product = Product.objects.filter(id=pid).exclude(status='discontinued').first()
        if not product:
            raise serializers.ValidationError({"product_id": "Product not found or not available."})
        
        if data.get('variant_id'):
            variant = ProductVariant.objects.filter(id=data['variant_id'], product=product, is_active=True).first()
            if not variant:
                raise serializers.ValidationError({"variant_id": "Variant not found."})
            if variant.stock_quantity < data['quantity']:
                raise serializers.ValidationError({"quantity": f"Only {variant.stock_quantity} items in stock."})
        else:
            if product.stock_quantity < data['quantity']:
                raise serializers.ValidationError({"quantity": f"Only {product.stock_quantity} items in stock."})
        
        return data


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(required=True, min_value=0)


# ============================================
# ORDER SERIALIZERS
# ============================================

class OrderItemSerializer(serializers.ModelSerializer):
    product_image = serializers.SerializerMethodField()
    
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'variant_name', 'product_image', 'price', 'quantity', 'total']
    
    def get_product_image(self, obj):
        return obj.product.main_image.url if obj.product and obj.product.main_image else None


class OrderListSerializer(serializers.ModelSerializer):
    total_items = serializers.SerializerMethodField()
    items_preview = serializers.SerializerMethodField()
    user_name = serializers.CharField(source='user.username', read_only=True, allow_null=True)
    order_items = OrderItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'user_name', 'email', 'phone',
            'shipping_address', 'customer_notes', 'total',
            'status', 'payment_status', 'payment_method',
            'total_items', 'items_preview', 'order_items',
            'created_at', 'updated_at'
        ]
    
    def get_total_items(self, obj):
        if obj.order_items.exists():
            return sum(oi.quantity for oi in obj.order_items.all())
        return sum(item.get('quantity', 0) for item in obj.items) if obj.items else 0
    
    def get_items_preview(self, obj):
        if obj.order_items.exists():
            return [f"{oi.product_name} (x{oi.quantity})" for oi in obj.order_items.all()[:4]]
        return [item.get('product_name', '') for item in obj.items[:4]] if obj.items else []


class OrderDetailSerializer(serializers.ModelSerializer):
    order_items = OrderItemSerializer(many=True, read_only=True)
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'user', 'email', 'phone',
            'shipping_address', 'billing_address',
            'items', 'order_items',
            'subtotal', 'tax', 'shipping_cost', 'discount', 'total',
            'payment_method', 'payment_status', 'payment_intent_id',
            'status', 'status_history',
            'tracking_number', 'shipping_carrier', 'estimated_delivery',
            'customer_notes', 'admin_notes',
            'created_at', 'updated_at', 'paid_at', 'shipped_at', 'delivered_at'
        ]
        read_only_fields = ['id', 'order_number', 'created_at', 'updated_at']


class CreateOrderSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    phone = serializers.CharField(required=True, max_length=20)
    shipping_address = serializers.JSONField(required=True)
    billing_address = serializers.JSONField(required=False)
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHODS, required=True)
    customer_notes = serializers.CharField(required=False, allow_blank=True)
    coupon_code = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        shipping_address = data.get('shipping_address')
        required_fields = ['name', 'address', 'city', 'state', 'postal_code', 'country']
        for field in required_fields:
            if field not in shipping_address:
                raise serializers.ValidationError({"shipping_address": f"Field '{field}' is required."})
        
        if data.get('coupon_code'):
            coupon = Coupon.objects.filter(code=data['coupon_code']).first()
            if not coupon or not coupon.is_valid():
                raise serializers.ValidationError({"coupon_code": "Invalid or expired coupon."})
        
        return data


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.ORDER_STATUS, required=True)
    note = serializers.CharField(required=False, allow_blank=True)
    tracking_number = serializers.CharField(required=False, allow_blank=True)
    shipping_carrier = serializers.CharField(required=False, allow_blank=True)
    cancel_photo = serializers.ImageField(required=False, allow_null=True)


# ============================================
# REVIEW SERIALIZERS
# ============================================

class ReviewSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)
    is_owner = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductReview
        fields = [
            'id', 'product', 'user', 'user_name', 'order',
            'rating', 'title', 'review', 'images',
            'helpful_count', 'is_approved', 
            'is_verified_purchase', 'is_owner', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'helpful_count', 'is_approved', 'created_at', 'updated_at']
    
    def get_is_owner(self, obj):
        request = self.context.get('request')
        return obj.user == request.user if request and hasattr(request, 'user') else False


class CreateReviewSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    product_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = ProductReview
        fields = ['product', 'product_id', 'order', 'rating', 'title', 'review', 'images']
        extra_kwargs = {
            'order': {'required': False, 'allow_null': True},
            'images': {'required': False},
        }

    def validate(self, data):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            raise serializers.ValidationError("User not authenticated.")

        product = data.get('product')
        raw_product_id = data.pop('product_id', None)
        if not product and raw_product_id is not None:
            product = Product.objects.filter(id=raw_product_id).first()
            if not product:
                raise serializers.ValidationError({'product_id': 'Product not found.'})
            data['product'] = product

        if not product:
            raise serializers.ValidationError({'product': 'Product is required.'})

        return data

    def create(self, validated_data):
        request = self.context.get('request')
        product = validated_data['product']
        has_purchased = OrderItem.objects.filter(order__user=request.user, product=product).exists()
        review, _ = ProductReview.objects.update_or_create(
            product=product,
            user=request.user,
            defaults={
                'order': validated_data.get('order'),
                'rating': validated_data['rating'],
                'title': validated_data['title'],
                'review': validated_data['review'],
                'images': validated_data.get('images', []),
                'is_verified_purchase': has_purchased,
                'is_approved': True,
            },
        )
        product.update_rating()
        return review


# ============================================
# WISHLIST SERIALIZERS
# ============================================

class WishlistSerializer(serializers.ModelSerializer):
    products = ProductListSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Wishlist
        fields = ['id', 'user', 'products', 'total_items', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class WishlistItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    
    def validate_product_id(self, value):
        if not Product.objects.filter(id=value, status='published').exists():
            raise serializers.ValidationError("Product not found.")
        return value


# ============================================
# COUPON SERIALIZERS
# ============================================

class CouponSerializer(serializers.ModelSerializer):
    is_valid = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Coupon
        fields = [
            'id', 'code', 'discount_type', 'discount_value',
            'minimum_order', 'maximum_discount', 'usage_limit', 'used_count',
            'valid_from', 'valid_to', 'is_active', 'is_valid',
            'created_at'
        ]
        read_only_fields = ['id', 'used_count', 'created_at']


class CouponValidateSerializer(serializers.Serializer):
    code = serializers.CharField(required=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, required=True, min_value=0)
    
    def validate(self, data):
        coupon = Coupon.objects.filter(code=data['code']).first()
        if not coupon:
            raise serializers.ValidationError({"code": "Coupon not found."})
        if not coupon.is_valid():
            raise serializers.ValidationError({"code": "Coupon is invalid or expired."})
        if data['subtotal'] < coupon.minimum_order:
            raise serializers.ValidationError({"subtotal": f"Minimum order of {coupon.minimum_order} required."})
        return data


# ============================================
# AI AGENT SERIALIZERS
# ============================================

class AgentConversationSerializer(serializers.ModelSerializer):
    message_count = serializers.IntegerField(read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True, allow_null=True)
    
    class Meta:
        model = AgentConversation
        fields = [
            'id', 'user', 'user_name', 'session_id', 'intent', 
            'messages', 'message_count', 'context', 'metadata',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AgentContextSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentContext
        fields = [
            'id', 'user', 'session_id', 'preferences', 
            'browsing_history', 'cart_context', 'previous_intents',
            'user_profile', 'last_interaction'
        ]
        read_only_fields = ['id', 'last_interaction']


class AgentChatSerializer(serializers.Serializer):
    message = serializers.CharField(required=True)
    session_id = serializers.CharField(required=False)
    context = serializers.JSONField(required=False)
    
    def validate_message(self, value):
        if not value or len(value.strip()) == 0:
            raise serializers.ValidationError("Message cannot be empty.")
        if len(value) > 5000:
            raise serializers.ValidationError("Message too long (max 5000 characters).")
        return value


# ============================================
# ANALYTICS SERIALIZERS
# ============================================

class UserActivitySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True, allow_null=True)
    
    class Meta:
        model = UserActivity
        fields = [
            'id', 'user', 'user_name', 'session_id',
            'activity_type', 'product', 'product_name',
            'data', 'timestamp', 'ip_address', 'user_agent'
        ]
        read_only_fields = ['id', 'timestamp']


class ProductAnalyticsSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    conversion_rate_percent = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductAnalytics
        fields = [
            'id', 'product', 'product_name',
            'views', 'cart_adds', 'purchases', 'revenue',
            'conversion_rate', 'conversion_rate_percent',
            'average_time_on_page', 'last_viewed', 'updated_at'
        ]
        read_only_fields = ['id', 'updated_at']
    
    def get_conversion_rate_percent(self, obj):
        return obj.conversion_rate * 100


# ============================================
# NOTIFICATION SERIALIZERS
# ============================================

class NotificationSerializer(serializers.ModelSerializer):
    time_ago = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'title', 'message', 
            'link', 'is_read', 'data', 'time_ago', 
            'created_at', 'read_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_time_ago(self, obj):
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        diff = now - obj.created_at
        
        if diff < timedelta(minutes=1):
            return "Just now"
        elif diff < timedelta(hours=1):
            return f"{int(diff.total_seconds() / 60)} minute{'s' if int(diff.total_seconds() / 60) > 1 else ''} ago"
        elif diff < timedelta(days=1):
            return f"{int(diff.total_seconds() / 3600)} hour{'s' if int(diff.total_seconds() / 3600) > 1 else ''} ago"
        elif diff < timedelta(days=7):
            return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
        else:
            return obj.created_at.strftime("%b %d, %Y")


class NotificationMarkReadSerializer(serializers.Serializer):
    notification_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    mark_all = serializers.BooleanField(default=False)
    
    def validate(self, data):
        if not data.get('notification_ids') and not data.get('mark_all'):
            raise serializers.ValidationError("Either notification_ids or mark_all must be provided.")
        return data


# ============================================
# INVENTORY SERIALIZERS
# ============================================

class InventoryLogSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    variant_name = serializers.CharField(source='variant.name', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    
    class Meta:
        model = InventoryLog
        fields = [
            'id', 'product', 'product_name', 'variant', 'variant_name',
            'change_type', 'quantity', 'previous_stock', 'new_stock',
            'reason', 'reference_id', 'created_by', 'created_by_name',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class StockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(required=True)
    change_type = serializers.ChoiceField(choices=InventoryLog.CHANGE_TYPES, required=True)
    reason = serializers.CharField(required=False, allow_blank=True)
    reference_id = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        product = Product.objects.filter(id=data['product_id']).first()
        if not product:
            raise serializers.ValidationError({"product_id": "Product not found."})
        
        if data.get('variant_id'):
            variant = ProductVariant.objects.filter(id=data['variant_id'], product=product).first()
            if not variant:
                raise serializers.ValidationError({"variant_id": "Variant not found."})
        
        return data


# ============================================
# STORE SETTINGS SERIALIZER
# ============================================

class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = [
            'id', 'store_name', 'store_email', 'store_phone', 'store_address',
            'tax_rate', 'tax_inclusive',
            'free_shipping_threshold', 'standard_shipping_cost',
            'currency', 'currency_symbol',
            'ai_recommendations_enabled', 'ai_chat_enabled', 'ai_model',
            'facebook_url', 'instagram_url', 'twitter_url', 'youtube_url',
            'meta_title', 'meta_description', 'meta_keywords',
            'updated_at'
        ]
        read_only_fields = ['id', 'updated_at']


# ============================================
# SEARCH SERIALIZERS
# ============================================

class SearchSerializer(serializers.Serializer):
    query = serializers.CharField(required=True, min_length=2)
    category = serializers.IntegerField(required=False)
    min_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0)
    max_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0)
    rating = serializers.IntegerField(required=False, min_value=1, max_value=5)
    sort_by = serializers.ChoiceField(
        choices=['relevance', 'price_low', 'price_high', 'rating', 'newest', 'popular'],
        default='relevance'
    )
    limit = serializers.IntegerField(default=20, min_value=1, max_value=100)
    offset = serializers.IntegerField(default=0, min_value=0)


# ============================================
# RESPONSE SERIALIZERS
# ============================================

class ResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True)
    message = serializers.CharField(required=False)
    data = serializers.JSONField(required=False)
    errors = serializers.JSONField(required=False)
    timestamp = serializers.DateTimeField(read_only=True)


class PaginatedResponseSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = serializers.ListField()


# ============================================
# BUYER/SELLER SPECIFIC SERIALIZERS
# ============================================

class BuyerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    total_orders = serializers.SerializerMethodField()
    total_wishlist = serializers.SerializerMethodField()
    total_reviews = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'full_name', 'phone', 'address', 'city', 
            'state', 'country', 'postal_code', 'profile_picture',
            'default_shipping_address', 'default_billing_address',
            'total_orders', 'total_wishlist', 'total_reviews',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_full_name(self, obj):
        if obj and hasattr(obj, 'user') and obj.user:
            return obj.user.get_full_name()
        return ''
    
    def get_total_orders(self, obj):
        if obj and hasattr(obj, 'user') and obj.user:
            return Order.objects.filter(user=obj.user).count()
        return 0
    
    def get_total_wishlist(self, obj):
        if obj and hasattr(obj, 'user') and obj.user:
            if hasattr(obj.user, 'wishlist'):
                return obj.user.wishlist.total_items
        return 0
    
    def get_total_reviews(self, obj):
        if obj and hasattr(obj, 'user') and obj.user:
            return ProductReview.objects.filter(user=obj.user).count()
        return 0


class SellerDashboardSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    total_orders = serializers.SerializerMethodField()
    total_revenue = serializers.SerializerMethodField()
    recent_orders = serializers.SerializerMethodField()
    store_url = serializers.SerializerMethodField()
    seller_profile = SellerProfileSerializer(source='user.seller_payment_profile', read_only=True, allow_null=True)
    
    class Meta:
        model = Seller
        fields = [
            'id', 'user', 'store_name', 'store_slug', 'logo', 'banner',
            'total_products', 'total_sales', 'total_revenue',
            'total_orders', 'average_rating', 'total_reviews',
            'is_approved', 'is_active',
            'recent_orders', 'store_url',
            'seller_profile',  # ✅ Added seller profile
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_total_orders(self, obj):
        try:
            from .models import OrderItem
            product_ids = obj.products.values_list('id', flat=True)
            order_ids = OrderItem.objects.filter(
                product_id__in=product_ids
            ).values_list('order_id', flat=True).distinct()
            return order_ids.count()
        except:
            return 0
    
    def get_total_revenue(self, obj):
        try:
            from .models import OrderItem
            from django.db.models import Sum
            product_ids = obj.products.values_list('id', flat=True)
            total = OrderItem.objects.filter(
                product_id__in=product_ids
            ).aggregate(total=Sum('total'))['total']
            return total or Decimal('0.00')
        except:
            return Decimal('0.00')
    
    def get_recent_orders(self, obj):
        try:
            from .models import OrderItem, Order
            product_ids = obj.products.values_list('id', flat=True)
            order_ids = OrderItem.objects.filter(
                product_id__in=product_ids
            ).values_list('order_id', flat=True).distinct()[:5]
            orders = Order.objects.filter(id__in=order_ids)
            return OrderListSerializer(orders, many=True).data
        except:
            return []
    
    def get_store_url(self, obj):
        return obj.get_absolute_url()