import React from "react";

export default function GeneralEvidenceCard({
  showTasks,
  canEdit,
  generalNotes,
  setGeneralNotes,
  generalPhotos,
  handleGeneralPhotoUpload,
  uploadingGeneralPhoto,
  submittedGeneralEvidence,
  handleSubmitGeneralEvidence,
  submittingGeneralEvidence,
}) {
  if (!showTasks || !canEdit) return null;

  return (
    <div className="card mt-4">
      <h3 className="card-title mb-4">📸 Evidencias y Notas Generales</h3>
      <p className="text-xs text-muted mb-3">
        Las fotos y notas que añadas aquí se registrarán a nombre de esta
        comunidad para este servicio.
      </p>

      <textarea
        className="form-textarea mb-3"
        placeholder="Añadir notas sobre la comunidad..."
        style={{ minHeight: "80px", fontSize: "var(--font-sm)" }}
        value={generalNotes}
        onChange={(e) => setGeneralNotes(e.target.value)}
      />

      <div className="photo-upload mb-4">
        {generalPhotos.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Evidencia ${i + 1}`}
            className="photo-thumb"
          />
        ))}
        <label className="photo-upload-btn">
          📷
          <span>Foto</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleGeneralPhotoUpload}
            disabled={uploadingGeneralPhoto}
          />
        </label>
      </div>

      {(generalPhotos.length > 0 || generalNotes.trim().length > 0) && (
        <div>
          {submittedGeneralEvidence ? (
            <div
              style={{
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-success-light, #dcfce7)",
                color: "var(--color-success, #16a34a)",
                fontSize: "var(--font-sm)",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              ✅ Evidencia guardada correctamente
            </div>
          ) : (
            <button
              className="btn btn-primary w-full p-3 text-sm font-bold"
              onClick={handleSubmitGeneralEvidence}
              disabled={submittingGeneralEvidence}
            >
              {submittingGeneralEvidence
                ? "⏳ Guardando..."
                : "📤 Enviar Evidencias"}
            </button>
          )}
        </div>
      )}
      {uploadingGeneralPhoto && (
        <p className="text-xs text-muted mt-2">Subiendo foto...</p>
      )}
    </div>
  );
}
