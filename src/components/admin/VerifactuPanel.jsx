import { useEffect, useMemo, useState } from "react";
import VerifactuDocuments from "./VerifactuDocuments";
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
  reconcileAeatCloudTestSubmission,
  requestAeatLocalTestReconciliation,
  sendAeatCloudTestSubmission,
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
  needs_review: "Necesita revisión",
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
  const [cloudSubmissionToSend, setCloudSubmissionToSend] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fiscalAction, setFiscalAction] = useState(null);
  const [fiscalInvoiceNumber, setFiscalInvoiceNumber] = useState("");
  const [fiscalReason, setFiscalReason] = useState("");
  const [fiscalCorrections, setFiscalCorrections] = useState({
    clientName: "",
    clientTaxId: "",
  });

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
    if (["paired", "connected"].includes(nextConnector.status)) {
      setPairing(null);
    }
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

  const chooseCertificateFile = () => {
    setProfile((current) => ({ ...current, channel: "cloud_certificate" }));
    setMessage("Selecciona el archivo .p12 o .pfx y escribe su contraseña para comprobarlo.");
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

  const sendCloudTest = () => {
    if (!cloudSubmissionToSend) return;
    const selected = cloudSubmissionToSend;
    run(async () => {
      await sendAeatCloudTestSubmission(selected.id);
      setCloudSubmissionToSend(null);
      await onInvoicesChanged?.();
    }, "Intento finalizado. Revisa el resultado o la incidencia indicada en la cola.");
  };

  const reconcileCloudTest = (item) => {
    if (!window.confirm(
      `¿Consultar en la AEAT de pruebas el estado de la factura ${item.invoiceNumber || item.invoiceId}? No se enviará ningún registro nuevo.`,
    )) return;
    run(async () => {
      if (profile.channel === "local_connector") {
        await requestAeatLocalTestReconciliation(item.id);
      } else {
        await reconcileAeatCloudTestSubmission(item.id);
      }
      await onInvoicesChanged?.();
    }, profile.channel === "local_connector"
      ? "Consulta preparada. El conector de Windows la realizará automáticamente."
      : "Consulta finalizada. Revisa el estado conciliado en la cola.");
  };

  const openFiscalAction = (kind) => {
    const candidates = invoices.filter(
      (invoice) =>
        invoice.status !== "draft" &&
        invoice.emissionMode === "verifactu_test" &&
        invoice.fiscalRecordId &&
        invoice.invoiceStatus !== "cancelled",
    );
    const selected = candidates.length === 1 ? candidates[0] : null;
    setFiscalAction(kind);
    setFiscalInvoiceNumber(
      selected ? String(selected.invoiceNumber || "") : "",
    );
    setFiscalReason("");
    setFiscalCorrections({
      clientName: selected?.client?.name || selected?.communityName || "",
      clientTaxId: selected?.client?.taxId || selected?.client?.cif || "",
    });
    setMessage("");
  };

  const requestFiscalAction = () =>
    run(async () => {
      const invoice = invoices.find(
        (item) => String(item.invoiceNumber) === fiscalInvoiceNumber.trim(),
      );
      if (!invoice) throw new Error("No se encontró esa factura en el periodo visible.");
      if (!fiscalReason.trim()) throw new Error("El motivo es obligatorio.");
      let result;
      if (fiscalAction === "cancel") {
        result = await cancelInvoiceFiscalRecord(invoice.id, fiscalReason.trim());
      } else {
        const corrections = {
          clientName: fiscalCorrections.clientName.trim(),
          clientTaxId: fiscalCorrections.clientTaxId.trim().toUpperCase(),
        };
        const originalName = String(
          invoice.client?.name || invoice.communityName || "",
        ).trim();
        const originalTaxId = String(
          invoice.client?.taxId || invoice.client?.cif || "",
        ).trim().toUpperCase();
        if (
          corrections.clientName === originalName &&
          corrections.clientTaxId === originalTaxId
        ) {
          throw new Error(
            "Modifica al menos el nombre o el NIF del cliente para crear una subsanación.",
          );
        }
        result = await subsanateInvoiceFiscalRecord(
          invoice.id,
          fiscalReason.trim(),
          corrections,
        );
      }
      await onInvoicesChanged?.();
      setFiscalAction(null);
      if (
        profile.channel === "cloud_certificate" &&
        certificate.connected &&
        result?.submissionId
      ) {
        setCloudSubmissionToSend({
          id: result.submissionId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          recordType:
            fiscalAction === "cancel" ? "anulacion" : "subsanacion",
        });
      }
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

      <section aria-label="Configuración y conexión" style={{ padding: 16, borderRadius: 10, background: "white", border: "1px solid #cbd5e1" }}>
      <h4 style={{ marginTop: 0 }}>Configuración y conexión</h4>
      <div className="grid grid-2 gap-4">
        <label className="form-group">
          <span className="form-label">Modo fiscal</span>
          <select
            className="form-input"
            value={enabled ? "test" : "disabled"}
            onChange={(event) => setEnabled(event.target.value === "test")}
          >
            <option value="disabled">Desactivado · solo borradores</option>
            <option value="test">VeriFactu de pruebas</option>
          </select>
          <small>Con VeriFactu desactivado puedes guardar borradores, pero no emitir facturas.</small>
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
          {["paired", "connected"].includes(connectorStatus.status) && !pairing ? (
            <>
              <p style={{ marginBottom: 6, color: connectorStatus.online ? "#15803d" : "#b45309" }}>
                <strong>{connectorStatus.online ? "Conector activo" : "Ordenador emparejado"}:</strong>{" "}
                {connectorStatus.connectorName || "Conector Windows"}
              </p>
              {connectorStatus.updateRequired && (
                <div role="alert" style={{ margin: "8px 0", padding: 10, background: "#fff7ed", color: "#92400e" }}>
                  Actualiza el conector para poder enviar con seguridad. Descarga el instalador, ejecútalo y reinicia Windows.
                  La vinculación y los resultados pendientes se conservan.
                  <br /><a className="btn btn-outline" href="/downloads/LimpiaGest-Conector-Windows.zip" download>Descargar actualización de Windows</a>
                </div>
              )}
              {connectorStatus.pendingReview && (
                <p role="alert" style={{ color: "#92400e", fontSize: 13 }}>
                  Hay un resultado protegido en este ordenador que necesita revisión. No borres ni vuelvas a emitir la factura.
                  Conserva el ordenador y su vinculación hasta resolver la incidencia.
                </p>
              )}
              {connectorStatus.certificateSubject && (
                <p style={{ margin: "4px 0", fontSize: 13 }}>{connectorStatus.certificateSubject}</p>
              )}
              <p style={{ margin: "4px 0", fontSize: 13 }}>
                {connectorStatus.certificateValidTo
                  ? `Certificado válido hasta ${new Date(connectorStatus.certificateValidTo).toLocaleDateString("es-ES")}`
                  : "Certificado pendiente de comprobación"}{" "}
                · servicio AEAT de pruebas {connectorStatus.aeatTestReachable ? "accesible" : "pendiente de comprobar"}.
              </p>
              {!connectorStatus.online && (
                <p style={{ margin: "6px 0", fontSize: 13, color: "#475569" }}>
                  La vinculación está guardada. El servicio se iniciará automáticamente al entrar en Windows.
                </p>
              )}
              <button type="button" className="btn btn-outline" disabled={busy} onClick={beginLocalPairing}>Cambiar de ordenador</button>
              <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} disabled={busy} onClick={refresh}>Actualizar estado</button>
              <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} disabled={busy} onClick={removeLocalConnector}>Desconectar</button>
            </>
          ) : (
            <>
              <p style={{ color: "#475569", fontSize: 13 }}>
                Esta opción sirve cuando Windows protege la clave y no permite exportarla. El certificado nunca sale del ordenador.
              </p>
              <ol style={{ color: "#475569", fontSize: 13, paddingLeft: 20 }}>
                <li>Genera un código temporal.</li>
                <li>Pulsa <strong>Abrir conector automáticamente</strong>. El código se enviará solo: no tienes que copiarlo ni escribirlo.</li>
                <li>Si el navegador no abre el conector, utiliza la alternativa manual que aparecerá junto al código.</li>
              </ol>
              {!pairing ? (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={beginLocalPairing}>Conectar este ordenador</button>
              ) : (
                <div style={{ padding: 12, borderRadius: 8, background: "#f1f5f9" }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Código válido durante 10 minutos</p>
                  <p style={{ margin: "6px 0", fontSize: 24, fontWeight: 700, letterSpacing: 3 }}>{pairing.pairingCode}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Identificador: {pairing.companyId}</p>
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 7, background: "#dcfce7", color: "#166534", fontSize: 13 }}>
                    <strong>Opción recomendada:</strong> pulsa el botón azul. El código se copiará al conector automáticamente y no tendrás que escribirlo.
                  </div>
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
                      ? "Alternativa manual: pulsa “Copiar código”, abre el menú Inicio de Windows, busca “Conectar LimpiaGest VeriFactu” y pega el código."
                      : "Si no aparece ninguna ventana al pulsar el botón azul, utiliza “Copiar código” y sigue la alternativa manual."}
                  </p>
                  <a className="btn btn-outline" style={{ display: "inline-block", marginTop: 10 }} href="/downloads/LimpiaGest-Conector-Windows.zip" download>
                    Descargar instalador para Windows
                  </a>
                  <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} disabled={busy} onClick={refresh}>Ya lo he conectado</button>
                </div>
              )}
            </>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: "#475569" }}>
              <strong>¿Tienes el archivo original .p12 o .pfx?</strong>{" "}
              Puedes seleccionarlo directamente si Windows no dispone de una clave privada utilizable.
            </p>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={chooseCertificateFile}>
              Seleccionar archivo PFX/P12
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={saveConfiguration}>Guardar configuración</button>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#475569" }}>
          Guarda el modo fiscal y la forma de conexión. El certificado se guarda al conectarlo. No envía facturas a la AEAT.
        </p>
      </div>
      </section>

      <VerifactuDocuments key={companyId} companyId={companyId} />

      <section aria-label="Cola AEAT" style={{ marginTop: 24 }}>
      <h4 style={{ marginTop: 0 }}>Cola AEAT ({submissions.length})</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, marginBottom: 14 }}>
        <button type="button" className="btn btn-outline" disabled={busy || profile.channel === "disabled"} onClick={preparePending}>Preparar pendientes ({eligibleInvoices.length})</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => openFiscalAction("cancel")}>Anular registro</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => openFiscalAction("subsanate")}>Subsanar registro</button>
      </div>
      {fiscalAction && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: "#fff", border: "1px solid #bfdbfe" }}>
          <strong>{fiscalAction === "cancel" ? "Anular registro fiscal" : "Subsanar registro fiscal"}</strong>
          <label className="form-group" style={{ display: "block", marginTop: 10 }}>
            <span className="form-label">Factura</span>
            <select
              className="form-input"
              value={fiscalInvoiceNumber}
              onChange={(event) => {
                const nextNumber = event.target.value;
                const nextInvoice = invoices.find(
                  (invoice) => String(invoice.invoiceNumber) === nextNumber,
                );
                setFiscalInvoiceNumber(nextNumber);
                setFiscalCorrections({
                  clientName:
                    nextInvoice?.client?.name ||
                    nextInvoice?.communityName ||
                    "",
                  clientTaxId:
                    nextInvoice?.client?.taxId ||
                    nextInvoice?.client?.cif ||
                    "",
                });
              }}
            >
              <option value="">Selecciona una factura</option>
              {invoices.filter((invoice) =>
                invoice.status !== "draft" &&
                invoice.emissionMode === "verifactu_test" &&
                invoice.fiscalRecordId &&
                invoice.invoiceStatus !== "cancelled"
              ).map((invoice) => (
                <option key={invoice.id} value={invoice.invoiceNumber}>
                  {invoice.invoiceNumber} · {invoice.client?.name || invoice.communityName || "Sin cliente"}
                </option>
              ))}
            </select>
          </label>
          {fiscalAction === "subsanate" && (
            <>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#475569" }}>
                Corrige al menos uno de estos datos. El registro original se conservará sin cambios.
              </p>
              <div className="grid grid-2 gap-4" style={{ marginTop: 10 }}>
                <label className="form-group">
                  <span className="form-label">Nombre o razón social corregido</span>
                  <input
                    className="form-input"
                    value={fiscalCorrections.clientName}
                    onChange={(event) => setFiscalCorrections((current) => ({
                      ...current,
                      clientName: event.target.value,
                    }))}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">NIF/CIF corregido</span>
                  <input
                    className="form-input"
                    value={fiscalCorrections.clientTaxId}
                    onChange={(event) => setFiscalCorrections((current) => ({
                      ...current,
                      clientTaxId: event.target.value,
                    }))}
                  />
                </label>
              </div>
            </>
          )}
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
          {profile.channel === "cloud_certificate" && certificate.connected && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#92400e" }}>
              Después aparecerá la confirmación de envío. Confírmala cuanto antes. Si el envío se demora, revisa la incidencia sin borrar ni volver a emitir la factura.
            </p>
          )}
        </div>
      )}
      {message && <p style={{ fontSize: 13, marginBottom: 0 }}>{message}</p>}

      {cloudSubmissionToSend && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: "#fff7ed", border: "1px solid #fdba74" }}>
          <strong>Confirmar envío al entorno de pruebas de la AEAT</strong>
          <p style={{ margin: "8px 0", fontSize: 13, color: "#7c2d12" }}>
            Se enviará el registro <strong>{cloudSubmissionToSend.recordType}</strong> de la factura{" "}
            <strong>{cloudSubmissionToSend.invoiceNumber || cloudSubmissionToSend.invoiceId}</strong> utilizando el certificado conectado.
            La producción continúa bloqueada.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={sendCloudTest}>
              Sí, enviar prueba a la AEAT
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setCloudSubmissionToSend(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

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
                    {item.reconciliation?.message || item.lastError || item.aeatResponse?.message ||
                      (item.aeatResponse?.code ? `Código ${item.aeatResponse.code}` : "—")}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => downloadPackage(item.id)}>XML</button>
                      {profile.channel === "cloud_certificate" && certificate.connected && ["awaiting_sender", "awaiting_local_connector", "awaiting_cloud_sender", "retry_pending"].includes(item.status) && (
                        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => setCloudSubmissionToSend(item)}>
                          Enviar prueba
                        </button>
                      )}
                      {((profile.channel === "cloud_certificate" && certificate.connected) ||
                        (profile.channel === "local_connector" && connectorStatus.online && !connectorStatus.updateRequired)) && item.status === "needs_review" && (
                        <button type="button" className="btn btn-sm btn-primary" disabled={busy || ["processing", "awaiting_local_connector"].includes(item.reconciliation?.status)} onClick={() => reconcileCloudTest(item)}>
                          {item.reconciliation?.status === "awaiting_local_connector" ? "Pendiente del conector" : "Comprobar en AEAT"}
                        </button>
                      )}
                    </div>
                  </td>
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
    </section>
  );
}
