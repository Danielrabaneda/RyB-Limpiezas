import { useState, useEffect } from 'react';
import { getProducts, createMaterialRequest } from '../../services/materialService';
import { useAuth } from '../../contexts/AuthContext';

export default function MaterialRequestModal({ isOpen, onClose, communityId, communityName }) {
  const { userProfile } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.productId || !userProfile?.uid) return;

    setSending(true);
    try {
      const selectedProduct = products.find(p => p.id === formData.productId);
      
      await createMaterialRequest({
        userId: userProfile.uid,
        communityId: communityId,
        productId: formData.productId,
        productName: selectedProduct.name,
        unit: selectedProduct.unit,
        quantity: formData.quantity,
        notes: formData.notes
      });
      
      alert('Pedido enviado correctamente');
      onClose();
    } catch (err) {
      alert('Error al enviar pedido');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">📦 Pedir Material</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-xs text-muted mb-4">
              Solicitud para: <strong>{communityName}</strong>
            </p>

            <div className="form-group">
              <label className="form-label">Producto</label>
              <select 
                className="form-select" 
                required
                value={formData.productId}
                onChange={e => setFormData({...formData, productId: e.target.value})}
              >
                <option value="">— Elegir producto —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Cantidad</label>
              <input 
                type="number" 
                className="form-input" 
                min="0.5" 
                step="0.5"
                required
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notas (opcional)</label>
              <textarea 
                className="form-input" 
                placeholder="Ej: Solo si hay repartidor cerca..."
                rows="2"
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={sending || loading}>
              {sending ? 'Enviando...' : 'Enviar Pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
