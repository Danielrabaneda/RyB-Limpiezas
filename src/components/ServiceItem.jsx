import React from "react";
import { format } from "date-fns";

export default function ServiceItem({
  service,
  communityName,
  isOp = false,
  onTransfer,
  onReschedule,
  isAdmin,
  allTasks = [],
}) {
  const isCompleted = service.status === "completed";
  const isInProgress =
    service.status === "in_progress" || service.status === "started";

  // Encontrar el nombre de la tarea específica
  const specificTask = allTasks.find((t) => t.id === service.communityTaskId);
  const taskName =
    service.taskName || specificTask?.taskName || "Servicio de Limpieza";
  const isUrgent = service.isUrgent || specificTask?.isUrgent || false;

  const statusClass = isCompleted
    ? "completed"
    : isInProgress
      ? "in-progress"
      : "";

  const getStatusBadge = () => {
    if (isCompleted) {
      return (
        <span className="status-badge status-completed">✅ COMPLETADO</span>
      );
    }
    if (isInProgress) {
      return (
        <span className="status-badge status-in-progress">⏳ EN CURSO</span>
      );
    }
    return <span className="status-badge status-pending">⚪ PENDIENTE</span>;
  };

  const isGarage = service.isGarage || specificTask?.isGarage;

  const getOrigDateStr = (originalDate) => {
    if (!originalDate) return "";
    try {
      const dateObj = originalDate.toDate
        ? originalDate.toDate()
        : new Date(originalDate);
      return format(dateObj, "dd/MM");
    } catch (e) {
      return "";
    }
  };
  const originalDateStr = getOrigDateStr(service.originalDate);

  return (
    <div className={`service-card ${statusClass} ${isGarage ? "garage" : ""}`}>
      <div className="service-card-header">
        <div>
          <div
            className="service-community"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              flexWrap: "wrap",
            }}
          >
            {communityName}
            {service.isTransferred && (
              <span
                style={{
                  fontSize: "9px",
                  background: "#fef2f2",
                  color: "#ef4444",
                  padding: "1px 5px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                  textTransform: "none",
                  letterSpacing: "normal",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                ↪️ Traspasado
                {service.transferValidated === false ? " (Pte.)" : ""}
              </span>
            )}
            {service.isRescheduled && (
              <span
                style={{
                  fontSize: "9px",
                  background: "#faf5ff",
                  color: "#7c3aed",
                  padding: "1px 5px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                  textTransform: "none",
                  letterSpacing: "normal",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                📅 Cambiado{originalDateStr ? ` (era ${originalDateStr})` : ""}
                {service.rescheduleValidated === false ? " (Pte.)" : ""}
              </span>
            )}
          </div>
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
            style={{
              color: "var(--color-primary)",
              border: "1px solid var(--color-primary)",
              fontSize: "10px",
            }}
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
            style={{
              color: "var(--color-primary)",
              border: "1px solid var(--color-primary)",
              fontSize: "10px",
            }}
          >
            📅 Mover día
          </button>
        )}
      </div>

      <div className="service-tasks">
        <span
          className={`service-task-chip flex items-center gap-1 ${isUrgent ? "urgent" : ""}`}
        >
          {isUrgent ? "🚨" : "📋"} {taskName}
        </span>
      </div>
    </div>
  );
}
