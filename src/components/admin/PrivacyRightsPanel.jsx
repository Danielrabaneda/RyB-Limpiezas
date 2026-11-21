import { useCallback, useEffect, useState } from "react";
import {
  applyPrivacyRightsAction,
  exportPrivacyRightsData,
  listPrivacyRightsRequests,
  submitPrivacyRightsRequest,
} from "../../services/privacyRightsService";
import "./PrivacyPanels.css";

const TYPE_LABELS = {
  access: "Acceso a mis datos",
  rectification: "Rectificación",
  erasure: "Supresión",
  restriction: "Limitación del tratamiento",
  portability: "Portabilidad",
  objection: "Oposición",
};

const STATUS_LABELS = {
  received: "Recibida",
  verified: "Identidad verificada",
  restricted: "Tratamiento limitado",
  erasing: "Supresión en curso",
  completed: "Finalizada",
};

function downloadJson(payload, requestId) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `datos-personales-${requestId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function PrivacyRightsPanel({ isAdmin }) {
  const [type, setType] = useState("access");
  const [details, setDetails] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setRequests(await listPrivacyRightsRequests());
    } catch (error) {
      setMessage(`No se pudieron cargar las solicitudes: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = await submitPrivacyRightsRequest(type, details);
      setDetails("");
      setMessage(`Solicitud registrada. Plazo ordinario de respuesta: ${new Date(result.dueAt).toLocaleDateString("es-ES")}.`);
      await refresh();
    } catch (error) {
      setMessage(`No se pudo registrar la solicitud: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportData(item) {
    setLoading(true);
    setMessage("");
    try {
      downloadJson(await exportPrivacyRightsData(item.id), item.id);
      setMessage("Exportación preparada y descargada en formato JSON.");
      await refresh();
    } catch (error) {
      setMessage(`No se pudo preparar la exportación: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(item, action) {
    const extra = {};
    if (action === "erase") {
      const confirmation = window.prompt(
        "La cuenta quedará desactivada. Los datos no sujetos a conservación se borrarán y los registros obligatorios se seudonimizarán. Escribe SUPRIMIR DATOS para continuar.",
      );
      if (confirmation !== "SUPRIMIR DATOS") return;
      extra.confirmation = confirmation;
    }
    if (action === "close") {
      const resolution = window.prompt("Describe cómo se ha atendido la solicitud:");
      if (!resolution?.trim()) return;
      extra.resolution = resolution;
    }
    if (action === "extend") {
      const reason = window.prompt("Indica por qué la solicitud es compleja o requiere ampliar el plazo:");
      if (!reason?.trim()) return;
      extra.reason = reason;
    }
    setLoading(true);
    setMessage("");
    try {
      await applyPrivacyRightsAction(item.id, action, extra);
      setMessage("La actuación se ha registrado correctamente.");
      await refresh();
    } catch (error) {
      setMessage(`No se pudo completar la actuación: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="privacy-rights-panel" className="card" style={{ gridColumn: "1 / -1", scrollMarginTop: "24px" }}>
      <h3 style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginBottom: "var(--space-3)" }}>
        Derechos de protección de datos
      </h3>
      <p className="text-sm text-muted mb-4">
        Puedes solicitar acceso, rectificación, supresión, limitación, portabilidad u oposición. Si has iniciado sesión, no pediremos una copia del DNI salvo que exista una duda razonable sobre tu identidad.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
        <label className="rgpd-field">
          Derecho que deseas ejercer
          <select className="input" value={type} onChange={(event) => setType(event.target.value)}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="rgpd-field">
          Información adicional (opcional)
          <textarea
            className="input"
            rows="3"
            maxLength="1500"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Indica qué datos o tratamiento quieres revisar."
          />
        </label>
        <div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Procesando..." : "Registrar solicitud"}
          </button>
        </div>
      </form>

      {message && <p className="text-sm mb-4" role="status">{message}</p>}

      <h4 style={{ fontWeight: 700, marginBottom: "10px" }}>
        {isAdmin ? "Solicitudes de la empresa" : "Mis solicitudes"}
      </h4>
      {requests.length === 0 ? (
        <p className="text-sm text-muted">No hay solicitudes registradas.</p>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {requests.map((item) => (
            <div key={item.id} style={{ border: "1px solid var(--color-border)", borderRadius: "10px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <strong>{TYPE_LABELS[item.type] || item.type}</strong>
                <span className="text-sm">{STATUS_LABELS[item.status] || item.status}</span>
              </div>
              <p className="text-sm text-muted" style={{ marginTop: "6px" }}>
                Recibida: {new Date(item.receivedAt).toLocaleDateString("es-ES")} · Límite: {new Date(item.dueAt).toLocaleDateString("es-ES")}
                {isAdmin && item.subjectEmail ? ` · ${item.subjectEmail}` : ""}
              </p>
              {item.details && <p className="text-sm" style={{ marginTop: "6px" }}>{item.details}</p>}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                {(isAdmin || ["access", "portability"].includes(item.type)) && (
                  <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => exportData(item)}>
                    Exportar datos
                  </button>
                )}
                {isAdmin && item.status !== "completed" && (
                  <>
                    {item.status === "received" && <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => runAction(item, "verify")}>Marcar verificada</button>}
                    {item.status === "restricted" ? (
                      <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => runAction(item, "restore")}>Levantar limitación</button>
                    ) : (
                      <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => runAction(item, "restrict")}>Limitar tratamiento</button>
                    )}
                    {item.type === "erasure" && <button className="btn btn-danger" type="button" disabled={loading} onClick={() => runAction(item, "erase")}>Aplicar supresión</button>}
                    {!item.extendedAt && <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => runAction(item, "extend")}>Ampliar plazo</button>}
                    <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => runAction(item, "close")}>Cerrar con resolución</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
