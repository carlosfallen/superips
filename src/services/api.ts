import axios from 'axios';
import { useAuthStore } from '../store/auth';

// Função para obter a URL base dinamicamente
const getApiBaseUrl = () => {
  // Se estiver em desenvolvimento, usar variáveis de ambiente
  if (import.meta.env.DEV) {
    return `${import.meta.env.VITE_SERVER || 'http://localhost'}:${import.meta.env.VITE_PORT || '5173'}`;
  }
  
  // Em produção, usar a mesma origem (protocolo + hostname + porta)
  return `${window.location.protocol}//${window.location.host}`;
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().user?.token || localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API service functions
export const apiService = {
  // Auth
  login: (credentials: { username: string; password: string }) =>
    api.post('/api/auth/login', credentials),
  
  register: (userData: { username: string; password: string; email?: string }) =>
    api.post('/api/auth/register', userData),

  // Devices
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