# myproject/urls.py

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from store.views import AgentNetworkManifestView

def api_root(request):
    return JsonResponse({
        'name': 'E-commerce API',
        'version': '1.0.0',
        'endpoints': {
            'auth': '/api/auth/',
            'products': '/api/products/',
            'public': '/api/public/',
            'search': '/api/search/',
            'ai': '/api/ai/',
            'supplyshield_agents': '/api/agents/',
            'supplyshield_stream': '/api/stream-order/',
            'supplyshield_chat': '/api/agent-chat/',
            'cart': '/api/cart/',
            'orders': '/api/orders/',
            'reviews': '/api/reviews/',
            'wishlist': '/api/wishlist/',
            'payment': '/api/payment/',
        }
    })

urlpatterns = [
    path('', api_root, name='api-root'),
    path('.well-known/agent-network.json', AgentNetworkManifestView.as_view(), name='well-known-agent-network'),
    path('agent-network.json', AgentNetworkManifestView.as_view(), name='root-agent-network'),
    path('admin/', admin.site.urls),
    path('api/', include('store.urls')),  # THIS IS IMPORTANT!
    path('api/', include('mesh_api.urls')),
    path('api/seller-mesh/', include('seller_mesh.urls')),
    path('health/', lambda request: JsonResponse({'status': 'healthy'}), name='health-check'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)