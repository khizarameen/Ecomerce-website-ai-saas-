from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.utils.text import slugify
from decimal import Decimal
import uuid
import json
import logging

logger = logging.getLogger(__name__)


# ============================================
# USER PROFILE MODEL - BUYER/SELLER SEPARATE
# ============================================

class UserProfile(models.Model):
    """Extended user profile with buyer/seller roles"""
    
    USER_TYPES = [
        ('buyer', 'Buyer'),
        ('seller', 'Seller'),
    ]
    
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE,
        related_name='profile'
    )
    user_type = models.CharField(
        max_length=10,
        choices=USER_TYPES,
        default='buyer'
    )
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True, default='Pakistan')
    postal_code = models.CharField(max_length=20, blank=True)
    profile_picture = models.ImageField(
        upload_to='profiles/',
        blank=True,
        null=True
    )
    bio = models.TextField(blank=True)
    is_email_verified = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    
    # Buyer specific fields
    default_shipping_address = models.JSONField(default=dict, blank=True)
    default_billing_address = models.JSONField(default=dict, blank=True)
    
    # Seller specific fields - ✅ Auto-approved by default
    seller_approved = models.BooleanField(default=True)
    seller_approved_at = models.DateTimeField(null=True, blank=True)
    seller_rejection_reason = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['user_type']),
            models.Index(fields=['seller_approved']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.get_user_type_display()}"
    
    def is_seller(self):
        return self.user_type == 'seller'
    
    def is_buyer(self):
        return self.user_type == 'buyer'


# ============================================
# CORE MODELS
# ============================================

class Category(models.Model):
    """Product categories"""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    parent = models.ForeignKey(
        'self', 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True,
        related_name='subcategories'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name
    
    def get_full_path(self):
        """Get the full hierarchical path of the category"""
        path_parts = []
        current = self
        while current:
            path_parts.insert(0, current.name)
            current = current.parent
        return ' / '.join(path_parts) if path_parts else self.name
    
    def get_absolute_url(self):
        """Get the absolute URL for the category"""
        return f'/categories/{self.slug}/'


# ============================================
# SELLER PROFILE MODEL - WITH OPTIONAL FIELDS
# ============================================

class SellerProfile(models.Model):
    """Seller profile with optional payment details"""
    
    PAYMENT_METHODS = [
        ('bank', 'Bank Transfer'),
        ('jazzcash', 'JazzCash'),
        ('easypaisa', 'EasyPaisa'),
        ('payoneer', 'Payoneer'),
        ('manual', 'Manual/Other'),
    ]
    
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE,
        related_name='seller_payment_profile'
    )
    
    # Store Information
    shop_name = models.CharField(max_length=200)
    shop_description = models.TextField(blank=True)
    
    # Contact Information - Optional
    phone = models.CharField(max_length=20, blank=True, help_text="Contact phone number (optional)")
    email = models.EmailField(blank=True, help_text="Contact email (optional)")
    address = models.TextField(blank=True, help_text="Store address (optional)")
    
    # Payment Method - Optional, can be null
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHODS,
        blank=True,
        null=True,
        help_text="Select payment method (optional)"
    )
    
    # Bank Details - All Optional
    bank_name = models.CharField(max_length=200, blank=True, help_text="Bank name (optional)")
    account_holder = models.CharField(max_length=200, blank=True, help_text="Account holder name (optional)")
    account_number = models.CharField(max_length=100, blank=True, help_text="Account number (optional)")
    iban = models.CharField(max_length=100, blank=True, help_text="IBAN number (optional)")
    
    # Mobile Payment Details - Optional
    mobile_number = models.CharField(max_length=20, blank=True, help_text="Mobile number for JazzCash/EasyPaisa (optional)")
    
    # Payoneer Details - Optional
    payoneer_email = models.EmailField(blank=True, help_text="Payoneer email (optional)")
    
    # Additional Info
    business_registration = models.CharField(max_length=100, blank=True, help_text="Business registration number (optional)")
    tax_id = models.CharField(max_length=50, blank=True, help_text="Tax ID (optional)")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['shop_name']
        indexes = [
            models.Index(fields=['user']),
        ]
    
    def __str__(self):
        return f"{self.shop_name} ({self.user.username})"
    
    def has_payment_details(self):
        """Check if seller has provided any payment details"""
        return (
            self.payment_method or
            self.account_number or
            self.iban or
            self.mobile_number or
            self.payoneer_email
        )
    
    def get_payment_method_display(self):
        """Get payment method display name"""
        if not self.payment_method:
            return "Not Set"
        return dict(self.PAYMENT_METHODS).get(self.payment_method, self.payment_method)


