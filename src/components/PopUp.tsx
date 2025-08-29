import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  User,
  Settings,
  LogOut,
  HelpCircle,
  UserCircle,
  Info,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import axios from 'axios';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';

// URL base da API
const API_BASE_URL = `${import.meta.env.VITE_SERVER}:${import.meta.env.VITE_PORT}`;

// Tipos para as notificações
type Notification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'success';
  relatedId?: string;
  deviceName?: string;
  deviceType?: string;
};

// Tipo para o usuário
type UserProfile = {
  id: number;
  username: string;
  email?: string;
  name?: string;
  avatar?: string | null;
  role?: string;
  lastLogin?: string;
};

// Tipo para os dropdowns ativos
type ActiveDropdown = 'notifications' | 'profile' | null;

// Função para formatar timestamp
const formatTimestamp = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7) return `${days}d atrás`;
  return date.toLocaleDateString('pt-BR');
};

// Componente de Menu do Usuário
const UserProfileMenu = ({ 
  logout, 
  isOpen, 
  onToggle 
}: { 
  logout: () => void;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const [user, setUser] = useState<UserProfile>({
    id: 0,
    username: 'Carregando...',
    email: '',
    name: '',
    avatar: null,
    role: '',
    lastLogin: ''
  });
  
  const [loading, setLoading] = useState<boolean>(true);
  
  // Função para obter informações do usuário a partir do token armazenado
  const getUserInfoFromToken = () => {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    
    try {
      // Extrair payload do JWT
      const payload = JSON.parse(atob(token.split('.')[1]));
      
      return {
        id: payload.id,
        username: payload.username,
        name: payload.username,
        email: `${payload.username}@grupojorgebatista.com.br`,
        role: 'Técnico de TI',
      };
    } catch (error) {
      console.error('Erro ao decodificar token:', error);
      return null;
    }
  };
  
  // Carregar dados do usuário logado
  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const tokenInfo = getUserInfoFromToken();
        
        if (tokenInfo) {
          const userData: UserProfile = {
            ...tokenInfo,
            avatar: null,
            role: tokenInfo.username === 'admin' ? 'Administrador' : 'Técnico de TI',
            lastLogin: new Date().toISOString()
          };
          
          setUser(userData);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, []);

  const formatDisplayName = (username: string) => {
    return username
      .split('.')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.username}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <User className="h-5 w-5" />
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 z-50 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <UserCircle className="h-8 w-8 text-white" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {loading ? 'Carregando...' : formatDisplayName(user.username)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {loading ? 'Carregando...' : user.email}
                </p>
                <Badge variant="secondary" className="mt-1 text-xs">
                  {loading ? '' : user.role}
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="p-2">
            <button
              onClick={() => {
                window.location.href = '/settings';
                onToggle();
              }}
              className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <Settings className="h-4 w-4 mr-3" />
              Configurações
            </button>

            <button
              onClick={() => {
                window.location.href = '/help';
                onToggle();
              }}
              className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <HelpCircle className="h-4 w-4 mr-3" />
              Ajuda
            </button>

            <button
              onClick={() => {
                logout();
                onToggle();
              }}
              className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente de Notificações
const NotificationsPopover = ({ 
  isOpen, 
  onToggle 
}: { 
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Referências para dados anteriores
  const prevDeviceDataRef = useRef<any[]>([]);
  const prevPrinterDataRef = useRef<any[]>([]);

  // Função para detectar mudanças e gerar notificações
  const generateStatusNotifications = (
    currentDevices: any[],
    currentPrinters: any[]
  ) => {
    const newNotifications: Notification[] = [];
    const now = new Date();

    // Verificar mudanças em dispositivos
    currentDevices.forEach(device => {
      const prevDevice = prevDeviceDataRef.current.find(d => d.id === device.id);
      
      if (prevDevice && prevDevice.status !== device.status) {
        const isOnline = device.status === 1;
        newNotifications.push({
          id: `device-${device.id}-${now.getTime()}`,
          title: isOnline ? 'Dispositivo Online' : 'Dispositivo Offline',
          message: `${device.name} (${device.ip}) está ${isOnline ? 'online' : 'offline'}.`,
          read: false,
          timestamp: formatTimestamp(now),
          type: isOnline ? 'success' : 'error',
          relatedId: device.id.toString(),
          deviceName: device.name,
          deviceType: device.type
        });
      }
    });

    // Verificar mudanças em impressoras
    currentPrinters.forEach(printer => {
      const prevPrinter = prevPrinterDataRef.current.find(p => p.id === printer.id);
      
      if (prevPrinter && prevPrinter.online !== printer.online) {
        const isOnline = printer.online === 1;
        newNotifications.push({
          id: `printer-${printer.id}-${now.getTime()}`,
          title: isOnline ? 'Impressora Online' : 'Impressora Offline',
          message: `A impressora ${printer.model} (${printer.ip}) está ${isOnline ? 'online' : 'offline'}.`,
          read: false,
          timestamp: formatTimestamp(now),
          type: isOnline ? 'success' : 'warning',
          relatedId: printer.id.toString(),
          deviceName: printer.model,
          deviceType: 'Impressora'
        });
      }
    });

    return newNotifications;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [devicesRes, printersRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/devices`, {
            headers: {
              'Content-Type': 'application/json'
            }
          }),
          axios.get(`${API_BASE_URL}/api/printers`, {
            headers: {
              'Content-Type': 'application/json'
            }
          })
        ]);

        const currentDevices = devicesRes.data;
        const currentPrinters = printersRes.data;

        // Gerar notificações apenas para mudanças de status
        const statusNotifications = generateStatusNotifications(
          currentDevices,
          currentPrinters
        );

        if (statusNotifications.length > 0) {
          setNotifications(prev => [...statusNotifications, ...prev.slice(0, 20)]);
          
          // Mostrar toast para notificações importantes
          statusNotifications.forEach(notification => {
            if (notification.type === 'error') {
              toast({
                title: notification.title,
                description: notification.message,
                variant: "destructive"
              });
            }
          });
        }

        // Atualizar referências para dados anteriores
        prevDeviceDataRef.current = currentDevices;
        prevPrinterDataRef.current = currentPrinters;

      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoading(false);
      }
    };

    // Buscar dados inicial
    fetchData();
    
    // Configurar polling a cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [toast]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(notif =>
      notif.id === id ? { ...notif, read: true } : notif
    ));
  };
  
  const markAllAsRead = () => {
    setNotifications(notifications.map(notif => ({ ...notif, read: true })));
  };
  
  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      case 'success':
        return <Wifi className="h-4 w-4 text-green-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0 animate-pulse"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 z-50 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Notificações
              </h3>
              {unreadCount > 0 && (
                <Badge variant="secondary">
                  {unreadCount} nova{unreadCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-2">Carregando notificações...</p>
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
                    !notification.read ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  } cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {notification.timestamp}
                        </p>
                        {notification.deviceType && (
                          <Badge variant="outline" className="text-xs">
                            {notification.deviceType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Nenhuma notificação</h3>
                <p className="text-sm">
                  Você será notificado sobre mudanças no status dos dispositivos
                </p>
              </div>
            )}
          </div>
          
          {notifications.length > 0 && unreadCount > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="w-full text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
              >
                Marcar todas como lidas
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Componente contenedor que gerencia o estado
const HeaderDropdowns = ({ logout }: { logout: () => void }) => {
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);

  const handleToggle = (dropdown: ActiveDropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  // Fechar dropdowns quando clicar fora
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center space-x-2 dropdown-container" onClick={(e) => e.stopPropagation()}>
      <NotificationsPopover 
        isOpen={activeDropdown === 'notifications'}
        onToggle={() => handleToggle('notifications')}
      />
      <UserProfileMenu 
        logout={logout}
        isOpen={activeDropdown === 'profile'}
        onToggle={() => handleToggle('profile')}
      />
    </div>
  );
};

export { 
  HeaderDropdowns, 
  NotificationsPopover, 
  UserProfileMenu
};