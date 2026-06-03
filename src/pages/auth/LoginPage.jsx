import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState('operario'); // 'operario' or 'admin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { profile } = await login(email, password);
      
      // Validar si el rol coincide con la pestaña seleccionada para una mejor UX
      if (activeTab === 'admin' && profile?.role !== 'admin') {
        setError('Acceso denegado. Este portal es exclusivo para Administradores.');
        setLoading(false);
        return;
      }
      if (activeTab === 'operario' && profile?.role === 'admin') {
        // Los admins pueden entrar al portal de operario si quieren, pero redirigimos a admin
        navigate('/admin');
        return;
      }

      if (profile?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/operario');
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password'
        || err.code === 'auth/invalid-credential') {
        setError('Email o contraseña incorrectos');
      } else {
        setError('Error al iniciar sesión. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-slideUp">
        <div className="login-logo">
          <div className="login-logo-icon">🧹</div>
          <h1 className="login-title">LimpiaGest</h1>
          <p className="login-subtitle">Gestión de servicios de limpieza</p>
        </div>

        {/* Portal Tabs Selector */}
        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab-btn ${activeTab === 'operario' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('operario');
              setError('');
            }}
          >
            👷 Operarios
          </button>
          <button
            type="button"
            className={`login-tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('admin');
              setError('');
            }}
          >
            💼 Administración
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-4">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email de acceso</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder={activeTab === 'admin' ? 'admin@limpiagest.com' : 'operario@ejemplo.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg w-full mt-4"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, marginRight: 8 }}></span>
                Entrando...
              </>
            ) : (
              `Entrar como ${activeTab === 'admin' ? 'Administrador' : 'Operario'}`
            )}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <span className="text-muted">¿No tienes cuenta? </span>
          <Link to="/register" className="font-semibold animate-fadeIn" style={{ color: '#60a5fa', textDecoration: 'none' }}>
            Regístrate aquí
          </Link>
        </div>

        {/* Dynamic section based on selected role tab */}
        {activeTab === 'operario' ? (
          /* PWA Installation Section for Operarios */
          <div className="install-banner animate-fadeIn mt-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {installPrompt ? (
              <>
                <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📲</span> <strong>¡Instala la App en tu móvil!</strong>
                </p>
                <p className="text-xs text-muted mt-1">Accede al instante a tu cuadrante de trabajo y ficha geolocalizado sin abrir el navegador.</p>
                <button onClick={handleInstall} className="btn btn-success btn-sm w-full mt-3">
                  📥 Descargar App LimpiaGest
                </button>
              </>
            ) : (
              <div className="install-guide">
                <p className="font-semibold mb-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-sm)' }}>
                  <span>📲</span> ¿Cómo instalar en tu móvil?
                </p>
                <div className="guide-steps" style={{ fontSize: 'var(--font-xs)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="guide-step" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span className="step-icon">🍎</span>
                    <div style={{ color: '#cbd5e1' }}>
                      <strong>iPhone:</strong> Pulsa el icono <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>Compartir ⎋</span> de Safari y selecciona <strong>"Añadir a pantalla de inicio"</strong>.
                    </div>
                  </div>
                  <div className="guide-step" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span className="step-icon">🤖</span>
                    <div style={{ color: '#cbd5e1' }}>
                      <strong>Android:</strong> Toca el menú <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>Ajustes ⋮</span> de Chrome y selecciona <strong>"Instalar aplicación"</strong>.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Sleek Setup Link for Administrators */
          <div className="mt-6 text-center animate-fadeIn" style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Link to="/setup" className="text-xs text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => e.target.style.color = 'white'} onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}>
              <span>⚙️</span> Configuración del Setup Inicial
            </Link>
          </div>
        )}

        <div className="mt-6 text-center text-sm" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 'var(--space-4)' }}>
          <Link to="/" className="text-muted" style={{ fontSize: 'var(--font-xs)', textDecoration: 'none' }}>
            ← Volver a la página principal (LimpiaGest)
          </Link>
        </div>
      </div>
    </div>
  );
}
