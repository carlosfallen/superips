import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserSettings {
  id?: number;
  user_id?: number;
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications_enabled: boolean;
  email_notifications: boolean;
  refresh_interval: number;
  timezone: string;
  created_at?: string;
  updated_at?: string;
}

interface SettingsState {
  settings: UserSettings;
  isLoading: boolean;
  error: string | null;
  updateSettings: (settings: Partial<UserSettings>) => void;
  setSettings: (settings: UserSettings) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetSettings: () => void;
}

const defaultSettings: UserSettings = {
  theme: 'system',
  language: 'pt-BR',
  notifications_enabled: true,
  email_notifications: false,
  refresh_interval: 30,
  timezone: 'America/Sao_Paulo',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      isLoading: false,
      error: null,

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
          error: null,
        }));
      },

      setSettings: (settings) => {
        set({ settings, error: null });
      },

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      resetSettings: () => {
        set({ settings: defaultSettings, error: null });
      },
    }),
    {
      name: 'user-settings',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);