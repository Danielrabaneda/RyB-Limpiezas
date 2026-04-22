import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError('Las contraseñas no coinciden');
    }

    setError('');
    setLoading(true);

    try {
      await signup(email, password, name);
      navigate('/operario');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este email ya está registrado');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres');
      } else {
        setError('Error al crear la cuenta. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-slideUp">
        <div className="login-logo">
          <div className="login-logo-icon">✨</div>
          <h1 className="login-title">Crear Cuenta</h1>
          <p className="login-subtitle">Únete al equipo de RyB Limpiezas</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre Completo</label>
            <input
              type="text"
              className="form-input"
              placeholder="Juan Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
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
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar Contraseña</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg w-full mt-4"
            disabled={loading}
          >
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted">¿Ya tienes cuenta? </span>
          <Link to="/login" className="font-semibold" style={{ color: 'var(--color-primary)' }}>
            Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
