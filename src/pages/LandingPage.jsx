import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
const features = [
  {
    icon: "⏱️",
    title: "Control Horario & GPS",
    desc: "Fichaje geolocalizado en tiempo real. Registro automático de inicio y fin de jornada con cálculo de kilometraje.",
    color: "#2563eb"
  },
  {
    icon: "📸",
    title: "Evidencias Fotográficas",
    desc: "Certifica cada servicio con fotos del antes y después. Marca de agua con GPS y hora para garantizar la veracidad.",
    color: "#7c3aed"
  },
  {
    icon: "📋",
    title: "Tareas Inteligentes",
    desc: "Crea plantillas de tareas por comunidad o portal. Automatiza asignaciones diarias y ahorra horas de planificación.",
    color: "#0891b2"
  },
  {
    icon: "🚗",
    title: "Registro de Kilometraje",
    desc: "Control exacto de desplazamientos. Reportes mensuales validados listos para compensación de gastos.",
    color: "#059669"
  },
  {
    icon: "📦",
    title: "Gestión de Materiales",
    desc: "Solicitudes de consumibles desde el móvil del operario. Inventario centralizado con alertas de stock mínimo.",
    color: "#d97706"
  },
  {
    icon: "🔄",
    title: "Traspasos al Instante",
    desc: "Reasigna servicios en segundos cuando un operario no puede acudir. Sin llamadas, sin caos.",
    color: "#dc2626"
  }
];

const stats = [
  { value: "500+", label: "Operarios gestionados" },
  { value: "98%", label: "Servicios certificados" },
  { value: "4h", label: "Ahorro semanal por admin" },
  { value: "0€", label: "Coste de setup" },
];

const testimonials = [
  {
    quote: "LimpiaGest nos ha permitido eliminar completamente los partes en papel. Ahora sabemos en tiempo real qué está pasando en cada comunidad.",
    author: "Raúl B.",
    role: "Director de Operaciones",
    company: "Limpiezas RyB"
  },
  {
    quote: "La app de los operarios es tan sencilla que no necesitamos formación. En dos días estaba todo el equipo funcionando.",
    author: "Mª Carmen G.",
    role: "Responsable de RRHH",
    company: "Servicios de Limpieza García"
  },
  {
    quote: "Mis clientes ahora reciben evidencias fotográficas de cada trabajo. Eso ha reducido las reclamaciones a cero.",
    author: "Javier M.",
    role: "Gerente",
    company: "Multiservicio Martínez"
  }
];

