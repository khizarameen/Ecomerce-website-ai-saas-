// src/components/common/AuthDebug.jsx
import React from 'react';
import { useAuth } from '../../context/AuthContext';

const AuthDebug = () => {
  const { user, isAuthenticated, isSeller, isPending, sellerProfile, loading } = useAuth();
  
  // Don't show in production
  if (process.env.NODE_ENV === 'production') return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-xl text-xs z-50 max-w-md">
      <div className="font-bold mb-2 text-yellow-400">🔍 Auth Debug</div>
      <div>Loading: {loading ? '⏳' : '✅'}</div>
      <div>Authenticated: {isAuthenticated ? '✅' : '❌'}</div>
      <div>Is Seller: {isSeller ? '✅' : '❌'}</div>
      <div>Is Pending: {isPending ? '⏳' : '❌'}</div>
      <div>User: {user?.username || 'None'}</div>
      <div>User ID: {user?.id || 'None'}</div>
      <div>Role: {user?.role || 'None'}</div>
      <div>Email: {user?.email || 'None'}</div>
      <div className="mt-2 text-gray-400 text-[10px] border-t border-gray-700 pt-2">
        <div className="font-bold text-gray-300">Full User Data:</div>
        <pre className="whitespace-pre-wrap max-h-40 overflow-auto">
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default AuthDebug;