# ============================================
# SELLER MODEL (Legacy - Keep for compatibility)
# ============================================

class Seller(models.Model):
    """Seller/Vendor model - Auto-approved"""
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE,
        related_name='seller_profile'
    )
    store_name = models.CharField(max_length=200)
    store_slug = models.SlugField(max_length=200, unique=True, blank=True)
    store_description = models.TextField(blank=True)
    logo = models.ImageField(upload_to='sellers/logos/', blank=True, null=True)
    banner = models.ImageField(upload_to='sellers/banners/', blank=True, null=True)
    
    # Contact
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    website = models.URLField(blank=True)
    
    # Social Media
    facebook = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    twitter = models.URLField(blank=True)
    youtube = models.URLField(blank=True)
    
    # Business Details
    business_registration = models.CharField(max_length=100, blank=True)
    tax_id = models.CharField(max_length=50, blank=True)
    
    # Ratings
    average_rating = models.DecimalField(
        max_digits=3, 
        decimal_places=2, 
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    total_reviews = models.IntegerField(default=0)
    total_products = models.IntegerField(default=0)
    total_sales = models.IntegerField(default=0)
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Status - ✅ Auto-approved
    is_approved = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['store_name']
        indexes = [
            models.Index(fields=['store_slug']),
            models.Index(fields=['is_approved']),
        ]
    
    def __str__(self):
        return f"{self.store_name} ({self.user.username})"
    
    def get_absolute_url(self):
        return f'/seller/{self.store_slug}/'
    
    def save(self, *args, **kwargs):
        if not self.store_slug:
            base_slug = slugify(self.store_name)
            slug = base_slug
            counter = 1
            while Seller.objects.filter(store_slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.store_slug = slug
        
        if self.user and hasattr(self.user, 'profile'):
            self.user.profile.user_type = 'seller'
            self.user.profile.seller_approved = True
            self.user.profile.seller_approved_at = timezone.now()
            self.user.profile.save()
        super().save(*args, **kwargs)


class Product(models.Model):
    """Main product model with AI description and seller"""
    PRODUCT_TYPES = [
        ('physical', 'Physical'),
        ('digital', 'Digital'),
        ('service', 'Service'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending_review', 'Pending Review'),
        ('published', 'Published'),
        ('out_of_stock', 'Out of Stock'),
        ('discontinued', 'Discontinued'),
    ]
    
    seller = models.ForeignKey(
        Seller,
        on_delete=models.CASCADE,
        related_name='products',
        null=True,
        blank=True
    )
    
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True, blank=True)
    
    description = models.TextField()
    ai_generated_description = models.TextField(blank=True, null=True)
    description_generated_by = models.CharField(max_length=50, blank=True, null=True)
    description_generated_at = models.DateTimeField(null=True, blank=True)
    use_ai_description = models.BooleanField(default=False)
    
    short_description = models.TextField(max_length=500, blank=True)
    ai_short_description = models.TextField(max_length=500, blank=True, null=True)
    
    category = models.ForeignKey(
        Category, 
        on_delete=models.CASCADE,
        related_name='products'
    )
    subcategory = models.ForeignKey(
        Category, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='subcategory_products'
    )
    
    price = models.DecimalField(max_digits=10, decimal_places=2)
    compare_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Original price for discount display"
    )
    cost_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Cost price for profit calculation"
    )
    
    seller_commission = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=0,
        help_text="Commission percentage for seller"
    )
    seller_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Price set by seller"
    )
    
    stock_quantity = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=10)
    sku = models.CharField(max_length=50, unique=True)
    barcode = models.CharField(max_length=50, blank=True, null=True)
    
    product_type = models.CharField(max_length=20, choices=PRODUCT_TYPES, default='physical')
    weight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    dimensions = models.JSONField(default=dict, blank=True)
    
    # Product Images
    main_image = models.ImageField(upload_to='products/', blank=True, null=True)
    gallery_images = models.JSONField(default=list, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    is_featured = models.BooleanField(default=False)
    is_bestseller = models.BooleanField(default=False)
    is_new_arrival = models.BooleanField(default=False)
    
    meta_title = models.CharField(max_length=200, blank=True)
    meta_description = models.TextField(max_length=500, blank=True)
    meta_keywords = models.CharField(max_length=200, blank=True)
    
    average_rating = models.DecimalField(
        max_digits=3, 
        decimal_places=2, 
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    total_reviews = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)
    
    seller_notes = models.TextField(blank=True, help_text="Internal notes for seller")
    admin_notes = models.TextField(blank=True, help_text="Admin notes for product")
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['sku']),
            models.Index(fields=['category', 'status']),
            models.Index(fields=['price']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['seller', 'status']),
        ]

    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Product.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def is_in_stock(self):
        return self.stock_quantity > 0

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.low_stock_threshold

    @property
    def discount_percentage(self):
        if self.compare_price and self.compare_price > self.price:
            discount = ((self.compare_price - self.price) / self.compare_price) * 100
            return round(discount, 2)
        return 0

    @property
    def profit_margin(self):
        if self.cost_price and self.price > self.cost_price:
            margin = ((self.price - self.cost_price) / self.price) * 100
            return round(margin, 2)
        return 0

    @property
    def final_description(self):
        if self.use_ai_description and self.ai_generated_description:
            return self.ai_generated_description
        return self.description

    def update_rating(self):
        reviews = self.reviews.filter(is_approved=True)
        if reviews.exists():
            avg = reviews.aggregate(models.Avg('rating'))['rating__avg']
            self.average_rating = round(avg, 2)
            self.total_reviews = reviews.count()
        else:
            self.average_rating = 0
            self.total_reviews = 0
        self.save()
    
    def generate_ai_description(self):
        try:
            from django.conf import settings
            from ai_agent.llm.groq_client import GroqLLM

            prompt = f"""Generate a compelling product description for:
            Product: {self.name}
            Category: {self.category.name}
            Price: ${self.price}

            Create a detailed, SEO-friendly description highlighting features and benefits.
            Keep it professional and persuasive. Include bullet points for key features.
            """

            llm = GroqLLM()
            description = llm.generate(
                prompt=prompt,
                system_prompt='You are an expert e-commerce copywriter.',
                max_tokens=500,
                temperature=0.7,
            )

            if description and not description.startswith('Error:'):
                self.ai_generated_description = description
                self.description_generated_by = getattr(settings, 'GROQ_MODEL', 'qwen/qwen3.8-27b')
                self.description_generated_at = timezone.now()
                self.use_ai_description = True
                self.save()
                return description
            return None

        except Exception as e:
            logger.error(f"AI description generation error: {e}")
            return None


