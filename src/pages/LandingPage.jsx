import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import "./LandingPage.css";

const SCENES = [
  {
    label: "Control",
    title: "Toda tu empresa de limpieza bajo control desde una sola app.",
    subtitle:
      "Planifica servicios, controla las horas y factura sin olvidos ni reclamaciones.",
    image: "/images/landing-3d/planning-anonymized.png",
    imageAlt: "Planificación mensual de LimpiaGest con operarios y servicios",
    signal: "Servicio cubierto",
    signalDetail: "Todo en planificación",
  },
  {
    label: "Planificación",
    title: "Ningún servicio se queda atrás.",
    subtitle:
      "Organiza el mes de un vistazo y detecta huecos antes de que se conviertan en olvidos.",
    image: "/images/landing-3d/planning-anonymized.png",
    imageAlt: "Calendario de planificación de servicios en LimpiaGest",
    signal: "Mes organizado",
    signalDetail: "Equipo y clientes conectados",
  },
  {
    label: "Horas",
    title: "Comprueba las horas sin perseguir a nadie.",
    subtitle:
      "Revisa inicios, finales, duración y estado de cada jornada desde un único registro.",
    image: "/images/landing-3d/hours-anonymized.png",
    imageAlt: "Control horario de operarios en LimpiaGest",
    signal: "Horas claras",
    signalDetail: "Jornadas centralizadas",
  },
  {
    label: "Servicios",
    title: "Sabe qué se hizo y cuándo.",
    subtitle:
      "Conserva el estado y el historial de cada servicio para responder con información.",
    image: "/images/landing-3d/services-anonymized.png",
    imageAlt: "Servicios realizados y completados en LimpiaGest",
    signal: "Servicio trazable",
    signalDetail: "Historial disponible",
  },
  {
    label: "Facturación",
    title: "Del servicio terminado a la factura.",
    subtitle:
      "Prepara, revisa y emite la facturación desde el mismo centro de operaciones.",
    image: "/images/landing-3d/billing-anonymized.png",
    imageAlt: "Borradores y emisión de facturas en LimpiaGest",
    signal: "Borradores listos",
    signalDetail: "Importes centralizados",
  },
  {
    label: "Prueba gratis",
    title: "30 días para ponerlo todo bajo control.",
    subtitle:
      "Accede a toda la plataforma sin tarjeta y configura tu empresa paso a paso.",
    image: "/images/landing-3d/planning-anonymized.png",
    imageAlt: "Centro de operaciones de LimpiaGest durante la prueba gratuita",
    signal: "Empieza hoy",
    signalDetail: "Configuración guiada",
  },
];

