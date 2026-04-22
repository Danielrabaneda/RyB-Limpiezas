// ==================== ERROR BOUNDARY ====================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-center h-screen bg-slate-50">
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 className="font-bold text-xl mb-4">¡Vaya! Algo ha fallado</h2>
          <p className="text-muted mb-6">La aplicación ha encontrado un error inesperado.</p>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            🔄 Recargar aplicación
          </button>
          <div className="mt-8 p-4 bg-red-50 text-red-700 text-left text-xs rounded overflow-auto max-w-lg mx-auto">
            {this.state.error?.toString()}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import SetupPage from './pages/auth/SetupPage';
import DashboardPage from './pages/admin/DashboardPage';
import CommunitiesPage from './pages/admin/CommunitiesPage';
import OperariosPage from './pages/admin/OperariosPage';
import ReportsPage from './pages/admin/ReportsPage';
import InventoryPage from './pages/admin/InventoryPage';
import ControlHorarioPage from './pages/admin/ControlHorarioPage';
import TodayPage from './pages/operario/TodayPage';
import ServiceDetailPage from './pages/operario/ServiceDetailPage';
import HistoryPage from './pages/operario/HistoryPage';
import GeolocationTracker from './components/operario/GeolocationTracker';
import SettingsPage from './pages/admin/SettingsPage';
import { useState, useEffect } from 'react';
import { collection, query, where, limit, getDocs, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { db } from './config/firebase';
import './index.css';

// Función para actualizar el número en el icono (Badge)
const updateIconBadge = (count) => {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(console.error);
    } else {
      navigator.clearAppBadge().catch(console.error);
    }
  }
};

// ==================== ROUTE GUARDS ====================
function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p className="text-muted">Cargando...</p>
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" />;
  if (requiredRole && userProfile?.role !== requiredRole) {
    return <Navigate to={userProfile?.role === 'admin' ? '/admin' : '/operario'} />;
  }

  return children;
}

