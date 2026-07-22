import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../../contexts/TenantContext";
import { getCommunities } from "../../services/communityService";
import { getOperarios } from "../../services/authService";
import { getScheduledServicesRange } from "../../services/scheduleService";
import { getCheckInsRange } from "../../services/checkInService";
import {
  generateServicesForDays,
  generateServicesForRange,
  cleanupDuplicateScheduledServices,
  checkAndRolloverGarages,
} from "../../services/scheduleService";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { es } from "date-fns/locale";
import PlanningCalendar from "../../components/PlanningCalendar";
import TransferRequestsPanel from "../../components/admin/TransferRequestsPanel";
import GPSSuggestionsPanel from "../../components/admin/GPSSuggestionsPanel";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { tenantCollection } from "../../utils/tenantFirestore";
import { createSystemNotification } from "../../services/notificationService";
import { buildSystemNotificationArgs } from "../../utils/notificationRequest";

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const { companyId } = useTenant();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({
    communities: 0,
    operarios: 0,
    todayServices: 0,
    pendingServices: 0,
    completedToday: 0,
    activeCheckIns: 0,
  });
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [pendingGPS, setPendingGPS] = useState(0);
  const [activeOpsNames, setActiveOpsNames] = useState([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notifForm, setNotifForm] = useState({
    recipient: "all",
    userId: "",
    type: "info",
    triggerEvent: "immediate",
    title: "",
    body: "",
  });
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  // Real-time listeners for pending counts
  useEffect(() => {
    if (!companyId) return;
    const qT = query(
      tenantCollection(db, companyId, "transfers"),
      where("status", "==", "pending"),
    );
    const unsubT = onSnapshot(qT, (snap) => setPendingTransfers(snap.size));
    const qG = query(
      tenantCollection(db, companyId, "gpsSuggestions"),
      where("status", "==", "pending"),
    );
    const unsubG = onSnapshot(qG, (snap) => setPendingGPS(snap.size));
    return () => {
      unsubT();
      unsubG();
    };
  }, [companyId]);

  async function loadDashboard() {
    try {
      await checkAndRolloverGarages(companyId);
      const [
        communitiesList,
        ops,
        todayServices,
        checkIns,
        activeWorkdaysSnap,
      ] = await Promise.all([
        getCommunities(companyId),
        getOperarios(companyId),
        getScheduledServicesRange(companyId, new Date(), new Date()),
        getCheckInsRange(companyId, new Date(), new Date()),
        getDocs(
          query(tenantCollection(db, companyId, "workdays"), where("status", "==", "active")),
        ),
      ]);

      const activeWorkdays = activeWorkdaysSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const completed = todayServices.filter(
        (s) => s.status === "completed",
      ).length;
      const pending = todayServices.filter(
        (s) => s.status === "pending",
      ).length;

      // Calculate real-time active operators (must have active workday)
      const activeUserIds = new Set();

      // Get set of UIDs of users with active workdays
      const activeWdUserIds = new Set();
      activeWorkdays.forEach((wd) => {
        if (wd.userId) activeWdUserIds.add(wd.userId);
        if (wd.currentCompanionId) activeWdUserIds.add(wd.currentCompanionId);
      });

      // 1. Add all operators with active workdays (and their global companions)
      activeWorkdays.forEach((wd) => {
        if (wd.userId) activeUserIds.add(wd.userId);
        if (wd.currentCompanionId) activeUserIds.add(wd.currentCompanionId);
      });

      // 2. Add all operators with active check-ins (and service-specific companions) only if they have an active workday
      const activeCheckInDocs = checkIns.filter((c) => !c.checkOutTime);
      activeCheckInDocs.forEach((c) => {
        if (c.userId && activeWdUserIds.has(c.userId)) {
          activeUserIds.add(c.userId);
        }

        if (c.scheduledServiceId) {
          const service = todayServices.find(
            (s) => s.id === c.scheduledServiceId,
          );
          if (service && Array.isArray(service.companionIds)) {
            service.companionIds.forEach((companionId) => {
              if (companionId && activeWdUserIds.has(companionId)) {
                activeUserIds.add(companionId);
              }
            });
          }
        }
      });

      // Unique UIDs of all active operators
      const uniqueActiveUserIds = Array.from(activeUserIds);
      const activeCount = uniqueActiveUserIds.length;

      // Map UIDs to actual operator names
      const names = uniqueActiveUserIds.map((uid) => {
        const op = ops.find((o) => o.uid === uid);
        return op ? op.name || op.email : "Desconocido";
      });

      setStats({
        communities: communitiesList.length,
        operarios: ops.length,
        todayServices: todayServices.length,
        pendingServices: pending,
        completedToday: completed,
        activeCheckIns: activeCount,
      });

      setActiveOpsNames(names);
      setOperarios(ops);
    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p className="text-muted">Cargando dashboard...</p>
      </div>
    );
  }

  const totalPending = pendingTransfers + pendingGPS;

  const scrollTo = (id) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!notifForm.title.trim() || !notifForm.body.trim()) {
      alert("Por favor, rellena el título y el cuerpo de la notificación.");
      return;
    }

    if (notifForm.recipient === "specific" && !notifForm.userId) {
      alert("Por favor, selecciona un operario.");
      return;
    }

    setNotifLoading(true);
    try {
      if (notifForm.recipient === "all") {
        // Enviar a todos los operarios
        const promises = operarios.map((op) =>
          createSystemNotification(
            ...buildSystemNotificationArgs(companyId, op.uid, notifForm),
          ),
        );
        await Promise.all(promises);
        alert("Notificación enviada con éxito a todos los trabajadores.");
      } else {
        // Enviar a un operario concreto
        const selectedOp = operarios.find((op) => op.uid === notifForm.userId);
        await createSystemNotification(
          ...buildSystemNotificationArgs(
            companyId,
            notifForm.userId,
            notifForm,
          ),
        );
        alert(
          `Notificación enviada con éxito a ${selectedOp?.name || "el operario seleccionado"}.`,
        );
      }
      setShowNotificationModal(false);
      setNotifForm({
        recipient: "all",
        userId: "",
        type: "info",
        triggerEvent: "immediate",
        title: "",
        body: "",
      });
    } catch (error) {
      console.error("Error al enviar notificaciones:", error);
      alert("Ocurrió un error al enviar la notificación: " + error.message);
    } finally {
      setNotifLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Mobile-friendly banner for Admins to switch to Operario view */}
      <div
        className="mb-6 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, var(--color-primary-50) 0%, #e0e7ff 100%)",
          border: "1px solid var(--color-primary-100)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: "var(--color-primary)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📱</span> Vista de Operario Móvil
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            Como administrador, puedes usar la aplicación de operario en ruta para pedir productos, registrar jornadas o realizar check-ins en tiempo real.
          </div>
        </div>
        <button
          onClick={() => navigate("/operario")}
          className="btn btn-primary btn-sm flex items-center gap-2"
          style={{ whiteSpace: "nowrap", width: "100%", sm: { width: "auto" } }}
        >
          👷 Entrar como Operario
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div>
          <h2
            style={{
              fontSize: "var(--font-2xl)",
              fontWeight: 800,
              color: "var(--color-text)",
            }}
          >
            Hola, {userProfile?.name || "Admin"} 👋
          </h2>
          <p className="text-muted text-sm">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <div>
          <button
            onClick={() => {
              setNotifForm({
                recipient: "all",
                userId: "",
                type: "info",
                triggerEvent: "immediate",
                title: "",
                body: "",
              });
              setShowNotificationModal(true);
            }}
            className="btn btn-primary"
            style={{
              padding: "10px 20px",
              borderRadius: "14px",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(37,99,235,0.2)",
            }}
          >
            📢 Enviar Notificación
          </button>
        </div>
      </div>

      {/* ===== BANNER DE PENDIENTES ===== */}
      {totalPending > 0 && (
        <div
          style={{
            background:
              "linear-gradient(135deg, #1e40af 0%, #1d4ed8 50%, #2563eb 100%)",
            borderRadius: "16px",
            padding: "16px 20px",
            marginBottom: "24px",
            boxShadow: "0 4px 24px rgba(37,99,235,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            animation: "pendingPulse 3s ease-in-out infinite",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                flexShrink: 0,
              }}
            >
              🔔
            </div>
            <div>
              <div
                style={{
                  color: "white",
                  fontWeight: 800,
                  fontSize: "1rem",
                  lineHeight: 1.2,
                }}
              >
                {totalPending} acción{totalPending > 1 ? "es" : ""} pendiente
                {totalPending > 1 ? "s" : ""} de revisión
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: "0.75rem",
                  marginTop: "2px",
                }}
              >
                {pendingTransfers > 0 && (
                  <span>
                    📋 {pendingTransfers} traspaso
                    {pendingTransfers > 1 ? "s" : ""}
                  </span>
                )}
                {pendingTransfers > 0 && pendingGPS > 0 && (
                  <span style={{ margin: "0 6px" }}>·</span>
                )}
                {pendingGPS > 0 && (
                  <span>
                    📍 {pendingGPS} ubicación{pendingGPS > 1 ? "es" : ""} GPS
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {pendingTransfers > 0 && (
              <button
                onClick={() => scrollTo("panel-transfers")}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                  transition: "background 0.2s",
                  whiteSpace: "normal",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.3)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
                }
              >
                Ver traspasos →
              </button>
            )}
            {pendingGPS > 0 && (
              <button
                onClick={() => scrollTo("panel-gps")}
                style={{
                  background: "white",
                  color: "#1d4ed8",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  transition: "opacity 0.2s",
                  whiteSpace: "normal",
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Ver ubicaciones GPS →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-4 gap-4 mb-8">
        <div className="stat-card shadow-sm">
          <div className="stat-icon blue">🏢</div>
          <div className="stat-value">{stats.communities}</div>
          <div className="stat-label">Comunidades</div>
        </div>
        <div className="stat-card shadow-sm">
          <div className="stat-icon green">👷</div>
          <div className="stat-value">{stats.operarios}</div>
          <div className="stat-label">Operarios</div>
        </div>
        <div className="stat-card shadow-sm">
          <div className="stat-icon orange">📋</div>
          <div className="stat-value">{stats.todayServices}</div>
          <div className="stat-label">Servicios hoy</div>
        </div>
        <div className="stat-card shadow-sm">
          <div className="stat-icon purple">✅</div>
          <div className="stat-value">{stats.completedToday}</div>
          <div className="stat-label">Completados hoy</div>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <h3 className="section-title mb-4">⚡ Acciones Rápidas</h3>
      <div className="grid grid-3 gap-3 mb-8">
        <button
          onClick={() => navigate("/admin/inventory")}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: "auto", background: "white" }}
        >
          <span style={{ fontSize: "1.5rem" }}>📦</span>
          <span className="text-xs font-bold uppercase tracking-wider">
            Materiales
          </span>
        </button>
        <button
          onClick={() => navigate("/admin/reports")}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: "auto", background: "white" }}
        >
          <span style={{ fontSize: "1.5rem" }}>📄</span>
          <span className="text-xs font-bold uppercase tracking-wider">
            Informes
          </span>
        </button>
        <button
          onClick={() => navigate("/admin/evidencias")}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: "auto", background: "white" }}
        >
          <span style={{ fontSize: "1.5rem" }}>📸</span>
          <span className="text-xs font-bold uppercase tracking-wider">
            Evidencias
          </span>
        </button>
        <button
          onClick={() => navigate("/admin/communities")}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: "auto", background: "white" }}
        >
          <span style={{ fontSize: "1.5rem" }}>🏢</span>
          <span className="text-xs font-bold uppercase tracking-wider">
            Comunidades
          </span>
        </button>
        <button
          onClick={() => navigate("/admin/operarios")}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: "auto", background: "white" }}
        >
          <span style={{ fontSize: "1.5rem" }}>👷</span>
          <span className="text-xs font-bold uppercase tracking-wider">
            Operarios
          </span>
        </button>
        <button
          onClick={async () => {
            if (
              !window.confirm(
                "¿Eliminar servicios duplicados de la base de datos? Esta operación no se puede deshacer.",
              )
            )
              return;
            try {
              const n = await cleanupDuplicateScheduledServices(companyId);
              alert(`✅ Limpieza completada. ${n} duplicado(s) eliminado(s).`);
              loadDashboard();
            } catch (err) {
              alert("❌ Error durante la limpieza: " + err.message);
            }
          }}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-red-200 hover:bg-red-50 shadow-sm"
          style={{ height: "auto", background: "white" }}
        >
          <span style={{ fontSize: "1.5rem" }}>🧹</span>
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: "#dc2626" }}
          >
            Limpiar Dup.
          </span>
        </button>
      </div>

      {/* Panels with scroll anchors */}
      <div id="panel-transfers">
        <TransferRequestsPanel
          onActionComplete={() => {
            loadDashboard();
            setRefreshKey((prev) => prev + 1);
          }}
        />
      </div>

      <div id="panel-gps">
        <GPSSuggestionsPanel
          onActionComplete={() => {
            loadDashboard();
            setRefreshKey((prev) => prev + 1);
          }}
        />
      </div>

      <div className="mb-12">
        <h3 className="section-title mb-6">📅 Planificación Mensual</h3>
        <div
          className="bg-white rounded-3xl p-2 shadow-sm border border-slate-100"
          style={{ overflowX: "auto" }}
        >
          <PlanningCalendar key={refreshKey} isAdmin operarios={operarios} />
        </div>
      </div>

      {/* Operarios activos */}
      <div
        className="card shadow-md border-0 bg-white"
        style={{ borderLeft: "4px solid #3b82f6" }}
      >
        <div className="card-header border-0 bg-transparent flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xl">📍</span>
            <h3 className="card-title text-slate-800 m-0">
              Operarios activos actualmente
            </h3>
          </div>
          <span className="badge badge-primary">{stats.activeCheckIns}</span>
        </div>

        <div className="p-4">
          {stats.activeCheckIns === 0 ? (
            <p className="text-muted text-sm italic">
              Ningún operario fichado en este momento.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="pulse-dot"></span>
                <span className="text-sm font-medium text-blue-700">
                  {stats.activeCheckIns} operario
                  {stats.activeCheckIns > 1 ? "s" : ""} realizando servicios en
                  tiempo real.
                </span>
              </div>
              {activeOpsNames.length > 0 && (
                <div className="mt-1 p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Operarios en servicio:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {activeOpsNames.map((name, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== MODAL CENTRO DE NOTIFICACIONES ===== */}
      {showNotificationModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="animate-scaleUp"
            style={{
              background: "white",
              borderRadius: "24px",
              width: "100%",
              maxWidth: "500px",
              padding: "28px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#1e293b",
                margin: "0 0 20px 0",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              📢 Crear y Enviar Notificación
            </h3>

            <form
              onSubmit={handleSendNotification}
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div className="form-group">
                <label
                  className="form-label"
                  style={{
                    fontWeight: 600,
                    color: "#475569",
                    fontSize: "0.85rem",
                  }}
                >
                  Destinatarios
                </label>
                <div style={{ display: "flex", gap: "16px", marginTop: "6px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="recipient"
                      value="all"
                      checked={notifForm.recipient === "all"}
                      onChange={() =>
                        setNotifForm((f) => ({
                          ...f,
                          recipient: "all",
                          userId: "",
                        }))
                      }
                    />
                    Todos los trabajadores
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="recipient"
                      value="specific"
                      checked={notifForm.recipient === "specific"}
                      onChange={() =>
                        setNotifForm((f) => ({ ...f, recipient: "specific" }))
                      }
                    />
                    Un trabajador en concreto
                  </label>
                </div>
              </div>

              {notifForm.recipient === "specific" && (
                <div className="form-group animate-fadeIn">
                  <label
                    className="form-label"
                    style={{
                      fontWeight: 600,
                      color: "#475569",
                      fontSize: "0.85rem",
                    }}
                  >
                    Seleccionar Trabajador
                  </label>
                  <select
                    className="form-select"
                    value={notifForm.userId}
                    onChange={(e) =>
                      setNotifForm((f) => ({ ...f, userId: e.target.value }))
                    }
                    style={{ marginTop: "6px" }}
                    required
                  >
                    <option value="">-- Elige un operario --</option>
                    {operarios.map((op) => (
                      <option key={op.uid} value={op.uid}>
                        {op.name || op.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <div className="form-group" style={{ flex: "1 1 200px" }}>
                  <label
                    className="form-label"
                    style={{
                      fontWeight: 600,
                      color: "#475569",
                      fontSize: "0.85rem",
                    }}
                  >
                    Tipo de Notificación
                  </label>
                  <select
                    className="form-select"
                    value={notifForm.type}
                    onChange={(e) =>
                      setNotifForm((f) => ({ ...f, type: e.target.value }))
                    }
                    style={{ marginTop: "6px" }}
                  >
                    <option value="info">🔵 Info / Sugerencia</option>
                    <option value="warning">🟡 Precaución</option>
                    <option value="success">🟢 Éxito</option>
                    <option value="danger">🔴 Alerta / Peligro</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: "1 1 200px" }}>
                  <label
                    className="form-label"
                    style={{
                      fontWeight: 600,
                      color: "#475569",
                      fontSize: "0.85rem",
                    }}
                  >
                    Cuándo Mostrar
                  </label>
                  <select
                    className="form-select"
                    value={notifForm.triggerEvent}
                    onChange={(e) =>
                      setNotifForm((f) => ({
                        ...f,
                        triggerEvent: e.target.value,
                      }))
                    }
                    style={{ marginTop: "6px" }}
                  >
                    <option value="immediate">
                      ⚡ Al enviarla (tiempo real)
                    </option>
                    <option value="workday_start">🌅 Al iniciar jornada</option>
                    <option value="workday_end">
                      🚪 Al finalizar jornada laboral
                    </option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  style={{
                    fontWeight: 600,
                    color: "#475569",
                    fontSize: "0.85rem",
                  }}
                >
                  Título / Asunto
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: Retraso en servicio..."
                  value={notifForm.title}
                  onChange={(e) =>
                    setNotifForm((f) => ({ ...f, title: e.target.value }))
                  }
                  style={{ marginTop: "6px" }}
                  maxLength={50}
                  required
                />
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  style={{
                    fontWeight: 600,
                    color: "#475569",
                    fontSize: "0.85rem",
                  }}
                >
                  Mensaje
                </label>
                <textarea
                  className="form-input"
                  placeholder="Escribe el mensaje detallado..."
                  value={notifForm.body}
                  onChange={(e) =>
                    setNotifForm((f) => ({ ...f, body: e.target.value }))
                  }
                  style={{
                    marginTop: "6px",
                    minHeight: "100px",
                    resize: "vertical",
                  }}
                  maxLength={500}
                  required
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyStyle: "flex-end",
                  gap: "12px",
                  marginTop: "12px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowNotificationModal(false)}
                  className="btn btn-secondary"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "12px",
                    border: "1px solid var(--color-border)",
                  }}
                  disabled={notifLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: "8px 20px",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                  }}
                  disabled={notifLoading}
                >
                  {notifLoading ? "Enviando..." : "Enviar Notificación 🚀"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .section-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--color-text);
          border-left: 4px solid var(--color-primary);
          padding-left: 12px;
        }
        @media (max-width: 480px) {
          .section-title {
            font-size: 0.95rem;
          }
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @keyframes pendingPulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(37,99,235,0.35); }
          50% { box-shadow: 0 4px 32px rgba(37,99,235,0.55), 0 0 0 4px rgba(37,99,235,0.15); }
        }
      `}</style>
    </div>
  );
}
