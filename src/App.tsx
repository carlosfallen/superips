import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useNavigationStore } from './store/navigation';
import { ThemeProvider } from './contexts/theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Printers from './pages/Printers';
import Routers from './pages/Routers';
import Boxes from './pages/Boxes';
import Tasks from './pages/Tasks';
import Settings from './pages/Settings';
import Print from './pages/sheet';
import { InstallPWA } from './components/InstallPWA';
import { Toaster } from './components/ui/toaster';
import Layout from './components/Layout';

function App() {
  const { connect, disconnect } = useSocket();
  const { checkAuth } = useAuth();
  const currentPage = useNavigationStore((state) => state.currentPage);
  const [initializing, setInitializing] = useState(true);

  const handleLoginSuccess = () => {
    useNavigationStore.getState().setPage('dashboard');
  };

  // Inicialização do Auth
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await checkAuth();
        connect(); // conecta socket na inicialização
      } catch (error) {
        console.error('❌ Auth initialization failed:', error);
      } finally {
        setInitializing(false);
      }
    };
    initializeAuth();

    return () => {
      disconnect(); // use disconnect instead of disconnectSocket
    };
  }, [checkAuth, connect, disconnect]);

  if (initializing) return <LoadingSpinner />;

  // Renderização das páginas
  if (!currentPage || currentPage === 'login') {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  let PageComponent;
  switch (currentPage) {
    case 'dashboard': PageComponent = Dashboard; break;
    case 'devices': PageComponent = Devices; break;
    case 'printers': PageComponent = Printers; break;
    case 'routers': PageComponent = Routers; break;
    case 'boxes': PageComponent = Boxes; break;
    case 'tasks': PageComponent = Tasks; break;
    case 'settings': PageComponent = Settings; break;
    case 'sheet': PageComponent = Print; break;
    default: PageComponent = Dashboard;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Layout>
          <PageComponent />
        </Layout>
        <InstallPWA />
        <Toaster />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
