import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { createPortal } from "react-dom";
import { renderGaragePoster } from "../utils/garagePosterCanvas";
import "./GaragePosterGenerator.css";

const initialBox = () => ({ type: "empty", text: "", image: "" });

export default function GaragePosterGenerator({ garage, dates, onClose }) {
  const [date, setDate] = useState(dates[0]?.value || "");
  const [time, setTime] = useState("11:00");
  const [showCommunityName, setShowCommunityName] = useState(true);
  const [boxes, setBoxes] = useState([initialBox(), initialBox()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const todayDate = format(new Date(), "yyyy-MM-dd");

  const dateLabel = date
    ? format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })
    : "Fecha pendiente";
  const garageSlug = garage.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `cartel-garaje${showCommunityName ? `-${garageSlug}` : ""}-${date || "sin-fecha"}`;

  useEffect(() => {
    let cancelled = false;
    renderGaragePoster({ name: garage.name, showCommunityName, dateLabel, time, boxes, guides: true })
      .then((canvas) => { if (!cancelled) setPreview(canvas.toDataURL("image/png")); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [garage.name, showCommunityName, dateLabel, time, boxes]);

  function updateBox(index, changes) {
    setBoxes((current) => current.map((box, i) => i === index ? { ...box, ...changes } : box));
  }

  function uploadImage(index, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona un archivo de imagen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateBox(index, { image: String(reader.result), type: "image" });
    reader.onerror = () => setError("No se pudo abrir la imagen.");
    reader.readAsDataURL(file);
  }

  async function capturePoster() {
    if (!date || !time) throw new Error("Indica la fecha y la hora del cartel.");
    if (date < format(new Date(), "yyyy-MM-dd")) throw new Error("La fecha del cartel debe ser hoy o un día posterior.");
    return renderGaragePoster({ name: garage.name, showCommunityName, dateLabel, time, boxes });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function runExport(kind) {
    setBusy(true);
    setError("");
    try {
      const canvas = await capturePoster();
      if (kind === "print") {
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 297, 210);
        pdf.save(`${fileName}.pdf`);
        return;
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("No se pudo crear la imagen del cartel.");
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Limpieza de garaje${showCommunityName ? ` - ${garage.name}` : ""}` });
        } catch (shareError) {
          if (shareError.name !== "AbortError") throw shareError;
        }
      } else {
        download(blob, file.name);
        window.open(`https://wa.me/?text=${encodeURIComponent(`Aviso de limpieza de garaje${showCommunityName ? ` ${garage.name}` : ""}: ${dateLabel}, a partir de las ${time}.`)}`, "_blank", "noopener,noreferrer");
        setError("Imagen descargada. Adjunta ese archivo en la conversación de WhatsApp antes de enviarla.");
      }
    } catch (exportError) {
      setError(exportError.message || "No se pudo generar el cartel.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="garage-poster-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="garage-poster-dialog" role="dialog" aria-modal="true" aria-labelledby="garage-poster-title">
        <div className="garage-poster-toolbar">
          <div>
            <h2 id="garage-poster-title">Cartel de limpieza · {garage.name}</h2>
            <p>Revisa la fecha antes de imprimir o compartir.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar generador">✕</button>
        </div>
        <div className="garage-poster-controls">
          <label>Fecha propuesta
            <select value={dates.some((option) => option.value === date) ? date : ""} onChange={(event) => setDate(event.target.value)}>
              <option value="">Elegir manualmente</option>
              {dates.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>Fecha del cartel<input type="date" min={todayDate} value={date} onChange={(event) => {
            const nextDate = event.target.value;
            if (nextDate && nextDate < format(new Date(), "yyyy-MM-dd")) {
              setError("La fecha del cartel debe ser hoy o un día posterior.");
              return;
            }
            setError("");
            setDate(nextDate);
          }} /></label>
          <label>Hora de inicio<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <label className="garage-poster-checkbox"><input type="checkbox" checked={showCommunityName} onChange={(event) => setShowCommunityName(event.target.checked)} /> Mostrar nombre de la comunidad</label>
          {boxes.map((box, index) => (
            <div className="garage-poster-box-control" key={index}>
              <label>Cuadro {index + 1}
                <select value={box.type} onChange={(event) => updateBox(index, { type: event.target.value })}>
                  <option value="empty">Vacío</option>
                  <option value="text">Texto</option>
                  <option value="image">Imagen</option>
                </select>
              </label>
              {box.type === "text" && <label>Texto del cuadro {index + 1}<textarea value={box.text} maxLength={400} onChange={(event) => updateBox(index, { text: event.target.value })} /></label>}
              {box.type === "image" && <label>Imagen del cuadro {index + 1}<input type="file" accept="image/*" onChange={(event) => uploadImage(index, event.target.files?.[0])} /></label>}
            </div>
          ))}
        </div>
        <div className="garage-poster-preview-scroll">
          {preview && <img className="garage-poster-render" src={preview} alt={`Vista previa del cartel${showCommunityName ? ` de ${garage.name}` : ""}: ${dateLabel}, a partir de las ${time || "hora pendiente"}. Se ruega retirar los coches para limpiar las plazas.`} />}
        </div>
        {error && <p className="garage-poster-message" role="status">{error}</p>}
        <div className="garage-poster-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => runExport("print")}>Descargar PDF para imprimir</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => runExport("share")}>Compartir por WhatsApp</button>
        </div>
      </div>
    </div>, document.body
  );
}
