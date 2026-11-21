export default function TaskCompletionPromptModal({
  isOpen,
  taskName = "",
  loading,
  onYes,
  onNo,
}) {
  if (!isOpen) return null;

  const taskLabel = `“${taskName || "Tarea"}”`;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h3 className="modal-title">Confirmar tarea</h3>
        </div>
        <div className="modal-body">
          <p className="font-semibold" style={{ textAlign: "center" }}>
            ¿Se ha realizado la tarea de {taskLabel}?
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onNo}
            disabled={loading}
          >
            No
          </button>
          <button
            type="button"
            className="btn btn-success"
            onClick={onYes}
            disabled={loading}
          >
            {loading ? "Guardando..." : "Sí"}
          </button>
        </div>
      </div>
    </div>
  );
}
