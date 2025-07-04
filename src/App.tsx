import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/auth';
import { useSocket } from './hooks/useSocket';
import { useNotifications } from './hooks/useNotifications';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Devices from './pages/Devices';
import Routers from './pages/Routers';
import Printers from './pages/Printers';
import Boxes from './pages/Boxes';
import Tasks from './pages/Tasks';
import Settings from './pages/Settings';
import Print from './pages/sheet';
import { ThemeProvider } from './contexts/theme';
import { InstallPWA } from './components/InstallPWA';
import { Toaster } from './components/ui/toaster';
import ErrorBoundary from './components/ErrorBoundary';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

function App() {
  const { user } = useAuthStore();
  
  // Initialize socket connection and notifications
  useSocket();
  useNotifications();

  // Initialize app on mount
  useEffect(() => {
    // Any app-wide initialization logic
    console.log('🚀 Super IPS App initialized');
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                  <InstallPWA />
                </ProtectedRoute>
              }
            >
              <Route index element={<Devices />} />
              <Route path="routers" element={<Routers />} />
              <Route path="printers" element={<Printers />} />
              <Route path="boxes" element={<Boxes />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="settings" element={<Settings />} />
              <Route path="sheet" element={<Print />} />
            </Route>
          </Routes>
          <Toaster />
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;