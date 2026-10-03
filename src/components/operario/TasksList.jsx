import React from "react";

export default function TasksList({
  tasks,
  taskExecutions,
  service,
  groupedServices = [],
  completedDate,
  canEdit,
  toggleTaskStatus,
}) {
  const scheduledServices = [service, ...groupedServices.filter((s) => s.id !== service?.id)].filter(Boolean);
  const entries = [...taskExecutions];
  for (const scheduled of scheduledServices) {
    if (!entries.some((entry) => entry.communityTaskId === scheduled.communityTaskId)) {
      entries.push({
        id: `planned-${scheduled.id}`,
        communityTaskId: scheduled.communityTaskId,
        taskName: scheduled.taskName,
        status: scheduled.status,
        preview: true,
      });
    }
  }

  return (
    <div className="card">
      <h3 className="card-title mb-4">📋 Tareas</h3>
      {entries.length === 0 ? (
        <p className="text-muted text-sm">No hay tareas configuradas</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((exec) => {
            const task = tasks.find((t) => t.id === exec.communityTaskId);
            const scheduled = scheduledServices.find((s) =>
              s.communityTaskId === exec.communityTaskId,
            );
            const taskName = task?.taskName || exec.taskName || scheduled?.taskName || "Tarea";
            const isUrgent = task?.isUrgent || service?.isUrgent;

            const sName = taskName.toLowerCase();
            const isException =
              sName.includes("escalera") ||
              sName.includes("portal") ||
              sName.includes("garaje") ||
              sName.includes("oficina");
            const isDone = exec.status === "completed" ||
              (isException && scheduled?.status === "completed" && task?.displayMode !== "embedded");
            const showDates = sName.includes("portal") || sName.includes("garaje") || task?.isGarage;
            const plannedDate = formatTaskDate(scheduled?.originalDate || scheduled?.scheduledDate);
            const actualDate = formatTaskDate(exec.completedAt || (isDone ? completedDate : null));
            const editable = canEdit && !exec.preview;


            return (
              <button
                key={exec.id}
                className={`btn w-full flex flex-col items-center justify-center p-4 rounded-xl shadow-sm transition-all ${
                  isDone
                    ? "bg-success text-white border-success"
                    : "bg-white text-dark border border-gray-200 hover:bg-gray-50"
                }`}
                type="button"
                aria-disabled={!editable}
                onClick={() => editable && toggleTaskStatus(exec)}
                style={{ minHeight: "80px" }}
              >
                <span
                  className="font-bold text-lg mb-1"
                  style={{ wordBreak: "break-word", textAlign: "center" }}
                >
                  {isUrgent && !isDone ? "🚨 " : ""}
                  {taskName}
                </span>
                {showDates && (
                  <span className="text-sm font-semibold mb-1">
                    📅 Programada: {plannedDate || "Sin fecha registrada"}
                  </span>
                )}
                {showDates && isDone && (
                  <span className="text-sm mb-1">
                    Realizada: {actualDate || "Sin fecha registrada"}
                  </span>
                )}
                {isDone ? (
                  <span className="text-sm font-semibold opacity-90">
                    ✅ COMPLETADO
                  </span>
                ) : isException ? (
                  <span className="text-xs text-muted font-medium">
                    Automático al finalizar
                  </span>
                ) : (
                  <span className="text-xs text-primary font-bold uppercase tracking-wide">
                    {editable ? "Pulsar para completar" : "Pendiente de realizar"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTaskDate(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
}
