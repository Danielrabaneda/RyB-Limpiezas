import { createContext, useContext, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getAuth } from "firebase/auth";

const TenantContext = createContext();

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant debe ser usado dentro de un TenantProvider (via RequireTenant)");
  }
  return context;
}

export function RequireTenant({ children }) {
  const { currentUser, companyId, authClaimsLoaded, loading, logout } = useAuth();
  const location = useLocation();
  const [retrying, setRetrying] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Cargando aplicación...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (!authClaimsLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Verificando credenciales de acceso...</p>
        </div>
      </div>
    );
  }

  if (!companyId) {
    // Fail-closed: El usuario está autenticado pero no tiene un tenant asignado.
    const handleRetry = async () => {
      setRetrying(true);
      try {
        const auth = getAuth();
        if (auth.currentUser) {
          // Forzar refresco del token para obtener claims actualizados
          await auth.currentUser.getIdToken(true);
          // Recargar la página para que AuthContext re-evalúe los claims
          window.location.reload();
        }
      } catch (err) {
        console.error("Error al refrescar token:", err);
        setRetrying(false);
      }
    };

    const handleLogout = async () => {
      try {
        await logout();
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      }
    };

    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-md w-full border border-red-100">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-6">
            Su cuenta no está asociada a ninguna empresa (tenant activo). Contacte con su administrador para que asigne su cuenta correctamente.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              onClick={handleRetry}
              disabled={retrying}
              style={{
                padding: "12px 24px",
                backgroundColor: "var(--color-primary, #2563eb)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: retrying ? "not-allowed" : "pointer",
                opacity: retrying ? 0.6 : 1,
              }}
            >
              {retrying ? "Reintentando..." : "🔄 Reintentar"}
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: "12px 24px",
                backgroundColor: "transparent",
                color: "#dc2626",
                border: "2px solid #dc2626",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🚪 Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ companyId }}>
      {children}
    </TenantContext.Provider>
  );
}
