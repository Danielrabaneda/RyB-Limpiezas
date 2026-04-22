import { useState, useEffect } from 'react';
import { 
  getProducts, 
  getMaterialRequests, 
  updateRequestStatus, 
  deleteMaterialRequest,
  createProduct,
  deleteProduct
} from '../../services/materialService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers } from '../../services/authService';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' or 'catalog'
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', unit: 'unidad' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, oData, uData] = await Promise.all([
        getProducts(),
        getMaterialRequests(),
        getAllUsers()
      ]);
      
      setProducts(pData);
      setOrders(oData);
      
      // Map users for easy lookup
      const userMap = {};
      uData.forEach(u => userMap[u.uid] = u);
      setUsers(userMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, status) => {
    try {
      await updateRequestStatus(orderId, status);
      loadData();
    } catch (err) {
      alert('Error al actualizar estado');
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!confirm('¿Borrar este pedido?')) return;
    try {
      await deleteMaterialRequest(id);
      loadData();
    } catch (err) {
      alert('Error al borrar');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      await createProduct(newProduct);
      setNewProduct({ name: '', unit: 'unidad' });
      setShowAddProduct(false);
      loadData();
    } catch (err) {
      alert('Error al añadir producto');
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('¿Borrar producto del catálogo?')) return;
    try {
      await deleteProduct(id);
      loadData();
    } catch (err) {
      alert('Error al borrar producto');
    }
  };

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Gestión de Material</h1>
        <p className="page-subtitle">Control de stock y pedidos de operarios</p>
      </div>

      <div className="tabs-container mb-6" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
        <button 
          className={`btn btn-sm ${activeTab === 'orders' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('orders')}
        >
          📋 Pedidos Recientes
        </button>
        <button 
          className={`btn btn-sm ${activeTab === 'catalog' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('catalog')}
        >
          📦 Catálogo de Productos
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando inventario...</div>
      ) : activeTab === 'orders' ? (
        <div className="orders-list">
          {orders.length === 0 ? (
            <div className="empty-state">No hay pedidos registrados</div>
          ) : (
            <div className="grid gap-4">
              {orders.map(order => (
                <div key={order.id} className="card p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`status-badge ${order.status === 'pending' ? 'status-pending' : 'status-completed'}`}>
                          {order.status === 'pending' ? '⏳ Pendiente' : '✅ Entregado'}
                        </span>
                        <span className="text-xs text-muted">
                          {format(order.createdAt?.toDate() || new Date(), "d MMM, HH:mm", { locale: es })}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold mt-1">{order.productName} × {order.quantity} {order.unit}</h3>
                    </div>
                    <button className="btn btn-ghost btn-xs text-danger" onClick={() => handleDeleteOrder(order.id)}>🗑️</button>
                  </div>

                  <div className="bg-slate-50 p-2 rounded text-sm">
                    <p><strong>Operario:</strong> {users[order.userId]?.name || users[order.userId]?.displayName || 'Desconocido'}</p>
                    <p><strong>Comunidad:</strong> {order.communityName || 'General / Equipo'}</p>
                    {order.notes && <p className="mt-1 italic text-slate-500">"{order.notes}"</p>}
                  </div>

                  {order.status === 'pending' && (
                    <button 
                      className="btn btn-primary btn-sm w-full"
                      onClick={() => handleStatusChange(order.id, 'completed')}
                    >
                      Marcar como Entregado
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="catalog-section">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-md font-bold">Productos Disponibles</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddProduct(true)}>+ Añadir Producto</button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase font-bold text-muted border-b">
                  <th className="p-3">Producto</th>
                  <th className="p-3 text-center">Unidad</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-center text-sm">{p.unit}</td>
                    <td className="p-3 text-right">
                      <button className="btn btn-ghost btn-xs text-danger" onClick={() => handleDeleteProduct(p.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Añadir Producto */}
      {showAddProduct && (
        <div className="modal-overlay" onClick={() => setShowAddProduct(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Añadir al Catálogo</h3>
            </div>
            <form onSubmit={handleAddProduct}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nombre del Producto</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    placeholder="Ej: Lejía Estrella 5L"
                    value={newProduct.name}
                    onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Unidad de medida</label>
                  <select 
                    className="form-select"
                    value={newProduct.unit}
                    onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                  >
                    <option value="unidad">Unidad</option>
                    <option value="litros">Litros</option>
                    <option value="paquete">Paquete</option>
                    <option value="rollo">Rollo</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddProduct(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Producto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .status-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 99px;
          font-weight: bold;
        }
        .status-pending { background: #fff7ed; color: #c2410c; }
        .status-completed { background: #f0fdf4; color: #15803d; }
      `}</style>
    </div>
  );
}
