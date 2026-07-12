import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { groupFlatList } from '../../../utils/dateGrouping';

export default function InventoryOrders({
  orders,
  users,
  products,
  expandedGroups,
  actionLoading,
  toggleGroup,
  handleDeleteOrder,
  handleStatusChange
}) {
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
          <button 
            className="btn btn-ghost btn-xs text-danger" 
            disabled={actionLoading}
            onClick={() => handleDeleteOrder(order.id)}
          >
            🗑️
          </button>
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
            disabled={actionLoading}
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

  return (
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
  );
}
