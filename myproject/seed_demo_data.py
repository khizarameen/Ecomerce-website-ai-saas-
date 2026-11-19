"""Idempotent seed script for StoreHub demo buyer, demo seller, published catalog, and sample orders."""

import os
import sys
from decimal import Decimal
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

import django  # noqa: E402

django.setup()

from django.contrib.auth.models import User  # noqa: E402
from django.utils import timezone  # noqa: E402
from store.models import (  # noqa: E402
    Category,
    Order,
    OrderItem,
    Product,
    Seller,
    SellerProfile,
    UserProfile,
)
from store.serializers import generate_product_cover_png  # noqa: E402


CATEGORIES = [
    ('Electronics', 'electronics', 'Laptops, smartphones, studio gear, audio, and smart accessories.'),
    ('Clothing', 'clothing', 'Everyday essentials, outerwear, footwear, and athletic apparel.'),
    ('Home & Garden', 'home-garden', 'Ergonomic furniture, desk lamps, air purifiers, and smart living.'),
    ('Sports', 'sports', 'Fitness gear, carbon rackets, hydration, and training equipment.'),
    ('Books', 'books', 'AI engineering, software architecture, design, and business books.'),
]

DEMO_PRODUCTS = [
    {
        'sku': 'DEMO-TECH-001',
        'slug': 'novabook-pro-14-ai-laptop',
        'name': 'NovaBook Pro 14 AI Laptop',
        'category': 'Electronics',
        'price': Decimal('899.00'),
        'compare_price': Decimal('1099.00'),
        'stock_quantity': 24,
        'short_description': '14-inch 2.8K OLED laptop with Ryzen AI chip, 16GB RAM, and 512GB NVMe SSD.',
        'description': 'Engineered for creators, developers, and mobile professionals with 14-hour battery life, Thunderbolt 4 ports, and whisper-quiet thermal cooling.',
        'is_featured': True,
        'is_bestseller': True,
        'is_new_arrival': True,
        'average_rating': Decimal('4.9'),
        'total_reviews': 64,
    },
    {
        'sku': 'DEMO-TECH-002',
        'slug': 'aeropulse-anc-studio-headphones',
        'name': 'AeroPulse ANC Studio Headphones',
        'category': 'Electronics',
        'price': Decimal('179.00'),
        'compare_price': Decimal('229.00'),
        'stock_quantity': 48,
        'short_description': 'Hybrid active noise cancellation, 45h battery, LDAC Hi-Res wireless audio.',
        'description': 'Tuned for deep studio clarity and zero-fatigue comfort with memory foam ear cushions and dual multipoint Bluetooth 5.4.',
        'is_featured': True,
        'is_bestseller': True,
        'is_new_arrival': False,
        'average_rating': Decimal('4.8'),
        'total_reviews': 112,
    },
    {
        'sku': 'DEMO-TECH-003',
        'slug': 'podcaster-usb-xlr-dynamic-mic-kit',
        'name': 'PodCast Studio USB/XLR Dynamic Mic',
        'category': 'Electronics',
        'price': Decimal('149.00'),
        'compare_price': Decimal('189.00'),
        'stock_quantity': 36,
        'short_description': 'Broadcast cardioid dynamic microphone with shock mount and pop shield.',
        'description': 'Plug-and-play USB-C plus pro XLR output tailored for podcasts, YouTube voiceovers, and live streaming without room echo.',
        'is_featured': True,
        'is_bestseller': False,
        'is_new_arrival': True,
        'average_rating': Decimal('4.7'),
        'total_reviews': 41,
    },
    {
        'sku': 'DEMO-TECH-004',
        'slug': 'lumix-4k-creator-webcam-ringlight',
        'name': 'Lumix 4K Creator Webcam Pro',
        'category': 'Electronics',
        'price': Decimal('129.00'),
        'compare_price': Decimal('169.00'),
        'stock_quantity': 55,
        'short_description': '4K60 Sony STARVIS sensor with dual-tone magnetic fill light.',
        'description': 'Crisp low-light 4K video capture with fast phase autofocus and hardware privacy shutter for video editing setups.',
        'is_featured': False,
        'is_bestseller': True,
        'is_new_arrival': True,
        'average_rating': Decimal('4.6'),
        'total_reviews': 38,
    },
    {
        'sku': 'DEMO-HOME-001',
        'slug': 'ergoflex-mesh-task-chair',
        'name': 'ErgoFlex Pro Mesh Office Chair',
        'category': 'Home & Garden',
        'price': Decimal('289.00'),
        'compare_price': Decimal('369.00'),
        'stock_quantity': 30,
        'short_description': 'Breathable lumbar mesh chair with 4D armrests and 135-degree tilt lock.',
        'description': 'Full-day spinal support designed for home offices and engineering teams with steel Class-4 piston and silent casters.',
        'is_featured': True,
        'is_bestseller': True,
        'is_new_arrival': False,
        'average_rating': Decimal('4.8'),
        'total_reviews': 87,
    },
    {
        'sku': 'DEMO-HOME-002',
        'slug': 'halo-led-architect-desk-lamp',
        'name': 'Halo LED Architect Desk Lamp',
        'category': 'Home & Garden',
        'price': Decimal('64.00'),
        'compare_price': Decimal('89.00'),
        'stock_quantity': 65,
        'short_description': 'Eye-care asymmetrical light bar with wireless dimmer puck.',
        'description': 'Glare-free workspace illumination (CRI > 95) with adjustable 2700K-6500K color temperature for late-night builds.',
        'is_featured': False,
        'is_bestseller': False,
        'is_new_arrival': True,
        'average_rating': Decimal('4.5'),
        'total_reviews': 29,
    },
    {
        'sku': 'DEMO-CLTH-001',
        'slug': 'urban-techwear-waterproof-jacket',
        'name': 'Urban Techwear Waterproof Jacket',
        'category': 'Clothing',
        'price': Decimal('115.00'),
        'compare_price': Decimal('155.00'),
        'stock_quantity': 40,
        'short_description': '3-layer breathable storm shell with sealed zippers and hidden pockets.',
        'description': 'Minimalist commuter outerwear engineered to repel wind and downpours while staying ultra-lightweight.',
        'is_featured': True,
        'is_bestseller': False,
        'is_new_arrival': True,
        'average_rating': Decimal('4.7'),
        'total_reviews': 52,
    },
    {
        'sku': 'DEMO-CLTH-002',
        'slug': 'merino-knit-everyday-hoodie',
        'name': 'Merino Knit Everyday Hoodie',
        'category': 'Clothing',
        'price': Decimal('78.00'),
        'compare_price': Decimal('98.00'),
        'stock_quantity': 72,
        'short_description': 'Soft temperature-regulating combed cotton and merino blend.',
        'description': 'Relaxed tailored fit built for layering across seasons with reinforced cuffs and fade-resistant dye.',
        'is_featured': False,
        'is_bestseller': True,
        'is_new_arrival': False,
        'average_rating': Decimal('4.6'),
        'total_reviews': 44,
    },
    {
        'sku': 'DEMO-SPRT-001',
        'slug': 'stride-carbon-running-shoes',
        'name': 'Stride Carbon Knit Running Shoes',
        'category': 'Sports',
        'price': Decimal('139.00'),
        'compare_price': Decimal('179.00'),
        'stock_quantity': 50,
        'short_description': 'Responsive nitrogen-infused foam sole with breathable knit upper.',
        'description': 'Built for daily 10K training and marathon pace work with high-traction wet-grip outsole.',
        'is_featured': True,
        'is_bestseller': True,
        'is_new_arrival': True,
        'average_rating': Decimal('4.9'),
        'total_reviews': 93,
    },
    {
        'sku': 'DEMO-SPRT-002',
        'slug': 'titan-adjustable-dumbbell-pair',
        'name': 'Titan Quick-Lock Dumbbell 24kg',
        'category': 'Sports',
        'price': Decimal('185.00'),
        'compare_price': Decimal('240.00'),
        'stock_quantity': 18,
        'short_description': 'Compact space-saving dial weights from 2.5kg to 24kg in one pair step.',
        'description': 'CNC machined steel weight plates with knurled anti-slip grip for compact home gym strength training.',
        'is_featured': False,
        'is_bestseller': False,
        'is_new_arrival': True,
        'average_rating': Decimal('4.8'),
        'total_reviews': 31,
    },
    {
        'sku': 'DEMO-BOOK-001',
        'slug': 'designing-agentic-ai-systems-book',
        'name': 'Designing Agentic AI Systems',
        'category': 'Books',
        'price': Decimal('42.00'),
        'compare_price': Decimal('55.00'),
        'stock_quantity': 80,
        'short_description': 'Practical patterns for LangGraph state machines, tool-calling & RAG.',
        'description': 'Comprehensive hardcover engineering handbook covering multi-agent coordination, evaluation, and resilient LLM pipelines.',
        'is_featured': True,
        'is_bestseller': True,
        'is_new_arrival': False,
        'average_rating': Decimal('4.9'),
        'total_reviews': 128,
    },
    {
        'sku': 'DEMO-TECH-005',
        'slug': 'voltcore-140w-gan-charger-hub',
        'name': 'VoltCore 140W GaN 4-Port Charger',
        'category': 'Electronics',
        'price': Decimal('59.00'),
        'compare_price': Decimal('79.00'),
        'stock_quantity': 75,
        'short_description': 'PD 3.1 ultra-fast GaN adapter powers laptops, phones, and tablets at once.',
        'description': 'Travel-ready 3x USB-C + 1x USB-A desktop charger with real-time thermal protection and braided 240W cable.',
        'is_featured': False,
        'is_bestseller': True,
        'is_new_arrival': True,
        'average_rating': Decimal('4.8'),
        'total_reviews': 76,
    },
]