const PRICING_PLANS = [
  {
    id: "autonomo",
    name: "Autónomo",
    price: "19 €",
    description: "Para profesionales y microempresas.",
    features: [
      "Hasta 5 operarios",
      "Hasta 50 comunidades",
      "Control horario con GPS",
      "App móvil y evidencias",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "39 €",
    description: "Para pequeñas empresas en crecimiento.",
    features: [
      "Hasta 10 operarios",
      "Hasta 100 comunidades",
      "Todo lo de Autónomo",
      "Kilometraje, ausencias y avisos",
    ],
    recommended: true,
  },
  {
    id: "professional",
    name: "Profesional",
    price: "79 €",
    description: "Para equipos con varias rutas y zonas.",
    features: [
      "Hasta 30 operarios",
      "Hasta 300 comunidades",
      "Todo lo de Starter",
      "Planificación, materiales y traspasos",
    ],
  },
  {
    id: "business",
    name: "Empresa",
    price: "149 €",
    description: "Para operaciones más amplias.",
    features: [
      "Hasta 100 operarios",
      "Hasta 1.000 comunidades",
      "Facturación y portal del cliente",
      "Informes avanzados",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "A medida",
    description: "Para necesidades y despliegues especiales.",
    features: [
      "Operarios y comunidades ilimitados",
      "API y marca personalizada",
      "Infraestructura dedicada",
      "Acompañamiento especializado",
    ],
  },
];

const ONBOARDING_STEPS = [
  ["Crear empresa", "Datos básicos y configuración inicial."],
  ["Añadir operarios", "Prepara el equipo que usará la app móvil."],
  ["Añadir clientes", "Registra empresas, comunidades o centros."],
  ["Crear el primer servicio", "Asigna fecha, lugar, tareas y responsable."],
  ["Configurar facturación", "Deja preparado el cierre del recorrido."],
];

function TrialRequestModal({ isOpen, onClose, defaultPlan, onRegistered }) {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    operariosCount: "",
    plan: defaultPlan || "starter",
    password: "",
    confirmPassword: "",
    message: "",
    website: "",
  });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setForm((current) => ({
      ...current,
      plan: defaultPlan || "starter",
      password: "",
      confirmPassword: "",
    }));
    setPrivacyAccepted(false);
    setStatus("idle");
    setError("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [defaultPlan, isOpen, onClose]);

  if (!isOpen) return null;

  const isEnterprise = form.plan === "enterprise";

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isEnterprise && form.password !== form.confirmPassword) {
      setError("Las dos contraseñas no coinciden.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      if (isEnterprise) {
        const submitCompanyRequest = httpsCallable(functions, "submitCompanyRequest");
        await submitCompanyRequest(form);
        setStatus("contact-success");
        return;
      }

      const registerCompanyTrial = httpsCallable(functions, "registerCompanyTrial");
      const result = await registerCompanyTrial({
        ...form,
        privacyAccepted,
      });
      if (!result.data?.companyId) {
        throw new Error("No se pudo completar el registro.");
      }
      setStatus("signing-in");
      try {
        await onRegistered({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        });
      } catch (loginError) {
        console.error("Company created but automatic login failed:", loginError);
        setError("La empresa está creada. Inicia sesión con el correo y la contraseña que acabas de elegir.");
        setStatus("created");
      }
    } catch (requestError) {
      console.error("Error creating company trial:", requestError);
      const message = String(requestError?.message || "");
      const accountAlreadyExists =
        message.includes("already exists") || message.includes("Ya existe");
      if (!isEnterprise && accountAlreadyExists) {
        try {
          await onRegistered({
            email: form.email.trim().toLowerCase(),
            password: form.password,
          });
          return;
        } catch (loginError) {
          console.error("Existing account login failed:", loginError);
        }
      }
      setError(
        accountAlreadyExists
          ? "Ya existe una cuenta con este correo. Inicia sesión o utiliza otro correo."
          : message || "No se pudo crear la empresa. Inténtalo de nuevo en unos minutos.",
      );
      setStatus("error");
    }
  };

  return (
    <div
      className="lg3d-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="lg3d-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-modal-title"
      >
        <button className="lg3d-modal-close" type="button" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        {status === "contact-success" || status === "created" ? (
          <div className="lg3d-modal-success">
            <span aria-hidden="true">✓</span>
            <h2 id="trial-modal-title">
              {status === "contact-success" ? "Solicitud recibida" : "Tu empresa ya está creada"}
            </h2>
            <p>
              {status === "contact-success"
                ? "Hemos recibido tus datos y te contactaremos para preparar el plan Enterprise."
                : error}
            </p>
            {status === "created" ? (
              <Link className="lg3d-primary" to="/login">Ir a iniciar sesión</Link>
            ) : (
              <button type="button" className="lg3d-primary" onClick={onClose}>Cerrar</button>
            )}
          </div>
        ) : (
          <>
            <p className="lg3d-kicker">
              {isEnterprise ? "PLAN A MEDIDA" : "30 DÍAS · SIN TARJETA"}
            </p>
            <h2 id="trial-modal-title">
              {isEnterprise ? "Hablemos de tu empresa" : "Crea tu empresa en LimpiaGest"}
            </h2>
            <p className="lg3d-modal-intro">
              {isEnterprise
                ? "Cuéntanos lo esencial y prepararemos una propuesta adaptada."
                : "El acceso se crea ahora y entrarás directamente al panel para empezar."}
            </p>
            <form className="lg3d-form" onSubmit={handleSubmit}>
              <div className="lg3d-honeypot" aria-hidden="true">
                <label htmlFor="trial-website">Sitio web</label>
                <input id="trial-website" name="website" value={form.website} onChange={handleChange} autoComplete="off" tabIndex="-1" />
              </div>
              <label>
                <span>Empresa *</span>
                <input name="companyName" value={form.companyName} onChange={handleChange} required autoComplete="organization" />
              </label>
              <label>
                <span>Nombre *</span>
                <input name="contactName" value={form.contactName} onChange={handleChange} required autoComplete="name" />
              </label>
              <label>
                <span>Email *</span>
                <input type="email" name="email" value={form.email} onChange={handleChange} required autoComplete="email" />
              </label>
              <label>
                <span>Teléfono{isEnterprise ? " *" : ""}</span>
                <input type="tel" name="phone" value={form.phone} onChange={handleChange} required={isEnterprise} autoComplete="tel" />
              </label>
              <label>
                <span>Número de operarios</span>
                <input type="number" min="1" name="operariosCount" value={form.operariosCount} onChange={handleChange} placeholder="10" />
              </label>
              <label>
                <span>{isEnterprise ? "Plan" : "Plan inicial"}</span>
                <select name="plan" value={form.plan} onChange={handleChange}>
                  {PRICING_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
              </label>
              {!isEnterprise && (
                <>
                  <label>
                    <span>Contraseña *</span>
                    <input type="password" name="password" value={form.password} onChange={handleChange} required minLength="10" maxLength="128" autoComplete="new-password" />
                    <small>Al menos 10 caracteres.</small>
                  </label>
                  <label>
                    <span>Repite la contraseña *</span>
                    <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} required minLength="10" maxLength="128" autoComplete="new-password" />
                  </label>
                </>
              )}
              <label className="lg3d-form-wide">
                <span>¿Qué necesitas controlar mejor? (opcional)</span>
                <textarea name="message" value={form.message} onChange={handleChange} rows="3" />
              </label>
              <label className="lg3d-consent lg3d-form-wide">
                <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} required />
                <span>
                  He leído y acepto la <Link to="/politica-de-privacidad" target="_blank">Política de Privacidad</Link>.*
                </span>
              </label>
              {error && <p className="lg3d-form-error lg3d-form-wide">{error}</p>}
              <button className="lg3d-primary lg3d-form-wide" type="submit" disabled={status === "loading" || status === "signing-in"}>
                {status === "loading" || status === "signing-in"
                  ? (status === "signing-in" ? "Entrando al panel…" : "Creando empresa…")
                  : (isEnterprise ? "Solicitar contacto" : "Crear empresa y empezar")}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const rootRef = useRef(null);
  const trailRefs = useRef([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlan, setModalPlan] = useState("");
  const activeScene = SCENES[sceneIndex];

  const openTrial = useCallback((plan = "") => {
    setModalPlan(plan);
    setModalOpen(true);
  }, []);

  const closeTrial = useCallback(() => setModalOpen(false), []);

  const completeTrialRegistration = useCallback(
    async ({ email, password }) => {
      await login(email, password);
      navigate("/admin", { replace: true });
    },
    [login, navigate],
  );

  useEffect(() => {
    const surface = rootRef.current;
    const lights = trailRefs.current.filter(Boolean);
    if (!surface || lights.length === 0) return undefined;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return undefined;

    const target = { x: 0, y: 0 };
    const points = lights.map(() => ({ x: 0, y: 0 }));
    const opacity = [1, 0.82, 0.62, 0.42];
    let frame = 0;
    let active = false;
    let lastMove = 0;

    const draw = () => {
      let movement = 0;
      points.forEach((point, index) => {
        const source = index === 0 ? target : points[index - 1];
        const easing = index === 0 ? 0.26 : Math.max(0.08, 0.15 - index * 0.018);
        const dx = source.x - point.x;
        const dy = source.y - point.y;
        point.x += dx * easing;
        point.y += dy * easing;
        movement = Math.max(movement, Math.abs(dx), Math.abs(dy));
        lights[index].style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate3d(-50%, -50%, 0)`;
      });
      if (active && (movement > 0.18 || performance.now() - lastMove < 120)) {
        frame = window.requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    const move = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const bounds = surface.getBoundingClientRect();
      target.x = event.clientX - bounds.left;
      target.y = event.clientY - bounds.top;
      const jump = Math.hypot(target.x - points[0].x, target.y - points[0].y);
      if (!active || jump > Math.max(window.innerWidth, window.innerHeight) * 1.25) {
        points.forEach((point) => {
          point.x = target.x;
          point.y = target.y;
        });
      }
      active = true;
      lastMove = performance.now();
      lights.forEach((light, index) => {
        light.style.opacity = String(opacity[index]);
      });
      if (!frame) frame = window.requestAnimationFrame(draw);
    };

    const leave = () => {
      active = false;
      lights.forEach((light) => {
        light.style.opacity = "0";
      });
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    surface.addEventListener("pointerenter", move);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerleave", leave);
    return () => {
      surface.removeEventListener("pointerenter", move);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", leave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="lg3d-root" ref={rootRef} data-scene={sceneIndex}>
      <div className="lg3d-pointer-trail" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} ref={(node) => { trailRefs.current[index] = node; }} />
        ))}
      </div>

      <header className="lg3d-header">
        <a className="lg3d-brand" href="#inicio" aria-label="LimpiaGest, inicio">
          <span className="lg3d-brand-mark" aria-hidden="true">L</span>
          <span>LimpiaGest</span>
        </a>
        <nav className="lg3d-nav" aria-label="Navegación principal">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#precios">Precios</a>
        </nav>
        <div className="lg3d-header-actions">
          <Link to="/login" className="lg3d-login">Acceso clientes</Link>
          <button type="button" className="lg3d-primary" onClick={() => openTrial()}>Probar gratis</button>
        </div>
      </header>

      <main>
        <section className="lg3d-hero" id="inicio">
          <div className="lg3d-hero-copy">
            <p className="lg3d-kicker">SOFTWARE PARA PEQUEÑAS EMPRESAS DE LIMPIEZA</p>
            <h1>{activeScene.title}</h1>
            <p className="lg3d-hero-subtitle">{activeScene.subtitle}</p>
            <div className="lg3d-hero-actions">
              <button type="button" className="lg3d-primary lg3d-primary-large" onClick={() => openTrial()}>Probar LimpiaGest gratis</button>
              <a className="lg3d-secondary" href="#como-funciona">Ver cómo funciona</a>
            </div>
            <p className="lg3d-proof"><span aria-hidden="true">✓</span> 30 días <b>·</b> Sin tarjeta <b>·</b> Acceso completo</p>
          </div>

          <div className="lg3d-stage" aria-live="polite">
            <div className="lg3d-stage-glow" aria-hidden="true" />
            <div className="lg3d-orbit lg3d-orbit-one" aria-hidden="true" />
            <div className="lg3d-orbit lg3d-orbit-two" aria-hidden="true" />
            <div className="lg3d-laptop">
              <div className="lg3d-laptop-screen">
                <img src={activeScene.image} alt={activeScene.imageAlt} />
              </div>
              <div className="lg3d-laptop-base" aria-hidden="true" />
            </div>
            <div className="lg3d-phone">
              <div className="lg3d-phone-speaker" aria-hidden="true" />
              <img src="/images/landing-3d/mobile-anonymized.png" alt="Aplicación móvil de LimpiaGest para operarios" />
            </div>
            <div className="lg3d-float lg3d-float-left">
              <span className="lg3d-float-icon" aria-hidden="true">✓</span>
              <span><strong>{activeScene.signal}</strong><small>{activeScene.signalDetail}</small></span>
            </div>
            <div className="lg3d-float lg3d-float-right">
              <span className="lg3d-float-icon" aria-hidden="true">30</span>
              <span><strong>Días completos</strong><small>Sin tarjeta</small></span>
            </div>
          </div>

          <div className="lg3d-scene-selector" aria-label="Vistas de LimpiaGest">
            {SCENES.map((scene, index) => (
              <button
                key={scene.label}
                type="button"
                className={index === sceneIndex ? "is-active" : ""}
                aria-pressed={index === sceneIndex}
                onClick={() => setSceneIndex(index)}
                onMouseEnter={() => setSceneIndex(index)}
                onFocus={() => setSceneIndex(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span> {scene.label}
              </button>
            ))}
          </div>
        </section>

        <section className="lg3d-section lg3d-problems" aria-labelledby="problems-title">
          <div className="lg3d-heading">
            <p className="lg3d-kicker">EL PROBLEMA NO ES LIMPIAR. ES COORDINARLO TODO.</p>
            <h2 id="problems-title">Cuando falta una visión general, los pequeños errores se convierten en grandes problemas.</h2>
          </div>
          <div className="lg3d-problem-grid">
            <article><span>01</span><h3>Servicios olvidados</h3><p>La planificación dispersa deja huecos, duplicidades y cambios que no llegan al equipo.</p></article>
            <article><span>02</span><h3>Horas que no cuadran</h3><p>Fichajes, desplazamientos y jornadas difíciles de revisar cuando la información llega tarde.</p></article>
            <article><span>03</span><h3>Reclamaciones sin contexto</h3><p>Sin un historial común cuesta saber qué ocurrió, quién acudió y cómo responder al cliente.</p></article>
          </div>
        </section>

        <section className="lg3d-section lg3d-product" id="funcionalidades" aria-labelledby="product-title">
          <div className="lg3d-heading lg3d-centered">
            <p className="lg3d-kicker">UN SOLO CENTRO DE OPERACIONES</p>
            <h2 id="product-title">De la planificación a la factura, sin cambiar de herramienta.</h2>
            <p>El propietario ve el negocio completo. Los operarios reciben una experiencia móvil directa y ligera.</p>
          </div>
          <div className="lg3d-feature-grid">
            <article className="lg3d-feature lg3d-feature-large"><span className="lg3d-feature-icon">CAL</span><h3>Planificación visual</h3><p>Organiza servicios, clientes y operarios por día, semana o mes. Detecta huecos antes de que se conviertan en olvidos.</p><ul><li>Vista mensual y semanal</li><li>Reasignación de servicios</li><li>Clientes y comunidades conectados</li></ul></article>
            <article className="lg3d-feature"><span className="lg3d-feature-icon">GPS</span><h3>Control horario</h3><p>Consulta inicios, finales y duración de cada jornada desde un registro centralizado.</p></article>
            <article className="lg3d-feature"><span className="lg3d-feature-icon">APP</span><h3>App para operarios</h3><p>Jornada, servicios, materiales, ausencias e historial desde el móvil, sin menús innecesarios.</p></article>
            <article className="lg3d-feature"><span className="lg3d-feature-icon">DOC</span><h3>Servicios y evidencias</h3><p>Conserva el estado y el historial del trabajo para responder con información, no con suposiciones.</p></article>
            <article className="lg3d-feature lg3d-feature-large"><span className="lg3d-feature-icon">EUR</span><h3>Facturación integrada</h3><p>Convierte el trabajo realizado en borradores, revisa importes y emite desde el mismo centro de operaciones.</p><ul><li>Borradores centralizados</li><li>PDF y envío al cliente</li><li>Seguimiento de facturas</li></ul></article>
          </div>
        </section>

        <section className="lg3d-section lg3d-onboarding-section" id="como-funciona" aria-labelledby="onboarding-title">
          <div className="lg3d-heading">
            <p className="lg3d-kicker">EMPIEZA SIN ENFRENTARTE A UN PANEL VACÍO</p>
            <h2 id="onboarding-title">La configuración guiada convierte el primer acceso en cinco pasos claros.</h2>
            <p>Puede omitirse y retomarse cuando quieras. Cada paso deja la empresa más cerca de crear su primer servicio real.</p>
          </div>
          <ol className="lg3d-onboarding">
            {ONBOARDING_STEPS.map(([title, description], index) => (
              <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{title}</strong><small>{description}</small></div></li>
            ))}
          </ol>
        </section>

        <section className="lg3d-section lg3d-trial" aria-labelledby="trial-title">
          <div className="lg3d-trial-intro">
            <p className="lg3d-kicker">PRUEBA COMPLETA, SIN TARJETA</p>
            <h2 id="trial-title">30 días para comprobar si LimpiaGest pone orden de verdad.</h2>
            <p>Accede a toda la plataforma. Verás en el panel cuántos días quedan y podrás contratar en cualquier momento.</p>
            <button type="button" className="lg3d-primary lg3d-primary-large" onClick={() => openTrial()}>Crear mi empresa gratis</button>
          </div>
          <div className="lg3d-timeline" aria-label="Qué ocurre durante y después de la prueba">
            <div><span>DÍA 1</span><strong>Acceso completo</strong><small>Configura y usa toda la plataforma.</small></div>
            <div><span>DURANTE LA PRUEBA</span><strong>Contador visible</strong><small>Comprueba los días restantes y contrata cuando quieras.</small></div>
            <div><span>DÍA 30</span><strong>Elige un plan</strong><small>El uso se bloquea, pero el propietario conserva el acceso a contratación.</small></div>
            <div><span>7 DÍAS DESPUÉS</span><strong>Borrado definitivo</strong><small>Si no contratas, se eliminan la empresa, usuarios, archivos y datos.</small></div>
          </div>
        </section>

        <section className="lg3d-section lg3d-pricing" id="precios" aria-labelledby="pricing-title">
          <div className="lg3d-heading lg3d-centered">
            <p className="lg3d-kicker">PLANES TRANSPARENTES</p>
            <h2 id="pricing-title">Empieza con el tamaño de tu equipo y cambia cuando crezcas.</h2>
            <p>Todos los planes comienzan con 30 días gratis y sin tarjeta.</p>
          </div>
          <div className="lg3d-pricing-grid">
            {PRICING_PLANS.map((plan) => (
              <article key={plan.id} className={`lg3d-price ${plan.recommended ? "is-recommended" : ""}`}>
                {plan.recommended && <span className="lg3d-price-tag">RECOMENDADO</span>}
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <div className="lg3d-price-value"><strong>{plan.price}</strong>{plan.price !== "A medida" && <span>/mes</span>}</div>
                <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <button type="button" onClick={() => openTrial(plan.id)}>{plan.id === "enterprise" ? "Contactar" : "Probar gratis"}</button>
              </article>
            ))}
          </div>
        </section>

        <section className="lg3d-section lg3d-faq" aria-labelledby="faq-title">
          <div className="lg3d-heading"><p className="lg3d-kicker">PREGUNTAS FRECUENTES</p><h2 id="faq-title">Lo importante antes de empezar.</h2></div>
          <div className="lg3d-faq-list">
            <details open><summary>¿Necesito introducir una tarjeta?</summary><p>No. Puedes utilizar toda la plataforma durante 30 días sin añadir un método de pago.</p></details>
            <details><summary>¿La prueba limita alguna función?</summary><p>No. El objetivo es que puedas probar el recorrido completo, incluida la facturación.</p></details>
            <details><summary>¿Qué ocurre al terminar los 30 días?</summary><p>El uso queda bloqueado, pero el propietario puede entrar en la contratación durante 7 días. Si no elige un plan, la empresa y sus datos se eliminan definitivamente.</p></details>
            <details><summary>¿Los operarios tienen que instalar una app?</summary><p>Acceden desde el móvil a una experiencia clara y ligera preparada para su trabajo diario.</p></details>
            <details><summary>¿Puedo cambiar de plan?</summary><p>Sí. El plan puede adaptarse cuando aumente o disminuya el tamaño de tu equipo.</p></details>
          </div>
        </section>

        <section className="lg3d-section lg3d-final" aria-labelledby="final-title">
          <p className="lg3d-kicker">EL PRIMER SERVICIO EMPIEZA AQUÍ</p>
          <h2 id="final-title">Pon tu empresa bajo control en 30 días.</h2>
          <p>Crea tu empresa, completa la configuración guiada y empieza sin tarjeta ni esperas.</p>
          <button type="button" className="lg3d-primary lg3d-primary-large" onClick={() => openTrial()}>Probar LimpiaGest gratis</button>
        </section>
      </main>

      <footer className="lg3d-footer">
        <span>© {new Date().getFullYear()} LimpiaGest</span>
        <nav aria-label="Enlaces legales">
          <Link to="/aviso-legal">Aviso legal</Link>
          <Link to="/politica-de-privacidad">Privacidad</Link>
          <Link to="/politica-de-cookies">Cookies</Link>
          <a href="mailto:limpiezasrayba@gmail.com">Contacto</a>
        </nav>
      </footer>

      <TrialRequestModal
        isOpen={modalOpen}
        onClose={closeTrial}
        defaultPlan={modalPlan}
        onRegistered={completeTrialRegistration}
      />
    </div>
  );
}
