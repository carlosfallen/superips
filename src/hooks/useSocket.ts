import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/auth';

export const useSocket = () => {
  const { user } = useAuthStore();

  useEffect(() => {
    if (user?.token) {
      socketService.connect();
    }

    return () => {
      socketService.disconnect();
    };
  }, [user]);

  return {
    forceDeviceCheck: socketService.forceDeviceCheck.bind(socketService),
    joinRoom: socketService.joinRoom.bind(socketService),
    leaveRoom: socketService.leaveRoom.bind(socketService),
    isConnected: socketService.isConnected.bind(socketService),
  };
};