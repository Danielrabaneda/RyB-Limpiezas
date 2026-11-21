import { useEffect, useRef, useState } from "react";
import { uploadVerifactuDocument, listVerifactuDocuments, downloadVerifactuDocument } from "../../services/verifactuDocumentService";

export default function VerifactuDocuments({ companyId }) {
  const [documents, setDocuments] = useState([]);
  const [pageToken, setPageToken] = useState();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [signatureKind, setSignatureKind] = useState("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setDocuments([]); setPageToken(undefined); setFile(null); setTitle("");
    setSignatureKind("none"); setMessage(""); setLoading(true);
    if (input.current) input.current.value = "";
    if (!companyId) { setLoading(false); return; }
    listVerifactuDocuments(companyId).then((result) => {
      if (current !== generation.current) return;
      setDocuments(result.documents); setPageToken(result.nextPageToken);
    }).catch(() => {
      if (current === generation.current) setMessage("No se pudieron cargar los documentos. Pulsa Actualizar para reintentar.");
    }).finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [companyId]);

  async function refresh(more = false) {
    const current = generation.current;
    setLoading(true); setMessage("");
    try {
      const result = await listVerifactuDocuments(companyId, more ? pageToken : undefined);
      if (current !== generation.current) return;
      setDocuments((previous) => more ? [...previous, ...result.documents] : result.documents);
      setPageToken(result.nextPageToken);
    } catch { if (current === generation.current) setMessage("No se pudieron cargar los documentos. Vuelve a intentarlo."); }
    finally { if (current === generation.current) setLoading(false); }
  }

  async function upload(event) {
    event.preventDefault();
    const current = generation.current;
    setBusy(true); setMessage("");
    try {
      await uploadVerifactuDocument(companyId, { file, title, signatureKind });
      if (current !== generation.current) return;
      setFile(null); setTitle(""); setSignatureKind("none");
      if (input.current) input.current.value = "";
      try {
        const result = await listVerifactuDocuments(companyId);
        if (current !== generation.current) return;
        setDocuments(result.documents); setPageToken(result.nextPageToken);
        setMessage("Documento guardado. No se ha modificado el estado de producción.");
      } catch { if (current === generation.current) setMessage("Documento guardado. Pulsa Actualizar para verlo; no lo subas otra vez."); }
    } catch (error) {
      if (current === generation.current) setMessage(error.code ? "No se pudo guardar el documento. Comprueba tu conexión y tus permisos de administrador." : error.message);
    } finally { setBusy(false); }
  }

  async function download(document) {
    const current = generation.current;
    setBusy(true); setMessage("");
    try {
      const bytes = await downloadVerifactuDocument(companyId, document.path);
      if (current !== generation.current) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${document.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120)}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { if (current === generation.current) setMessage("No se pudo descargar el PDF. Comprueba tu conexión y tus permisos."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Documentación VeriFactu" style={{ marginTop: 24, padding: 18, border: "1px solid #bfdbfe", borderRadius: 10, background: "#fff" }}>
    <h4 style={{ margin: "0 0 8px" }}>Documentación VeriFactu</h4>
    <p style={{ fontSize: 13 }}>Archivo privado de informes y evidencias de pruebas, solo para administradores de esta empresa. Guardar un documento no sustituye la declaración responsable ni desbloquea producción.</p>
    <form onSubmit={upload}>
      <label className="form-group" style={{ display: "block" }}>Título del documento
        <input className="form-input" value={title} maxLength={120} required disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder="Por ejemplo: Informe de pruebas firmado" />
      </label>
      <label className="form-group" style={{ display: "block" }}>Archivo PDF (máximo 10 MB)
        <input ref={input} type="file" accept=".pdf,application/pdf" required disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <label className="form-group" style={{ display: "block" }}>Firma del documento
        <select className="form-input" value={signatureKind} disabled={busy} onChange={(e) => setSignatureKind(e.target.value)}>
          <option value="none">Sin firma indicada</option>
          <option value="handwritten">Firma manuscrita</option>
        </select>
      </label>
      <p style={{ fontSize: 12, color: "#475569" }}>El tipo de firma lo indica quien sube el archivo; no es una validación de firma electrónica. Conservamos el PDF original sin modificarlo. No subas certificados P12/PFX ni contraseñas aquí.</p>
      <button type="submit" className="btn btn-primary" disabled={busy || !companyId || !file || !title.trim()}>{busy ? "Procesando…" : "Guardar documento"}</button>
      <button type="button" className="btn btn-outline" style={{ marginLeft: 8 }} disabled={busy || loading || !companyId} onClick={() => refresh()}>Actualizar documentos</button>
    </form>
    {message && <p role="status">{message}</p>}
    {loading && <p role="status">Cargando documentos…</p>}
    {!loading && !message && !documents.length && <p>No hay documentos guardados.</p>}
    <ul style={{ listStyle: "none", padding: 0 }}>
      {documents.map((document) => <li key={document.path} style={{ borderTop: "1px solid #e2e8f0", padding: "14px 0" }}>
        <strong style={{ overflowWrap: "anywhere" }}>{document.title}</strong>
        <p style={{ fontSize: 13, margin: "6px 0" }}>{document.signatureKind === "handwritten" ? "Firma manuscrita indicada" : "Sin firma indicada"} · Guardado el {new Date(document.createdAt).toLocaleDateString("es-ES")} · {(document.size / 1024).toFixed(0)} KB</p>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => download(document)}>Descargar PDF</button>
      </li>)}
    </ul>
    {pageToken && <button type="button" className="btn btn-outline" disabled={busy || loading} onClick={() => refresh(true)}>Cargar más documentos</button>}
  </section>;
}
