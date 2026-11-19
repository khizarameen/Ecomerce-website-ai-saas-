from django.urls import path

from . import views

urlpatterns = [
    path('agents/', views.list_agents, name='mesh-agents'),
    path('stream-order/', views.stream_order, name='mesh-stream-order'),
    path('agent-chat/', views.agent_chat, name='mesh-agent-chat'),
]
