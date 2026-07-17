import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getAllAbsences,
  approveAbsence,
  rejectAbsence,
} from "../../services/absenceService";
import { getOperarios } from "../../services/authService";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function AbsencesAdminPage() {
  const { userProfile } = useAuth();
  const [absences, setAbsences] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [operariosMap, setOperariosMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [absList, opsList] = await Promise.all([
        getAllAbsences(),
        getOperarios(),
      ]);

      const opMap = {};
      opsList.forEach((op) => {
        opMap[op.uid] = op.name || op.email;
      });
      setOperariosMap(opMap);
      setOperarios(opsList);

      setAbsences(
        absList.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        }),
      );
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(absenceId, action) {
    setActionLoading((prev) => ({ ...prev, [absenceId]: true }));
    try {
      if (action === "approve") {
        await approveAbsence(absenceId, userProfile.uid);
        alert("Solicitud aprobada correctamente.");
      } else if (action === "reject") {
        await rejectAbsence(absenceId, userProfile.uid);
        alert("Solicitud rechazada.");
      }
      // Reload lists
      const updatedAbsences = await getAllAbsences();
      setAbsences(
        updatedAbsences.sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        }),
      );
    } catch (err) {
      console.error(err);
      alert("Error al resolver solicitud: " + err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [absenceId]: false }));
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
        return <span className="badge badge-success">✅ Aprobada</span>;
      case "rejected":
        return <span className="badge badge-danger">❌ Rechazada</span>;
      default:
        return <span className="badge badge-warning">⏳ Pendiente</span>;
    }
  };

  const pendingAbsences = absences.filter((a) => a.status === "pending");
  const resolvedAbsences = absences.filter((a) => a.status !== "pending");

  return (
    <div className="animate-fadeIn">
      <h2
        style={{
          fontSize: "var(--font-2xl)",
          fontWeight: 800,
          marginBottom: "var(--space-6)",
        }}
      >
        🌴 Panel de Ausencias y Vacaciones
      </h2>

      {/* Tabs */}
      <div className="tabs mb-6">
        <button
          className={`tab ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Solicitudes Pendientes ({pendingAbsences.length})
        </button>
        <button
          className={`tab ${activeTab === "resolved" ? "active" : ""}`}
          onClick={() => setActiveTab("resolved")}
        >
          Historial de Decisiones ({resolvedAbsences.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-6">
          <div className="spinner"></div>
        </div>
      ) : activeTab === "pending" ? (
        /* PENDING REQUESTS PANEL */
        <div className="flex flex-col gap-4">
          {pendingAbsences.length === 0 ? (
            <div className="card text-center p-8 text-muted">
              ✅ No hay solicitudes pendientes de aprobación.
            </div>
          ) : (
            pendingAbsences.map((abs) => {
              const start = abs.startDate?.toDate
                ? abs.startDate.toDate()
                : new Date(abs.startDate);
              const end = abs.endDate?.toDate
                ? abs.endDate.toDate()
                : new Date(abs.endDate);
              const isResolving = actionLoading[abs.id];

              return (
                <div
                  key={abs.id}
                  className="card p-5 border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-slideIn"
                >
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-lg text-slate-800">
                        👤{" "}
                        {operariosMap[abs.userId] || abs.userName || "Operario"}
                      </span>
                      <span
                        className="badge badge-warning"
                        style={{ transform: "scale(0.9)" }}
                      >
                        Pendiente
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <p className="text-sm font-semibold text-slate-700">
                        Tipo:{" "}
                        <span className="font-normal">
                          {getTypeLabel(abs.type)}
                        </span>
                      </p>
                      <p className="text-sm font-semibold text-slate-700">
                        Fechas:{" "}
                        <span className="font-bold text-primary">
                          Del {format(start, "dd/MM/yyyy")} al{" "}
                          {format(end, "dd/MM/yyyy")}
                        </span>
                      </p>
                      {abs.reason && (
                        <p
                          className="text-xs text-muted mt-2 bg-slate-50 p-3 rounded"
                          style={{
                            fontStyle: "italic",
                            borderLeft: "3px solid var(--color-primary)",
                          }}
                        >
                          💬 "{abs.reason}"
                        </p>
                      )}
                      {abs.docUrl && (
                        <a
                          href={abs.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary font-bold mt-2 inline-flex items-center gap-1"
                          style={{ textDecoration: "underline" }}
                        >
                          📄 Ver Justificante Adjunto
                        </a>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex gap-2 w-full md:w-auto"
                    style={{
                      alignSelf: "stretch",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="btn btn-secondary text-danger btn-sm"
                      onClick={() => handleResolve(abs.id, "reject")}
                      disabled={isResolving}
                      style={{ border: "1px solid var(--color-danger)" }}
                    >
                      Rechazar
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleResolve(abs.id, "approve")}
                      disabled={isResolving}
                    >
                      Aprobar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* RESOLVED REQUESTS PANEL */
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Operario</th>
                  <th>Tipo</th>
                  <th>Fecha Inicio</th>
                  <th>Fecha Fin</th>
                  <th>Motivo</th>
                  <th>Justificante</th>
                  <th>Estado</th>
                  <th>Resuelto Por</th>
                </tr>
              </thead>
              <tbody>
                {resolvedAbsences.map((abs) => {
                  const start = abs.startDate?.toDate
                    ? abs.startDate.toDate()
                    : new Date(abs.startDate);
                  const end = abs.endDate?.toDate
                    ? abs.endDate.toDate()
                    : new Date(abs.endDate);

                  return (
                    <tr key={abs.id}>
                      <td className="font-semibold text-sm">
                        {operariosMap[abs.userId] || abs.userName || "—"}
                      </td>
                      <td className="text-sm">{getTypeLabel(abs.type)}</td>
                      <td className="text-sm">{format(start, "dd/MM/yyyy")}</td>
                      <td className="text-sm">{format(end, "dd/MM/yyyy")}</td>
                      <td
                        className="text-sm text-muted"
                        style={{
                          maxWidth: "180px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={abs.reason}
                      >
                        {abs.reason || "—"}
                      </td>
                      <td className="text-sm">
                        {abs.docUrl ? (
                          <a
                            href={abs.docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-bold"
                          >
                            Ver doc
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>{getStatusBadge(abs.status)}</td>
                      <td className="text-sm text-muted">
                        {operariosMap[abs.resolvedBy] || "Admin"}
                      </td>
                    </tr>
                  );
                })}
                {resolvedAbsences.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-center text-muted p-6">
                      No hay solicitudes resueltas en el historial.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
