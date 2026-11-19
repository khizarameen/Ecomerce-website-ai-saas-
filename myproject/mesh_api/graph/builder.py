"""
LangGraph StateGraph Builder for SupplyShield Crisis Router
"""

from langgraph.graph import END, StateGraph

from .nodes import (
    budget_guard_node,
    cargo_mesh_node,
    customs_node,
    haggle_node,
    orchestrator_node,
    risk_radar_node,
    supplier_node,
)
from .state import SupplyChainState


def route_after_risk(state: SupplyChainState) -> str:
    """
    Conditional edge after risk_radar_node:
    If delay_days > max_days and alternative suppliers remain, loop back to supplier_node.
    """
    delay_days = float(state.get('delay_days', 0.0))
    max_days = float(state.get('max_days', 3.0))
    excluded = set(state.get('excluded_suppliers') or [])
    candidates = state.get('supplier_candidates') or []
    remaining = [c for c in candidates if c.get('id') not in excluded]

    if delay_days > max_days and remaining:
        return 'supplier_node'
    return 'cargo_mesh_node'


def build_supply_chain_graph():
    """Compile and return the SupplyShield LangGraph state machine."""
    workflow = StateGraph(SupplyChainState)

    workflow.add_node('orchestrator_node', orchestrator_node)
    workflow.add_node('supplier_node', supplier_node)
    workflow.add_node('risk_radar_node', risk_radar_node)
    workflow.add_node('cargo_mesh_node', cargo_mesh_node)
    workflow.add_node('haggle_node', haggle_node)
    workflow.add_node('customs_node', customs_node)
    workflow.add_node('budget_guard_node', budget_guard_node)

    workflow.set_entry_point('orchestrator_node')
    workflow.add_edge('orchestrator_node', 'supplier_node')
    workflow.add_edge('supplier_node', 'risk_radar_node')

    workflow.add_conditional_edges(
        'risk_radar_node',
        route_after_risk,
        {
            'supplier_node': 'supplier_node',
            'cargo_mesh_node': 'cargo_mesh_node',
        },
    )

    workflow.add_edge('cargo_mesh_node', 'haggle_node')
    workflow.add_edge('haggle_node', 'customs_node')
    workflow.add_edge('customs_node', 'budget_guard_node')
    workflow.add_edge('budget_guard_node', END)

    return workflow.compile()


supply_chain_graph = build_supply_chain_graph()