# ============================================
# PRODUCT IMAGE MODEL (Separate for Gallery)
# ============================================

class ProductImage(models.Model):
    """Product gallery images"""
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE,
        related_name='images'
    )
    image = models.ImageField(upload_to='products/gallery/')
    alt_text = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f"{self.product.name} - Image {self.order}"


class ProductVariant(models.Model):
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE,
        related_name='variants'
    )
    name = models.CharField(max_length=100)
    sku = models.CharField(max_length=50, unique=True)
    price_adjustment = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=0
    )
    stock_quantity = models.IntegerField(default=0)
    attributes = models.JSONField(default=dict)
    image = models.ImageField(upload_to='variants/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.product.name} - {self.name}"

    @property
    def final_price(self):
        return self.product.price + self.price_adjustment


class ProductTag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True)
    products = models.ManyToManyField(Product, related_name='tags', blank=True)

    def __str__(self):
        return self.name


# ============================================
# CART & ORDER MODELS
# ============================================

class Cart(models.Model):
    """Shopping cart with Decimal fixes"""
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE,
        related_name='cart',
        null=True,
        blank=True
    )
    session_id = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['session_id']),
        ]

    def __str__(self):
        return f"Cart {self.id} - {self.user or self.session_id}"

    @property
    def total_items(self):
        total = self.items.aggregate(total=models.Sum('quantity'))['total']
        return total or 0

    @property
    def subtotal(self):
        total = Decimal('0.00')
        for item in self.items.filter(is_active=True):
            total += Decimal(str(item.subtotal))
        return total

    @property
    def tax(self):
        subtotal = self.subtotal
        return self.calculate_tax(subtotal)

    @property
    def shipping(self):
        return self.calculate_shipping()

    @property
    def discount(self):
        return self.calculate_discount()

    @property
    def total(self):
        subtotal = self.subtotal
        tax = self.calculate_tax(subtotal)
        shipping = self.calculate_shipping()
        discount = self.calculate_discount()
        return subtotal + tax + shipping - discount

    def calculate_tax(self, subtotal):
        from decimal import Decimal
        
        if not isinstance(subtotal, Decimal):
            subtotal = Decimal(str(subtotal))
        
        tax_rate = Decimal('0.10')
        return subtotal * tax_rate

    def calculate_shipping(self):
        from decimal import Decimal
        
        if self.total_items > 0:
            return Decimal('5.99')
        return Decimal('0.00')

    def calculate_discount(self):
        from decimal import Decimal
        return Decimal('0.00')

    def clear(self):
        self.items.all().delete()


