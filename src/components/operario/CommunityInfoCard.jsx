import React from "react";

export default function CommunityInfoCard({
  community,
  service,
  isCompanion,
  isCompleted,
  isCheckedIn,
  isTitular,
  setTransferModalOpen,
  setRescheduleModalOpen,
  distanceInfo,
  gpsSent,
  sendingGPS,
  sendGPSLocation,
}) {
  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 style={{ fontSize: "var(--font-xl)", fontWeight: 800 }}>
            {community?.name}
          </h2>
          <p className="text-sm text-muted">{community?.address}</p>
          {isCompanion && (
            <span
              className="badge badge-info mt-2"
              style={{ display: "inline-block" }}
            >
              🤝 Modo Acompañante
            </span>
          )}
          {community?.preferredTime && (
            <span
              className="badge mt-2"
              style={{
                display: "inline-block",
                background: "#fee2e2",
                color: "#dc2626",
                border: "1px solid currentColor",
                marginLeft: isCompanion ? "6px" : "0px",
              }}
            >
              🕐 Hora preferida: {community.preferredTime}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`badge ${
              service.status === "completed"
                ? "badge-success"
                : service.status === "in_progress"
                  ? "badge-info"
                  : "badge-warning"
            }`}
          >
            {service.status === "completed"
              ? "✅ Completado"
              : service.status === "in_progress"
                ? "🔄 En curso"
                : "⏳ Pendiente"}
          </span>
          {!isCompleted && !isCheckedIn && isTitular && (
            <div className="flex gap-2">
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setTransferModalOpen(true)}
                style={{
                  color: "var(--color-warning)",
                  padding: "4px 8px",
                  border: "1px solid currentColor",
                }}
              >
                🔄 Traspasar
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setRescheduleModalOpen(true)}
                style={{
                  color: "var(--color-primary)",
                  padding: "4px 8px",
                  border: "1px solid currentColor",
                }}
              >
                📅 Mover día
              </button>
            </div>
          )}
        </div>
      </div>
      {distanceInfo && (
        <div
          className={`mt-2 text-xs`}
          style={{
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: distanceInfo.withinRange
              ? "var(--color-success-light)"
              : "var(--color-warning-light)",
          }}
        >
          📍 Distancia: {distanceInfo.distance}m{" "}
          {distanceInfo.withinRange ? "✅" : "⚠️ Fuera de rango"}
        </div>
      )}
      {/* Botón para enviar ubicación GPS al administrador */}
      {!isCompleted && community && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {gpsSent ? (
            <div
              className="text-xs"
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-success-light)",
                textAlign: "center",
              }}
            >
              ✅ Ubicación GPS enviada al administrador
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm w-full"
              disabled={sendingGPS}
              onClick={sendGPSLocation}
              style={{ fontSize: "0.8rem" }}
            >
              {sendingGPS
                ? "⏳ Capturando GPS..."
                : "📲 Enviar mi ubicación GPS al admin"}
            </button>
          )}
          <p
            className="text-xs text-muted mt-1"
            style={{ textAlign: "center" }}
          >
            Envía tu posición exacta para mejorar la precisión de esta comunidad
          </p>
        </div>
      )}
    </div>
  );
}
