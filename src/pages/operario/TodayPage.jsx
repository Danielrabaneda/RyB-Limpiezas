import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getScheduledServicesForDate } from '../../services/scheduleService';
import { getCommunitiesForOperario, getCommunity } from '../../services/communityService';
import { getCommunityTasks } from '../../services/taskService';
import { getActiveCheckIn } from '../../services/checkInService';
import { getActiveWorkday, startWorkday, endWorkday } from '../../services/workdayService';
import { transferService, transferDay, transferWeek } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import MaterialRequestModal from '../../components/operario/MaterialRequestModal';
import { useNavigate } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function TodayPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [enrichedServices, setEnrichedServices] = useState([]);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [activeWorkday, setActiveWorkday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModal, setTransferModal] = useState({ open: false, type: 'single', service: null });
  const [materialModal, setMaterialModal] = useState({ open: false, communityId: null, communityName: '' });
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionsMissing, setPermissionsMissing] = useState(false);

  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);

  useEffect(() => {
    if (userProfile?.uid) loadToday();
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const q = query(
      collection(db, 'systemNotifications'),
      where('userId', '==', userProfile.uid),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    });
    return () => unsubscribe();
  }, [userProfile]);

  useEffect(() => {
    const requestImportantPerms = async () => {
      try {
        let missing = false;

        // 1. Notificaciones
        if ('Notification' in window) {
          let perm = Notification.permission;
          if (perm === 'default' || perm === 'prompt') {
            perm = await Notification.requestPermission();
          }
          if (perm === 'denied') {
            missing = true;
          }
        }

        // 2. Geocercas (GPS)
        if ('geolocation' in navigator) {
          try {
            await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { 
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              });
            });
          } catch(err) {
            console.error("Error pidiendo GPS:", err);
            // Error de tipo PERMISSION_DENIED es el 1
            if (err.code === 1 || err.PERMISSION_DENIED) {
              missing = true;
            }
          }
        }

        setPermissionsMissing(missing);
      } catch (e) {
        console.error("Error revisando permisos", e);
      }
    };

    requestImportantPerms();
  }, []);

  const loadToday = async (force = false) => {
    if (!userProfile?.uid) return;
    setLoading(true);
    // setEnrichedServices([]); // Comentar para que no parpadee tanto si no es necesario
    try {
      console.log(`[Today] Cargando servicios para operario ${userProfile.uid}...`);
      const [svcs, checkIn, workday] = await Promise.all([
        getScheduledServicesForDate(userProfile.uid, new Date()),
        getActiveCheckIn(userProfile.uid),
        getActiveWorkday(userProfile.uid),
      ]);

      console.log(`[Today] ${svcs.length} servicios encontrados`);
      setActiveCheckIn(checkIn);
      setActiveWorkday(workday);

      const enriched = [];
      const communityCache = {};
      const taskCache = {};

      for (const svc of svcs) {
        try {
          if (!communityCache[svc.communityId]) {
            communityCache[svc.communityId] = await getCommunity(svc.communityId);
          }
          if (!taskCache[svc.communityId]) {
            taskCache[svc.communityId] = await getCommunityTasks(svc.communityId);
          }

          // Filtrar para mostrar solo la tarea específica de este servicio programado
          const communityTasks = taskCache[svc.communityId] || [];
          const specificTask = communityTasks.find(t => t.id === svc.communityTaskId);

          enriched.push({
            ...svc,
            community: communityCache[svc.communityId] || { name: 'Comunidad desconocida' },
            tasks: svc.taskName ? [{ id: svc.communityTaskId, taskName: svc.taskName }] : (specificTask ? [specificTask] : []),
          });
        } catch (enrichErr) {
          console.error(`Error enriqueciendo servicio ${svc.id}:`, enrichErr);
          enriched.push({ ...svc, community: { name: 'Error' }, tasks: [] });
        }
      }

      setEnrichedServices(enriched);
      setServices(svcs);
    } catch (err) {
      console.error('Error loading today:', err);
      setError('Fallo al cargar servicios. Reintenta.');
      if (err.message?.includes('index')) {
        alert('Error: El sistema requiere nuevos índices de base de datos. Avisa al admin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkday = async () => {
    if (!userProfile?.uid) return;
    setActionLoading(true);
    try {
      const name = userProfile.name || userProfile.displayName || 'Operario';
      await startWorkday(userProfile.uid, name);
      await loadToday();
    } catch (err) {
      console.error(err);
      alert('Error al iniciar jornada: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };


  const handleEndWorkday = async () => {
    if (!activeWorkday) return;
    if (!window.confirm('¿Estás seguro de que quieres finalizar tu jornada laboral?')) return;
    
    setActionLoading(true);
    try {
      await endWorkday(activeWorkday.id);
      await loadToday();
    } catch (err) {
      alert('Error al finalizar jornada');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferConfirm = async (toUserId) => {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      if (transferModal.type === 'single') {
        await transferService({
          serviceId: transferModal.service.id,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
      } else if (transferModal.type === 'day') {
        const today = new Date();
        await transferDay({
          date: today,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
      } else if (transferModal.type === 'week') {
        const nextWeekDate = addDays(new Date(), 7);
        await transferWeek({
          dateInWeek: nextWeekDate,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
      }
      
      alert('Traspaso solicitado. El administrador deberá validarlo.');
      setTransferModal({ open: false, type: 'single', service: null });
      loadToday();
    } catch (err) {
      alert('Error en el traspaso: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  function getStatusBadge(status) {
    switch (status) {
      case 'completed': return <span className="badge badge-success">✅ Completado</span>;
      case 'in_progress': return <span className="badge badge-info">🔄 En curso</span>;
      case 'missed': return <span className="badge badge-danger">❌ No realizado</span>;
      default: return <span className="badge badge-warning">⏳ Pendiente</span>;
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center" style={{ padding: 'var(--space-12)' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {permissionsMissing && (
        <div 
          className="mb-4 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden"
          style={{ 
            background: 'linear-gradient(135deg, #ef4444, #b91c1c)', 
            color: 'white', 
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
          }}
        >
          <div className="flex items-center gap-3 relative z-10">
            <span style={{ fontSize: '1.8rem' }}>⚠️</span>
            <div>
              <div className="font-bold text-lg leading-tight">PERMISOS DENEGADOS</div>
              <div className="text-sm opacity-90 mt-1">
                La app necesita Notificaciones y Ubicación (GPS) para funcionar correctamente.
              </div>
            </div>
          </div>
          <button 
            className="btn btn-sm mt-2 relative z-10 font-bold" 
            style={{ background: 'white', color: '#b91c1c', border: 'none' }}
            onClick={() => alert("Por favor, entra en los Ajustes de tu navegador o de tu teléfono, busca 'RyB Limpiezas' o la web actual, y permite el uso de Ubicación y Notificaciones.")}
          >
            Cómo solucionarlo
          </button>
        </div>
      )}

      {unreadCount > 0 && (
        <div 
          className="mb-4 p-4 rounded-xl flex items-center justify-between"
          style={{ 
            background: 'var(--color-danger)', 
            color: 'white', 
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
            animation: 'pulse 2s infinite'
          }}
          onClick={() => alert(`Tienes ${unreadCount} aviso(s) pendiente(s).`)}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '1.4rem' }}>🚨</span>
            <div>
              <div className="font-bold leading-tight">AVISO IMPORTANTE</div>
              <div className="text-xs opacity-90">Toca para descartar los mensajes</div>
            </div>
          </div>
          <button 
             className="btn btn-xs btn-ghost" 
             style={{ color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
             onClick={(e) => {
               e.stopPropagation();
               // Marcar todos como leídos rápido (opcional, por ahora solo aviso)
               alert('Abre la app de nuevo para limpiar los avisos.');
             }}
          >
            OK
          </button>
        </div>
      )}
      <div className="mb-4">
        <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 800 }}>
          Hoy, {format(new Date(), "d 'de' MMMM", { locale: es })}
        </h2>
        <p className="text-sm text-muted">Gestión de jornada y servicios</p>
      </div>

       {/* Acciones Rápidas de Traspaso - Solo si no hay nada iniciado */}
      {(() => {
        const hasStartedDay = enrichedServices.some(s => s.status === 'completed' || s.status === 'in_progress');
        // Para la próxima semana no tenemos los servicios cargados aquí, 
        // pero podemos asumir que si es futura estará libre, 
        // o dejar que el servicio de backend lo valide.
        // Sin embargo, por consistencia, solo mostramos si el día actual no está "sucio" 
        // o si queremos ser más específicos. El usuario pidió bloquear si "ya está iniciado".

        return (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
            {!hasStartedDay ? (
              <button 
                className="btn btn-ghost btn-xs whitespace-nowrap" 
                onClick={() => setTransferModal({ open: true, type: 'day' })}
                style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: '10px' }}
              >
                🔄 Todo HOY
              </button>
            ) : (
              <div className="text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 bg-slate-50">
                🚫 Hoy bloqueado para traspasos
              </div>
            )}
            
            <button 
              className="btn btn-ghost btn-xs whitespace-nowrap" 
              onClick={() => setTransferModal({ open: true, type: 'week' })}
              style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: '10px' }}
            >
              📅 Próx. Semana
            </button>
          </div>
        );
      })()}

      {/* SECCIÓN JORNADA GLOBAL - MEJORADO TÁCTILMENTE */}
      {(() => {
        const allServicesIndividual = enrichedServices.length > 0 && enrichedServices.every(s => s.community?.individualTimeTracking);
        
        return (
          <>
            {!allServicesIndividual && (
              <div 
                className="card mb-6 animate-slideUp workday-button-wrapper" 
                onClick={(!actionLoading) ? (activeWorkday ? handleEndWorkday : handleStartWorkday) : undefined}
                style={{ 
                  background: activeWorkday 
              ? 'linear-gradient(135deg, #2563eb, #1e40af)' 
              : 'linear-gradient(135deg, #ffffff, #f1f5f9)',
            padding: 'var(--space-6)',
            cursor: actionLoading ? 'wait' : 'pointer',
            borderRadius: 'var(--radius-2xl)',
            textAlign: 'center',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            // Sombra de elevación para indicar que se puede pulsar
            boxShadow: activeWorkday 
              ? '0 10px 25px -5px rgba(37, 99, 235, 0.5), inset 0 -4px 0 rgba(0,0,0,0.2)' 
              : '0 8px 16px -4px rgba(0, 0, 0, 0.1), inset 0 -4px 0 rgba(0,0,0,0.05)',
            border: activeWorkday ? 'none' : '1px solid var(--color-border)',
            transform: actionLoading ? 'scale(0.98)' : 'scale(1)',
            userSelect: 'none'
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div style={{ 
              fontSize: '3.5rem', 
              marginBottom: 'var(--space-1)',
              filter: actionLoading ? 'grayscale(1) opacity(0.5)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
              transition: 'transform 0.2s ease'
            }} className={activeWorkday && !actionLoading ? 'animate-pulse' : ''}>
              {actionLoading ? '⏳' : (activeWorkday ? '✅' : '🏢')}
            </div>
            
            <div style={{ 
              fontSize: 'var(--font-xl)', 
              fontWeight: 900, 
              letterSpacing: '0.05em',
              color: activeWorkday ? '#ffffff' : 'var(--color-primary)' 
            }}>
              {actionLoading 
                ? 'PROCESANDO...' 
                : activeWorkday 
                   ? 'JORNADA ACTIVA' 
                   : 'INICIAR JORNADA'}
            </div>


            <div style={{ 
              fontSize: 'var(--font-sm)', 
              color: activeWorkday ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' 
            }}>
              {activeWorkday 
                ? `Empezaste a las ${format(activeWorkday.startTime?.toDate ? activeWorkday.startTime.toDate() : new Date(), 'HH:mm')}`
                : 'Pulsa aquí para empezar a trabajar hoy'}
            </div>

            {activeWorkday && !actionLoading && (
              <div className="mt-4 py-2 px-4" style={{ 
                background: 'rgba(255,255,255,0.2)', 
                borderRadius: 'var(--radius-full)',
                color: 'white',
                fontSize: 'var(--font-xs)',
                fontWeight: 700
              }}>
                PULSA PARA FINALIZAR
              </div>
            )}
          </div>
        </div>
            )}

      {(activeWorkday || allServicesIndividual) && (
        <button 
          className="btn btn-primary w-full py-4 mb-4 shadow-sm flex items-center justify-center gap-2 animate-fadeIn"
          onClick={(e) => {
            e.stopPropagation();
            setMaterialModal({ open: true, communityId: null, communityName: 'General / Equipo' });
          }}
          style={{ 
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: 'none',
            fontSize: 'var(--font-md)',
            fontWeight: 800,
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 8px 16px -4px rgba(217, 119, 6, 0.4)'
          }}
        >
          📦 PEDIR MATERIAL / PRODUCTOS
        </button>
      )}
      </>
        );
      })()}

      {/* SERVICIO ACTIVO (OPCIONAL) */}
      {activeCheckIn && (
        <div className="card mb-4" style={{ 
          background: 'linear-gradient(135deg, var(--color-success-light), #a7f3d0)',
          border: '2px solid var(--color-success)',
          padding: 'var(--space-3)'
        }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '1.5rem' }}>📍</span>
            <div>
              <div className="font-bold text-sm" style={{ color: '#065f46' }}>Limpieza en curso</div>
              <div className="text-xs" style={{ color: '#047857' }}>
                Entrada en comunidad: {activeCheckIn.checkInTime?.toDate 
                  ? format(activeCheckIn.checkInTime.toDate(), 'HH:mm') 
                  : 'Ahora'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LISTADO DE SERVICIOS */}
      <div className="flex justify-between items-center mb-4">
        <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 700 }}>Servicios de hoy</h3>
        <button 
          className="btn btn-ghost btn-xs flex items-center gap-1"
          onClick={() => loadToday(true)}
          disabled={loading}
          style={{ color: 'var(--color-primary)', fontWeight: 600 }}
        >
          {loading ? 'Sincronizando...' : '🔄 Sincronizar'}
        </button>
      </div>

      {enrichedServices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <h3 className="empty-state-title">Sin servicios hoy</h3>
          <p className="text-muted text-sm">No tienes servicios programados para hoy</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {enrichedServices.map(svc => {
            const hasIndividualTime = svc.community?.individualTimeTracking;
            const canAccess = activeWorkday || hasIndividualTime;
            const statusClass = svc.status === 'completed' ? 'completed' : (svc.status === 'in_progress' || svc.status === 'started') ? 'in-progress' : '';
            return (
            <div
              key={svc.id}
              className={`service-card ${statusClass} ${!canAccess ? 'opacity-50 grayscale' : ''}`}
              onClick={() => {
                if (!canAccess) {
                  alert('Debes iniciar tu jornada primero para acceder a los servicios.');
                  return;
                }
                navigate(`/operario/servicio/${svc.id}`);
              }}
              style={{ 
                cursor: canAccess ? 'pointer' : 'not-allowed'
              }}
            >
              <div className="service-card-header">
                <div>
                  <div className="service-community" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {svc.community?.name || 'Comunidad'}
                    {hasIndividualTime && (
                      <span style={{ fontSize: '10px', background: 'var(--color-info-light)', color: 'var(--color-info)', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        ⏱️ Indep.
                      </span>
                    )}
                    {svc.flexibleWeek && (
                      <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        📅 Sem. Flexible
                      </span>
                    )}
                    {svc.isCompanion && (
                      <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '12px', border: '1px solid currentColor', fontWeight: 'bold' }}>
                        🤝 Apoyo prestado
                      </span>
                    )}
                  </div>
                  <div className="service-address">{svc.community?.address || ''}</div>
                </div>
                {getStatusBadge(svc.status)}
              </div>
              
              {!svc.isCompanion && !['completed', 'in_progress'].includes(svc.status) && (
                <button 
                  className="btn btn-ghost btn-xs mt-1 mb-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransferModal({ open: true, type: 'single', service: svc });
                  }}
                  style={{ color: 'var(--color-warning)', padding: 0 }}
                >
                  🔄 Traspasar solo este servicio
                </button>
              )}

              <div className="service-tasks" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
                  {svc.tasks?.map(t => (
                    <span key={t.id} className="service-task-chip">{t.taskName}</span>
                  ))}
                </div>
                {svc.isCompanion ? (
                  <button 
                    className="btn btn-secondary"
                    style={{ borderRadius: '9999px', padding: '6px 18px', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/operario/servicio/${svc.id}`);
                    }}
                  >
                    Ver detalles
                  </button>
                ) : (!svc.status || svc.status === 'pending') && (
                  <button 
                    className="btn btn-primary"
                    style={{ borderRadius: '9999px', padding: '6px 18px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)', whiteSpace: 'nowrap' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canAccess) {
                        alert('Debes iniciar tu jornada primero para acceder a este servicio.');
                        return;
                      }
                      navigate(`/operario/servicio/${svc.id}`);
                    }}
                  >
                    Inicio
                  </button>
                )}
                {svc.status === 'in_progress' && (
                  <button 
                    className="btn btn-info"
                    style={{ borderRadius: '9999px', padding: '6px 18px', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/operario/servicio/${svc.id}`);
                    }}
                  >
                    Continuar
                  </button>
                )}
              </div>
              {!canAccess && (
                <div className="text-xs font-bold text-danger mt-3">⚠️ Jornada no iniciada</div>
              )}
            </div>
          );})}
        </div>
      )}

      <TransferModal 
        isOpen={transferModal.open}
        onClose={() => setTransferModal({ open: false, type: 'single', service: null })}
        onConfirm={handleTransferConfirm}
        loading={actionLoading}
        title={
          transferModal.type === 'day' ? 'Traspasar todo el día' :
          transferModal.type === 'week' ? 'Traspasar próxima semana' :
          `Traspasar servicio ${transferModal.service?.community?.name || ''}`
        }
      />

      <MaterialRequestModal 
        isOpen={materialModal.open}
        onClose={() => setMaterialModal({ ...materialModal, open: false })}
        communityId={materialModal.communityId}
        communityName={materialModal.communityName}
      />
    </div>
  );
}

