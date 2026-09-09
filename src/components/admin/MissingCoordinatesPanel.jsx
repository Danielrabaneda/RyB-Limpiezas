import { useMemo, useState } from "react";
import { updateCommunity } from "../../services/communityService";

function parseCoordinate(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export default function MissingCoordinatesPanel({
  companyId,
  communities,
  onCoordinatesSaved,
}) {
  const [expanded, setExpanded] = useState(true);
  const [forms, setForms] = useState({});
  const [savingId, setSavingId] = useState("");
  const [errors, setErrors] = useState({});

  const sortedCommunities = useMemo(
    () =>
      [...communities].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "es"),
      ),
    [communities],
  );

  if (!sortedCommunities.length) return null;

  const updateForm = (id, field, value) => {
    setForms((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
    setErrors((current) => ({ ...current, [id]: "" }));
  };

  const saveCoordinates = async (community) => {
    const form = forms[community.id] || {};
    const lat = parseCoordinate(form.lat);
    const lng = parseCoordinate(form.lng);
    if (lat === null || lat < -90 || lat > 90) {
      setErrors((current) => ({
        ...current,
        [community.id]: "La latitud debe estar entre -90 y 90.",
      }));
      return;
    }
    if (lng === null || lng < -180 || lng > 180) {
      setErrors((current) => ({
        ...current,
        [community.id]: "La longitud debe estar entre -180 y 180.",
      }));
      return;
    }

    setSavingId(community.id);
    try {
      await updateCommunity(companyId, community.id, { lat, lng });
      onCoordinatesSaved(community.id, { latitude: lat, longitude: lng });
    } catch (error) {
      console.error("No se pudieron guardar las coordenadas:", error);
      setErrors((current) => ({
        ...current,
        [community.id]: "No se pudieron guardar. Inténtalo de nuevo.",
      }));
    } finally {
      setSavingId("");
    }
  };

  return (
    <section
      className="mb-8"
      style={{
        background: "#fffbeb",
        border: "1px solid #f59e0b",
        borderRadius: "18px",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        style={{
          width: "100%",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          border: 0,
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>
          <strong style={{ color: "#92400e" }}>
            ⚠️ {sortedCommunities.length} comunidad
            {sortedCommunities.length === 1 ? "" : "es"} sin coordenadas
          </strong>
          <span
            style={{ display: "block", color: "#a16207", fontSize: "13px", marginTop: "3px" }}
          >
            Añádelas para que “Cómo llegar”, las distancias y el GPS funcionen correctamente.
          </span>
        </span>
        <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ padding: "0 1rem 1rem" }}>
          {sortedCommunities.map((community) => {
            const form = forms[community.id] || {};
            const saving = savingId === community.id;
            const mapsUrl = community.address
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(community.address)}`
              : "";
            return (
              <div
                key={community.id}
                style={{
                  background: "white",
                  border: "1px solid #fde68a",
                  borderRadius: "12px",
                  padding: "0.9rem",
                  marginTop: "0.65rem",
                }}
              >
                <div className="flex justify-between gap-3 flex-wrap items-center">
                  <div style={{ minWidth: "190px", flex: "1 1 240px" }}>
                    <strong>{community.name || "Comunidad sin nombre"}</strong>
                    {community.address && (
                      <div className="text-xs text-muted mt-1">{community.address}</div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap" style={{ flex: "2 1 420px" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-input"
                      aria-label={`Latitud de ${community.name}`}
                      placeholder="Latitud (ej. 37.9838)"
                      value={form.lat || ""}
                      onChange={(event) =>
                        updateForm(community.id, "lat", event.target.value)
                      }
                      style={{ flex: "1 1 150px" }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-input"
                      aria-label={`Longitud de ${community.name}`}
                      placeholder="Longitud (ej. -1.1299)"
                      value={form.lng || ""}
                      onChange={(event) =>
                        updateForm(community.id, "lng", event.target.value)
                      }
                      style={{ flex: "1 1 150px" }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={saving}
                      onClick={() => saveCoordinates(community)}
                    >
                      {saving ? "Guardando…" : "Guardar GPS"}
                    </button>
                    {mapsUrl && (
                      <a
                        className="btn btn-ghost btn-sm"
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Buscar la dirección en Google Maps"
                      >
                        Ver mapa
                      </a>
                    )}
                  </div>
                </div>
                {errors[community.id] && (
                  <div style={{ color: "#b91c1c", fontSize: "12px", marginTop: "8px" }}>
                    {errors[community.id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
