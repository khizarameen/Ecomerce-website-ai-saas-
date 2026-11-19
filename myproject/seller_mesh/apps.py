"""App configuration for seller_mesh."""

from django.apps import AppConfig


class SellerMeshConfig(AppConfig):
    """Seller Profit-Shield & Anti-RTO Mesh app config."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'seller_mesh'
    verbose_name = 'Seller Profit-Shield & Anti-RTO Mesh'
