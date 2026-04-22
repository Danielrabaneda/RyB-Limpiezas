import { useState, useEffect } from 'react';
import { getOperarios } from '../services/authService';

export default function CompanionModal({ isOpen, onClose, onConfirm, loading: actionLoading, excludeUserIds }) {
  const [operarios, setOperarios] = useState([]);
  const [selectedOp, setSelectedOp] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadOperarios();
      setSelectedOp('');
    }
  }, [isOpen]);

  async function loadOperarios() {
    try {
      let ops = await getOperarios();
      if (excludeUserIds && excludeUserIds.length > 0) {
        ops = ops.filter(op => !excludeUserIds.includes(op.uid));
      }
      setOperarios(ops);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Añadir Acompañante</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted mb-4">
            Selecciona al operario que te va a acompañar a realizar este servicio.
            El compañero seleccionado podrá ver este servicio en su agenda para llevar el control, pero no podrá modificar su estado.
          </p>
          
          <div className="form-group">
            <label className="form-label">Compañero</label>
            {loading ? (
              <div className="spinner"></div>
            ) : operarios.length === 0 ? (
              <p className="text-sm text-muted">No hay compañeros disponibles.</p>
            ) : (
              <select 
                className="form-select" 
                value={selectedOp} 
                onChange={e => setSelectedOp(e.target.value)}
                autoFocus
              >
                <option value="">Seleccionar operario...</option>
                {operarios.map(op => (
                  <option key={op.uid} value={op.uid}>{op.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button 
            className="btn btn-primary" 
            onClick={() => onConfirm(selectedOp)}
            disabled={!selectedOp || actionLoading}
          >
            {actionLoading ? 'Añadiendo...' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  );
}