def _upsert_user(username, email, password, first_name, last_name, user_type):
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={'email': email, 'first_name': first_name, 'last_name': last_name},
    )
    user.email = email
    user.first_name = first_name
    user.last_name = last_name
    user.is_active = True
    user.set_password(password)
    user.save()

    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={'user_type': user_type, 'seller_approved': True, 'country': 'Pakistan'},
    )
    profile.user_type = user_type
    profile.seller_approved = True
    profile.seller_approved_at = timezone.now()
    profile.save()
    return user


def main():
    # 1. Remove any admin approval bottlenecks across existing accounts
    Seller.objects.update(is_approved=True, is_active=True)
    UserProfile.objects.filter(user_type='seller').update(seller_approved=True)

    # 2. Ensure Categories exist
    cat_map = {}
    for name, slug, desc in CATEGORIES:
        cat, _ = Category.objects.get_or_create(
            slug=slug,
            defaults={'name': name, 'description': desc, 'is_active': True},
        )
        cat.name = name
        cat.description = desc
        cat.is_active = True
        cat.save()
        cat_map[name] = cat

    # 3. Demo Seller & Demo Buyer accounts
    seller_user = _upsert_user(
        'demo_seller', 'seller@storehub.demo', 'Demo@12345', 'Ali', 'Merchant', 'seller'
    )
    seller, _ = Seller.objects.get_or_create(
        user=seller_user,
        defaults={
            'store_name': 'TechNova Official Store',
            'store_slug': 'technova-official',
            'store_description': 'Verified multi-category flagship seller powered by StoreHub AI.',
            'email': 'seller@storehub.demo',
            'is_approved': True,
            'is_active': True,
            'average_rating': Decimal('4.90'),
            'total_reviews': 48,
        },
    )
    seller.store_name = 'TechNova Official Store'
    seller.store_slug = 'technova-official'
    seller.is_approved = True
    seller.is_active = True
    seller.average_rating = Decimal('4.90')
    seller.total_reviews = 48
    seller.save()

    SellerProfile.objects.get_or_create(
        user=seller_user,
        defaults={'shop_name': 'TechNova Official Store', 'email': 'seller@storehub.demo'},
    )

    buyer_user = _upsert_user(
        'demo_buyer', 'buyer@storehub.demo', 'Demo@12345', 'Sara', 'Khan', 'buyer'
    )

    # 4. Upgrade existing 'iphone 12ggs' products (IDs 30 & 31) so legacy items also appear cleanly
    for existing in Product.objects.filter(id__in=[30, 31]):
        existing.status = 'published'
        existing.stock_quantity = max(existing.stock_quantity or 0, 25)
        if not existing.published_at:
            existing.published_at = timezone.now()
        existing.save()
        if not existing.main_image:
            cat_label = existing.category.name if existing.category_id else 'Electronics'
            cover = generate_product_cover_png(existing.name, cat_label, accent_index=existing.id)
            existing.main_image.save(cover.name, cover, save=True)

    # 5. Upsert 12 Demo Products under demo_seller
    created_products = []
    now = timezone.now()
    for idx, item in enumerate(DEMO_PRODUCTS):
        cat = cat_map[item['category']]
        product, _ = Product.objects.get_or_create(
            sku=item['sku'],
            defaults={
                'seller': seller,
                'category': cat,
                'name': item['name'],
                'slug': item['slug'],
                'description': item['description'],
                'short_description': item['short_description'],
                'price': item['price'],
                'compare_price': item['compare_price'],
                'stock_quantity': item['stock_quantity'],
                'status': 'published',
                'is_featured': item['is_featured'],
                'is_bestseller': item['is_bestseller'],
                'is_new_arrival': item['is_new_arrival'],
                'average_rating': item['average_rating'],
                'total_reviews': item['total_reviews'],
                'published_at': now,
            },
        )
        product.seller = seller
        product.category = cat
        product.name = item['name']
        product.description = item['description']
        product.short_description = item['short_description']
        product.price = item['price']
        product.compare_price = item['compare_price']
        product.stock_quantity = item['stock_quantity']
        product.status = 'published'
        product.is_featured = item['is_featured']
        product.is_bestseller = item['is_bestseller']
        product.is_new_arrival = item['is_new_arrival']
        product.average_rating = item['average_rating']
        product.total_reviews = item['total_reviews']
        if not product.published_at:
            product.published_at = now
        product.save()

        if not product.main_image:
            cover = generate_product_cover_png(product.name, item['category'], accent_index=idx)
            product.main_image.save(cover.name, cover, save=True)
        created_products.append(product)

    # 6. Create 3 realistic idempotent Orders from demo_buyer -> demo_seller
    sample_orders = [
        ('ORD-DEMO-1001', 'delivered', 'paid', [(created_products[0], 1), (created_products[1], 1)]),
        ('ORD-DEMO-1002', 'shipped', 'paid', [(created_products[4], 1), (created_products[11], 2)]),
        ('ORD-DEMO-1003', 'processing', 'pending', [(created_products[2], 1), (created_products[8], 1)]),
    ]
    addr = {
        'full_name': 'Sara Khan',
        'street': '42 Clifton Block 5',
        'city': 'Karachi',
        'country': 'Pakistan',
        'phone': '+92-300-5550199',
    }
    for ord_num, ord_status, pay_status, line_specs in sample_orders:
        subtotal = sum((p.price * qty for p, qty in line_specs), Decimal('0.00'))
        shipping = Decimal('10.00')
        total = subtotal + shipping
        items_json = [
            {
                'product_id': p.id,
                'name': p.name,
                'price': float(p.price),
                'quantity': qty,
                'total': float(p.price * qty),
            }
            for p, qty in line_specs
        ]
        order, ord_created = Order.objects.get_or_create(
            order_number=ord_num,
            defaults={
                'user': buyer_user,
                'email': buyer_user.email,
                'phone': '+92-300-5550199',
                'shipping_address': addr,
                'billing_address': addr,
                'items': items_json,
                'subtotal': subtotal,
                'shipping_cost': shipping,
                'total': total,
                'payment_method': 'stripe' if pay_status == 'paid' else 'cod',
                'payment_status': pay_status,
                'status': ord_status,
            },
        )
        if ord_created or not order.order_items.exists():
            order.order_items.all().delete()
            for p, qty in line_specs:
                OrderItem.objects.create(
                    order=order,
                    product=p,
                    product_name=p.name,
                    price=p.price,
                    quantity=qty,
                    total=p.price * qty,
                )

    seller.total_products = seller.products.count()
    seller.total_sales = sum(qty for _, _, _, specs in sample_orders for _, qty in specs)
    seller.total_revenue = sum(
        (p.price * qty for _, _, _, specs in sample_orders for p, qty in specs), Decimal('0.00')
    )
    seller.save()

    print(f'Demo Seller ready: username={seller_user.username} seller_id={seller.id} products={seller.products.count()}')
    print(f'Demo Buyer  ready: username={buyer_user.username} orders={buyer_user.orders.count()}')
    print(f'Published catalog total: {Product.objects.filter(status="published").count()}')


if __name__ == '__main__':
    main()
