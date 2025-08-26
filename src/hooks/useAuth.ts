import { create } from 'zustand';
import axios from 'axios';

interface AuthState {
  isAuthenticated: boolean;
  user: any | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  setLoading: (loading: boolean) => void;
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

export const useAuth = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  token: localStorage.getItem('token'),
  loading: false,
  error: null,

  setLoading: (loading: boolean) => set({ loading }),

  login: async (username: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { username, password });
      
      if (data.token) {
        localStorage.setItem('token', data.token);
        set({ 
          isAuthenticated: true, 
          user: data.user,
          token: data.token,
          error: null 
        });
      }
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Login failed',
        isAuthenticated: false,
        user: null 
      });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({
      isAuthenticated: false,
      user: null,
      token: null,
      error: null
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      set({ 
        isAuthenticated: false,
        user: null,
        token: null,
        error: null
      });
      return false;
    }

    try {
      const { data } = await api.get('/auth/verify', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data.valid) {
        set({ 
          isAuthenticated: true,
          user: data.user,
          token,
          error: null
        });
        return true;
      }
    } catch (error) {
      localStorage.removeItem('token');
      set({
        isAuthenticated: false,
        user: null,
        token: null,
        error: null
      });
    }
    
    return false;
  }
}));

export const getToken = () => localStorage.getItem('token');
