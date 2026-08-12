import { useEffect, useMemo, useState } from "react";
import {
  cancelInvoiceFiscalRecord,
  configureAeatConnection,
  getAeatSubmissionPackage,
  getAeatSubmissions,
  getVerifactuEvents,
  prepareAeatSubmissions,
  subsanateInvoiceFiscalRecord,
} from "../../services/invoiceService";

const STATUS_LABELS = {
  awaiting_sender: "Pendiente del asesor",
  awaiting_local_connector: "Pendiente del conector",
  processing: "Procesando",
  accepted: "Aceptado en pruebas",
  accepted_with_errors: "Aceptado con errores",
  rejected: "Rechazado",
  retry_pending: "Reintento pendiente",
};

function downloadText(filename, content) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/xml;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function VerifactuPanel({
  companyId,
  invoices,
  billingSettings,
  onSettingsChanged,
  onInvoicesChanged,
}) {
  const initialProfile = billingSettings?.aeatConnection || {};
  const [enabled, setEnabled] = useState(
    billingSettings?.verifactuEnabled === true,
  );
  const [profile, setProfile] = useState({
    channel: initialProfile.channel || "disabled",
    environment: "test",
    adviserName: initialProfile.adviserName || "",
    adviserTaxId: initialProfile.adviserTaxId || "",
    adviserEmail: initialProfile.adviserEmail || "",
    connectorName: initialProfile.connectorName || "",
  });
  const [submissions, setSubmissions] = useState([]);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const eligibleInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.status !== "draft" &&
          invoice.fiscalRecordId &&
          !invoice.aeatSubmissionId,
      ),
    [invoices],
  );

  const refresh = async () => {
    if (!companyId) return;
    const [nextSubmissions, nextEvents] = await Promise.all([
      getAeatSubmissions(companyId),
      getVerifactuEvents(companyId),
    ]);
    setSubmissions(nextSubmissions);
    setEvents(nextEvents);
  };

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, [companyId]);

  const run = async (action, successMessage) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error.message || "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  const saveConfiguration = () =>
    run(async () => {
      await configureAeatConnection(profile, enabled);
      await onSettingsChanged?.();
    }, "Configuración VeriFactu guardada.");

  const preparePending = () =>
    run(async () => {
      if (!eligibleInvoices.length) {
        throw new Error("No hay registros fiscales pendientes de preparar.");
      }
      await prepareAeatSubmissions(eligibleInvoices.map(({ id }) => id));
      await onInvoicesChanged?.();
    }, "Paquetes de pruebas preparados.");

  const downloadPackage = async (submissionId) => {
    setBusy(true);
    try {
      const pkg = await getAeatSubmissionPackage(submissionId);
      downloadText(pkg.fileName, pkg.transportXml);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const requestFiscalAction = (kind) =>
    run(async () => {
      const invoiceNumber = window.prompt(
        `Número exacto de la factura que quieres ${kind === "cancel" ? "anular" : "subsanar"}:`,
      );
      if (!invoiceNumber) return;
      const invoice = invoices.find(
        (item) => String(item.invoiceNumber) === invoiceNumber.trim(),
      );
      if (!invoice) throw new Error("No se encontró esa factura en el periodo visible.");
      const reason = window.prompt("Motivo obligatorio de la operación fiscal:");
      if (!reason?.trim()) throw new Error("El motivo es obligatorio.");
      if (kind === "cancel") {
        await cancelInvoiceFiscalRecord(invoice.id, reason.trim());
      } else {
        await subsanateInvoiceFiscalRecord(invoice.id, reason.trim(), {});
      }
      await onInvoicesChanged?.();
    }, kind === "cancel" ? "Registro de anulación creado." : "Registro de subsanación creado.");

  return (
    <section
      style={{
        marginTop: 24,
        padding: 18,
        border: "1px solid #bfdbfe",
        borderRadius: 10,
        background: "#eff6ff",
      }}
    >
      <h3 style={{ marginTop: 0 }}>VeriFactu · entorno de pruebas</h3>
      <p style={{ color: "#475569", fontSize: 13 }}>
        La producción permanece bloqueada hasta aportar certificado, superar las
        pruebas externas de la AEAT y firmar la declaración responsable.
      </p>

      <div className="grid grid-2 gap-4">
        <label className="form-group">
          <span className="form-label">Modo fiscal</span>
          <select
            className="form-input"
            value={enabled ? "test" : "disabled"}
            onChange={(event) => setEnabled(event.target.value === "test")}
          >
            <option value="disabled">Desactivado</option>
            <option value="test">VeriFactu de pruebas</option>
          </select>
        </label>
        <label className="form-group">
          <span className="form-label">Canal de preparación</span>
          <select
            className="form-input"
            value={profile.channel}
            onChange={(event) =>
              setProfile({ ...profile, channel: event.target.value })
            }
          >
            <option value="disabled">Sin canal</option>
            <option value="delegated">Asesor / tercero autorizado</option>
            <option value="local_connector">Conector local</option>
          </select>
        </label>
        {profile.channel === "delegated" && (
          <>
            <input className="form-input" placeholder="Nombre del asesor" value={profile.adviserName} onChange={(event) => setProfile({ ...profile, adviserName: event.target.value })} />
            <input className="form-input" placeholder="NIF del asesor" value={profile.adviserTaxId} onChange={(event) => setProfile({ ...profile, adviserTaxId: event.target.value })} />
            <input className="form-input" type="email" placeholder="Correo del asesor" value={profile.adviserEmail} onChange={(event) => setProfile({ ...profile, adviserEmail: event.target.value })} />
          </>
        )}
        {profile.channel === "local_connector" && (
          <input className="form-input" placeholder="Nombre del conector" value={profile.connectorName} onChange={(event) => setProfile({ ...profile, connectorName: event.target.value })} />
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={saveConfiguration}>Guardar VeriFactu</button>
        <button type="button" className="btn btn-outline" disabled={busy || profile.channel === "disabled"} onClick={preparePending}>Preparar pendientes ({eligibleInvoices.length})</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => requestFiscalAction("cancel")}>Anular registro</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => requestFiscalAction("subsanate")}>Subsanar registro</button>
      </div>
      {message && <p style={{ fontSize: 13, marginBottom: 0 }}>{message}</p>}

      <h4>Cola AEAT ({submissions.length})</h4>
      {submissions.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: 13 }}>Todavía no hay paquetes preparados.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Factura</th><th>Tipo</th><th>Estado</th><th>Intentos</th><th></th></tr></thead>
            <tbody>
              {submissions.slice(0, 50).map((item) => (
                <tr key={item.id}>
                  <td>{item.invoiceNumber || item.invoiceId}</td>
                  <td>{item.recordType}</td>
                  <td>{STATUS_LABELS[item.status] || item.status}</td>
                  <td>{item.attempts || 0}</td>
                  <td><button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => downloadPackage(item.id)}>XML</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details style={{ marginTop: 14 }}>
        <summary>Registro operativo ({events.length})</summary>
        <ul style={{ fontSize: 12, color: "#475569" }}>
          {events.slice(0, 30).map((event) => (
            <li key={event.id}>{event.type} · {event.invoiceNumber || event.submissionId || "configuración"}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
