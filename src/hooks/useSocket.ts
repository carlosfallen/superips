// src/hooks/useSocket.ts
import { io } from 'socket.io-client';
import { getToken } from './useAuth';

export const useSocket = () => {
  const connect = () => {
    try {
      const token = getToken();
      if (!token) {
        console.warn('No token available for socket connection');
        return;
      }

      const socket = io({
        auth: {
          token
        }
      });

      socket.on('connect', () => {
        console.log('Socket connected');
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });

      return () => {
        socket.disconnect();
      };
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

  const disconnect = () => {
    // Implementation of disconnect logic
  };

  return { connect, disconnect };
};
