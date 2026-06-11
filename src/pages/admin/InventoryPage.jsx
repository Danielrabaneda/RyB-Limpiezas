import { useState, useEffect } from 'react';
import { 
  getProducts, 
  getMaterialRequests, 
  updateRequestStatus, 
  deleteMaterialRequest,
  createProduct,
  updateProduct,
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
  const [newProduct, setNewProduct] = useState({ name: '', unit: 'unidad', minStock: '5' });
  const [stockModal, setStockModal] = useState({ open: false, type: 'in', product: null, quantity: '', notes: '' });
  const [statsModal, setStatsModal] = useState({ open: false, product: null });
  const [statsPeriod, setStatsPeriod] = useState('monthly'); // 'monthly' or 'yearly'
  const [editProductModal, setEditProductModal] = useState({ open: false, product: null, name: '', unit: 'unidad', minStock: '5' });
  const [shoppingItems, setShoppingItems] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'shopping' && products.length > 0) {
      const lowStockItems = products
        .filter(p => (p.currentStock || 0) <= (p.minStock || 0))
        .map(p => {
          const diff = (p.minStock || 0) - (p.currentStock || 0);
          const defaultQty = diff > 0 ? diff : 5;
          return {
            id: p.id,
            name: p.name,
            unit: p.unit,
            currentStock: p.currentStock || 0,
            minStock: p.minStock || 0,
            quantityToBuy: defaultQty,
            checked: true,
            isManual: false
          };
        });
      setShoppingItems(lowStockItems);
    }
  }, [activeTab, products]);

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
      setNewProduct({ name: '', unit: 'unidad', minStock: '5' });
      setShowAddProduct(false);
      loadData();
    } catch (err) {
      alert('Error al añadir producto');
    }
  };

  const handleEditProductSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateProduct(editProductModal.product.id, {
        name: editProductModal.name,
        unit: editProductModal.unit,
        minStock: editProductModal.minStock
      });
      setEditProductModal({ open: false, product: null, name: '', unit: 'unidad', minStock: '' });
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al actualizar producto');
    }
  };

  const handleAddManualItem = (productId) => {
    if (!productId) return;
    const p = products.find(prod => prod.id === productId);
    if (!p) return;
    
    if (shoppingItems.some(item => item.id === p.id)) {
      alert('El producto ya está en la lista de compra');
      return;
    }
    
    const newItem = {
      id: p.id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock || 0,
      minStock: p.minStock || 0,
      quantityToBuy: 5,
      checked: true,
      isManual: true
    };
    setShoppingItems([...shoppingItems, newItem]);
  };

  const handleCopyShoppingList = () => {
    const selected = shoppingItems.filter(item => item.checked && item.quantityToBuy > 0);
    if (selected.length === 0) {
      alert('No hay productos seleccionados en la lista');
      return;
    }
    
    let text = `🛒 *RyB LIMPIEZAS - LISTA DE COMPRA*\n`;
    text += `Fecha: ${format(new Date(), 'dd/MM/yyyy')}\n\n`;
    selected.forEach((item, idx) => {
      text += `${idx + 1}. *${item.name}*: ${item.quantityToBuy} ${item.unit} (Stock act: ${item.currentStock} ${item.unit})\n`;
    });
    
    navigator.clipboard.writeText(text)
      .then(() => alert('📋 Lista de compra copiada al portapapeles'))
      .catch(err => alert('Error al copiar la lista'));
  };

  const handleCompletePurchase = async () => {
    const selected = shoppingItems.filter(item => item.checked && item.quantityToBuy > 0);
    if (selected.length === 0) {
      alert('No hay productos seleccionados para comprar');
      return;
    }
    
    if (!confirm(`¿Registrar la entrada de stock para los ${selected.length} productos seleccionados?`)) {
      return;
    }
    
    setLoading(true);
    try {
      for (const item of selected) {
        await addStock(
          item.id,
          item.name,
          item.quantityToBuy,
          currentUser.uid,
          userProfile?.name || 'Admin',
          'Entrada automática desde Lista de Compra'
        );
      }
      alert('✅ Entrada de stock registrada con éxito');
      await loadData();
      setActiveTab('catalog');
    } catch (err) {
      console.error(err);
      alert('Error al registrar la compra');
    } finally {
      setLoading(false);
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

  const getStatsData = (product) => {
    if (!product) return { monthly: [], yearly: [], topOperators: [], totalConsumed: 0, avgMonthly: 0, avgYearly: 0, totalDeliveries: 0 };

    // Filter movements for this product and of type 'out' (operator deliveries)
    const prodMovements = movements.filter(
      m => m.productId === product.id && m.type === 'out'
    );

    const totalDeliveries = prodMovements.length;
    let totalConsumed = 0;
    prodMovements.forEach(m => {
      totalConsumed += Math.abs(m.quantity || 0);
    });

    // 1. Calculate Monthly stats (last 12 months)
    const monthlyList = [];
    const now = new Date();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyList.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        value: 0,
        count: 0
      });
    }

    prodMovements.forEach(m => {
      const mDate = m.date?.toDate() || new Date();
      const mYear = mDate.getFullYear();
      const mMonth = mDate.getMonth();

      // Find if this month is in our last 12 months list
      const bucket = monthlyList.find(b => b.year === mYear && b.month === mMonth);
      if (bucket) {
        bucket.value += Math.abs(m.quantity || 0);
        bucket.count += 1;
      }
    });

    const totalConsumedLast12 = monthlyList.reduce((sum, item) => sum + item.value, 0);
    const avgMonthly = totalConsumedLast12 / 12;

    // 2. Calculate Yearly stats
    const yearsSet = new Set();
    yearsSet.add(now.getFullYear());
    prodMovements.forEach(m => {
      const mDate = m.date?.toDate() || new Date();
      yearsSet.add(mDate.getFullYear());
    });
    
    const yearsList = Array.from(yearsSet).sort((a, b) => a - b);
    const yearlyData = yearsList.map(yr => {
      let val = 0;
      let count = 0;
      prodMovements.forEach(m => {
        const mDate = m.date?.toDate() || new Date();
        if (mDate.getFullYear() === yr) {
          val += Math.abs(m.quantity || 0);
          count += 1;
        }
      });
      return {
        label: String(yr),
        value: val,
        count: count
      };
    });

    const avgYearly = yearlyData.reduce((sum, item) => sum + item.value, 0) / (yearlyData.length || 1);

    // 3. Top Operators
    const opConsumption = {};
    prodMovements.forEach(m => {
      const uid = m.userId;
      if (uid) {
        opConsumption[uid] = (opConsumption[uid] || 0) + Math.abs(m.quantity || 0);
      }
    });

    const topOperators = Object.entries(opConsumption)
      .map(([uid, val]) => {
        const userObj = users[uid];
        const name = userObj ? (userObj.name || userObj.displayName || 'Operario Desconocido') : `UID: ${uid.slice(0, 6)}`;
        return {
          uid,
          name,
          value: val
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      monthly: monthlyList,
      yearly: yearlyData,
      topOperators,
      totalConsumed,
      avgMonthly,
      avgYearly,
      totalDeliveries
    };
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
          className={`btn btn-sm ${activeTab === 'shopping' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('shopping')}
        >
          🛒 Lista de Compra
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
                  <th className="p-3 text-center">Mínimo (Aviso)</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const stock = p.currentStock || 0;
                  const minStock = p.minStock || 0;
                  const isLow = stock <= 0;
                  const isWarning = stock > 0 && stock <= minStock;
                  
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-center text-sm">{p.unit}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${isLow ? 'bg-red-100 text-red-700' : isWarning ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {stock}
                        </span>
                      </td>
                      <td className="p-3 text-center text-sm text-slate-500 font-semibold">{minStock}</td>
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
                          <button 
                            className="btn btn-sm btn-ghost text-xs" 
                            style={{ color: 'var(--color-primary)' }}
                            title="Estadísticas de consumo"
                            onClick={() => setStatsModal({ open: true, product: p })}
                          >
                            📊 Stats
                          </button>
                          <button 
                            className="btn btn-sm btn-ghost text-xs" 
                            style={{ color: 'var(--color-text-secondary)' }}
                            title="Editar Producto"
                            onClick={() => setEditProductModal({ open: true, product: p, name: p.name, unit: p.unit, minStock: String(p.minStock || 0) })}
                          >
                            ✏️ Editar
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
      ) : activeTab === 'shopping' ? (
        <div className="shopping-section">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div>
              <h2 className="text-md font-bold">Lista de Compra</h2>
              <p className="text-xs text-muted">Productos por debajo del stock mínimo o agregados manualmente</p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={handleCopyShoppingList}>
                📋 Copiar Lista
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleCompletePurchase}>
                📥 Registrar Entrada
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto mb-6">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase font-bold text-muted border-b">
                  <th className="p-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="cursor-pointer"
                      checked={shoppingItems.length > 0 && shoppingItems.every(item => item.checked)}
                      onChange={e => {
                        const chk = e.target.checked;
                        setShoppingItems(shoppingItems.map(item => ({ ...item, checked: chk })));
                      }}
                    />
                  </th>
                  <th className="p-3">Producto</th>
                  <th className="p-3 text-center">Stock Actual</th>
                  <th className="p-3 text-center">Mínimo</th>
                  <th className="p-3 text-center">Cant. a Comprar</th>
                  <th className="p-3 text-right">Origen</th>
                </tr>
              </thead>
              <tbody>
                {shoppingItems.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-6 text-center text-muted">
                      No hay productos que requieran compra en este momento.
                    </td>
                  </tr>
                ) : (
                  shoppingItems.map(item => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox"
                          className="cursor-pointer"
                          checked={item.checked}
                          onChange={e => {
                            setShoppingItems(shoppingItems.map(i => i.id === item.id ? { ...i, checked: e.target.checked } : i));
                          }}
                        />
                      </td>
                      <td className="p-3 font-medium">
                        {item.name}
                        {item.currentStock <= item.minStock && !item.isManual && (
                          <span className="badge badge-danger ml-2" style={{ textTransform: 'none', fontSize: '10px', padding: '1px 6px' }}>Stock Bajo</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${item.currentStock <= 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                          {item.currentStock} {item.unit}
                        </span>
                      </td>
                      <td className="p-3 text-center text-sm font-medium text-slate-500">
                        {item.minStock} {item.unit}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center items-center gap-1">
                          <input 
                            type="number"
                            className="form-input py-1 px-2 text-center text-sm"
                            style={{ width: '80px' }}
                            min="0.1"
                            step="0.1"
                            value={item.quantityToBuy}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setShoppingItems(shoppingItems.map(i => i.id === item.id ? { ...i, quantityToBuy: val } : i));
                            }}
                          />
                          <span className="text-xs text-slate-400">{item.unit}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end items-center gap-2">
                          {item.isManual ? (
                            <span className="badge badge-info" style={{ textTransform: 'none', fontSize: '10px' }}>Manual</span>
                          ) : (
                            <span className="badge badge-warning" style={{ textTransform: 'none', fontSize: '10px' }}>Automático</span>
                          )}
                          <button 
                            className="btn btn-ghost btn-xs text-danger" 
                            title="Eliminar de la lista"
                            onClick={() => setShoppingItems(shoppingItems.filter(i => i.id !== item.id))}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-2">➕ Añadir Producto Adicional a la Lista</h3>
            <div className="flex gap-3 items-center flex-wrap">
              <select 
                className="form-select max-w-[300px]"
                defaultValue=""
                onChange={e => {
                  if (e.target.value) {
                    handleAddManualItem(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="" disabled>Selecciona un producto...</option>
                {products
                  .filter(p => !shoppingItems.some(item => item.id === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.currentStock} {p.unit} en stock)
                    </option>
                  ))
                }
              </select>
              <p className="text-xs text-muted">Añade al listado productos que no estén por debajo del mínimo para incluirlos en el reporte o compra.</p>
            </div>
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
                <div className="form-group">
                  <label>Stock Mínimo (Umbral de aviso)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    required 
                    min="0"
                    placeholder="Ej: 5"
                    value={newProduct.minStock}
                    onChange={e => setNewProduct({...newProduct, minStock: e.target.value})}
                  />
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

      {/* Modal Editar Producto */}
      {editProductModal.open && (
        <div className="modal-overlay" onClick={() => setEditProductModal({ open: false, product: null, name: '', unit: 'unidad', minStock: '5' })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '95vw' }}>
            <div className="modal-header">
              <h3>Editar Producto</h3>
            </div>
            <form onSubmit={handleEditProductSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nombre del Producto</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    required 
                    value={editProductModal.name}
                    onChange={e => setEditProductModal({...editProductModal, name: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Unidad de medida</label>
                  <select 
                    className="form-select"
                    value={editProductModal.unit}
                    onChange={e => setEditProductModal({...editProductModal, unit: e.target.value})}
                  >
                    <option value="unidad">Unidad</option>
                    <option value="litros">Litros</option>
                    <option value="paquete">Paquete</option>
                    <option value="rollo">Rollo</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Stock Mínimo (Umbral de aviso)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    required 
                    min="0"
                    value={editProductModal.minStock}
                    onChange={e => setEditProductModal({...editProductModal, minStock: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditProductModal({ open: false, product: null, name: '', unit: 'unidad', minStock: '5' })}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Cambios</button>
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

      {/* Modal Estadísticas de Consumo */}
      {statsModal.open && statsModal.product && (() => {
        const stats = getStatsData(statsModal.product);
        const chartData = statsPeriod === 'monthly' ? stats.monthly : stats.yearly;
        const maxVal = Math.max(...chartData.map(d => d.value), 1);
        
        return (
          <div className="modal-overlay" onClick={() => setStatsModal({ open: false, product: null })}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '95vw' }}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{statsModal.product.name}</h3>
                  <p className="text-xs text-muted mt-1">
                    Stock actual: <span className="font-bold text-slate-700">{statsModal.product.currentStock || 0} {statsModal.product.unit}</span>
                  </p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setStatsModal({ open: false, product: null })}>✕</button>
              </div>
              <div className="modal-body">
                {/* Period toggle */}
                <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
                  <button 
                    type="button"
                    className={`btn btn-xs ${statsPeriod === 'monthly' ? 'btn-primary' : 'btn-ghost'}`}
                    style={statsPeriod === 'monthly' ? {} : { background: 'transparent', border: 'none' }}
                    onClick={() => setStatsPeriod('monthly')}
                  >
                    📅 Mensual (Últimos 12m)
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-xs ${statsPeriod === 'yearly' ? 'btn-primary' : 'btn-ghost'}`}
                    style={statsPeriod === 'yearly' ? {} : { background: 'transparent', border: 'none' }}
                    onClick={() => setStatsPeriod('yearly')}
                  >
                    🗓️ Anual
                  </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-3 gap-3 mb-6">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-xs text-slate-500 font-semibold mb-1">Total Consumido</div>
                    <div className="text-lg font-bold text-slate-800">
                      {stats.totalConsumed.toFixed(1)} <span className="text-[10px] font-medium text-slate-500">{statsModal.product.unit}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-xs text-slate-500 font-semibold mb-1">Promedio ({statsPeriod === 'monthly' ? 'Mes' : 'Año'})</div>
                    <div className="text-lg font-bold text-slate-800">
                      {(statsPeriod === 'monthly' ? stats.avgMonthly : stats.avgYearly).toFixed(1)} <span className="text-[10px] font-medium text-slate-500">{statsModal.product.unit}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-xs text-slate-500 font-semibold mb-1">Entregas Totales</div>
                    <div className="text-lg font-bold text-slate-800">
                      {stats.totalDeliveries} <span className="text-[10px] font-medium text-slate-500">veces</span>
                    </div>
                  </div>
                </div>

                {/* Bar Chart */}
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1">
                  📊 Gráfico de Consumo
                </h4>
                {stats.totalConsumed === 0 ? (
                  <div className="text-sm italic text-slate-400 p-8 text-center bg-slate-50 border border-dashed rounded-2xl mb-6">
                    No hay registros de consumo (entregas) para este producto.
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                    <div className="h-40 flex items-end gap-2 pb-2 border-b border-slate-200 overflow-x-auto">
                      {chartData.map((item, idx) => {
                        const heightPercent = (item.value / maxVal) * 100;
                        return (
                          <div key={idx} className="flex-1 min-w-[28px] flex flex-col justify-end items-center h-full group relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow">
                              {item.value.toFixed(1)} {statsModal.product.unit} ({item.count} ent.)
                            </div>
                            {/* Bar */}
                            <div 
                              style={{ height: `${Math.max(heightPercent, 2)}%` }} 
                              className={`w-full rounded-t transition-all duration-300 cursor-pointer ${item.value > 0 ? 'chart-bar-active' : 'bg-slate-200'}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* Axis Labels */}
                    <div className="flex gap-2 mt-2">
                      {chartData.map((item, idx) => (
                        <div key={idx} className="flex-1 text-[9px] font-semibold text-slate-400 text-center truncate" title={item.label}>
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Consumers */}
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                  👷 Top Consumidores (Operarios)
                </h4>
                {stats.topOperators.length === 0 ? (
                  <div className="text-xs italic text-slate-400 p-4 text-center bg-slate-50 rounded-xl">
                    Ningún operario registrado en el historial de consumos.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {stats.topOperators.map((op, idx) => {
                      const percent = stats.totalConsumed > 0 ? (op.value / stats.totalConsumed) * 100 : 0;
                      return (
                        <div key={op.uid} className="flex flex-col gap-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-slate-700">{idx + 1}. {op.name}</span>
                            <span className="font-bold text-slate-800">{op.value.toFixed(1)} {statsModal.product.unit} ({percent.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className="progress-bar-fill h-full rounded-full transition-all duration-500" 
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setStatsModal({ open: false, product: null })}>Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      <style jsx>{`
        .status-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 99px;
          font-weight: bold;
        }
        .status-pending { background: #fff7ed; color: #c2410c; }
        .status-completed { background: #f0fdf4; color: #15803d; }
        .chart-bar-active {
          background: linear-gradient(to top, var(--color-primary), var(--color-accent));
        }
        .chart-bar-active:hover {
          background: linear-gradient(to top, var(--color-primary-dark), var(--color-accent-light));
        }
        .progress-bar-fill {
          background: linear-gradient(to right, var(--color-primary), var(--color-accent));
        }
      `}</style>
    </div>
  );
}
