import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import {roleHome} from '../services/roleHome.js';
import { useAuth } from '../hooks/useAuth.js';
export default function ProtectedRoute({ children, roles }) {
  const { authenticated, loading, error, refresh, user } = useAuth();
  if (loading) return <p className="p-8" role="status">Checking authentication...</p>;
  if (error) return <div className="p-8" role="alert"><p>{error}</p><button onClick={refresh}>Retry</button></div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  if(roles&&!roles.includes(user?.role)) return <Navigate to={roleHome(user)} replace />;
  return children || <Outlet />;
}
