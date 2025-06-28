import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Devices from './pages/Devices';
import Routers from './pages/Routers';
import Printers from './pages/Printers';
import Boxes from './pages/Boxes';
import Print from './pages/sheet';
import { ThemeProvider } from './contexts/theme';
import { InstallPWA } from './components/InstallPWA'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout /><InstallPWA />
              </ProtectedRoute>
            }
          >
            <Route index element={<Devices />} />
            <Route path="routers" element={<Routers />} />
            <Route path="printers" element={<Printers />} />
            <Route path="boxes" element={<Boxes />} />
            <Route path="sheet" element={<Print />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;