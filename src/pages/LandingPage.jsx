import React from 'react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  const emailContact = "limpiezasrayba@gmail.com";
  const demoSubject = encodeURIComponent("Solicitud de Demo - LimpiaGest");
  const demoBody = encodeURIComponent("Hola, me interesa conocer más sobre LimpiaGest para mi empresa de limpieza. Me gustaría solicitar una demostración y conocer los planes de precios.\n\nNombre de la empresa:\nContacto:\nTeléfono:");
  const demoMailto = `mailto:${emailContact}?subject=${demoSubject}&body=${demoBody}`;

  const features = [
    {
      icon: "⏱️",
      title: "Control Horario & GPS",
      desc: "Fichaje geolocalizado en tiempo real para operarios. Registro inteligente de inicio y fin de jornada con cálculo de kilometraje automático."
    },
    {
      icon: "📸",
      title: "Evidencias Fotográficas",
      desc: "Asegura la calidad del servicio. Los operarios suben fotos del antes y después de cada tarea con marcas de agua de geolocalización."
    },
    {
      icon: "📋",
      title: "Tareas Inteligentes",
      desc: "Crea plantillas de tareas repetitivas por comunidad o portal. Automatiza las asignaciones diarias y ahorra horas de planificación."
    },
    {
      icon: "🚗",
      title: "Registro de Kilometraje",
      desc: "Control exacto de los desplazamientos del personal. Los operarios registran los kilómetros recorridos con validación y reportes mensuales."
    },
    {
      icon: "📦",
      title: "Gestión de Materiales",
      desc: "Los operarios pueden solicitar consumibles y materiales directamente desde su móvil. Controla el inventario de forma centralizada."
    },
    {
      icon: "🔄",
      title: "Traspasos al Instante",
      desc: "Reasigna servicios o jornadas sobre la marcha con un par de clics si un operario se reporta enfermo o hay un imprevisto."
    }
  ];

  const pricingPlans = [
    {
      name: "Pyme",
      price: "49€",
      period: "/mes",
      desc: "Perfecto para pequeñas empresas locales.",
      features: [
        "Hasta 10 operarios",
        "Control horario básico",
        "Gestión de comunidades",
        "Soporte por email"
      ],
      featured: false
    },
    {
      name: "Empresa",
      price: "99€",
      period: "/mes",
      desc: "La solución más completa para crecer.",
      features: [
        "Hasta 50 operarios",
        "Evidencias fotográficas (ilimitadas)",
        "Control por GPS y kilometraje",
        "Traspasos en tiempo real",
        "Soporte prioritario 24/7"
      ],
      featured: true
    },
    {
      name: "Enterprise",
      price: "Personalizado",
      period: "",
      desc: "Para grandes corporaciones de limpieza.",
      features: [
        "Operarios ilimitados",
        "Integración con API personalizada",
        "Dominio y logo propio (White-label)",
        "Servidor cloud dedicado",
        "Gerente de cuenta dedicado"
      ],
      featured: false
    }
  ];

  return (
    <div className="landing-page-wrapper">
      <div className="container">
        {/* Navigation Bar */}
        <header className="landing-nav">
          <div className="landing-logo-container">
            <div className="landing-logo-icon">🧹</div>
            <span className="landing-brand">LimpiaGest</span>
          </div>
          <Link to="/login" className="btn btn-primary btn-sm" style={{ boxShadow: '0 0 15px rgba(37, 99, 235, 0.3)' }}>
            🔑 Acceso Clientes
          </Link>
        </header>

        {/* Hero Section */}
        <section className="landing-hero animate-slide-up">
          <div className="hero-content">
            <div className="hero-tag">
              ✨ Nuevo: Fichajes PWA con Geoposicionamiento
            </div>
            <h1 className="hero-title">
              La revolución en la gestión de <span>servicios de limpieza</span>.
            </h1>
            <p className="hero-subtitle">
              LimpiaGest es el software SaaS todo en uno diseñado específicamente para empresas de limpieza. Controla operarios, automatiza tareas en comunidades, certifica trabajos con evidencias fotográficas y optimiza tus costes en tiempo real.
            </p>
            <div className="hero-ctas">
              <a href={demoMailto} className="btn btn-success btn-lg">
                🚀 Solicitar Demo Gratis
              </a>
              <Link to="/login" className="btn btn-secondary btn-lg" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', borderColor: 'rgba(255,255,255,0.1)' }}>
                Entrar a la App
              </Link>
            </div>
          </div>

          <div className="mockup-container">
            {/* Admin Dashboard Mockup */}
            <div className="dashboard-mockup">
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }}></span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></span>
              </div>
              <div style={{ background: '#0b0f19', borderRadius: '6px', padding: '12px', fontSize: '10px', color: '#94a3b8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px', marginBottom: '6px' }}>
                  <strong>📊 LimpiaGest Admin Panel</strong>
                  <span style={{ color: '#22c55e' }}>● En línea</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>Activos Hoy</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'white', marginTop: '2px' }}>12 Operarios</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>Servicios Completados</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981', marginTop: '2px' }}>85% (34/40)</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>Incidencias</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', marginTop: '2px' }}>0 Pendientes</div>
                  </div>
                </div>
                <div style={{ fontSize: '9px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)', padding: '6px', borderRadius: '4px' }}>
                  🔔 <strong>Última actividad:</strong> Operaria Agustina A. completó la limpieza en Portal B de Comunidad 'El Huerto'. Evidencia fotográfica subida correctamente.
                </div>
              </div>
            </div>

            {/* Mobile App Mockup */}
            <div className="phone-mockup">
              <div style={{ background: '#1e293b', padding: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
                <span>📶 5G</span>
                <strong>LimpiaGest App</strong>
                <span>🔋 90%</span>
              </div>
              <div style={{ padding: '12px', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px', background: '#0b0f19' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'white' }}>📋 Tareas de Hoy</div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '8px', fontSize: '9px' }}>
                  <div style={{ fontWeight: 'bold', color: '#93c5fd' }}>🏢 Comunidad El Huerto</div>
                  <div style={{ margin: '4px 0', color: '#cbd5e1' }}>• Fregar portal y escaleras</div>
                  <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span>✓</span> Completada
                  </div>
                </div>
                
                <div style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '6px', padding: '8px', fontSize: '9px', textAlign: 'center', marginTop: 'auto' }}>
                  <span style={{ fontSize: '14px' }}>📸</span>
                  <div style={{ fontWeight: 'bold', color: 'white', marginTop: '4px' }}>Cargar Foto Evidencia</div>
                  <div style={{ fontSize: '7px', color: '#94a3b8' }}>Geolocalización GPS activa</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="landing-section">
          <h2 className="landing-section-title">Diseñado exclusivamente para el sector</h2>
          <p className="landing-section-subtitle">
            LimpiaGest elimina el papeleo, las llamadas constantes y la incertidumbre de los servicios de limpieza externos.
          </p>

          <div className="features-grid">
            {features.map((feat, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon-wrapper">
                  {feat.icon}
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works Section */}
        <section className="landing-section" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-12) var(--space-8)', border: '1px solid rgba(255,255,255,0.03)' }}>
          <h2 className="landing-section-title">¿Cómo funciona LimpiaGest?</h2>
          <p className="landing-section-subtitle">Implementa la app en tu empresa en solo 3 sencillos pasos.</p>

          <div className="steps-container">
            <div className="step-item">
              <div className="step-number">1</div>
              <h3>Configura tus comunidades</h3>
              <p>Importa portales, comunidades y asigna sus plantillas de tareas recurrentes desde tu panel web.</p>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <h3>Asigna operarios</h3>
              <p>Tus limpiadores instalan la PWA en su móvil en 5 segundos y ven su cuadrante diario al instante.</p>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <h3>Controla en tiempo real</h3>
              <p>Recibe notificaciones de fichaje, valida evidencias de limpieza y mantén informados a tus clientes.</p>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="landing-section">
          <h2 className="landing-section-title">Planes flexibles para cada empresa</h2>
          <p className="landing-section-subtitle">Sin contratos abusivos ni costes ocultos. Elige el plan que mejor se adapte a tu plantilla.</p>

          <div className="pricing-grid">
            {pricingPlans.map((plan, i) => (
              <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''}`}>
                {plan.featured && <div className="pricing-badge">Recomendado</div>}
                <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 'bold', color: 'white' }}>{plan.name}</h3>
                <p style={{ color: '#94a3b8', fontSize: 'var(--font-xs)', marginTop: '4px' }}>{plan.desc}</p>
                <div className="pricing-price">
                  {plan.price}<span>{plan.period}</span>
                </div>
                <ul className="pricing-features">
                  {plan.features.map((feat, idx) => (
                    <li key={idx}>
                      <span className="pricing-check">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a 
                  href={demoMailto} 
                  className={`btn w-full mt-6 ${plan.featured ? 'btn-success' : 'btn-secondary'}`}
                  style={!plan.featured ? { background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' } : {}}
                >
                  {plan.price === "Personalizado" ? "Contactar Ventas" : "Comenzar Prueba"}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Footer */}
        <section className="landing-section text-center" style={{ padding: 'var(--space-12) 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white', marginBottom: 'var(--space-4)' }}>
            ¿Listo para digitalizar tu negocio?
          </h2>
          <p style={{ color: '#94a3b8', maxWidth: '600px', margin: '0 auto var(--space-8) auto', fontSize: 'var(--font-base)' }}>
            Únete a las empresas que ya han optimizado su tiempo y certificado el 100% de sus servicios de limpieza con LimpiaGest.
          </p>
          <a href={demoMailto} className="btn btn-success btn-lg">
            🚀 Solicitar Demostración Comercial
          </a>
          <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
            O envíanos un correo directamente a <strong style={{ color: 'white' }}>limpiezasrayba@gmail.com</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
