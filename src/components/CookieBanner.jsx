import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getConsent, setConsent, acceptAll, rejectAll, initializeConsent } from '../utils/cookieConsent';

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [preferences, setPreferences] = useState({
    analytical: false,
    marketing: false
  });
  
  const location = useLocation();
  const isAdminOrOperario = location.pathname.startsWith('/admin') || location.pathname.startsWith('/operario');

  // Inicializar al montar
  useEffect(() => {
    initializeConsent();
    const current = getConsent();
    if (!current._initialized) {
      setIsVisible(true);
    } else {
      setPreferences({
        analytical: current.analytical,
        marketing: current.marketing
      });
    }

    // Escuchar cambios globales (por ejemplo, si se cambia el consentimiento desde otro sitio)
    const handleConsentChange = (e) => {
      const updated = e.detail;
      setPreferences({
        analytical: updated.analytical,
        marketing: updated.marketing
      });
    };

    // Escuchar evento personalizado para abrir la configuración de cookies
    const handleOpenSettings = () => {
      setIsVisible(true);
      setShowConfig(true);
    };

    window.addEventListener('ryb-cookie-consent-changed', handleConsentChange);
    window.addEventListener('ryb-open-cookie-settings', handleOpenSettings);
    
    return () => {
      window.removeEventListener('ryb-cookie-consent-changed', handleConsentChange);
      window.removeEventListener('ryb-open-cookie-settings', handleOpenSettings);
    };
  }, []);

  const handleAcceptAll = () => {
    acceptAll();
    setIsVisible(false);
    setShowConfig(false);
  };

  const handleRejectAll = () => {
    rejectAll();
    setIsVisible(false);
    setShowConfig(false);
  };

  const handleSaveConfig = () => {
    setConsent({
      analytical: preferences.analytical,
      marketing: preferences.marketing
    });
    setIsVisible(false);
    setShowConfig(false);
  };

  const togglePreference = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Si el banner no es visible, mostramos el disparador flotante de revocación permanente (solo en la parte pública)
  if (!isVisible) {
    if (isAdminOrOperario) return null; // No mostrar botón flotante dentro de los paneles privados

    return (
      <button
        onClick={() => {
          setIsVisible(true);
          setShowConfig(true);
        }}
        className="cookie-revocation-trigger"
        title="Configuración de Privacidad y Cookies"
        aria-label="Abrir configuración de cookies"
      >
        🍪
      </button>
    );
  }

  return (
    <div className="cookie-banner-wrapper" role="dialog" aria-labelledby="cookie-title" aria-describedby="cookie-desc">
      <div className="cookie-banner-title" id="cookie-title">
        <span>🍪</span> Configuración de Privacidad y Cookies
      </div>
      
      <div className="cookie-banner-text" id="cookie-desc">
        Utilizamos cookies propias y de terceros para garantizar el correcto funcionamiento del portal, 
        analizar el uso de nuestros servicios y mostrarte publicidad relacionada con tus preferencias. 
        Puedes aceptarlas todas, rechazarlas o configurar tus preferencias. Más información en nuestra{' '}
        <Link to="/politica-de-cookies" onClick={() => { setIsVisible(false); }}>Política de Cookies</Link> y{' '}
        <Link to="/politica-de-privacidad" onClick={() => { setIsVisible(false); }}>Política de Privacidad</Link>.
      </div>

      <div className="cookie-buttons-container">
        <button onClick={handleAcceptAll} className="cookie-btn" style={{ fontWeight: '700' }}>
          Aceptar
        </button>
        <button onClick={handleRejectAll} className="cookie-btn">
          Rechazar
        </button>
        <button onClick={() => setShowConfig(!showConfig)} className="cookie-btn">
          {showConfig ? 'Ocultar panel' : 'Configurar'}
        </button>
      </div>

      {showConfig && (
        <div className="cookie-config-panel">
          {/* Técnicas (Obligatorias) */}
          <div className="cookie-config-option">
            <div className="cookie-config-info">
              <span className="cookie-config-label">Cookies Técnicas (Necesarias)</span>
              <span className="cookie-config-desc">
                Imprescindibles para que la web funcione (inicio de sesión, seguridad, etc.). No se pueden desactivar.
              </span>
            </div>
            <label className="cookie-switch">
              <input type="checkbox" checked disabled />
              <span className="cookie-slider" />
            </label>
          </div>

          {/* Analíticas (GDPR desmarcadas por defecto) */}
          <div className="cookie-config-option">
            <div className="cookie-config-info">
              <span className="cookie-config-label">Cookies Analíticas</span>
              <span className="cookie-config-desc">
                Nos permiten medir el número de visitas y conocer cómo navegas para mejorar el servicio.
              </span>
            </div>
            <label className="cookie-switch">
              <input
                type="checkbox"
                checked={preferences.analytical}
                onChange={() => togglePreference('analytical')}
              />
              <span className="cookie-slider" />
            </label>
          </div>

          {/* Publicitarias (GDPR desmarcadas por defecto) */}
          <div className="cookie-config-option">
            <div className="cookie-config-info">
              <span className="cookie-config-label">Cookies Publicitarias / Marketing</span>
              <span className="cookie-config-desc">
                Se utilizan para mostrarte anuncios relevantes basados en tus intereses y perfil de navegación.
              </span>
            </div>
            <label className="cookie-switch">
              <input
                type="checkbox"
                checked={preferences.marketing}
                onChange={() => togglePreference('marketing')}
              />
              <span className="cookie-slider" />
            </label>
          </div>

          <div className="cookie-config-actions">
            <button
              onClick={handleSaveConfig}
              className="cookie-btn"
              style={{ background: 'var(--color-primary)', borderColor: 'var(--color-primary-light)', paddingLeft: '24px', paddingRight: '24px' }}
            >
              Guardar Configuración
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
