import { useCallback } from 'react';
import { useAuthStore, User } from '../store/auth';
import { apiService } from '../services/api'; // ou onde estiver sua API

interface LoginCredentials {
  username: string;
  password: string;
}

interface LoginResponse {
  id: number;
  username: string;
  role: string;
  token: string;
  tokenExpiry?: string;
}

export const useAuth = () => {
  const { 
    user, 
    token, 
    setAuth, 
    logout: logoutStore, 
    isTokenExpired,
    isTokenExpiringSoon,
    getValidToken 
  } = useAuthStore();

  // Login function (atualizada para JWT)
  const login = useCallback(async (credentials: LoginCredentials): Promise<User> => {
    try {
      const response = await apiService.login(credentials);
      const data: LoginResponse = response.data;
      
      // Salvar no store Zustand
      const userObj: User = {
        id: data.id,
        username: data.username,
        role: data.role,
        token: data.token // Manter compatibilidade
      };
      
      setAuth(userObj, data.token, data.tokenExpiry);

      console.log('✅ Login successful');
      
      return userObj;
    } catch (error: any) {
      console.error('❌ Login error:', error);
      
      // Manter compatibilidade com mensagens de erro existentes
      const message = error.response?.data?.message || error.message || 'Login failed';
      throw new Error(message);
    }
  }, [setAuth]);

  // Logout function
  const logout = useCallback(() => {
    logoutStore();
    console.log('✅ Logout completed');
  }, [logoutStore]);

  // Verificar se usuário está autenticado
  const isAuthenticated = useCallback((): boolean => {
    return !!(user && token && !isTokenExpired());
  }, [user, token, isTokenExpired]);

  // Obter token válido para uso manual
  const getToken = useCallback(async (): Promise<string | null> => {
    return await getValidToken();
  }, [getValidToken]);

  return {
    user,
    token,
    login,
    logout,
    isAuthenticated,
    getToken,
    isTokenExpired: isTokenExpired(),
    isTokenExpiringSoon: isTokenExpiringSoon()
  };
};