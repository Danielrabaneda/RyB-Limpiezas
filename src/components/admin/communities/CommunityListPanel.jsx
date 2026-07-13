import React from 'react';

export default function CommunityListPanel({
  communities,
  filteredCommunities,
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
  filterAdmin,
  setFilterAdmin,
  administrators,
  pendingGPSCommunityIds,
  filterGPS,
  setFilterGPS,
  selectedCommunity,
  selectCommunity
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifycontent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <h3 className="font-semibold" style={{ margin: 0 }}>📋 Listado ({filteredCommunities.length !== communities.length ? `${filteredCommunities.length}/${communities.length}` : communities.length})</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              fontSize: '0.75rem',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontWeight: '500',
              outline: 'none'
            }}
          >
            <option value="all">🔍 Todos los tipos</option>
            <option value="comunidad">Comunidad</option>
            <option value="garaje">Garaje</option>
            <option value="oficinas">Oficinas</option>
            <option value="local">Local comercial</option>
          </select>

          <select
            value={filterAdmin}
            onChange={(e) => setFilterAdmin(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              fontSize: '0.75rem',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontWeight: '500',
              outline: 'none',
              maxWidth: '130px'
            }}
          >
            <option value="all">💼 Todos los admin</option>
            <option value="none">Sin administrador</option>
            {administrators.map(admin => (
              <option key={admin.id} value={admin.id}>{admin.name}</option>
            ))}
          </select>
          
          {(filterType !== 'all' || filterAdmin !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setFilterType('all');
                setFilterAdmin('all');
              }}
              className="btn btn-ghost btn-sm"
              style={{
                padding: '2px 6px',
                fontSize: '0.7rem',
                color: '#dc2626',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                height: '24px'
              }}
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* GPS notification banner */}
      {pendingGPSCommunityIds.size > 0 && (
        <div style={{
          margin: '8px 12px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: filterGPS ? '2px solid #f59e0b' : '2px solid rgba(245,158,11,0.4)',
          background: filterGPS
            ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
            : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          transition: 'all 0.2s',
        }}>
          <button
            onClick={() => setFilterGPS(f => !f)}
            style={{
              width: '100%',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                background: '#f59e0b',
                color: 'white',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '0.8rem',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(245,158,11,0.4)',
                animation: filterGPS ? 'none' : 'gpsBadgePulse 2s ease-in-out infinite',
              }}>{pendingGPSCommunityIds.size}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#92400e', lineHeight: 1.2 }}>
                  📍 {pendingGPSCommunityIds.size} comunidad{pendingGPSCommunityIds.size > 1 ? 'es' : ''} con notificación GPS
                </div>
                <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: '2px' }}>
                  {filterGPS ? '✓ Mostrando solo estas comunidades — clic para ver todas' : 'Clic para filtrar y revisarlas'}
                </div>
              </div>
            </div>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '20px',
              background: filterGPS ? '#f59e0b' : 'rgba(245,158,11,0.2)',
              color: filterGPS ? 'white' : '#92400e',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}>
              {filterGPS ? '✕ Quitar filtro' : 'Filtrar →'}
            </span>
          </button>
        </div>
      )}
      <style>{`
        @keyframes gpsBadgePulse {
          0%, 100% { box-shadow: 0 2px 6px rgba(245,158,11,0.4); }
          50% { box-shadow: 0 2px 12px rgba(245,158,11,0.7), 0 0 0 4px rgba(245,158,11,0.15); }
        }
      `}</style>
      
      <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-light)' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar comunidad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
          />
        </div>
      </div>

      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {Array.isArray(filteredCommunities) && filteredCommunities.map(comm => (
          <div
            key={comm.id}
            onClick={() => selectCommunity(comm)}
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              cursor: 'pointer',
              background: selectedCommunity?.id === comm.id ? 'var(--color-primary-100)' : 'transparent',
              borderLeft: selectedCommunity?.id === comm.id ? '4px solid var(--color-primary)' : '4px solid transparent',
              boxShadow: selectedCommunity?.id === comm.id ? 'inset 0 0 0 1px rgba(37, 99, 235, 0.1)' : 'none',
              transition: 'all var(--transition-fast)',
            }}
            className="community-list-item"
          >
            <div className="flex items-center justify-between">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="font-semibold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comm?.name || 'Comunidad sin nombre'}</span>
                  {pendingGPSCommunityIds.has(comm.id) && (
                    <span title="Tiene sugerencias GPS pendientes" style={{
                      background: '#f59e0b',
                      color: 'white',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      flexShrink: 0,
                      boxShadow: '0 1px 4px rgba(245,158,11,0.5)',
                    }}>📍</span>
                  )}
                </div>
                <div className="text-xs text-muted">{comm?.address || ''}</div>
              </div>
              {selectedCommunity?.id !== comm.id && (
                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '10px' }}>
                  Ver ➔
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
              <span className="badge badge-info text-xs">
                {comm?.type || 'comunidad'}
              </span>
              {pendingGPSCommunityIds.has(comm.id) && (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '20px',
                  background: 'rgba(245,158,11,0.15)',
                  color: '#92400e',
                  border: '1px solid rgba(245,158,11,0.4)',
                }}>📍 GPS pendiente</span>
              )}
            </div>
          </div>
        ))}
        {(!communities || communities.length === 0) && (
          <div className="empty-state">
            <p>No hay comunidades creadas</p>
          </div>
        )}
        {communities && communities.length > 0 && filteredCommunities.length === 0 && (
          <div className="empty-state">
            <p>{filterGPS ? '✅ Ninguna comunidad con GPS pendiente coincide con la búsqueda' : 'No se encontraron comunidades'}</p>
            {filterGPS && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '8px' }}
                onClick={() => setFilterGPS(false)}
              >Quitar filtro GPS</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
