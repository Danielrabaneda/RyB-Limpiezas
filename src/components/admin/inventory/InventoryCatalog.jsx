import React from 'react';
import { CATEGORIES, autoCategorize } from '../../../utils/inventoryCategories';

export default function InventoryCatalog({
  products,
  actionLoading,
  setStockModal,
  setStatsModal,
  setEditProductModal,
  handleDeleteProduct,
  setShowAddProduct
}) {
  return (
    <div className="catalog-section">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className="text-md font-bold">Inventario</h2>
        <button 
          className="btn btn-primary btn-sm" 
          disabled={actionLoading}
          onClick={() => setShowAddProduct(true)}
        >
          + Añadir Producto
        </button>
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
                          disabled={actionLoading}
                          onClick={() => setStockModal({ open: true, type: 'in', product: p, quantity: '', notes: '' })}
                        >
                          ➕ Entrada
                        </button>
                        <button 
                          className="btn btn-sm btn-ghost text-xs" 
                          disabled={actionLoading}
                          onClick={() => setStockModal({ open: true, type: 'adjust', product: p, quantity: stock, notes: '' })}
                        >
                          ⚙️ Ajustar
                        </button>
                        <button 
                          className="btn btn-sm btn-ghost text-xs" 
                          style={{ color: 'var(--color-primary)' }}
                          title="Estadísticas de consumo"
                          disabled={actionLoading}
                          onClick={() => setStatsModal({ open: true, product: p })}
                        >
                          📊 Stats
                        </button>
                        <button 
                          className="btn btn-sm btn-ghost text-xs" 
                          style={{ color: 'var(--color-text-secondary)' }}
                          title="Editar Producto"
                          disabled={actionLoading}
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
                        <button 
                          className="btn btn-ghost btn-xs text-danger ml-2" 
                          disabled={actionLoading}
                          onClick={() => handleDeleteProduct(p.id)}
                        >
                          🗑️
                        </button>
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
  );
}
