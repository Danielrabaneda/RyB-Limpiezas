import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getClientPortalDataCallable } from '../../services/clientPortalService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ClientPortalPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [community, setCommunity] = useState(null);
  const [reports, setReports] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [operariosMap, setOperariosMap] = useState({});
  
  const [activeTab, setActiveTab] = useState('visits'); // 'visits', 'evidence', 'tasks'
  const [showInstallModal, setShowInstallModal] = useState(false);

  const showVisitTimes = community?.showVisitTimes !== false;

  useEffect(() => {
    async function loadPortalData() {
      setLoading(true);
      setError(null);
      try {
        // Cargar todos los datos consolidados y de forma segura desde la Cloud Function
        const portalData = await getClientPortalDataCallable(token);
        if (!portalData || !portalData.community) {
          setError('El enlace de acceso ha expirado, fue revocado o no es válido.');
          setLoading(false);
          return;
        }

        setCommunity(portalData.community);
        setReports(portalData.reports || []);
        setEvidence(portalData.evidence || []);
        setTasks(portalData.tasks || []);
        setOperariosMap(portalData.operariosMap || {});
      } catch (err) {
        console.error('Error cargando portal:', err);
        setError('El enlace de acceso ha expirado, fue revocado o no es válido.');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadPortalData();
    } else {
      setError('Token de acceso no especificado.');
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!community) return;

    // 1. Establecer el título del documento
    document.title = `LimpiaGest — ${community.name}`;

    // 2. Actualizar meta título para dispositivos iOS (Safari)
    let metaAppTitle = document.querySelector("meta[name='apple-mobile-web-app-title']");
    if (!metaAppTitle) {
      metaAppTitle = document.createElement('meta');
      metaAppTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(metaAppTitle);
    }
    metaAppTitle.content = "LimpiaGest";


  }, [community]);

  const getOperarioName = (uid) => {
    return operariosMap[uid] || 'Operario RyB';
  };

  const parseTimestamp = (timestamp) => {
    if (!timestamp) return null;
    
    // Case 1: Firestore Timestamp object (with toDate method)
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Case 2: Serialized Firestore Timestamp object { seconds, nanoseconds }
    if (typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000);
    }
    if (typeof timestamp._seconds === 'number') {
      return new Date(timestamp._seconds * 1000);
    }
    
    // Case 3: ISO string, millisecond number, or other date string
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  };

  const getFormattedDate = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return '';
    try {
      return format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es });
    } catch (e) {
      return '';
    }
  };

  const getFormattedDateShort = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return '';
    try {
      return format(date, "EEEE dd 'de' MMMM", { locale: es });
    } catch (e) {
      return '';
    }
  };

  const getFormattedTime = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return '';
    try {
      return format(date, 'HH:mm');
    } catch (e) {
      return '';
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
        <span className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px', color: 'var(--color-primary)' }}></span>
        <p style={{ marginTop: '16px', color: 'var(--color-text-muted)', fontSize: '14px', fontWeight: '500' }}>Cargando portal de la comunidad...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '8px' }}>Acceso No Autorizado</h2>
        <p style={{ color: 'var(--color-text-muted)', maxWidth: '360px', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
          {error}
        </p>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: '16px', width: '100%', maxWidth: '280px' }}>
          RyB Limpiezas — Control de Calidad Digital
        </div>
      </div>
    );
  }

  // Encontrar el último servicio completado
  const lastCompletedReport = reports.length > 0 ? reports[0] : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: '48px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Banner / Header decorativo */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', color: 'white', padding: '32px 24px 80px 24px', position: 'relative' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontWeight: 'bold', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '20px', width: 'fit-content', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              ✨ Portal Público de Calidad
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>{community?.name}</h1>
            <p style={{ margin: '0', fontSize: '13px', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '4px' }}>
              📍 {community?.address}
            </p>
          </div>
          <div style={{ fontSize: '2rem' }}>🏢</div>
        </div>

        {/* Botón para guardar en inicio, posicionado más abajo y con mayor contraste */}
        <div style={{ maxWidth: '640px', margin: '20px auto 0 auto', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => setShowInstallModal(true)}
            style={{ 
              background: '#ffffff', 
              color: '#1e3a8a', 
              border: 'none', 
              borderRadius: '20px', 
              padding: '6px 14px', 
              fontSize: '11px', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'transform 0.15s, background 0.15s',
              fontFamily: 'inherit'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = '#ffffff';
            }}
          >
            📲 Guardar en Móvil
          </button>
        </div>
      </div>

      {/* Tarjeta de Resumen y Tabs */}
      <div style={{ maxWidth: '640px', margin: '-48px auto 0 auto', padding: '0 16px' }}>
        
        {/* Estado actual del servicio */}
        <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', marginBottom: '24px', border: '1px solid rgba(226, 232, 240, 0.8)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '12px', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px', fontWeight: 'bold' }}>Último servicio realizado</h3>
          {lastCompletedReport ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '2rem', background: '#ecfdf5', padding: '12px', borderRadius: '50%', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', flexShrink: 0 }}>✓</div>
              <div>
                <p style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>Completado con éxito</p>
                {showVisitTimes ? (
                  <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>
                    El {getFormattedDate(lastCompletedReport.checkInTime || lastCompletedReport.createdAt)} de {getFormattedTime(lastCompletedReport.checkInTime)} a {getFormattedTime(lastCompletedReport.checkOutTime)}
                  </p>
                ) : (
                  <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>
                    El {getFormattedDate(lastCompletedReport.checkInTime || lastCompletedReport.createdAt)} — Asistencia comprobada
                  </p>
                )}
                {lastCompletedReport.signature?.signerName && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#1e40af', fontWeight: '600' }}>
                    ✍️ Validado por: {lastCompletedReport.signature.signerName}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p style={{ margin: '0', fontSize: '14px', color: '#64748b', fontStyle: 'italic' }}>No se han registrado visitas en los últimos 30 días.</p>
          )}
        </div>

        {/* Explicación del Portal Público */}
        <div style={{ 
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
          borderRadius: '16px', 
          padding: '16px 20px', 
          border: '1px solid #bfdbfe', 
          marginBottom: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02)'
        }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📢 Portal de Transparencia y Calidad
          </h4>
          <p style={{ margin: '0', fontSize: '11.5px', color: '#1e40af', lineHeight: '1.6' }}>
            Este espacio digital permite a todos los vecinos y propietarios de la comunidad verificar los días y horas de nuestras visitas de limpieza, ver las fotos de evidencia del trabajo realizado y consultar el cuadrante de tareas programadas para el mantenimiento del edificio.
          </p>
        </div>

        {/* Selector de Pestañas (Tabs) */}
        <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '12px', marginBottom: '20px' }}>
          <button 
            style={{ 
              flex: 1, 
              border: 'none', 
              background: activeTab === 'visits' ? 'white' : 'transparent',
              color: activeTab === 'visits' ? '#1e3a8a' : '#475569',
              padding: '10px 0', 
              fontSize: '13px', 
              fontWeight: 'bold', 
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: activeTab === 'visits' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setActiveTab('visits')}
          >
            📅 Visitas (30 días)
          </button>
          <button 
            style={{ 
              flex: 1, 
              border: 'none', 
              background: activeTab === 'evidence' ? 'white' : 'transparent',
              color: activeTab === 'evidence' ? '#1e3a8a' : '#475569',
              padding: '10px 0', 
              fontSize: '13px', 
              fontWeight: 'bold', 
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: activeTab === 'evidence' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setActiveTab('evidence')}
          >
            📸 Evidencias (30 días)
          </button>
          <button 
            style={{ 
              flex: 1, 
              border: 'none', 
              background: activeTab === 'tasks' ? 'white' : 'transparent',
              color: activeTab === 'tasks' ? '#1e3a8a' : '#475569',
              padding: '10px 0', 
              fontSize: '13px', 
              fontWeight: 'bold', 
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: activeTab === 'tasks' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setActiveTab('tasks')}
          >
            📋 Ficha de Tareas
          </button>
        </div>

        {/* CONTENIDO DE PESTAÑAS */}
        
        {/* Pestaña: Visitas (30 días) */}
        {activeTab === 'visits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reports.length === 0 ? (
              <div style={{ background: 'white', padding: '32px 16px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📅</div>
                <h4 style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#0f172a' }}>Sin registros</h4>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b' }}>No hay visitas registradas para esta comunidad en los últimos 30 días.</p>
              </div>
            ) : (
              reports.map(rep => (
                <div key={rep.id} style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '12px' }}>
                    <div>
                      <p style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 'bold', color: '#0f172a', textTransform: 'capitalize' }}>
                        {getFormattedDateShort(rep.checkInTime || rep.createdAt)}
                      </p>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', background: '#ecfdf5', color: '#10b981', padding: '2px 8px', borderRadius: '12px' }}>✓ Finalizado</span>
                  </div>
                  
                  {showVisitTimes ? (
                    <div className="grid-3-col-client" style={{ gap: '8px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>Operario/Equipo</span>
                        <strong style={{ color: '#334155' }}>{getOperarioName(rep.userId)}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>Entrada / Salida</span>
                        <span style={{ color: '#334155', fontWeight: '500' }}>
                          {getFormattedTime(rep.checkInTime)} a {getFormattedTime(rep.checkOutTime)}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>Duración</span>
                        <strong style={{ color: '#1e40af' }}>{rep.durationMinutes || rep.totalMinutes || 0} min</strong>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '0.9rem', background: '#ecfdf5', borderRadius: '50%', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', flexShrink: 0, fontWeight: 'bold' }}>✓</div>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Asistencia comprobada</span>
                    </div>
                  )}

                  {rep.signature?.signerName && (
                    <div style={{ marginTop: '12px', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>✍️</span>
                      <span>Conformidad firmada por: <strong>{rep.signature.signerName}</strong></span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Pestaña: Evidencias Fotográficas */}
        {activeTab === 'evidence' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {evidence.length === 0 ? (
              <div style={{ background: 'white', padding: '48px 16px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📸</div>
                <h4 style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#0f172a', fontSize: '16px' }}>Sin evidencias</h4>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b' }}>No se han subido fotos de evidencias en los últimos 30 días.</p>
              </div>
            ) : (
              evidence.map(ev => {
                const urls = ev.photoUrls && ev.photoUrls.length > 0 ? ev.photoUrls : (ev.photoUrl ? [ev.photoUrl] : []);
                return (
                  <div key={ev.id} style={{ background: 'white', borderRadius: '20px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)' }}>
                    {/* Header Info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{ev.taskName || 'Limpieza General'}</h4>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                          {getFormattedDate(ev.createdAt)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '4px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }}>
                        <span>📍</span> GPS Verificado
                      </div>
                    </div>

                    {/* Photos Gallery */}
                    {urls.length > 0 ? (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: urls.length === 1 ? '1fr' : urls.length === 2 ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '8px',
                        marginBottom: '12px',
                        borderRadius: '12px',
                        overflow: 'hidden'
                      }}>
                        {urls.map((url, i) => (
                          <div 
                            key={i} 
                            style={{ 
                              position: 'relative', 
                              height: urls.length === 1 ? '240px' : '140px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px'
                            }}
                            onClick={() => window.open(url, '_blank')}
                            title="Haga clic para ver en tamaño completo"
                          >
                            <img 
                              src={url} 
                              alt={`${ev.taskName || 'Evidencia'} ${i + 1}`} 
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(15,23,42,0.6)', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                              🔍
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', textAlign: 'center', border: '1px dashed #cbd5e1', marginBottom: '12px', color: '#64748b', fontSize: '12px' }}>
                        📷 No se adjuntó imagen
                      </div>
                    )}

                    {/* Notes */}
                    {ev.notes && (
                      <div style={{ background: '#f8fafc', borderLeft: '4px solid #3b82f6', padding: '10px 14px', borderRadius: '0 8px 8px 0', fontSize: '13px', color: '#334155', fontStyle: 'italic', marginBottom: '12px' }}>
                        "{ev.notes}"
                      </div>
                    )}

                    {/* Footer / Operario */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b' }}>
                      <div>Realizado por: <strong style={{ color: '#475569' }}>{ev.operarioName || ev.userName || 'Limpiador RyB'}</strong></div>
                      <div style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600' }}>Evidencia digital</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Pestaña: Ficha de Tareas */}
        {activeTab === 'tasks' && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>Cuadrante de Tareas</h3>
              <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>Tareas recurrentes configuradas para el mantenimiento de este edificio.</p>
            </div>

            {tasks.length === 0 ? (
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>No hay tareas recurrentes configuradas en esta comunidad.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tasks.map(task => {
                  const FREQ_LABELS = {
                    daily: 'Diario',
                    weekly: 'Semanal',
                    biweekly: 'Quincenal',
                    monthly: 'Mensual',
                    bimonthly: 'Bimestral',
                    quarterly: 'Trimestral',
                    semiannual: 'Semestral',
                    yearly: 'Anual',
                    once: 'Puntual'
                  };
                  return (
                    <div key={task.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '1.25rem', marginTop: '-2px' }}>📋</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>{task.taskName}</span>
                          <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                            {FREQ_LABELS[task.frequencyType] || task.frequencyType}
                          </span>
                        </div>
                        <p style={{ margin: '0', fontSize: '11px', color: '#64748b' }}>
                          {task.flexibleWeek ? 'Planificación flexible por semanas' : 'Ejecución en días asignados'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
      
      {/* Footer del Portal */}
      <footer style={{ marginTop: '48px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        <p style={{ margin: '0 0 4px 0' }}>SaaS LimpiaGest para RyB Limpiezas</p>
        <p style={{ margin: '0' }}>© {new Date().getFullYear()} RyB Limpiezas. Todos los derechos reservados.</p>
      </footer>

      {showInstallModal && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(15, 23, 42, 0.6)', 
          backdropFilter: 'blur(4px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 9999, 
          padding: '20px' 
        }}>
          <div style={{ 
            background: 'white', 
            borderRadius: '24px', 
            width: '100%', 
            maxWidth: '380px', 
            padding: '24px', 
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            boxSizing: 'border-box'
          }}>
            {/* Close Button */}
            <button 
              onClick={() => setShowInstallModal(false)}
              style={{ 
                position: 'absolute', 
                top: '16px', 
                right: '16px', 
                background: 'none', 
                border: 'none', 
                fontSize: '1.2rem', 
                cursor: 'pointer', 
                color: '#64748b' 
              }}
            >
              ✕
            </button>

            {/* Title */}
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📲</span> Añadir acceso directo
            </h3>
            
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>
              Guarda este portal en la pantalla de inicio de tu teléfono para acceder rápidamente como si fuera una aplicación instalada:
            </p>

            {/* Instructions container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
              {/* Apple iOS */}
              <div style={{ borderLeft: '3px solid #10b981', paddingLeft: '12px' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '4px' }}>🍏 iPhone / iPad (Safari):</strong>
                <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                  <li>Pulsa el botón de <strong>Compartir</strong> (icono <span style={{ fontSize: '15px' }}>⎋</span> abajo en el navegador).</li>
                  <li>Desplázate hacia abajo y selecciona <strong>"Añadir a la pantalla de inicio"</strong>.</li>
                  <li>Pulsa <strong>"Añadir"</strong> arriba a la derecha.</li>
                </ol>
              </div>

              {/* Android */}
              <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '12px' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '4px' }}>🤖 Android (Chrome):</strong>
                <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                  <li>Pulsa el menú de <strong>tres puntos</strong> (arriba a la derecha <span style={{ fontSize: '15px' }}>⋮</span>).</li>
                  <li>Selecciona <strong>"Añadir a la pantalla de inicio"</strong> o <strong>"Instalar aplicación"</strong>.</li>
                  <li>Confirma pulsando <strong>"Añadir"</strong>.</li>
                </ol>
              </div>
            </div>

            {/* Close Button Bottom */}
            <button 
              onClick={() => setShowInstallModal(false)}
              style={{ 
                marginTop: '24px', 
                width: '100%', 
                background: '#1e3a8a', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                padding: '12px', 
                fontSize: '13px', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(30, 58, 138, 0.2)'
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
