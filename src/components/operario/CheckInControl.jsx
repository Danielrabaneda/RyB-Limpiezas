import React from "react";
import { format } from "date-fns";
import { parseHHMM } from "../../utils/formatTime";

export default function CheckInControl({
  isCheckedIn,
  isCompleted,
  isTitular,
  otherActiveCheckIn,
  suggestedIn,
  entrySource,
  estimatedIn,
  estimatedOut,
  activeWorkday,
  suggestedOut,
  entryDetails,
  handleDismissSuggestion,
  showManualEntryForm,
  setShowManualEntryForm,
  manualEntryTime,
  setManualEntryTime,
  showFullManualForm,
  setShowFullManualForm,
  showManualExitForm,
  setShowManualExitForm,
  manualExitTime,
  setManualExitTime,
  actionLoading,
  geoLoading,
  activeCheckIn,
  clientSignature,
  setClientSignature,
  setShowSignatureModal,
  isInProgress,
  navigate,
  handleCheckIn,
  handleCheckOut,
  handleFullManualSubmit,
  handleForceComplete,
}) {
  // If titular has another active check-in, warn them
  if (otherActiveCheckIn && !isCompleted) {
    return (
      <div
        className="card mb-4"
        style={{
          border: "2px solid var(--color-warning)",
          background: "var(--color-warning-light)",
        }}
      >
        <p className="text-sm font-bold text-warning-dark mb-2">
          ⚠️ Tienes otro servicio en curso
        </p>
        <p className="text-xs mb-3">
          Debes finalizar el servicio activo antes de iniciar uno nuevo.
        </p>
        <button
          className="btn btn-warning btn-sm w-full"
          onClick={() =>
            navigate(
              `/operario/servicio/${otherActiveCheckIn.scheduledServiceId}`,
            )
          }
        >
          Ir al servicio activo
        </button>
      </div>
    );
  }

  // Only display check-in controls if service is not completed OR if already checked in
  const canShowControls = (!isCompleted || isCheckedIn) && !otherActiveCheckIn;
  if (!canShowControls) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* ================= SUGERENCIAS DE FICHAJE ================= */}
      {!isCheckedIn &&
        (suggestedIn || estimatedIn || activeWorkday?.startTime) && (
          <div
            className="card animate-fadeIn"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-light)",
              padding: "var(--space-4)",
            }}
          >
            <h4 className="text-xs font-bold text-slate-700 mb-2">
              💡 Sugerencias de Llegada:
            </h4>
            <div className="flex flex-col gap-2">
              {suggestedIn && (
                <div
                  className="card mb-2"
                  style={{
                    border: "2px dashed var(--color-success)",
                    background: "#f0fdf4",
                    padding: "14px",
                    position: "relative",
                    margin: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleDismissSuggestion}
                    style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      border: "none",
                      background: "transparent",
                      color: "#15803d",
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                    title="Ignorar sugerencia"
                  >
                    ✕
                  </button>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>📍</span>
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          fontWeight: "bold",
                          color: "#166534",
                        }}
                      >
                        Llegada detectada
                      </h4>
                      <p
                        style={{
                          margin: "2px 0 0 0",
                          fontSize: "11px",
                          color: "#15803d",
                          lineHeight: 1.4,
                        }}
                      >
                        Hora: <strong>{format(suggestedIn, "HH:mm")}</strong>
                        {entryDetails?.distance !== undefined &&
                          ` | Distancia: ${Math.round(entryDetails.distance)}m`}
                        {entryDetails?.accuracy !== undefined &&
                          ` | Precisión GPS: ±${Math.round(entryDetails.accuracy)}m`}
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn btn-success flex items-center justify-center font-bold w-full"
                    style={{
                      background: "var(--color-success)",
                      color: "white",
                      border: "none",
                      padding: "8px 12px",
                      fontSize: "0.8rem",
                      borderRadius: "var(--radius-md)",
                    }}
                    onClick={() => handleCheckIn(suggestedIn)}
                    disabled={actionLoading}
                  >
                    Confirmar inicio de servicio a las{" "}
                    {format(suggestedIn, "HH:mm")}
                  </button>
                </div>
              )}
              {estimatedIn &&
                (!suggestedIn ||
                  Math.abs(estimatedIn.getTime() - suggestedIn.getTime()) >
                    60000) && (
                  <button
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{
                      textAlign: "left",
                      background: "#f0f9ff",
                      borderColor: "#bae6fd",
                      color: "#0369a1",
                      padding: "12px 16px",
                      fontSize: "0.85rem",
                    }}
                    onClick={() => handleCheckIn(estimatedIn)}
                    disabled={actionLoading}
                  >
                    <span>
                      🚗 Llegada estimada (viaje):{" "}
                      <strong>{format(estimatedIn, "HH:mm")}</strong>
                    </span>
                    <span>Usar →</span>
                  </button>
                )}
              {activeWorkday?.startTime && !suggestedIn && !estimatedIn && (
                <button
                  className="btn btn-secondary flex items-center justify-between font-bold w-full"
                  style={{
                    textAlign: "left",
                    background: "#faf5ff",
                    borderColor: "#e9d5ff",
                    color: "#7c3aed",
                    padding: "12px 16px",
                    fontSize: "0.85rem",
                  }}
                  onClick={() => {
                    const wdStart = activeWorkday.startTime.toDate
                      ? activeWorkday.startTime.toDate()
                      : new Date(activeWorkday.startTime);
                    handleCheckIn(wdStart);
                  }}
                  disabled={actionLoading}
                >
                  <span>
                    👷 Inicio de jornada:{" "}
                    <strong>
                      {format(
                        activeWorkday.startTime.toDate
                          ? activeWorkday.startTime.toDate()
                          : new Date(activeWorkday.startTime),
                        "HH:mm",
                      )}
                    </strong>
                  </span>
                  <span>Usar →</span>
                </button>
              )}
            </div>
          </div>
        )}

      {isCheckedIn && suggestedOut && (
        <div
          className="exit-suggestion-card animate-fadeIn"
          style={{ position: "relative" }}
        >
          <button
            type="button"
            onClick={handleDismissSuggestion}
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              border: "none",
              background: "transparent",
              color: "#b45309",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "14px",
            }}
            title="Ignorar sugerencia"
          >
            ✕
          </button>
          <div className="exit-suggestion-icon">🏃</div>
          <div
            className="exit-suggestion-content"
            style={{ paddingRight: "20px" }}
          >
            <p className="exit-suggestion-title">¿Finalizar servicio?</p>
            <p className="exit-suggestion-subtitle">
              Se detectó tu salida de la comunidad a las{" "}
              <strong>{format(suggestedOut, "HH:mm")}</strong>.
            </p>
          </div>
          <button
            className="btn-pulse-glow"
            onClick={() => handleCheckOut(suggestedOut)}
            disabled={actionLoading}
          >
            ⏱️ Finalizar a las {format(suggestedOut, "HH:mm")}
          </button>
        </div>
      )}

      {/* ================= FORMULARIO ENTRADA MANUAL ================= */}
      {showManualEntryForm && !isCheckedIn && (
        <div
          className="card animate-fadeIn"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-light)",
            padding: "var(--space-4)",
          }}
        >
          <h4 className="text-xs font-bold mb-3">⏱️ Iniciar con Hora Manual</h4>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold text-slate-600">
              Hora de llegada:
            </span>
            <input
              type="time"
              value={manualEntryTime}
              onChange={(e) => setManualEntryTime(e.target.value)}
              className="form-input"
              style={{
                width: "130px",
                padding: "6px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm flex-1 font-bold"
              onClick={() => {
                const entryDate = parseHHMM(manualEntryTime);
                if (!entryDate) return;
                handleCheckIn(entryDate);
                setShowManualEntryForm(false);
              }}
              disabled={actionLoading}
            >
              Confirmar Entrada
            </button>
            <button
              className="btn btn-secondary btn-sm font-bold"
              onClick={() => setShowManualEntryForm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ================= FORMULARIO COMPLETO RETROACTIVO ================= */}
      {showFullManualForm && !isCheckedIn && (
        <div
          className="card animate-fadeIn"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-light)",
            padding: "var(--space-4)",
          }}
        >
          <h4 className="text-xs font-bold mb-1">
            📝 Registrar Servicio Completo
          </h4>
          <p className="text-[10px] text-muted mb-4">
            Registra entrada y salida de forma retroactiva si no pudiste hacerlo
            al momento.
          </p>

          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600">
                Hora de llegada:
              </span>
              <input
                type="time"
                value={manualEntryTime}
                onChange={(e) => setManualEntryTime(e.target.value)}
                className="form-input"
                style={{
                  width: "130px",
                  padding: "6px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600">
                Hora de salida:
              </span>
              <input
                type="time"
                value={manualExitTime}
                onChange={(e) => setManualExitTime(e.target.value)}
                className="form-input"
                style={{
                  width: "130px",
                  padding: "6px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="btn btn-success btn-sm flex-1 font-bold"
              onClick={handleFullManualSubmit}
              disabled={actionLoading}
            >
              Guardar Registro
            </button>
            <button
              className="btn btn-secondary btn-sm font-bold"
              onClick={() => setShowFullManualForm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ================= FORMULARIO SALIDA MANUAL ================= */}
      {showManualExitForm && isCheckedIn && (
        <div
          className="card animate-fadeIn"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-light)",
            padding: "var(--space-4)",
          }}
        >
          <h4 className="text-xs font-bold mb-3">
            🛑 Finalizar con Hora Manual
          </h4>
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold text-slate-600">
              Hora de salida:
            </span>
            <input
              type="time"
              value={manualExitTime}
              onChange={(e) => setManualExitTime(e.target.value)}
              className="form-input"
              style={{
                width: "130px",
                padding: "6px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm flex-1 font-bold"
              onClick={() => {
                const exitDate = parseHHMM(manualExitTime);
                if (!exitDate) return;

                const checkInTime = activeCheckIn.checkInTime?.toDate
                  ? activeCheckIn.checkInTime.toDate()
                  : new Date(activeCheckIn.checkInTime);

                if (exitDate.getTime() <= checkInTime.getTime()) {
                  alert(
                    "La hora de salida debe ser posterior a la de entrada.",
                  );
                  return;
                }

                handleCheckOut(exitDate);
                setShowManualExitForm(false);
              }}
              disabled={actionLoading}
            >
              Confirmar Salida
            </button>
            <button
              className="btn btn-secondary btn-sm font-bold"
              onClick={() => setShowManualExitForm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ================= BOTONES DE ACCIÓN PRINCIPALES ================= */}
      {!isCheckedIn ? (
        <div className="flex flex-col gap-2 w-full">
          {!showManualEntryForm && !showFullManualForm && (
            <>
              <button
                className="checkin-btn start"
                onClick={() => handleCheckIn()}
                disabled={actionLoading}
              >
                {actionLoading
                  ? "📍 Obteniendo ubicación..."
                  : "📍 Iniciar servicio"}
              </button>

              <div className="flex gap-2 mt-1">
                <button
                  className="btn btn-secondary btn-sm flex-1 font-bold"
                  onClick={() => setShowManualEntryForm(true)}
                >
                  ⏱️ Entrada Manual
                </button>
                <button
                  className="btn btn-secondary btn-sm flex-1 font-bold"
                  onClick={() => setShowFullManualForm(true)}
                >
                  📝 Todo Retroactivo
                </button>
              </div>
            </>
          )}

          {isInProgress && !showManualEntryForm && !showFullManualForm && (
            <button
              className="btn btn-warning w-full flex items-center justify-center gap-2 mt-2"
              onClick={handleForceComplete}
              disabled={actionLoading}
            >
              ⚠️ Forzar Finalización
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full animate-fadeIn">
          {/* Card de firma del cliente */}
          <div
            className="card"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-light)",
              padding: "var(--space-3) var(--space-4)",
              margin: 0,
            }}
          >
            <h4
              style={{
                fontSize: "var(--font-sm)",
                fontWeight: "bold",
                margin: "0 0 var(--space-2) 0",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ✍️ Firma del Cliente (Opcional)
            </h4>
            {clientSignature ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "var(--color-success-light)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-success-light)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <span
                    className="text-xs font-bold text-success"
                    style={{ display: "block" }}
                  >
                    ✅ Firma de conformidad registrada
                  </span>
                  <span
                    className="text-[10px] text-muted"
                    style={{ display: "block" }}
                  >
                    Nombre: {clientSignature.signerName}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setClientSignature(null)}
                  style={{
                    color: "var(--color-danger)",
                    border: "1px solid var(--color-danger)",
                    padding: "2px 6px",
                    fontSize: "10px",
                  }}
                >
                  Borrar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm w-full"
                onClick={() => setShowSignatureModal(true)}
                disabled={actionLoading}
                style={{ fontSize: "0.8rem", padding: "8px 12px" }}
              >
                ✍️ Capturar firma de conformidad
              </button>
            )}
          </div>

          {!showManualExitForm && (
            <>
              <button
                className="checkin-btn stop"
                onClick={() => handleCheckOut()}
                disabled={actionLoading}
              >
                {actionLoading ? "📍 Finalizando..." : "🛑 Finalizar servicio"}
              </button>
              <button
                className="btn btn-secondary btn-sm w-full font-bold mt-1"
                onClick={() => setShowManualExitForm(true)}
              >
                ⏱️ Salida Manual
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
