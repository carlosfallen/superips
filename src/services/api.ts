import axios, { AxiosInstance, AxiosError } from 'axios';
import type { Device } from '../types';

const api: AxiosInstance = axios.create({
  baseURL: 'http://10.0.11.150:5173/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

class ApiService {
  async getDevices(): Promise<Device[]> {
    const response = await api.get('/devices');
    return response.data;
  }

  async createDevice(device: Partial<Device>): Promise<Device> {
    const response = await api.post('/devices', device);
    return response.data;
  }

  async updateDevice(id: number, device: Partial<Device>): Promise<Device> {
    const response = await api.put(`/devices/${id}`, device);
    return response.data;
  }

  async deleteDevice(id: number) {
    const response = await api.delete(`/devices/${id}`);
    return response.data;
  }

  async getRouters() {
    const response = await api.get('/routers');
    return response.data;
  }

  async getPrinters() {
    const response = await api.get('/printers');
    return response.data;
  }

  async getBoxes() {
    const response = await api.get('/boxes');
    return response.data;
  }

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
}

export const apiService = new ApiService();