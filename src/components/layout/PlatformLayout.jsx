import { useCallback, useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { listCompanyRequests } from "../../services/platformService";

const PLATFORM_REQUESTS_UPDATED_EVENT = "platform-requests-updated";

export default function PlatformLayout() {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingLeads, setPendingLeads] = useState(0);

  const loadPendingLeads = useCallback(async () => {
    try {
      const requests = await listCompanyRequests();
      setPendingLeads(
        requests.filter((request) => request.status === "pending").length,
      );
    } catch (error) {
      console.error(
        "No se pudieron cargar las solicitudes pendientes:",
        error,
      );
    }
  }, []);

  useEffect(() => {
    loadPendingLeads();
    window.addEventListener(
      PLATFORM_REQUESTS_UPDATED_EVENT,
      loadPendingLeads,
    );
    return () =>
      window.removeEventListener(
        PLATFORM_REQUESTS_UPDATED_EVENT,
        loadPendingLeads,
      );
  }, [loadPendingLeads]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const navItems = [
    {
      path: "/plataforma/empresas",
      icon: "🏢",
      label: "Resumen y empresas",
    },
    {
      path: "/plataforma/solicitudes",
      icon: "📩",
      label: "Solicitudes",
    },
  ];

  const currentTitle =
    navItems.find((item) => location.pathname.startsWith(item.path))?.label ||
    "Consola global";

  return (
    <div className="admin-layout">
      <div
        className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div
            className="sidebar-brand-icon"
            style={{
              background: "linear-gradient(135deg,#2563eb,#06b6d4)",
            }}
          >
            ◈
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-brand-text truncate">LimpiaGest</div>
            <div className="sidebar-brand-sub">Consola global</div>
          </div>
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("ryb-open-cookie-settings"))
            }
            className="btn btn-ghost btn-sm"
            title="Configuración de privacidad y cookies"
            style={{
              color: "rgba(255,255,255,0.6)",
              padding: "6px 8px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            🍪
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Plataforma</div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""} flex items-center justify-between`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <div className="flex items-center gap-3">
                <span className="sidebar-link-icon">{item.icon}</span>
                {item.label}
              </div>
              {item.path === "/plataforma/solicitudes" &&
                pendingLeads > 0 && (
                  <span
                    className="badge bg-emerald-500 text-white border-0 text-xs px-2 py-0.5 shadow-sm animate-pulse"
                    title="Solicitudes pendientes"
                  >
                    {pendingLeads}
                  </span>
                )}
            </NavLink>
          ))}

          <div
            style={{
              margin: "15px 12px 5px",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          />
          <NavLink
            to="/admin"
            className="sidebar-link"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="sidebar-link-icon">↩</span>
            Volver a Limpiezas Rayba
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {userProfile?.name?.charAt(0) || "A"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-user-name">
                {userProfile?.name || "Admin"}
              </div>
              <div className="sidebar-user-role">Administrador global</div>
            </div>
          </div>
          <button
            className="btn btn-ghost w-full mt-2"
            onClick={handleLogout}
            style={{
              justifyContent: "flex-start",
              color: "var(--color-text-muted)",
            }}
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="flex items-center gap-3">
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <h1 className="admin-header-title">{currentTitle}</h1>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate("/admin")}
          >
            Panel Rayba
          </button>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { PLATFORM_REQUESTS_UPDATED_EVENT };
