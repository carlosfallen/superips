import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';
import Login from '../pages/Login';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return isAuthenticated ? <>{children}</> : <Login onLoginSuccess={checkAuth} />
;
};
  