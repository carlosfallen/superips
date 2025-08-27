import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

let socketInstance: Socket | null = null;
let isConnecting = false;

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const { token, isAuthenticated } = useAuth();

  const connect = useCallback(() => {
    if (isConnecting || socketInstance?.connected) {
      return;
    }

    if (!token || !isAuthenticated) {
      console.log('No token available for socket connection');
      return;
    }

    isConnecting = true;

    try {
      const serverUrl = import.meta.env.DEV 
        ? 'http://10.0.11.150:5173'
        : window.location.origin;

      socketInstance = io(serverUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = socketInstance;

      socketInstance.on('connect', () => {
        console.log('✅ Socket connected:', socketInstance?.id);
        isConnecting = false;
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('❌ Socket disconnected:', reason);
        isConnecting = false;
      });

      socketInstance.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        isConnecting = false;
      });

    } catch (error) {
      console.error('❌ Socket connection failed:', error);
      isConnecting = false;
    }
  }, [token, isAuthenticated]);

  const disconnect = useCallback(() => {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    if (socketRef.current) {
      socketRef.current = null;
    }
    isConnecting = false;
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketInstance?.connected) {
      socketInstance.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    if (socketInstance) {
      socketInstance.on(event, handler);
      return () => socketInstance?.off(event, handler);
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    socket: socketRef.current,
    connect,
    disconnect,
    emit,
    on,
    isConnected: socketInstance?.connected || false
  };
};