// src/services/api.ts - Versão melhorada com retry e cache
import axios, { AxiosInstance, AxiosError } from 'axios';
import type { Device } from '../types';

// Get base URL dynamically
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return `${import.meta.env.VITE_SERVER || 'http://10.0.11.150:5174'}/api`;
  }
  return `${window.location.protocol}//${window.location.host}/api`;
};

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add timestamp to prevent browser caching
  if (config.method === 'get') {
    config.params = { 
      ...config.params,
      _t: Date.now() 
    };
  }
  
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

class ApiService {
  // Auth methods
  async login(credentials: { username: string; password: string }) {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  }

  async refreshToken() {
    const response = await api.post('/auth/refresh');
    return response.data;
  }

  async verify() {
    const response = await api.get('/auth/verify');
    return response.data;
  }

  // Device methods
  async getDevices(): Promise<Device[]> {
    const response = await api.get('/devices');
    return response.data;
  }

  async updateDevice(id: number, device: Partial<Device>): Promise<Device> {
    const response = await api.put(`/devices/${id}`, device);
    return response.data;
  }

  async exportDevices() {
    const response = await api.get('/devices/export', { responseType: 'blob' });
    return response.data;
  }

  // Router methods
  async getRouters() {
    const response = await api.get('/routers');
    return response.data;
  }

  // Printer methods
  async getPrinters() {
    const response = await api.get('/printers');
    return response.data;
  }

  async updatePrinterStatus(id: number, online: boolean) {
    const response = await api.post(`/printers/${id}/online`, { online });
    return response.data;
  }

  // Box methods
  async getBoxes() {
    const response = await api.get('/boxes');
    return response.data;
  }

  async updateBoxPowerStatus(id: number, powerStatus: boolean) {
    const response = await api.post(`/boxes/${id}/power-status`, { power_status: powerStatus });
    return response.data;
  }

  // Task methods
  async getTasks() {
    const response = await api.get('/tasks');
    return response.data;
  }

  async createTask(taskData: any) {
    const response = await api.post('/tasks', taskData);
    return response.data;
  }

  async updateTask(id: number, taskData: any) {
    const response = await api.put(`/tasks/${id}`, taskData);
    return response.data;
  }

  async deleteTask(id: number) {
    const response = await api.delete(`/tasks/${id}`);
    return response.data;
  }

  // Settings methods
  async getSettings() {
    const response = await api.get('/settings');
    return response.data;
  }

  async updateSettings(settings: any) {
    const response = await api.put('/settings', settings);
    return response.data;
  }

  // Server status
  async getServerStatus() {
    const response = await api.get('/server-status');
    return response.data;
  }

  // Health check
  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();