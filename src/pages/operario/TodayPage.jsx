import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getScheduledServicesForDate } from '../../services/scheduleService';
import { getCommunitiesForOperario, getCommunity } from '../../services/communityService';
import { getCommunityTasks } from '../../services/taskService';
import { getActiveCheckIn } from '../../services/checkInService';
import { getActiveWorkday, startWorkday, endWorkday, activateCar, deactivateCar, getWorkdaysSummaryForDate } from '../../services/workdayService';
import { saveManualMileage } from '../../services/mileageService';
import { transferService, transferDay, transferWeek } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import MaterialRequestModal from '../../components/operario/MaterialRequestModal';
import { getOperarios } from '../../services/authService';
import { updateWorkdayCompanion } from '../../services/workdayService';
import { addCompanionToService, removeCompanionFromService } from '../../services/scheduleService';
import { markAllNotificationsAsRead } from '../../services/notificationService';
import { useNavigate } from 'react-router-dom';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';

export default function TodayPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [enrichedServices, setEnrichedServices] = useState([]);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [activeWorkday, setActiveWorkday] = useState(null);
  const [firstStartTime, setFirstStartTime] = useState(null);
  const [allWorkdaysToday, setAllWorkdaysToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModal, setTransferModal] = useState({ open: false, type: 'single', service: null });
  const [materialModal, setMaterialModal] = useState({ open: false, communityId: null, communityName: '' });
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionsMissing, setPermissionsMissing] = useState(false);
  const [allOperarios, setAllOperarios] = useState([]);
  const [companionSelectorOpen, setCompanionSelectorOpen] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [manualKm, setManualKm] = useState('');

  const [debugLogs, setDebugLogs] = useState([]);
  // Guard to prevent concurrent loadToday() calls from multiple snapshot triggers
  const isLoadingTodayRef = { current: false };

  useEffect(() => {
    if (userProfile?.uid) {
      loadOperarios();
    }
  }, [userProfile]);

  const loadOperarios = async () => {
    try {
      const ops = await getOperarios();
      setAllOperarios(ops.filter(o => o.uid !== userProfile.uid && o.active));
    } catch (err) {
      console.error("Error loading operarios", err);
    }
  };

  useEffect(() => {
    if (!userProfile?.uid) return;
    const q = query(
      collection(db, 'systemNotifications'),
      where('userId', '==', userProfile.uid),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    }, (err) => {
      console.error("Error in systemNotifications snapshot:", err);
    });
    return () => unsubscribe();
  }, [userProfile]);

  useEffect(() => {
    const requestImportantPerms = async () => {
      try {
        let missing = false;
        if ('Notification' in window) {
          let perm = Notification.permission;
          if (perm === 'default' || perm === 'prompt') {
            perm = await Notification.requestPermission();
          }
          if (perm === 'denied') missing = true;
        }
        if ('geolocation' in navigator) {
          try {
            await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { 
                enableHighAccuracy: true, timeout: 10000, maximumAge: 0
              });
            });
          } catch(err) {
            if (err.code === 1 || err.PERMISSION_DENIED) missing = true;
          }
        }
        setPermissionsMissing(missing);
      } catch (e) {
        console.error("Error revisando permisos", e);
      }
    };
    requestImportantPerms();
  }, []);

  useEffect(() => {
    let watchId = null;
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('[WakeLock] No se pudo activar el bloqueo de pantalla:', err);
      }
    };

    const releaseWakeLock = async () => {
      try {
        if (wakeLock) {
          await wakeLock.release();
          wakeLock = null;
        }
      } catch (err) {
        console.error('[WakeLock] Error al liberar bloqueo:', err);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && activeWorkday?.carActive) {
        await requestWakeLock();
      }
    };

    if (activeWorkday && activeWorkday.carActive) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; 
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const processPosition = (pos) => {
        const currentBreadcrumb = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: Date.now()
        };

        try {
          const existing = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
          
          if (existing.length > 0) {
            const last = existing[existing.length - 1];
            const dist = getDistance(last.lat, last.lng, currentBreadcrumb.lat, currentBreadcrumb.lng);
            const timeDiff = currentBreadcrumb.timestamp - last.timestamp;

            // Guardar si se ha movido > 50m o pasaron > 2 minutos (120s)
            if (dist >= 50 || timeDiff >= 120000) {
              existing.push(currentBreadcrumb);
              localStorage.setItem('ryb_car_breadcrumbs', JSON.stringify(existing));
            }
          } else {
            existing.push(currentBreadcrumb);
            localStorage.setItem('ryb_car_breadcrumbs', JSON.stringify(existing));
          }
        } catch (e) {
          console.error('[GPS] Error guardando breadcrumb en watchPosition:', e);
        }
      };

      if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
          processPosition,
          (error) => console.warn('[GPS] watchPosition error:', error),
          {
            enableHighAccuracy: true, 
            timeout: 20000, 
            maximumAge: 30000 
          }
        );
      }
    }

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (watchId !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeWorkday?.carActive]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    
    setLoading(true);
    let unsubWorkdays = () => {};
    let unsubMyServices = () => {};
    let unsubCompanionServices = () => {};
    let titularUnsubs = [];

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const dayStart = Timestamp.fromDate(startOfDay(new Date()));
    const dayEnd = Timestamp.fromDate(endOfDay(new Date()));

    // 1. Listen to active workdays where I am titular OR companion
    const qWorkdays = query(
      collection(db, 'workdays'),
      where('status', '==', 'active')
    );

    unsubWorkdays = onSnapshot(qWorkdays, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myWorkday = docs.find(d => d.userId === userProfile.uid);
      const asCompanionWorkdays = docs.filter(d => d.currentCompanionId === userProfile.uid);
      
      setActiveWorkday(myWorkday || null);

      // Cleanup previous titular listeners
      titularUnsubs.forEach(u => u());
      titularUnsubs = [];

      // Single call to loadToday when workdays change
      loadToday();
    }, (err) => {
      console.error("Error in workdays snapshot:", err);
    });

    // 2. Listen to my services (to get status updates) - no date filter to avoid index issues
    const qMySvcs = query(
      collection(db, 'scheduledServices'),
      where('assignedUserId', '==', userProfile.uid)
    );
    unsubMyServices = onSnapshot(qMySvcs, () => loadToday(), (err) => {
      console.error("Error in myServices snapshot:", err);
    });

    return () => {
      unsubWorkdays();
      unsubMyServices();
      unsubCompanionServices();
      titularUnsubs.forEach(u => u());
    };
  }, [userProfile]);

  const loadToday = async () => {
    if (!userProfile?.uid) return;
    if (isLoadingTodayRef.current) return;
    isLoadingTodayRef.current = true;
    
    try {
      const now = new Date();
      console.log(`[TodayPage] Loading data for ${userProfile.uid} at ${now.toISOString()}`);

      const [svcs, checkIn, summary] = await Promise.all([
        getScheduledServicesForDate(userProfile.uid, now),
        getActiveCheckIn(userProfile.uid),
        getWorkdaysSummaryForDate(userProfile.uid, now)
      ]);

      console.log(`[TodayPage] Fetched ${svcs.length} services and summary (active: ${summary.hasActive})`);

      if (checkIn) {
        try {
          const comm = await getCommunity(checkIn.communityId);
          checkIn.communityName = comm?.name || 'Comunidad';
        } catch (e) {
          checkIn.communityName = 'Comunidad';
        }
      }

      setActiveCheckIn(checkIn);
      setActiveWorkday(summary.activeWorkday);
      setFirstStartTime(summary.firstStartTime);
      // We store the aggregated minutes in a virtual allWorkdaysToday-like array for backwards compatibility with UI logic
      setAllWorkdaysToday([{ totalMinutes: summary.totalMinutes }]); 

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

          const communityTasks = taskCache[svc.communityId] || [];
          const specificTask = communityTasks.find(t => t.id === svc.communityTaskId);

          let tasks = [];
          if (svc.taskName) {
            tasks = [{ id: svc.communityTaskId || svc.id, taskName: svc.taskName }];
          } else if (specificTask) {
            tasks = [specificTask];
          }

          enriched.push({
            ...svc,
            community: communityCache[svc.communityId] || { name: 'Comunidad desconocida' },
            tasks,
            isGarage: !!specificTask?.isGarage
          });
        } catch (enrichErr) {
          console.warn(`Error enriching service ${svc.id}:`, enrichErr);
          enriched.push({ ...svc, community: { name: 'Comunidad...' }, tasks: [] });
        }
      }

      setEnrichedServices(enriched);
      setServices(svcs);
    } catch (err) {
      console.error('Error loading today:', err);
    } finally {
      isLoadingTodayRef.current = false;
      setLoading(false);
    }
  };

  // Temporizador de seguridad para evitar que la pantalla de carga se quede bloqueada
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('Safety timeout triggered for TodayPage loading state');
        setLoading(false);
      }
    }, 10000); // 10 segundos
    return () => clearTimeout(timer);
  }, [loading]);

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
      const breadcrumbs = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
      await endWorkday(activeWorkday.id, breadcrumbs);
      localStorage.removeItem('ryb_car_breadcrumbs');
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

  const handleSetCompanion = async (companionId) => {
    if (!activeWorkday) return;
    const oldCompanionId = activeWorkday.currentCompanionId;
    setActionLoading(true);
    try {
      await updateWorkdayCompanion(activeWorkday.id, companionId);
      
      // If there's an active check-in, also update the companion in that service immediately
      if (activeCheckIn?.scheduledServiceId) {
        // Remove old companion if exists
        if (oldCompanionId && oldCompanionId !== companionId) {
          try {
            await removeCompanionFromService(activeCheckIn.scheduledServiceId, oldCompanionId);
          } catch (e) { console.warn("Could not remove old companion", e); }
        }
        // Add new companion if exists
        if (companionId && companionId !== oldCompanionId) {
          await addCompanionToService(activeCheckIn.scheduledServiceId, companionId);
        }
      }
      
      await loadToday();
      setCompanionSelectorOpen(false);
    } catch (err) {
      alert("Error al asignar acompañante: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleCar = async () => {
    if (!activeWorkday) return;
    setActionLoading(true);
    try {
      if (activeWorkday.carActive) {
        const breadcrumbs = JSON.parse(localStorage.getItem('ryb_car_breadcrumbs') || '[]');
        await deactivateCar(activeWorkday.id, breadcrumbs);
        localStorage.removeItem('ryb_car_breadcrumbs');
      } else {
        localStorage.setItem('ryb_car_breadcrumbs', '[]');
        await activateCar(activeWorkday.id);
      }
      await loadToday();
    } catch (err) {
      alert('Error al cambiar modo coche: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualMileage = async () => {
    if (!manualKm || isNaN(manualKm)) {
      alert('Por favor, ingresa un número válido de kilómetros');
      return;
    }
    setActionLoading(true);
    try {
      const name = userProfile.name || userProfile.displayName || 'Operario';
      await saveManualMileage(userProfile.uid, name, new Date(), manualKm);
      alert('Kilometraje guardado correctamente');
      setMileageModalOpen(false);
      setManualKm('');
    } catch (err) {
      alert('Error al guardar kilometraje: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismissNotifications = async () => {
    if (!userProfile?.uid) return;
    try {
      await markAllNotificationsAsRead(userProfile.uid);
    } catch (err) {
      console.error("Error dismissing notifications:", err);
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
               handleDismissNotifications();
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
                      ? `Empezaste hoy a las ${format(firstStartTime || (activeWorkday.startTime?.toDate ? activeWorkday.startTime.toDate() : new Date()), 'HH:mm')}`
                      : 'Pulsa aquí para empezar a trabajar hoy'}
                  </div>

                  {(() => {
                    const accumulatedMinutes = allWorkdaysToday.reduce((acc, curr) => acc + (curr.totalMinutes || 0), 0);
                    if (accumulatedMinutes > 0) {
                      const h = Math.floor(accumulatedMinutes / 60);
                      const m = accumulatedMinutes % 60;
                      return (
                        <div style={{ 
                          fontSize: 'var(--font-xs)', 
                          fontWeight: 700,
                          marginTop: '4px',
                          color: activeWorkday ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)'
                        }}>
                          ⏱️ Acumulado hoy: {h}h {m}m
                        </div>
                      );
                    }
                    return null;
                  })()}

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

            {/* FILA CON BOTÓN ACOMPAÑANTE + BOTÓN COCHE */}
            {activeWorkday && (
              <div className="mb-6 animate-fadeIn" style={{ display: 'flex', gap: 'var(--space-3)' }}>
                {/* BOTÓN ACOMPAÑANTE */}
                <button 
                  className="btn flex flex-col items-center justify-center gap-1"
                  onClick={() => setCompanionSelectorOpen(true)}
                  style={{
                    flex: 1,
                    background: activeWorkday.currentCompanionId ? 'var(--color-bg-subtle)' : 'white',
                    border: '2px dashed var(--color-primary)',
                    borderRadius: 'var(--radius-xl)',
                    color: 'var(--color-primary)',
                    minHeight: '80px',
                    padding: 'var(--space-3)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>👥</span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-xs)', textAlign: 'center', lineHeight: 1.2 }}>
                    {activeWorkday.currentCompanionId 
                      ? `CON: ${allOperarios.find(o => o.uid === activeWorkday.currentCompanionId)?.name?.split(' ')[0] || '...'}` 
                      : '¿COMPAÑERO?'}
                  </span>
                  <span style={{ fontSize: '9px', opacity: 0.6, textAlign: 'center' }}>
                    {activeWorkday.currentCompanionId ? 'Cambiar/Quitar' : 'Toca para elegir'}
                  </span>
                </button>

                {/* BOTÓN COCHE */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <button 
                    className="btn flex flex-col items-center justify-center gap-1"
                    onClick={handleToggleCar}
                    disabled={actionLoading}
                    style={{
                      width: '100%',
                      background: activeWorkday.carActive 
                        ? 'linear-gradient(135deg, #2563eb, #1e40af)' 
                        : 'white',
                      border: activeWorkday.carActive 
                        ? '2px solid #2563eb' 
                        : '2px dashed #64748b',
                      borderRadius: 'var(--radius-xl)',
                      color: activeWorkday.carActive ? '#ffffff' : '#64748b',
                      minHeight: '80px',
                      padding: 'var(--space-3)',
                      boxShadow: activeWorkday.carActive 
                        ? '0 4px 12px -2px rgba(37, 99, 235, 0.5)' 
                        : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{activeWorkday.carActive ? '🚗' : '🚶'}</span>
                    <span style={{ fontWeight: 700, fontSize: 'var(--font-xs)', textAlign: 'center', lineHeight: 1.2 }}>
                      {activeWorkday.carActive ? 'COCHE ACTIVO' : '¿VAS EN COCHE?'}
                    </span>
                    <span style={{ fontSize: '9px', opacity: activeWorkday.carActive ? 0.8 : 0.6, textAlign: 'center' }}>
                      {activeWorkday.carActive 
                        ? `Desde ${activeWorkday.carActiveSince?.toDate ? format(activeWorkday.carActiveSince.toDate(), 'HH:mm') : '...'}` 
                        : 'GPS Automático'}
                    </span>
                  </button>
                  
                  <button 
                    className="btn btn-ghost btn-xs"
                    onClick={() => setMileageModalOpen(true)}
                    style={{ 
                      fontSize: '10px', 
                      color: 'var(--color-primary)', 
                      fontWeight: 600,
                      textDecoration: 'underline'
                    }}
                  >
                    Ingresar km manualmente
                  </button>
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

      {/* MODAL SELECCIÓN ACOMPAÑANTE */}
      {companionSelectorOpen && (
        <div className="modal-overlay" onClick={() => setCompanionSelectorOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Seleccionar Acompañante</h3>
              <button 
                className="btn btn-ghost btn-circle" 
                onClick={() => setCompanionSelectorOpen(false)}
                style={{ fontSize: '1.5rem', minHeight: '44px', height: '44px', width: '44px' }}
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              <button 
                className="btn btn-outline w-full text-left justify-start"
                onClick={() => handleSetCompanion(null)}
                style={{ borderColor: 'var(--color-border)' }}
              >
                🚶 Solo (Sin acompañante)
              </button>
              
              <div className="divider my-1"></div>
              
              {allOperarios.map(op => (
                <button
                  key={op.uid}
                  className={`btn w-full text-left justify-start ${activeWorkday?.currentCompanionId === op.uid ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleSetCompanion(op.uid)}
                >
                  👤 {op.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SERVICIO ACTIVO (OPCIONAL) */}
      {activeCheckIn && (
        <div 
          className="card mb-4" 
          onClick={() => navigate(`/operario/servicio/${activeCheckIn.scheduledServiceId}`)}
          style={{ 
            background: 'linear-gradient(135deg, var(--color-success-light), #a7f3d0)',
            border: '2px solid var(--color-success)',
            padding: 'var(--space-3)',
            cursor: 'pointer'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span style={{ fontSize: '1.5rem' }}>📍</span>
              <div>
                <div className="font-bold text-sm" style={{ color: '#065f46' }}>
                  Limpieza en curso: {activeCheckIn.communityName}
                </div>
                <div className="text-xs" style={{ color: '#047857' }}>
                  Entrada: {activeCheckIn.checkInTime?.toDate 
                    ? format(activeCheckIn.checkInTime.toDate(), 'HH:mm') 
                    : 'Ahora'}
                </div>
              </div>
            </div>
            <div className="text-xs font-bold px-2 py-1 bg-white/50 rounded-lg" style={{ color: '#065f46' }}>
              VER DETALLE →
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
            const garageClass = svc.isGarage ? 'garage' : '';
            return (
            <div
              key={svc.id}
              className={`service-card ${statusClass} ${garageClass} ${!canAccess ? 'opacity-50 grayscale' : ''}`}
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

      {/* MODAL KILOMETRAJE MANUAL */}
      {mileageModalOpen && (
        <div className="modal-overlay" onClick={() => setMileageModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Kilometraje Manual</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setMileageModalOpen(false)}>✕</button>
            </div>
            
            <p className="text-sm text-muted mb-4">
              Ingresa el total de kilómetros recorridos hoy. Esto sobrescribirá cualquier registro automático.
            </p>
            
            <div className="form-group mb-6">
              <label className="form-label">Kilómetros totales</label>
              <input 
                type="number" 
                className="form-input" 
                placeholder="Ej: 15.5" 
                value={manualKm}
                onChange={e => setManualKm(e.target.value)}
                autoFocus
              />
            </div>
            
            <button 
              className="btn btn-primary w-full"
              onClick={handleManualMileage}
              disabled={actionLoading || !manualKm}
            >
              {actionLoading ? 'Guardando...' : 'Guardar Kilometraje'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

