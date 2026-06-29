import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCommunityByPortalToken, getClientReports, getClientEvidence } from '../../services/clientPortalService';
import { getCommunityTasks } from '../../services/taskService';
import { getOperarios } from '../../services/authService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../../config/firebase';

export default function ClientPortalPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [community, setCommunity] = useState(null);
  const [reports, setReports] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [operarios, setOperarios] = useState([]);
  
  const [activeTab, setActiveTab] = useState('visits'); // 'visits', 'evidence', 'tasks'

  useEffect(() => {
    async function loadPortalData() {
      setLoading(true);
      setError(null);
      try {
        // Asegurar autenticación anónima para evitar límites de lectura de reglas de Firestore
        try {
          if (!auth.currentUser) {
            await signInAnonymously(auth);
          }
        } catch (authErr) {
          console.warn('Advertencia: No se pudo iniciar sesión de forma anónima. Intentando cargar datos de forma pública.', authErr);
        }

        // 1. Validar el token y obtener la comunidad
        const commData = await getCommunityByPortalToken(token);
        if (!commData) {
          setError('El enlace de acceso ha expirado, fue revocado o no es válido.');
          setLoading(false);
          return;
        }
        setCommunity(commData);

        // 2. Cargar reportes, evidencias, tareas y operarios en paralelo
        const [repsData, evsData, tsksData, opsData] = await Promise.all([
          getClientReports([commData.id]).catch(err => {
            console.error('Error cargando reportes:', err);
            return [];
          }),
          getClientEvidence([commData.id]).catch(err => {
            console.error('Error cargando evidencias:', err);
            return [];
          }),
          getCommunityTasks(commData.id).catch(err => {
            console.error('Error cargando tareas:', err);
            return [];
          }),
          getOperarios().catch(err => {
            console.warn('No se pudieron cargar los operarios:', err);
            return [];
          })
        ]);

        setReports(repsData || []);
        setEvidence(evsData || []);
        setTasks(tsksData || []);
        setOperarios(opsData || []);
      } catch (err) {
        console.error('Error cargando portal:', err);
        setError('Ocurrió un error al cargar la información del portal. Inténtalo de nuevo.');
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

  const getOperarioName = (uid) => {
    const op = operarios.find(o => o.uid === uid);
    return op ? op.name : 'Operario RyB';
  };

  const getFormattedDate = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es });
    } catch (e) {
      return '';
    }
  };

  const getFormattedTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
                <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>
                  El {getFormattedDate(lastCompletedReport.createdAt)} de {getFormattedTime(lastCompletedReport.checkInTime)} a {getFormattedTime(lastCompletedReport.checkOutTime)}
                </p>
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
                        {format(rep.createdAt?.toDate ? rep.createdAt.toDate() : new Date(rep.createdAt), "EEEE dd 'de' MMMM", { locale: es })}
                      </p>
                      <p style={{ margin: '0', fontSize: '11px', color: '#94a3b8' }}>ID Servicio: #{rep.id.substring(0, 8).toUpperCase()}</p>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', background: '#ecfdf5', color: '#10b981', padding: '2px 8px', borderRadius: '12px' }}>✓ Finalizado</span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
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
                      <strong style={{ color: '#1e40af' }}>{rep.totalMinutes || 0} min</strong>
                    </div>
                  </div>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {evidence.length === 0 ? (
              <div style={{ background: 'white', padding: '32px 16px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📸</div>
                <h4 style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#0f172a' }}>Sin evidencias</h4>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b' }}>No se han subido fotos de evidencias en los últimos 30 días.</p>
              </div>
            ) : (
              evidence.map(ev => (
                <div key={ev.id} style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  {/* Photo Container */}
                  <div style={{ position: 'relative', background: '#0f172a', display: 'flex', justifyContent: 'center' }}>
                    <img 
                      src={ev.photoUrl} 
                      alt={ev.taskName} 
                      style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain' }}
                    />
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(15,23,42,0.85)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      📍 GPS Verificado
                    </div>
                  </div>
                  {/* Info Card */}
                  <div style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h4 style={{ margin: '0', fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>{ev.taskName || 'Limpieza General'}</h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{getFormattedDate(ev.createdAt)}</span>
                    </div>
                    {ev.notes && (
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #cbd5e1' }}>
                        "{ev.notes}"
                      </p>
                    )}
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Realizado por: {ev.operarioName || 'Limpiador RyB'}
                    </div>
                  </div>
                </div>
              ))
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

    </div>
  );
}
