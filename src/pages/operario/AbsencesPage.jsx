import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTenant } from "../../contexts/TenantContext";
import { requestAbsence, getUserAbsences } from "../../services/absenceService";
import { uploadPhoto } from "../../services/storageService";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function AbsencesPage() {
  const { userProfile } = useAuth();
  const { companyId } = useTenant();
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Form State
  const [type, setType] = useState("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (userProfile?.uid) {
      loadAbsences();
    }
  }, [userProfile]);

  async function loadAbsences() {
    try {
      const data = await getUserAbsences(companyId, userProfile.uid);
      // Sort: newest request first
      setAbsences(
        data.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        }),
      );
    } catch (err) {
      console.error("Error loading absences:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("El archivo es demasiado grande (máximo 8MB)");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadPhoto(companyId, file, userProfile.uid, "absence_proof");
      setDocUrl(url);
      alert("Justificante subido correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al subir el justificante: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!startDate || !endDate) {
      alert("Por favor selecciona las fechas de inicio y fin.");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      alert("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    setActionLoading(true);
    try {
      await requestAbsence(companyId, {
        userId: userProfile.uid,
        userName: userProfile.name || userProfile.email || "Operario",
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        docUrl,
      });
      alert("Solicitud enviada correctamente al administrador.");
      // Reset form
      setStartDate("");
      setEndDate("");
      setReason("");
      setDocUrl("");
      // Reload history
      await loadAbsences();
    } catch (err) {
      console.error(err);
      alert("Error al enviar la solicitud: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const getTypeLabel = (t) => {
    switch (t) {
      case "vacation":
        return "🌴 Vacaciones";
      case "sick_leave":
        return "🏥 Baja Médica";
      case "personal_day":
        return "🗓️ Asuntos Propios";
      default:
        return t;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return (
          <span
            className="badge badge-success"
            style={{ padding: "4px 8px", borderRadius: "12px" }}
          >
            ✅ Aprobada
          </span>
        );
      case "rejected":
        return (
          <span
            className="badge badge-danger"
            style={{ padding: "4px 8px", borderRadius: "12px" }}
          >
            ❌ Rechazada
          </span>
        );
      default:
        return (
          <span
            className="badge badge-warning"
            style={{ padding: "4px 8px", borderRadius: "12px" }}
          >
            ⏳ Pendiente
          </span>
        );
    }
  };

  return (
    <div className="animate-fadeIn" style={{ paddingBottom: "30px" }}>
      <h2
        style={{
          fontSize: "var(--font-xl)",
          fontWeight: 800,
          marginBottom: "var(--space-4)",
        }}
      >
        🌴 Ausencias y Vacaciones
      </h2>

      {/* Request Form */}
      <div className="card mb-6">
        <h3 className="card-title text-base mb-4">Nueva Solicitud</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label text-xs font-bold">
              Tipo de Ausencia
            </label>
            <select
              className="form-select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="vacation">Vacaciones</option>
              <option value="sick_leave">Baja Médica</option>
              <option value="personal_day">Días de Asuntos Propios</option>
            </select>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div className="form-group">
              <label className="form-label text-xs font-bold">
                Fecha Inicio
              </label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label text-xs font-bold">Fecha Fin</label>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-bold">
              Motivo / Comentarios
            </label>
            <textarea
              className="form-textarea"
              placeholder="Detalla el motivo de la ausencia..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ minHeight: "80px" }}
            />
          </div>

          {/* Proof Upload (Required for Sick Leave) */}
          <div
            className="form-group"
            style={{
              padding: "var(--space-3)",
              background: "var(--color-bg-light)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <label className="form-label text-xs font-bold mb-1 block">
              📄 Justificante o Documentación{" "}
              {type === "sick_leave" && <span className="text-danger">*</span>}
            </label>
            {docUrl ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 12px",
                  background: "var(--color-success-light)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <span className="text-xs font-medium text-success">
                  ✓ Archivo adjunto cargado
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-danger"
                  onClick={() => setDocUrl("")}
                  style={{
                    border: "1px solid var(--color-danger)",
                    fontSize: "10px",
                  }}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{ display: "none" }}
                  id="absence-file-input"
                />
                <label
                  htmlFor="absence-file-input"
                  className="btn btn-secondary btn-sm w-full text-center"
                  style={{
                    cursor: "pointer",
                    display: "block",
                    padding: "8px",
                  }}
                >
                  {uploading
                    ? "⏳ Subiendo..."
                    : "📷 Subir Justificante / Foto"}
                </label>
              </div>
            )}
            <p className="text-[10px] text-muted mt-1">
              Sube el parte de baja o justificante médico correspondiente.
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={
              actionLoading || uploading || (type === "sick_leave" && !docUrl)
            }
          >
            {actionLoading ? "⏳ Enviando..." : "📨 Enviar Solicitud"}
          </button>
        </form>
      </div>

      {/* Request History */}
      <div className="card">
        <h3 className="card-title text-base mb-4">Historial de Solicitudes</h3>
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="spinner"></div>
          </div>
        ) : absences.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">
            No has solicitado ausencias todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {absences.map((abs) => {
              const start = abs.startDate?.toDate
                ? abs.startDate.toDate()
                : new Date(abs.startDate);
              const end = abs.endDate?.toDate
                ? abs.endDate.toDate()
                : new Date(abs.endDate);

              return (
                <div
                  key={abs.id}
                  className="p-3 border rounded-lg"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div
                    className="flex justify-between items-start mb-2"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      className="font-bold text-sm"
                      style={{ color: "var(--color-text)" }}
                    >
                      {getTypeLabel(abs.type)}
                    </span>
                    {getStatusBadge(abs.status)}
                  </div>

                  <p className="text-xs text-muted mb-2 font-semibold">
                    📅 Del {format(start, "dd/MM/yyyy")} al{" "}
                    {format(end, "dd/MM/yyyy")}
                  </p>

                  {abs.reason && (
                    <p
                      className="text-xs text-muted mb-2 bg-slate-50 p-2 rounded"
                      style={{ fontStyle: "italic" }}
                    >
                      💬 "{abs.reason}"
                    </p>
                  )}

                  {abs.docUrl && (
                    <a
                      href={abs.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary font-bold block"
                      style={{ textDecoration: "underline" }}
                    >
                      📄 Ver Justificante Adjunto
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
