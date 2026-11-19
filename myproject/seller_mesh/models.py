"""Persistence models for the Seller Profit-Shield & Anti-RTO Mesh."""

from decimal import Decimal

from django.db import models


class SellerShieldMetrics(models.Model):
    """Live financial-defense counters for one seller store / lead SKU."""

    seller_username = models.CharField(max_length=150, blank=True, default='', db_index=True)
    sku = models.CharField(max_length=64, default='STORE-SKU')
    product_title = models.CharField(max_length=255)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('45.00'))
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('22.00'))

    active_orders = models.IntegerField(default=0)
    blocked_fake_cod_count = models.IntegerField(default=0)
    cod_shipping_saved = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    rerouted_parcels_count = models.IntegerField(default=0)
    reroute_saved = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    fraud_claims_won = models.IntegerField(default=0)
    courier_disputes_won = models.IntegerField(default=0)
    claims_recovered = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    gross_margin_pct = models.FloatField(default=51.11)
    true_net_margin_pct = models.FloatField(default=34.65)
    total_money_saved_today = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    last_trigger_event = models.CharField(max_length=64, blank=True, default='')
    twin_state = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        verbose_name_plural = 'Seller shield metrics'

    def __str__(self) -> str:
        return f'{self.product_title} ({self.sku}) - saved ${self.total_money_saved_today}'


class AgentExecutionLog(models.Model):
    """One step of a LangGraph run (or a seller human-in-the-loop decision)."""

    metrics = models.ForeignKey(SellerShieldMetrics, on_delete=models.CASCADE, related_name='execution_logs')
    run_id = models.CharField(max_length=64, db_index=True)
    trigger_event = models.CharField(max_length=64)
    agent_name = models.CharField(max_length=64)
    llm_engine = models.CharField(max_length=64)
    engine_mode = models.CharField(max_length=24, default='fallback')
    action = models.TextField()
    money_impact = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    handoff_to = models.CharField(max_length=64, blank=True, default='')
    is_autonomous = models.BooleanField(default=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self) -> str:
        return f'[{self.agent_name}] -> {self.handoff_to or "END"} (${self.money_impact})'


class PendingApprovalAction(models.Model):
    """Seller 1-click sign-off item (hub reroute, fraud claim, courier dispute)."""

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    metrics = models.ForeignKey(SellerShieldMetrics, on_delete=models.CASCADE, related_name='approvals')
    run_id = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=255)
    agent_name = models.CharField(max_length=64)
    action_type = models.CharField(max_length=64)
    description = models.TextField()
    dollar_impact = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='PENDING')
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self) -> str:
        return f'{self.title} [{self.status}]'


class CancelledOrderRecovery(models.Model):
    """Tracks a buyer-cancelled order and AI-matched Next Customer ('Agla Customer') deal flow."""

    STAGE_CHOICES = [
        ('PRE_DISPATCH', 'Pre-Dispatch Cancellation'),
        ('IN_TRANSIT', 'In-Transit Cancellation / Refusal'),
    ]
    STATUS_CHOICES = [
        ('OPEN_FOR_DEAL', 'Open for Next Customer Deal'),
        ('DEAL_CLOSED', 'Deal Closed & Reassigned'),
        ('RETURNED_TO_BACKUP', 'Recalled to Warehouse Backup'),
        ('DISMISSED', 'Dismissed'),
    ]
    PHOTO_VERIFICATION_CHOICES = [
        ('NOT_PROVIDED', 'No Photo Uploaded'),
        ('MATCHED', 'Verified Same Product'),
        ('MISMATCH', 'Product Mismatch Detected'),
        ('SUSPICIOUS', 'Suspicious / Needs Seller Review'),
        ('UNVERIFIED', 'Pending Verification'),
    ]

    order_id = models.IntegerField(null=True, blank=True, db_index=True)
    order_number = models.CharField(max_length=64)
    seller_username = models.CharField(max_length=150, blank=True, default='')
    product_id = models.IntegerField(null=True, blank=True)
    product_title = models.CharField(max_length=255)
    original_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('45.00'))
    quantity = models.IntegerField(default=1)
    cancelled_by_buyer = models.CharField(max_length=150, default='buyer')
    origin_city = models.CharField(max_length=100, default='Karachi')
    cancel_stage = models.CharField(max_length=32, choices=STAGE_CHOICES, default='PRE_DISPATCH')
    cancel_reason = models.CharField(max_length=255, default='Buyer cancelled order')
    shipping_fee_at_risk = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('14.50'))

    ai_recommended_deal_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('40.50'))
    ai_discount_pct = models.FloatField(default=10.0)
    ai_strategy_summary = models.TextField(blank=True, default='')
    candidate_buyers = models.JSONField(default=list, blank=True)
    selected_candidate = models.JSONField(default=dict, blank=True)
    final_deal_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reassigned_order_id = models.IntegerField(null=True, blank=True)
    reassigned_order_number = models.CharField(max_length=64, blank=True, default='')
    seller_edited_title = models.CharField(max_length=255, blank=True, default='')
    seller_offer_note = models.TextField(blank=True, default='')
    shipping_policy = models.CharField(max_length=120, default='Free Same-City Hub Delivery')
    published_to_buyers = models.BooleanField(default=True)
    resolution_option = models.CharField(max_length=32, default='DISCOUNT_RESALE')
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='OPEN_FOR_DEAL')
    buyer_cancel_photo_data = models.TextField(blank=True, default='')
    photo_verification_status = models.CharField(
        max_length=24,
        choices=PHOTO_VERIFICATION_CHOICES,
        default='NOT_PROVIDED',
    )
    photo_verification_result = models.JSONField(default=dict, blank=True)
    chat_history = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self) -> str:
        return f'#{self.order_number} ({self.product_title}) [{self.status}]'

