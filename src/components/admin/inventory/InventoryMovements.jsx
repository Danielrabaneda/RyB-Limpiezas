import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { groupFlatList } from '../../../utils/dateGrouping';

export default function InventoryMovements({
  movements,
  users,
  expandedGroups,
  toggleGroup
}) {
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
  );
}
