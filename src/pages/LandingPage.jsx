import React, { useState } from "react";
import { Link } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
const features = [
  {
    icon: "⏱️",
    title: "Control Horario & GPS",
    desc: "Fichaje geolocalizado en tiempo real. Registro automático de inicio y fin de jornada con ubicación exacta y cálculo de horas trabajadas.",
    color: "#2563eb",
  },
  {
    icon: "📸",
    title: "Evidencias Fotográficas",
    desc: "Certifica cada servicio con fotos del antes y después. Marca de agua con GPS, fecha y hora para garantizar la veracidad al 100%.",
    color: "#7c3aed",
  },
  {
    icon: "📋",
    title: "Tareas Inteligentes",
    desc: "Crea plantillas de tareas por comunidad o portal. Automatiza asignaciones diarias, semanales o mensuales y ahorra horas de planificación.",
    color: "#0891b2",
  },
  {
    icon: "🚗",
    title: "Registro de Kilometraje",
    desc: "Control exacto de todos los desplazamientos. Reportes mensuales validados listos para compensación de gastos y deducción fiscal.",
    color: "#059669",
  },
  {
    icon: "📦",
    title: "Inventario & Materiales",
    desc: "Solicitudes de consumibles desde el móvil del operario. Inventario centralizado con alertas de stock mínimo y trazabilidad completa.",
    color: "#d97706",
  },
  {
    icon: "🔄",
    title: "Traspasos al Instante",
    desc: "Reasigna servicios en segundos cuando un operario no puede acudir. Histórico completo de todos los cambios realizados.",
    color: "#dc2626",
  },
  {
    icon: "📊",
    title: "Dashboard en Tiempo Real",
    desc: "Panel de control con visión global de la actividad diaria: operarios activos, servicios completados, incidencias y rendimiento.",
    color: "#6366f1",
  },
  {
    icon: "🗓️",
    title: "Calendario de Planificación",
    desc: "Planifica rutas y asignaciones de servicios con vista semanal y mensual. Drag & drop para reorganizar al instante.",
    color: "#14b8a6",
  },
  {
    icon: "🧾",
    title: "Facturación Integrada",
    desc: "Genera facturas profesionales directamente desde los servicios realizados. Compatible con requisitos Verifactu y exportación PDF.",
    color: "#f43f5e",
  },
  {
    icon: "📱",
    title: "App Móvil PWA",
    desc: "Tus operarios acceden desde cualquier móvil sin descargar nada de la tienda. Funciona offline y envía notificaciones push.",
    color: "#8b5cf6",
  },
  {
    icon: "🏘️",
    title: "Gestión de Comunidades",
    desc: "Organiza clientes por comunidades con portales de acceso exclusivo. Cada cliente puede ver las evidencias de su servicio.",
    color: "#0ea5e9",
  },
  {
    icon: "📅",
    title: "Gestión de Ausencias",
    desc: "Control completo de vacaciones, bajas y permisos. Los operarios solicitan desde la app y el admin aprueba con un clic.",
    color: "#f59e0b",
  },
];

const advancedFeatures = [
  {
    icon: "🔔",
    title: "Notificaciones Push",
    desc: "Alertas instantáneas para asignaciones, cambios de ruta o incidencias. Sin depender de mensajes de WhatsApp.",
  },
  {
    icon: "📄",
    title: "Informes y Reportes",
    desc: "Exportación a PDF y Excel de control horario, kilometraje, evidencias y facturación con un solo clic.",
  },
  {
    icon: "🗺️",
    title: "Optimización de Rutas",
    desc: "Algoritmo inteligente que ordena los servicios del día por proximidad para reducir desplazamientos innecesarios.",
  },
  {
    icon: "🔐",
    title: "Multi-Tenant Seguro",
    desc: "Cada empresa opera en su espacio aislado con datos 100% privados. Reglas de seguridad a nivel de base de datos.",
  },
  {
    icon: "👥",
    title: "Portal del Cliente",
    desc: "Tus clientes acceden a un portal exclusivo para ver evidencias fotográficas, informes y el estado de cada servicio.",
  },
  {
    icon: "📑",
    title: "Bóveda de Documentos",
    desc: "Almacenamiento seguro de certificados, contratos y documentación legal asociada a cada comunidad.",
  },
];

const stats = [
  { value: "500+", label: "Operarios gestionados" },
  { value: "98%", label: "Servicios certificados" },
  { value: "4h", label: "Ahorro semanal por admin" },
  { value: "0€", label: "Coste de setup" },
  { value: "24/7", label: "Disponibilidad del sistema" },
  { value: "100%", label: "Datos en la nube" },
];

