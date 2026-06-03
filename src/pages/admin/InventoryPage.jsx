import { useState, useEffect } from 'react';
import { 
  getProducts, 
  getMaterialRequests, 
  updateRequestStatus, 
  deleteMaterialRequest,
  createProduct,
  deleteProduct,
  addStock,
  adjustStock,
  getStockMovements
} from '../../services/materialService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers } from '../../services/authService';

export default function InventoryPage() {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'catalog', 'movements'
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', unit: 'unidad' });
  const [stockModal, setStockModal] = useState({ open: false, type: 'in', product: null, quantity: '', notes: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, oData, uData, mData] = await Promise.all([
        getProducts(),
        getMaterialRequests(),
        getAllUsers(),
        getStockMovements(200)
      ]);
      
      setProducts(pData);
      setOrders(oData);
      setMovements(mData);
      
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
      await updateRequestStatus(orderId, status, currentUser.uid, userProfile?.name || 'Admin');
      loadData();
    } catch (err) {
      alert(err.message || 'Error al actualizar estado');
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
    if (!confirm('¿Borrar producto del catálogo? ¡Se perderá el inventario actual de este producto!')) return;
    try {
      await deleteProduct(id);
      loadData();
    } catch (err) {
      alert('Error al borrar producto');
    }
  };

  const handleStockAction = async (e) => {
    e.preventDefault();
    try {
      if (stockModal.type === 'in') {
        await addStock(
          stockModal.product.id, 
          stockModal.product.name, 
          stockModal.quantity, 
          currentUser.uid, 
          userProfile?.name || 'Admin', 
          stockModal.notes
        );
      } else if (stockModal.type === 'adjust') {
        await adjustStock(
          stockModal.product.id, 
          stockModal.product.name, 
          stockModal.quantity, 
          currentUser.uid, 
          userProfile?.name || 'Admin', 
          stockModal.notes
        );
      }
      setStockModal({ open: false, type: 'in', product: null, quantity: '', notes: '' });
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error actualizando stock');
    }
  };

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Gestión de Material</h1>
        <p className="page-subtitle">Control de stock, movimientos y pedidos</p>
      </div>

      <div className="tabs-container mb-6 flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button 
          className={`btn btn-sm ${activeTab === 'orders' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('orders')}
        >
          📋 Pedidos
        </button>
        <button 
          className={`btn btn-sm ${activeTab === 'catalog' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('catalog')}
        >
          📦 Inventario
        </button>
        <button 
          className={`btn btn-sm ${activeTab === 'movements' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('movements')}
        >
          📊 Movimientos
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando datos...</div>
      ) : activeTab === 'orders' ? (
        <div className="orders-list">
          {orders.length === 0 ? (
            <div className="empty-state">No hay pedidos registrados</div>
          ) : (
            <div className="grid gap-4">
              {orders.map(order => {
                const product = products.find(p => p.id === order.productId);
                const currentStock = product?.currentStock || 0;
                const canDeliver = currentStock >= order.quantity;

                return (
                  <div key={order.id} className="card p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between items-start gap-2">
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
                      {order.notes && <p className="mt-1 italic text-slate-500">"{order.notes}"</p>}
                      {order.status === 'pending' && (
                        <p className={`mt-2 text-xs font-bold ${canDeliver ? 'text-green-600' : 'text-red-600'}`}>
                          Stock actual: {currentStock} {order.unit}
                        </p>
                      )}
                    </div>

                    {order.status === 'pending' && (
                      <button 
                        className={`btn btn-sm w-full ${canDeliver ? 'btn-primary' : 'bg-red-100 text-red-700 hover:bg-red-200 border-0'}`}
                        onClick={() => {
                          if (!canDeliver) {
                            if (!confirm(`⚠️ STOCK INSUFICIENTE. Tienes ${currentStock} y se piden ${order.quantity}. ¿Entregar de todas formas y dejar el stock en negativo?`)) {
                              return;
                            }
                          }
                          handleStatusChange(order.id, 'completed');
                        }}
                      >
                        Marcar como Entregado
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'catalog' ? (
        <div className="catalog-section">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h2 className="text-md font-bold">Inventario</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddProduct(true)}>+ Añadir Producto</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase font-bold text-muted border-b">
                  <th className="p-3">Producto</th>
                  <th className="p-3 text-center">Unidad</th>
                  <th className="p-3 text-center">Stock</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const stock = p.currentStock || 0;
                  const isLow = stock <= 0;
                  const isWarning = stock > 0 && stock <= 5;
                  
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-center text-sm">{p.unit}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${isLow ? 'bg-red-100 text-red-700' : isWarning ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {stock}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            className="btn btn-sm btn-outline text-xs" 
                            onClick={() => setStockModal({ open: true, type: 'in', product: p, quantity: '', notes: '' })}
                          >
                            ➕ Entrada
                          </button>
                          <button 
                            className="btn btn-sm btn-ghost text-xs" 
                            onClick={() => setStockModal({ open: true, type: 'adjust', product: p, quantity: stock, notes: '' })}
                          >
                            ⚙️ Ajustar
                          </button>
                          <button className="btn btn-ghost btn-xs text-danger ml-2" onClick={() => handleDeleteProduct(p.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="movements-section">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-md font-bold">Historial de Movimientos</h2>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase font-bold text-muted border-b">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3 text-center">Tipo</th>
                  <th className="p-3 text-center">Cant.</th>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-muted">No hay movimientos registrados.</td>
                  </tr>
                ) : (
                  movements.map(m => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors text-sm">
                      <td className="p-3 whitespace-nowrap">{format(m.date?.toDate() || new Date(), "d MMM, HH:mm", { locale: es })}</td>
                      <td className="p-3 font-medium">{m.productName}</td>
                      <td className="p-3 text-center">
                        {m.type === 'in' && <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Entrada</span>}
                        {m.type === 'out' && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Salida</span>}
                        {m.type === 'adjustment' && <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold">Ajuste</span>}
                      </td>
                      <td className="p-3 text-center font-bold">
                        {m.type === 'in' ? '+' : m.type === 'out' ? '-' : ''}{Math.abs(m.quantity)}
                      </td>
                      <td className="p-3 truncate max-w-[120px]" title={m.userName || users[m.userId]?.name}>
                        {m.userName || users[m.userId]?.name || m.userId}
                      </td>
                      <td className="p-3 text-xs text-muted max-w-[200px] truncate" title={m.notes}>{m.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Añadir Producto */}
      {showAddProduct && (
        <div className="modal-overlay" onClick={() => setShowAddProduct(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '95vw' }}>
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

      {/* Modal Stock (Entrada / Ajuste) */}
      {stockModal.open && (
        <div className="modal-overlay" onClick={() => setStockModal({...stockModal, open: false})}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '95vw' }}>
            <div className="modal-header">
              <h3>{stockModal.type === 'in' ? 'Entrada de Stock' : 'Ajustar Inventario'}</h3>
            </div>
            <form onSubmit={handleStockAction}>
              <div className="modal-body">
                <p className="text-sm font-bold mb-4">Producto: {stockModal.product?.name}</p>
                <div className="form-group">
                  <label>{stockModal.type === 'in' ? 'Cantidad Recibida' : 'Nuevo Stock Real'}</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    required 
                    min={stockModal.type === 'in' ? "0.1" : undefined}
                    step="0.1"
                    placeholder={stockModal.type === 'in' ? "Ej: 50" : "Ej: 12"}
                    value={stockModal.quantity}
                    onChange={e => setStockModal({...stockModal, quantity: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Notas (opcional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder={stockModal.type === 'in' ? "Nº Albarán, proveedor..." : "Motivo del descuadre..."}
                    value={stockModal.notes}
                    onChange={e => setStockModal({...stockModal, notes: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setStockModal({...stockModal, open: false})}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
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
