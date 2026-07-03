import React, { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)'  },
  contacted: { label: 'Contactado', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)'  },
  active:    { label: 'Activo',     color: '#34d399', bg: 'rgba(52,211,153,0.12)',   border: 'rgba(52,211,153,0.3)'  },
  discarded: { label: 'Descartado', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`
    }}>
      {cfg.label}
    </span>
  );
}

export default function CompanyRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'companyRequests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function changeStatus(id, newStatus) {
    await updateDoc(doc(db, 'companyRequests', id), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Borrar esta solicitud? Esta acción no se puede deshacer.')) return;
    await deleteDoc(doc(db, 'companyRequests', id));
  }

  const filtered = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter);

  const counts = requests.reduce((acc, r) => {
    acc[r.status || 'pending'] = (acc[r.status || 'pending'] || 0) + 1;
    return acc;
  }, {});

  function formatDate(ts) {
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <p className="text-muted">Cargando solicitudes...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1000px' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, color: 'var(--color-text)', marginBottom: '4px' }}>
          📩 Solicitudes de Empresa
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
          Leads recibidos desde la landing page. Gestiona el estado de cada solicitud.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: 'var(--space-6)' }}>
        {[
          { key: 'all',       label: 'Total',       value: requests.length,          color: '#6366f1' },
          { key: 'pending',   label: 'Pendientes',  value: counts.pending   || 0,    color: '#fbbf24' },
          { key: 'contacted', label: 'Contactados', value: counts.contacted || 0,    color: '#60a5fa' },
          { key: 'active',    label: 'Activos',     value: counts.active    || 0,    color: '#34d399' },
        ].map(c => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            style={{
              background: filter === c.key ? `${c.color}15` : 'var(--color-surface)',
              border: `1px solid ${filter === c.key ? c.color + '40' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)', padding: '16px', textAlign: 'left',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: filter === c.key ? c.color : 'var(--color-text)' }}>
              {c.value}
            </div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {c.label}
            </div>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
          <p>No hay solicitudes {filter !== 'all' ? `con estado "${STATUS_CONFIG[filter]?.label}"` : 'todavía'}.</p>
          {filter !== 'all' && (
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }} onClick={() => setFilter('all')}>
              Ver todas
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(req => {
            const isExp = expanded === req.id;
            return (
              <div
                key={req.id}
                style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                  transition: 'border-color 0.2s',
                  borderColor: req.status === 'pending' ? 'rgba(251,191,36,0.25)' : 'var(--color-border)'
                }}
              >
                {/* Header row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : req.id)}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #2563eb22, #06b6d422)',
                    border: '1px solid rgba(37,99,235,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}>
                    🏢
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: 'var(--font-sm)', marginBottom: '2px' }}>
                      {req.companyName || '—'}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
                      {req.contactName} · {req.email}
                      {req.phone && ` · ${req.phone}`}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <StatusBadge status={req.status || 'pending'} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{formatDate(req.createdAt)}</div>
                  </div>

                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginLeft: '8px', transition: 'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'rotate(0)' }}>▼</div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: '18px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      {[
                        { label: 'Plan solicitado',   value: req.plan || '—' },
                        { label: 'Nº de operarios',   value: req.operariosCount || '—' },
                        { label: 'Teléfono',           value: req.phone || '—' },
                        { label: 'Email',              value: req.email },
                      ].map((f, i) => (
                        <div key={i}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{f.label}</div>
                          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text)', fontWeight: 500 }}>{f.value}</div>
                        </div>
                      ))}
                    </div>

                    {req.message && (
                      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '16px', fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Mensaje</div>
                        {req.message}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)', marginRight: '4px' }}>Cambiar estado:</span>
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => changeStatus(req.id, key)}
                          disabled={req.status === key}
                          style={{
                            padding: '5px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                            cursor: req.status === key ? 'default' : 'pointer',
                            opacity: req.status === key ? 0.5 : 1,
                            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                            transition: 'opacity 0.2s'
                          }}
                        >
                          {cfg.label}
                        </button>
                      ))}
                      <div style={{ marginLeft: 'auto' }}>
                        <a
                          href={`mailto:${req.email}?subject=Tu solicitud de acceso a LimpiaGest&body=Hola ${req.contactName},%0A%0AHemos recibido tu solicitud de acceso a LimpiaGest para ${req.companyName}.%0A%0AEn breve nos ponemos en contacto contigo.%0A%0AUn saludo,%0AEquipo LimpiaGest`}
                          className="btn btn-primary btn-sm"
                          style={{ marginRight: '8px' }}
                        >
                          ✉️ Responder por email
                        </a>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(req.id)}
                          style={{ color: '#ef4444' }}
                        >
                          🗑 Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
