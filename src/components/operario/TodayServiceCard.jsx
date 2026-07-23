import React from "react";
import { format } from "date-fns";
import { getDistance } from "../../utils/geolocation";

export default function TodayServiceCard({
  svc,
  routeOptimized,
  activeWorkday,
  userLocation,
  setTransferModal,
  setRescheduleModal,
  navigate,
}) {
  const hasIndividualTime = svc.community?.individualTimeTracking;
  const canAccess = activeWorkday || hasIndividualTime;
  const statusClass =
    svc.status === "completed"
      ? "completed"
      : svc.status === "in_progress" || svc.status === "started"
        ? "in-progress"
        : "";
  const garageClass = svc.isGarage ? "garage" : "";

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

  function getStatusBadge(status) {
    switch (status) {
      case "completed":
        return <span className="badge badge-success">✅ Completado</span>;
      case "in_progress":
      case "started":
        return <span className="badge badge-info">🔄 En curso</span>;
      case "missed":
        return <span className="badge badge-danger">❌ No realizado</span>;
      default:
        return <span className="badge badge-warning">⏳ Pendiente</span>;
    }
  }

  return (
    <div
      className={`service-card ${statusClass} ${garageClass} ${!canAccess ? "opacity-50 grayscale" : ""}`}
      onClick={() => {
        if (!canAccess) {
          alert(
            "Debes iniciar tu jornada primero para acceder a los servicios.",
          );
          return;
        }
        navigate(`/operario/servicio/${svc.id}`);
      }}
      style={{
        cursor: canAccess ? "pointer" : "not-allowed",
      }}
    >
      <div className="service-card-header">
        <div>
          <div
            className="service-community"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            {routeOptimized && Number.isInteger(svc.routePosition) && (
              <span
                style={{
                  fontSize: "10px",
                  background: "var(--color-primary)",
                  color: "#ffffff",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                }}
              >
                #{svc.routePosition}
              </span>
            )}
            {svc.community?.name || "Comunidad"}
            {svc.routeWarning && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#fff7ed",
                  color: "#c2410c",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                }}
              >
                ⚠️ {svc.routeWarning}
              </span>
            )}
            {svc.community?.preferredTime && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#fee2e2",
                  color: "#dc2626",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                }}
              >
                🕐 Hora pref: {svc.community.preferredTime}
              </span>
            )}
            {hasIndividualTime && (
              <span
                style={{
                  fontSize: "10px",
                  background: "var(--color-info-light)",
                  color: "var(--color-info)",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                }}
              >
                ⏱️ Indep.
              </span>
            )}
            {svc.flexibleWeek && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#fef3c7",
                  color: "#b45309",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                }}
              >
                📅 Sem. Flexible
              </span>
            )}
            {svc.isCompanion && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#e0f2fe",
                  color: "#0369a1",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                }}
              >
                🤝 Apoyo prestado
              </span>
            )}
            {svc.isTransferred && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#fef2f2",
                  color: "#ef4444",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                ↪️ Traspasado{svc.transferValidated === false ? " (Pte.)" : ""}
              </span>
            )}
            {svc.isRescheduled && (
              <span
                style={{
                  fontSize: "10px",
                  background: "#faf5ff",
                  color: "#7c3aed",
                  padding: "2px 6px",
                  borderRadius: "12px",
                  border: "1px solid currentColor",
                  fontWeight: "bold",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                📅 Cambiado
                {getOrigDateStr(svc.originalDate)
                  ? ` (era ${getOrigDateStr(svc.originalDate)})`
                  : ""}
                {svc.rescheduleValidated === false ? " (Pte.)" : ""}
              </span>
            )}
          </div>
          <div
            className="service-address"
            style={{ display: "flex", flexDirection: "column", gap: "2px" }}
          >
            <span>{svc.community?.address || ""}</span>
            {userLocation &&
              svc.community?.location &&
              svc.status !== "completed" &&
              svc.status !== "missed" && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "bold",
                    color:
                      getDistance(
                        userLocation.lat,
                        userLocation.lng,
                        svc.community.location._lat ||
                          svc.community.location.latitude,
                        svc.community.location._long ||
                          svc.community.location.longitude,
                      ) <= 500
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                  }}
                >
                  📍 Distancia:{" "}
                  {Math.round(
                    getDistance(
                      userLocation.lat,
                      userLocation.lng,
                      svc.community.location._lat ||
                        svc.community.location.latitude,
                      svc.community.location._long ||
                        svc.community.location.longitude,
                    ),
                  )}
                  m
                </span>
              )}
          </div>
        </div>
        {getStatusBadge(svc.status)}
      </div>

      {!svc.isCompanion &&
        !["completed", "in_progress"].includes(svc.status) && (
          <div className="flex gap-2 w-full mt-1 mb-2">
            <button
              className="btn btn-ghost btn-xs flex-1"
              onClick={(e) => {
                e.stopPropagation();
                setTransferModal({ open: true, type: "single", service: svc });
              }}
              style={{
                color: "var(--color-warning)",
                border: "1px solid var(--color-warning)",
                fontSize: "11px",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              🔄 Traspasar
            </button>
            <button
              className="btn btn-ghost btn-xs flex-1"
              onClick={(e) => {
                e.stopPropagation();
                setRescheduleModal({
                  open: true,
                  serviceId: svc.id,
                  currentDate: svc.scheduledDate,
                });
              }}
              style={{
                color: "var(--color-primary)",
                border: "1px solid var(--color-primary)",
                fontSize: "11px",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              📅 Mover día
            </button>
          </div>
        )}

      <div
        className="service-tasks"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "nowrap",
          gap: "8px",
        }}
      >
        <div
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}
        >
          {svc.tasks?.map((t) => {
            let chipClass = "service-task-chip";
            if (t.status === "completed") {
              chipClass += " completed";
            } else if (t.status === "missed") {
              chipClass += " missed";
            } else if (t.isUrgent) {
              chipClass += " urgent";
            }

            return (
              <span key={t.id} className={chipClass}>
                {t.status === "completed"
                  ? "✓ "
                  : t.status === "missed"
                    ? "✕ "
                    : t.isUrgent
                      ? "🚨 "
                      : ""}
                {t.taskName}
              </span>
            );
          })}
        </div>
        {(!svc.status || svc.status === "pending") && (
          <button
            className="btn btn-primary"
            style={{
              borderRadius: "9999px",
              padding: "6px 18px",
              fontSize: "13px",
              fontWeight: "bold",
              boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.3)",
              whiteSpace: "nowrap",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!canAccess) {
                alert(
                  "Debes iniciar tu jornada primero para acceder a este servicio.",
                );
                return;
              }
              navigate(`/operario/servicio/${svc.id}`);
            }}
          >
            Inicio
          </button>
        )}
        {svc.status === "in_progress" && (
          <button
            className="btn btn-info"
            style={{
              borderRadius: "9999px",
              padding: "6px 18px",
              fontSize: "13px",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/operario/servicio/${svc.id}`);
            }}
          >
            Continuar
          </button>
        )}
      </div>
      {!canAccess && (
        <div className="text-xs font-bold text-danger mt-3">
          ⚠️ Jornada no iniciada
        </div>
      )}
    </div>
  );
}
