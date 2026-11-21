import { useEffect, useState } from "react";
import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { tenantDoc } from "../../utils/tenantFirestore";
import { getComplianceProgress } from "../../utils/complianceProgram";
import "./ComplianceCenter.css";

const CONTROLS = [
  {
    id: "activities",
    title: "Registro de actividades de tratamiento",
    action: "Enumera por separado la gestión de trabajadores, clientes, servicios, facturación, soporte y cualquier otro uso real de datos.",
    evidence: "Registro fechado con finalidad, datos, base jurídica, destinatarios, conservación, proveedores y medidas de seguridad.",
  },
  {
    id: "risks",
    title: "Análisis de riesgos",
    action: "Valora accesos indebidos, pérdida de dispositivos, errores de envío, conservación excesiva, disponibilidad y separación entre empresas. Asigna medidas, responsable y fecha.",
    evidence: "Análisis aprobado, medidas pendientes y revisiones posteriores.",
  },
  {
    id: "breaches",
    title: "Protocolo de brechas",
    action: "Designa responsable y suplente, un canal urgente y el proceso para contener, valorar y documentar incidentes. Si existe riesgo, la notificación a la AEPD debe realizarse, cuando sea posible, dentro de 72 horas.",
    evidence: "Protocolo comunicado, registro de incidentes y resultado del último simulacro.",
  },
  {
    id: "access",
    title: "Política de accesos",
    action: "Usa cuentas individuales, concede el rol mínimo, retira accesos al producirse una baja y revisa periódicamente usuarios y administradores.",
    evidence: "Autorizaciones de alta, bajas ejecutadas y registro de revisiones de permisos.",
  },
  {
    id: "rights",
    title: "Gestión de derechos",
    action: "Asigna a una persona para revisar las solicitudes, verificar la identidad de forma proporcionada, buscar los datos en todos los sistemas y responder dentro del plazo.",
    evidence: "Registro de solicitudes, respuesta, acciones aplicadas y justificación de cualquier ampliación o denegación.",
    href: "#privacy-rights-panel",
    linkLabel: "Ir a solicitudes de derechos",
  },
  {
    id: "processors",
    title: "Encargados y subencargados",
    action: "Mantén una lista de proveedores realmente activos. Comprueba contrato, servicio, datos tratados, ubicación, subcontratación, seguridad y garantías de transferencias internacionales.",
    evidence: "Inventario actualizado, contratos y anexos de protección de datos de cada proveedor.",
  },
  {
    id: "geolocation",
    title: "Evaluación de geolocalización",
    action: "Antes de activarla, documenta necesidad y proporcionalidad, informa a la plantilla, limita la recogida a la jornada y ofrece una alternativa cuando se utilice un teléfono personal.",
    evidence: "Evaluación aprobada, aviso entregado a trabajadores y configuración aplicada.",
    href: "#geolocation-policy-panel",
    linkLabel: "Ir a configuración de geolocalización",
  },
];

function formatReviewDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("es-ES")
    : "fecha pendiente de sincronizar";
}

export default function ComplianceCenter({ companyId, currentUser }) {
  const [program, setProgram] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const progress = getComplianceProgress(program);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    getDoc(tenantDoc(db, companyId, "settings", "global"))
      .then((snapshot) => setProgram(snapshot.data()?.complianceProgram || {}))
      .catch((error) => setMessage(`No se pudo cargar el estado: ${error.message}`))
      .finally(() => setLoading(false));
  }, [companyId]);

  async function setReviewed(id, reviewed) {
    setSavingId(id);
    setMessage("");
    const next = {
      ...program,
      [id]: {
        reviewed,
        reviewedAt: reviewed ? new Date().toISOString() : null,
        reviewedBy: reviewed ? currentUser.uid : null,
      },
    };
    try {
      await setDoc(
        tenantDoc(db, companyId, "settings", "global"),
        { complianceProgram: next, complianceProgramUpdatedAt: serverTimestamp() },
        { merge: true },
      );
      setProgram(next);
      setMessage(reviewed ? "Revisión registrada para esta empresa." : "Control marcado de nuevo como pendiente.");
    } catch (error) {
      setMessage(`No se pudo guardar el estado: ${error.message}`);
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="card compliance-center" aria-labelledby="compliance-title">
      <div className="compliance-heading">
        <div>
          <p className="compliance-eyebrow">Protección de datos · guía por empresa</p>
          <h3 id="compliance-title">Centro de cumplimiento RGPD</h3>
        </div>
        <strong className="compliance-progress" aria-label={`${progress.reviewed} de ${progress.total} controles revisados`}>
          {loading ? "Cargando…" : `${progress.reviewed}/${progress.total} revisados`}
        </strong>
      </div>

      <p className="text-sm text-muted">
        Esta lista explica qué debe hacer la empresa y qué prueba debe conservar. Marcar un punto como revisado registra el seguimiento interno; no constituye una certificación ni sustituye la revisión profesional cuando el tratamiento pueda implicar alto riesgo.
      </p>
      <div className="compliance-meter" aria-hidden="true">
        <span style={{ width: `${progress.percentage}%` }} />
      </div>

      <div className="compliance-list">
        {CONTROLS.map((control, index) => {
          const record = program[control.id];
          const reviewed = record?.reviewed === true;
          return (
            <details className="compliance-item" key={control.id}>
              <summary>
                <span className="compliance-number">{index + 1}</span>
                <span className="compliance-item-title">{control.title}</span>
                <span className={reviewed ? "compliance-status is-reviewed" : "compliance-status"}>
                  {reviewed ? "Revisado" : "Pendiente"}
                </span>
              </summary>
              <div className="compliance-detail">
                <p><strong>Qué hacer:</strong> {control.action}</p>
                <p><strong>Qué conservar:</strong> {control.evidence}</p>
                {reviewed && <p className="text-sm text-muted">Última revisión: {formatReviewDate(record.reviewedAt)}.</p>}
                <div className="compliance-actions">
                  {control.href && <a className="btn btn-secondary" href={control.href}>{control.linkLabel}</a>}
                  <button
                    type="button"
                    className={reviewed ? "btn btn-secondary" : "btn btn-primary"}
                    disabled={loading || savingId === control.id}
                    onClick={() => setReviewed(control.id, !reviewed)}
                  >
                    {savingId === control.id ? "Guardando…" : reviewed ? "Marcar como pendiente" : "Registrar como revisado"}
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>
      {message && <p className="text-sm compliance-message" role="status">{message}</p>}
    </section>
  );
}
