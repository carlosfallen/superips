// ============================================
// 4. COMPONENTS/PROTECTED-ROUTE.TSX
// ============================================

import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner'; // Componente de loading

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  fallback 
}) => {
  const { isAuthenticated, getToken } = useAuth();
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const validateAuth = async () => {
      try {
        if (!isAuthenticated) {
          setIsValid(false);
          return;
        }

        // Verificar se consegue obter token válido
        const token = await getToken();
        setIsValid(!!token);
      } catch (error) {
        console.error('❌ Auth validation failed:', error);
        setIsValid(false);
      } finally {
        setIsValidating(false);
      }
    };

    validateAuth();
  }, [isAuthenticated, getToken]);

  if (isValidating) {
    return <LoadingSpinner />;
  }

  if (!isValid) {
    return fallback || <div>Please log in to access this page.</div>;
  }

  return <>{children}</>;
};