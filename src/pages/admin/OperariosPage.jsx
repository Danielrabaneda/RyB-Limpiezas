import { useState, useEffect } from 'react';
import { getOperarios, toggleUserActive, resetPassword } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';

export default function OperariosPage() {
  const { createOperario } = useAuth();
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
