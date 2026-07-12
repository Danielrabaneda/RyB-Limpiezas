import React from 'react';
import { CATEGORIES } from '../../../utils/inventoryCategories';

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
        .progress-bar-fill {
          background: linear-gradient(to right, var(--color-primary), var(--color-accent));
        }
      `}</style>
    </>
  );
}
