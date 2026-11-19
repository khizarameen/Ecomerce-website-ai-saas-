"""LangGraph orchestrator for the Seller Profit-Shield & Anti-RTO Mesh."""

from langgraph.graph import END, START, StateGraph

from .agents import (
    AGENT_1,
    AGENT_2,
    AGENT_3,
    AGENT_4,
    AGENT_CHAINS,
    ALL_AGENTS,
    cod_risk_gatekeeper_agent,
    intransit_rto_rerouter_agent,
    profit_bleed_auditor_agent,
    return_fraud_vision_agent,
)
from .graph_state import SellerProfitShieldState

_ROUTES = {name: name for name in ALL_AGENTS}
_ROUTES[END] = END


def route_entry(state: SellerProfitShieldState) -> str:
    """Pick the first agent of the trigger's chain."""
    chain = AGENT_CHAINS.get(state.get('trigger_event', ''), AGENT_CHAINS['FULL_PROFIT_SHIELD_SWEEP'])
    return chain[0]


def route_next(state: SellerProfitShieldState) -> str:
    """Follow the agent-decided handoff, or finish."""
    target = state.get('next_agent', 'END')
    return target if target in ALL_AGENTS else END


def build_profit_shield_graph():
    builder = StateGraph(SellerProfitShieldState)
    builder.add_node(AGENT_1, cod_risk_gatekeeper_agent)
    builder.add_node(AGENT_2, intransit_rto_rerouter_agent)
    builder.add_node(AGENT_3, return_fraud_vision_agent)
    builder.add_node(AGENT_4, profit_bleed_auditor_agent)

    builder.add_conditional_edges(START, route_entry, {name: name for name in ALL_AGENTS})
    for name in ALL_AGENTS:
        builder.add_conditional_edges(name, route_next, _ROUTES)
    return builder.compile()


profit_shield_graph = build_profit_shield_graph()
