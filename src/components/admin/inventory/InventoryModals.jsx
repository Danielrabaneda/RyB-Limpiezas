import React from 'react';
import { CATEGORIES } from '../../../utils/inventoryCategories';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

function ModalChartTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)',
      borderRadius: 12, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', pointerEvents: 'none'
    }}>
      <p style={{ color: '#94a3b8', fontSize: 10, margin: 0, fontWeight: 600 }}>{data.label}</p>
      <p style={{ color: '#fff', fontSize: 14, margin: '2px 0', fontWeight: 800 }}>
        {data.value.toFixed(1)} <span style={{ fontSize: 10, color: '#94a3b8' }}>{unit}</span>
      </p>
      <p style={{ color: '#64748b', fontSize: 9, margin: 0 }}>{data.count} entregas</p>
    </div>
  );
}

function ModalOperatorTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)',
      borderRadius: 12, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', pointerEvents: 'none'
    }}>
      <p style={{ color: '#e2e8f0', fontSize: 11, margin: 0, fontWeight: 700 }}>{data.name}</p>
      <p style={{ color: '#fff', fontSize: 14, margin: '2px 0 0', fontWeight: 800 }}>
        {data.value.toFixed(1)} <span style={{ fontSize: 10, color: '#94a3b8' }}>{unit}</span>
      </p>
    </div>
  );
}


export default function InventoryModals({
  showAddProduct,
  setShowAddProduct,
  newProduct,
  setNewProduct,
  handleAddProduct,
  editProductModal,
  setEditProductModal,
  handleEditProductSubmit,
  stockModal,
  setStockModal,
  handleStockAction,
  statsModal,
  setStatsModal,
  statsPeriod,
  setStatsPeriod,
  getStatsData,
  actionLoading
}) {
  return (
    <>
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
                    disabled={actionLoading}
                    placeholder="Ej: Lejía Estrella 5L"
                    value={newProduct.name}
                    onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Unidad de medida</label>
                  <select 
                    className="form-select"
                    disabled={actionLoading}
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
                    disabled={actionLoading}
                    placeholder="Ej: 5"
                    value={newProduct.minStock}
                    onChange={e => setNewProduct({...newProduct, minStock: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Familia / Categoría</label>
                  <select 
                    className="form-select"
                    disabled={actionLoading}
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
                <button type="button" className="btn btn-secondary" disabled={actionLoading} onClick={() => setShowAddProduct(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>Guardar Producto</button>
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
                    disabled={actionLoading}
                    value={editProductModal.name}
                    onChange={e => setEditProductModal({...editProductModal, name: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Unidad de medida</label>
                  <select 
                    className="form-select"
                    disabled={actionLoading}
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
                    disabled={actionLoading}
                    value={editProductModal.minStock}
                    onChange={e => setEditProductModal({...editProductModal, minStock: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Familia / Categoría</label>
                  <select 
                    className="form-select"
                    disabled={actionLoading}
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
                <button type="button" className="btn btn-secondary" disabled={actionLoading} onClick={() => setEditProductModal({ open: false, product: null, name: '', unit: 'unidad', minStock: '5' })}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>Guardar Cambios</button>
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
                    disabled={actionLoading}
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
                    disabled={actionLoading}
                    placeholder={stockModal.type === 'in' ? "Nº Albarán, proveedor..." : "Motivo del descuadre..."}
                    value={stockModal.notes}
                    onChange={e => setStockModal({...stockModal, notes: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" disabled={actionLoading} onClick={() => setStockModal({...stockModal, open: false})}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>Guardar</button>
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
                      <div style={{ width: '100%', height: 130 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 600 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={val => val.split(' ')[0]}
                            />
                            <YAxis
                              tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 600 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip content={<ModalChartTooltip unit={statsModal.product.unit} />} cursor={{ fill: 'rgba(59, 130, 246, 0.04)' }} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={500}>
                              {chartData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.value > 0 ? 'url(#modalBarGradient)' : '#e2e8f0'}
                                />
                              ))}
                            </Bar>
                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="modalBarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#06b6d4" />
                              </linearGradient>
                            </defs>
                          </BarChart>
                        </ResponsiveContainer>
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
                      <div style={{ width: '100%', height: Math.max(stats.topOperators.length * 32, 100) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={stats.topOperators}
                            layout="vertical"
                            margin={{ top: 0, right: 35, left: -25, bottom: 0 }}
                          >
                            <XAxis type="number" hide />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fontSize: 9, fill: '#475569', fontWeight: 600 }}
                              axisLine={false}
                              tickLine={false}
                              width={80}
                            />
                            <Tooltip content={<ModalOperatorTooltip unit={statsModal.product.unit} />} cursor={{ fill: 'rgba(59, 130, 246, 0.04)' }} />
                            <Bar
                              dataKey="value"
                              radius={[0, 4, 4, 0]}
                              animationDuration={500}
                              label={{ position: 'right', fontSize: 9, fontWeight: 700, fill: '#475569', formatter: val => `${val.toFixed(1)} ${statsModal.product.unit}` }}
                            >
                              {stats.topOperators.map((entry, index) => {
                                const colors = ['#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa', '#818cf8'];
                                return <Cell key={`cell-op-${index}`} fill={colors[index % colors.length]} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
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
        .progress-bar-fill {
          background: linear-gradient(to right, var(--color-primary), var(--color-accent));
        }
      `}</style>
    </>
  );
}
