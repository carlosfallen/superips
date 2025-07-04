import { useState } from 'react';
import { 
  Menu, X, LayoutGrid, Router, Printer, Box, 
  LogOut, Moon, Sun, Search, Sheet, CheckSquare, Settings
} from 'lucide-react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useTheme } from '../contexts/theme';
import { HeaderDropdowns } from './PopUp';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useTheme();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);

  const navigation = [
    { name: 'Dispositivos', href: '/', icon: LayoutGrid },
    { name: 'Roteadores', href: '/routers', icon: Router },
    { name: 'Impressoras', href: '/printers', icon: Printer },
    { name: 'Caixas', href: '/boxes', icon: Box },
    { name: 'Tarefas', href: '/tasks', icon: CheckSquare },
    { name: 'Planilha', href: '/sheet', icon: Sheet },
    { name: 'Configurações', href: '/settings', icon: Settings },
  ];

  type NavigationItem = {
    name: string;
    href: string;
    icon: React.ComponentType<any>;
  };
  
  const NavLink: React.FC<{ item: NavigationItem; mobile?: boolean }> = ({ item, mobile = false }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.href;
    
    return (
      <Link
        key={item.name}
        to={item.href}
        onClick={() => mobile && setIsMobileMenuOpen(false)}
        className={`group w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-2xl transition-all duration-300 transform hover:scale-105
          ${
            isActive
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 dark:hover:from-indigo-900/20 dark:hover:to-purple-900/20 hover:text-indigo-600 dark:hover:text-indigo-400'
          }
        `}
      >
        <Icon className={`h-5 w-5 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
        <span className="truncate">{item.name}</span>
        {isActive && (
          <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />
        )}
      </Link>
    );
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-900 dark:text-gray-100">
      {/* Top Navigation Bar */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl fixed w-full z-50 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
              <div className="flex items-center ml-3 md:ml-0">
                <div className="w-8 h-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center mr-3">
                  <LayoutGrid className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Super IPS
                </h1>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Theme Toggle */}
              <button
                onClick={toggleDarkMode}
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 transform hover:scale-105"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              <HeaderDropdowns logout={logout} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-all duration-300">
          <div className="fixed inset-y-0 left-0 w-72 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-2xl transform transition-transform duration-300">
            <div className="pt-20 pb-4 px-4">
              <nav className="space-y-2">
                {navigation.map((item) => (
                  <NavLink key={item.name} item={item} mobile={true} />
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="hidden md:flex md:w-72 md:flex-col fixed h-screen bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700/50">
        <div className="flex flex-col flex-grow pt-20 overflow-y-auto">
          <div className="mt-5 flex-grow flex flex-col">
            <nav className="flex-1 px-4 space-y-2">
              {navigation.map((item) => (
                <NavLink key={item.name} item={item} />
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="md:ml-72 pt-20">
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}