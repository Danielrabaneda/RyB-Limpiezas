import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useTenant } from "../../contexts/TenantContext";
import { getOperarios } from "../../services/authService";
import { getCommunities } from "../../services/communityService";
import {
  deleteScheduledService,
  editPendingScheduledService,
  getScheduledServicesRange,
  updateScheduledServiceStatus,
} from "../../services/scheduleService";
import {
  filterPendingServices,
  pendingServiceAgeDays,
  pendingServiceType,
  scheduledServiceDate,
} from "../../utils/pendingServices";
import {
  canNavigateToCommunity,
  openCommunityNavigation,
} from "../../utils/navigation";

const EMPTY_FILTERS = {
  search: "",
  operarioId: "",
  communityId: "",
  timing: "all",
  type: "todos",
  dateFrom: "",
  dateTo: "",
  sort: "oldest",
};

function userName(user) {
  return user?.displayName || user?.name || user?.email || "Sin operario";
}

function ServiceEditor({ dialog, operarios, busy, onClose, onSave }) {
  const service = dialog?.service;
  const [form, setForm] = useState(() => ({
    taskName: service?.taskName || "",
    assignedUserId: service?.assignedUserId || "",
    scheduledDate: service ? format(scheduledServiceDate(service), "yyyy-MM-dd") : "",
  }));
  const moveOnly = dialog?.mode === "move";

  if (!dialog) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,.55)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <form
        className="bg-white rounded-2xl shadow-xl"
        style={{ width: "min(520px, 100%)", padding: "1.5rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <h2 className="text-xl font-bold mb-1">
          {moveOnly ? "Mover servicio" : "Editar servicio"}
        </h2>
        <p className="text-sm text-muted mb-5">
          Se actualizará esta misma ficha, sin crear una copia.
        </p>

        {!moveOnly && (
          <>
            <label className="form-label">Tarea</label>
            <input
              className="form-input mb-4"
              value={form.taskName}
              required
              onChange={(event) => setForm({ ...form, taskName: event.target.value })}
            />
            <label className="form-label">Operario</label>
            <select
              className="form-input mb-4"
              value={form.assignedUserId}
              required
              onChange={(event) =>
                setForm({ ...form, assignedUserId: event.target.value })
              }
            >
              <option value="">Selecciona un operario</option>
              {operarios.map((operario) => (
                <option key={operario.uid} value={operario.uid}>
                  {userName(operario)}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="form-label">Nueva fecha</label>
        <input
          type="date"
          className="form-input"
          value={form.scheduledDate}
          required
          onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
        />

        <div className="flex gap-3 justify-end mt-6">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Guardando…" : moveOnly ? "Mover" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PendingServicesPage() {
  const { companyId } = useTenant();
  const [services, setServices] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const [nextServices, nextCommunities, nextOperarios] = await Promise.all([
        getScheduledServicesRange(companyId, new Date(2010, 0, 1), new Date()),
        getCommunities(companyId),
        getOperarios(companyId),
      ]);
      setServices(nextServices);
      setCommunities(nextCommunities);
      setOperarios(nextOperarios.sort((a, b) => userName(a).localeCompare(userName(b), "es")));
    } catch (loadError) {
      console.error(loadError);
      setError("No se pudieron cargar los servicios pendientes.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const communitiesById = useMemo(
    () => Object.fromEntries(communities.map((community) => [community.id, community])),
    [communities],
  );
  const operariosById = useMemo(
    () => Object.fromEntries(operarios.map((operario) => [operario.uid, operario])),
    [operarios],
  );
  const allPending = useMemo(
    () =>
      filterPendingServices(services, EMPTY_FILTERS, {
        communitiesById,
        operariosById,
      }),
    [services, communitiesById, operariosById],
  );
  const visibleServices = useMemo(
    () =>
      filterPendingServices(services, filters, {
        communitiesById,
        operariosById,
      }),
    [services, filters, communitiesById, operariosById],
  );
  const todayCount = allPending.filter(
    (service) => pendingServiceAgeDays(service) === 0,
  ).length;
  const overdueCount = allPending.length - todayCount;

  const runAction = async (service, action, successMessage) => {
    setBusyId(service.id);
    setError("");
    try {
      await action();
      setServices((current) => current.filter((item) => item.id !== service.id));
      if (successMessage) window.alert(successMessage);
    } catch (actionError) {
      console.error(actionError);
      window.alert(`No se pudo realizar la acción: ${actionError.message}`);
    } finally {
      setBusyId("");
    }
  };

  const saveDialog = async (form) => {
    const service = dialog.service;
    setBusyId(service.id);
    try {
      await editPendingScheduledService(companyId, service.id, {
        taskName: dialog.mode === "move" ? service.taskName : form.taskName,
        assignedUserId:
          dialog.mode === "move" ? service.assignedUserId : form.assignedUserId,
        scheduledDate: form.scheduledDate,
      });
      setDialog(null);
      await load();
    } catch (saveError) {
      console.error(saveError);
      window.alert(`No se pudo guardar: ${saveError.message}`);
    } finally {
      setBusyId("");
    }
  };

  const setFilter = (name, value) =>
    setFilters((current) => ({ ...current, [name]: value }));

  return (
    <div className="page-container">
      <div className="flex justify-between items-start gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">⏰ Servicios pendientes</h1>
          <p className="text-muted mt-1">
            Servicios pendientes de hoy y de fechas anteriores.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          {loading ? "Actualizando…" : "↻ Actualizar"}
        </button>
      </div>

      <div className="grid grid-3 gap-4 mb-6">
        <div className="stat-card"><div className="stat-value">{allPending.length}</div><div className="stat-label">Pendientes hasta hoy</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "#dc2626" }}>{overdueCount}</div><div className="stat-label">Atrasados</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: "#d97706" }}>{todayCount}</div><div className="stat-label">De hoy</div></div>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6">
        <div className="grid grid-3 gap-3">
          <input className="form-input" placeholder="Buscar comunidad, tarea u operario…" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} />
          <select className="form-input" value={filters.operarioId} onChange={(event) => setFilter("operarioId", event.target.value)}>
            <option value="">Todos los operarios</option>
            {operarios.map((operario) => <option key={operario.uid} value={operario.uid}>{userName(operario)}</option>)}
          </select>
          <select className="form-input" value={filters.communityId} onChange={(event) => setFilter("communityId", event.target.value)}>
            <option value="">Todas las comunidades</option>
            {communities.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}
          </select>
          <select className="form-input" value={filters.timing} onChange={(event) => setFilter("timing", event.target.value)}>
            <option value="all">Todos: atrasados y hoy</option>
            <option value="overdue">Solo atrasados</option>
            <option value="today">Solo de hoy</option>
            <option value="older7">Con 7 días o más</option>
            <option value="older30">Con 30 días o más</option>
          </select>
          <select className="form-input" value={filters.type} onChange={(event) => setFilter("type", event.target.value)}>
            <option value="todos">Todos los tipos</option>
            <option value="escalera">Limpieza de escalera</option>
            <option value="portal">Repaso de portal</option>
            <option value="oficina">Limpieza de oficina</option>
            <option value="garaje">Limpieza de garaje</option>
            <option value="otros">Otros</option>
          </select>
          <select className="form-input" value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}>
            <option value="oldest">Más antiguos primero</option>
            <option value="newest">Más recientes primero</option>
          </select>
          <label className="text-sm">Desde<input type="date" className="form-input mt-1" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} /></label>
          <label className="text-sm">Hasta<input type="date" className="form-input mt-1" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} /></label>
          <button className="btn btn-ghost" style={{ alignSelf: "end" }} onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</button>
        </div>
        <p className="text-sm text-muted mt-4">Mostrando {visibleServices.length} de {allPending.length} servicios.</p>
      </section>

      {error && <div className="alert alert-error mb-4">{error}</div>}
      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">Cargando servicios…</div>
      ) : visibleServices.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">No hay servicios que coincidan con estos filtros.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleServices.map((service) => {
            const community = communitiesById[service.communityId];
            const operario = operariosById[service.assignedUserId];
            const date = scheduledServiceDate(service);
            const age = pendingServiceAgeDays(service);
            const busy = busyId === service.id;
            return (
              <article key={service.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <div className="flex justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <h3 className="font-bold text-lg">{community?.name || service.communityName || "Comunidad sin nombre"}</h3>
                      <span className="badge badge-warning">{age ? `${age} días de atraso` : "Pendiente hoy"}</span>
                    </div>
                    <p className="font-semibold mt-2">📋 {service.taskName || "Servicio"}</p>
                    <p className="text-sm text-muted mt-1">📅 {format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })} · 👷 {userName(operario)}</p>
                    <p className="text-xs text-muted mt-1">Tipo: {pendingServiceType(service)}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap items-start">
                    {canNavigateToCommunity(community) && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => openCommunityNavigation(community)}>🧭 Cómo llegar</button>}
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDialog({ mode: "move", service })}>📅 Mover</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDialog({ mode: "edit", service })}>✏️ Editar</button>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => window.confirm("¿Marcar este servicio como hecho?") && runAction(service, () => updateScheduledServiceStatus(companyId, service.id, "completed"), "Servicio marcado como hecho.")}>{busy ? "Guardando…" : "✓ Hecho"}</button>
                    <button className="btn btn-sm" style={{ background: "#fee2e2", color: "#b91c1c" }} disabled={busy} onClick={() => window.confirm("¿Eliminar definitivamente este servicio?") && runAction(service, () => deleteScheduledService(companyId, service.id))}>🗑 Eliminar</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dialog && (
        <ServiceEditor
          key={`${dialog.mode}-${dialog.service.id}`}
          dialog={dialog}
          operarios={operarios}
          busy={busyId === dialog.service.id}
          onClose={() => setDialog(null)}
          onSave={saveDialog}
        />
      )}
    </div>
  );
}
