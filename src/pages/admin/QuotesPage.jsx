import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTenant } from "../../contexts/TenantContext";
import { getCommunities } from "../../services/communityService";
import { getBillingSettings } from "../../services/invoiceService";
import {
  convertQuoteToInvoice,
  convertQuoteToService,
  createQuote,
  deleteDraftQuote,
  duplicateQuote,
  getQuotes,
  setQuoteStatus,
  sendQuoteEmail,
  uploadQuotePdf,
  updateQuote,
} from "../../services/quoteService";
import "./QuotesPage.css";

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const today = () => new Date().toISOString().slice(0, 10);
const future = (days = 30) => {
  const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10);
};
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const TEMPLATES = [
  { id: "communities", icon: "🏢", name: "Limpieza de comunidades", subtitle: "Portales, escaleras, garajes y zonas comunes", lines: [
    ["Limpieza de portal y escaleras", "Barrido, fregado y limpieza de pasamanos", 1, "mes", 285, 21, "Zonas comunes"],
    ["Limpieza de garaje", "Barrido mecánico y retirada de residuos", 450, "m²", 0.32, 21, "Garaje"],
    ["Cristales de acceso", "Limpieza interior y exterior", 2, "ud.", 14, 21, "Zonas comunes"],
  ]},
  { id: "offices", icon: "💼", name: "Oficinas y locales", subtitle: "Puestos, aseos y zonas de atención", lines: [
    ["Limpieza general de oficina", "Puestos, mobiliario, suelos y papeleras", 12, "h", 18.5, 21, "Oficinas"],
    ["Limpieza de aseos", "Limpieza y desinfección completa", 4, "ud.", 12, 21, "Aseos"],
  ]},
  { id: "construction", icon: "🏗️", name: "Fin de obra", subtitle: "Retirada de polvo y restos post-reforma", lines: [
    ["Limpieza post-obra", "Desempolvado profundo de superficies y suelos", 120, "m²", 2.8, 21, "Limpieza general"],
    ["Retirada de restos", "Recogida y embolsado de residuos ligeros", 6, "h", 22, 21, "Remates"],
  ]},
  { id: "homes", icon: "🏠", name: "Viviendas", subtitle: "Limpieza puntual o recurrente", lines: [["Limpieza general de vivienda", "Cocina, baños, dormitorios y salón", 4, "h", 17.5, 10, "Vivienda"]]},
  { id: "industrial", icon: "🏭", name: "Industrial y almacenes", subtitle: "Naves, maquinaria y suelos técnicos", lines: [["Limpieza de nave", "Barrido y fregado industrial", 800, "m²", 0.48, 21, "Nave"]]},
  { id: "special", icon: "✨", name: "Servicios especiales", subtitle: "Cristales, moquetas y desinfección", lines: [["Limpieza de cristales", "Cristales accesibles por ambas caras", 35, "m²", 2.2, 21, "Especiales"], ["Desinfección", "Aplicación de producto homologado", 1, "servicio", 95, 21, "Especiales"]]},
];

const blankLine = () => ({ id: uid(), section: "Servicio", concept: "", description: "", frequency: "punctual", quantity: 1, unit: "h", unitPrice: 0, discount: 0, tax: 21 });
const templateLines = (template) => template.lines.map(([concept, description, quantity, unit, unitPrice, tax, section]) => ({ id: uid(), concept, description, frequency: template.id === "communities" || template.id === "offices" ? "weekly" : "punctual", quantity, unit, unitPrice, discount: 0, tax, section }));
const calculate = (lines) => {
  const normalized = lines.map((line) => {
    const base = Number(line.quantity || 0) * Number(line.unitPrice || 0);
    const net = base * (1 - Number(line.discount || 0) / 100);
    return { ...line, total: net, taxAmount: net * Number(line.tax || 0) / 100 };
  });
  const subtotal = normalized.reduce((sum, line) => sum + line.total, 0);
  const taxTotal = normalized.reduce((sum, line) => sum + line.taxAmount, 0);
  return { lines: normalized, subtotal, taxTotal, total: subtotal + taxTotal };
};

const STATUS = {
  draft: ["Borrador", "gray"], sent: ["Enviado", "blue"], viewed: ["Visto", "purple"], accepted: ["Aceptado", "green"],
  rejected: ["Rechazado", "red"], expired: ["Caducado", "orange"], converted_service: ["Servicio activo", "green"], converted_invoice: ["Facturado", "blue"],
};