const testimonials = [
  {
    quote:
      "LimpiaGest nos ha permitido eliminar completamente los partes en papel. Ahora sabemos en tiempo real qué está pasando en cada comunidad.",
    author: "Raúl B.",
    role: "Director de Operaciones",
    company: "Limpiezas RyB",
  },
  {
    quote:
      "La app de los operarios es tan sencilla que no necesitamos formación. En dos días estaba todo el equipo funcionando.",
    author: "Mª Carmen G.",
    role: "Responsable de RRHH",
    company: "Servicios de Limpieza García",
  },
  {
    quote:
      "Mis clientes ahora reciben evidencias fotográficas de cada trabajo. Eso ha reducido las reclamaciones a cero.",
    author: "Javier M.",
    role: "Gerente",
    company: "Multiservicio Martínez",
  },
  {
    quote:
      "El control de kilometraje y la facturación integrada nos han ahorrado un día entero cada mes en administración.",
    author: "Laura S.",
    role: "Administradora",
    company: "Limpiezas del Sur",
  },
];

const pricingPlans = [
  {
    id: "autonomo",
    name: "Autónomo",
    monthlyPrice: 19,
    desc: "Para profesionales y microempresas.",
    features: [
      "Hasta 5 operarios",
      "Hasta 50 comunidades",
      "Control horario con GPS",
      "Evidencias fotográficas",
      "App móvil PWA",
      "Soporte por email",
    ],
    featured: false,
    cta: "Solicitar Acceso",
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 39,
    desc: "Para pequeñas empresas en crecimiento.",
    features: [
      "Hasta 10 operarios",
      "Hasta 100 comunidades",
      "Todo lo de Autónomo",
      "Control de kilometraje",
      "Gestión de ausencias",
      "Notificaciones push",
    ],
    featured: true,
    cta: "Empezar Ahora",
  },
  {
    id: "professional",
    name: "Profesional",
    monthlyPrice: 79,
    desc: "Para equipos con varias rutas y zonas.",
    features: [
      "Hasta 30 operarios",
      "Hasta 300 comunidades",
      "Todo lo de Starter",
      "Traspasos en tiempo real",
      "Gestión de materiales e inventario",
      "Calendario de planificación",
    ],
    featured: false,
    cta: "Solicitar Acceso",
  },
  {
    id: "business",
    name: "Empresa",
    monthlyPrice: 149,
    desc: "Para empresas con operaciones amplias.",
    features: [
      "Hasta 100 operarios",
      "Hasta 1.000 comunidades",
      "Todo lo de Profesional",
      "Facturación con Verifactu",
      "Portal del cliente",
      "Informes avanzados",
    ],
    featured: false,
    cta: "Solicitar Acceso",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    desc: "Para grandes corporaciones.",
    features: [
      "Operarios ilimitados",
      "Comunidades ilimitadas",
      "API personalizada",
      "White-label con tu logo",
      "Servidor cloud dedicado",
      "Gerente de cuenta dedicado",
    ],
    featured: false,
    cta: "Contactar Ventas",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST MODAL
// ─────────────────────────────────────────────────────────────────────────────
function RequestModal({ isOpen, onClose, defaultPlan = "" }) {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    operariosCount: "",
    plan: defaultPlan,
    message: "",
  });
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setPrivacyAccepted(false);
      setForm((current) => ({ ...current, plan: defaultPlan }));
    }
  }, [isOpen, defaultPlan]);

  if (!isOpen) return null;

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await addDoc(collection(db, "companyRequests"), {
        ...form,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setStatus("success");
    } catch (err) {
      console.error("Error saving request:", err);
      setErrorMsg(
        "No se pudo enviar la solicitud. Inténtalo de nuevo o escríbenos a limpiezasrayba@gmail.com",
      );
      setStatus("error");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #0f172a, #1e293b)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px",
          padding: "32px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
          animation: "slideUp 0.3s ease",
        }}
      >
        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🎉</div>
            <h2
              style={{
                color: "white",
                fontSize: "1.5rem",
                fontWeight: 800,
                marginBottom: "12px",
              }}
            >
              ¡Solicitud recibida!
            </h2>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                marginBottom: "24px",
              }}
            >
              Nos pondremos en contacto contigo en las próximas 24 horas para
              configurar tu cuenta.
            </p>
            <button
              onClick={onClose}
              className="btn-hero-primary"
              style={{ padding: "12px 28px", fontSize: "0.95rem" }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h2
                style={{
                  color: "white",
                  fontSize: "1.3rem",
                  fontWeight: 800,
                }}
              >
                Solicitar Acceso a LimpiaGest
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#94a3b8",
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div className="form-row" style={{ display: "flex", gap: "12px" }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Empresa *</label>
                  <input
                    className="form-input"
                    name="companyName"
                    value={form.companyName}
                    onChange={handleChange}
                    required
                    placeholder="Tu empresa"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Nombre de contacto *</label>
                  <input
                    className="form-input"
                    name="contactName"
                    value={form.contactName}
                    onChange={handleChange}
                    required
                    placeholder="Tu nombre"
                  />
                </div>
              </div>

              <div className="form-row" style={{ display: "flex", gap: "12px" }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Email *</label>
                  <input
                    className="form-input"
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    placeholder="email@empresa.com"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input
                    className="form-input"
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="600 000 000"
                  />
                </div>
              </div>

              <div className="form-row" style={{ display: "flex", gap: "12px" }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Nº de operarios</label>
                  <input
                    className="form-input"
                    type="number"
                    name="operariosCount"
                    value={form.operariosCount}
                    onChange={handleChange}
                    placeholder="10"
                    min="1"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Plan de interés</label>
                  <select
                    className="form-input"
                    name="plan"
                    value={form.plan}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="autonomo">Autónomo (19€/mes)</option>
                    <option value="starter">Starter (39€/mes)</option>
                    <option value="professional">
                      Profesional (79€/mes)
                    </option>
                    <option value="business">Empresa (149€/mes)</option>
                    <option value="enterprise">Enterprise (a medida)</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mensaje (opcional)</label>
                <textarea
                  className="form-input"
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Cuéntanos sobre tu empresa y necesidades..."
                />
              </div>

              {errorMsg && (
                <p style={{ color: "#f87171", fontSize: "0.85rem" }}>
                  {errorMsg}
                </p>
              )}

              {/* GDPR Layer 1 */}
              <div className="gdpr-info-table-container">
                <table className="gdpr-info-table">
                  <tbody>
                    <tr>
                      <td className="gdpr-info-label">Responsable</td>
                      <td className="gdpr-info-value">
                        Limpiezas Rayba S.L.
                      </td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Finalidad</td>
                      <td className="gdpr-info-value">
                        Atender tu solicitud de demo y ofrecerte acceso a
                        LimpiaGest.
                      </td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Legitimación</td>
                      <td className="gdpr-info-value">
                        Consentimiento del interesado.
                      </td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Destinatarios</td>
                      <td className="gdpr-info-value">
                        No se cederán datos a terceros.
                      </td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Derechos</td>
                      <td className="gdpr-info-value">
                        Acceso, rectificación, supresión y portabilidad.
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="gdpr-info-link-container">
                  <Link
                    to="/politica-de-privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver Política de Privacidad completa →
                  </Link>
                </div>
              </div>

              <div className="gdpr-checkbox-container">
                <input
                  type="checkbox"
                  id="landing-privacy-checkbox"
                  checked={privacyAccepted}
                  onChange={(e) => setPrivacyAccepted(e.target.checked)}
                  required
                />
                <label
                  htmlFor="landing-privacy-checkbox"
                  style={{ fontSize: "0.8rem", cursor: "pointer" }}
                >
                  Acepto la{" "}
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
                  </Link>{" "}
                  y el tratamiento de mis datos.*
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-success btn-lg w-full"
                disabled={status === "loading"}
                style={{ marginTop: "4px" }}
              >
                {status === "loading"
                  ? "⏳ Enviando solicitud..."
                  : "🚀 Solicitar Acceso Gratuito"}
              </button>

              <p
                style={{
                  textAlign: "center",
                  fontSize: "0.75rem",
                  color: "#64748b",
                }}
              >
                Sin tarjeta de crédito. Sin compromiso. Te llamamos nosotros.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LANDING
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlan, setModalPlan] = useState("");
  const [billingAnnual, setBillingAnnual] = useState(false);

  function openModal(plan = "") {
    setModalPlan(plan);
    setModalOpen(true);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .landing-root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #060b18;
          color: #e2e8f0;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ── Gradient background orbs ── */
        .landing-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
        }
        .orb {
          position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.18;
          animation: orbFloat 8s ease-in-out infinite;
        }
        .orb-1 { width: 600px; height: 600px; background: #2563eb; top: -200px; left: -200px; animation-delay: 0s; }
        .orb-2 { width: 400px; height: 400px; background: #7c3aed; top: 30%; right: -100px; animation-delay: -3s; }
        .orb-3 { width: 350px; height: 350px; background: #0891b2; bottom: 10%; left: 20%; animation-delay: -5s; }
        .orb-4 { width: 300px; height: 300px; background: #059669; bottom: -100px; right: 30%; animation-delay: -7s; }
        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.05); }
        }

        .lp-container {
          max-width: 1140px; margin: 0 auto; padding: 0 24px; position: relative; z-index: 1;
        }

        /* ── NAV ── */
        .lp-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: sticky; top: 0; z-index: 100;
          background: rgba(6,11,24,0.85);
          backdrop-filter: blur(16px);
          margin: 0 -24px; padding: 16px 24px;
        }
        .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .lp-logo-icon {
          width: 38px; height: 38px; border-radius: 10px;
          background: linear-gradient(135deg, #2563eb, #06b6d4);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.2rem; box-shadow: 0 0 20px rgba(37,99,235,0.4);
        }
        .lp-logo-name { font-size: 1.15rem; font-weight: 800; color: white; }
        .lp-nav-links { display: flex; gap: 24px; align-items: center; }
        .lp-nav-links a {
          color: #94a3b8; font-size: 0.875rem; font-weight: 500;
          text-decoration: none; transition: color 0.2s;
        }
        .lp-nav-links a:hover { color: white; }
        @media (max-width: 768px) { .lp-nav-links { display: none; } }
        .lp-nav-actions { display: flex; gap: 10px; align-items: center; }

        /* ── HERO ── */
        .lp-hero {
          display: grid; grid-template-columns: 1fr 1fr; gap: 60px;
          align-items: center; padding: 90px 0 80px;
        }
        @media (max-width: 768px) {
          .lp-hero { grid-template-columns: 1fr; padding: 60px 0 50px; gap: 40px; }
        }

        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(37,99,235,0.15); border: 1px solid rgba(37,99,235,0.35);
          border-radius: 100px; padding: 6px 14px;
          font-size: 0.78rem; font-weight: 600; color: #93c5fd;
          margin-bottom: 22px; width: fit-content;
        }
        .hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }

        .hero-title {
          font-size: clamp(2.2rem, 5vw, 3.6rem);
          font-weight: 900; line-height: 1.1; color: white;
          margin-bottom: 20px; letter-spacing: -0.03em;
        }
        .hero-title-gradient {
          background: linear-gradient(135deg, #3b82f6, #06b6d4, #818cf8);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-subtitle {
          font-size: 1.05rem; color: #94a3b8; line-height: 1.7;
          margin-bottom: 36px; max-width: 520px;
        }
        .hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
        .btn-hero-primary {
          background: linear-gradient(135deg, #2563eb, #06b6d4);
          color: white; border: none; padding: 14px 28px;
          border-radius: 12px; font-size: 1rem; font-weight: 700;
          cursor: pointer; transition: all 0.2s; box-shadow: 0 0 30px rgba(37,99,235,0.4);
          text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-hero-primary:hover { transform: translateY(-2px); box-shadow: 0 0 40px rgba(37,99,235,0.6); }
        .btn-hero-secondary {
          background: rgba(255,255,255,0.05); color: white;
          border: 1px solid rgba(255,255,255,0.12); padding: 14px 28px;
          border-radius: 12px; font-size: 1rem; font-weight: 600;
          cursor: pointer; transition: all 0.2s; text-decoration: none;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-hero-secondary:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.2); }

        /* ── MOCKUPS ── */
        .hero-mockups {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .hero-mockup-img {
          width: 100%;
          height: auto;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 20px 50px rgba(0,0,0,0.4);
          transition: transform 0.3s ease;
        }
        .hero-mockup-img:hover {
          transform: scale(1.02);
        }

        /* ── STATS ── */
        .lp-stats {
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; overflow: hidden; margin: 0 0 80px;
        }
        @media (max-width: 900px) { .lp-stats { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 580px) { .lp-stats { grid-template-columns: repeat(2,1fr); } }
        .stat-item {
          padding: 28px 16px; text-align: center;
          background: rgba(6,11,24,0.6);
          transition: background 0.2s;
        }
        .stat-item:hover { background: rgba(37,99,235,0.08); }
        .stat-value { font-size: 2rem; font-weight: 900; color: white; letter-spacing: -0.03em; }
        .stat-label { font-size: 0.75rem; color: #64748b; margin-top: 4px; font-weight: 500; }

        /* ── SECTION ── */
        .lp-section { margin-bottom: 90px; }
        .lp-section-label {
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: #3b82f6; margin-bottom: 12px;
        }
        .lp-section-title {
          font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 900; color: white;
          letter-spacing: -0.03em; line-height: 1.15; margin-bottom: 14px;
        }
        .lp-section-sub {
          font-size: 1rem; color: #64748b; max-width: 600px; line-height: 1.7;
          margin-bottom: 50px;
        }

        /* ── FEATURES GRID ── */
        .features-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
        }
        @media (max-width: 900px) { .features-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 580px) { .features-grid { grid-template-columns: 1fr; } }
        .feature-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 24px; transition: all 0.25s;
        }
        .feature-card:hover {
          background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12);
          transform: translateY(-3px);
        }
        .feature-icon {
          width: 48px; height: 48px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.4rem; margin-bottom: 16px;
        }
        .feature-card h3 { font-size: 1rem; font-weight: 700; color: white; margin-bottom: 8px; }
        .feature-card p { font-size: 0.875rem; color: #64748b; line-height: 1.65; }

        /* ── ADVANCED FEATURES ── */
        .adv-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
        }
        @media (max-width: 900px) { .adv-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 580px) { .adv-grid { grid-template-columns: 1fr; } }
        .adv-item {
          display: flex; gap: 14px; align-items: flex-start;
          padding: 20px; border-radius: 14px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.25s;
        }
        .adv-item:hover {
          background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1);
        }
        .adv-icon {
          font-size: 1.5rem; flex-shrink: 0; width: 40px; height: 40px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(37,99,235,0.1); border-radius: 10px;
        }
        .adv-item h4 { font-size: 0.9rem; font-weight: 700; color: white; margin-bottom: 4px; }
        .adv-item p { font-size: 0.8rem; color: #64748b; line-height: 1.55; }

        /* ── SOLUTION COMPARISON ── */
        .comparison-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
          margin-top: 40px;
        }
        @media (max-width: 640px) { .comparison-grid { grid-template-columns: 1fr; } }
        .comparison-card {
          padding: 28px; border-radius: 16px;
        }
        .comparison-card.before {
          background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15);
        }
        .comparison-card.after {
          background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2);
        }
        .comparison-card h3 {
          font-size: 1.05rem; font-weight: 800; margin-bottom: 16px;
        }
        .comparison-card.before h3 { color: #f87171; }
        .comparison-card.after h3 { color: #34d399; }
        .comparison-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
        .comparison-list li {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 0.875rem; color: #cbd5e1; line-height: 1.5;
        }
        .comparison-list .icon { flex-shrink: 0; font-size: 1rem; }

        /* ── HOW IT WORKS ── */
        .steps-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;
          position: relative;
        }
        @media (max-width: 800px) { .steps-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .steps-grid { grid-template-columns: 1fr; } }
        .step-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 28px 20px; text-align: center;
        }
        .step-number {
          width: 52px; height: 52px; border-radius: 50%;
          background: linear-gradient(135deg, #2563eb, #06b6d4);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.2rem; font-weight: 900; color: white;
          margin: 0 auto 18px; box-shadow: 0 0 20px rgba(37,99,235,0.4);
        }
        .step-card h3 { font-size: 0.95rem; font-weight: 700; color: white; margin-bottom: 8px; }
        .step-card p { font-size: 0.8rem; color: #64748b; line-height: 1.6; }

        /* ── TESTIMONIALS ── */
        .testimonials-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
        }
        @media (max-width: 640px) { .testimonials-grid { grid-template-columns: 1fr; } }
        .testimonial-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 24px;
        }
        .testimonial-stars { color: #fbbf24; font-size: 0.85rem; margin-bottom: 14px; }
        .testimonial-quote { font-size: 0.9rem; color: #cbd5e1; line-height: 1.65; margin-bottom: 20px; font-style: italic; }
        .testimonial-author { display: flex; align-items: center; gap: 12px; }
        .testimonial-avatar {
          width: 38px; height: 38px; border-radius: 50%;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; color: white; font-size: 0.9rem; flex-shrink: 0;
        }
        .testimonial-name { font-size: 0.85rem; font-weight: 700; color: white; }
        .testimonial-role { font-size: 0.75rem; color: #64748b; }

        /* ── PRICING ── */
        .billing-toggle {
          display: inline-flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 100px; padding: 6px 6px 6px 16px; margin-bottom: 50px; cursor: pointer;
        }
        .billing-toggle span { font-size: 0.85rem; color: #94a3b8; font-weight: 500; }
        .billing-toggle .active-label { color: white; font-weight: 700; }
        .toggle-switch {
          width: 44px; height: 24px; background: rgba(255,255,255,0.1);
          border-radius: 100px; position: relative; transition: background 0.2s; cursor: pointer;
          border: none;
        }
        .toggle-switch.on { background: linear-gradient(90deg, #2563eb, #06b6d4); }
        .toggle-knob {
          width: 18px; height: 18px; border-radius: 50%; background: white;
          position: absolute; top: 3px; left: 3px; transition: transform 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .toggle-switch.on .toggle-knob { transform: translateX(20px); }
        .annual-badge {
          background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3);
          color: #6ee7b7; font-size: 0.72rem; font-weight: 700;
          padding: 3px 10px; border-radius: 100px;
        }

        .pricing-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; align-items: start;
        }
        @media (max-width: 900px) { .pricing-grid { grid-template-columns: 1fr; max-width: 420px; margin: 0 auto; } }
        .pricing-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; padding: 28px; position: relative; transition: all 0.25s;
        }
        .pricing-card.featured {
          background: linear-gradient(145deg, rgba(37,99,235,0.12), rgba(6,182,212,0.08));
          border-color: rgba(37,99,235,0.35);
          box-shadow: 0 0 50px rgba(37,99,235,0.15);
        }
        .pricing-card:not(.featured):hover { border-color: rgba(255,255,255,0.14); }
        .pricing-badge-pill {
          position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(90deg, #2563eb, #06b6d4); color: white;
          font-size: 0.72rem; font-weight: 800; padding: 4px 14px; border-radius: 100px;
          white-space: nowrap; letter-spacing: 0.05em;
        }
        .pricing-name { font-size: 1rem; font-weight: 800; color: white; margin-bottom: 4px; }
        .pricing-desc { font-size: 0.8rem; color: #64748b; margin-bottom: 20px; }
        .pricing-price { margin-bottom: 24px; }
        .pricing-amount { font-size: 2.8rem; font-weight: 900; color: white; letter-spacing: -0.05em; line-height: 1; }
        .pricing-period { font-size: 0.85rem; color: #64748b; }
        .pricing-save { font-size: 0.75rem; color: #6ee7b7; margin-top: 4px; }
        .pricing-features-list { list-style: none; padding: 0; margin: 0 0 24px; display: flex; flex-direction: column; gap: 10px; }
        .pricing-features-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 0.875rem; color: #cbd5e1; }
        .pricing-check { color: #10b981; flex-shrink: 0; font-size: 0.9rem; margin-top: 1px; }
        .btn-pricing-primary {
          width: 100%; padding: 13px; border-radius: 10px; font-size: 0.95rem; font-weight: 700;
          cursor: pointer; border: none; transition: all 0.2s;
          background: linear-gradient(135deg, #2563eb, #06b6d4); color: white;
          box-shadow: 0 0 20px rgba(37,99,235,0.3);
        }
        .btn-pricing-primary:hover { transform: translateY(-2px); box-shadow: 0 0 30px rgba(37,99,235,0.5); }
        .btn-pricing-secondary {
          width: 100%; padding: 13px; border-radius: 10px; font-size: 0.95rem; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          background: rgba(255,255,255,0.04); color: #94a3b8;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .btn-pricing-secondary:hover { background: rgba(255,255,255,0.08); color: white; }

        /* ── CTA BOTTOM ── */
        .lp-cta-bottom {
          text-align: center; padding: 70px 0;
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .cta-bottom-title { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 900; color: white; margin-bottom: 14px; letter-spacing: -0.03em; }
        .cta-bottom-sub { font-size: 1rem; color: #64748b; margin-bottom: 36px; max-width: 600px; margin-left: auto; margin-right: auto; }

        /* ── FOOTER ── */
        .lp-footer {
          padding: 32px 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
          gap: 16px;
        }
        .lp-footer-copy { font-size: 0.8rem; color: #475569; }
        .lp-footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
        .lp-footer-links a { font-size: 0.8rem; color: #475569; text-decoration: none; transition: color 0.2s; }
        .lp-footer-links a:hover { color: #94a3b8; }

        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div className="landing-root">
        {/* Background orbs */}
        <div className="landing-bg">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="orb orb-4" />
        </div>

        {/* ── NAV ── */}
        <div className="lp-container">
          <nav className="lp-nav">
            <a href="/" className="lp-logo">
              <div className="lp-logo-icon">🧹</div>
              <span className="lp-logo-name">LimpiaGest</span>
            </a>
            <div className="lp-nav-links">
              <a href="#funcionalidades">Funcionalidades</a>
              <a href="#como-funciona">Cómo funciona</a>
              <a href="#pricing">Precios</a>
              <a href="#testimonios">Clientes</a>
            </div>
            <div className="lp-nav-actions">
              <button
                onClick={() => openModal()}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = "#94a3b8";
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                }}
              >
                Solicitar Demo
              </button>
              <Link
                to="/login"
                className="btn-hero-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "0.875rem",
                  borderRadius: "10px",
                }}
              >
                🔑 Acceso Clientes
              </Link>
            </div>
          </nav>
        </div>

        {/* ── HERO ── */}
        <div className="lp-container">
          <section className="lp-hero">
            <div>
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                Software de gestión integral para empresas de limpieza
              </div>
              <h1 className="hero-title">
                Gestiona tu empresa de limpieza{" "}
                <span className="hero-title-gradient">
                  de forma inteligente.
                </span>
              </h1>
              <p className="hero-subtitle">
                LimpiaGest es la plataforma SaaS todo en uno diseñada para
                empresas de limpieza. Control horario con GPS, evidencias
                fotográficas, facturación, gestión de comunidades, inventario,
                planificación de rutas y mucho más — todo desde una sola app.
              </p>
              <div className="hero-ctas">
                <button
                  className="btn-hero-primary"
                  onClick={() => openModal()}
                >
                  🚀 Solicitar Demo Gratis
                </button>
                <Link to="/login" className="btn-hero-secondary">
                  Entrar a la App →
                </Link>
              </div>
            </div>

            {/* Mockups */}
            <div className="hero-mockups">
              <img
                src="/images/og-image.png"
                alt="LimpiaGest - Software de gestión para empresas de limpieza con panel de administración y app móvil para operarios"
                className="hero-mockup-img"
              />
            </div>
          </section>

          {/* ── STATS ── */}
          <div className="lp-stats">
            {stats.map((s, i) => (
              <div key={i} className="stat-item">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── FEATURES ── */}
          <section className="lp-section" id="funcionalidades">
            <div className="lp-section-label">Funcionalidades Principales</div>
            <h2 className="lp-section-title">
              Todo lo que necesita tu empresa de limpieza,
              <br />
              en una sola plataforma.
            </h2>
            <p className="lp-section-sub">
              Diseñado específicamente para el sector de la limpieza profesional.
              12 módulos integrados que cubren desde el fichaje GPS hasta la
              facturación, sin curva de aprendizaje.
            </p>
            <div className="features-grid">
              {features.map((feat, i) => (
                <div key={i} className="feature-card">
                  <div
                    className="feature-icon"
                    style={{
                      background: `${feat.color}18`,
                      border: `1px solid ${feat.color}30`,
                    }}
                  >
                    {feat.icon}
                  </div>
                  <h3>{feat.title}</h3>
                  <p>{feat.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── ADVANCED FEATURES ── */}
          <section className="lp-section">
            <div className="lp-section-label">Y mucho más</div>
            <h2 className="lp-section-title">
              Funcionalidades avanzadas incluidas.
            </h2>
            <p className="lp-section-sub">
              Herramientas profesionales para empresas que quieren ir un paso
              más allá en eficiencia y control.
            </p>
            <div className="adv-grid">
              {advancedFeatures.map((feat, i) => (
                <div key={i} className="adv-item">
                  <div className="adv-icon">{feat.icon}</div>
                  <div>
                    <h4>{feat.title}</h4>
                    <p>{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── BEFORE / AFTER ── */}
          <section className="lp-section">
            <div className="lp-section-label">El cambio</div>
            <h2 className="lp-section-title">
              Antes vs. Después de LimpiaGest.
            </h2>
            <p className="lp-section-sub">
              Descubre cómo la digitalización transforma la gestión diaria
              de tu empresa de limpieza.
            </p>
            <div className="comparison-grid">
              <div className="comparison-card before">
                <h3>❌ Sin LimpiaGest</h3>
                <ul className="comparison-list">
                  <li><span className="icon">📝</span> Partes en papel que se pierden o se rellenan mal</li>
                  <li><span className="icon">📞</span> Llamadas y WhatsApps para cada cambio de ruta</li>
                  <li><span className="icon">⏰</span> Sin control real de horas ni kilometraje</li>
                  <li><span className="icon">📸</span> Sin evidencias de los servicios realizados</li>
                  <li><span className="icon">💰</span> Facturación manual con errores y retrasos</li>
                  <li><span className="icon">😤</span> Reclamaciones de clientes sin pruebas para defenderte</li>
                </ul>
              </div>
              <div className="comparison-card after">
                <h3>✅ Con LimpiaGest</h3>
                <ul className="comparison-list">
                  <li><span className="icon">📱</span> Todo digital desde el móvil del operario</li>
                  <li><span className="icon">🔄</span> Reasignaciones y traspasos con un clic</li>
                  <li><span className="icon">📍</span> GPS en tiempo real con fichajes automáticos</li>
                  <li><span className="icon">📸</span> Fotos con marca de agua, GPS y hora exacta</li>
                  <li><span className="icon">🧾</span> Facturación integrada con requisitos Verifactu</li>
                  <li><span className="icon">🛡️</span> Portal del cliente con evidencias verificables</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ── HOW IT WORKS ── */}
          <section className="lp-section" id="como-funciona">
            <div className="lp-section-label">Implementación</div>
            <h2 className="lp-section-title">
              En marcha en menos de 24 horas.
            </h2>
            <p className="lp-section-sub">
              Sin migraciones complejas. Sin formación técnica. Tus operarios
              estarán usándolo desde el primer día.
            </p>
            <div className="steps-grid">
              <div className="step-card">
                <div className="step-number">1</div>
                <h3>Alta de cuenta</h3>
                <p>Configuramos tu espacio en la nube con tus datos y logo de empresa.</p>
              </div>
              <div className="step-card">
                <div className="step-number">2</div>
                <h3>Importación</h3>
                <p>Subimos tu lista de operarios, clientes y comunidades de una sola vez.</p>
              </div>
              <div className="step-card">
                <div className="step-number">3</div>
                <h3>Planificación</h3>
                <p>Asignas las rutas, horarios y tareas a realizar en cada servicio.</p>
              </div>
              <div className="step-card">
                <div className="step-number">4</div>
                <h3>¡A trabajar!</h3>
                <p>Tus operarios fichan y reportan desde su móvil, tú lo ves en tiempo real.</p>
              </div>
            </div>
          </section>

          {/* ── TESTIMONIALS ── */}
          <section className="lp-section" id="testimonios">
            <div className="lp-section-label">Casos de éxito</div>
            <h2 className="lp-section-title">
              Empresas que ya han dado el salto.
            </h2>
            <p className="lp-section-sub">
              Únete a las cientos de empresas de limpieza que han digitalizado
              su gestión diaria y ahorrado miles de euros.
            </p>
            <div className="testimonials-grid">
              {testimonials.map((t, i) => (
                <div key={i} className="testimonial-card">
                  <div className="testimonial-stars">★★★★★</div>
                  <p className="testimonial-quote">"{t.quote}"</p>
                  <div className="testimonial-author">
                    <div className="testimonial-avatar">
                      {t.author.charAt(0)}
                    </div>
                    <div>
                      <div className="testimonial-name">{t.author}</div>
                      <div className="testimonial-role">{t.role}, {t.company}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── PRICING ── */}
          <section className="lp-section" id="pricing">
            <div className="lp-section-label">Planes y Precios</div>
            <h2 className="lp-section-title">
              Planes adaptados a tu crecimiento.
            </h2>
            <p className="lp-section-sub">
              Empieza con lo básico o desbloquea todo el potencial. Sin
              permanencia ni letra pequeña.
            </p>
            <div style={{ textAlign: "center" }}>
              <div
                className="billing-toggle"
                onClick={() => setBillingAnnual(!billingAnnual)}
              >
                <span className={!billingAnnual ? "active-label" : ""}>
                  Mensual
                </span>
                <button
                  type="button"
                  className={`toggle-switch ${billingAnnual ? "on" : ""}`}
                >
                  <div className="toggle-knob" />
                </button>
                <span className={billingAnnual ? "active-label" : ""}>
                  Anual
                </span>
                <span className="annual-badge">-20%</span>
              </div>
            </div>
            <div className="pricing-grid">
              {pricingPlans.map((plan) => {
                const price =
                  plan.monthlyPrice === null
                    ? "A medida"
                    : billingAnnual
                    ? Math.round(plan.monthlyPrice * 0.8)
                    : plan.monthlyPrice;
                return (
                  <div
                    key={plan.id}
                    className={`pricing-card ${
                      plan.featured ? "featured" : ""
                    }`}
                  >
                    {plan.featured && (
                      <div className="pricing-badge-pill">MÁS POPULAR</div>
                    )}
                    <h3 className="pricing-name">{plan.name}</h3>
                    <p className="pricing-desc">{plan.desc}</p>
                    <div className="pricing-price">
                      {plan.monthlyPrice === null ? (
                        <div className="pricing-amount">A medida</div>
                      ) : (
                        <>
                          <span className="pricing-amount">{price}€</span>
                          <span className="pricing-period">/mes</span>
                          {billingAnnual && (
                            <div className="pricing-save">
                              Pago anual de {price * 12}€ (ahorras{" "}
                              {plan.monthlyPrice * 12 - price * 12}€)
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <ul className="pricing-features-list">
                      {plan.features.map((f, i) => (
                        <li key={i}>
                          <span className="pricing-check">✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      className={
                        plan.featured
                          ? "btn-pricing-primary"
                          : "btn-pricing-secondary"
                      }
                      onClick={() => openModal(plan.id)}
                    >
                      {plan.cta}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── CTA BOTTOM ── */}
          <section className="lp-cta-bottom">
            <h2 className="cta-bottom-title">
              ¿Listo para modernizar tu empresa?
            </h2>
            <p className="cta-bottom-sub">
              Pide tu demo sin compromiso y descubre cómo LimpiaGest puede
              ayudarte a crecer.
            </p>
            <button
              className="btn-hero-primary"
              onClick={() => openModal()}
              style={{ fontSize: "1.1rem", padding: "16px 36px" }}
            >
              🚀 Solicitar Acceso Gratuito
            </button>
          </section>

          {/* ── FOOTER ── */}
          <footer className="lp-footer">
            <div className="lp-footer-copy">
              © {new Date().getFullYear()} LimpiaGest. Todos los derechos reservados.
            </div>
            <div className="lp-footer-links">
              <Link to="/aviso-legal">Aviso Legal</Link>
              <Link to="/politica-de-privacidad">Privacidad</Link>
              <Link to="/terminos-condiciones">Términos</Link>
              <a href="mailto:limpiezasrayba@gmail.com">Contacto</a>
            </div>
          </footer>
        </div>
      </div>

      <RequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultPlan={modalPlan}
      />
    </>
  );
}
