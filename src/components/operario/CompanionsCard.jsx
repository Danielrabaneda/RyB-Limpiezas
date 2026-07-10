import React from 'react';
import { format } from 'date-fns';

export default function CompanionsCard({
  isTitular,
  activeWorkday,
  service,
  isCompleted,
  operariosMap,
  handleRemoveCompanion
}) {
  if (!isTitular) return null;

  return (
    <div className="card mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="card-title m-0">🤝 Acompañantes</h3>
      </div>
      
      {activeWorkday?.currentCompanionId && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
          <span className="text-blue-600 text-sm">🤝</span>
          <span className="text-[10px] text-blue-700 font-medium">
            Acompañante global configurado: <strong>{operariosMap[activeWorkday.currentCompanionId] || '...'}</strong>
          </span>
        </div>
      )}
      
      {(!service.companionLogs || service.companionLogs.length === 0) ? (
        <p className="text-muted text-sm">No hay acompañantes en este servicio.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {service.companionLogs.map((log, i) => {
            const isActive = !log.leftAt;
            const name = operariosMap[log.userId] || 'Compañero';
            return (
              <div key={i} className="flex justify-between items-center p-3" style={{ background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div className="font-bold text-sm">
                    {name} {isActive && <span className="text-success text-xs">● Activo</span>}
                  </div>
                  <div className="text-xs text-muted">
                    Entrada: {format(new Date(log.joinedAt), 'HH:mm')}
                    {log.leftAt && ` - Salida: ${format(new Date(log.leftAt), 'HH:mm')}`}
                  </div>
                </div>
                {isActive && !isCompleted && log.userId !== activeWorkday?.currentCompanionId && (
                  <button 
                    className="btn btn-ghost btn-xs text-danger"
                    onClick={() => handleRemoveCompanion(log.userId)}
                    style={{ border: '1px solid var(--color-danger)' }}
                  >
                    Quitar
                  </button>
                )}
                {isActive && log.userId === activeWorkday?.currentCompanionId && (
                  <span className="text-[10px] font-bold text-blue-500 uppercase">Fijo</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