const LINE_FREQUENCIES = [
  ["punctual", "Puntual"], ["daily", "Diaria"], ["weekly", "Semanal"],
  ["biweekly", "Quincenal"], ["monthly", "Mensual"], ["quarterly", "Trimestral"], ["annual", "Anual"],
];
const frequencyLabel = (value) => LINE_FREQUENCIES.find(([key]) => key === value)?.[1] || "Puntual";
const INSURANCE_OPTIONS = ["Responsabilidad civil", "Accidentes laborales", "Daños a terceros", "Seguro de convenio"];

export default function QuotesPage() {
  const { companyId } = useTenant();
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [quotes, setQuotes] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [savedState, setSavedState] = useState("Guardado");
  const autosaveRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [allQuotes, clients, billing] = await Promise.all([getQuotes(companyId), getCommunities(companyId), getBillingSettings(companyId)]);
      setQuotes(allQuotes); setCommunities(clients); setSettings(billing || {});
      const openId = params.get("editar");
      if (openId) setEditing(allQuotes.find((item) => item.id === openId) || null);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (companyId) load(); }, [companyId]);
  useEffect(() => () => clearTimeout(autosaveRef.current), []);

  const filtered = quotes.filter((quote) => {
    const haystack = `${quote.number} ${quote.clientName} ${quote.serviceType}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (statusFilter === "all" || quote.status === statusFilter);
  });
  const stats = useMemo(() => ({
    open: quotes.filter((q) => ["sent", "viewed"].includes(q.status)).length,
    value: quotes.filter((q) => ["sent", "viewed"].includes(q.status)).reduce((s, q) => s + (q.total || 0), 0),
    conversion: quotes.filter((q) => q.status !== "draft").length ? Math.round(quotes.filter((q) => ["accepted", "converted_service", "converted_invoice"].includes(q.status)).length / quotes.filter((q) => q.status !== "draft").length * 100) : 0,
  }), [quotes]);

  const startQuote = async (template = TEMPLATES[0]) => {
    const clientId = params.get("cliente") || "";
    const client = communities.find((c) => c.id === clientId);
    const calc = calculate(templateLines(template));
    const data = {
      title: template.name, serviceType: template.id, clientMode: clientId ? "existing" : "new", clientId, clientName: client?.name || "", clientAddress: client?.address || "", clientEmail: client?.email || "", clientPhone: client?.contactPhone || client?.phone || "",
      opportunityId: params.get("oportunidad") || "",
      issueDate: today(), validUntil: future(30), year: new Date().getFullYear(), owner: userProfile?.name || currentUser?.email || "", paymentTerms: "Transferencia bancaria a 30 días",
      frequency: template.id === "communities" || template.id === "offices" ? "weekly" : "punctual", includesMaterials: true, showTaxBreakdown: true,
      showInsurance: true, insurances: ["Responsabilidad civil"], insuranceDetails: "Póliza en vigor. Certificado disponible a solicitud del cliente.",
      internalNotes: "", clientNotes: "Incluye mano de obra, materiales y desplazamiento salvo indicación expresa.", ...calc,
    };
    const id = await createQuote(companyId, data, currentUser);
    const next = { id, number: "Nuevo presupuesto", status: "draft", version: 1, ...data, activity: [] };
    setEditing(next); setParams({ editar: id }); setQuotes((old) => [next, ...old]);
  };

  const change = (field, value) => {
    setEditing((old) => ({ ...old, [field]: value }));
    setSavedState("Guardando…");
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      const latest = { ...editing, [field]: value };
      await updateQuote(companyId, latest.id, { ...latest, contentChanged: true }, currentUser);
      setSavedState("Guardado ahora");
    }, 1100);
  };
  const changeLine = (id, field, value) => {
    const lines = editing.lines.map((line) => line.id === id ? { ...line, [field]: ["quantity", "unitPrice", "discount", "tax"].includes(field) ? Number(value) : value } : line);
    changeCalculated(lines);
  };
  const changeCalculated = (lines) => {
    const calc = calculate(lines); setEditing((old) => ({ ...old, ...calc })); setSavedState("Guardando…");
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => { await updateQuote(companyId, editing.id, { ...editing, ...calc, contentChanged: true }, currentUser); setSavedState("Guardado ahora"); }, 1100);
  };
  const selectClient = (id) => {
    const client = communities.find((item) => item.id === id);
    const clientData = { clientId: id, clientName: client?.name || "", clientAddress: client?.address || "", clientEmail: client?.email || "", clientPhone: client?.contactPhone || client?.phone || "", clientTaxId: client?.cif || client?.nif || "" };
    setEditing((old) => ({ ...old, ...clientData }));
    setSavedState("Guardando…");
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      await updateQuote(companyId, editing.id, { ...editing, ...clientData, contentChanged: true }, currentUser);
      setSavedState("Guardado ahora");
    }, 500);
  };
  const closeEditor = async () => { clearTimeout(autosaveRef.current); await updateQuote(companyId, editing.id, { ...editing, contentChanged: true }, currentUser); setEditing(null); setParams({}); await load(); };
  const statusAction = async (status, extra = {}) => { await setQuoteStatus(companyId, editing, status, currentUser, extra); setEditing((old) => ({ ...old, status, ...extra })); setQuotes((old) => old.map((q) => q.id === editing.id ? { ...q, status, ...extra } : q)); };
  const removeDraft = async (quote) => {
    if (!confirm(`¿Eliminar el borrador ${quote.number || "seleccionado"}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDraftQuote(companyId, quote.id);
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
    } catch (error) {
      alert(error.message || "No se pudo eliminar el borrador.");
    }
  };

  const generatePdf = (download = true) => {
    const pdf = new jsPDF(); const accent = settings.brandColor || "#2563eb";
    pdf.setFillColor(accent); pdf.rect(0, 0, 210, 9, "F");
    if (settings.logoBase64) { try { pdf.addImage(settings.logoBase64, "PNG", 15, 18, settings.logoWidth || 42, settings.logoHeight || 18); } catch {} }
    pdf.setFontSize(21); pdf.setTextColor(15, 23, 42); pdf.text("PRESUPUESTO", 195, 25, { align: "right" });
    pdf.setFontSize(10); pdf.setTextColor(100); pdf.text(editing.number || "BORRADOR", 195, 32, { align: "right" });
    pdf.setTextColor(30); pdf.setFontSize(11); pdf.text(settings.companyName || "LimpiaGest", 15, 48); pdf.setFontSize(8); pdf.setTextColor(95);
    pdf.text([settings.nif || "", settings.address || "", settings.phone || ""].filter(Boolean), 15, 54);
    pdf.setFontSize(9); pdf.setTextColor(30); pdf.text("CLIENTE", 120, 47); pdf.setTextColor(95); pdf.text([editing.clientName || "Sin cliente", editing.clientAddress || "", editing.clientTaxId || ""].filter(Boolean), 120, 53);
    pdf.setDrawColor(220); pdf.line(15, 70, 195, 70); pdf.setTextColor(30); pdf.text(`Emisión: ${editing.issueDate}`, 15, 77); pdf.text(`Válido hasta: ${editing.validUntil}`, 75, 77); pdf.text(`Responsable: ${editing.owner}`, 135, 77);
    autoTable(pdf, { startY: 87, head: [["Concepto y descripción", "Frecuencia", "Cant.", "Precio", "Dto.", "IVA", "Total"]], body: editing.lines.map((l) => [`${l.concept}\n${l.description || ""}`, frequencyLabel(l.frequency), `${l.quantity} ${l.unit}`, money.format(l.unitPrice), `${l.discount}%`, `${l.tax}%`, money.format(l.total)]), headStyles: { fillColor: accent }, styles: { fontSize: 7.5, cellPadding: 2.3 }, columnStyles: { 0: { cellWidth: 67 }, 1: { cellWidth: 22 } } });
    const y = pdf.lastAutoTable.finalY + 10; pdf.setFontSize(9); pdf.text(`Base imponible: ${money.format(editing.subtotal)}`, 195, y, { align: "right" }); if (editing.showTaxBreakdown) pdf.text(`IVA: ${money.format(editing.taxTotal)}`, 195, y + 6, { align: "right" }); pdf.setFontSize(15); pdf.setTextColor(accent); pdf.text(`TOTAL: ${money.format(editing.total)}`, 195, y + 15, { align: "right" });
    pdf.setFontSize(8); pdf.setTextColor(90); pdf.text(pdf.splitTextToSize(editing.clientNotes || "", 175), 15, y + 25);
    if (editing.showInsurance && editing.insurances?.length) { pdf.setFont(undefined, "bold"); pdf.text("Seguros y garantías", 15, y + 39); pdf.setFont(undefined, "normal"); pdf.text(pdf.splitTextToSize(`${editing.insurances.join(" · ")}. ${editing.insuranceDetails || ""}`, 175), 15, y + 44); }
    pdf.text(settings.quoteFooter || "Este presupuesto tiene carácter confidencial. La aceptación puede formalizarse mediante firma o confirmación escrita.", 105, 286, { align: "center", maxWidth: 180 });
    if (download) pdf.save(`${editing.number || "Presupuesto"}.pdf`);
    return download ? null : pdf.output("blob");
  };

  if (editing) return <QuoteEditor quote={editing} communities={communities} settings={settings} savedState={savedState} onChange={change} onClient={selectClient} onLine={changeLine} onLines={changeCalculated} onClose={closeEditor} onPdf={generatePdf} onStatus={statusAction} onEmail={async (options) => { const blob = generatePdf(false); await uploadQuotePdf(companyId, editing.id, blob, `${editing.number}.pdf`); await sendQuoteEmail(companyId, editing.id, options); await statusAction("sent", { sentAt: new Date().toISOString(), sentChannel: "email" }); }} onWhatsApp={async () => { const blob = generatePdf(false); const file = new File([blob], `${editing.number}.pdf`, { type: "application/pdf" }); const message = `Hola ${editing.clientName || ""}, te enviamos el presupuesto ${editing.number} por importe de ${money.format(editing.total)}. Quedamos a tu disposición para cualquier consulta.`; if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: `Presupuesto ${editing.number}`, text: message, files: [file] }); } else { const phone = String(editing.clientPhone || "").replace(/\D/g, ""); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); generatePdf(true); } await statusAction("sent", { sentAt: new Date().toISOString(), sentChannel: "whatsapp" }); }} onInvoice={async () => { const id = await convertQuoteToInvoice(companyId, editing); await statusAction("converted_invoice", { invoiceId: id }); navigate("/admin/facturas"); }} onService={async () => { if (!confirm("Se crearán las tareas activas de este presupuesto en la planificación. ¿Continuar?")) return; const ids = await convertQuoteToService(companyId, editing); await statusAction("converted_service", { serviceTaskIds: ids }); alert(`${ids.length} servicios creados en la planificación.`); }} />;

  return <div className="quotes-page">
    <div className="quotes-hero"><div><span className="quotes-eyebrow">COMERCIAL</span><h2>Presupuestos</h2><p>Crea propuestas profesionales y conviértelas en servicios sin volver a introducir datos.</p></div><button className="quote-primary" onClick={() => startQuote()}>＋ Nuevo presupuesto</button></div>
    <div className="quote-stats"><article><span>Pendientes de respuesta</span><strong>{stats.open}</strong><small>{money.format(stats.value)} en negociación</small></article><article><span>Tasa de conversión</span><strong>{stats.conversion}%</strong><small>Sobre presupuestos enviados</small></article><article><span>Total este año</span><strong>{quotes.length}</strong><small>{quotes.filter((q) => q.status === "draft").length} en borrador</small></article></div>
    <div className="quote-toolbar"><div className="quote-search">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o número…" /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos los estados</option>{Object.entries(STATUS).map(([key, val]) => <option key={key} value={key}>{val[0]}</option>)}</select><button className="quote-secondary" onClick={() => document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" })}>Ver plantillas</button></div>
    <div className="quote-table-card">{loading ? <div className="quote-empty">Cargando presupuestos…</div> : filtered.length === 0 ? <div className="quote-empty"><div>🧾</div><h3>Aún no hay presupuestos</h3><p>Empieza desde una plantilla específica de limpieza.</p><button className="quote-primary" onClick={() => startQuote()}>Crear el primero</button></div> : <table><thead><tr><th>Presupuesto</th><th>Cliente</th><th>Servicio</th><th>Estado</th><th>Validez</th><th className="right">Importe</th><th>Acciones</th></tr></thead><tbody>{filtered.map((q) => <tr key={q.id} onClick={() => { setEditing(q); setParams({ editar: q.id }); }}><td><strong>{q.number}</strong><small>v{q.version || 1} · {q.issueDate}</small></td><td><strong>{q.clientName || "Sin asignar"}</strong><small>{q.clientAddress || "—"}</small></td><td>{TEMPLATES.find((t) => t.id === q.serviceType)?.name || q.title}</td><td><span className={`quote-status ${STATUS[q.status]?.[1] || "gray"}`}>● {STATUS[q.status]?.[0] || q.status}</span></td><td>{q.validUntil}</td><td className="right"><strong>{money.format(q.total || 0)}</strong></td><td><div className="quote-row-actions">{q.status === "draft" && <button className="quote-delete-draft" title="Eliminar borrador" aria-label={`Eliminar ${q.number}`} onClick={(event) => { event.stopPropagation(); removeDraft(q); }}>🗑</button>}<button className="quote-icon" title="Abrir presupuesto">›</button></div></td></tr>)}</tbody></table>}</div>
    <section id="templates" className="quote-templates"><div className="section-heading"><div><span className="quotes-eyebrow">ATAJOS</span><h3>Empezar desde una plantilla</h3></div><p>Partidas y precios editables</p></div><div className="template-grid">{TEMPLATES.map((template) => <button key={template.id} onClick={() => startQuote(template)}><span>{template.icon}</span><strong>{template.name}</strong><small>{template.subtitle}</small><em>Usar plantilla →</em></button>)}</div></section>
  </div>;
}

