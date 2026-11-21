import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { useTenant } from "../../../contexts/TenantContext";
import { tenantDoc } from "../../../utils/tenantFirestore";
import QRCode from "qrcode";
import { getClientPortalAccess, getClientPortalStats } from "../../../services/clientPortalService";

export default function CommunityDetailPanel({
  selectedCommunity,
  setSelectedCommunity,
  setCommunities,
  openEditModal,
  handlePauseCommunity,
  handleReactivateCommunity,
  handleArchiveCommunity,
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
  const navigate = useNavigate();
  const { companyId, company } = useTenant();
  const [companyBranding, setCompanyBranding] = useState({ companyName: "", logoUrl: "" });
  const [brandingLoading, setBrandingLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setCompanyBranding({ companyName: "", logoUrl: "" });
    setBrandingLoading(Boolean(companyId));
    if (companyId) {
      getDoc(tenantDoc(db, companyId, "settings", "global"))
        .then((snapshot) => {
          if (current && snapshot.exists()) {
            const settings = snapshot.data();
            setCompanyBranding({
              companyName: String(settings.companyName || "").trim(),
              logoUrl: String(settings.logoUrl || "").trim(),
            });
          }
        })
        .catch((error) => console.error("No se pudo cargar la marca de la empresa:", error))
        .finally(() => { if (current) setBrandingLoading(false); });
    }
    return () => { current = false; };
  }, [companyId]);
  const posterCompanyName = String(companyBranding.companyName || company?.name || "Tu empresa").trim();
  const rawLogoUrl = companyBranding.logoUrl || String(company?.logoUrl || "");
  const posterLogoUrl = /^https?:\/\//i.test(rawLogoUrl) ? rawLogoUrl : "";
  const portalActive = selectedCommunity.portalEnabled === true ||
    Boolean(selectedCommunity.portalTokenHash || selectedCommunity.portalToken);
  const [portalAccess, setPortalAccess] = useState(null);
  const [portalRetry, setPortalRetry] = useState(0);
  const [portalStats, setPortalStats] = useState(null);
  const [portalStatsRetry, setPortalStatsRetry] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    if (!portalActive || !selectedCommunity.portalTokenHash || selectedCommunity.portalAccessToken) return;
    let current = true;
    const communityId = selectedCommunity.id;
    const tokenHash = selectedCommunity.portalTokenHash;
    setPortalAccess({ communityId, tokenHash, status: "loading", token: "" });
    getClientPortalAccess(communityId)
      .then(({ token, requiresRotation }) => {
        if (current) setPortalAccess({ communityId, tokenHash, status: requiresRotation ? "rotation" : "ready", token: token || "" });
      })
      .catch((error) => {
        console.error("No se pudo recuperar el enlace del portal:", error);
        if (current) setPortalAccess({ communityId, tokenHash, status: "error", token: "" });
      });
    return () => { current = false; };
  }, [portalActive, selectedCommunity.id, selectedCommunity.portalTokenHash,
    selectedCommunity.portalAccessToken, portalRetry]);
  useEffect(() => {
    let current = true;
    const communityId = selectedCommunity.id;
    if (!portalActive) {
      setPortalStats(null);
      return () => { current = false; };
    }
    setPortalStats({ communityId, status: "loading" });
    getClientPortalStats(communityId)
      .then(({ viewCount, monthKey }) => {
        if (current) setPortalStats({
          communityId,
          status: "ready",
          viewCount: Math.max(0, Number(viewCount) || 0),
          monthKey: String(monthKey || ""),
        });
      })
      .catch((error) => {
        console.error("No se pudo cargar el contador del portal:", error);
        if (current) setPortalStats({ communityId, status: "error" });
      });
    return () => { current = false; };
  }, [portalActive, selectedCommunity.id, portalStatsRetry]);
  const recoveredAccess = portalAccess?.communityId === selectedCommunity.id &&
    portalAccess?.tokenHash === selectedCommunity.portalTokenHash ? portalAccess : null;
  const portalStatus = recoveredAccess?.status || "loading";
  const portalToken = selectedCommunity.portalAccessToken || recoveredAccess?.token ||
    selectedCommunity.portalToken || "";
  const legacyCreatedAt = selectedCommunity.portalTokenCreatedAt?.toDate?.() ||
    (selectedCommunity.portalTokenCreatedAt ? new Date(selectedCommunity.portalTokenCreatedAt) : null);
  const expiry = selectedCommunity.portalTokenExpiresAt?.toDate?.() ||
    (selectedCommunity.portalTokenExpiresAt
      ? new Date(selectedCommunity.portalTokenExpiresAt)
      : selectedCommunity.portalToken && !selectedCommunity.portalTokenHash && legacyCreatedAt
        ? new Date(legacyCreatedAt.getTime() + 90 * 24 * 60 * 60 * 1000)
        : null);
  const portalExpired = expiry instanceof Date && !Number.isNaN(expiry.getTime()) &&
    expiry.getTime() <= Date.now();
  const portalUrl = portalToken && !portalExpired
    ? `${window.location.origin}/portal/${portalToken}` : "";
  const currentPortalStats = portalStats?.communityId === selectedCommunity.id
    ? portalStats : null;
  const monthKey = currentPortalStats?.monthKey;
  const monthDate = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey || "")
    ? new Date(`${monthKey}-01T12:00:00`) : new Date();
  const portalStatsMonth = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(monthDate);
  useEffect(() => {
    let current = true;
    if (!portalUrl) {
      setQrDataUrl("");
      return () => { current = false; };
    }
    QRCode.toDataURL(portalUrl, { width: 320, margin: 1 })
      .then((url) => { if (current) setQrDataUrl(url); })
      .catch((error) => {
        console.error("No se pudo generar el QR del portal:", error);
        if (current) setQrDataUrl("");
      });
    return () => { current = false; };
  }, [portalUrl]);
  const escapePrintText = (value) => String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const handlePrintQR = () => {
    if (!qrDataUrl || brandingLoading) return;
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
          <title>Cartel QR - ${escapePrintText(selectedCommunity.name)}</title>
          <style>
            @page { size: A4 portrait; margin: 16mm; }
            body { display: flex; justify-content: center; align-items: center; min-height: 265mm; margin: 0; font-family: system-ui, sans-serif; background: white; }
            .poster { width: 442px; border: 4px solid #1e3a8a; border-radius: 16px; padding: 36px; display: flex; flex-direction: column; align-items: center; text-align: center; box-sizing: border-box; break-inside: avoid; }
            .brand { display: flex; align-items: center; gap: 14px; align-self: stretch; text-align: left; margin-bottom: 20px; }
            .brand-logo { width: 64px; height: 64px; object-fit: contain; flex: none; }
            .brand-name { font-size: 23px; font-weight: 800; color: #1e3a8a; line-height: 1.2; overflow-wrap: anywhere; }
            .subtitle { font-size: 13px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 28px 0; }
            .qr-img { width: 260px; height: 260px; border: 1px solid #cbd5e1; padding: 8px; background: white; }
            .comm-name { font-size: 21px; font-weight: bold; color: #0f172a; margin: 26px 0 10px 0; }
            .instructions { font-size: 14px; color: #475569; line-height: 1.5; margin: 0; max-width: 330px; }
            .footer { font-size: 10px; color: #94a3b8; margin-top: 30px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="poster">
            <div class="brand">
              ${posterLogoUrl ? `<img src="${escapePrintText(posterLogoUrl)}" class="brand-logo" alt="Logo de la empresa" />` : ""}
              <div class="brand-name">${escapePrintText(posterCompanyName)}</div>
            </div>
            <div class="subtitle">Control de Calidad Digital</div>
            <img src="${qrDataUrl}" class="qr-img" />
            <div class="comm-name">${escapePrintText(selectedCommunity.name)}</div>
            <p class="instructions">Escanee este código con su móvil para consultar el histórico de visitas, tareas y fotos de evidencias de los últimos 30 días de este edificio.</p>
            <div class="footer">Sistema LimpiaGest</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    const printPoster = () => {
      printWindow.focus();
      printWindow.print();
    };
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    const images = Array.from(printWindow.document.images);
    Promise.all(images.map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
          window.setTimeout(resolve, 3000);
        }))).then(printPoster);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Info */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🏢 {selectedCommunity.name}</h3>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/admin/presupuestos?cliente=${selectedCommunity.id}`)}
            >
              🧾 Presupuesto
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => openEditModal(selectedCommunity)}
            >
              ✏️ Editar
            </button>
            {selectedCommunity.active === false ? (
              <button className="btn btn-primary btn-sm" disabled={actionLoading}
                onClick={() => handleReactivateCommunity(selectedCommunity.id)}>
                ▶ Reactivar
              </button>
            ) : (
              <button className="btn btn-secondary btn-sm" disabled={actionLoading}
                onClick={() => handlePauseCommunity(selectedCommunity.id)}
                title="Pausar sin borrar sus datos">
                ⏸ Pausar
              </button>
            )}
            <button className="btn btn-danger btn-sm" disabled={actionLoading}
              onClick={() => handleArchiveCommunity(selectedCommunity.id)}
              title="Quitar del listado conservando el historial">
              🗃️ Archivar
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
            <span className="text-xs text-muted">Razón social para facturas</span>
            <p className="font-medium text-sm">
              {selectedCommunity.billingName || selectedCommunity.name || "—"}
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
          {selectedCommunity.billingStreet ? (
            <div style={{ gridColumn: "span 2" }}>
              <span className="text-xs text-muted">Dirección fiscal / facturación</span>
              <p className="font-medium text-sm">
                {selectedCommunity.billingStreet}
                <br />
                {[selectedCommunity.billingPostalCode, selectedCommunity.billingCity]
                  .filter(Boolean)
                  .join(", ")}
                <br />
                {selectedCommunity.billingProvince
                  ? `(${selectedCommunity.billingProvince})`
                  : ""}
              </p>
            </div>
          ) : selectedCommunity.billingAddress ? (
            <div style={{ gridColumn: "span 2" }}>
              <span className="text-xs text-muted">Dirección fiscal anterior</span>
              <p className="font-medium text-sm">
                {selectedCommunity.billingAddress}
              </p>
            </div>
          ) : null}
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
            className={`status-badge ${portalActive && !portalExpired ? "status-completed" : "status-pending"}`}
            style={{ textTransform: "none" }}
          >
            {portalExpired ? "Caducado" : portalActive ? "Activo" : "Inactivo"}
          </span>
        </div>

        <p className="text-xs text-muted mb-4">
          Permite que los presidentes de comunidad o administradores de fincas
          comprueben los últimos 30 días de asistencia, tareas completadas y
          fotos de evidencias de esta comunidad sin necesidad de registrarse.
        </p>

        {portalActive ? (
          <div className="flex flex-col gap-4">
            <div
              className="flex items-center justify-between gap-3"
              style={{ padding: "12px 14px", borderRadius: "var(--radius-md)",
                border: "1px solid #bfdbfe", background: "#eff6ff" }}
            >
              <div>
                <div className="text-xs font-semibold text-slate-600">
                  Visualizaciones en {portalStatsMonth}
                </div>
                <div aria-live="polite" style={{ fontSize: "24px", fontWeight: 800, color: "#1d4ed8" }}>
                  {currentPortalStats?.status === "ready" ? currentPortalStats.viewCount
                    : currentPortalStats?.status === "error" ? "—" : "…"}
                </div>
                {currentPortalStats?.status === "error" && (
                  <div className="text-xs text-muted">No se pudo cargar el contador.</div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setPortalStatsRetry((key) => key + 1)}
                disabled={currentPortalStats?.status === "loading"}
              >
                ↻ Actualizar
              </button>
            </div>
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
                  value={portalUrl || (portalExpired
                    ? "El enlace antiguo ha caducado; cambia el acceso"
                    : portalStatus === "rotation"
                    ? "El enlace anterior no se puede recuperar; crea un QR nuevo"
                    : portalStatus === "error"
                      ? "No se pudo cargar el enlace; vuelve a intentarlo"
                      : "Cargando el enlace y el QR...")}
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
                    if (!portalUrl) {
                      if (portalStatus === "rotation" || portalExpired) handleRegenerateToken();
                      if (portalStatus === "error") setPortalRetry((key) => key + 1);
                      return;
                    }
                    navigator.clipboard.writeText(portalUrl);
                    alert("¡Enlace copiado al portapapeles!");
                  }}
                  disabled={!portalUrl && portalStatus === "loading" && !portalExpired}
                >
                  {portalUrl ? "📋 Copiar" : portalExpired ? "Cambiar enlace" : portalStatus === "rotation"
                    ? "Crear QR nuevo" : portalStatus === "error" ? "Reintentar" : "Cargando..."}
                </button>
              </div>
              {portalStatus === "rotation" && !portalUrl ? (
                <p className="text-xs text-muted mt-2">
                  El enlace antiguo no se puede recuperar. Si creas otro, el QR anterior dejará de funcionar.
                </p>
              ) : null}
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
                    const communityRef = tenantDoc(db, companyId, "communities", selectedCommunity.id);
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
                <div style={{
                  alignSelf: "stretch",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  textAlign: "left",
                  marginBottom: "16px",
                }}>
                  {posterLogoUrl ? (
                    <img src={posterLogoUrl} alt={`Logo de ${posterCompanyName}`}
                      style={{ width: "48px", height: "48px", objectFit: "contain", flex: "none" }} />
                  ) : null}
                  <h4 style={{ margin: 0, fontSize: "18px", fontWeight: 800,
                    color: "#1e3a8a", lineHeight: 1.2 }}>
                    {posterCompanyName}
                  </h4>
                </div>
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

                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Código QR de Acceso"
                    style={{
                      width: "160px",
                      height: "160px",
                      border: "1px solid #e2e8f0",
                      padding: "4px",
                      background: "white",
                    }}
                  />
                ) : <p className="text-xs text-muted">{portalStatus === "rotation"
                  ? "Crea un QR nuevo para imprimir el cartel."
                  : "Cargando el código QR..."}</p>}

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
                disabled={!qrDataUrl || brandingLoading}
              >
                🖨️ Imprimir Cartel QR
              </button>
            </div>

            <div className="flex gap-2">
              <button
                className="btn btn-ghost btn-xs text-danger flex-1"
                onClick={handleTogglePortal}
                disabled={actionLoading}
                style={{ fontSize: "11px", border: "1px solid #fecaca" }}
              >
                🔴 Desactivar Portal
              </button>
              <button
                className="btn btn-ghost btn-xs text-warning flex-1"
                onClick={handleRegenerateToken}
                disabled={actionLoading}
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
            disabled={actionLoading}
          >
            🟢 Activar Portal de Clientes
          </button>
        )}
      </div>
    </div>
  );
}
