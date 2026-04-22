import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
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
          <h1 className="login-title">RyB Limpiezas</h1>
          <p className="login-subtitle">Gestión de servicios de limpieza</p>
        </div>

        {/* PWA Installation Section */}
        <div className="install-banner animate-fadeIn">
          {installPrompt ? (
            <>
              <p>📲 <strong>¡Instala la app en tu móvil!</strong></p>
              <p className="text-xs text-muted mt-1">Accede más rápido y ficha sin conexión.</p>
              <button onClick={handleInstall} className="btn btn-success btn-sm w-full mt-3">
                Descargar App RyB
              </button>
            </>
          ) : (
            <div className="install-guide">
              <p className="font-semibold mb-2">📲 ¿Cómo instalar en tu móvil?</p>
              <div className="guide-steps">
                <div className="guide-step">
                  <span className="step-icon">🍎</span>
                  <div>
                    <strong>iOS (iPhone):</strong> Dale a <span className="highlight-icon">⎋</span> (Compartir) y luego a <strong>"Añadir a pantalla de inicio"</strong>.
                  </div>
                </div>
                <div className="guide-step mt-2">
                  <span className="step-icon">🤖</span>
                  <div>
                    <strong>Android:</strong> Pulsa en los <span className="highlight-icon">⋮</span> (Ajustes) y selecciona <strong>"Instalar aplicación"</strong>.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="correo@ejemplo.com"
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
                <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
                Entrando...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted">¿No tienes cuenta? </span>
          <Link to="/register" className="font-semibold" style={{ color: 'var(--color-primary)' }}>
            Regístrate aquí
          </Link>
        </div>
      </div>
    </div>
  );
}