function QuoteEditor({ quote, communities, settings, savedState, onChange, onClient, onLine, onLines, onClose, onPdf, onStatus, onEmail, onWhatsApp, onInvoice, onService }) {
  const [tab, setTab] = useState("editor");
  const [more, setMore] = useState(false);
  const [sendModal, setSendModal] = useState(false);
  const [clientMode, setClientMode] = useState(quote.clientMode || (quote.clientId ? "existing" : "new"));
  const groups = [...new Set(quote.lines.map((l) => l.section || "Servicio"))];
  const addLine = (section = groups.at(-1) || "Servicio") => onLines([...quote.lines, { ...blankLine(), section }]);
  const addSection = () => {
    const name = prompt("Nombre de la nueva zona o sección:", "Nueva zona")?.trim();
    if (name) onLines([...quote.lines, { ...blankLine(), section: name }]);
  };
  const deleteSection = (section) => {
    const count = quote.lines.filter((line) => line.section === section).length;
    if (confirm(`¿Eliminar la zona «${section}» y sus ${count} partida${count === 1 ? "" : "s"}?`)) {
      onLines(quote.lines.filter((line) => line.section !== section));
    }
  };
  const toggleInsurance = (insurance) => {
    const current = quote.insurances || [];
    onChange("insurances", current.includes(insurance) ? current.filter((item) => item !== insurance) : [...current, insurance]);
  };
  return <div className="quote-editor-shell">
    <div className="editor-top"><button className="quote-back" onClick={onClose}>←</button><div><div className="editor-title"><input value={quote.title} onChange={(e) => onChange("title", e.target.value)} /><span className={`quote-status ${STATUS[quote.status]?.[1]}`}>● {STATUS[quote.status]?.[0]}</span></div><p>{quote.number} · Versión {quote.version || 1} <span className="autosave">✓ {savedState}</span></p></div><div className="editor-actions"><button className="quote-secondary" onClick={() => onPdf(true)}>↓ PDF</button><button className="quote-primary" onClick={() => setSendModal(true)}>↗ Enviar</button><div className="more-wrap"><button className="quote-secondary" onClick={() => setMore(!more)}>•••</button>{more && <div className="more-menu"><button onClick={() => onStatus("viewed")}>Marcar como visto</button><button onClick={() => onStatus("accepted")}>Registrar aceptación</button><button onClick={() => { const reason = prompt("Motivo del rechazo:") || "Sin motivo"; onStatus("rejected", { rejectionReason: reason }); }}>Registrar rechazo</button><button onClick={onService}>Convertir a servicio activo</button><button onClick={onInvoice}>Convertir a factura</button></div>}</div></div></div>
    <div className="mobile-tabs"><button className={tab === "editor" ? "active" : ""} onClick={() => setTab("editor")}>Editor</button><button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>Vista PDF</button></div>
    <div className="editor-grid"><main className={tab === "editor" ? "editor-form active" : "editor-form"}>
      <section className="editor-card"><div className="client-card-heading"><div><h3>Cliente y condiciones</h3><p>Selecciona un cliente guardado o introduce los datos de uno nuevo.</p></div><div className="client-mode-switch"><button className={clientMode === "existing" ? "active" : ""} onClick={() => { setClientMode("existing"); onChange("clientMode", "existing"); }}>Cliente existente</button><button className={clientMode === "new" ? "active" : ""} onClick={() => { setClientMode("new"); onChange("clientMode", "new"); }}>＋ Cliente nuevo</button></div></div><div className="form-grid">{clientMode === "existing" ? <label className="wide">Cliente / comunidad *<select value={quote.clientId || ""} onChange={(e) => onClient(e.target.value)}><option value="">Seleccionar del CRM…</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <div className="new-client-fields wide"><div className="new-client-notice"><span>👤</span><div><b>Presupuesto para un cliente nuevo</b><small>No es necesario darlo de alta previamente. Podrás convertirlo en cliente cuando acepte el presupuesto.</small></div></div><label>Nombre o razón social *<input autoFocus value={quote.clientName || ""} onChange={(e) => onChange("clientName", e.target.value)} placeholder="Ej. Comunidad Residencial Los Olivos" /></label><label>NIF / CIF<input value={quote.clientTaxId || ""} onChange={(e) => onChange("clientTaxId", e.target.value)} placeholder="B12345678" /></label><label className="full">Dirección<input value={quote.clientAddress || ""} onChange={(e) => onChange("clientAddress", e.target.value)} placeholder="Calle, número, código postal y localidad" /></label><label>Email<input type="email" value={quote.clientEmail || ""} onChange={(e) => onChange("clientEmail", e.target.value)} placeholder="cliente@email.com" /></label><label>Teléfono / WhatsApp<input type="tel" value={quote.clientPhone || ""} onChange={(e) => onChange("clientPhone", e.target.value)} placeholder="+34 600 000 000" /></label></div>}<label>Fecha de emisión<input type="date" value={quote.issueDate} onChange={(e) => onChange("issueDate", e.target.value)} /></label><label>Válido hasta<input type="date" value={quote.validUntil} onChange={(e) => onChange("validUntil", e.target.value)} /></label><label>Responsable comercial<input value={quote.owner} onChange={(e) => onChange("owner", e.target.value)} /></label><label>Frecuencia<select value={quote.frequency} onChange={(e) => onChange("frequency", e.target.value)}><option value="punctual">Puntual</option><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="monthly">Mensual</option></select></label><label className="wide">Condiciones de pago<input value={quote.paymentTerms} onChange={(e) => onChange("paymentTerms", e.target.value)} /></label></div>
      </section>
      <section className="editor-card lines-card"><div className="section-heading"><div><h3>Partidas del presupuesto</h3><p>Crea, renombra o elimina las zonas que necesites.</p></div><div className="lines-main-actions"><button className="quote-secondary" onClick={addSection}>＋ Nueva zona</button><button className="quote-secondary" onClick={() => addLine()}>＋ Añadir partida</button></div></div>{groups.length === 0 && <div className="empty-lines"><span>▦</span><strong>El presupuesto no tiene zonas ni partidas</strong><p>Crea una zona para empezar a detallar el servicio.</p><button className="quote-primary" onClick={addSection}>＋ Crear primera zona</button></div>}{groups.map((group) => <div className="line-group" key={group}><div className="group-title"><input value={group} title="Haz clic para renombrar la zona" onChange={(e) => onLines(quote.lines.map((l) => l.section === group ? { ...l, section: e.target.value } : l))} /><span>{quote.lines.filter((l) => l.section === group).length} partidas</span><small>✎ Puedes renombrarla</small><button className="delete-section" onClick={() => deleteSection(group)}>🗑 Eliminar zona</button></div><div className="line-table"><div className="line-head"><span>Concepto / descripción</span><span>Frecuencia</span><span>Cantidad</span><span>Unidad</span><span>Precio</span><span>Dto.</span><span>IVA</span><span>Total</span><span></span></div>{quote.lines.filter((l) => l.section === group).map((line) => <div className="line-row" key={line.id}><div><input className="concept" value={line.concept} onChange={(e) => onLine(line.id, "concept", e.target.value)} placeholder="Concepto"/><textarea value={line.description} onChange={(e) => onLine(line.id, "description", e.target.value)} placeholder="Describe con detalle qué incluye esta partida…" rows="3" /></div><select value={line.frequency || "punctual"} onChange={(e) => onLine(line.id, "frequency", e.target.value)}>{LINE_FREQUENCIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input type="number" value={line.quantity} onChange={(e) => onLine(line.id, "quantity", e.target.value)} /><select value={line.unit} onChange={(e) => onLine(line.id, "unit", e.target.value)}><option>h</option><option>m²</option><option>ud.</option><option>servicio</option><option>día</option><option>semana</option><option>mes</option></select><input type="number" value={line.unitPrice} onChange={(e) => onLine(line.id, "unitPrice", e.target.value)} /><input type="number" value={line.discount} onChange={(e) => onLine(line.id, "discount", e.target.value)} /><select value={line.tax} onChange={(e) => onLine(line.id, "tax", e.target.value)}><option value="0">0%</option><option value="10">10%</option><option value="21">21%</option></select><strong>{money.format(line.total)}</strong><div className="line-buttons"><button title="Duplicar partida" onClick={() => onLines([...quote.lines, { ...line, id: uid() }])}>⧉</button><button className="delete-line" title="Eliminar partida" onClick={() => onLines(quote.lines.filter((l) => l.id !== line.id))}>🗑</button></div></div>)}</div><button className="add-inline" onClick={() => addLine(group)}>＋ Añadir partida a {group}</button></div>)}
        <div className="quote-totals"><div><label><input type="checkbox" checked={quote.includesMaterials} onChange={(e) => onChange("includesMaterials", e.target.checked)} /> Materiales y productos incluidos</label><label><input type="checkbox" checked={quote.showTaxBreakdown} onChange={(e) => onChange("showTaxBreakdown", e.target.checked)} /> Mostrar desglose de IVA al cliente</label></div><dl><div><dt>Base imponible</dt><dd>{money.format(quote.subtotal)}</dd></div><div><dt>IVA</dt><dd>{money.format(quote.taxTotal)}</dd></div><div className="grand"><dt>Total</dt><dd>{money.format(quote.total)}</dd></div></dl></div>
      </section>
      <section className="editor-card insurance-card"><div className="insurance-heading"><div><h3>Seguros y garantías de la empresa</h3><p>Refuerza la confianza indicando las coberturas vigentes.</p></div><label className="switch-label"><input type="checkbox" checked={quote.showInsurance !== false} onChange={(e) => onChange("showInsurance", e.target.checked)} /> Mostrar al cliente</label></div>{quote.showInsurance !== false && <><div className="insurance-options">{INSURANCE_OPTIONS.map((insurance) => <label key={insurance} className={(quote.insurances || []).includes(insurance) ? "selected" : ""}><input type="checkbox" checked={(quote.insurances || []).includes(insurance)} onChange={() => toggleInsurance(insurance)} /><span>✓</span>{insurance}</label>)}</div><label className="insurance-details">Detalles de póliza, capital asegurado u otras coberturas<textarea value={quote.insuranceDetails || ""} onChange={(e) => onChange("insuranceDetails", e.target.value)} placeholder="Ej. Seguro de responsabilidad civil con cobertura de 600.000 €. Certificado disponible a petición." /></label></>}</section>
      <section className="editor-card"><h3>Notas y condiciones</h3><div className="notes-grid"><label>Visibles para el cliente<textarea value={quote.clientNotes} onChange={(e) => onChange("clientNotes", e.target.value)} /></label><label>Notas internas <span>Privadas</span><textarea value={quote.internalNotes} onChange={(e) => onChange("internalNotes", e.target.value)} /></label></div></section>
    </main><aside className={tab === "preview" ? "pdf-side active" : "pdf-side"}><div className="preview-heading"><div><strong>Vista previa</strong><small>Se actualiza automáticamente</small></div><button onClick={() => onPdf(true)}>↗</button></div><PdfPreview quote={quote} settings={settings} /></aside></div>
    {sendModal && <SendQuoteModal quote={quote} companyEmail={settings.smtpEmail} onClose={() => setSendModal(false)} onEmail={onEmail} onWhatsApp={onWhatsApp} />}
  </div>;
}

function SendQuoteModal({ quote, companyEmail, onClose, onEmail, onWhatsApp }) {
  const [channel, setChannel] = useState("email");
  const [recipient, setRecipient] = useState(quote.clientEmail || "");
  const [subject, setSubject] = useState(`Presupuesto ${quote.number} - ${quote.clientName || "LimpiaGest"}`);
  const [message, setMessage] = useState(`Hola,\n\nTe adjuntamos el presupuesto ${quote.number}. Quedamos a tu disposición para resolver cualquier duda.\n\nUn saludo.`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => { setSending(true); setError(""); try { if (channel === "email") await onEmail({ recipient, subject, message }); else await onWhatsApp(); onClose(); } catch (err) { setError(err?.message || "No se pudo realizar el envío."); } finally { setSending(false); } };
  return <div className="send-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="send-modal"><header><div><span className="quotes-eyebrow">COMPARTIR PRESUPUESTO</span><h3>¿Cómo quieres enviarlo?</h3></div><button onClick={onClose}>×</button></header><div className="send-channels"><button className={channel === "email" ? "active" : ""} onClick={() => setChannel("email")}><span>✉</span><b>Email</b><small>PDF adjunto desde la empresa</small></button><button className={channel === "whatsapp" ? "active whatsapp" : ""} onClick={() => setChannel("whatsapp")}><span>◉</span><b>WhatsApp</b><small>Comparte mensaje y PDF</small></button></div>{channel === "email" ? <div className="send-form"><p className="sender-note">Se enviará desde <b>{companyEmail || "el correo configurado en Ajustes"}</b></p><label>Destinatario<input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="cliente@empresa.com" /></label><label>Asunto<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Mensaje<textarea rows="6" value={message} onChange={(e) => setMessage(e.target.value)} /></label></div> : <div className="whatsapp-info"><span>◉</span><div><b>Se abrirá WhatsApp para compartirlo</b><p>En móvil podrás enviar el PDF directamente. En ordenador se abrirá el chat y se descargará el PDF para adjuntarlo.</p><label>Teléfono del cliente<input value={quote.clientPhone || "No indicado en la ficha"} readOnly /></label></div></div>}{error && <div className="send-error">⚠ {error}</div>}<footer><button className="quote-secondary" onClick={onClose}>Cancelar</button><button className={`quote-primary ${channel === "whatsapp" ? "wa-button" : ""}`} disabled={sending || (channel === "email" && !recipient)} onClick={submit}>{sending ? "Enviando…" : channel === "email" ? "✉ Enviar email con PDF" : "◉ Abrir WhatsApp"}</button></footer></div></div>;
}

function PdfPreview({ quote, settings }) {
  return <div className="paper"><div className="paper-accent" style={{ background: settings.brandColor || "#2563eb" }} /><div className="paper-head"><div className="paper-company">{settings.logoBase64 ? <img src={settings.logoBase64} /> : <span>LG</span>}<strong>{settings.companyName || "LimpiaGest"}</strong><small>{settings.nif || "Servicios profesionales de limpieza"}<br/>{settings.address}</small></div><div><h2>PRESUPUESTO</h2><strong>{quote.number}</strong></div></div><div className="paper-client"><div><small>PREPARADO PARA</small><strong>{quote.clientName || "Selecciona un cliente"}</strong><span>{quote.clientAddress}</span></div><div><small>EMISIÓN</small><strong>{quote.issueDate}</strong><small>VÁLIDO HASTA</small><strong>{quote.validUntil}</strong></div></div><table><thead><tr><th>DESCRIPCIÓN</th><th>FRECUENCIA</th><th>CANT.</th><th>PRECIO</th><th>TOTAL</th></tr></thead><tbody>{quote.lines.map((l) => <tr key={l.id}><td><strong>{l.concept || "Nueva partida"}</strong><small>{l.description}</small></td><td>{frequencyLabel(l.frequency)}</td><td>{l.quantity} {l.unit}</td><td>{money.format(l.unitPrice)}</td><td>{money.format(l.total)}</td></tr>)}</tbody></table><div className="paper-summary"><span>Base imponible</span><strong>{money.format(quote.subtotal)}</strong>{quote.showTaxBreakdown && <><span>IVA</span><strong>{money.format(quote.taxTotal)}</strong></>}<span className="total">TOTAL</span><strong className="total">{money.format(quote.total)}</strong></div><div className="paper-notes"><strong>Condiciones</strong><p>{quote.clientNotes}</p><p><b>Forma de pago:</b> {quote.paymentTerms}</p>{quote.showInsurance !== false && quote.insurances?.length > 0 && <div className="paper-insurance"><b>✓ Seguros y garantías:</b> {quote.insurances.join(" · ")}<small>{quote.insuranceDetails}</small></div>}</div><footer>Gracias por confiar en nosotros · {settings.phone || "LimpiaGest"}</footer></div>;
}
