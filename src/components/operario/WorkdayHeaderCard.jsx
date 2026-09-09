import React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function WorkdayHeaderCard({
  activeWorkday,
  actionLoading,
  firstStartTime,
  allWorkdaysToday,
  allServicesIndividual,
  handleStartWorkday,
  handleEndWorkday,
}) {
  if (allServicesIndividual) return null;

  const accumulatedMinutes = allWorkdaysToday.reduce(
    (acc, curr) => acc + (curr.totalMinutes || 0),
    0,
  );
  const h = Math.floor(accumulatedMinutes / 60);
  const m = accumulatedMinutes % 60;

  const handleClick = !actionLoading
    ? activeWorkday
      ? handleEndWorkday
      : handleStartWorkday
    : undefined;

  return (
    <div
      className="card mb-6 animate-slideUp workday-button-wrapper"
      onClick={handleClick}
      style={{
        background: activeWorkday
          ? "linear-gradient(135deg, #2563eb, #1e40af)"
          : "linear-gradient(135deg, #ffffff, #f1f5f9)",
        padding: "var(--space-6)",
        cursor: actionLoading ? "wait" : "pointer",
        borderRadius: "var(--radius-2xl)",
        textAlign: "center",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: activeWorkday
          ? "0 10px 25px -5px rgba(37, 99, 235, 0.5), inset 0 -4px 0 rgba(0,0,0,0.2)"
          : "0 8px 16px -4px rgba(0, 0, 0, 0.1), inset 0 -4px 0 rgba(0,0,0,0.05)",
        border: activeWorkday ? "none" : "1px solid var(--color-border)",
        transform: actionLoading ? "scale(0.98)" : "scale(1)",
        userSelect: "none",
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <div
          style={{
            fontSize: "3.5rem",
            marginBottom: "var(--space-1)",
            filter: actionLoading
              ? "grayscale(1) opacity(0.5)"
              : "drop-shadow(0 4px 6px rgba(0,0,0,0.1))",
            transition: "transform 0.2s ease",
          }}
          className={activeWorkday && !actionLoading ? "animate-pulse" : ""}
        >
          {actionLoading ? "⏳" : activeWorkday ? "✅" : "🏢"}
        </div>

        <div
          style={{
            fontSize: "var(--font-xl)",
            fontWeight: 900,
            letterSpacing: "0.05em",
            color: activeWorkday ? "#ffffff" : "var(--color-primary)",
          }}
        >
          {actionLoading
            ? "PROCESANDO..."
            : activeWorkday
              ? "JORNADA ACTIVA"
              : "INICIAR JORNADA"}
        </div>

        <div
          style={{
            fontSize: "var(--font-sm)",
            color: activeWorkday
              ? "rgba(255,255,255,0.8)"
              : "var(--color-text-muted)",
          }}
        >
          {activeWorkday
            ? `Empezaste hoy a las ${format(firstStartTime || (activeWorkday.startTime?.toDate ? activeWorkday.startTime.toDate() : new Date()), "HH:mm")}`
            : "Pulsa aquí para empezar a trabajar hoy"}
        </div>

        {accumulatedMinutes > 0 && (
          <div
            style={{
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              marginTop: "4px",
              color: activeWorkday
                ? "rgba(255,255,255,0.9)"
                : "var(--color-accent)",
            }}
          >
            ⏱️ Acumulado hoy: {h}h {m}m
          </div>
        )}

        {activeWorkday && !actionLoading && (
          <div
            className="mt-4 py-2 px-4"
            style={{
              background: "rgba(255,255,255,0.2)",
              borderRadius: "var(--radius-full)",
              color: "white",
              fontSize: "var(--font-xs)",
              fontWeight: 700,
            }}
          >
            PULSA PARA FINALIZAR
          </div>
        )}
      </div>
    </div>
  );
}
