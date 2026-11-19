"""
Conversation History Manager
"""

from collections import defaultdict
from typing import List, Dict, Optional
from datetime import datetime
import json

class ConversationHistory:
    """
    Manages conversation history for AI chat sessions
    """
    
    def __init__(self, max_messages: int = 100):
        """
        Initialize history store
        """
        self._store = defaultdict(list)  # session_id -> list of messages
        self.max_messages = max_messages
    
    def add(self, session_id: str, role: str, content: str, **kwargs) -> Dict:
        """
        Add a message to conversation history
        """
        message = {
            'role': role,
            'content': content,
            'timestamp': datetime.now().isoformat(),
            **kwargs
        }
        
        self._store[session_id].append(message)
        
        # Trim if exceeds max
        if len(self._store[session_id]) > self.max_messages:
            self._store[session_id] = self._store[session_id][-self.max_messages:]
        
        return message
    
    def get(self, session_id: str, limit: Optional[int] = None) -> List[Dict]:
        """
        Get conversation history
        """
        messages = self._store.get(session_id, [])
        if limit:
            return messages[-limit:]
        return messages
    
    def get_last(self, session_id: str, n: int = 5) -> List[Dict]:
        """
        Get last n messages
        """
        return self.get(session_id, limit=n)
    
    def clear(self, session_id: str) -> None:
        """
        Clear conversation history
        """
        if session_id in self._store:
            del self._store[session_id]
    
    def get_all_sessions(self) -> List[str]:
        """
        Get all session IDs
        """
        return list(self._store.keys())
    
    def get_message_count(self, session_id: str) -> int:
        """
        Get number of messages in a session
        """
        return len(self._store.get(session_id, []))
    
    def export(self, session_id: str) -> str:
        """
        Export conversation history as JSON
        """
        return json.dumps(self.get(session_id), indent=2)
    
    def import_history(self, session_id: str, data: str) -> None:
        """
        Import conversation history from JSON
        """
        try:
            messages = json.loads(data)
            self._store[session_id] = messages
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON data")