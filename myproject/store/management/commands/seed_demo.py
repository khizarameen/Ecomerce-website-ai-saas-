"""Idempotent demo data seeder for local SQLite and Vercel Postgres cold starts."""

from decimal import Decimal
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from seller_mesh.models import CancelledOrderRecovery, SellerShieldMetrics
from store.models import Category, Product, Seller, SellerProfile, UserProfile


DEMO_CATEGORIES = [
    {
        'name': 'Electronics',
        'slug': 'electronics',
        'description': 'Computers, smart electronics, and developer hardware.',
    },
    {
        'name': 'Audio & Headphones',
        'slug': 'audio-headphones',
        'description': 'Studio headphones, DACs, and wireless audio gear.',
    },
    {
        'name': 'Smart Accessories',
        'slug': 'smart-accessories',
        'description': 'Wearables, studio microphones, and creator peripherals.',
    },
]

DEMO_PRODUCTS = [
    {
        'sku': 'SH-DEMO-ANC-001',
        'slug': 'studio-anc-pro-wireless-headphones',
        'name': 'Studio ANC Pro Wireless Headphones',
        'category_slug': 'audio-headphones',
        'short_description': 'Hybrid active noise cancellation with 45h battery and LDAC studio tuning.',
        'description': (
            'Engineered for creators and remote engineers: dual-mic hybrid ANC, '
            '40mm beryllium drivers, multipoint Bluetooth 5.4, and USB-C lossless audio.'
        ),
        'price': Decimal('129.99'),
        'compare_price': Decimal('169.99'),
        'cost_price': Decimal('68.00'),
        'stock_quantity': 42,
        'is_featured': True,
        'is_bestseller': True,
    },
    {
        'sku': 'SH-DEMO-LAP-002',
        'slug': 'ultrabook-x14-creator-laptop',
        'name': 'UltraBook X14 Creator Laptop (16GB / 1TB NVMe)',
        'category_slug': 'electronics',
        'short_description': '14-inch 2.8K OLED laptop built for coding, AI inference, and mobile studios.',
        'description': (
            'Lightweight CNC aluminum chassis, 16GB LPDDR5X RAM, 1TB PCIe Gen4 SSD, '
            'and Thunderbolt 4 docking support for multi-monitor creator desks.'
        ),
        'price': Decimal('749.00'),
        'compare_price': Decimal('899.00'),
        'cost_price': Decimal('560.00'),
        'stock_quantity': 14,
        'is_featured': True,
        'is_bestseller': False,
    },
    {
        'sku': 'SH-DEMO-WCH-003',
        'slug': 'pulsefit-amoled-smartwatch-pro',
        'name': 'PulseFit AMOLED Smartwatch Pro',
        'category_slug': 'smart-accessories',
        'short_description': 'Sapphire glass AMOLED smartwatch with GPS tracking and 14-day battery.',
        'description': (
            'Track workouts, sleep recovery, and notifications seamlessly with dual-band GPS, '
            '5ATM water resistance, and fast magnetic charging.'
        ),
        'price': Decimal('89.50'),
        'compare_price': Decimal('119.00'),
        'cost_price': Decimal('46.00'),
        'stock_quantity': 55,
        'is_featured': False,
        'is_bestseller': True,
    },
    {
        'sku': 'SH-DEMO-MIC-004',
        'slug': 'voxcast-usb-condenser-podcast-mic',
        'name': 'VoxCast USB-C Condenser Podcast Microphone',
        'category_slug': 'audio-headphones',
        'short_description': 'Broadcast cardioid condenser mic with shock mount and real-time monitoring.',
        'description': (
            'Studio-grade 24-bit/96kHz cardioid capture with hardware gain dial, tap-to-mute LED, '
            'and zero-latency 3.5mm monitoring for podcasts and video calls.'
        ),
        'price': Decimal('74.00'),
        'compare_price': Decimal('99.00'),
        'cost_price': Decimal('35.00'),
        'stock_quantity': 30,
        'is_featured': True,
        'is_bestseller': False,
    },
]


