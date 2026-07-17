import { useRef, useState, useEffect } from "react";

/**
 * Componente Canvas independiente para capturar firmas digitales táctiles.
 *
 * @param {Object} props
 * @param {Function} props.onSave - Callback al guardar la firma: onSave(base64ImageString)
 * @param {Function} props.onCancel - Callback al cancelar la firma
 * @param {string} props.title - Título del modal de firma (opcional)
 */
export default function SignatureCanvas({
  onSave,
  onCancel,
  title = "Firma de Conformidad",
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signerName, setSignerName] = useState("");

  // Inicializar canvas y configurar tamaño para pantallas de retina/móviles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Ajustar resolución del canvas al tamaño visual en CSS
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    // Soporte para gestos táctiles (móvil)
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    // Soporte para ratón (escritorio)
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    if (!hasSignature || !signerName.trim()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Obtener la imagen en base64 png
    const base64Image = canvas.toDataURL("image/png");
    onSave({ base64Image, signerName: signerName.trim() });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div
        className="modal"
        style={{ maxWidth: "450px", width: "95vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group mb-3">
            <label
              className="form-label text-xs font-bold mb-1"
              style={{ display: "block", fontWeight: "bold" }}
            >
              Nombre de la persona que firma
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. Juan Pérez (Conserje)"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
              required
            />
          </div>

          <p className="text-xs text-muted mb-3">
            Pide al conserje o cliente que firme con el dedo dentro del recuadro
            inferior.
          </p>

          <div
            style={{
              border: "2px dashed #cbd5e1",
              borderRadius: "8px",
              background: "#f8fafc",
              height: "180px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                touchAction: "none",
                cursor: "crosshair",
              }}
            />
            {!hasSignature && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  color: "#94a3b8",
                  fontSize: "11px",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                🖊️ Firme aquí
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer flex gap-2">
          <button
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={!hasSignature}
          >
            Limpiar lienzo
          </button>
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasSignature || !signerName.trim()}
          >
            Confirmar firma
          </button>
        </div>
      </div>
    </div>
  );
}