const pricingPlans = [
  {
    name: "Pyme",
    monthlyPrice: 49,
    desc: "Para pequeñas empresas locales.",
    features: [
      "Hasta 10 operarios",
      "Control horario con GPS",
      "Gestión de comunidades",
      "Evidencias fotográficas",
      "Soporte por email",
    ],
    featured: false,
    cta: "Solicitar Acceso"
  },
  {
    name: "Empresa",
    monthlyPrice: 99,
    desc: "La solución más completa para crecer.",
    features: [
      "Hasta 50 operarios",
      "Evidencias ilimitadas con GPS",
      "Control de kilometraje",
      "Traspasos en tiempo real",
      "Gestión de materiales",
      "Soporte prioritario 24/7",
    ],
    featured: true,
    cta: "Empezar Ahora"
  },
  {
    name: "Enterprise",
    monthlyPrice: null,
    desc: "Para grandes corporaciones.",
    features: [
      "Operarios ilimitados",
      "API personalizada",
      "White-label con tu logo",
      "Servidor cloud dedicado",
      "Gerente de cuenta dedicado",
    ],
    featured: false,
    cta: "Contactar Ventas"
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST MODAL
// ─────────────────────────────────────────────────────────────────────────────
function RequestModal({ isOpen, onClose, defaultPlan = '' }) {
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    operariosCount: '',
    plan: defaultPlan,
    message: ''
  });
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setPrivacyAccepted(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      await addDoc(collection(db, 'companyRequests'), {
        ...form,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setStatus('success');
    } catch (err) {
      console.error('Error saving request:', err);
      setErrorMsg('No se pudo enviar la solicitud. Inténtalo de nuevo o escríbenos a limpiezasrayba@gmail.com');
      setStatus('error');
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'linear-gradient(145deg, #0f172a, #1e293b)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px',
        padding: '32px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s ease'
      }}>
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, marginBottom: '12px' }}>
              ¡Solicitud recibida!
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '24px', lineHeight: 1.6 }}>
              Nos pondremos en contacto contigo en menos de 24 horas para configurar tu cuenta.
            </p>
            <button onClick={onClose} className="btn btn-primary btn-lg w-full">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 800, marginBottom: '4px' }}>
                  Solicitar Acceso a LimpiaGest
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Te contactamos en menos de 24 horas para configurar tu empresa.
                </p>
              </div>
              <button
                onClick={onClose}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', cursor: 'pointer', borderRadius: '8px', padding: '6px 10px', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {status === 'error' && (
              <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '10px', padding: '12px', marginBottom: '16px', color: '#fca5a5', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Empresa *</label>
                  <input
                    name="companyName"
                    className="form-input"
                    placeholder="Limpiezas García SL"
                    value={form.companyName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Contacto *</label>
                  <input
                    name="contactName"
                    className="form-input"
                    placeholder="Manuel García"
                    value={form.contactName}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Email *</label>
                  <input
                    name="email"
                    type="email"
                    className="form-input"
                    placeholder="tu@empresa.com"
                    value={form.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input
                    name="phone"
                    type="tel"
                    className="form-input"
                    placeholder="666 123 456"
                    value={form.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nº de operarios</label>
                  <select
                    name="operariosCount"
                    className="form-input"
                    value={form.operariosCount}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="1-5">1 – 5</option>
                    <option value="6-10">6 – 10</option>
                    <option value="11-25">11 – 25</option>
                    <option value="26-50">26 – 50</option>
                    <option value="50+">Más de 50</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Plan de interés</label>
                  <select
                    name="plan"
                    className="form-input"
                    value={form.plan}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Pyme">Pyme — 49€/mes</option>
                    <option value="Empresa">Empresa — 99€/mes</option>
                    <option value="Enterprise">Enterprise — Personalizado</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mensaje (opcional)</label>
                <textarea
                  name="message"
                  className="form-input"
                  placeholder="Cuéntanos brevemente tu situación actual..."
                  value={form.message}
                  onChange={handleChange}
                  rows={3}
                  style={{ resize: 'vertical', minHeight: '80px' }}
                />
              </div>

              {/* GDPR Compliance Layer 1 */}
              <div className="gdpr-info-table-container">
                <table className="gdpr-info-table">
                  <tbody>
                    <tr>
                      <td className="gdpr-info-label">Responsable:</td>
                      <td className="gdpr-info-value">Daniel Rabaneda / RyB Limpiezas</td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Finalidad:</td>
                      <td className="gdpr-info-value">Gestionar su solicitud de demostración del software y contacto comercial.</td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Legitimación:</td>
                      <td className="gdpr-info-value">Consentimiento del interesado al enviar el formulario.</td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Destinatarios:</td>
                      <td className="gdpr-info-value">No se cederán datos a terceros salvo obligación legal o proveedores tecnológicos autorizados.</td>
                    </tr>
                    <tr>
                      <td className="gdpr-info-label">Derechos:</td>
                      <td className="gdpr-info-value">Acceso, rectificación, supresión y otros detallados en la Info Adicional.</td>
                    </tr>
                  </tbody>
                </table>
                <div className="gdpr-info-link-container">
                  Información Adicional: Puedes consultar la información detallada en nuestra <Link to="/politica-de-privacidad" target="_blank" rel="noopener noreferrer">Política de Privacidad</Link>.
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
                <label htmlFor="landing-privacy-checkbox" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                  Acepto la <Link to="/politica-de-privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-light)', textDecoration: 'underline' }}>Política de Privacidad</Link> y el tratamiento de mis datos.*
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-success btn-lg w-full"
                disabled={status === 'loading'}
                style={{ marginTop: '4px' }}
              >
                {status === 'loading' ? '⏳ Enviando solicitud...' : '🚀 Solicitar Acceso Gratuito'}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b' }}>
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
  const [modalPlan, setModalPlan] = useState('');
  const [billingAnnual, setBillingAnnual] = useState(false);

  function openModal(plan = '') {
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
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; overflow: hidden; margin: 0 0 80px;
        }
        @media (max-width: 640px) { .lp-stats { grid-template-columns: repeat(2,1fr); } }
        .stat-item {
          padding: 28px 24px; text-align: center;
          background: rgba(6,11,24,0.6);
          transition: background 0.2s;
        }
        .stat-item:hover { background: rgba(37,99,235,0.08); }
        .stat-value { font-size: 2.2rem; font-weight: 900; color: white; letter-spacing: -0.03em; }
        .stat-label { font-size: 0.8rem; color: #64748b; margin-top: 4px; font-weight: 500; }

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

        /* ── HOW IT WORKS ── */
        .steps-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
          position: relative;
        }
        @media (max-width: 720px) { .steps-grid { grid-template-columns: 1fr; } }
        .steps-grid::before {
          content: ''; position: absolute; top: 28px; left: calc(16.6% + 20px); right: calc(16.6% + 20px);
          height: 2px; background: linear-gradient(90deg, #2563eb, #06b6d4);
          opacity: 0.3;
        }
        @media (max-width: 720px) { .steps-grid::before { display: none; } }
        .step-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 28px 24px; text-align: center;
        }
        .step-number {
          width: 56px; height: 56px; border-radius: 50%;
          background: linear-gradient(135deg, #2563eb, #06b6d4);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.3rem; font-weight: 900; color: white;
          margin: 0 auto 20px; box-shadow: 0 0 20px rgba(37,99,235,0.4);
        }
        .step-card h3 { font-size: 1rem; font-weight: 700; color: white; margin-bottom: 8px; }
        .step-card p { font-size: 0.875rem; color: #64748b; line-height: 1.6; }

        /* ── TESTIMONIALS ── */
        .testimonials-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
        }
        @media (max-width: 900px) { .testimonials-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 580px) { .testimonials-grid { grid-template-columns: 1fr; } }
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
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: start;
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
        .cta-bottom-sub { font-size: 1rem; color: #64748b; margin-bottom: 36px; }

        /* ── FOOTER ── */
        .lp-footer {
          padding: 32px 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: gap;
          gap: 16px;
        }
        .lp-footer-copy { font-size: 0.8rem; color: #475569; }
        .lp-footer-links { display: flex; gap: 20px; }
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
        </div>

        {/* ── NAV ── */}
        <div className="lp-container">
          <nav className="lp-nav">
            <a href="/" className="lp-logo">
              <div className="lp-logo-icon">🧹</div>
              <span className="lp-logo-name">LimpiaGest</span>
            </a>
            <div className="lp-nav-actions">
              <button
                onClick={() => openModal()}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)', padding: '8px 16px',
                  borderRadius: '10px', fontWeight: 600, fontSize: '0.85rem',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
                onMouseOver={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              >
                Solicitar Demo
              </button>
              <Link to="/login" className="btn-hero-primary" style={{ padding: '8px 18px', fontSize: '0.875rem', borderRadius: '10px' }}>
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
                Nuevo: Fichajes PWA con GPS en tiempo real
              </div>
              <h1 className="hero-title">
                El software para <span className="hero-title-gradient">empresas de limpieza</span> definitivo.
              </h1>
              <p className="hero-subtitle">
                LimpiaGest es el software SaaS todo en uno diseñado para empresas de limpieza. Controla operarios, automatiza tareas, certifica trabajos con evidencias fotográficas y optimiza tus costes.
              </p>
              <div className="hero-ctas">
                <button className="btn-hero-primary" onClick={() => openModal()}>
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
                alt="LimpiaGest - Panel de gestión de RyB Limpiezas y aplicación móvil para operarios"
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
          <section className="lp-section">
            <div className="lp-section-label">Funcionalidades</div>
            <h2 className="lp-section-title">Todo lo que necesita tu empresa,<br />en una sola app.</h2>
            <p className="lp-section-sub">
              Diseñado específicamente para el sector de la limpieza. Sin funciones innecesarias, sin curva de aprendizaje.
            </p>
            <div className="features-grid">
              {features.map((feat, i) => (
                <div key={i} className="feature-card">
                  <div className="feature-icon" style={{ background: `${feat.color}18`, border: `1px solid ${feat.color}30` }}>
                    {feat.icon}
                  </div>
                  <h3>{feat.title}</h3>
                  <p>{feat.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── HOW IT WORKS ── */}
          <section className="lp-section">
            <div className="lp-section-label">Implementación</div>
            <h2 className="lp-section-title">En marcha en menos de 24 horas.</h2>
            <p className="lp-section-sub">
              Sin migraciones complejas. Sin formación técnica. Tus operarios instalan la app en el móvil en segundos.
            </p>
            <div className="steps-grid">
              {[
                { n: '1', title: 'Solicita el acceso', desc: 'Rellena el formulario. En menos de 24h te configuramos la cuenta con tus datos de empresa.' },
                { n: '2', title: 'Configura tus comunidades', desc: 'Importa portales, comunidades y plantillas de tareas recurrentes desde tu panel web.' },
                { n: '3', title: 'Controla en tiempo real', desc: 'Tus operarios entran con su móvil, tú ves todo desde el dashboard. Así de sencillo.' },
              ].map((s, i) => (
                <div key={i} className="step-card">
                  <div className="step-number">{s.n}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── TESTIMONIALS ── */}
          <section className="lp-section">
            <div className="lp-section-label">Testimonios</div>
            <h2 className="lp-section-title">Lo que dicen nuestros clientes.</h2>
            <p className="lp-section-sub">
              Empresas como la tuya ya optimizan su gestión diaria con LimpiaGest.
            </p>
            <div className="testimonials-grid">
              {testimonials.map((t, i) => (
                <div key={i} className="testimonial-card">
                  <div className="testimonial-stars">★★★★★</div>
                  <p className="testimonial-quote">"{t.quote}"</p>
                  <div className="testimonial-author">
                    <div className="testimonial-avatar">{t.author.charAt(0)}</div>
                    <div>
                      <div className="testimonial-name">{t.author}</div>
                      <div className="testimonial-role">{t.role} · {t.company}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── PRICING ── */}
          <section className="lp-section" id="pricing">
            <div className="lp-section-label">Precios</div>
            <h2 className="lp-section-title">Sin contratos. Sin sorpresas.</h2>
            <p className="lp-section-sub">
              Elige el plan que mejor se adapta a tu plantilla. Cancela cuando quieras.
            </p>

            {/* Billing toggle */}
            <div
              className="billing-toggle"
              onClick={() => setBillingAnnual(prev => !prev)}
              role="button"
              aria-label="Cambiar facturación anual/mensual"
            >
              <span className={!billingAnnual ? 'active-label' : ''}>Mensual</span>
              <button className={`toggle-switch ${billingAnnual ? 'on' : ''}`} aria-hidden="true">
                <span className="toggle-knob" />
              </button>
              <span className={billingAnnual ? 'active-label' : ''}>Anual</span>
              {billingAnnual && <span className="annual-badge">−20%</span>}
            </div>

            <div className="pricing-grid">
              {pricingPlans.map((plan, i) => {
                const price = plan.monthlyPrice
                  ? (billingAnnual ? Math.round(plan.monthlyPrice * 0.8) : plan.monthlyPrice)
                  : null;
                return (
                  <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''}`}>
                    {plan.featured && <div className="pricing-badge-pill">⭐ Más Popular</div>}
                    <div className="pricing-name">{plan.name}</div>
                    <div className="pricing-desc">{plan.desc}</div>
                    <div className="pricing-price">
                      {price !== null ? (
                        <>
                          <span className="pricing-amount">{price}€</span>
                          <span className="pricing-period"> /mes</span>
                          {billingAnnual && (
                            <div className="pricing-save">Ahorras {plan.monthlyPrice * 12 - price * 12}€ al año</div>
                          )}
                        </>
                      ) : (
                        <span className="pricing-amount" style={{ fontSize: '1.8rem' }}>Personalizado</span>
                      )}
                    </div>
                    <ul className="pricing-features-list">
                      {plan.features.map((f, j) => (
                        <li key={j}>
                          <span className="pricing-check">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => openModal(plan.name)}
                      className={plan.featured ? 'btn-pricing-primary' : 'btn-pricing-secondary'}
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
            <h2 className="cta-bottom-title">¿Listo para digitalizar tu negocio?</h2>
            <p className="cta-bottom-sub">
              Únete a las empresas que ya han optimizado su tiempo y certificado el 100% de sus servicios.
            </p>
            <button className="btn-hero-primary" onClick={() => openModal()} style={{ fontSize: '1.05rem', padding: '15px 34px' }}>
              🚀 Solicitar Demo Gratuita
            </button>
            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: '#475569' }}>
              O escríbenos directamente a <strong style={{ color: '#94a3b8' }}>limpiezasrayba@gmail.com</strong>
            </p>
          </section>

          {/* ── FOOTER ── */}
          <footer className="lp-footer">
            <div className="lp-footer-copy">
              © {new Date().getFullYear()} LimpiaGest · RyB Limpiezas · Todos los derechos reservados
            </div>
            <div className="lp-footer-links" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="mailto:limpiezasrayba@gmail.com">Contacto</a>
              <Link to="/login">Acceso clientes</Link>
              <Link to="/aviso-legal">Aviso Legal</Link>
              <Link to="/politica-de-privacidad">Política de Privacidad</Link>
              <Link to="/politica-de-cookies">Política de Cookies</Link>
            </div>
          </footer>
        </div>
      </div>

      {/* ── MODAL ── */}
      <RequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultPlan={modalPlan}
      />
    </>
  );
}
