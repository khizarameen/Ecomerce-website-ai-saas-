"""
AI Agent Module for E-commerce
"""

# Lazy import to avoid circular dependency
def get_agent():
    from .agent import Agent
    return Agent()

__all__ = ['get_agent']