import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { collection, query, where, limit, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { db } from './config/firebase';
import './index.css';

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

// Lazy loaded pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const SetupPage = lazy(() => import('./pages/auth/SetupPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const CommunitiesPage = lazy(() => import('./pages/admin/CommunitiesPage'));
const OperariosPage = lazy(() => import('./pages/admin/OperariosPage'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'));
const InvoicesPage = lazy(() => import('./pages/admin/InvoicesPage'));
const KilometrajePage = lazy(() => import('./pages/admin/KilometrajePage'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const ControlHorarioPage = lazy(() => import('./pages/admin/ControlHorarioPage'));
const TodayPage = lazy(() => import('./pages/operario/TodayPage'));
const ServiceDetailPage = lazy(() => import('./pages/operario/ServiceDetailPage'));
const HistoryPage = lazy(() => import('./pages/operario/HistoryPage'));
const MaterialRequestPage = lazy(() => import('./pages/operario/MaterialRequestPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const EvidenceReportsPage = lazy(() => import('./pages/admin/EvidenceReportsPage'));
const AbsencesPage = lazy(() => import('./pages/operario/AbsencesPage'));
const AbsencesAdminPage = lazy(() => import('./pages/admin/AbsencesAdminPage'));

// Components
const GeolocationTracker = lazy(() => import('./components/operario/GeolocationTracker'));
const PermissionsCheck = lazy(() => import('./components/operario/PermissionsCheck'));



// ==================== ROUTE GUARDS ====================
function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, userProfile, loading } = useAuth();
  const [showEmergencyButton, setShowEmergencyButton] = useState(false);

  useEffect(() => {
    let timer;
    if (loading) {
      timer = setTimeout(() => {
        setShowEmergencyButton(true);
      }, 7000); // 7 seconds
    }
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p className="text-muted">Iniciando sesión...</p>
        {showEmergencyButton && (
          <div className="mt-8 animate-fadeIn text-center px-6">
            <p className="text-xs text-red-500 mb-4">¿Tarda demasiado? La conexión puede ser inestable.</p>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => window.location.reload()}
            >
              🔄 Recargar página
            </button>
            <p className="mt-4 text-[10px] text-muted">
              Si el problema persiste, cierra la app y vuelve a abrirla.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" />;
  
  if (!userProfile && !loading) {
    return (
      <div className="loading-page px-6 text-center">
        <div style={{ fontSize: '3rem' }}>🔍</div>
        <h3 className="font-bold mt-4">Perfil no encontrado</h3>
        <p className="text-sm text-muted mb-6">No hemos podido cargar tus datos de usuario.</p>
        <button 
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          🔄 Reintentar conexión
        </button>
      </div>
    );
  }

  if (requiredRole && userProfile?.role !== requiredRole) {
    // Admins can access operario pages too
    if (requiredRole === 'operario' && userProfile?.role === 'admin') {
      // Allow admin to access operario pages
    } else {
      return <Navigate to={userProfile?.role === 'admin' ? '/admin' : '/operario'} />;
    }
  }

  return children;
}

// ==================== ADMIN LAYOUT ====================
function AdminLayout() {
  const { userProfile, logout } = useAuth();
  const { unreadCount, dismissAll } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [pendingValidations, setPendingValidations] = useState(0);
  const [pendingGPS, setPendingGPS] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);

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

  useEffect(() => {
    const q = query(collection(db, 'gpsSuggestions'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      setPendingGPS(snap.size);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'materialRequests'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      setPendingOrders(snap.size);
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
    { path: '/admin/ausencias', icon: '🌴', label: 'Ausencias' },
    { path: '/admin/informes', icon: '📈', label: 'Informes' },
    { path: '/admin/facturas', icon: '📄', label: 'Facturas' },
    { path: '/admin/evidencias', icon: '📸', label: 'Evidencias' },
    { path: '/admin/kilometraje', icon: '🚗', label: 'Kilometraje' },
    { path: '/admin/inventory', icon: '📦', label: 'Materiales' },
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
              {item.path === '/admin' && (pendingValidations > 0 || pendingGPS > 0) && (
                <div className="flex gap-1">
                  {pendingValidations > 0 && (
                    <span className="badge bg-amber-500 text-white border-0 text-xs px-2 py-0.5 shadow-sm animate-pulse" title="Traspasos pendientes">
                      {pendingValidations}
                    </span>
                  )}
                  {pendingGPS > 0 && (
                    <span className="badge bg-blue-500 text-white border-0 text-xs px-2 py-0.5 shadow-sm animate-pulse" title="Ubicaciones GPS sugeridas">
                      {pendingGPS}
                    </span>
                  )}
                </div>
              )}
              {item.path === '/admin/inventory' && pendingOrders > 0 && (
                <span className="badge bg-red-500 text-white border-0 text-xs px-2 py-0.5 shadow-sm animate-pulse" title="Pedidos pendientes">
                  {pendingOrders}
                </span>
              )}
            </NavLink>
          ))}
          
          <div style={{ margin: '15px 12px 5px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }} />
          <NavLink
            to="/operario"
            className="sidebar-link flex items-center justify-between"
            style={{ color: '#3b82f6', fontWeight: 'bold' }}
            onClick={() => setSidebarOpen(false)}
          >
            <div className="flex items-center gap-3">
              <span className="sidebar-link-icon">👷</span>
              Vista de Operario
            </div>
          </NavLink>
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
        <header className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex items-center gap-3">
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <h1 className="admin-header-title">
              {navItems.find(n => 
                n.exact ? location.pathname === n.path : location.pathname.startsWith(n.path) && n.path !== '/admin'
              )?.label || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3 pr-4">
            {unreadCount > 0 && (
              <button 
                onClick={() => {
                  dismissAll();
                  navigate('/admin/inventory');
                }}
                className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                title={`${unreadCount} avisos pendientes`}
              >
                <span style={{ fontSize: '1.2rem' }}>🔔</span>
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full animate-pulse">
                  {unreadCount}
                </span>
              </button>
            )}
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

  // Escuchar mensajes del Service Worker para navegación desde notificaciones
  useEffect(() => {
    const handleSWMessage = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        navigate(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
  }, [navigate]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="operario-layout">
      <PermissionsCheck />
      <Suspense fallback={null}>
        <GeolocationTracker />
      </Suspense>
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
          to="/operario/materiales"
          className={({ isActive }) => `operario-nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="operario-nav-icon">📦</span>
          Materiales
        </NavLink>
        <NavLink
          to="/operario/ausencias"
          className={({ isActive }) => `operario-nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="operario-nav-icon">🌴</span>
          Ausencias
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
        // Si hay error de permisos (porque las reglas de seguridad ya están activas y bloquean lecturas públicas),
        // significa que el sistema ya está configurado y seguro. Por tanto, asumimos que existen admins y redirigimos a login.
        setHasAdmins(true);
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
    return hasAdmins ? <LandingPage /> : <Navigate to="/setup" />;
  }
  
  if (userProfile?.role === 'admin') {
    // If the admin logs in on a mobile screen (width < 768px), redirect them to operario view by default
    const isMobile = window.innerWidth < 768;
    return <Navigate to={isMobile ? '/operario' : '/admin'} />;
  }
  return <Navigate to="/operario" />;
}



// ==================== APP ====================
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <Suspense fallback={
              <div className="loading-page">
                <div className="spinner"></div>
                <p className="text-muted">Cargando sección...</p>
              </div>
            }>
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
                  <Route path="facturas" element={<InvoicesPage />} />
                  <Route path="evidencias" element={<EvidenceReportsPage />} />
                  <Route path="kilometraje" element={<KilometrajePage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="ajustes" element={<SettingsPage />} />
                  <Route path="ausencias" element={<AbsencesAdminPage />} />
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
                  <Route path="materiales" element={<MaterialRequestPage />} />
                  <Route path="ausencias" element={<AbsencesPage />} />
                  <Route path="historial" element={<HistoryPage />} />
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
