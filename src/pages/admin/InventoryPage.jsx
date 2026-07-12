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
import { groupFlatList } from '../../utils/dateGrouping';
import { useInventoryData } from '../../hooks/useInventoryData';
import { useShoppingList } from '../../hooks/useShoppingList';
import { useInventoryStats } from '../../hooks/useInventoryStats';

import { CATEGORIES, autoCategorize } from '../../utils/inventoryCategories';

export default function InventoryPage() {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'catalog', 'movements'
  const [actionLoading, setActionLoading] = useState(false);
  const {
    products,
    setProducts,
    orders,
    setOrders,
    movements,
    setMovements,
    users,
    loading,
    loadData,
    handleStatusChange,
    handleDeleteOrder,
    handleAddProduct: handleAddProductRaw,
    handleEditProductSubmit: handleEditProductSubmitRaw,
    handleDeleteProduct,
    handleStockAction: handleStockActionRaw
  } = useInventoryData({ currentUser, userProfile, actionLoading, setActionLoading });

  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleGroup = (id) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedGroups(newSet);
  };
  
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', unit: 'unidad', minStock: '5', category: 'general' });
  const [stockModal, setStockModal] = useState({ open: false, type: 'in', product: null, quantity: '', notes: '' });
  const [statsModal, setStatsModal] = useState({ open: false, product: null });
  const [editProductModal, setEditProductModal] = useState({ open: false, product: null, name: '', unit: 'unidad', minStock: '5', category: 'general' });

  const {
    statsFilterRange,
    setStatsFilterRange,
    statsFilterFamily,
    setStatsFilterFamily,
    statsSearch,
    setStatsSearch,
    statsPeriod,
    setStatsPeriod,
    getStatsData,
    getGlobalDashboardData
  } = useInventoryStats({ products, movements, users });

  const {
    shoppingItems,
    setShoppingItems,
    handleAddManualItem,
    handleCopyShoppingList,
    handleCompletePurchase
  } = useShoppingList({
    products,
    activeTab,
    currentUser,
    userProfile,
    setActionLoading,
    loadData,
    setActiveTab
  });

  useEffect(() => {
    loadData();
  }, []);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      await handleAddProductRaw({
        ...newProduct,
        category: newProduct.category || autoCategorize(newProduct.name)
      });
      setNewProduct({ name: '', unit: 'unidad', minStock: '5', category: 'general' });
      setShowAddProduct(false);
    } catch (err) {
      // Error already handled inside hook
    }
  };

  const handleEditProductSubmit = async (e) => {
    e.preventDefault();
    try {
      await handleEditProductSubmitRaw(editProductModal.product.id, {
        name: editProductModal.name,
        unit: editProductModal.unit,
        minStock: editProductModal.minStock,
        category: editProductModal.category
      });
      setEditProductModal({ open: false, product: null, name: '', unit: 'unidad', minStock: '5', category: 'general' });
    } catch (err) {
      // Error already handled inside hook
    }
  };



  const handleStockAction = async (e) => {
    e.preventDefault();
    try {
      await handleStockActionRaw(
        stockModal.type,
        stockModal.product,
        stockModal.quantity,
        stockModal.notes
      );
      setStockModal({ open: false, type: 'in', product: null, quantity: '', notes: '' });
    } catch (err) {
      // Error handled in hook
    }
  };

  function renderOrderCard(order) {
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
  }

  function renderMovementTableHeader() {
    return (
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Producto</th>
          <th className="text-center">Tipo</th>
          <th className="text-center">Cant.</th>
          <th>Usuario</th>
          <th>Detalle</th>
        </tr>
      </thead>
    );
  }

  function renderMovementRow(m) {
    return (
      <tr key={m.id}>
        <td className="whitespace-nowrap">{format(m.date?.toDate() || new Date(), "d MMM, HH:mm", { locale: es })}</td>
        <td className="font-semibold">{m.productName}</td>
        <td className="text-center">
          {m.type === 'in' && <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Entrada</span>}
          {m.type === 'out' && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Salida</span>}
          {m.type === 'adjustment' && <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold">Ajuste</span>}
        </td>
        <td className="text-center font-bold">
          {m.type === 'in' ? '+' : m.type === 'out' ? '-' : ''}{Math.abs(m.quantity)}
        </td>
        <td className="truncate max-w-[120px]" title={m.userName || users[m.userId]?.name}>
          {m.userName || users[m.userId]?.name || m.userId}
        </td>
        <td className="text-xs text-muted max-w-[200px] truncate" title={m.notes}>{m.notes || '-'}</td>
      </tr>
    );
  }

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
        <button 
          className={`btn btn-sm ${activeTab === 'stats' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('stats')}
        >
          📈 Estadísticas
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando datos...</div>
      ) : activeTab === 'orders' ? (
        <div className="orders-list">
          {orders.length === 0 ? (
            <div className="empty-state">No hay pedidos registrados</div>
          ) : (
            <div className="flex flex-col gap-4">
              {(() => {
                const grouped = groupFlatList(orders, o => o.createdAt);
                return grouped.map(group => {
                  if (group.isCurrent) {
                    return (
                      <div key={group.id} className="grid gap-4">
                        {group.items.map(order => renderOrderCard(order))}
                      </div>
                    );
                  } else {
                    const isExpanded = expandedGroups.has(group.id);
                    return (
                      <div key={group.id} className="week-card mb-2">
                        <div 
                          className={`week-header card ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleGroup(group.id)}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            cursor: 'pointer',
                            background: 'var(--color-bg-input)',
                            borderLeft: isExpanded ? '4px solid var(--color-accent)' : '1px solid var(--color-border)',
                            padding: 'var(--space-4)'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="week-icon" style={{ fontSize: '1.2rem' }}>
                              {group.type === 'year' ? '🗓️' : group.type === 'month' ? '📅' : (isExpanded ? '📂' : '📁')}
                            </div>
                            <div>
                              <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700 }}>{group.label}</h3>
                              <span className="text-xs text-muted">{group.subLabel}</span>
                            </div>
                          </div>
                          <div className="week-stats flex gap-4 text-sm font-semibold">
                            <span title="Pedidos" style={{ color: 'var(--color-primary)' }}>
                              📋 {group.items.length} pedidos
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{isExpanded ? '🔽' : '▶️'}</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="week-content mt-2 ml-4 grid gap-4">
                            {group.items.map(order => renderOrderCard(order))}
                          </div>
                        )}
                      </div>
                    );
                  }
                });
              })()}
            </div>
          )}
        </div>
      ) : activeTab === 'catalog' ? (
        <div className="catalog-section">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h2 className="text-md font-bold">Inventario</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddProduct(true)}>+ Añadir Producto</button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table className="table table-grid table-striped min-w-[600px]">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-center">Unidad</th>
                    <th className="text-center">Stock</th>
                    <th className="text-center">Mínimo (Aviso)</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const stock = p.currentStock || 0;
                    const minStock = p.minStock || 0;
                    const isLow = stock <= 0;
                    const isWarning = stock > 0 && stock <= minStock;
                    const catObj = CATEGORIES.find(c => c.id === (p.category || autoCategorize(p.name))) || CATEGORIES[4];
                    
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="product-cell">
                            <span className="product-name">{p.name}</span>
                            <div className="flex">
                              <span className={`badge ${catObj.badgeClass}`}>
                                {catObj.emoji} {catObj.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="text-center">{p.unit}</td>
                        <td className="text-center">
                          <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${isLow ? 'bg-red-100 text-red-700' : isWarning ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                            {stock}
                          </span>
                        </td>
                        <td className="text-center font-semibold text-slate-500">{minStock}</td>
                        <td className="text-right">
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
                              onClick={() => setEditProductModal({ 
                                open: true, 
                                product: p, 
                                name: p.name, 
                                unit: p.unit, 
                                minStock: String(p.minStock || 0),
                                category: p.category || autoCategorize(p.name)
                              })}
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

          <div className="card mb-6" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table className="table table-grid table-striped min-w-[600px]">
                <thead>
                  <tr>
                    <th className="w-10 text-center">
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
                    <th>Producto</th>
                    <th className="text-center">Stock Actual</th>
                    <th className="text-center">Mínimo</th>
                    <th className="text-center">Cant. a Comprar</th>
                    <th className="text-right">Origen</th>
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
                    shoppingItems.map(item => {
                      const catObj = CATEGORIES.find(c => c.id === (item.category || autoCategorize(item.name))) || CATEGORIES[4];
                      return (
                        <tr key={item.id}>
                          <td className="text-center">
                            <input 
                              type="checkbox"
                              className="cursor-pointer"
                              checked={item.checked}
                              onChange={e => {
                                setShoppingItems(shoppingItems.map(i => i.id === item.id ? { ...i, checked: e.target.checked } : i));
                              }}
                            />
                          </td>
                          <td>
                            <div className="product-cell">
                              <div className="flex items-center gap-2">
                                <span className="product-name">{item.name}</span>
                                {item.currentStock <= item.minStock && !item.isManual && (
                                  <span className="badge badge-danger" style={{ textTransform: 'none', fontSize: '10px', padding: '1px 6px' }}>Stock Bajo</span>
                                )}
                              </div>
                              <div className="flex">
                                <span className={`badge ${catObj.badgeClass}`}>
                                  {catObj.emoji} {catObj.name}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            <span className={`px-2 py-0.5 rounded font-bold text-xs ${item.currentStock <= 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                              {item.currentStock} {item.unit}
                            </span>
                          </td>
                          <td className="text-center text-sm font-medium text-slate-500">
                            {item.minStock} {item.unit}
                          </td>
                          <td className="text-center">
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
                          <td className="text-right">
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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
      ) : activeTab === 'movements' ? (
        <div className="movements-section">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-md font-bold">Historial de Movimientos</h2>
          </div>
          {movements.length === 0 ? (
            <div className="card text-center p-6 text-muted">No hay movimientos registrados.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {(() => {
                const grouped = groupFlatList(movements, m => m.date);
                return grouped.map(group => {
                  if (group.isCurrent) {
                    return (
                      <div key={group.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="overflow-x-auto">
                          <table className="table table-grid table-striped min-w-[600px]" style={{ margin: 0 }}>
                            {renderMovementTableHeader()}
                            <tbody>
                              {group.items.map(m => renderMovementRow(m))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  } else {
                    const isExpanded = expandedGroups.has(group.id);
                    return (
                      <div key={group.id} className="week-card mb-2">
                        <div 
                          className={`week-header card ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleGroup(group.id)}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            cursor: 'pointer',
                            background: 'var(--color-bg-input)',
                            borderLeft: isExpanded ? '4px solid var(--color-accent)' : '1px solid var(--color-border)',
                            padding: 'var(--space-4)'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="week-icon" style={{ fontSize: '1.2rem' }}>
                              {group.type === 'year' ? '🗓️' : group.type === 'month' ? '📅' : (isExpanded ? '📂' : '📁')}
                            </div>
                            <div>
                              <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700 }}>{group.label}</h3>
                              <span className="text-xs text-muted">{group.subLabel}</span>
                            </div>
                          </div>
                          <div className="week-stats flex gap-4 text-sm font-semibold">
                            <span title="Movimientos" style={{ color: 'var(--color-primary)' }}>
                              📊 {group.items.length} movimientos
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{isExpanded ? '🔽' : '▶️'}</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="week-content mt-2 ml-4">
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                              <div className="overflow-x-auto">
                                <table className="table table-grid table-striped min-w-[600px]" style={{ margin: 0 }}>
                                  {renderMovementTableHeader()}
                                  <tbody>
                                    {group.items.map(m => renderMovementRow(m))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                });
              })()}
            </div>
          )}
        </div>
      ) : (
        (() => {
          const s = getGlobalDashboardData();
          return (
            <div className="stats-dashboard flex flex-col gap-6">
              {/* Filtros */}
              <div className="card p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm rounded-2xl">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rango Temporal</label>
                    <select
                      className="form-select text-sm py-1.5 px-3 min-w-[150px] bg-slate-50 border-slate-200 rounded-xl"
                      value={statsFilterRange}
                      onChange={e => setStatsFilterRange(e.target.value)}
                    >
                      <option value="3m">Últimos 3 meses</option>
                      <option value="6m">Últimos 6 meses</option>
                      <option value="12m">Últimos 12 meses</option>
                      <option value="all">Histórico Completo</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Familia / Categoría</label>
                    <select
                      className="form-select text-sm py-1.5 px-3 min-w-[180px] bg-slate-50 border-slate-200 rounded-xl"
                      value={statsFilterFamily}
                      onChange={e => setStatsFilterFamily(e.target.value)}
                    >
                      <option value="all">Todas las familias</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Buscar Producto</label>
                  <input
                    type="text"
                    className="form-input text-sm py-1.5 px-3 bg-slate-50 border-slate-200 rounded-xl"
                    placeholder="Filtrar por nombre..."
                    value={statsSearch}
                    onChange={e => setStatsSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1 */}
                <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: 'var(--color-primary)' }}>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consumo Total</div>
                    <div className="text-2xl font-black text-slate-800 mt-1">{s.totalConsumed.toFixed(1)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">unidades entregadas</div>
                  </div>
                  <div className="text-3xl bg-blue-50 p-2.5 rounded-2xl">📦</div>
                </div>

                {/* KPI 2 */}
                <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: 'var(--color-accent)' }}>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Variación Mensual</div>
                    <div className="text-2xl font-black text-slate-800 mt-1 flex items-center gap-1.5">
                      {s.monthlyVariation > 0 ? (
                        <span className="text-red-500">+{s.monthlyVariation.toFixed(0)}% 📈</span>
                      ) : s.monthlyVariation < 0 ? (
                        <span className="text-green-500">{s.monthlyVariation.toFixed(0)}% 📉</span>
                      ) : (
                        <span className="text-slate-500">0%</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">últ. 30 días vs ant. 30 días</div>
                  </div>
                  <div className="text-3xl bg-cyan-50 p-2.5 rounded-2xl">🔄</div>
                </div>

                {/* KPI 3 */}
                <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: s.criticalStockCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stock Crítico</div>
                    <div className={`text-2xl font-black mt-1 ${s.criticalStockCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {s.criticalStockCount}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">artículos bajo el mínimo</div>
                  </div>
                  <div className="text-3xl p-2.5 rounded-2xl" style={{ backgroundColor: s.criticalStockCount > 0 ? '#fef2f2' : '#f0fdf4' }}>{s.criticalStockCount > 0 ? '⚠️' : '✅'}</div>
                </div>

                {/* KPI 4 */}
                <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: 'var(--color-info)' }}>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entregas Totales</div>
                    <div className="text-2xl font-black text-slate-800 mt-1">{s.totalDeliveries}</div>
                    <div className="text-xs text-slate-400 mt-0.5">solicitudes completadas</div>
                  </div>
                  <div className="text-3xl bg-indigo-50 p-2.5 rounded-2xl">👷</div>
                </div>
              </div>

              {/* Line Chart & Top 10 Ranking */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Line Chart (Evolución Temporal) */}
                <div className="card p-5 lg:col-span-7 flex flex-col justify-between shadow-sm rounded-2xl bg-white">
                  <div>
                    <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                      📈 Evolución de Consumo Temporal
                    </h3>
                    <p className="text-xs text-slate-400 mb-4 font-medium">Total de unidades consumidas mensualmente en el periodo</p>
                  </div>
                  {s.totalConsumed === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 italic">
                      No hay registros de consumo para este periodo.
                    </div>
                  ) : (
                    <div className="w-full relative h-[200px] mt-2">
                      {(() => {
                        const maxVal = Math.max(...s.temporalData.map(d => d.value), 10);
                        const svgWidth = 500;
                        const svgHeight = 200;
                        const paddingLeft = 45;
                        const paddingRight = 15;
                        const paddingTop = 20;
                        const paddingBottom = 30;

                        const chartWidth = svgWidth - paddingLeft - paddingRight;
                        const chartHeight = svgHeight - paddingTop - paddingBottom;

                        // Generate SVG points
                        const points = s.temporalData.map((d, i) => {
                          const x = paddingLeft + (i / (s.temporalData.length - 1 || 1)) * chartWidth;
                          const y = paddingTop + chartHeight - (d.value / maxVal) * chartHeight;
                          return { x, y, value: d.value, label: d.label, count: d.count };
                        });

                        const pathD = points.length > 0 
                          ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                          : '';

                        const areaD = points.length > 0
                          ? `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
                          : '';

                        return (
                          <svg className="w-full h-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal Gridlines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                              const y = paddingTop + chartHeight * ratio;
                              const valLabel = (maxVal * (1 - ratio)).toFixed(0);
                              return (
                                <g key={index}>
                                  <line 
                                    x1={paddingLeft} 
                                    y1={y} 
                                    x2={svgWidth - paddingRight} 
                                    y2={y} 
                                    stroke="#f1f5f9" 
                                    strokeDasharray="4 4" 
                                    strokeWidth="1.5"
                                  />
                                  <text 
                                    x={paddingLeft - 8} 
                                    y={y + 3} 
                                    textAnchor="end" 
                                    fill="#94a3b8" 
                                    fontSize="8" 
                                    fontWeight="800"
                                  >
                                    {valLabel}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Area */}
                            {areaD && <path d={areaD} fill="url(#areaGradient)" />}

                            {/* Line */}
                            {pathD && <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />}

                            {/* Dots & Labels */}
                            {points.map((p, i) => (
                              <g key={i} className="group cursor-pointer">
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="4" 
                                  fill="#ffffff" 
                                  stroke="#2563eb" 
                                  strokeWidth="2.5" 
                                />
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="10" 
                                  fill="transparent" 
                                />
                                <title>{`${p.label}: ${p.value.toFixed(1)} uds (${p.count} ent.)`}</title>
                              </g>
                            ))}

                            {/* X-axis labels */}
                            {points.map((p, i) => (
                              <text 
                                key={i} 
                                x={p.x} 
                                y={svgHeight - 8} 
                                textAnchor="middle" 
                                fill="#94a3b8" 
                                fontSize="8" 
                                fontWeight="700"
                              >
                                {p.label.split(' ')[0]}
                              </text>
                            ))}
                          </svg>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Top 10 Ranking */}
                <div className="card p-5 lg:col-span-5 shadow-sm rounded-2xl bg-white">
                  <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                    📊 Top 10 Artículos Consumidos
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 font-medium">Ranking de artículos más retirados por cantidad total</p>
                  
                  {s.rankingData.length === 0 ? (
                    <div className="text-slate-400 italic text-center py-12 text-sm">
                      No hay datos de consumo.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {(() => {
                        const maxRankVal = Math.max(...s.rankingData.map(d => d.value), 1);
                        return s.rankingData.map((item, idx) => {
                          const percentage = (item.value / maxRankVal) * 100;
                          return (
                            <div key={item.id} className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-slate-600 max-w-[70%] truncate">
                                  {idx + 1}. {item.name}
                                </span>
                                <span className="font-bold text-slate-800">
                                  {item.value.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">{item.unit}</span>
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all duration-500" 
                                  style={{ 
                                    width: `${percentage}%`,
                                    background: 'linear-gradient(to right, var(--color-primary), var(--color-accent))'
                                  }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Matriz Heatmap (Producto x Mes) */}
              <div className="card p-5 shadow-sm rounded-2xl bg-white">
                <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                  🔲 Matriz de Calor (Consumo Mensual por Artículo)
                </h3>
                <p className="text-xs text-slate-400 mb-5 font-medium">
                  Cruza los 8 artículos más consumidos frente a los últimos 6 meses para ver la intensidad estacional de consumo.
                </p>

                {s.heatmapData.length === 0 ? (
                  <div className="text-slate-400 italic text-center py-12 text-sm">
                    No hay datos suficientes para generar el mapa de calor.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px] flex flex-col gap-2">
                      {/* Cabecera meses */}
                      <div className="flex items-center text-xs font-bold text-slate-500 mb-1">
                        <div className="w-1/3 truncate pr-4 text-left">Artículo</div>
                        <div className="w-2/3 flex">
                          {s.heatmapMonths.map((mBucket, idx) => (
                            <div key={idx} className="flex-1 text-center py-1 border-r last:border-0 border-slate-100 bg-slate-50 rounded-md mx-0.5">
                              {mBucket.label}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Filas */}
                      {s.heatmapData.map((row, rowIdx) => (
                        <div key={row.product.id} className="flex items-center text-sm py-1.5 hover:bg-slate-50 rounded-lg px-1 transition-colors">
                          <div className="w-1/3 font-semibold text-slate-600 truncate pr-4 text-left">
                            {row.product.name}
                          </div>
                          <div className="w-2/3 flex">
                            {row.values.map((val, colIdx) => {
                              const opacity = s.maxHeatmapVal > 0 ? Math.min(Math.max(val / s.maxHeatmapVal, 0.04), 0.95) : 0.04;
                              const isZero = val === 0;
                              return (
                                <div 
                                  key={colIdx} 
                                  className="flex-1 text-center py-2 mx-0.5 rounded-lg font-bold text-xs relative group transition-all duration-300 cursor-pointer"
                                  style={{
                                    backgroundColor: isZero ? '#f8fafc' : `rgba(37, 99, 235, ${opacity})`,
                                    color: isZero ? '#cbd5e1' : opacity > 0.5 ? '#ffffff' : '#1e3a8a',
                                    border: isZero ? '1px dashed #e2e8f0' : 'none'
                                  }}
                                  title={`${row.product.name} - ${s.heatmapMonths[colIdx].label}: ${val.toFixed(1)} ${row.product.unit}`}
                                >
                                  {val > 0 ? val.toFixed(0) : '-'}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pareto ABC & Alertas */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Pareto ABC */}
                <div className="card p-5 lg:col-span-6 shadow-sm rounded-2xl bg-white">
                  <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                    🎯 Clasificación ABC (Rotación y Consumo)
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 font-medium">
                    Clasificación de productos basada en el principio de Pareto (los artículos Clase A representan el 80% del consumo total).
                  </p>

                  {s.abcData.length === 0 ? (
                    <div className="text-slate-400 italic text-center py-12 text-sm">
                      No hay artículos consumidos en el catálogo.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {/* Summary Blocks */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-blue-500 text-white font-bold text-[10px] mb-1">A</span>
                          <div className="text-lg font-black text-blue-900">{s.abcData.filter(d => d.abcClass === 'A').length}</div>
                          <div className="text-[9px] text-blue-600 font-bold uppercase">Alta Rotación (80%)</div>
                        </div>
                        <div className="bg-cyan-50 p-2.5 rounded-xl border border-cyan-100 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-500 text-white font-bold text-[10px] mb-1">B</span>
                          <div className="text-lg font-black text-cyan-900">{s.abcData.filter(d => d.abcClass === 'B').length}</div>
                          <div className="text-[9px] text-cyan-600 font-bold uppercase">Rotación Media (15%)</div>
                        </div>
                        <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-slate-500 text-white font-bold text-[10px] mb-1">C</span>
                          <div className="text-lg font-black text-slate-800">{s.abcData.filter(d => d.abcClass === 'C').length}</div>
                          <div className="text-[9px] text-slate-500 font-bold uppercase">Baja Rotación (5%)</div>
                        </div>
                      </div>

                      {/* ABC Table list */}
                      <div className="max-h-[220px] overflow-y-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-muted border-b">
                              <th className="p-2.5">Producto</th>
                              <th className="p-2.5 text-center">Clase</th>
                              <th className="p-2.5 text-right">Consumo</th>
                              <th className="p-2.5 text-right">Acumulado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.abcData.slice(0, 15).map(item => (
                              <tr key={item.product.id} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="p-2.5 font-medium truncate max-w-[120px]">{item.product.name}</td>
                                <td className="p-2.5 text-center">
                                  <span className={`inline-block px-1.5 py-0.5 rounded-full font-bold text-[9px] ${
                                    item.abcClass === 'A' ? 'bg-blue-100 text-blue-700' :
                                    item.abcClass === 'B' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {item.abcClass}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right font-bold">{item.value.toFixed(1)}</td>
                                <td className="p-2.5 text-right font-semibold text-slate-400">{item.cumulativePercent.toFixed(0)}%</td>
                              </tr>
                            ))}
                            {s.abcData.length > 15 && (
                              <tr>
                                <td colSpan="4" className="p-2.5 text-center text-[10px] text-muted italic">
                                  Y {s.abcData.length - 15} productos más...
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabla de Alertas */}
                <div className="card p-5 lg:col-span-6 shadow-sm rounded-2xl bg-white">
                  <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                    🚨 Alertas de Consumo y Almacén
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 font-medium">
                    Alertas generadas por sobre-consumo reciente (más del 30% respecto al histórico) o stock crítico en artículos prioritarios (Clase A).
                  </p>

                  {s.alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-green-600 bg-green-50/40 border border-green-100 rounded-2xl h-[calc(100%-60px)] min-h-[200px]">
                      <span className="text-3xl mb-2">✅</span>
                      <span className="font-bold text-green-800">Todo en orden</span>
                      <span className="text-slate-500 mt-1 max-w-[250px] font-medium">No se detectan anomalías de sobre-consumo ni stock crítico en artículos principales.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
                      {s.alerts.map((alert, idx) => (
                        <div 
                          key={idx} 
                          className={`p-3.5 rounded-xl border flex flex-col gap-1.5 text-xs ${
                            alert.type === 'stock' ? 'bg-red-50/60 border-red-100 text-red-900' : 'bg-amber-50/60 border-amber-100 text-amber-900'
                          }`}
                        >
                          <div className="font-bold flex items-center gap-1">
                            {alert.title}
                          </div>
                          <p className="text-slate-600 leading-relaxed font-semibold">
                            {alert.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
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
                <div className="form-group">
                  <label>Familia / Categoría</label>
                  <select 
                    className="form-select"
                    value={newProduct.category}
                    onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
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
                <div className="form-group">
                  <label>Familia / Categoría</label>
                  <select 
                    className="form-select"
                    value={editProductModal.category}
                    onChange={e => setEditProductModal({...editProductModal, category: e.target.value})}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
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
            <div className="modal rounded-3xl shadow-xl border border-slate-100 overflow-hidden" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '95vw' }}>
              <div className="modal-header border-b border-slate-100 bg-slate-50/50 p-5 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-slate-800">{statsModal.product.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 font-semibold flex items-center gap-1">
                    📦 Stock actual: <span className="font-extrabold text-slate-600">{statsModal.product.currentStock || 0} {statsModal.product.unit}</span>
                    {statsModal.product.currentStock <= statsModal.product.minStock && (
                      <span className="inline-block px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-extrabold text-[8px] uppercase tracking-wider ml-1">Stock Bajo</span>
                    )}
                  </p>
                </div>
                <button className="text-slate-400 hover:text-slate-600 transition-colors text-lg font-bold" onClick={() => setStatsModal({ open: false, product: null })}>✕</button>
              </div>
              
              <div className="modal-body p-6 flex flex-col gap-5">
                {/* Period toggle */}
                <div className="flex gap-1.5 bg-slate-100/80 p-1 rounded-xl w-fit">
                  <button 
                    type="button"
                    className={`btn btn-xs py-1 px-3 rounded-lg font-bold transition-all duration-200 ${statsPeriod === 'monthly' ? 'btn-primary shadow-sm' : 'btn-ghost text-slate-500'}`}
                    style={statsPeriod === 'monthly' ? {} : { background: 'transparent', border: 'none' }}
                    onClick={() => setStatsPeriod('monthly')}
                  >
                    📅 Mensual (12m)
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-xs py-1 px-3 rounded-lg font-bold transition-all duration-200 ${statsPeriod === 'yearly' ? 'btn-primary shadow-sm' : 'btn-ghost text-slate-500'}`}
                    style={statsPeriod === 'yearly' ? {} : { background: 'transparent', border: 'none' }}
                    onClick={() => setStatsPeriod('yearly')}
                  >
                    🗓️ Anual
                  </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100 flex flex-col gap-0.5">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Consumido</div>
                    <div className="text-lg font-black text-slate-800">
                      {stats.totalConsumed.toFixed(1)} <span className="text-[9px] font-semibold text-slate-400">{statsModal.product.unit}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100 flex flex-col gap-0.5">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Promedio ({statsPeriod === 'monthly' ? 'Mes' : 'Año'})</div>
                    <div className="text-lg font-black text-slate-800">
                      {(statsPeriod === 'monthly' ? stats.avgMonthly : stats.avgYearly).toFixed(1)} <span className="text-[9px] font-semibold text-slate-400">{statsModal.product.unit}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-100 flex flex-col gap-0.5">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Entregas</div>
                    <div className="text-lg font-black text-slate-800">
                      {stats.totalDeliveries} <span className="text-[9px] font-semibold text-slate-400">veces</span>
                    </div>
                  </div>
                </div>

                {/* Bar Chart */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                    📊 Historial de Consumo
                  </h4>
                  {stats.totalConsumed === 0 ? (
                    <div className="text-xs italic text-slate-400 p-8 text-center bg-slate-50 border border-dashed rounded-2xl">
                      No hay registros de consumo (entregas) para este producto.
                    </div>
                  ) : (
                    <div className="bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
                      <div className="h-32 flex items-end gap-1.5 pb-2 border-b border-slate-200 overflow-x-auto">
                        {chartData.map((item, idx) => {
                          const heightPercent = (item.value / maxVal) * 100;
                          const hasConsumption = item.value > 0;
                          return (
                            <div key={idx} className="flex-1 min-w-[24px] flex flex-col justify-end items-center h-full group relative cursor-pointer">
                              {/* Tooltip */}
                              <div className="absolute bottom-full mb-1.5 bg-slate-800 text-white text-[9px] py-1 px-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-md font-bold">
                                {item.value.toFixed(1)} {statsModal.product.unit} ({item.count} ent.)
                              </div>
                              {/* Bar */}
                              <div 
                                style={{ height: `${Math.max(heightPercent, 3)}%` }} 
                                className={`w-full rounded-t-md transition-all duration-300 ${
                                  hasConsumption ? 'bg-gradient-to-t from-blue-600 to-cyan-400 hover:brightness-105 shadow-sm' : 'bg-slate-200'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {/* Axis Labels */}
                      <div className="flex gap-1.5 mt-2">
                        {chartData.map((item, idx) => (
                          <div key={idx} className="flex-1 text-[8px] font-bold text-slate-400 text-center truncate" title={item.label}>
                            {item.label.split(' ')[0]}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Top Consumers */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    👷 Top Consumidores (Operarios)
                  </h4>
                  {stats.topOperators.length === 0 ? (
                    <div className="text-xs italic text-slate-400 p-4 text-center bg-slate-50 border border-slate-100 rounded-2xl">
                      Ningún operario registrado en el historial de consumos.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 bg-slate-50/40 p-4 border border-slate-100 rounded-2xl">
                      {stats.topOperators.map((op, idx) => {
                        const percent = stats.totalConsumed > 0 ? (op.value / stats.totalConsumed) * 100 : 0;
                        return (
                          <div key={op.uid} className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-semibold text-slate-600">{idx + 1}. {op.name}</span>
                              <span className="font-bold text-slate-800">{op.value.toFixed(1)} {statsModal.product.unit} ({percent.toFixed(0)}%)</span>
                            </div>
                            <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
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
              </div>
              
              <div className="modal-footer border-t border-slate-100 bg-slate-50/50 p-4">
                <button type="button" className="btn btn-secondary rounded-xl font-bold py-1.5 px-4" onClick={() => setStatsModal({ open: false, product: null })}>Cerrar</button>
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
