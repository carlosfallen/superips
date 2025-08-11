import { useEffect } from 'react';
import { useNotificationStore } from '../store/notifications';
import { useAuthStore } from '../store/auth';

export const useNotifications = () => {
  const { user } = useAuthStore();
  const { 
    notifications, 
    unreadCount, 
    addNotification, 
    markAsRead, 
    markAllAsRead,
    setNotifications 
  } = useNotificationStore();

  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  };

  // Show browser notification
  const showBrowserNotification = (title: string, message: string, type: string = 'info') => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: message,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: 'super-ips-notification',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    }
  };

  useEffect(() => {
    if (user?.token) {
      requestNotificationPermission();
    }
  }, [user]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    setNotifications,
    showBrowserNotification,
    requestNotificationPermission,
  };
};