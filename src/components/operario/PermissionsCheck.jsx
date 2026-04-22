import { useState, useEffect } from 'react';
import { requestNotificationPermission } from '../../utils/geolocation';

export default function PermissionsCheck() {
  const [showModal, setShowModal] = useState(false);
  const [status, setStatus] = useState('pending'); // 'pending', 'loading', 'granted', 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Check session storage so we only show the popup if we haven't asked during this session
    const permissionsChecked = sessionStorage.getItem('permissions_checked');
    if (!permissionsChecked) {
      setShowModal(true);
    }
  }, []);

  const requestPermissions = async () => {
    setStatus('loading');
    setErrorMessage('');
    try {
      // Pedir notificaciones
      await requestNotificationPermission();
      
      // Pedir ubicación con un getCurrentPosition
      await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("La geolocalización no está soportada."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      });
      
      setStatus('granted');
      sessionStorage.setItem('permissions_checked', 'true');
      setTimeout(() => setShowModal(false), 1000);
    } catch (err) {
      console.error("Error al obtener permisos:", err);
      setStatus('error');
      
      let msg = "No se pudo obtener la ubicación o las notificaciones.";
      if (err.code === 1) {
        msg = "Has denegado el permiso de ubicación. Por favor, ve a los ajustes de tu navegador o dispositivo y permítelo para esta página.";
      } else if (err.code === 3) {
        msg = "Tiempo de espera agotado al buscar ubicación. Asegúrate de tener el GPS activado.";
      } else if (err.message) {
        msg = err.message;
      }
      
      setErrorMessage(msg);
    }
  };

  const handleClose = () => {
    sessionStorage.setItem('permissions_checked', 'true');
    setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl text-center">
        <div className="text-5xl mb-4">📍 🔔</div>
        <h2 className="text-xl font-bold mb-3">Permisos Necesarios</h2>
        <p className="text-muted text-sm mb-6">
          Para registrar tu llegada, ver tu ruta y recibir alertas, necesitamos acceso a tu <b>ubicación</b> y <b>notificaciones</b>.
        </p>
        
        {errorMessage && (
          <div className="bg-red-50 text-red-700 text-xs p-3 rounded mb-4 text-left border border-red-200">
            <strong>Atención:</strong> {errorMessage}
          </div>
        )}
        
        <button 
          className="btn btn-primary w-full py-3 text-base font-bold mb-3"
          onClick={requestPermissions}
          disabled={status === 'loading' || status === 'granted'}
        >
          {status === 'loading' ? '⏳ Obteniendo permisos...' : 
           status === 'granted' ? '✅ Permisos concedidos' : 
           status === 'error' ? '🔄 Reintentar' : 'Conceder Permisos'}
        </button>
        
        {status === 'error' && (
          <button 
            className="btn btn-ghost w-full py-2 text-sm text-muted"
            onClick={handleClose}
          >
            Continuar sin ubicación
          </button>
        )}
      </div>
    </div>
  );
}
