// src/services/socket.ts - Versão melhorada com sincronização otimizada
import { io, Socket } from 'socket.io-client';
import { useDevicesStore } from '../store/devices';

export interface SocketEvents {
  deviceStatusUpdate: (data: { id: number; status: number; timestamp: string }) => void;
  deviceUpdated: (device: any) => void;
  printerStatusUpdate: (data: { id: number; online: number }) => void;
  boxStatusUpdate: (data: { id: number; power_status: number }) => void;
  taskCreated: (task: any) => void;
  taskUpdated: (task: any) => void;
  taskDeleted: (data: { id: number }) => void;
  serverStatusUpdate: (status: any) => void;
  serverHealth: (data: { databaseHealthy: boolean; uptime: number }) => void;
  bulkDeviceUpdate: (devices: any[]) => void;
  connectionEstablished: () => void;
  error: (error: { message: string; code?: string }) => void;
}

interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  lastConnectionTime: number | null;
  connectionAttempts: number;
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private toastCallback: ((toast: any) => void) | null = null;
  private isConnecting = false;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionState: ConnectionState = {
    isConnected: false,
    isReconnecting: false,
    lastConnectionTime: null,
    connectionAttempts: 0,
  };
  private stateChangeCallbacks: Set<(state: ConnectionState) => void> = new Set();

  // Callback para mudanças de estado de conexão
  onConnectionStateChange(callback: (state: ConnectionState) => void) {
    this.stateChangeCallbacks.add(callback);
    return () => this.stateChangeCallbacks.delete(callback);
  }

  private notifyStateChange() {
    this.stateChangeCallbacks.forEach(callback => callback({ ...this.connectionState }));
  }

  setToastCallback(callback: (toast: any) => void) {
    this.toastCallback = callback;
  }

  addEventListener<K extends keyof SocketEvents>(
    event: K,
    listener: SocketEvents[K]
  ) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);

    if (this.socket?.connected) {
      this.socket.on(event, listener as any);
    }

    return () => this.removeEventListener(event, listener);
  }

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

    if (this.socket?.connected) {
      this.socket.off(event, listener as any);
    }
  }

  connect() {
    if (this.socket?.connected || this.isConnecting) return this.socket;

    this.isConnecting = true;
    this.connectionState.isReconnecting = this.reconnectAttempts > 0;
    this.connectionState.connectionAttempts++;
    this.notifyStateChange();

    const serverUrl = this.getServerUrl();
    
    console.log(`🔌 Connecting to: ${serverUrl} (attempt ${this.connectionState.connectionAttempts})`);
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: false,
      autoConnect: true,
      reconnection: false, // Gerenciamos reconnexão manualmente
    });

    this.setupEventListeners();
    return this.socket;
  }

  private getServerUrl(): string {
    if (import.meta.env.DEV) {
      return `${import.meta.env.VITE_SERVER || 'http://localhost'}:${import.meta.env.VITE_PORT || '5174'}`;
    }
    return `${window.location.protocol}//${window.location.host}`;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      
      this.connectionState.isConnected = true;
      this.connectionState.isReconnecting = false;
      this.connectionState.lastConnectionTime = Date.now();
      this.notifyStateChange();

      this.startHeartbeat();
      this.reapplyEventListeners();
      this.requestInitialSync();

      if (this.toastCallback && this.connectionState.connectionAttempts > 1) {
        this.toastCallback({
          title: 'Reconectado',
          description: 'Conexão com servidor restaurada',
          variant: 'default',
        });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
      this.isConnecting = false;
      this.connectionState.isConnected = false;
      this.notifyStateChange();
      
      this.stopHeartbeat();
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect automatically
        return;
      }
      
      this.handleReconnection();
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error);
      this.isConnecting = false;
      this.connectionState.isConnected = false;
      this.notifyStateChange();
      
      this.handleReconnection();
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      if (this.toastCallback) {
        this.toastCallback({
          title: 'Erro de Conexão',
          description: error.message || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    });

    this.setupDefaultEventListeners();
  }

  private reapplyEventListeners() {
    this.eventListeners.forEach((listeners, event) => {
      listeners.forEach(listener => {
        this.socket!.on(event, listener as any);
      });
    });
  }

  private requestInitialSync() {
    // Solicita sincronização inicial dos dados
    this.emit('requestSync', { timestamp: Date.now() });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', Date.now());
      }
    }, 25000); // Ping a cada 25 segundos
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private setupDefaultEventListeners() {
    if (!this.socket) return;

    // Pong response para manter conexão viva
    this.socket.on('pong', (timestamp) => {
      const latency = Date.now() - timestamp;
      console.log(`🏓 Pong received, latency: ${latency}ms`);
    });

    // Server health status
    this.socket.on('serverHealth', (data) => {
      console.log('🖥️ Server health:', data);
      if (!data.databaseHealthy && this.toastCallback) {
        this.toastCallback({
          title: 'Alerta do Servidor',
          description: 'Banco de dados com problemas',
          variant: 'destructive',
        });
      }
    });

    // Bulk device updates (para sincronização inicial)
    this.socket.on('bulkDeviceUpdate', (devices) => {
      console.log('📦 Bulk device update received:', devices.length);
      useDevicesStore.getState().setDevices(devices);
    });

    // Device status updates com debounce
    let deviceUpdateTimeout: NodeJS.Timeout;
    this.socket.on('deviceStatusUpdate', (data) => {
      console.log('📱 Device status update:', data);
      
      // Debounce para evitar muitas atualizações simultâneas
      clearTimeout(deviceUpdateTimeout);
      deviceUpdateTimeout = setTimeout(() => {
        useDevicesStore.getState().updateDeviceStatus(data.id, data.status);
        
        if (this.toastCallback) {
          this.toastCallback({
            title: data.status ? 'Dispositivo Online' : 'Dispositivo Offline',
            description: `ID: ${data.id} - ${new Date(data.timestamp).toLocaleTimeString()}`,
            variant: data.status ? 'default' : 'destructive',
          });
        }
      }, 100);
    });

    // Device updates
    this.socket.on('deviceUpdated', (device) => {
      console.log('📝 Device updated:', device);
      useDevicesStore.getState().updateDevice(device);
    });

    // Printer status updates
    this.socket.on('printerStatusUpdate', (data) => {
      console.log('🖨️ Printer status update:', data);
      // Atualizar store de impressoras se existir
    });

    // Box status updates
    this.socket.on('boxStatusUpdate', (data) => {
      console.log('📦 Box status update:', data);
      // Atualizar store de caixas se existir
    });

    // Task management
    this.socket.on('taskCreated', (task) => {
      console.log('✅ Task created:', task);
      // useTasksStore.getState().addTask(task);
    });

    this.socket.on('taskUpdated', (task) => {
      console.log('📝 Task updated:', task);
      // useTasksStore.getState().updateTask(task);
    });

    this.socket.on('taskDeleted', (data) => {
      console.log('🗑️ Task deleted:', data);
      // useTasksStore.getState().removeTask(data.id);
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.connectionState.isReconnecting = false;
      this.notifyStateChange();
      
      if (this.toastCallback) {
        this.toastCallback({
          title: 'Falha na Conexão',
          description: 'Não foi possível reconectar ao servidor',
          variant: 'destructive',
        });
      }
      return;
    }

    this.reconnectAttempts++;
    this.connectionState.isReconnecting = true;
    this.notifyStateChange();
    
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`);

    if (this.toastCallback && this.reconnectAttempts === 1) {
      this.toastCallback({
        title: 'Reconectando...',
        description: `Tentativa ${this.reconnectAttempts} de ${this.maxReconnectAttempts}`,
        variant: 'default',
      });
    }

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2 + Math.random() * 1000,
      this.maxReconnectDelay
    );
  }

  // Métodos públicos melhorados
  forceDeviceCheck(deviceId: number) {
    if (this.socket?.connected) {
      console.log(`🔍 Forcing device check for ID: ${deviceId}`);
      this.socket.emit('forceDeviceCheck', deviceId);
      return true;
    }
    console.warn('❌ Cannot force device check - not connected');
    return false;
  }

  joinRoom(room: string) {
    if (this.socket?.connected) {
      console.log(`🚪 Joining room: ${room}`);
      this.socket.emit('joinRoom', room);
      return true;
    }
    return false;
  }

  leaveRoom(room: string) {
    if (this.socket?.connected) {
      console.log(`🚪 Leaving room: ${room}`);
      this.socket.emit('leaveRoom', room);
      return true;
    }
    return false;
  }

  emit(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      return true;
    }
    console.warn(`❌ Cannot emit ${event} - not connected`);
    return false;
  }

  // Método para forçar reconexão manual
  forceReconnect() {
    console.log('🔄 Force reconnecting...');
    this.disconnect();
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    setTimeout(() => this.connect(), 100);
  }

  disconnect() {
    console.log('🔌 Disconnecting socket...');
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnecting = false;
    this.connectionState.isConnected = false;
    this.connectionState.isReconnecting = false;
    this.notifyStateChange();
    this.eventListeners.clear();
  }

  // Getters
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Método para sincronização manual
  requestDataSync() {
    if (this.socket?.connected) {
      this.emit('requestFullSync', { timestamp: Date.now() });
      return true;
    }
    return false;
  }
}

// Singleton instance
export const socketService = new SocketService();
export default socketService;