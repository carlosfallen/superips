
// ============================================
// 1. ATUALIZAÇÃO DO STORE AUTH - src/store/auth.ts
// ============================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: number;
  username: string;
  role: string;
  token: string; // Manter compatibilidade com código existente
}

interface AuthState {
  user: User | null;
  token: string | null;
  tokenExpiry: string | null;
  setAuth: (user: User, token: string, tokenExpiry?: string) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
  isTokenExpired: () => boolean;
  isTokenExpiringSoon: () => boolean;
  getValidToken: () => Promise<string | null>;
  refreshToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tokenExpiry: null,

      // Salvar dados completos de autenticação
      setAuth: (user, token, tokenExpiry) => {
        const expiry = tokenExpiry || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        // Criar objeto user com token para manter compatibilidade
        const userWithToken = { ...user, token };
        
        set({ 
          user: userWithToken, 
          token, 
          tokenExpiry: expiry 
        });
        
        // Também salvar no localStorage para compatibilidade
        localStorage.setItem('authToken', token);
      },

      // Manter compatibilidade com código existente
      setUser: (user) => set({ user }),

      // Logout completo
      logout: () => {
        set({ 
          user: null, 
          token: null, 
          tokenExpiry: null 
        });
        
        // Limpar localStorage
        localStorage.removeItem('authToken');
        
        // Redirecionar para login se não estiver já lá
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      },

      // Verificar se token expirou
      isTokenExpired: () => {
        const { tokenExpiry } = get();
        if (!tokenExpiry) return true;
        return new Date(tokenExpiry).getTime() < Date.now();
      },

      // Verificar se token está próximo do vencimento (5 minutos)
      isTokenExpiringSoon: () => {
        const { tokenExpiry } = get();
        if (!tokenExpiry) return true;
        const expiryTime = new Date(tokenExpiry).getTime();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        return (expiryTime - now) < fiveMinutes;
      },

      // Obter token válido (renovar se necessário)
      getValidToken: async () => {
        const { token, user, isTokenExpired, isTokenExpiringSoon, refreshToken, logout } = get();

        try {
          // Se não tem token, retornar null
          if (!token || !user) {
            return null;
          }

          // Se token já expirou, fazer logout
          if (isTokenExpired()) {
            console.warn('🔄 Token expired, logging out...');
            logout();
            return null;
          }

          // Se token está próximo do vencimento, tentar renovar
          if (isTokenExpiringSoon()) {
            console.log('🔄 Token expiring soon, refreshing...');
            
            try {
              const newToken = await refreshToken();
              return newToken;
            } catch (error) {
              console.error('❌ Token refresh failed:', error);
              logout();
              return null;
            }
          }

          return token;
        } catch (error) {
          console.error('❌ Error getting valid token:', error);
          logout();
          return null;
        }
      },

      // Renovar token
      refreshToken: async () => {
        const { token, user } = get();
        
        try {
          if (!token || !user) {
            throw new Error('No token or user to refresh');
          }

          // Usar a mesma estrutura de URL do seu código atual
          const API_BASE_URL = import.meta.env.DEV 
            ? `${import.meta.env.VITE_SERVER || 'http://localhost'}:${import.meta.env.VITE_PORT || '5173'}`
            : `${window.location.protocol}//${window.location.host}`;

          const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Refresh failed');
          }

          const data = await response.json();
          
          // Atualizar store com novos dados
          const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const updatedUser = { ...data.user, token: data.token };
          
          set({ 
            user: updatedUser,
            token: data.token,
            tokenExpiry: newExpiry
          });

          // Atualizar localStorage
          localStorage.setItem('authToken', data.token);

          console.log('✅ Token refreshed successfully');
          
          return data.token;
        } catch (error) {
          console.error('❌ Token refresh error:', error);
          throw error;
        }
      }
    }),
    {
      name: 'authToken',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token, 
        tokenExpiry: state.tokenExpiry 
      }),
    }
  )
);