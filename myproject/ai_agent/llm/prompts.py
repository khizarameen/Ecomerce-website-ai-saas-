"""
Prompt Templates for AI Agent
"""

from typing import Dict, Optional

class PromptTemplates:
    """
    Collection of prompt templates for different use cases
    """
    
    @staticmethod
    def intent_detection(query: str) -> str:
        """Prompt for detecting user intent"""
        return f"""Analyze the user query and classify it into one of these categories:
        - 'product_search': User wants to find products
        - 'recommendation': User wants product recommendations
        - 'price': User wants price information
        - 'chat': General conversation
        - 'help': User needs assistance

        Query: "{query}"

        Return only the category name:"""
    
    @staticmethod
    def product_search(query: str, context: Optional[Dict] = None) -> str:
        """Prompt for product search"""
        return f"""User is looking for products matching: "{query}"

        Context: {context or {}}
        
        Provide helpful product search suggestions and filter options."""
    
    @staticmethod
    def product_recommendation(product_name: str, product_category: str) -> str:
        """Prompt for product recommendations"""
        return f"""User is interested in: {product_name} (Category: {product_category})
        
        Suggest similar or complementary products that might interest the user.
        Provide recommendations with brief reasoning."""
    
    @staticmethod
    def chat_response(message: str, context: Optional[Dict] = None) -> str:
        """Prompt for general chat responses"""
        return f"""You are a helpful AI shopping assistant for an e-commerce store.

        User message: {message}
        
        Context: {context or {}}
        
        Provide a helpful, friendly response. If the user is asking about products,
        guide them to search or browse. Be concise and engaging."""
    
    @staticmethod
    def image_analysis(image_description: str) -> str:
        """Prompt for analyzing product images"""
        return f"""Analyze this product image description: {image_description}
        
        Extract:
        1. Main objects/products
        2. Color and style attributes
        3. Potential product category
        4. Suggested search keywords
        
        Provide a structured analysis."""
    
    @staticmethod
    def price_inquiry(product_name: str, price: float) -> str:
        """Prompt for price-related queries"""
        return f"""Product: {product_name}
        Price: ${price}
        
        Provide pricing information, value proposition, and any discounts available."""
    
    @staticmethod
    def help_response(question: str) -> str:
        """Prompt for help/FAQ responses"""
        return f"""User needs help with: {question}
        
        Provide helpful assistance about:
        - Shopping guide
        - Returns and refunds
        - Shipping information
        - Payment methods
        - Account help"""