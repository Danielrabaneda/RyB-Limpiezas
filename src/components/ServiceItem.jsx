import React from 'react';

export default function ServiceItem({ service, communityName, isOp = false, onTransfer, onReschedule, isAdmin, allTasks = [] }) {
  const isCompleted = service.status === 'completed';
  const isInProgress = service.status === 'in_progress' || service.status === 'started';
  
  // Encontrar el nombre de la tarea específica
  const specificTask = allTasks.find(t => t.id === service.communityTaskId);
  const taskName = service.taskName || specificTask?.taskName || 'Servicio de Limpieza';

  const statusClass = isCompleted ? 'completed' : isInProgress ? 'in-progress' : '';

  const getStatusBadge = () => {
    if (isCompleted) {
      return <span className="status-badge status-completed">✅ COMPLETADO</span>;
    }
    if (isInProgress) {
      return <span className="status-badge status-in-progress">⏳ EN CURSO</span>;
    }
    return <span className="status-badge status-pending">⚪ PENDIENTE</span>;
  };

  const isGarage = service.isGarage || specificTask?.isGarage;

  return (
    <div className={`service-card ${statusClass} ${isGarage ? 'garage' : ''}`}>
      <div className="service-card-header">
        <div>
          <div className="service-community">{communityName}</div>
          {service.isTransferred && (
            <div className="text-[10px] text-amber-600 font-bold mt-1 uppercase tracking-wider">
              🔄 Traspasado de usuario
            </div>
          )}
          {service.rescheduleValidated === false && (
            <div className="text-[10px] text-purple-600 font-bold mt-1 uppercase tracking-wider">
              📅 Cambio de día pte. validación
            </div>
          )}
        </div>
        {getStatusBadge()}
      </div>

      <div className="flex gap-2 mb-2">
        {(!isCompleted || isAdmin) && (
          <button 
            className="btn btn-ghost btn-xs flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onTransfer();
            }}
            style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontSize: '10px' }}
          >
            🔄 Traspasar
          </button>
        )}
        {(!isCompleted || isAdmin) && (
          <button 
            className="btn btn-ghost btn-xs flex-1"
            onClick={(e) => {
              e.stopPropagation();
              if (onReschedule) onReschedule();
            }}
            style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', fontSize: '10px' }}
          >
            📅 Mover día
          </button>
        )}
      </div>

      <div className="service-tasks">
        <span className="service-task-chip flex items-center gap-1">📋 {taskName}</span>
      </div>
    </div>
  );
}
