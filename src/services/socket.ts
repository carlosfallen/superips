// src/services/socket.ts - Versão refatorada
import { io, Socket } from 'socket.io-client';
import { useDevicesStore } from '../store/devices';

export interface SocketEvents {
  deviceStatusUpdate: (data: { id: number; status: number }) => void;
  deviceUpdated: (device: any) => void;
  printerStatusUpdate: (data: any) => void;
  boxStatusUpdate: (data: any) => void;
  taskCreated: (task: any) => void;
  taskUpdated: (task: any) => void;
  taskDeleted: (data: any) => void;
  serverStatusUpdate: (status: any) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private toastCallback: ((toast: any) => void) | null = null;
  private isConnecting = false;
  private eventListeners: Map<string, Set<Function>> = new Map();

  // Método para definir callback de toast
  setToastCallback(callback: (toast: any) => void) {
    this.toastCallback = callback;
  }

  // Método para adicionar listeners customizados
  addEventListener<K extends keyof SocketEvents>(
    event: K,
    listener: SocketEvents[K]
  ) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);

    // Se o socket já está conectado, adiciona o listener imediatamente
    if (this.socket?.connected) {
      this.socket.on(event, listener as any);
    }
  }

  // Método para remover listeners customizados
  removeEventListener<K extends keyof SocketEvents>(
    event: K,
    listener: SocketEvents[K]
  ) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }

    // Remove do socket se conectado
    if (this.socket?.connected) {
      this.socket.off(event, listener as any);
    }
  }

  // Método para conectar (singleton)
  connect() {
    if (this.socket?.connected || this.isConnecting) return this.socket;

    this.isConnecting = true;
    const serverUrl = `${import.meta.env.VITE_SERVER || 'http://localhost'}:${import.meta.env.VITE_PORT || '5174'}`;
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: false, // Reutiliza conexão se possível
    });

    this.setupEventListeners();
    return this.socket;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Eventos de conexão
    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Reaplica todos os listeners customizados
      this.eventListeners.forEach((listeners, event) => {
        listeners.forEach(listener => {
          this.socket!.on(event, listener as any);
        });
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
      this.isConnecting = false;
      this.handleReconnection();
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error);
      this.isConnecting = false;
      this.handleReconnection();
    });

    // Eventos padrão do sistema
    this.setupDefaultEventListeners();
  }

  private setupDefaultEventListeners() {
    if (!this.socket) return;

    // Device status updates
    this.socket.on('deviceStatusUpdate', (data) => {
      console.log('📱 Device status update:', data);
      useDevicesStore.getState().updateDeviceStatus(data.id, data.status);
      
      if (this.toastCallback) {
        this.toastCallback({
          title: data.status ? 'Dispositivo Online' : 'Dispositivo Offline',
          description: `Status atualizado em tempo real`,
          variant: data.status ? 'default' : 'destructive',
        });
      }
    });

    // Device updates
    this.socket.on('deviceUpdated', (device) => {
      console.log('📝 Device updated:', device);
      useDevicesStore.getState().updateDevice(device);
    });

    // Printer status updates
    this.socket.on('printerStatusUpdate', (data) => {
      console.log('🖨️ Printer status update:', data);
    });

    // Box status updates
    this.socket.on('boxStatusUpdate', (data) => {
      console.log('📦 Box status update:', data);
    });

    // Task updates
    this.socket.on('taskCreated', (task) => {
      console.log('✅ Task created:', task);
    });

    this.socket.on('taskUpdated', (task) => {
      console.log('📝 Task updated:', task);
    });

    this.socket.on('taskDeleted', (data) => {
      console.log('🗑️ Task deleted:', data);
    });

    // Server status updates
    this.socket.on('serverStatusUpdate', (status) => {
      console.log('🖥️ Server status update:', status);
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  // Métodos públicos
  forceDeviceCheck(deviceId: number) {
    if (this.socket?.connected) {
      this.socket.emit('forceDeviceCheck', deviceId);
    }
  }

  joinRoom(room: string) {
    if (this.socket?.connected) {
      this.socket.emit('joinRoom', room);
    }
  }

  leaveRoom(room: string) {
    if (this.socket?.connected) {
      this.socket.emit('leaveRoom', room);
    }
  }

  emit(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
      this.eventListeners.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Getter para acessar o socket diretamente se necessário
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Singleton instance
export const socketService = new SocketService();
export default socketService;