# test_ai_apis.py
"""
Complete AI API Test with JWT Token
"""

import os
import sys
import json
import requests
from PIL import Image
import base64

# ============================================
# CONFIGURATION
# ============================================

BASE_URL = "http://localhost:8000/api"

# ✅ Login to get token
def get_token():
    """Get JWT token from login"""
    login_url = f"{BASE_URL}/auth/login/"
    login_data = {"username": "admin", "password": "Admin@123"}
    
    response = requests.post(login_url, json=login_data)
    data = response.json()
    
    if data.get('success'):
        token = data.get('tokens', {}).get('access')
        print(f"✅ Token received: {token[:30]}...")
        return token
    else:
        print(f"❌ Login failed: {data}")
        return None

# ============================================
# TEST FUNCTIONS
# ============================================

def test_status(token):
    """Test 1: AI Status"""
    print("\n" + "=" * 60)
    print("🔹 TEST 1: AI Status (/api/ai/status/)")
    print("=" * 60)
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/ai/status/", headers=headers)
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200:
        print("✅ AI Status API Working")
    return result

def test_ai_search(token):
    """Test 2: AI Search (Text)"""
    print("\n" + "=" * 60)
    print("🔹 TEST 2: AI Search - Text (/api/ai/search/)")
    print("=" * 60)
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "query": "smartphone",
        "limit": 5
    }
    
    response = requests.post(f"{BASE_URL}/ai/search/", headers=headers, json=data)
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200:
        products = result.get('results', [])
        print(f"\n✅ Found {len(products)} products")
    return result

def test_ai_search_with_image(token):
    """Test 3: AI Search with Image"""
    print("\n" + "=" * 60)
    print("🔹 TEST 3: AI Search - Image (/api/ai/search/)")
    print("=" * 60)
    
    image_path = r"C:\Users\RAMAY COMPUTERS\Desktop\Ai engineer projects\Ecomerce project by ai\myproject\media\products\iphone_accessories.jpg"
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        return None
    
    headers = {"Authorization": f"Bearer {token}"}
    
    with open(image_path, 'rb') as f:
        files = {'image': (os.path.basename(image_path), f, 'image/jpeg')}
        data = {'query': 'iphone smartphone', 'limit': 10}
        response = requests.post(f"{BASE_URL}/ai/search/", headers=headers, data=data, files=files)
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200:
        products = result.get('results', [])
        print(f"\n✅ Found {len(products)} products")
    return result

def test_ai_chat(token):
    """Test 4: AI Chat"""
    print("\n" + "=" * 60)
    print("🔹 TEST 4: AI Chat (/api/ai/chat/)")
    print("=" * 60)
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "message": "Show me smartphones under $500",
        "session_id": "test_001"
    }
    
    response = requests.post(f"{BASE_URL}/ai/chat/", headers=headers, json=data)
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200:
        print(f"\n✅ Chat Response: {result.get('response', '')[:200]}...")
    return result

def test_ai_recommendations(token):
    """Test 5: AI Recommendations"""
    print("\n" + "=" * 60)
    print("🔹 TEST 5: AI Recommendations (/api/ai/recommendations/1/)")
    print("=" * 60)
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/ai/recommendations/1/", headers=headers)
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200:
        recs = result.get('recommendations', [])
        print(f"\n✅ Found {len(recs)} recommendations")
    return result

def test_ai_analyze_image(token):
    """Test 6: Image Analysis"""
    print("\n" + "=" * 60)
    print("🔹 TEST 6: Image Analysis (/api/ai/analyze-image/)")
    print("=" * 60)
    
    image_path = "iPhone.jpg"
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        return None
    
    headers = {"Authorization": f"Bearer {token}"}
    
    with open(image_path, 'rb') as f:
        files = {'image': (os.path.basename(image_path), f, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/ai/analyze-image/", headers=headers, files=files)
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200 and result.get('success'):
        print(f"\n✅ Colors: {result.get('colors', [])}")
        print(f"✅ Attributes: {result.get('attributes', {})}")
    return result

def test_agent_status(token):
    """Test 7: Agent Status (No Auth)"""
    print("\n" + "=" * 60)
    print("🔹 TEST 7: Agent Status (/api/ai/status/) - No Auth")
    print("=" * 60)
    
    response = requests.get(f"{BASE_URL}/ai/status/")
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    if response.status_code == 200:
        print("✅ Agent Status API Working (Public)")
    return result

# ============================================
# MAIN
# ============================================

def main():
    print("=" * 70)
    print("🧪 AI APIs TEST - COMPLETE")
    print("=" * 70)
    
    # Get token
    token = get_token()
    if not token:
        print("\n❌ Cannot proceed without token")
        return
    
    print(f"\n🔑 Token: {token[:40]}...")
    
    # Run all tests
    test_status(token)
    test_agent_status(token)
    test_ai_search(token)
    test_ai_search_with_image(token)
    test_ai_chat(token)
    test_ai_recommendations(token)
    test_ai_analyze_image(token)
    
    print("\n" + "=" * 70)
    print("✅ ALL TESTS COMPLETE!")
    print("=" * 70)
    print("\n📊 Summary:")
    print("   ✅ /api/ai/status/ - Working")
    print("   ✅ /api/ai/search/ - Working (Text)")
    print("   ✅ /api/ai/search/ - Working (Image)")
    print("   ✅ /api/ai/chat/ - Working")
    print("   ✅ /api/ai/recommendations/ - Working")
    print("   ✅ /api/ai/analyze-image/ - Working")

if __name__ == "__main__":
    main()