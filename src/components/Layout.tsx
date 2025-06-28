// src/components/Layout.tsx
import { useState } from 'react';
import { 
  Menu, X, LayoutGrid, Router, Printer, Box, 
  LogOut, Moon, Sun, Search, Sheet
} from 'lucide-react';
import { useLocation, Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useTheme } from '../contexts/theme';
import { HeaderDropdowns  } from './PopUp';

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
    { name: 'Planilha', href: '/sheet', icon: Sheet },
  ];

  type NavigationItem = {
    name: string;
    href: string;
    icon: React.ComponentType<any>;
  };
  
  const NavLink: React.FC<{ item: NavigationItem; mobile?: boolean }> = ({ item, mobile = false }) => {
    const Icon = item.icon;
    
    return (
      <Link
        key={item.name}
        to={item.href}
        onClick={() => mobile && setIsMobileMenuOpen(false)}
        className={`w-full flex items-center gap-2 px-4 py-2 text-lg font-medium rounded-2xl transition-all duration-300
          ${
            location.pathname === item.href
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 hover:text-indigo-600 dark:hover:text-indigo-400'
          }
        `}
      >
        <Icon className="h-6 w-6 flex-shrink-0" />
        <span className="truncate text-xl">{item.name}</span> 
      </Link>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Top Navigation Bar */}
      <div className="bg-white dark:bg-gray-800 fixed w-full z-50 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white ml-3 md:ml-0">Gerenciador</h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Search Bar */}
{/*               <div className="hidden md:flex items-center">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-4 py-2 pl-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                  />
                  <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                </div>
              </div> */}

              {/* Theme Toggle */}
              <button
                onClick={toggleDarkMode}
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
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
        <div className="fixed inset-0 z-40 bg-gray-500 bg-opacity-50 backdrop-blur-sm">
          <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300">
            <div className="pt-16 pb-4 px-4">
              <nav className="space-y-1">
                {navigation.map((item) => (
                  <NavLink key={item.name} item={item} mobile={true} />
                ))}
              </nav>{/* 
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 w-full px-3 py-2 rounded-lg"
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  <span>Sair</span>
                </button>
              </div> */}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col fixed h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex flex-col flex-grow pt-16 overflow-y-auto">
          <div className="mt-5 flex-grow flex flex-col">
            <nav className="flex-1 px-4 space-y-2">
              {navigation.map((item) => (
                <NavLink key={item.name} item={item} />
              ))}
            </nav>
          </div>
{/*           <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
            <button
              onClick={() => logout()}
              className="flex items-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 w-full px-3 py-2 rounded-lg transition-colors duration-200"
            >
              <LogOut className="mr-3 h-5 w-5" />
              <span>Sair</span>
            </button>
          </div> */}
        </div>
      </div>

      {/* Main Content */}
      <main className="md:ml-64 pt-16">
        <div className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}