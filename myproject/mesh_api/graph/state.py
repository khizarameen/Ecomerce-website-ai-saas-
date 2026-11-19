"""
LangGraph State Schema for Universal SupplyShield & StoreHub AI Mesh
"""

from typing import Any, Dict, List, Optional
from typing_extensions import TypedDict


class SupplyChainState(TypedDict):
    """Shared state passed across the Universal LangGraph workflow."""
    prompt: str
    intent_type: str
    item_name: str
    search_keywords: List[str]
    category: str
    quantity: int
    max_days: float
    max_budget: float

    ai_ideas: Dict[str, Any]
    matched_products: List[Dict[str, Any]]
    all_matching_products: List[Dict[str, Any]]
    catalog_stats: Dict[str, Any]
    catalog_help_summary: str

    excluded_suppliers: List[str]
    supplier_candidates: List[Dict[str, Any]]
    selected_supplier: Optional[Dict[str, Any]]
    freight_options: Dict[str, Any]

    risk_report: Optional[Dict[str, Any]]
    delay_days: float
    risk_score: int

    logistics_plan: Optional[Dict[str, Any]]
    total_delivery_days: float

    crisis_config: Dict[str, bool]
    haggle_report: Optional[Dict[str, Any]]
    customs_report: Optional[Dict[str, Any]]

    total_cost: float
    savings: float
    escrow_approved: bool
    po_hash: str
    purchase_order: Optional[Dict[str, Any]]

    active_node: str
    status: str
    edge_status: Dict[str, str]
    telemetry_event: Optional[Dict[str, Any]]
    telemetry_logs: List[Dict[str, Any]]
