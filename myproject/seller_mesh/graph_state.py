"""Shared LangGraph state for the Seller Profit-Shield & Anti-RTO Mesh."""

import operator
from typing import Annotated, TypedDict


class SellerProfitShieldState(TypedDict):
    """Single source of truth shared by all 4 agents."""

    sku: str
    trigger_event: str
    orders_batch: dict
    rto_reroute_data: dict
    return_forensics_data: dict
    margin_audit_data: dict
    next_agent: str
    agent_logs: Annotated[list[dict], operator.add]
    pending_approvals: Annotated[list[dict], operator.add]
