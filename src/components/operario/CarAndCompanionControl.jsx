import React from "react";
import { format } from "date-fns";

export default function CarAndCompanionControl({
  activeWorkday,
  companionInfo,
  allOperarios,
  actionLoading,
  handleToggleCar,
  setCompanionSelectorOpen,
  setMileageModalOpen,
}) {
  if (!activeWorkday) return null;

  const isCompanionDriving =
    companionInfo.carActive && !activeWorkday.carActive;

  return (
    <div
      className="mb-6 animate-fadeIn"
      style={{ display: "flex", gap: "var(--space-3)" }}
    >
      {/* BOTÓN ACOMPAÑANTE */}
      <button
        className="btn flex flex-col items-center justify-center gap-1"
        onClick={() => setCompanionSelectorOpen(true)}
        style={{
          flex: 1,
          background: activeWorkday.currentCompanionId
            ? "var(--color-bg-subtle)"
            : "white",
          border: "2px dashed var(--color-primary)",
          borderRadius: "var(--radius-xl)",
          color: "var(--color-primary)",
          minHeight: "80px",
          padding: "var(--space-3)",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        }}
      >
        <span style={{ fontSize: "1.2rem" }}>👥</span>
        <span
          style={{
            fontWeight: 700,
            fontSize: "var(--font-xs)",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {activeWorkday.currentCompanionId
            ? `CON: ${allOperarios.find((o) => o.uid === activeWorkday.currentCompanionId)?.name?.split(" ")[0] || "..."}`
            : "¿COMPAÑERO?"}
        </span>
        <span style={{ fontSize: "9px", opacity: 0.6, textAlign: "center" }}>
          {activeWorkday.currentCompanionId
            ? "Cambiar/Quitar"
            : "Toca para elegir"}
        </span>
      </button>

      {/* BOTÓN COCHE */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <button
          className="btn flex flex-col items-center justify-center gap-1"
          onClick={handleToggleCar}
          disabled={actionLoading || isCompanionDriving}
          style={{
            width: "100%",
            background: activeWorkday.carActive
              ? "linear-gradient(135deg, #2563eb, #1e40af)"
              : isCompanionDriving
                ? "#f8fafc"
                : "white",
            border: activeWorkday.carActive
              ? "2px solid #2563eb"
              : isCompanionDriving
                ? "2px solid #e2e8f0"
                : "2px dashed #64748b",
            borderRadius: "var(--radius-xl)",
            color: activeWorkday.carActive
              ? "#ffffff"
              : isCompanionDriving
                ? "#94a3b8"
                : "#64748b",
            minHeight: "80px",
            padding: "var(--space-3)",
            boxShadow: activeWorkday.carActive
              ? "0 4px 12px -2px rgba(37, 99, 235, 0.5)"
              : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            transition: "all 0.3s ease",
            opacity: isCompanionDriving ? 0.85 : 1,
            cursor: isCompanionDriving ? "not-allowed" : "pointer",
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>
            {activeWorkday.carActive
              ? "🚗"
              : isCompanionDriving
                ? "🚫🚗"
                : "🚶"}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: "var(--font-xs)",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            {activeWorkday.carActive
              ? "COCHE ACTIVO"
              : isCompanionDriving
                ? `COCHE CON ${companionInfo.name.toUpperCase()}`
                : "¿VAS EN COCHE?"}
          </span>
          <span
            style={{
              fontSize: "9px",
              opacity: activeWorkday.carActive ? 0.8 : 0.6,
              textAlign: "center",
            }}
          >
            {activeWorkday.carActive
              ? `Desde ${activeWorkday.carActiveSince?.toDate ? format(activeWorkday.carActiveSince.toDate(), "HH:mm") : "..."}`
              : isCompanionDriving
                ? "Bloqueado para evitar duplicados"
                : "GPS Automático"}
          </span>
        </button>

        <button
          className="btn btn-ghost btn-xs"
          onClick={() => setMileageModalOpen(true)}
          style={{
            fontSize: "10px",
            color: "var(--color-primary)",
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          Ingresar km manualmente
        </button>
      </div>
    </div>
  );
}
