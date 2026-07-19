import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError("Las contraseñas no coinciden");
    }

    setError("");
    setLoading(true);

    try {
      // 1. Validar código de invitación en Firestore
      const normalizedCode = accessCode.trim().toUpperCase();
      if (!normalizedCode) {
        setError("Por favor, introduce un código de invitación");
        setLoading(false);
        return;
      }

      const codeRef = doc(db, "accessCodeIndex", normalizedCode);
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        setError("El código de invitación no es válido");
        setLoading(false);
        return;
      }

      const codeData = codeSnap.data();
      if (codeData.active === false) {
        setError("El código de invitación ha expirado o no está activo");
        setLoading(false);
        return;
      }

      const companyId = codeData.companyId;

      // 2. Si es válido, proceder con el registro
      await signup(email, password, name, companyId);
      navigate("/operario");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("Este email ya está registrado");
      } else if (err.code === "auth/weak-password") {
        setError("La contraseña debe tener al menos 6 caracteres");
      } else {
        setError("Error al crear la cuenta. Inténtalo de nuevo.");
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
            <label className="form-label">Código de Invitación</label>
            <input
              type="text"
              className="form-input"
              placeholder="PRUEBA30DIAS"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              required
              style={{ textTransform: "uppercase" }}
            />
          </div>
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

          {/* GDPR Compliance Layer 1 */}
          <div className="gdpr-info-table-container">
            <table className="gdpr-info-table">
              <tbody>
                <tr>
                  <td className="gdpr-info-label">Responsable:</td>
                  <td className="gdpr-info-value">
                    Daniel Rabaneda / RyB Limpiezas
                  </td>
                </tr>
                <tr>
                  <td className="gdpr-info-label">Finalidad:</td>
                  <td className="gdpr-info-value">
                    Crear y gestionar su cuenta de usuario operario para el
                    registro de jornada.
                  </td>
                </tr>
                <tr>
                  <td className="gdpr-info-label">Legitimación:</td>
                  <td className="gdpr-info-value">
                    Relación contractual / laboral y cumplimiento de obligación
                    legal (registro de jornada).
                  </td>
                </tr>
                <tr>
                  <td className="gdpr-info-label">Destinatarios:</td>
                  <td className="gdpr-info-value">
                    No se cederán datos a terceros salvo obligación legal o
                    proveedores tecnológicos autorizados.
                  </td>
                </tr>
                <tr>
                  <td className="gdpr-info-label">Derechos:</td>
                  <td className="gdpr-info-value">
                    Acceso, rectificación, supresión y otros detallados en la
                    Info Adicional.
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="gdpr-info-link-container">
              Información Adicional: Puedes consultar la información detallada
              en nuestra{" "}
              <Link
                to="/politica-de-privacidad"
                target="_blank"
                rel="noopener noreferrer"
              >
                Política de Privacidad
              </Link>
              .
            </div>
          </div>

          <div className="gdpr-checkbox-container">
            <input
              type="checkbox"
              id="register-privacy-checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              required
            />
            <label
              htmlFor="register-privacy-checkbox"
              style={{ fontSize: "0.8rem", cursor: "pointer" }}
            >
              He leído y acepto la{" "}
              <Link
                to="/politica-de-privacidad"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--color-primary-light)",
                  textDecoration: "underline",
                }}
              >
                Política de Privacidad
              </Link>
              .*
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full mt-4"
            disabled={loading}
          >
            {loading ? "Creando cuenta..." : "Registrarse"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted">¿Ya tienes cuenta? </span>
          <Link
            to="/login"
            className="font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