// ==================== ADMIN LAYOUT ====================
function AdminLayout() {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [pendingValidations, setPendingValidations] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalSettings(docSnap.data());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'transfers'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      setPendingValidations(snap.size);
    });
    return () => unsub();
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const navItems = [
    { path: '/admin', icon: '📊', label: 'Dashboard', exact: true },
    { path: '/admin/comunidades', icon: '🏢', label: 'Comunidades' },
    { path: '/admin/operarios', icon: '👷', label: 'Operarios' },
    { path: '/admin/control-horario', icon: '⏱️', label: 'Control Horario' },
    { path: '/admin/informes', icon: '📈', label: 'Informes' },
    { path: '/admin/ajustes', icon: '⚙️', label: 'Ajustes' },
  ];

  return (
    <div className="admin-layout">
      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          {globalSettings?.logoUrl ? (
            <img src={globalSettings.logoUrl} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px', background: '#fff' }} />
          ) : (
            <div className="sidebar-brand-icon">RyB</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-brand-text truncate">{globalSettings?.companyName || 'RyB Limpiezas'}</div>
            <div className="sidebar-brand-sub">Panel de gestión</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Principal</div>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} flex items-center justify-between`}
              onClick={() => setSidebarOpen(false)}
            >
              <div className="flex items-center gap-3">
                <span className="sidebar-link-icon">{item.icon}</span>
                {item.label}
              </div>
              {item.path === '/admin' && pendingValidations > 0 && (
                <span className="badge bg-amber-500 text-white border-0 text-xs px-2 py-0.5 shadow-sm animate-pulse">{pendingValidations}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{userProfile?.name?.charAt(0) || 'A'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-user-name">{userProfile?.name || 'Admin'}</div>
              <div className="sidebar-user-role">Administrador</div>
            </div>
          </div>
          <button
            className="btn btn-ghost w-full mt-2"
            onClick={handleLogout}
            style={{ justifyContent: 'flex-start', color: 'var(--color-text-muted)' }}
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="flex items-center gap-3">
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <h1 className="admin-header-title">
              {navItems.find(n => 
                n.exact ? location.pathname === n.path : location.pathname.startsWith(n.path) && n.path !== '/admin'
              )?.label || 'Dashboard'}
            </h1>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ==================== OPERARIO LAYOUT ====================
import PermissionsCheck from './components/operario/PermissionsCheck';

function OperarioLayout() {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSettings, setGlobalSettings] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalSettings(docSnap.data());
      }
    });
    return () => unsub();
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="operario-layout">
      <PermissionsCheck />
      <header className="operario-header">
        <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
          {globalSettings?.logoUrl && (
            <img src={globalSettings.logoUrl} alt="Logo" style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px', background: '#fff' }} />
          )}
          <div className="operario-header-title truncate">{globalSettings?.companyName || 'RyB Limpiezas'}</div>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 'var(--font-xs)', opacity: 0.8 }}>{userProfile?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ color: 'white', padding: '4px 8px' }}>
            🚪
          </button>
        </div>
      </header>

      <main className="operario-content">
        <Outlet />
      </main>

      <nav className="operario-bottom-nav">
        <NavLink
          to="/operario"
          end
          className={({ isActive }) => `operario-nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="operario-nav-icon">📋</span>
          Hoy
        </NavLink>
        <NavLink
          to="/operario/historial"
          className={({ isActive }) => `operario-nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="operario-nav-icon">📅</span>
          Historial
        </NavLink>
      </nav>
    </div>
  );
}

// ==================== ROOT REDIRECT ====================
function RootRedirect() {
  const { currentUser, userProfile, loading } = useAuth();
  const [hasAdmins, setHasAdmins] = useState(null);

  useEffect(() => {
    async function checkAdmins() {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
        const snap = await getDocs(q);
        setHasAdmins(!snap.empty);
      } catch (err) {
        console.error('CheckAdmins error:', err);
        setHasAdmins(false); // Si hay error (como permisos), dejamos pasar al setup por si acaso
      }
    }
    if (!loading && !currentUser) {
      checkAdmins();
    }
  }, [loading, currentUser]);

  if (loading || (hasAdmins === null && !currentUser)) {
    return <div className="loading-page"><div className="spinner"></div><p className="text-muted">Iniciando aplicación...</p></div>;
  }

  if (!currentUser) {
    return hasAdmins ? <Navigate to="/login" /> : <Navigate to="/setup" />;
  }
  
  if (userProfile?.role === 'admin') return <Navigate to="/admin" />;
  return <Navigate to="/operario" />;
}

// Componente para gestionar notificaciones del sistema en tiempo real
function NotificationManager() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    // Escuchar notificaciones no leídas para este usuario
    const q = query(
      collection(db, 'systemNotifications'),
      where('userId', '==', currentUser.uid),
      where('read', '==', false),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      snapshot.docs.forEach(async (docSnap) => {
        const data = docSnap.data();
        const { sendNotification } = await import('./utils/geolocation');
        
        // Lanzar notificación nativa
        sendNotification(data.title || 'RyB Limpiezas', {
          body: data.body || '',
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: docSnap.id
        });

        // Backup visual: Alerta en la app si está abierta
        alert(`🔔 ${data.title}\n\n${data.body}`);
        
        // Marcar como leída DESPUÉS de cerrar el alert para que el badge se limpie cuando el usuario lo vea
        import('firebase/firestore').then(({ updateDoc, doc }) => {
          updateDoc(doc(db, 'systemNotifications', docSnap.id), { read: true });
        });
      });
    });

    return () => unsubscribe();
  }, [currentUser]);

  return null;
}

// Componente para gestionar el número del icono (Badge)
function BadgeManager() {
  const { currentUser, isOperario } = useAuth();

  useEffect(() => {
    if (!isOperario || !currentUser) {
      updateIconBadge(0);
      return;
    }

    // Escuchar notificaciones de sistema sin leer
    const q = query(
      collection(db, 'systemNotifications'),
      where('userId', '==', currentUser.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unreadCount = snapshot.size;
      console.log(`[Badge] Notificaciones sin leer: ${unreadCount}`);
      updateIconBadge(unreadCount);
    });

    return () => unsubscribe();
  }, [currentUser, isOperario]);

  return null;
}

// ==================== APP ====================
export default function App() {
  useEffect(() => {
    // Sistema de notificaciones sincronizado
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationManager />
          <BadgeManager />
          <GeolocationTracker />
          <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/setup" element={<SetupPage />} />

          {/* Root */}
          <Route path="/" element={<RootRedirect />} />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="comunidades" element={<CommunitiesPage />} />
            <Route path="operarios" element={<OperariosPage />} />
            <Route path="control-horario" element={<ControlHorarioPage />} />
            <Route path="informes" element={<ReportsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="ajustes" element={<SettingsPage />} />
          </Route>

          {/* Operario */}
          <Route
            path="/operario"
            element={
              <ProtectedRoute requiredRole="operario">
                <OperarioLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TodayPage />} />
            <Route path="servicio/:serviceId" element={<ServiceDetailPage />} />
            <Route path="historial" element={<HistoryPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
