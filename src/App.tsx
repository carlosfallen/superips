import { useState } from 'react';
import { useNavigationStore } from './store/navigation';
import { ThemeProvider } from './contexts/theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';
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
  const currentPage = useNavigationStore((state) => state.currentPage);

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