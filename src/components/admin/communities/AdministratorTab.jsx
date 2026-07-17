import React from "react";

export default function AdministratorTab({
  administrators,
  communities,
  showAdminModal,
  setShowAdminModal,
  editingAdmin,
  adminForm,
  setAdminForm,
  openEditAdminModal,
  handleSaveAdmin,
  handleDeleteAdmin,
  actionLoading,
}) {
  return (
    <>
      {/* Administrators Management Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "var(--space-4) var(--space-5)",
            borderBottom: "1px solid var(--color-border)",
            background: "#f8fafc",
          }}
        >
          <h3
            className="font-semibold"
            style={{ margin: 0, color: "#334155", fontSize: "0.95rem" }}
          >
            💼 Listado de Administradores de Fincas
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase font-bold text-muted border-b">
                <th className="p-3">Nombre Asesoría</th>
                <th className="p-3">Email Facturación</th>
                <th className="p-3 text-center">Teléfono</th>
                <th className="p-3 text-center">Persona Contacto</th>
                <th className="p-3 text-center">Comunidades</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {administrators.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-muted italic">
                    No hay Administradores de Fincas registrados. Haz clic en
                    "Nuevo Administrador" para añadir uno.
                  </td>
                </tr>
              ) : (
                administrators.map((admin) => {
                  const count = communities.filter(
                    (c) => c.administratorId === admin.id,
                  ).length;
                  return (
                    <tr
                      key={admin.id}
                      className="border-b last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3 font-semibold text-slate-800">
                        🏢 {admin.name}
                      </td>
                      <td
                        className="p-3 text-sm"
                        style={{ fontFamily: "monospace" }}
                      >
                        {admin.email || "—"}
                      </td>
                      <td className="p-3 text-center text-sm text-slate-600">
                        {admin.phone || "—"}
                      </td>
                      <td className="p-3 text-center text-sm text-slate-600">
                        {admin.contactPerson || "—"}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            border: "1px solid #dbeafe",
                          }}
                        >
                          {count} {count === 1 ? "comunidad" : "comunidades"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn btn-xs btn-secondary"
                            onClick={() => openEditAdminModal(admin)}
                            title="Editar datos del administrador"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="btn btn-xs btn-ghost text-danger"
                            type="button"
                            onClick={() => handleDeleteAdmin(admin.id)}
                            disabled={count > 0}
                            title={
                              count > 0
                                ? "No se puede eliminar porque tiene comunidades asignadas"
                                : "Eliminar administrador"
                            }
                            style={
                              count > 0
                                ? { opacity: 0.4, cursor: "not-allowed" }
                                : {}
                            }
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear/Editar Administrador */}
      {showAdminModal && (
        <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
          <div
            className="modal"
            style={{ maxWidth: "450px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {editingAdmin ? "Editar Administrador" : "Nuevo Administrador"}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAdminModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveAdmin}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">
                    Nombre de la Asesoría / Administrador
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Fincas Gómez"
                    value={adminForm.name}
                    onChange={(e) =>
                      setAdminForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Email Principal de Facturación
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Ej. administracion@fincasgomez.com"
                    value={adminForm.email}
                    onChange={(e) =>
                      setAdminForm((f) => ({ ...f, email: e.target.value }))
                    }
                    required
                  />
                  <p
                    style={{
                      fontSize: "10px",
                      color: "#64748b",
                      marginTop: "4px",
                    }}
                  >
                    Las facturas de todas las comunidades asociadas se enviarán
                    de forma agrupada a este correo.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono de Contacto</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. 968123456"
                    value={adminForm.phone}
                    onChange={(e) =>
                      setAdminForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Persona de Contacto</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. María Gómez"
                    value={adminForm.contactPerson}
                    onChange={(e) =>
                      setAdminForm((f) => ({
                        ...f,
                        contactPerson: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAdminModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? "Guardando..."
                    : editingAdmin
                      ? "Guardar Cambios"
                      : "Crear Administrador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
