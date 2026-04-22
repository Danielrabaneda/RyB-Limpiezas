import { useState, useEffect } from 'react';
import { format, startOfDay } from 'date-fns';

export default function RescheduleModal({ isOpen, onClose, onConfirm, title, loading: actionLoading, currentDate }) {
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    if (isOpen && currentDate) {
      // Formatear a YYYY-MM-DD para el input type="date"
      const d = currentDate.toDate ? currentDate.toDate() : new Date(currentDate);
      setSelectedDate(format(d, 'yyyy-MM-dd'));
    }
  }, [isOpen, currentDate]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{title || 'Cambiar de fecha'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted mb-4">
            Selecciona el nuevo día para este servicio. 
            Si eres operario, el administrador deberá validar este cambio.
          </p>
          
          <div className="form-group">
            <label className="form-label">Nueva fecha</label>
            <input 
              type="date"
              className="form-select" // Reutilizamos clase para que se vea similar
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0' }}
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              if (selectedDate) {
                // Parse the YYYY-MM-DD back to a local date at midnight
                const [y, m, d] = selectedDate.split('-');
                const dObj = new Date(y, m - 1, d);
                onConfirm(startOfDay(dObj));
              }
            }}
            disabled={!selectedDate || actionLoading}
          >
            {actionLoading ? 'Guardando...' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
}
