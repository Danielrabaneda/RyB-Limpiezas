import { useState, useEffect } from "react";

export default function ExceptionPromptModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  loading: actionLoading,
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) {
      setReason("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "400px" }}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title || "Motivo de la excepción"}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted mb-4">
            {message || "Introduce el motivo de la excepción (obligatorio):"}
          </p>

          <div className="form-group">
            <textarea
              className="form-input"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid #e2e8f0",
                minHeight: "100px",
                resize: "vertical",
                fontSize: "14px",
              }}
              placeholder="Escribe el motivo aquí..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (reason.trim()) {
                onConfirm(reason.trim());
              }
            }}
            disabled={!reason.trim() || actionLoading}
          >
            {actionLoading ? "Procesando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
