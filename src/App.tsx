import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth' // NOVO HOOK
import { useSocket } from './hooks/useSocket'
import { useNotifications } from './hooks/useNotifications'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Devices from './pages/Devices'
import Routers from './pages/Routers'
import Printers from './pages/Printers'
import Boxes from './pages/Boxes'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'
import Print from './pages/sheet'
import { ThemeProvider } from './contexts/theme'
import { InstallPWA } from './components/InstallPWA'
import { Toaster } from './components/ui/toaster'
import ErrorBoundary from './components/ErrorBoundary'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, getToken } = useAuth() // Usar o novo hook
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const validateAuth = async () => {
      try {
        if (isAuthenticated()) { // Call the function
          // Verificar se consegue obter token válido
          await getToken();
        }
      } catch (error) {
        console.error('❌ Auth validation failed:', error);
      } finally {
        setIsValidating(false);
      }
    };

    validateAuth();
  }, [isAuthenticated, getToken]);

  if (isValidating) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAuthenticated()) return <Navigate to="/login" /> // Call the function
  return <>{children}</>
}

function App() {
  const { isConnected } = useSocket()
  const { isAuthenticated, getToken } = useAuth() // Usar o novo hook
  const [initializing, setInitializing] = useState(true);
  
  useNotifications()

  // Inicialização da aplicação com JWT
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (isAuthenticated()) { // Call the function
          // Verificar se o token ainda é válido
          await getToken();
          console.log('✅ Auth initialized successfully');
        }
      } catch (error) {
        console.error('❌ Auth initialization failed:', error);
      } finally {
        setInitializing(false);
      }
    };

    initializeAuth();

    // Verificar token periodicamente (a cada 5 minutos)
    const tokenCheckInterval = setInterval(async () => {
      try {
        if (isAuthenticated()) { // Call the function
          await getToken();
        }
      } catch (error) {
        console.error('❌ Periodic token check failed:', error);
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(tokenCheckInterval);
  }, [isAuthenticated, getToken]);

  useEffect(() => {
    console.log('🚀 Super IPS App initialized')
  }, [])

  useEffect(() => {
    const status = isConnected() // Call the function
    if (status === undefined) return
    console.log(
      status
        ? '✅ Socket conectado no App'
        : '❌ Socket desconectado no App'
    )
  }, [isConnected])

  if (initializing) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-gray-600">Initializing SuperIPS...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/login" element={
              isAuthenticated() ? <Navigate to="/" replace /> : <Login />
            } />
            <Route path="/register" element={
              isAuthenticated() ? <Navigate to="/" replace /> : <Register />
            } />
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
  )
}

export default App;