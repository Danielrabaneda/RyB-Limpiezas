import { useState, useEffect } from "react";
import {
  getEvidenceReportsRange,
  deleteEvidenceReport,
  markEvidenceReviewed,
} from "../../services/evidenceService";
import { getCommunities } from "../../services/communityService";
import { getOperarios } from "../../services/authService";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { groupFlatList } from "../../utils/dateGrouping";

export default function EvidenceReportsPage() {
  const [startDate, setStartDate] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterCommunity, setFilterCommunity] = useState("");
  const [filterOperario, setFilterOperario] = useState("");
  const [communities, setCommunities] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState(null);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleGroup = (id) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedGroups(newSet);
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  async function loadBaseData() {
    const [comms, ops] = await Promise.all([getCommunities(), getOperarios()]);
    setCommunities(comms);
    setOperarios(ops);
    await loadReports();
  }

  async function loadReports() {
    setLoading(true);
    try {
      const filters = {};
      if (filterCommunity) filters.communityId = filterCommunity;
      if (filterOperario) filters.userId = filterOperario;

      const data = await getEvidenceReportsRange(
        new Date(startDate),
        new Date(endDate),
        filters,
      );
      setReports(data);
    } catch (err) {
      console.error("Error loading evidence reports:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (
      !window.confirm(
        "¿Estás seguro de que deseas eliminar este reporte de evidencia? Esta acción no se puede deshacer.",
      )
    )
      return;
    try {
      await deleteEvidenceReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (expandedReport === id) setExpandedReport(null);
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    }
  }

  async function handleMarkReviewed(id) {
    try {
      await markEvidenceReviewed(id);
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "reviewed" } : r)),
      );
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  function getOperarioName(uid) {
    return (
      operarios.find((o) => o.uid === uid)?.name || uid?.substring(0, 8) + "..."
    );
  }

  function getCommunityName(id) {
    return (
      communities.find((c) => c.id === id)?.name || id?.substring(0, 8) + "..."
    );
  }

  const totalReports = reports.length;
  const pendingReports = reports.filter((r) => r.status === "submitted").length;
  const reviewedReports = reports.filter((r) => r.status === "reviewed").length;
  const totalPhotos = reports.reduce(
    (acc, r) => acc + (r.photoUrls?.length || 0),
    0,
  );

  function renderReportCard(report) {
    const isExpanded = expandedReport === report.id;
    const createdAt = report.createdAt?.toDate
      ? report.createdAt.toDate()
      : report.createdAt
        ? new Date(report.createdAt)
        : null;

    return (
      <div
        key={report.id}
        className="card"
        style={{
          borderLeft:
            report.status === "reviewed"
              ? "4px solid var(--color-success)"
              : "4px solid var(--color-warning)",
          transition: "all 0.2s ease",
        }}
      >
        {/* Header — clickable */}
        <div
          style={{
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
          }}
          onClick={() => setExpandedReport(isExpanded ? null : report.id)}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span style={{ fontWeight: 800, fontSize: "var(--font-base)" }}>
                🏢{" "}
                {report.communityName || getCommunityName(report.communityId)}
              </span>
              <span
                className={`badge ${report.status === "reviewed" ? "badge-success" : "badge-warning"}`}
                style={{ fontSize: "0.65rem" }}
              >
                {report.status === "reviewed" ? "✅ Revisado" : "🟡 Pendiente"}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
              <span>
                👤 {report.userName || getOperarioName(report.userId)}
              </span>
              <span>📋 {report.taskName || "Tarea"}</span>
              {createdAt && (
                <span>
                  📅{" "}
                  {format(createdAt, "dd/MM/yyyy 'a las' HH:mm", {
                    locale: es,
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              {report.photoUrls?.length > 0 && (
                <span
                  style={{
                    background: "var(--color-bg-light, #f1f5f9)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 600,
                  }}
                >
                  📷 {report.photoUrls.length} foto
                  {report.photoUrls.length > 1 ? "s" : ""}
                </span>
              )}
              {report.notes && (
                <span
                  style={{
                    background: "var(--color-bg-light, #f1f5f9)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 600,
                  }}
                >
                  📝 Nota incluida
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            <span
              style={{
                fontSize: "1.2rem",
                transition: "transform 0.2s",
                transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
              }}
            >
              🔽
            </span>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div
            style={{
              marginTop: "var(--space-4)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            {/* Notes */}
            {report.notes && (
              <div
                style={{
                  background: "var(--color-bg-light, #f8fafc)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3) var(--space-4)",
                  marginBottom: "var(--space-4)",
                  borderLeft: "3px solid var(--color-primary)",
                }}
              >
                <p className="text-xs font-bold text-muted mb-1">
                  📝 Notas del operario:
                </p>
                <p
                  className="text-sm"
                  style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}
                >
                  {report.notes}
                </p>
              </div>
            )}

            {/* Photos grid */}
            {report.photoUrls?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted mb-2">
                  📷 Fotos adjuntas:
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: "8px",
                  }}
                >
                  {report.photoUrls.map((url, i) => (
                    <div
                      key={i}
                      style={{
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        cursor: "pointer",
                        border: "2px solid var(--color-border, #e2e8f0)",
                        transition: "transform 0.15s, box-shadow 0.15s",
                        aspectRatio: "1",
                      }}
                      onClick={() => setLightboxImg(url)}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = "scale(1.03)";
                        e.currentTarget.style.boxShadow =
                          "0 4px 16px rgba(0,0,0,0.15)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <img
                        src={url}
                        alt={`Evidencia ${i + 1}`}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4 justify-end flex-wrap">
              {report.status !== "reviewed" && (
                <button
                  className="btn btn-sm"
                  style={{
                    background: "var(--color-success)",
                    color: "white",
                    border: "none",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkReviewed(report.id);
                  }}
                >
                  ✅ Marcar revisado
                </button>
              )}
              <button
                className="btn btn-sm"
                style={{
                  background: "var(--color-danger, #ef4444)",
                  color: "white",
                  border: "none",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(report.id);
                }}
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const groupedReports = groupFlatList(reports, (report) => report.createdAt);

  return (
    <>
      <div className="animate-fadeIn">
        <h2
          style={{
            fontSize: "var(--font-2xl)",
            fontWeight: 800,
            marginBottom: "var(--space-6)",
          }}
        >
          📸 Evidencias
        </h2>

        {/* Filters */}
        <div className="filter-bar">
          <div className="form-group">
            <label className="form-label">Desde</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Hasta</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Comunidad</label>
            <select
              className="form-select"
              value={filterCommunity}
              onChange={(e) => setFilterCommunity(e.target.value)}
            >
              <option value="">Todas</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Operario</label>
            <select
              className="form-select"
              value={filterOperario}
              onChange={(e) => setFilterOperario(e.target.value)}
            >
              <option value="">Todos</option>
              {operarios.map((o) => (
                <option key={o.uid} value={o.uid}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={loadReports}>
            🔍 Filtrar
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-4 gap-4 mb-6">
          <div className="stat-card">
            <div className="stat-value">{totalReports}</div>
            <div className="stat-label">Reportes totales</div>
          </div>
          <div className="stat-card">
            <div
              className="stat-value"
              style={{ color: "var(--color-warning)" }}
            >
              {pendingReports}
            </div>
            <div className="stat-label">Pendientes revisión</div>
          </div>
          <div className="stat-card">
            <div
              className="stat-value"
              style={{ color: "var(--color-success)" }}
            >
              {reviewedReports}
            </div>
            <div className="stat-label">Revisados</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalPhotos}</div>
            <div className="stat-label">Fotos totales</div>
          </div>
        </div>

        {/* Reports list */}
        {loading ? (
          <div className="flex justify-center p-6">
            <div className="spinner"></div>
          </div>
        ) : reports.length === 0 ? (
          <div className="card text-center p-8 text-muted">
            📭 No hay evidencias para el rango seleccionado.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupedReports.map((group) => {
              if (group.isCurrent) {
                return group.items.map((report) => renderReportCard(report));
              } else {
                const isExpanded = expandedGroups.has(group.id);
                return (
                  <div key={group.id} className="week-card mb-4">
                    <div
                      className={`week-header card ${isExpanded ? "expanded" : ""}`}
                      onClick={() => toggleGroup(group.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        background: "var(--color-bg-input)",
                        borderLeft: isExpanded
                          ? "4px solid var(--color-accent)"
                          : "1px solid var(--color-border)",
                        padding: "var(--space-4)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="week-icon"
                          style={{ fontSize: "1.2rem" }}
                        >
                          {group.type === "year"
                            ? "🗓️"
                            : group.type === "month"
                              ? "📅"
                              : isExpanded
                                ? "📂"
                                : "📁"}
                        </div>
                        <div>
                          <h3
                            style={{
                              fontSize: "var(--font-base)",
                              fontWeight: 700,
                            }}
                          >
                            {group.label}
                          </h3>
                          <span className="text-xs text-muted">
                            {group.subLabel}
                          </span>
                        </div>
                      </div>
                      <div className="week-stats flex gap-4 text-sm font-semibold">
                        <span
                          title="Reportes"
                          style={{ color: "var(--color-primary)" }}
                        >
                          📸 {group.items.length} reportes
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {isExpanded ? "🔽" : "▶️"}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="week-content mt-2 ml-4 flex flex-col gap-4">
                        {group.items.map((report) => renderReportCard(report))}
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Lightbox modal for full-size photo */}
      {lightboxImg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            cursor: "pointer",
          }}
          onClick={() => setLightboxImg(null)}
        >
          <button
            style={{
              position: "absolute",
              top: "16px",
              right: "20px",
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: "50%",
              width: "40px",
              height: "40px",
              fontSize: "1.3rem",
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setLightboxImg(null)}
          >
            ✕
          </button>
          <img
            src={lightboxImg}
            alt="Evidencia ampliada"
            style={{
              maxWidth: "90vw",
              maxHeight: "85vh",
              objectFit: "contain",
              borderRadius: "12px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
