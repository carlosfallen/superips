import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Task {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  category: string;
  due_date: string;
  assigned_to?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  removeTask: (id: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getTasksByStatus: (status: Task['status']) => Task[];
  getTasksByPriority: (priority: Task['priority']) => Task[];
  getOverdueTasks: () => Task[];
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      isLoading: false,
      error: null,

      setTasks: (tasks) => set({ tasks, error: null }),

      addTask: (task) => {
        set((state) => ({
          tasks: [task, ...state.tasks],
          error: null,
        }));
      },

      updateTask: (updatedTask) => {
        set((state) => ({
          tasks: state.tasks.map(task =>
            task.id === updatedTask.id ? updatedTask : task
          ),
          error: null,
        }));
      },

      removeTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter(task => task.id !== id),
          error: null,
        }));
      },

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      getTasksByStatus: (status) => {
        return get().tasks.filter(task => task.status === status);
      },

      getTasksByPriority: (priority) => {
        return get().tasks.filter(task => task.priority === priority);
      },

      getOverdueTasks: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().tasks.filter(task => 
          task.due_date && 
          task.due_date < today && 
          task.status !== 'completed'
        );
      },
    }),
    {
      name: 'tasks-storage',
      partialize: (state) => ({
        tasks: state.tasks,
      }),
    }
  )
);