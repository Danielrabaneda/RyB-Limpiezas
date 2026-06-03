import { useState, useEffect } from 'react';
import { getProducts, createMaterialRequest } from '../../services/materialService';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MaterialRequestPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    quantity: 1,
    notes: ''
  });

  useEffect(() => {
    loadProducts();
  }, []);

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
        communityId: null, // "General / Equipo" ya que se hace desde el menú general
        productId: formData.productId,
        productName: selectedProduct.name,
        unit: selectedProduct.unit,
        quantity: formData.quantity,
        notes: formData.notes
      });
      
      alert('Pedido enviado correctamente');
      setFormData({ productId: '', quantity: 1, notes: '' });
      navigate('/operario');
    } catch (err) {
      console.error(err);
      alert('Error al enviar pedido');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container animate-fadeIn pb-24">
      <div className="header-section">
        <h1 className="page-title text-2xl font-bold">Solicitar Material</h1>
        <p className="page-subtitle text-sm opacity-80">Elige los productos que necesitas para trabajar</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-4 flex flex-col gap-4">
        {loading ? (
          <div className="text-center p-4">Cargando catálogo...</div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label font-bold">Producto</label>
              <select 
                className="form-select w-full p-3 border rounded-lg bg-slate-50" 
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
              <label className="form-label font-bold">Cantidad</label>
              <input 
                type="number" 
                className="form-input w-full p-3 border rounded-lg bg-slate-50" 
                min="0.5" 
                step="0.5"
                required
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
              />
            </div>

            <div className="form-group">
              <label className="form-label font-bold">Notas (opcional)</label>
              <textarea 
                className="form-input w-full p-3 border rounded-lg bg-slate-50" 
                placeholder="Añade detalles si es necesario..."
                rows="3"
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              ></textarea>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-full py-4 text-lg mt-4 font-bold rounded-xl" 
              disabled={sending || loading || !formData.productId}
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), #1e40af)',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              {sending ? 'Enviando...' : 'Enviar Pedido'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
