import axios from 'axios';
import { useAuthStore } from '../store/auth';

// Função para obter a URL base dinamicamente (mantendo sua lógica)
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return `${import.meta.env.VITE_SERVER || 'http://localhost'}:${import.meta.env.VITE_PORT || '5173'}`;
  }
  return `${window.location.protocol}//${window.location.host}`;
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Aumentado para 30s
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor MELHORADO com renovação automática
api.interceptors.request.use(
  async (config) => {
    try {
      // Tentar obter token válido (com renovação automática)
      const getValidToken = useAuthStore.getState().getValidToken;
      const token = await getValidToken();
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        // Fallback para compatibilidade com código existente
        const fallbackToken = useAuthStore.getState().user?.token || localStorage.getItem('authToken');
        if (fallbackToken) {
          config.headers.Authorization = `Bearer ${fallbackToken}`;
        }
      }
      
      return config;
    } catch (error) {
      console.error('❌ Request interceptor error:', error);
      return config;
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor MELHORADO
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response && error.response.status === 401) {
      const errorData = error.response.data;
      
      console.warn('❌ 401 Unauthorized:', errorData);
      
      // Se é erro de token expirado e ainda não tentou renovar
      if (errorData?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
        originalRequest._retry = true;
        
        try {
          console.log('🔄 Attempting to refresh token...');
          const refreshToken = useAuthStore.getState().refreshToken;
          await refreshToken();
          
          // Retry request com novo token
          const getValidToken = useAuthStore.getState().getValidToken;
          const newToken = await getValidToken();
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          console.error('❌ Token refresh failed:', refreshError);
        }
      }
      
      // Se chegou aqui, fazer logout
      console.warn('🔄 Authentication failed, logging out...');
      useAuthStore.getState().logout();
    }
    
    if (error.response && error.response.status === 403) {
      console.warn('❌ 403 Forbidden - Invalid token, logging out...');
      useAuthStore.getState().logout();
    }
    
    return Promise.reject(error);
  }
);

// API service functions (mantendo suas funções existentes + novas)
export const apiService = {
  // Auth (NOVOS endpoints JWT)
  login: async (credentials: { username: string; password: string }) => {
    const response = await api.post('/api/auth/login', credentials);
    return response;
  },
  
  register: (userData: { username: string; password: string; email?: string }) =>
    api.post('/api/auth/register', userData),

  refreshToken: () => api.post('/api/auth/refresh'),

  // Devices (mantendo seus endpoints existentes)
  getDevices: () => api.get('/api/devices'),
  updateDevice: (id: number, data: any) => api.put(`/api/devices/${id}`, data),
  exportDevices: () => api.get('/api/devices/export', { responseType: 'blob' }),

  // Routers
  getRouters: () => api.get('/api/routers'),

  // Printers
  getPrinters: () => api.get('/api/printers'),
  updatePrinterStatus: (id: number, online: number) =>
    api.post(`/api/printers/${id}/online`, { online }),

  // Boxes
  getBoxes: () => api.get('/api/boxes'),
  updateBoxPowerStatus: (id: number, power_status: number) =>
    api.post(`/api/boxes/${id}/power-status`, { power_status }),

  // Tasks
  getTasks: () => api.get('/api/tasks'),
  createTask: (taskData: any) => api.post('/api/tasks', taskData),
  updateTask: (id: number, taskData: any) => api.put(`/api/tasks/${id}`, taskData),
  deleteTask: (id: number) => api.delete(`/api/tasks/${id}`),

  // Settings
  getSettings: () => api.get('/api/settings'),
  updateSettings: (settings: any) => api.put('/api/settings', settings),

  // Server status
  getServerStatus: () => api.get('/api/server-status'),
};

export default api;
export { api };