class CartItem(models.Model):
    cart = models.ForeignKey(
        Cart, 
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE
    )
    variant = models.ForeignKey(
        ProductVariant, 
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    quantity = models.IntegerField(default=1, validators=[MinValueValidator(1)])
    price_at_add = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['cart', 'product', 'variant']]
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    @property
    def subtotal(self):
        from decimal import Decimal
        return Decimal(str(self.price_at_add)) * Decimal(str(self.quantity))


# ============================================
# ORDER MODELS
# ============================================

class Order(models.Model):
    ORDER_STATUS = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('confirmed', 'Confirmed'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
        ('refunded', 'Refunded'),
    ]
    
    PAYMENT_STATUS = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    
    PAYMENT_METHODS = [
        ('stripe', 'Stripe'),
        ('paypal', 'PayPal'),
        ('cod', 'Cash on Delivery'),
        ('bank_transfer', 'Bank Transfer'),
    ]
    
    order_number = models.CharField(max_length=50, unique=True)
    user = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL,
        null=True,
        related_name='orders'
    )
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    
    shipping_address = models.JSONField()
    billing_address = models.JSONField()
    
    items = models.JSONField()
    
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='pending')
    payment_intent_id = models.CharField(max_length=100, blank=True, null=True)
    
    status = models.CharField(max_length=20, choices=ORDER_STATUS, default='pending')
    status_history = models.JSONField(default=list)
    
    tracking_number = models.CharField(max_length=100, blank=True, null=True)
    shipping_carrier = models.CharField(max_length=50, blank=True, null=True)
    estimated_delivery = models.DateField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    
    customer_notes = models.TextField(blank=True)
    admin_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order_number']),
            models.Index(fields=['user']),
            models.Index(fields=['status']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"Order #{self.order_number}"

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = self.generate_order_number()
        super().save(*args, **kwargs)

    def generate_order_number(self):
        timestamp = timezone.now().strftime('%Y%m%d')
        unique_id = str(uuid.uuid4().hex[:6].upper())
        return f"ORD-{timestamp}-{unique_id}"

    def update_status(self, new_status, note=None):
        if new_status != self.status:
            self.status_history.append({
                'from': self.status,
                'to': new_status,
                'timestamp': timezone.now().isoformat(),
                'note': note
            })
            self.status = new_status
            self.save()


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order, 
        on_delete=models.CASCADE,
        related_name='order_items'
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    product_name = models.CharField(max_length=200)
    variant_name = models.CharField(max_length=100, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.IntegerField()
    total = models.DecimalField(max_digits=10, decimal_places=2)
    
    def __str__(self):
        return f"{self.product_name} x {self.quantity}"


# ============================================
# REVIEW & RATING MODELS
# ============================================

class ProductReview(models.Model):
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    order = models.ForeignKey(
        Order, 
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    rating = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    title = models.CharField(max_length=200)
    review = models.TextField()
    images = models.JSONField(default=list, blank=True)
    
    helpful_count = models.IntegerField(default=0)
    reported_count = models.IntegerField(default=0)
    
    is_approved = models.BooleanField(default=False)
    is_verified_purchase = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['product', 'user']]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.product.name} - {self.rating} stars"


class ReviewHelpful(models.Model):
    review = models.ForeignKey(
        ProductReview, 
        on_delete=models.CASCADE,
        related_name='helpful_votes'
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    is_helpful = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['review', 'user']]


# ============================================
# WISHLIST MODEL
# ============================================

class Wishlist(models.Model):
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE,
        related_name='wishlist'
    )
    products = models.ManyToManyField(
        Product, 
        related_name='wishlists',
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Wishlist"

    @property
    def total_items(self):
        return self.products.count()


# ============================================
# COUPON & DISCOUNT MODELS
# ============================================

class Coupon(models.Model):
    DISCOUNT_TYPES = [
        ('percentage', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ]
    
    code = models.CharField(max_length=50, unique=True)
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPES)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    minimum_order = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    maximum_discount = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Maximum discount for percentage coupons"
    )
    usage_limit = models.IntegerField(default=1)
    used_count = models.IntegerField(default=0)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    
    applicable_products = models.ManyToManyField(
        Product, 
        blank=True,
        related_name='applicable_coupons'
    )
    applicable_categories = models.ManyToManyField(
        Category, 
        blank=True,
        related_name='applicable_coupons'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.code

    def is_valid(self):
        now = timezone.now()
        if not self.is_active:
            return False
        if self.used_count >= self.usage_limit:
            return False
        if now < self.valid_from or now > self.valid_to:
            return False
        return True

    def calculate_discount(self, subtotal):
        from decimal import Decimal
        
        if not self.is_valid():
            return Decimal('0')
        
        if not isinstance(subtotal, Decimal):
            subtotal = Decimal(str(subtotal))
        
        if self.discount_type == 'percentage':
            discount = (subtotal * Decimal(str(self.discount_value))) / Decimal('100')
            if self.maximum_discount:
                discount = min(discount, Decimal(str(self.maximum_discount)))
            return discount
        else:
            return min(Decimal(str(self.discount_value)), subtotal)


# ============================================
# AI AGENT MEMORY MODELS
# ============================================

class AgentConversation(models.Model):
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='agent_conversations',
        null=True,
        blank=True
    )
    session_id = models.CharField(max_length=100, db_index=True)
    intent = models.CharField(max_length=50, blank=True)
    messages = models.JSONField(default=list)
    context = models.JSONField(default=dict)
    metadata = models.JSONField(default=dict)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['session_id']),
            models.Index(fields=['user']),
            models.Index(fields=['-updated_at']),
        ]

    def __str__(self):
        return f"Conversation {self.session_id}"

    def add_message(self, role, content, **kwargs):
        message = {
            'role': role,
            'content': content,
            'timestamp': timezone.now().isoformat(),
            **kwargs
        }
        self.messages.append(message)
        self.save()
        return message


