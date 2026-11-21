import { useEffect, useState } from "react";
import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { tenantDoc } from "../../utils/tenantFirestore";
import "./PrivacyPanels.css";

const GEOLOCATION_POLICY_VERSION = "2026-09";

const EMPTY_POLICY = {
  enabled: false,
  version: GEOLOCATION_POLICY_VERSION,
  purpose: "service_attendance",
  necessityAssessment: "",
  proportionalityAssessment: "",
  workersInformedAt: "",
  companyDeviceOrVoluntaryUseConfirmed: false,
};

export default function GeolocationPolicyPanel({ companyId, currentUser }) {
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  const [loading, setLoading] = useState(false);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!companyId) return;
    let current = true;
    setLoadingPolicy(true);
    setLoadFailed(false);
    setMessage("");
    setPolicy(EMPTY_POLICY);
    getDoc(tenantDoc(db, companyId, "settings", "global"))
      .then((snapshot) => {
        const saved = snapshot.data()?.geolocationPolicy;
        if (current && saved) setPolicy({ ...EMPTY_POLICY, ...saved });
      })
      .catch((error) => {
        if (current) {
          setLoadFailed(true);
          setMessage(`No se pudo cargar la política: ${error.message}`);
        }
      })
      .finally(() => { if (current) setLoadingPolicy(false); });
    return () => { current = false; };
  }, [companyId]);

  function update(field, value) {
    setPolicy((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (loadingPolicy || loadFailed || !companyId) return;
    setMessage("");
    setLoading(true);
    try {
      await setDoc(
        tenantDoc(db, companyId, "settings", "global"),
        {
          geolocationPolicy: {
            ...policy,
            version: GEOLOCATION_POLICY_VERSION,
            purpose: "service_attendance",
            updatedAt: serverTimestamp(),
            updatedBy: currentUser?.uid || null,
          },
        },
        { merge: true },
      );
      setMessage("Evaluación guardada. Este formulario no modifica el funcionamiento del GPS.");
    } catch (error) {
      setMessage(`No se pudo guardar la política: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="geolocation-policy-panel" className="card" style={{ gridColumn: "1 / -1", scrollMarginTop: "24px" }}>
      <h3 style={{ fontSize: "var(--font-xl)", fontWeight: 700, marginBottom: "var(--space-3)" }}>
        Evaluación de geolocalización laboral
      </h3>
      <p className="text-sm text-muted mb-4">
        Documenta la necesidad, proporcionalidad y comunicación a la plantilla. Este apartado no activa ni desactiva el seguimiento GPS de la versión actual.
      </p>
      <form onSubmit={save} style={{ display: "grid", gap: "14px" }}>
        <label className="rgpd-field">
          Necesidad de la medida
          <textarea className="input" rows="3" maxLength="1000" value={policy.necessityAssessment} onChange={(event) => update("necessityAssessment", event.target.value)} placeholder="Explica por qué no basta una medida menos intrusiva para acreditar el servicio." />
        </label>
        <label className="rgpd-field">
          Evaluación de proporcionalidad
          <textarea className="input" rows="3" maxLength="1000" value={policy.proportionalityAssessment} onChange={(event) => update("proportionalityAssessment", event.target.value)} placeholder="Explica las garantías aplicadas y por qué el beneficio justifica esta medida limitada." />
        </label>
        <label className="rgpd-field">
          Fecha en que se informó expresamente a la plantilla
          <input className="input" type="date" value={policy.workersInformedAt} onChange={(event) => update("workersInformedAt", event.target.value)} />
        </label>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <input type="checkbox" checked={policy.companyDeviceOrVoluntaryUseConfirmed} onChange={(event) => update("companyDeviceOrVoluntaryUseConfirmed", event.target.checked)} />
          <span className="text-sm">Confirmo que la empresa facilita el medio necesario o que el uso de un teléfono personal es verdaderamente voluntario y dispone de una alternativa sin consecuencias adversas.</span>
        </label>
        <div>
          <button className="btn btn-primary" type="submit" disabled={loading || loadingPolicy || loadFailed}>{loadingPolicy ? "Cargando..." : loading ? "Guardando..." : "Guardar evaluación"}</button>
        </div>
        {message && <p className="text-sm" role="status">{message}</p>}
      </form>
    </div>
  );
}
