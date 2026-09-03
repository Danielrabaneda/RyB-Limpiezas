import React from "react";
import { format } from "date-fns";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebase";

export default function CommunityDetailPanel({
  selectedCommunity,
  setSelectedCommunity,
  setCommunities,
  openEditModal,
  handleDeleteCommunity,
  administrators,
  communityTasks,
  openCreateTaskModal,
  openEditTaskModal,
  handleRemoveTask,
  setReassignModal,
  operarios,
  assignments,
  setShowAssignModal,
  handleRemoveAssignment,
  communityDocs,
  setShowDocModal,
  handleDeleteDoc,
  handleTogglePortal,
  handleRegenerateToken,
  actionLoading,
  FREQ_LABELS,
  MONTHS,
  WEEKDAYS,
  safeFormat,
}) {
  const handlePrintQR = () => {
    const windowUrl = "about:blank";
    const uniqueName = new Date().getTime();
    const printWindow = window.open(
      windowUrl,
      uniqueName,
      "left=5000,top=5000,width=0,height=0",
    );
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Cartel QR - ${selectedCommunity.name}</title>
          <style>
            body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: system-ui, sans-serif; background: white; }
            .poster { width: 340px; border: 4px solid #1e3a8a; border-radius: 16px; padding: 32px; display: flex; flex-direction: column; align-items: center; text-align: center; box-sizing: border-box; }
            .title { font-size: 24px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px 0; }
            .subtitle { font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 24px 0; }
            .qr-img { width: 200px; height: 200px; border: 1px solid #cbd5e1; padding: 8px; background: white; }
            .comm-name { font-size: 16px; font-weight: bold; color: #0f172a; margin: 24px 0 8px 0; }
            .instructions { font-size: 11px; color: #475569; line-height: 1.5; margin: 0; max-width: 280px; }
            .footer { font-size: 8px; color: #94a3b8; margin-top: 32px; text-transform: uppercase; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="poster">
            <div class="title">RyB Limpiezas</div>
            <div class="subtitle">Control de Calidad Digital</div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/portal/${selectedCommunity.portalToken}`)}" class="qr-img" />
            <div class="comm-name">${selectedCommunity.name}</div>
            <p class="instructions">Escanee este código con su móvil para consultar el histórico de visitas, tareas y fotos de evidencias de los últimos 30 días de este edificio.</p>
            <div class="footer">Sistema LimpiaGest - RyB Limpiezas</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Info */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🏢 {selectedCommunity.name}</h3>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => openEditModal(selectedCommunity)}
            >
              ✏️ Editar
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleDeleteCommunity(selectedCommunity.id)}
            >
              🗑️
            </button>
          </div>
        </div>
        <div className="grid grid-2 gap-4">
          <div>
            <span className="text-xs text-muted">Dirección</span>
            <p className="font-medium text-sm">{selectedCommunity.address}</p>
          </div>
          <div>
            <span className="text-xs text-muted">Tipo</span>
            <p className="font-medium text-sm">{selectedCommunity.type}</p>
          </div>
          <div>
            <span className="text-xs text-muted">Contacto</span>
            <p className="font-medium text-sm">
              {selectedCommunity.contactPerson || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Teléfono</span>
            <p className="font-medium text-sm">
              {selectedCommunity.contactPhone || "—"}
            </p>
          </div>
          {selectedCommunity.preferredTime && (
            <div>
              <span className="text-xs text-muted">Hora preferida</span>
              <p className="font-medium text-sm">
                🕐 {selectedCommunity.preferredTime}
              </p>
            </div>
          )}
          <div>
            <span className="text-xs text-muted">CIF/NIF Comunidad</span>
            <p className="font-medium text-sm">
              {selectedCommunity.billingCif || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Mensualidad Base</span>
            <p className="font-medium text-sm font-bold text-slate-800">
              {selectedCommunity.basePrice || 0} €
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Email Facturación</span>
            <p className="font-medium text-sm">
              {selectedCommunity.billingEmail || "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Método Pago</span>
            <p className="font-medium text-sm text-capitalize">
              {selectedCommunity.paymentMethod || "transferencia"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Administrador de Fincas</span>
            <p className="font-medium text-sm">
              {(() => {
                const admin = administrators.find(
                  (a) => a.id === selectedCommunity.administratorId,
                );
                return admin
                  ? `💼 ${admin.name}`
                  : "Directo (Sin administrador)";
              })()}
            </p>
          </div>
          {selectedCommunity.paymentMethod === "recibo" && (
            <>
              <div>
                <span className="text-xs text-muted">IBAN Domiciliación</span>
                <p
                  className="font-medium text-sm"
                  style={{ fontFamily: "monospace" }}
                >
                  {selectedCommunity.billingIban || "⚠️ Sin configurar"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted">Ref. Mandato SEPA</span>
                <p className="font-medium text-sm">
                  {selectedCommunity.billingMandateRef || "⚠️ Sin configurar"}
                </p>
              </div>
              {selectedCommunity.billingMandateDate && (
                <div>
                  <span className="text-xs text-muted">Fecha Mandato</span>
                  <p className="font-medium text-sm">
                    {selectedCommunity.billingMandateDate}
                  </p>
                </div>
              )}
            </>
          )}
          {selectedCommunity.billingAddress && (
            <div style={{ gridColumn: "span 2" }}>
              <span className="text-xs text-muted">Dirección Facturación</span>
              <p className="font-medium text-sm">
                {selectedCommunity.billingAddress}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tasks */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">📋 Tareas configuradas</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={openCreateTaskModal}
          >
            ➕ Añadir
          </button>
        </div>
        {communityTasks.length === 0 ? (
          <p className="text-muted text-sm">No hay tareas configuradas</p>
        ) : (
          <div className="flex flex-col gap-2">
            {communityTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between"
                style={{
                  padding: "var(--space-3)",
                  background: "var(--color-bg)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: task.printColor || "#ef4444",
                        display: "inline-block",
                        flexShrink: 0,
                        border: "1px solid rgba(0,0,0,0.15)",
                      }}
                    ></span>
                    {task.taskName}
                    {task.isUrgent && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200 uppercase tracking-wider animate-pulse">
                        🚨 Urgente
                      </span>
                    )}
                    {task.assignedUserId && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium border border-purple-200">
                        👤{" "}
                        {operarios.find((o) => o.uid === task.assignedUserId)
                          ?.name || "Asignado"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {FREQ_LABELS[task.frequencyType] || task.frequencyType}
                    {task.frequencyType === "once" &&
                      task.punctualDate &&
                      ` — ${safeFormat(task.punctualDate, "dd/MM/yyyy")}`}
                    {task.frequencyType === "range" &&
                      task.startDate &&
                      ` — Desde ${safeFormat(task.startDate, "dd/MM/yyyy")} hasta ${safeFormat(task.endDate, "dd/MM/yyyy")}`}
                    {task.weekOfMonth &&
                      ` — ${task.weekOfMonth}ª semana del mes`}
                    {task.flexibleWeek && ` — (Semana Flexible)`}
                    {task.monthOfYear !== undefined &&
                      task.monthOfYear !== null &&
                      ` — Solo en ${MONTHS.find((m) => m.val === task.monthOfYear)?.label}`}
                    {task.weekDays?.length > 0 &&
                      !task.flexibleWeek &&
                      ` — ${task.weekDays.map((d) => WEEKDAYS.find((w) => w.val === d)?.label).join(", ")}`}
                    {task.monthDays?.length > 0 &&
                      !task.flexibleWeek &&
                      ` — Días: ${task.monthDays.join(", ")}`}
                    {task.startDate &&
                      task.frequencyType !== "range" &&
                      task.frequencyType !== "once" &&
                      ` (Inicia: ${safeFormat(task.startDate, "MM/yyyy")})`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Reasignar permanentemente"
                    onClick={() => setReassignModal({ open: true, task })}
                    style={{ fontSize: "0.8rem" }}
                  >
                    🔁
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Editar tarea"
                    onClick={() => openEditTaskModal(task)}
                    style={{ fontSize: "0.8rem" }}
                  >
                    ✏️
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Eliminar tarea"
                    onClick={() => handleRemoveTask(task)}
                    style={{ color: "#dc2626", fontSize: "0.8rem" }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignments */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">👷 Operarios asignados</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAssignModal(true)}
          >
            ➕ Asignar
          </button>
        </div>
        {assignments.length === 0 ? (
          <p className="text-muted text-sm">No hay operarios asignados</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((assign) => {
              const op = operarios.find((o) => o.uid === assign.userId);
              return (
                <div
                  key={assign.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: "var(--space-3)",
                    background: "var(--color-bg)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="sidebar-avatar"
                      style={{ width: 32, height: 32, fontSize: "0.75rem" }}
                    >
                      {op?.name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        {op?.name || "Desconocido"}
                      </div>
                      <div className="text-xs text-muted">{op?.email}</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRemoveAssignment(assign.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Biblioteca Digital / Documentos */}
      <div className="card animate-fadeIn">
        <div className="card-header">
          <h3 className="card-title">
            📄 Biblioteca Digital (Guías e Instrucciones)
          </h3>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowDocModal(true)}
          >
            ➕ Añadir Documento
          </button>
        </div>
        {communityDocs.length === 0 ? (
          <p className="text-muted text-sm italic">
            No hay documentos subidos para esta comunidad.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {communityDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between"
                style={{
                  padding: "var(--space-3)",
                  background: "var(--color-bg)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="font-semibold text-sm truncate"
                    style={{ color: "var(--color-text)" }}
                  >
                    📄 {doc.title}
                  </div>
                  <div className="text-[10px] text-muted">
                    Subido:{" "}
                    {doc.uploadedAt?.toDate
                      ? format(doc.uploadedAt.toDate(), "dd/MM/yyyy HH:mm")
                      : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm text-primary font-bold"
                    style={{ textDecoration: "none", padding: "4px 8px" }}
                  >
                    Ver
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-danger"
                    onClick={() => handleDeleteDoc(doc.id)}
                    style={{ padding: "4px 8px" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal de Clientes (Acceso Externo) */}
      <div className="card animate-fadeIn">
        <div
          className="card-header"
          style={{
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "12px",
            marginBottom: "12px",
          }}
        >
          <h3 className="card-title">
            🏢 Portal de Clientes (Enlace Mágico & QR)
          </h3>
          <span
            className={`status-badge ${selectedCommunity.portalToken ? "status-completed" : "status-pending"}`}
            style={{ textTransform: "none" }}
          >
            {selectedCommunity.portalToken ? "Activo" : "Inactivo"}
          </span>
        </div>

        <p className="text-xs text-muted mb-4">
          Permite que los presidentes de comunidad o administradores de fincas
          comprueben los últimos 30 días de asistencia, tareas completadas y
          fotos de evidencias de esta comunidad sin necesidad de registrarse.
        </p>

        {selectedCommunity.portalToken ? (
          <div className="flex flex-col gap-4">
            {/* URL Input */}
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">
                Enlace de acceso rápido (Magic Link)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  className="form-input text-xs"
                  value={`${window.location.origin}/portal/${selectedCommunity.portalToken}`}
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                  }}
                />
                <button
                  className="btn btn-primary btn-xs"
                  style={{
                    padding: "0 12px",
                    fontSize: "11px",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/portal/${selectedCommunity.portalToken}`,
                    );
                    alert("¡Enlace copiado al portapapeles!");
                  }}
                >
                  📋 Copiar
                </button>
              </div>
            </div>

            {/* Option to show/hide visit times */}
            <div
              className="flex items-center gap-2"
              style={{
                padding: "8px 12px",
                background: "var(--color-bg)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                marginTop: "-4px",
              }}
            >
              <input
                type="checkbox"
                id="show-visit-times-checkbox"
                checked={selectedCommunity.showVisitTimes !== false}
                onChange={async () => {
                  const newValue = !(
                    selectedCommunity.showVisitTimes !== false
                  );
                  try {
                    const communityRef = doc(
                      db,
                      "communities",
                      selectedCommunity.id,
                    );
                    await updateDoc(communityRef, { showVisitTimes: newValue });

                    const updated = {
                      ...selectedCommunity,
                      showVisitTimes: newValue,
                    };
                    setSelectedCommunity(updated);
                    setCommunities((prev) =>
                      prev.map((c) =>
                        c.id === selectedCommunity.id ? updated : c,
                      ),
                    );
                  } catch (err) {
                    console.error(
                      "Error al actualizar opciones del portal:",
                      err,
                    );
                    alert("Error al guardar configuración: " + err.message);
                  }
                }}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <label
                htmlFor="show-visit-times-checkbox"
                className="text-xs font-bold text-slate-700 cursor-pointer"
                style={{ margin: 0 }}
              >
                Mostrar entrada, salida y duración en el portal público
              </label>
            </div>

            {/* QR Code Printable Section */}
            <div
              style={{
                background: "var(--color-bg)",
                padding: "var(--space-4)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <label className="text-xs font-semibold text-muted block mb-3 text-center">
                Código QR y Cartel Imprimible
              </label>

              {/* The Printable Poster Container */}
              <div
                id="printable-qr-poster"
                style={{
                  background: "#ffffff",
                  color: "#0f172a",
                  padding: "24px",
                  borderRadius: "var(--radius-md)",
                  border: "2px dashed #cbd5e1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  boxShadow: "var(--shadow-sm)",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 4px 0",
                    fontSize: "16px",
                    fontWeight: "bold",
                    color: "#1e3a8a",
                  }}
                >
                  RyB Limpiezas
                </h4>
                <p
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "10px",
                    color: "#64748b",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Control de Calidad Digital
                </p>

                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/portal/${selectedCommunity.portalToken}`)}`}
                  alt="Código QR de Acceso"
                  style={{
                    width: "160px",
                    height: "160px",
                    border: "1px solid #e2e8f0",
                    padding: "4px",
                    background: "white",
                  }}
                />

                <div style={{ marginTop: "16px" }}>
                  <p
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: "#1e293b",
                    }}
                  >
                    {selectedCommunity.name}
                  </p>
                  <p
                    style={{
                      margin: "0",
                      fontSize: "9px",
                      color: "#475569",
                      maxWidth: "240px",
                      lineHeight: "1.4",
                    }}
                  >
                    Escanee este código con su móvil para consultar el histórico
                    de visitas, tareas y fotos de evidencias de los últimos 30
                    días de este edificio.
                  </p>
                </div>
              </div>

              {/* Print Button */}
              <button
                className="btn btn-secondary btn-sm w-full mt-3"
                onClick={handlePrintQR}
              >
                🖨️ Imprimir Cartel QR
              </button>
            </div>

            <div className="flex gap-2">
              <button
                className="btn btn-ghost btn-xs text-danger flex-1"
                onClick={handleTogglePortal}
                style={{ fontSize: "11px", border: "1px solid #fecaca" }}
              >
                🔴 Desactivar Portal
              </button>
              <button
                className="btn btn-ghost btn-xs text-warning flex-1"
                onClick={handleRegenerateToken}
                style={{ fontSize: "11px", border: "1px solid #fde68a" }}
              >
                🔄 Cambiar Enlace
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-primary w-full"
            onClick={handleTogglePortal}
          >
            🟢 Activar Portal de Clientes
          </button>
        )}
      </div>
    </div>
  );
}
