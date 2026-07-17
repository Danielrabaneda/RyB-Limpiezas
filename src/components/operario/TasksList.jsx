import React from 'react';

export default function TasksList({
  showTasks,
  tasks,
  taskExecutions,
  service,
  canEdit,
  toggleTaskStatus
}) {
  return (
    <div className="card">
      <h3 className="card-title mb-4">📋 Tareas</h3>
      {!showTasks && tasks.length > 0 ? (
        <p className="text-muted text-sm">Ficha entrada para ver las tareas</p>
      ) : taskExecutions.length === 0 ? (
        <p className="text-muted text-sm">No hay tareas configuradas</p>
      ) : (
        <div className="flex flex-col gap-3">
          {taskExecutions.map(exec => {
            const task = tasks.find(t => t.id === exec.communityTaskId);
            const isDone = exec.status === 'completed';
            const isUrgent = task?.isUrgent || service?.isUrgent;
            
            const sName = (task?.taskName || '').toLowerCase();
            const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje') || sName.includes('oficina');

            return (
              <button
                key={exec.id}
                className={`btn w-full flex flex-col items-center justify-center p-4 rounded-xl shadow-sm transition-all ${
                  isDone 
                    ? 'bg-success text-white border-success' 
                    : 'bg-white text-dark border border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => canEdit && toggleTaskStatus(exec)}
                style={{ minHeight: '80px' }}
              >
                <span className="font-bold text-lg mb-1" style={{ wordBreak: 'break-word', textAlign: 'center' }}>
                  {isUrgent && !isDone ? '🚨 ' : ''}{task?.taskName || 'Tarea'}
                </span>
                {isDone ? (
                  <span className="text-sm font-semibold opacity-90">✅ COMPLETADO</span>
                ) : isException ? (
                  <span className="text-xs text-muted font-medium">Automático al finalizar</span>
                ) : (
                  <span className="text-xs text-primary font-bold uppercase tracking-wide">Pulsar para completar</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
