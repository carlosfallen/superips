import React, { useState, useEffect, useRef  } from 'react';
import {
  Bell,
  User,
  Settings,
  LogOut,
  HelpCircle,
  UserCircle,
  Info,
  AlertCircle,
  Server
} from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/auth';

// URL base da API
const API_BASE_URL = 'http://10.0.11.150:5173'; // Ajuste conforme sua configuração

// Tipos para as notificações
type Notification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'success';
  relatedId?: string;
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
        // Adicione mais campos se o seu token JWT incluir outros dados
        name: payload.username, // Usando username como nome por padrão
        email: `${payload.username}@grupojorgebatista.com.br`, // Email derivado do username
        role: 'Usuário', // Valor padrão
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
        // Recuperar o token do localStorage
        const token = localStorage.getItem('authToken');
        
        if (!token) {
          console.error('Token não encontrado');
          return;
        }
        
        // Obter informações básicas do usuário a partir do token
        const tokenInfo = getUserInfoFromToken();
        
        if (tokenInfo) {
          // No seu backend atual, não há endpoint específico para perfil do usuário
          // Então vamos usar as informações do token e adicionar alguns dados extras
          
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

  // Formatar o nome do usuário para exibição
  const formatDisplayName = (username: string) => {
    // Converter para título (primeira letra de cada palavra maiúscula)
    return username
      .split('.')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
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
      </button>

      {isOpen && (
        <div className="rounded-2xl absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 shadow-lg py-2 border border-gray-200 dark:border-gray-700 z-50">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <UserCircle className="h-10 w-10 text-gray-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {loading ? 'Carregando...' : formatDisplayName(user.username)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {loading ? 'Carregando...' : user.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {loading ? '' : user.role}
                </p>
              </div>
            </div>
          </div>
          
          <Link
            to="/profile"
            className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => onToggle()}
          >
            <div className="flex items-center">
              <Settings className="h-4 w-4 mr-3" />
              Configurações
            </div>
          </Link>
          
          <Link
            to="/help"
            className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => onToggle()}
          >
            <div className="flex items-center">
              <HelpCircle className="h-4 w-4 mr-3" />
              Ajuda
            </div>
          </Link>
          
          <button
            onClick={() => {
              logout();
              onToggle();
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <div className="flex items-center">
              <LogOut className="h-4 w-4 mr-3" />
              Sair
            </div>
          </button>
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
  const { user } = useAuthStore();
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
        newNotifications.push({
          id: `device-${device.id}-${now.getTime()}`,
          title: device.status === 0 ? 'Dispositivo Offline' : 'Dispositivo Online',
          message: `${device.name} (${device.ip}) está ${device.status === 0 ? 'offline' : 'online'}.`,
          read: false,
          timestamp: formatTimestamp(now),
          type: device.status === 0 ? 'error' : 'success',
          relatedId: device.id.toString()
        });
      }
    });

    // Verificar mudanças em impressoras
    currentPrinters.forEach(printer => {
      const prevPrinter = prevPrinterDataRef.current.find(p => p.id === printer.id);
      
      if (prevPrinter && prevPrinter.online !== printer.online) {
        newNotifications.push({
          id: `printer-${printer.id}-${now.getTime()}`,
          title: printer.online === 0 ? 'Impressora Offline' : 'Impressora Online',
          message: `A impressora ${printer.model} (${printer.ip}) está ${printer.online === 0 ? 'offline' : 'online'}.`,
          read: false,
          timestamp: formatTimestamp(now),
          type: printer.online === 0 ? 'warning' : 'success',
          relatedId: printer.id.toString()
        });
      }
    });

    return newNotifications;
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const token = user.token ?? localStorage.getItem('authToken');
        if (!token) throw new Error('Token ausente');

        const headers = { Authorization: `Bearer ${token}` };
        
        const [devicesRes, printersRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/devices`, { headers }),
          axios.get(`${API_BASE_URL}/api/printers`, { headers })
        ]);

        const currentDevices = devicesRes.data;
        const currentPrinters = printersRes.data;

        // Gerar notificações apenas para mudanças de status
        const statusNotifications = generateStatusNotifications(
          currentDevices,
          currentPrinters
        );

        // Atualizar notificações mantendo as anteriores
        setNotifications(prev => [...statusNotifications, ...prev]);

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
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    // Na implementação real, você adicionaria um endpoint para marcar notificações como lidas
    // Por enquanto, vamos apenas atualizar o estado local
    setNotifications(notifications.map(notif =>
      notif.id === id ? { ...notif, read: true } : notif
    ));
    
    // Se o ID estiver relacionado a um dispositivo ou impressora, você poderia
    // navegar para a página correspondente aqui
  };
  
  const markAllAsRead = () => {
    // Na implementação real, chamar o endpoint para marcar todas as notificações como lidas
    setNotifications(notifications.map(notif => ({ ...notif, read: true })));
  };
  
  // Função para renderizar o ícone correto baseado no tipo de notificação
  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'success':
        return <Server className="h-4 w-4 text-green-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="rounded-2xl absolute right-0 mt-2 w-60 bg-white dark:bg-gray-800 shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Notificações</h3>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Carregando notificações...
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-200 dark:border-gray-700 ${
                    !notification.read ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  } cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex">
                      <div className="mt-1 mr-3">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
                          {notification.title}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {notification.timestamp}
                        </p>
                      </div>
                    </div>
                    {!notification.read && (
                      <span className="h-2 w-2 bg-indigo-500 rounded-full mt-2"></span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Nenhuma notificação
              </div>
            )}
          </div>
          
          {notifications.length > 0 && unreadCount > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={markAllAsRead}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
              >
                Marcar todas como lidas
              </button>
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
      // Verificar se o clique foi fora dos dropdowns
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center space-x-4 dropdown-container" onClick={(e) => e.stopPropagation()}>
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

// Componente de cabeçalho completo
const Header = () => {
  // Função para realizar logout
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    // Redirecionar para página de login
    window.location.href = '/login';
  };
  
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">TI Monitor</h1>
            </div>
            <nav className="ml-6 flex space-x-4">
              <Link to="/dashboard" className="px-3 py-2 rounded-md text-sm font-medium text-gray-900 dark:text-white">
                Dashboard
              </Link>
              <Link to="/devices" className="px-3 py-2 rounded-md text-sm font-medium text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Dispositivos
              </Link>
              <Link to="/printers" className="px-3 py-2 rounded-md text-sm font-medium text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Impressoras
              </Link>
              <Link to="/network" className="px-3 py-2 rounded-md text-sm font-medium text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Rede
              </Link>
            </nav>
          </div>
          
          <HeaderDropdowns logout={handleLogout} />
        </div>
      </div>
    </header>
  );
};

// AuthProvider para gerenciar estado de autenticação (opcional)
const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  useEffect(() => {
    // Verificar se o usuário está autenticado
    const token = localStorage.getItem('authToken');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);
  
  const login = async (username: string, password: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username,
        password
      });
      
      localStorage.setItem('authToken', response.data.token);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Erro de login:', error);
      return false;
    }
  };
  
  const logout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
    window.location.href = '/login';
  };
  
  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Contexto de autenticação
const AuthContext = React.createContext<{
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}>({
  isAuthenticated: false,
  isLoading: true,
  login: async () => false,
  logout: () => {}
});

// Hook para usar o contexto de autenticação
const useAuth = () => React.useContext(AuthContext);

export { 
  HeaderDropdowns, 
  Header, 
  NotificationsPopover, 
  UserProfileMenu,
  AuthProvider,
  useAuth
};