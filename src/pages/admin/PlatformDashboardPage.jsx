import { useEffect, useMemo, useState } from "react";
import {
  getPlatformDashboard,
  updateCompanyCommercialState,
} from "../../services/platformService";
import { PLAN_CATALOG, formatLimit } from "../../config/plans";

const STATUS_LABELS = {
  active: "Activa",
  trialing: "En prueba",
  suspended: "Suspendida",
  past_due: "Pago pendiente",
  unpaid: "Impagada",
  canceled: "Cancelada",
  legacy: "Legacy",
};

function StatusPill({ company }) {
  const problem =
    company.status === "suspended" ||
    ["past_due", "unpaid", "canceled"].includes(company.subscriptionStatus);
  const trial = company.subscriptionStatus === "trialing";
  const color = problem ? "#dc2626" : trial ? "#d97706" : "#059669";
  const background = problem ? "#fef2f2" : trial ? "#fffbeb" : "#ecfdf5";
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "5px 10px",
        borderRadius: "999px",
        fontWeight: 700,
        fontSize: "0.75rem",
        color,
        background,
      }}
    >
      {STATUS_LABELS[company.subscriptionStatus] ||
        STATUS_LABELS[company.status] ||
        company.status}
    </span>
  );
}

function UsageBar({ label, current, limit, color }) {
  const percentage =
    limit === null ? 12 : Math.min(100, Math.round((current / limit) * 100));
  const nearLimit = limit !== null && percentage >= 80;
  return (
    <div style={{ marginBottom: "14px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.78rem",
          marginBottom: "6px",
        }}
      >
        <span style={{ color: "#475569", fontWeight: 600 }}>{label}</span>
        <strong style={{ color: nearLimit ? "#dc2626" : "#0f172a" }}>
          {current} / {formatLimit(limit)}
        </strong>
      </div>
      <div style={{ height: "7px", borderRadius: "999px", background: "#e2e8f0" }}>
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            borderRadius: "999px",
            background: nearLimit ? "#ef4444" : color,
            transition: "width .25s ease",
          }}
        />
      </div>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await getPlatformDashboard();
      setData(result);
      if (selected) {
        setSelected(
          result.companies.find((item) => item.id === selected.id) || null,
        );
      }
    } catch (error) {
      setMessage(`No se pudo cargar la consola: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.companies.filter((company) => {
      const matchesSearch =
        !term ||
        company.name.toLowerCase().includes(term) ||
        company.id.toLowerCase().includes(term) ||
        company.owner?.email?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "attention"
          ? company.status === "suspended" ||
            ["past_due", "unpaid", "canceled"].includes(
              company.subscriptionStatus,
            )
          : company.subscriptionStatus === statusFilter ||
            company.status === statusFilter);
      return (
        matchesSearch &&
        matchesStatus &&
        (planFilter === "all" || company.plan === planFilter)
      );
    });
  }, [data, search, statusFilter, planFilter]);

  async function updateCompany(company, patch) {
    setMessage("Guardando cambios...");
    try {
      await updateCompanyCommercialState(company.id, patch);
      setMessage(`Cambios guardados en ${company.name}.`);
      await load();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  }

  async function toggleCompanyStatus(company) {
    const suspending = company.status === "active";
    const confirmed = window.confirm(
      suspending
        ? `¿Suspender el acceso de ${company.name}? Sus usuarios no podrán entrar en los datos operativos.`
        : `¿Reactivar el acceso de ${company.name}?`,
    );
    if (!confirmed) return;
    await updateCompany(company, {
      status: suspending ? "suspended" : "active",
      ...(!suspending &&
      !["active", "trialing", "legacy"].includes(company.subscriptionStatus)
        ? { subscriptionStatus: "active" }
        : {}),
    });
  }

  if (loading && !data) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <p className="text-muted">Cargando consola global...</p>
      </div>
    );
  }

  const summary = data?.summary || {};
  const cards = [
    { label: "Empresas", value: summary.total || 0, icon: "🏢", color: "#2563eb" },
    { label: "Activas", value: summary.active || 0, icon: "✓", color: "#059669" },
    { label: "En prueba", value: summary.trials || 0, icon: "⏳", color: "#d97706" },
    { label: "Requieren atención", value: summary.attention || 0, icon: "!", color: "#dc2626" },
    {
      label: "MRR estimado",
      value: `${(summary.estimatedMrr || 0).toLocaleString("es-ES")} €`,
      icon: "€",
      color: "#7c3aed",
    },
  ];

  return (
    <div className="animate-fadeIn" style={{ maxWidth: "1500px" }}>
      <style>{`
        @media (max-width: 900px) {
          .platform-filters { grid-template-columns: 1fr !important; }
          .platform-company-grid { grid-template-columns: 1fr !important; }
          .platform-company-detail { position: static !important; }
        }
      `}</style>
      <section
        style={{
          padding: "28px",
          borderRadius: "24px",
          marginBottom: "22px",
          color: "white",
          background:
            "radial-gradient(circle at 85% 10%, rgba(56,189,248,.35), transparent 30%), linear-gradient(135deg,#0f172a,#1e3a8a)",
          boxShadow: "0 18px 45px rgba(15,23,42,.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                textTransform: "uppercase",
                letterSpacing: ".14em",
                fontSize: ".72rem",
                color: "#bae6fd",
                fontWeight: 800,
              }}
            >
              Centro de control · Rayba
            </div>
            <h1 style={{ fontSize: "2rem", fontWeight: 900, margin: "6px 0" }}>
              Consola global de LimpiaGest
            </h1>
            <p style={{ color: "#cbd5e1", maxWidth: "680px" }}>
              Supervisa empresas, suscripciones, pruebas y capacidad desde una
              sola vista.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? "Actualizando..." : "↻ Actualizar datos"}
          </button>
        </div>
      </section>

      {message && (
        <div className="card" style={{ marginBottom: "18px", padding: "14px 18px" }}>
          {message}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: "14px",
          marginBottom: "22px",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            className="card"
            style={{ padding: "18px", borderTop: `3px solid ${card.color}` }}
          >
            <div style={{ color: "#64748b", fontSize: ".78rem", fontWeight: 700 }}>
              {card.label}
            </div>
            <div
              style={{
                marginTop: "7px",
                fontSize: "1.65rem",
                fontWeight: 900,
                color: card.color,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "18px", marginBottom: "18px" }}>
        <div
          className="platform-filters"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px,2fr) repeat(2,minmax(150px,1fr))",
            gap: "12px",
          }}
        >
          <input
            className="form-input"
            placeholder="Buscar empresa, identificador o email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="form-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="trialing">En prueba</option>
            <option value="attention">Requieren atención</option>
          </select>
          <select
            className="form-input"
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
          >
            <option value="all">Todos los planes</option>
            {Object.entries(PLAN_CATALOG).map(([id, plan]) => (
              <option key={id} value={id}>{plan.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="platform-company-grid"
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "minmax(0,1.6fr) minmax(320px,.8fr)" : "1fr",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: "850px", width: "100%" }}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Estado</th>
                  <th>Plan</th>
                  <th>Operarios</th>
                  <th>Comunidades</th>
                  <th>Propietario</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <strong>{company.name}</strong>
                      <div style={{ color: "#94a3b8", fontSize: ".72rem" }}>
                        {company.id}
                      </div>
                    </td>
                    <td><StatusPill company={company} /></td>
                    <td>
                      <span style={{ color: PLAN_CATALOG[company.plan]?.color, fontWeight: 800 }}>
                        {PLAN_CATALOG[company.plan]?.label || company.plan}
                      </span>
                    </td>
                    <td>{company.usage.operarios} / {formatLimit(company.limits.operarios)}</td>
                    <td>{company.usage.communities} / {formatLimit(company.limits.communities)}</td>
                    <td>
                      <div>{company.owner?.name || "Sin asignar"}</div>
                      <small style={{ color: "#64748b" }}>{company.owner?.email}</small>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(company)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>
              No hay empresas que coincidan con los filtros.
            </div>
          )}
        </div>

        {selected && (
          <aside className="card platform-company-detail" style={{ padding: "22px", position: "sticky", top: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ fontSize: ".72rem", color: "#64748b", fontWeight: 700 }}>
                  DETALLE DE EMPRESA
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 900, marginTop: "4px" }}>
                  {selected.name}
                </h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>×</button>
            </div>
            <div style={{ margin: "18px 0" }}><StatusPill company={selected} /></div>
            <UsageBar label="Operarios" current={selected.usage.operarios} limit={selected.limits.operarios} color="#2563eb" />
            <UsageBar label="Comunidades" current={selected.usage.communities} limit={selected.limits.communities} color="#7c3aed" />
            <div style={{ marginBottom: "14px", color: "#475569", fontSize: ".78rem" }}>
              <strong>{selected.usage.admins}</strong> administradores · Sin límite
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px", marginTop: "18px" }}>
              <label className="form-label">Plan asignado</label>
              <select
                className="form-input"
                value={selected.plan}
                onChange={(event) => updateCompany(selected, { plan: event.target.value })}
              >
                {Object.entries(PLAN_CATALOG).map(([id, plan]) => (
                  <option key={id} value={id}>{plan.label}</option>
                ))}
              </select>
            </div>
            <button
              className={`btn ${selected.status === "active" ? "btn-secondary" : "btn-primary"} w-full mt-4`}
              onClick={() => toggleCompanyStatus(selected)}
            >
              {selected.status === "active" ? "Suspender acceso" : "Reactivar empresa"}
            </button>
            <div style={{ marginTop: "16px", padding: "12px", borderRadius: "12px", background: "#f8fafc", fontSize: ".76rem", color: "#475569" }}>
              <div><strong>Stripe:</strong> {selected.stripeCustomerId || "No conectado"}</div>
              <div style={{ marginTop: "5px" }}>
                <strong>Fin de periodo:</strong>{" "}
                {selected.currentPeriodEndsAt
                  ? new Date(selected.currentPeriodEndsAt).toLocaleDateString("es-ES")
                  : "—"}
              </div>
            </div>
          </aside>
        )}
      </div>

      <section style={{ marginTop: "26px" }}>
        <h3 style={{ fontSize: "1.15rem", fontWeight: 900, marginBottom: "12px" }}>
          Catálogo de planes recomendado
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: "14px",
          }}
        >
          {Object.entries(PLAN_CATALOG).map(([id, plan]) => (
            <div key={id} className="card" style={{ padding: "18px", borderTop: `4px solid ${plan.color}` }}>
              <div style={{ fontWeight: 900, fontSize: "1.05rem" }}>{plan.label}</div>
              <div style={{ color: plan.color, fontSize: "1.45rem", fontWeight: 900, margin: "8px 0 14px" }}>
                {plan.monthlyPrice === null ? "A medida" : `${plan.monthlyPrice} €/mes`}
              </div>
              <div className="text-sm text-muted">
                {formatLimit(plan.operarios)} operarios · {formatLimit(plan.communities)} comunidades · Administradores sin límite · {formatLimit(plan.storageGb)} GB
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
