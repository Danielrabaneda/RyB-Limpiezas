import React from "react";
import TodayServiceCard from "./TodayServiceCard";

export default function TodayServicesList({
  enrichedServices,
  routeOptimized,
  loading,
  refreshing,
  activeWorkday,
  userLocation,
  handleRefresh,
  setTransferModal,
  setRescheduleModal,
  navigate,
}) {
  return (
    <>
      <div className="flex flex-col gap-1 mb-4">
        <div className="flex justify-between items-center">
          <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 700 }}>
            Servicios de hoy
          </h3>
          <button
            className="btn btn-ghost btn-xs flex items-center gap-1"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            style={{ color: "var(--color-primary)", fontWeight: 600 }}
          >
            {refreshing ? "Actualizando..." : "🔄 Actualizar"}
          </button>
        </div>
        {routeOptimized && (
          <div
            className="text-xs"
            style={{
              color: "var(--color-success)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontWeight: 600,
            }}
          >
            <span>⚡ Recorrido optimizado por distancia y horario</span>
          </div>
        )}
      </div>

      {enrichedServices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <h3 className="empty-state-title">Sin servicios hoy</h3>
          <p className="text-muted text-sm">
            No tienes servicios programados para hoy
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {enrichedServices.map((svc, index) => (
            <TodayServiceCard
              key={svc.id}
              svc={svc}
              index={index}
              routeOptimized={routeOptimized}
              activeWorkday={activeWorkday}
              userLocation={userLocation}
              setTransferModal={setTransferModal}
              setRescheduleModal={setRescheduleModal}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </>
  );
}
