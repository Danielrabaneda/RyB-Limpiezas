import { useEffect, useMemo, useState } from "react";
import {
  cancelInvoiceFiscalRecord,
  connectAeatCertificate,
  configureAeatConnection,
  disconnectAeatCertificate,
  disconnectLocalConnector,
  getAeatCertificateStatus,
  getLocalConnectorStatus,
  getAeatSubmissionPackage,
  getAeatSubmissions,
  getVerifactuEvents,
  prepareAeatSubmissions,
  startLocalConnectorPairing,
  subsanateInvoiceFiscalRecord,
} from "../../services/invoiceService";

const STATUS_LABELS = {
  awaiting_sender: "Pendiente del asesor",
  awaiting_local_connector: "Pendiente del conector",
  awaiting_cloud_sender: "Pendiente de envío seguro",
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
  const [certificate, setCertificate] = useState({ connected: false });
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [connectorStatus, setConnectorStatus] = useState({ status: "not_connected" });
  const [pairing, setPairing] = useState(null);
  const [connectorLaunchAttempted, setConnectorLaunchAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fiscalAction, setFiscalAction] = useState(null);
  const [fiscalInvoiceNumber, setFiscalInvoiceNumber] = useState("");
  const [fiscalReason, setFiscalReason] = useState("");

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
    const [nextSubmissions, nextEvents, nextCertificate, nextConnector] = await Promise.all([
      getAeatSubmissions(companyId),
      getVerifactuEvents(companyId),
      getAeatCertificateStatus(),
      getLocalConnectorStatus(),
    ]);
    setSubmissions(nextSubmissions);
    setEvents(nextEvents);
    setCertificate(nextCertificate);
    setConnectorStatus(nextConnector);
    if (nextCertificate.connected) {
      setProfile((current) => ({ ...current, channel: "cloud_certificate" }));
    }
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

  const connectCertificate = () =>
    run(async () => {
      if (!certificateFile) throw new Error("Selecciona el archivo .pfx o .p12.");
      if (!certificatePassword) throw new Error("Escribe la contraseña del certificado.");
      if (certificateFile.size > 512 * 1024) throw new Error("El archivo supera el límite de 512 KB.");
      const bytes = new Uint8Array(await certificateFile.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      await connectAeatCertificate(btoa(binary), certificatePassword);
      setCertificatePassword("");
      setCertificateFile(null);
      await onSettingsChanged?.();
    }, "Certificado conectado y custodiado de forma segura.");

  const disconnectCertificate = () => {
    if (!window.confirm("¿Desconectar y eliminar de forma segura el certificado de esta empresa?")) return;
    run(async () => {
      await disconnectAeatCertificate();
      setProfile((current) => ({ ...current, channel: "disabled" }));
      setEnabled(false);
      await onSettingsChanged?.();
    }, "Certificado desconectado.");
  };

  const beginLocalPairing = () =>
    run(async () => {
      const nextPairing = await startLocalConnectorPairing();
      setPairing(nextPairing);
      setConnectorLaunchAttempted(false);
      setProfile((current) => ({
        ...current,
        channel: "local_connector",
        connectorName: current.connectorName || "Conector Windows",
      }));
    }, "Código preparado. Es válido durante 10 minutos.");

  const openLocalConnector = () => {
    if (!pairing) return;
    setConnectorLaunchAttempted(true);
    window.location.assign(
      `limpiagest-verifactu://pair?companyId=${encodeURIComponent(pairing.companyId)}&code=${encodeURIComponent(pairing.pairingCode)}`,
    );
  };

  const copyPairingCode = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.pairingCode);
      setMessage("Código copiado. Abre 'Conectar LimpiaGest VeriFactu' desde el menú Inicio y pégalo.");
    } catch {
      setMessage(`Copia este código: ${pairing.pairingCode}`);
    }
  };

  const removeLocalConnector = () => {
    if (!window.confirm("¿Desconectar este ordenador? El conector dejará de poder acceder a la cola de esta empresa.")) return;
    run(async () => {
      await disconnectLocalConnector();
      setPairing(null);
      setProfile((current) => ({ ...current, channel: "disabled" }));
      setEnabled(false);
      await onSettingsChanged?.();
    }, "Ordenador desconectado de LimpiaGest.");
  };

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

  const openFiscalAction = (kind) => {
    const candidates = invoices.filter((invoice) => invoice.status !== "draft");
    setFiscalAction(kind);
    setFiscalInvoiceNumber(
      candidates.length === 1 ? String(candidates[0].invoiceNumber || "") : "",
    );
    setFiscalReason("");
    setMessage("");
  };

  const requestFiscalAction = () =>
    run(async () => {
      const invoice = invoices.find(
        (item) => String(item.invoiceNumber) === fiscalInvoiceNumber.trim(),
      );
      if (!invoice) throw new Error("No se encontró esa factura en el periodo visible.");
      if (!fiscalReason.trim()) throw new Error("El motivo es obligatorio.");
      if (fiscalAction === "cancel") {
        await cancelInvoiceFiscalRecord(invoice.id, fiscalReason.trim());
      } else {
        await subsanateInvoiceFiscalRecord(invoice.id, fiscalReason.trim(), {});
      }
      await onInvoicesChanged?.();
      setFiscalAction(null);
    }, fiscalAction === "cancel" ? "Registro de anulación creado." : "Registro de subsanación creado.");

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
          <span className="form-label">Cómo conectar con la AEAT</span>
          <select
            className="form-input"
            value={profile.channel}
            onChange={(event) =>
              setProfile({ ...profile, channel: event.target.value })
            }
          >
            <option value="disabled">Sin canal</option>
            <option value="cloud_certificate">Subir certificado PFX/P12</option>
            <option value="delegated">Asesor / tercero autorizado</option>
            <option value="local_connector">Usar el certificado de este ordenador</option>
          </select>
        </label>
        {profile.channel === "delegated" && (
          <>
            <input className="form-input" placeholder="Nombre del asesor" value={profile.adviserName} onChange={(event) => setProfile({ ...profile, adviserName: event.target.value })} />
            <input className="form-input" placeholder="NIF del asesor" value={profile.adviserTaxId} onChange={(event) => setProfile({ ...profile, adviserTaxId: event.target.value })} />
            <input className="form-input" type="email" placeholder="Correo del asesor" value={profile.adviserEmail} onChange={(event) => setProfile({ ...profile, adviserEmail: event.target.value })} />
          </>
        )}
      </div>

      {profile.channel === "cloud_certificate" && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: "white", border: "1px solid #cbd5e1" }}>
          <h4 style={{ marginTop: 0 }}>Certificado digital de la empresa</h4>
          {certificate.connected ? (
            <>
              <p style={{ marginBottom: 6 }}><strong>Conectado:</strong> {certificate.commonName}</p>
              <p style={{ margin: "4px 0", fontSize: 13 }}>NIF {certificate.taxId} · válido hasta {new Date(certificate.validTo).toLocaleDateString("es-ES")}</p>
              <p style={{ margin: "4px 0", fontSize: 13, color: certificate.daysRemaining < 30 ? "#b45309" : "#15803d" }}>
                Quedan {certificate.daysRemaining} días de validez. Te avisaremos antes de que caduque.
              </p>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={disconnectCertificate}>Desconectar certificado</button>
            </>
          ) : (
            <>
              <p style={{ color: "#475569", fontSize: 13 }}>
                Sube el archivo .pfx o .p12 y escribe su contraseña. Se comprobará el NIF y se guardará cifrado, separado de los datos de facturación.
              </p>
              <div className="grid grid-2 gap-4">
                <label className="form-group">
                  <span className="form-label">Archivo del certificado</span>
                  <input className="form-input" type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(event) => setCertificateFile(event.target.files?.[0] || null)} />
                </label>
                <label className="form-group">
                  <span className="form-label">Contraseña</span>
                  <input className="form-input" type="password" autoComplete="new-password" value={certificatePassword} onChange={(event) => setCertificatePassword(event.target.value)} />
                </label>
              </div>
              <button type="button" className="btn btn-primary" disabled={busy || !certificateFile || !certificatePassword} onClick={connectCertificate}>Comprobar y conectar</button>
            </>
          )}
        </div>
      )}

      {profile.channel === "local_connector" && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: "white", border: "1px solid #cbd5e1" }}>
          <h4 style={{ marginTop: 0 }}>Conectar este ordenador</h4>
          {connectorStatus.online && !pairing ? (
            <>
              <p style={{ marginBottom: 6, color: "#15803d" }}><strong>Conector activo:</strong> {connectorStatus.connectorName}</p>
              <p style={{ margin: "4px 0", fontSize: 13 }}>{connectorStatus.certificateSubject}</p>
              <p style={{ margin: "4px 0", fontSize: 13 }}>
                Certificado válido hasta {new Date(connectorStatus.certificateValidTo).toLocaleDateString("es-ES")} · prueba AEAT {connectorStatus.aeatTestReachable ? "correcta" : "pendiente"}.
              </p>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={beginLocalPairing}>Cambiar de ordenador</button>
              <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} disabled={busy} onClick={removeLocalConnector}>Desconectar</button>
            </>
          ) : (
            <>
              <p style={{ color: "#475569", fontSize: 13 }}>
                Esta opción sirve cuando Windows protege la clave y no permite exportarla. El certificado nunca sale del ordenador.
              </p>
              <ol style={{ color: "#475569", fontSize: 13, paddingLeft: 20 }}>
                <li>Genera un código temporal.</li>
                <li>Abre el conector de LimpiaGest en este ordenador.</li>
                <li>Introduce el código y espera la confirmación.</li>
              </ol>
              {!pairing ? (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={beginLocalPairing}>Conectar este ordenador</button>
              ) : (
                <div style={{ padding: 12, borderRadius: 8, background: "#f1f5f9" }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Código válido durante 10 minutos</p>
                  <p style={{ margin: "6px 0", fontSize: 24, fontWeight: 700, letterSpacing: 3 }}>{pairing.pairingCode}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Identificador: {pairing.companyId}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ display: "inline-block", marginTop: 10 }}
                    onClick={openLocalConnector}
                  >
                    Abrir conector automáticamente
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ marginLeft: 8, marginTop: 10 }}
                    onClick={copyPairingCode}
                  >
                    Copiar código
                  </button>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                    {connectorLaunchAttempted
                      ? "Si no aparece la ventana, abre el menú Inicio de Windows, busca “Conectar LimpiaGest VeriFactu” y pega el código."
                      : "Si Windows no abre la utilidad, instala primero el conector."}
                  </p>
                  <a className="btn btn-outline" style={{ display: "inline-block", marginTop: 10 }} href="/downloads/LimpiaGest-Conector-Windows.zip" download>
                    Descargar instalador para Windows
                  </a>
                  <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} disabled={busy} onClick={refresh}>Ya lo he conectado</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={saveConfiguration}>Guardar VeriFactu</button>
        <button type="button" className="btn btn-outline" disabled={busy || profile.channel === "disabled"} onClick={preparePending}>Preparar pendientes ({eligibleInvoices.length})</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => openFiscalAction("cancel")}>Anular registro</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => openFiscalAction("subsanate")}>Subsanar registro</button>
      </div>
      {fiscalAction && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: "#fff", border: "1px solid #bfdbfe" }}>
          <strong>{fiscalAction === "cancel" ? "Anular registro fiscal" : "Subsanar registro fiscal"}</strong>
          <label className="form-group" style={{ display: "block", marginTop: 10 }}>
            <span className="form-label">Factura</span>
            <select className="form-input" value={fiscalInvoiceNumber} onChange={(event) => setFiscalInvoiceNumber(event.target.value)}>
              <option value="">Selecciona una factura</option>
              {invoices.filter((invoice) => invoice.status !== "draft").map((invoice) => (
                <option key={invoice.id} value={invoice.invoiceNumber}>
                  {invoice.invoiceNumber} · {invoice.client?.name || invoice.communityName || "Sin cliente"}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group" style={{ display: "block", marginTop: 10 }}>
            <span className="form-label">Motivo obligatorio</span>
            <input className="form-input" value={fiscalReason} onChange={(event) => setFiscalReason(event.target.value)} placeholder="Describe el motivo de la operación" />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary" disabled={busy || !fiscalInvoiceNumber || !fiscalReason.trim()} onClick={requestFiscalAction}>
              Confirmar {fiscalAction === "cancel" ? "anulación" : "subsanación"}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setFiscalAction(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {message && <p style={{ fontSize: 13, marginBottom: 0 }}>{message}</p>}

      <h4>Cola AEAT ({submissions.length})</h4>
      {submissions.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: 13 }}>Todavía no hay paquetes preparados.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Factura</th><th>Tipo</th><th>Estado</th><th>Intentos</th><th>Respuesta AEAT</th><th></th></tr></thead>
            <tbody>
              {submissions.slice(0, 50).map((item) => (
                <tr key={item.id}>
                  <td>{item.invoiceNumber || item.invoiceId}</td>
                  <td>{item.recordType}</td>
                  <td>{STATUS_LABELS[item.status] || item.status}</td>
                  <td>{item.attempts || 0}</td>
                  <td style={{ maxWidth: 360, whiteSpace: "normal", fontSize: 12 }}>
                    {item.aeatResponse?.message || item.lastError ||
                      (item.aeatResponse?.code ? `Código ${item.aeatResponse.code}` : "—")}
                  </td>
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
