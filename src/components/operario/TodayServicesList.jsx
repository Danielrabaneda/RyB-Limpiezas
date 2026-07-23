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
  const activeServices = enrichedServices.filter((service) =>
    ["in_progress", "started"].includes(service.status),
  );
  const completedServices = enrichedServices.filter((service) =>
    ["completed", "missed"].includes(service.status),
  );
  const pendingServices = enrichedServices.filter(
    (service) =>
      !["in_progress", "started", "completed", "missed"].includes(
        service.status,
      ),
  );

  const renderCards = (services) => (
    <div className="flex flex-col gap-5">
      {services.map((service) => (
        <TodayServiceCard
          key={service.id}
          svc={service}
          routeOptimized={routeOptimized}
          activeWorkday={activeWorkday}
          userLocation={userLocation}
          setTransferModal={setTransferModal}
          setRescheduleModal={setRescheduleModal}
          navigate={navigate}
        />
      ))}
    </div>
  );

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
        <div className="flex flex-col gap-6">
          {activeServices.length > 0 && (
            <section>
              <div className="text-sm font-bold text-primary mb-3">
                🔄 Servicio en curso
              </div>
              {renderCards(activeServices)}
            </section>
          )}

          {pendingServices.length > 0 && (
            <section>
              <div className="mb-3">
                <div className="text-sm font-bold text-slate-700">
                  Siguiente recorrido
                </div>
                {routeOptimized && (
                  <div
                    className="text-xs mt-1"
                    style={{
                      color: "var(--color-success)",
                      fontWeight: 600,
                    }}
                  >
                    ⚡ Orden calculado por distancia y hora preferida
                  </div>
                )}
              </div>
              {renderCards(pendingServices)}
            </section>
          )}

          {completedServices.length > 0 && (
            <section>
              <div className="text-sm font-bold text-slate-500 mb-3">
                ✅ Finalizados hoy
              </div>
              {renderCards(completedServices)}
            </section>
          )}
        </div>
      )}
    </>
  );
}