class Command(BaseCommand):
    """Idempotently seed demo buyer, demo seller, categories, products, and a cancelled deal."""

    help = 'Seed demo StoreHub buyer, seller, products, and sample Anti-RTO cancelled deal.'

    @transaction.atomic
    def handle(self, *args, **options):
        buyer, buyer_created = User.objects.get_or_create(
            username='demo_buyer',
            defaults={
                'email': 'demo_buyer@storehub.ai',
                'first_name': 'Demo',
                'last_name': 'Buyer',
                'is_active': True,
            },
        )
        if buyer_created or not buyer.has_usable_password():
            buyer.set_password('Demo@12345')
            buyer.save()

        UserProfile.objects.get_or_create(
            user=buyer,
            defaults={
                'user_type': 'buyer',
                'city': 'Lahore',
                'country': 'Pakistan',
                'is_email_verified': True,
            },
        )

        seller_user, seller_created = User.objects.get_or_create(
            username='demo_seller',
            defaults={
                'email': 'demo_seller@storehub.ai',
                'first_name': 'Demo',
                'last_name': 'Seller',
                'is_active': True,
            },
        )
        if seller_created or not seller_user.has_usable_password():
            seller_user.set_password('Demo@12345')
            seller_user.save()

        UserProfile.objects.get_or_create(
            user=seller_user,
            defaults={
                'user_type': 'seller',
                'seller_approved': True,
                'seller_approved_at': timezone.now(),
                'city': 'Karachi',
                'country': 'Pakistan',
                'is_email_verified': True,
            },
        )

        seller_store, _ = Seller.objects.get_or_create(
            user=seller_user,
            defaults={
                'store_name': 'StoreHub Demo Electronics',
                'store_slug': 'storehub-demo-electronics',
                'store_description': 'Verified demo flagship store for AI commerce & Anti-RTO rerouting.',
                'email': 'demo_seller@storehub.ai',
                'is_approved': True,
                'is_active': True,
            },
        )

        SellerProfile.objects.get_or_create(
            user=seller_user,
            defaults={
                'shop_name': 'StoreHub Demo Electronics',
                'shop_description': 'Verified demo flagship store for AI commerce & Anti-RTO rerouting.',
                'email': 'demo_seller@storehub.ai',
            },
        )

        category_map = {}
        for cat_data in DEMO_CATEGORIES:
            cat, _ = Category.objects.get_or_create(
                slug=cat_data['slug'],
                defaults={
                    'name': cat_data['name'],
                    'description': cat_data['description'],
                    'is_active': True,
                },
            )
            category_map[cat.slug] = cat

        seeded_products = []
        now = timezone.now()
        for prod_data in DEMO_PRODUCTS:
            cat = category_map[prod_data['category_slug']]
            prod, _ = Product.objects.get_or_create(
                sku=prod_data['sku'],
                defaults={
                    'seller': seller_store,
                    'name': prod_data['name'],
                    'slug': prod_data['slug'],
                    'description': prod_data['description'],
                    'short_description': prod_data['short_description'],
                    'category': cat,
                    'price': prod_data['price'],
                    'compare_price': prod_data['compare_price'],
                    'cost_price': prod_data['cost_price'],
                    'seller_price': prod_data['price'],
                    'stock_quantity': prod_data['stock_quantity'],
                    'status': 'published',
                    'is_featured': prod_data['is_featured'],
                    'is_bestseller': prod_data['is_bestseller'],
                    'published_at': now,
                },
            )
            seeded_products.append(prod)

        first_product = seeded_products[0]

        SellerShieldMetrics.objects.get_or_create(
            seller_username='demo_seller',
            sku=first_product.sku,
            defaults={
                'product_title': first_product.name,
                'unit_price': first_product.price,
                'unit_cost': first_product.cost_price or Decimal('68.00'),
                'active_orders': 6,
                'gross_margin_pct': 47.69,
                'true_net_margin_pct': 36.20,
                'last_trigger_event': 'DEMO_SEED_READY',
                'twin_state': {'seeded': True, 'store': seller_store.store_name},
            },
        )

        CancelledOrderRecovery.objects.get_or_create(
            order_number='ORD-DEMO-RTO-001',
            defaults={
                'seller_username': 'demo_seller',
                'product_id': first_product.id,
                'product_title': first_product.name,
                'original_price': Decimal('129.99'),
                'quantity': 1,
                'cancelled_by_buyer': 'demo_buyer',
                'origin_city': 'Karachi',
                'cancel_stage': 'IN_TRANSIT',
                'cancel_reason': 'Buyer unavailable at delivery slot — rerouting near transit hub',
                'shipping_fee_at_risk': Decimal('14.50'),
                'ai_recommended_deal_price': Decimal('104.99'),
                'ai_discount_pct': 19.2,
                'ai_strategy_summary': (
                    'Parcel is sealed at Karachi East Hub. Offering a 19% Hub Rescue Discount '
                    'avoids $14.50 return-to-origin freight and delivers within 24 hours.'
                ),
                'candidate_buyers': [
                    {
                        'username': 'ali_karachi',
                        'city': 'Karachi',
                        'match_score': 94,
                        'reason': 'Looked at ANC Headphones twice in last 48h',
                    },
                    {
                        'username': 'sana_clifton',
                        'city': 'Karachi',
                        'match_score': 89,
                        'reason': 'High prepaid trust score, same courier hub',
                    },
                ],
                'seller_edited_title': f'{first_product.name} (Same-City Hub Rescue Deal)',
                'seller_offer_note': 'Factory-sealed parcel already near Karachi Hub — instant discount vs waiting.',
                'shipping_policy': 'Free Same-City Hub Delivery',
                'published_to_buyers': True,
                'resolution_option': 'DISCOUNT_RESALE',
                'status': 'OPEN_FOR_DEAL',
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Demo seed ready: demo_buyer, demo_seller, {len(seeded_products)} products, 1 cancelled recovery deal.'
            )
        )
