import React from 'react';
import { format } from 'date-fns';

export default function CommunityFormModal({
  showModal,
  setShowModal,
  modalRef,
  editingCommunity,
  form,
  setForm,
  handleGeocode,
  geocoding,
  gpsSuggestions,
  loadingSuggestions,
  handleAcceptSuggestion,
  handleRejectSuggestion,
  handleSaveCommunity,
  administrators
}) {
  if (!showModal) return null;

  return (
    <div 
      className="modal-overlay" 
      onMouseDown={(e) => {
        // Solo cerrar si el clic es directamente en el fondo sombreado
        if (e.target.className === 'modal-overlay') setShowModal(false);
      }}
    >
      <div className="modal" ref={modalRef}>
        <div className="modal-header">
          <h3 className="modal-title">{editingCommunity ? 'Editar comunidad' : 'Nueva comunidad'}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
        </div>
        <form onSubmit={handleSaveCommunity}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Nombre de la Comunidad</label>
              <input 
                className="form-input" 
                value={form.name} 
                onChange={e => setForm(f => ({...f, name: e.target.value}))} 
                placeholder="Ej: Urbanización El Sol"
                autoComplete="off"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <div className="flex gap-2">
                <input 
                  className="form-input" 
                  style={{ flex: 1 }}
                  value={form.address} 
                  onChange={e => setForm(f => ({...f, address: e.target.value}))} 
                  placeholder="Ej: Calle Principal 1, Madrid"
                  required 
                />
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleGeocode}
                  disabled={geocoding}
                  style={{ whiteSpace: 'nowrap', minWidth: '100px' }}
                >
                  {geocoding ? '⌛...' : '📍 Localizar'}
                </button>
              </div>
              <p className="text-xs text-muted mt-1">Usa el botón para obtener las coordenadas para el GPS automáticamente.</p>
            </div>
            <div className="form-group" style={{ 
              padding: 'var(--space-3)', 
              background: 'var(--color-bg)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--color-border)'
            }}>
              <label className="form-label" style={{ margin: 0 }}>📍 Coordenadas GPS</label>
              <div className="form-row" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label text-xs">Latitud</label>
                  <input className="form-input" type="number" step="any" value={form.lat} onChange={e => setForm(f => ({...f, lat: e.target.value}))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label text-xs">Longitud</label>
                  <input className="form-input" type="number" step="any" value={form.lng} onChange={e => setForm(f => ({...f, lng: e.target.value}))} />
                </div>
              </div>

              {/* Sugerencias GPS de operarios */}
              {editingCommunity && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  {loadingSuggestions ? (
                    <p className="text-xs text-muted">Cargando sugerencias GPS...</p>
                  ) : gpsSuggestions.length > 0 ? (
                    <div style={{ border: '2px dashed var(--color-primary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', background: 'rgba(37,99,235,0.05)' }}>
                      <p className="text-xs font-bold mb-2">📲 Sugerencias GPS de operarios:</p>
                      {gpsSuggestions.map(sug => (
                        <div key={sug.id} style={{ 
                          padding: 'var(--space-2) var(--space-3)', 
                          background: 'var(--color-surface)', 
                          borderRadius: 'var(--radius-sm)', 
                          marginBottom: 'var(--space-2)',
                          border: '1px solid var(--color-border)'
                        }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold">{sug.userName}</span>
                              <span className="text-xs text-muted ml-2">
                                (±{sug.accuracy}m)
                                {sug.createdAt?.toDate && (' — ' + format(sug.createdAt.toDate(), 'dd/MM HH:mm'))}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-muted mt-1">
                            Lat: {Number(sug.lat || 0).toFixed(7)} | Lng: {Number(sug.lng || 0).toFixed(7)}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem', flex: 1 }}
                              onClick={() => handleAcceptSuggestion(sug)}
                            >
                              ✅ Usar esta ubicación
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', color: '#dc2626' }}
                              onClick={() => handleRejectSuggestion(sug.id)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted" style={{ fontStyle: 'italic' }}>
                      💡 Los operarios pueden enviar su ubicación GPS desde la app móvil para mejorar la precisión.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                  <option value="comunidad">Comunidad</option>
                  <option value="garaje">Garaje</option>
                  <option value="oficinas">Oficinas</option>
                  <option value="local">Local comercial</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Persona de contacto</label>
                <input className="form-input" value={form.contactPerson} onChange={e => setForm(f => ({...f, contactPerson: e.target.value}))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono contacto</label>
              <input className="form-input" value={form.contactPhone} onChange={e => setForm(f => ({...f, contactPhone: e.target.value}))} />
            </div>
            <div className="form-group" style={{ padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <label className="form-label flex items-center gap-2 cursor-pointer mb-1" style={{ display: 'flex', alignItems: 'center' }}>
                <input 
                  type="checkbox" 
                  style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                  checked={form.individualTimeTracking}
                  onChange={e => setForm(f => ({...f, individualTimeTracking: e.target.checked}))}
                />
                <span style={{ fontWeight: 'bold' }}>Seguimiento de tiempo individual</span>
              </label>
              <p className="text-xs text-muted" style={{ marginLeft: '26px' }}>
                Si se marca, el operario no requerirá iniciar la jornada general para trabajar en servicios de esta comunidad. El tiempo general se desactivará si todos sus servicios de hoy son individuales.
              </p>
            </div>
            <div className="form-group" style={{ padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: '12px' }}>
              <label className="form-label flex items-center gap-2 mb-1" style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>🕐 Hora preferida de visita</span>
              </label>
              <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="time" 
                  className="form-input"
                  style={{ width: '140px' }}
                  value={form.preferredTime || ''}
                  onChange={e => setForm(f => ({...f, preferredTime: e.target.value}))}
                />
                {form.preferredTime && (
                  <button 
                    type="button" 
                    className="btn btn-ghost btn-sm"
                    onClick={() => setForm(f => ({...f, preferredTime: ''}))}
                    style={{ color: '#dc2626', fontSize: '0.75rem' }}
                  >
                    ✕ Quitar hora
                  </button>
                )}
              </div>
              <p className="text-xs text-muted" style={{ marginTop: '6px' }}>
                Opcional. Si se indica, el optimizador de recorrido priorizará esta comunidad a la hora indicada.
              </p>
            </div>

            <div className="form-group" style={{ padding: 'var(--space-4)', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: '12px' }}>
              <h4 style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '10px', color: 'var(--color-primary)' }}>📄 Datos de Facturación</h4>
              <div className="form-row mb-3">
                <div>
                  <label className="form-label">CIF/NIF Comunidad</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej: H73706319"
                    value={form.billingCif || ''}
                    onChange={e => setForm(f => ({...f, billingCif: e.target.value}))}
                  />
                </div>
                <div>
                  <label className="form-label">Mensualidad Base (€)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="0"
                    step="0.01"
                    placeholder="Ej: 350"
                    value={form.basePrice || ''}
                    onChange={e => setForm(f => ({...f, basePrice: e.target.value}))}
                  />
                </div>
              </div>

              <div className="form-row mb-3">
                <div>
                  <label className="form-label">Email de Facturación (Múltiples permitidos)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {(form.billingEmail || '').split(/[,;]/).map(e => e.trim()).filter(Boolean).map((email, idx) => (
                        <span 
                          key={idx} 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            background: '#e2e8f0', 
                            color: '#334155', 
                            padding: '2px 8px', 
                            borderRadius: '12px', 
                            fontSize: '11px',
                            fontWeight: '500' 
                          }}
                        >
                          {email}
                          <button 
                            type="button" 
                            style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontWeight: 'bold' }}
                            onClick={() => {
                              const list = (form.billingEmail || '').split(/[,;]/).map(e => e.trim()).filter(Boolean);
                              list.splice(idx, 1);
                              setForm(f => ({ ...f, billingEmail: list.join(', ') }));
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                    {/* input + add */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Escribe un email y pulsa Enter o ➕..."
                        id="new-billing-email"
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
                            e.preventDefault();
                            const val = e.target.value.trim().replace(/[,;]/g, '');
                            if (val && val.includes('@')) {
                              const list = (form.billingEmail || '').split(/[,;]/).map(e => e.trim()).filter(Boolean);
                              if (!list.includes(val)) {
                                list.push(val);
                                setForm(f => ({ ...f, billingEmail: list.join(', ') }));
                              }
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                      <button 
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                        onClick={() => {
                          const input = document.getElementById('new-billing-email');
                          if (input) {
                            const val = input.value.trim();
                            if (val && val.includes('@')) {
                              const list = (form.billingEmail || '').split(/[,;]/).map(e => e.trim()).filter(Boolean);
                              if (!list.includes(val)) {
                                list.push(val);
                                setForm(f => ({ ...f, billingEmail: list.join(', ') }));
                              }
                              input.value = '';
                            }
                          }
                        }}
                      >
                        ➕
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="form-label">Método de Pago</label>
                  <select 
                    className="form-select"
                    value={form.paymentMethod || 'transferencia'}
                    onChange={e => setForm(f => ({...f, paymentMethod: e.target.value}))}
                  >
                    <option value="transferencia">Transferencia Bancaria</option>
                    <option value="recibo">Recibo Domiciliado</option>
                    <option value="efectivo">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Administrador de Fincas</label>
                  <select 
                    className="form-select"
                    value={form.administratorId || ''}
                    onChange={e => setForm(f => ({...f, administratorId: e.target.value}))}
                  >
                    <option value="">— Ninguno (Gestión directa) —</option>
                    {administrators.map(admin => (
                      <option key={admin.id} value={admin.id}>{admin.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.paymentMethod === 'recibo' && (
                <div style={{ gridColumn: 'span 2', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginTop: '4px' }}>
                  <h4 style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '10px', color: '#1e40af' }}>🏦 Datos de Domiciliación Bancaria (SEPA)</h4>
                  <div className="grid grid-2 gap-4">
                    <div>
                      <label className="form-label">IBAN de la Comunidad</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="ES00 0000 0000 0000 0000 0000"
                        value={form.billingIban || ''}
                        onChange={e => setForm(f => ({...f, billingIban: e.target.value.toUpperCase()}))}
                        style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
                      />
                    </div>
                    <div>
                      <label className="form-label">Referencia del Mandato SEPA</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ej: MANDATE-001"
                        value={form.billingMandateRef || ''}
                        onChange={e => setForm(f => ({...f, billingMandateRef: e.target.value}))}
                      />
                    </div>
                    <div>
                      <label className="form-label">Fecha de Firma del Mandato</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={form.billingMandateDate || ''}
                        onChange={e => setForm(f => ({...f, billingMandateDate: e.target.value}))}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '10px', color: '#64748b', marginTop: '8px' }}>
                    Estos datos son necesarios para generar las remesas bancarias SEPA (Cuaderno 19). El mandato debe estar firmado por la comunidad autorizando el cobro.
                  </p>
                </div>
              )}

              <div>
                <label className="form-label">Dirección Fiscal / Facturación</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Dirección fiscal si difiere de la dirección física"
                  value={form.billingAddress || ''}
                  onChange={e => setForm(f => ({...f, billingAddress: e.target.value}))}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={geocoding}>
              {editingCommunity ? 'Guardar Cambios' : 'Crear Comunidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
