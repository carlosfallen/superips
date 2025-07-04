import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useAuthStore } from '../store/auth';
import { useToast } from './use-toast';

export const useSocket = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();

  useEffect(() => {
    if (user?.token) {
      // Set the toast callback before connecting
      socketService.setToastCallback(toast);
      socketService.connect();
    }

    return () => {
      socketService.disconnect();
    };
  }, [user, toast]);

  return {
    forceDeviceCheck: socketService.forceDeviceCheck.bind(socketService),
    joinRoom: socketService.joinRoom.bind(socketService),
    leaveRoom: socketService.leaveRoom.bind(socketService),
    isConnected: socketService.isConnected.bind(socketService),
  };
};