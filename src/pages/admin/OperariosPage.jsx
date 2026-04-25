import { useState, useEffect } from 'react';
import { getOperarios, toggleUserActive, resetPassword, deleteOperario } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';

export default function OperariosPage() {
  const { createOperario } = useAuth();
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ 
    open: false, 
    operario: null, 
    inputName: '',
    options: {
      deleteHistory: false,
      deleteMaterials: false,
      deleteReports: false
    }
  });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadOperarios(); }, []);

  async function loadOperarios() {
    try {
      const ops = await getOperarios();
      setOperarios(ops);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOperario(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createOperario(form.email, form.password, form.name, form.phone);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', phone: '' });
      // Note: creating user via client SDK logs us in as that user
      // In production, use Admin SDK Cloud Function
      alert('Operario creado. NOTA: Tendrás que re-iniciar sesión como admin.');
      await loadOperarios();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(op) {
    await toggleUserActive(op.uid, !op.active);
    await loadOperarios();
  }

  async function handleResetPassword(email) {
    try {
      await resetPassword(email);
      alert('Email de reset de contraseña enviado a ' + email);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleDeleteOperario() {
    if (!deleteConfirm.operario) return;
    const op = deleteConfirm.operario;
    
    // Verificar que el nombre coincide
    if (deleteConfirm.inputName.trim().toLowerCase() !== op.name.trim().toLowerCase()) {
      alert('El nombre no coincide. Escríbelo exactamente para confirmar.');
      return;
    }

    setDeleting(true);
    try {
      await deleteOperario(op.uid, deleteConfirm.options);
      setDeleteConfirm({ 
        open: false, 
        operario: null, 
        inputName: '', 
        options: { deleteHistory: false, deleteMaterials: false, deleteReports: false } 
      });
      await loadOperarios();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800 }}>Operarios</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          ➕ Nuevo operario
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {operarios.map(op => (
                <tr key={op.uid}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="sidebar-avatar" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>
                        {op.name?.charAt(0) || '?'}
                      </div>
                      <span className="font-semibold">{op.name}</span>
                    </div>
                  </td>
                  <td className="text-muted text-sm">{op.email}</td>
                  <td className="text-sm">{op.phone || '—'}</td>
                  <td>
                    <span className={`badge ${op.active ? 'badge-success' : 'badge-danger'}`}>
                      {op.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleToggleActive(op)}>
                        {op.active ? '⏸️ Desactivar' : '▶️ Activar'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(op.email)}>
                        🔑 Reset
                      </button>
                      <button 
                        className="btn btn-ghost btn-sm" 
                        onClick={() => setDeleteConfirm({ 
                          open: true, 
                          operario: op, 
                          inputName: '',
                          options: { deleteHistory: false, deleteMaterials: false, deleteReports: false }
                        })}
                        style={{ color: 'var(--color-danger)' }}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {operarios.length === 0 && (
                <tr><td colSpan="5" className="text-center text-muted p-6">No hay operarios registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nuevo operario</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateOperario}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} required minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creando...' : 'Crear operario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACIÓN DE ELIMINACIÓN */}
      {deleteConfirm.open && deleteConfirm.operario && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ open: false, operario: null, inputName: '', options: { deleteHistory: false, deleteMaterials: false, deleteReports: false } })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--color-danger)' }}>⚠️ Eliminar operario</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm({ open: false, operario: null, inputName: '', options: { deleteHistory: false, deleteMaterials: false, deleteReports: false } })}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ 
                background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', 
                border: '1px solid #fca5a5',
                borderRadius: 'var(--radius-lg)', 
                padding: 'var(--space-4)', 
                marginBottom: 'var(--space-4)' 
              }}>
                <p style={{ fontWeight: 700, color: '#991b1b', marginBottom: 'var(--space-2)' }}>
                  ¿Estás seguro de que quieres eliminar a este operario?
                </p>
                <p style={{ fontSize: 'var(--font-sm)', color: '#7f1d1d' }}>
                  Esta acción <strong>no se puede deshacer</strong>. Se eliminará:
                </p>
                <ul style={{ fontSize: 'var(--font-sm)', color: '#7f1d1d', paddingLeft: '1.2rem', marginTop: 'var(--space-2)', lineHeight: 1.8 }}>
                  <li>El perfil del operario</li>
                  <li>Sus asignaciones de comunidades</li>
                  <li>Sus servicios programados pendientes</li>
                </ul>
              </div>

              <div style={{ 
                background: 'var(--bg-subtle)', 
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>Operario a eliminar:</div>
                <div style={{ fontSize: 'var(--font-lg)', fontWeight: 800 }}>{deleteConfirm.operario.name}</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{deleteConfirm.operario.email}</div>
              </div>

              <div style={{ marginBottom: 'var(--space-5)' }}>
                <p style={{ fontWeight: 600, fontSize: 'var(--font-sm)', marginBottom: 'var(--space-3)', color: 'var(--text-main)' }}>
                  Opciones adicionales de borrado:
                </p>
                
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                    <input 
                      type="checkbox" 
                      checked={deleteConfirm.options.deleteHistory}
                      onChange={e => setDeleteConfirm(prev => ({
                        ...prev,
                        options: { ...prev.options, deleteHistory: e.target.checked }
                      }))}
                      style={{ width: 18, height: 18 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-sm)' }}>Borrar historial de trabajo</div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Fichajes, jornadas y registros de km.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                    <input 
                      type="checkbox" 
                      checked={deleteConfirm.options.deleteMaterials}
                      onChange={e => setDeleteConfirm(prev => ({
                        ...prev,
                        options: { ...prev.options, deleteMaterials: e.target.checked }
                      }))}
                      style={{ width: 18, height: 18 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-sm)' }}>Borrar solicitudes de materiales</div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Histórico de pedidos de productos.</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors" style={{ borderColor: 'var(--color-border)' }}>
                    <input 
                      type="checkbox" 
                      checked={deleteConfirm.options.deleteReports}
                      onChange={e => setDeleteConfirm(prev => ({
                        ...prev,
                        options: { ...prev.options, deleteReports: e.target.checked }
                      }))}
                      style={{ width: 18, height: 18 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-sm)' }}>Borrar informes enviados</div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Incidencias y partes de trabajo.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Escribe el nombre del operario para confirmar:
                </label>
                <input 
                  className="form-input" 
                  placeholder={deleteConfirm.operario.name}
                  value={deleteConfirm.inputName}
                  onChange={e => setDeleteConfirm(prev => ({ ...prev, inputName: e.target.value }))}
                  style={{ 
                    borderColor: deleteConfirm.inputName.trim().toLowerCase() === deleteConfirm.operario.name.trim().toLowerCase()
                      ? 'var(--color-danger)' 
                      : 'var(--color-border)'
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setDeleteConfirm({ 
                  open: false, 
                  operario: null, 
                  inputName: '',
                  options: { deleteHistory: false, deleteMaterials: false, deleteReports: false }
                })}
              >
                Cancelar
              </button>
              <button 
                className="btn" 
                onClick={handleDeleteOperario}
                disabled={deleting || deleteConfirm.inputName.trim().toLowerCase() !== deleteConfirm.operario.name.trim().toLowerCase()}
                style={{ 
                  background: 'var(--color-danger)', 
                  color: 'white', 
                  border: 'none',
                  opacity: deleteConfirm.inputName.trim().toLowerCase() !== deleteConfirm.operario.name.trim().toLowerCase() ? 0.4 : 1
                }}
              >
                {deleting ? '⏳ Eliminando...' : '🗑️ Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