class AgentContext(models.Model):
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE,
        related_name='agent_context',
        null=True,
        blank=True
    )
    session_id = models.CharField(max_length=100, unique=True)
    preferences = models.JSONField(default=dict)
    browsing_history = models.JSONField(default=list)
    cart_context = models.JSONField(default=dict)
    previous_intents = models.JSONField(default=list)
    user_profile = models.JSONField(default=dict)
    last_interaction = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['session_id']),
            models.Index(fields=['user']),
        ]

    def __str__(self):
        return f"Context {self.session_id}"


class ProductEmbedding(models.Model):
    product = models.OneToOneField(
        Product, 
        on_delete=models.CASCADE,
        related_name='embedding'
    )
    embedding = models.JSONField()
    model_version = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Embedding for {self.product.name}"


# ============================================
# ANALYTICS MODELS
# ============================================

class UserActivity(models.Model):
    ACTIVITY_TYPES = [
        ('view', 'Product View'),
        ('search', 'Search'),
        ('add_to_cart', 'Add to Cart'),
        ('remove_from_cart', 'Remove from Cart'),
        ('purchase', 'Purchase'),
        ('review', 'Review'),
        ('wishlist', 'Add to Wishlist'),
        ('share', 'Share'),
        ('click', 'Click'),
    ]
    
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='activities',
        null=True,
        blank=True
    )
    session_id = models.CharField(max_length=100)
    activity_type = models.CharField(max_length=20, choices=ACTIVITY_TYPES)
    product = models.ForeignKey(
        Product, 
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    data = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['session_id', '-timestamp']),
            models.Index(fields=['activity_type']),
        ]
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user or self.session_id} - {self.activity_type}"


