// src/components/common/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ allowedRoles = [] }) => {
  const { isAuthenticated, loading, isSeller } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-slate-600">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const effectiveRole = isSeller ? 'seller' : 'buyer';
  if (allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to={isSeller ? '/seller/dashboard' : '/home'} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
