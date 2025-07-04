import { io, Socket } from 'socket.io-client';
import { useDevicesStore } from '../store/devices';
import { useNotificationStore } from '../store/notifications';
import { useToast } from '../hooks/use-toast';

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect() {
    if (this.socket?.connected) return;

    const serverUrl = `${import.meta.env.VITE_SERVER || 'http://localhost'}:${import.meta.env.VITE_PORT || '5173'}`;
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to server');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
      this.handleReconnection();
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error);
      this.handleReconnection();
    });

    // Device status updates
    this.socket.on('deviceStatusUpdate', (data) => {
      console.log('📱 Device status update:', data);
      useDevicesStore.getState().updateDeviceStatus(data.id, data.status);
      
      // Show toast notification
      const { toast } = useToast();
      toast({
        title: data.status ? 'Dispositivo Online' : 'Dispositivo Offline',
        description: `Status atualizado em tempo real`,
        variant: data.status ? 'default' : 'destructive',
      });
    });

    // Device updates
    this.socket.on('deviceUpdated', (device) => {
      console.log('📝 Device updated:', device);
      useDevicesStore.getState().updateDevice(device);
    });

    // Printer status updates
    this.socket.on('printerStatusUpdate', (data) => {
      console.log('🖨️ Printer status update:', data);
      // Handle printer status update in UI
    });

    // Box status updates
    this.socket.on('boxStatusUpdate', (data) => {
      console.log('📦 Box status update:', data);
      // Handle box status update in UI
    });

    // Task updates
    this.socket.on('taskCreated', (task) => {
      console.log('✅ Task created:', task);
      // Handle new task in UI
    });

    this.socket.on('taskUpdated', (task) => {
      console.log('📝 Task updated:', task);
      // Handle task update in UI
    });

    this.socket.on('taskDeleted', (data) => {
      console.log('🗑️ Task deleted:', data);
      // Handle task deletion in UI
    });

    // Notifications
    this.socket.on('newNotification', (notification) => {
      console.log('🔔 New notification:', notification);
      useNotificationStore.getState().addNotification(notification);
      
      // Show toast notification
      const { toast } = useToast();
      toast({
        title: notification.title,
        description: notification.message,
        variant: notification.type === 'error' ? 'destructive' : 'default',
      });
    });

    // Server status updates
    this.socket.on('serverStatusUpdate', (status) => {
      console.log('🖥️ Server status update:', status);
      // Handle server status update in UI
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

  // Public methods
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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();
export default socketService;