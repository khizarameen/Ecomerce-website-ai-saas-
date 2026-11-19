# index_products.py
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
django.setup()

from store.models import Product
from ai_agent.vector.index import VectorIndex
from ai_agent.llm.embeddings import EmbeddingGenerator
from ai_agent.vector.chroma import ChromaVectorStore
from ai_agent.agent import agent

print("=" * 60)
print("🔍 INDEXING PRODUCTS FOR IMAGE SEARCH")
print("=" * 60)

# Method 1: Use Agent
print("\n📊 Method 1: Using Agent...")
result = agent.index_all_products()
print(f"Result: {result}")

# Method 2: Direct indexing
print("\n📊 Method 2: Direct Indexing...")
vector_store = ChromaVectorStore()
embeddings = EmbeddingGenerator()
index = VectorIndex(vector_store=vector_store, embedding_generator=embeddings)

count = 0
for product in Product.objects.filter(status='published'):
    if product.main_image:
        success = index.index_product(product)
        if success:
            count += 1
            print(f"  ✅ {product.name}")
        else:
            print(f"  ❌ {product.name}")

print(f"\n✅ Indexed {count} products")
print(f"📊 Total vectors in DB: {vector_store.get_count()}")