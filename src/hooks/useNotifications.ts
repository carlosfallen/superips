import { useEffect } from 'react';
import { useNotificationStore } from '../store/notifications';
import { apiService } from '../services/api';
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

  // Fetch notifications from server
  const fetchNotifications = async () => {
    if (!user?.token) return;

    try {
      const response = await apiService.getNotifications();
      const serverNotifications = response.data.map((notif: any) => ({
        id: notif.id.toString(),
        title: notif.title,
        message: notif.message,
        type: notif.type,
        read: Boolean(notif.read),
        timestamp: notif.created_at,
        relatedId: notif.related_id,
        deviceName: notif.device_name,
        deviceType: notif.device_type,
      }));
      
      setNotifications(serverNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  // Mark notification as read on server
  const markAsReadOnServer = async (id: string) => {
    try {
      await apiService.markNotificationAsRead(parseInt(id));
      markAsRead(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read on server
  const markAllAsReadOnServer = async () => {
    try {
      await apiService.markAllNotificationsAsRead();
      markAllAsRead();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

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
      fetchNotifications();
      requestNotificationPermission();
    }
  }, [user]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead: markAsReadOnServer,
    markAllAsRead: markAllAsReadOnServer,
    fetchNotifications,
    showBrowserNotification,
    requestNotificationPermission,
  };
};