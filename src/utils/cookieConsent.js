/**
 * ryb-app Cookie Consent Manager (GDPR, LOPDGDD & LSSI Compliant)
 */

const STORAGE_KEY = 'ryb_cookie_consent';

const DEFAULT_CONSENT = {
  technical: true,      // Siempre requeridas
  analytical: false,    // Desmarcadas por defecto
  marketing: false,     // Desmarcadas por defecto
  _initialized: false   // Indica si el usuario ya tomó una decisión
};

/**
 * Obtiene el estado actual del consentimiento desde localStorage
 */
export function getConsent() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Aseguramos que technical siempre sea true
      return { ...DEFAULT_CONSENT, ...parsed, technical: true };
    }
  } catch (e) {
    console.error('Error al leer el consentimiento de cookies:', e);
  }
  return { ...DEFAULT_CONSENT };
}

/**
 * Guarda las preferencias del consentimiento y carga/desactiva los scripts correspondientes
 */
export function setConsent(consent) {
  const newConsent = {
    technical: true,
    analytical: !!consent.analytical,
    marketing: !!consent.marketing,
    _initialized: true
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newConsent));
  
  // Ejecutar carga dinámica de scripts basada en el nuevo estado
  applyScripts(newConsent);
  
  // Despachar evento global para que componentes de React puedan enterarse del cambio
  const event = new CustomEvent('ryb-cookie-consent-changed', { detail: newConsent });
  window.dispatchEvent(event);
  
  return newConsent;
}

/**
 * Acepta todas las cookies
 */
export function acceptAll() {
  return setConsent({ analytical: true, marketing: true });
}

/**
 * Rechaza todas las cookies no obligatorias
 */
export function rejectAll() {
  return setConsent({ analytical: false, marketing: false });
}

/**
 * Aplica o bloquea la inyección de scripts según el estado de consentimiento
 */
export function applyScripts(consent) {
  if (typeof window === 'undefined') return;

  // --- COOKIES ANALÍTICAS (Ej. Google Analytics) ---
  if (consent.analytical) {
    injectGoogleAnalytics('G-XXXXXXXXXX'); // Reemplazar con ID real si aplica
  } else {
    // Si se rechazan posteriormente, se puede desactivar mediante variables globales de Google Analytics
    window['ga-disable-G-XXXXXXXXXX'] = true;
  }

  // --- COOKIES DE MARKETING (Ej. Meta Pixel) ---
  if (consent.marketing) {
    injectMetaPixel('1234567890'); // Reemplazar con ID real si aplica
  }
}

/**
 * Inicializa el gestor de consentimiento al arrancar la aplicación
 */
export function initializeConsent() {
  const consent = getConsent();
  if (consent._initialized) {
    applyScripts(consent);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   INYECTORES DINÁMICOS DE SCRIPTS (BLOQUEADOS HASTA CONSENTIMIENTO)
   ───────────────────────────────────────────────────────────────────────────── */

function injectGoogleAnalytics(gtagId) {
  if (window.gtagInitialized) return;
  
  // Eliminar deshabilitación si existía
  delete window[`ga-disable-${gtagId}`];

  // Inyectar script gtag.js
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gtagId}`;
  document.head.appendChild(script);

  // Inicializar gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', gtagId, {
    anonymize_ip: true, // Buenas prácticas de minimización bajo GDPR
    cookie_flags: 'SameSite=None;Secure'
  });

  window.gtagInitialized = true;
  console.log('GDPR: Google Analytics inyectado tras consentimiento.');
}

function injectMetaPixel(pixelId) {
  if (window.fbqInitialized) return;

  // Inicializar pixel helper
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window,document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', pixelId);
  fbq('track', 'PageView');

  window.fbqInitialized = true;
  console.log('GDPR: Meta Pixel inyectado tras consentimiento.');
}
