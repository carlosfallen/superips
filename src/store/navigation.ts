import { create } from 'zustand';

export type Page =
  | 'login'
  | 'dashboard'
  | 'devices'
  | 'printers'
  | 'routers'
  | 'boxes'
  | 'tasks'
  | 'settings'
  | 'sheet';

interface NavigationState {
  currentPage: Page;
  setPage: (page: Page) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'login',
  setPage: (page) => set({ currentPage: page }),
}));