class ProductAnalytics(models.Model):
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE,
        related_name='analytics'
    )
    views = models.IntegerField(default=0)
    cart_adds = models.IntegerField(default=0)
    purchases = models.IntegerField(default=0)
    revenue = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    conversion_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=0
    )
    average_time_on_page = models.FloatField(default=0)
    last_viewed = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Analytics for {self.product.name}"


# ============================================
# NOTIFICATION MODELS
# ============================================

class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('order_confirmation', 'Order Confirmation'),
        ('order_update', 'Order Update'),
        ('payment_received', 'Payment Received'),
        ('shipping_update', 'Shipping Update'),
        ('promotion', 'Promotion'),
        ('review_reply', 'Review Reply'),
        ('wishlist_alert', 'Wishlist Alert'),
        ('price_drop', 'Price Drop'),
        ('back_in_stock', 'Back in Stock'),
        ('ai_recommendation', 'AI Recommendation'),
        ('seller_approval', 'Seller Approval'),
        ('seller_rejection', 'Seller Rejection'),
    ]
    
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True)
    is_read = models.BooleanField(default=False)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.notification_type}"


# ============================================
# INVENTORY MODELS
# ============================================

class InventoryLog(models.Model):
    CHANGE_TYPES = [
        ('purchase', 'Purchase'),
        ('sale', 'Sale'),
        ('return', 'Return'),
        ('adjustment', 'Adjustment'),
        ('restock', 'Restock'),
        ('damage', 'Damage'),
    ]
    
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE,
        related_name='inventory_logs'
    )
    variant = models.ForeignKey(
        ProductVariant, 
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    change_type = models.CharField(max_length=20, choices=CHANGE_TYPES)
    quantity = models.IntegerField()
    previous_stock = models.IntegerField()
    new_stock = models.IntegerField()
    reason = models.TextField(blank=True)
    reference_id = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.product.name} - {self.change_type} ({self.quantity})"


# ============================================
# STORE SETTINGS MODEL
# ============================================

class StoreSettings(models.Model):
    store_name = models.CharField(max_length=100)
    store_email = models.EmailField()
    store_phone = models.CharField(max_length=20)
    store_address = models.TextField()
    
    tax_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=10.00
    )
    tax_inclusive = models.BooleanField(default=False)
    
    free_shipping_threshold = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=100.00
    )
    standard_shipping_cost = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=5.99
    )
    
    currency = models.CharField(max_length=3, default='USD')
    currency_symbol = models.CharField(max_length=5, default='$')
    
    ai_recommendations_enabled = models.BooleanField(default=True)
    ai_chat_enabled = models.BooleanField(default=True)
    ai_model = models.CharField(max_length=50, default='qwen/qwen3.8-27b')
    
    facebook_url = models.URLField(blank=True)
    instagram_url = models.URLField(blank=True)
    twitter_url = models.URLField(blank=True)
    youtube_url = models.URLField(blank=True)
    
    meta_title = models.CharField(max_length=200, blank=True)
    meta_description = models.TextField(max_length=500, blank=True)
    meta_keywords = models.CharField(max_length=200, blank=True)
    
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.store_name