import React from 'react';
import { CATEGORIES, autoCategorize } from '../../../utils/inventoryCategories';

export default function InventoryShopping({
  shoppingItems,
  products,
  setShoppingItems,
  handleAddManualItem,
  handleCopyShoppingList,
  handleCompletePurchase,
  actionLoading
}) {
  return (
    <div className="shopping-section">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h2 className="text-md font-bold">Lista de Compra</h2>
          <p className="text-xs text-muted">Productos por debajo del stock mínimo o agregados manualmente</p>
        </div>
        <div className="flex gap-2">
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={actionLoading}
            onClick={handleCopyShoppingList}
          >
            📋 Copiar Lista
          </button>
          <button 
            className="btn btn-primary btn-sm" 
            disabled={actionLoading}
            onClick={handleCompletePurchase}
          >
            {actionLoading ? 'Registrando...' : '📥 Registrar Entrada'}
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
                    disabled={actionLoading}
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
                          disabled={actionLoading}
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
                            disabled={actionLoading}
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
                            disabled={actionLoading}
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
            disabled={actionLoading}
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
  );
}
