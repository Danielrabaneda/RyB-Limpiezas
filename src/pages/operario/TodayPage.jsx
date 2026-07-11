import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { transferService, transferDay, transferWeek, rescheduleService } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import RescheduleModal from '../../components/RescheduleModal';
import WorkdayHeaderCard from '../../components/operario/WorkdayHeaderCard';
import CarAndCompanionControl from '../../components/operario/CarAndCompanionControl';
import TodayServicesList from '../../components/operario/TodayServicesList';
import { useCarAndCompanion } from '../../hooks/useCarAndCompanion';
import { useWorkdayLifecycle } from '../../hooks/useWorkdayLifecycle';
import { useTodayData } from '../../hooks/useTodayData';
import { useNavigate } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { getDistance } from '../../utils/geolocation';

const getOrigDateStr = (originalDate) => {
  if (!originalDate) return '';
  try {
    const dateObj = originalDate.toDate ? originalDate.toDate() : new Date(originalDate);
    return format(dateObj, 'dd/MM');
  } catch (e) {
    return '';
  }
};
export default function TodayPage() {
  const { userProfile } = useAuth();
  const { notifications, unreadCount, dismissAll, triggerWorkdayStartPopups, triggerWorkdayEndPopups } = useNotifications();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModal, setTransferModal] = useState({ open: false, type: 'single', service: null });
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, serviceId: null, currentDate: null });

  // Hook de carga y sincronización de datos de hoy (Paso 4)
  const todayData = useTodayData(userProfile);
  const {
    enrichedServices,
    routeOptimized,
    activeCheckIn,
    setActiveCheckIn,
    activeWorkday,
    setActiveWorkday,
    firstStartTime,
    allWorkdaysToday,
    loading,
    setLoading,
    refreshing,
    staleWorkday,
    setStaleWorkday,
    activeWorkdaysList,
    userLocation,
    loadToday,
    handleRefresh
  } = todayData;

  useEffect(() => {
    if (activeWorkday) {
      triggerWorkdayStartPopups();
    }
  }, [activeWorkday, triggerWorkdayStartPopups]);

  // Hook de acompañantes y vehículo (Paso 2)
  const carAndCompanion = useCarAndCompanion(userProfile, {
    activeWorkday,
    activeCheckIn,
    activeWorkdaysList,
    loadToday,
    actionLoading,
    setActionLoading
  });
  const {
    allOperarios,
    companionSelectorOpen,
    setCompanionSelectorOpen,
    mileageModalOpen,
    setMileageModalOpen,
    manualKm,
    setManualKm,
    handleSetCompanion,
    handleToggleCar,
    hasCarConflict
  } = carAndCompanion;

  // Hook de ciclo de vida de la jornada (Paso 3)
  const workdayLifecycle = useWorkdayLifecycle(userProfile, {
    activeWorkday,
    setActiveWorkday,
    staleWorkday,
    setStaleWorkday,
    activeCheckIn,
    setActiveCheckIn,
    enrichedServices,
    loadToday,
    actionLoading,
    setActionLoading
  });
  const {
    retroactiveModal,
    setRetroactiveModal,
    handleStartWorkday,
    handleEndWorkday,
    handleResolveEndWorkday,
    handleResolveStaleWorkday
  } = workdayLifecycle;



  const handleTransferConfirm = async (toUserId) => {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      if (transferModal.type === 'single') {
        const servicesToTransfer = transferModal.service.groupedServices || [transferModal.service];
        for (const s of servicesToTransfer) {
          await transferService({
            serviceId: s.id,
            fromUserId: userProfile.uid,
            toUserId,
            requesterRole: 'operario'
          });
        }
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

  const handleRescheduleConfirm = async (newDate) => {
    if (!rescheduleModal.serviceId) return;
    setActionLoading(true);
    try {
      await rescheduleService({
        serviceId: rescheduleModal.serviceId,
        newDate,
        requesterRole: 'operario',
        userId: userProfile.uid
      });
      alert('Cambio de fecha solicitado. El administrador deberá validarlo.');
      setRescheduleModal({ open: false, serviceId: null, currentDate: null });
      loadToday();
    } catch (err) {
      alert('Error en el cambio de fecha: ' + err.message);
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
            <WorkdayHeaderCard 
              activeWorkday={activeWorkday}
              actionLoading={actionLoading}
              firstStartTime={firstStartTime}
              allWorkdaysToday={allWorkdaysToday}
              allServicesIndividual={allServicesIndividual}
              handleStartWorkday={handleStartWorkday}
              handleEndWorkday={handleEndWorkday}
            />

            {/* FILA CON BOTÓN ACOMPAÑANTE + BOTÓN COCHE */}
            <CarAndCompanionControl 
              activeWorkday={activeWorkday}
              companionInfo={companionInfo}
              allOperarios={allOperarios}
              actionLoading={actionLoading}
              handleToggleCar={handleToggleCar}
              setCompanionSelectorOpen={setCompanionSelectorOpen}
              setMileageModalOpen={setMileageModalOpen}
            />


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

      {/* LISTADO DE SERVICIOS (Paso 5.3-5.4) */}
      <TodayServicesList 
        enrichedServices={enrichedServices}
        routeOptimized={routeOptimized}
        loading={loading}
        refreshing={refreshing}
        activeWorkday={activeWorkday}
        userLocation={userLocation}
        handleRefresh={handleRefresh}
        setTransferModal={setTransferModal}
        setRescheduleModal={setRescheduleModal}
        navigate={navigate}
      />

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

      <RescheduleModal 
        isOpen={rescheduleModal.open}
        onClose={() => setRescheduleModal({ open: false, serviceId: null, currentDate: null })}
        onConfirm={handleRescheduleConfirm}
        currentDate={rescheduleModal.currentDate}
        loading={actionLoading}
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

      {/* MODAL JORNADA HUÉRFANA (STALE) */}
      {staleWorkday && (
        <div className="modal-overlay">
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '400px' }}>
            <div className="text-center mb-6">
              <div style={{ fontSize: '4rem', marginBottom: 'var(--space-4)' }}>⏰</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: 'var(--color-danger)' }}>
                JORNADA SIN CERRAR
              </h3>
              <p className="text-sm text-muted mt-2">
                Parece que olvidaste cerrar tu jornada del día{' '}
                <span className="font-bold">
                  {format(staleWorkday.workday.date?.toDate ? staleWorkday.workday.date.toDate() : new Date(staleWorkday.workday.date), 'dd/MM/yyyy')}
                </span>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl mb-6 border border-slate-200">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted">Inicio detectado:</span>
                <span className="font-bold">
                  {format(staleWorkday.workday.startTime?.toDate ? staleWorkday.workday.startTime.toDate() : new Date(), 'HH:mm')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Última actividad (fin sugerido):</span>
                <span className="font-bold text-primary" style={{ fontSize: '1.1rem' }}>
                  {format(staleWorkday.suggestedEndTime, 'HH:mm')}
                </span>
              </div>
              <p className="text-[10px] text-muted mt-3 italic">
                * El fin sugerido se basa en tu última salida de una comunidad o último movimiento registrado.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                className="btn btn-primary w-full py-4 font-bold"
                onClick={handleResolveStaleWorkday}
                disabled={actionLoading}
              >
                {actionLoading ? 'CERRANDO...' : 'CONFIRMAR Y CERRAR'}
              </button>
              <p className="text-[10px] text-center text-muted">
                Debes cerrar la jornada anterior antes de poder iniciar una nueva.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FINALIZACIÓN INTELIGENTE (RETROACTIVA) */}
      {retroactiveModal.open && (
        <div className="modal-overlay">
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '420px', padding: '24px' }}>
            <div className="text-center mb-6">
              <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>⏰</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: 'var(--color-primary)' }}>
                ¿Ajustar hora de salida?
              </h3>
              {retroactiveModal.allTasksCompleted ? (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg inline-flex items-center gap-2 mt-2 font-medium">
                  ✨ ¡Todas tus tareas del día están completadas!
                </div>
              ) : null}
              <p className="text-sm mt-3" style={{ color: '#334155' }}>
                Detectamos que tu última actividad registrada fue a las <span className="font-bold" style={{ color: '#0f172a' }}>{retroactiveModal.suggestedTimeStr}</span>.
              </p>
              <p className="text-xs mt-1" style={{ color: '#475569', lineHeight: 1.5 }}>
                Parece que han pasado más de 30 minutos desde entonces. ¿Quieres finalizar tu jornada a esa hora para evitar registrar horas de más y corregir el kilometraje del coche?
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl mb-6 border border-slate-200">
              <div className="flex justify-between items-center text-sm mb-3">
                <span className="flex items-center gap-1" style={{ color: '#475569', fontWeight: 500 }}>⏰ Hora sugerida (último trabajo):</span>
                <span className="font-bold text-emerald-600" style={{ fontSize: '1.3rem' }}>
                  {retroactiveModal.suggestedTimeStr}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-3">
                <span style={{ color: '#475569', fontWeight: 500 }}>🕒 Hora actual:</span>
                <span className="font-semibold" style={{ color: '#64748b', fontSize: '1.1rem' }}>
                  {retroactiveModal.actualTimeStr}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                className="btn btn-primary w-full py-4 font-bold flex justify-center items-center gap-2"
                onClick={() => handleResolveEndWorkday(true)}
                disabled={actionLoading}
                style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
              >
                {actionLoading ? 'FINALIZANDO...' : `SÍ, FINALIZAR A LAS ${retroactiveModal.suggestedTimeStr}`}
              </button>
              
              <button 
                className="btn w-full py-3 text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50"
                onClick={() => handleResolveEndWorkday(false)}
                disabled={actionLoading}
                style={{ color: 'var(--color-text)' }}
              >
                {actionLoading ? 'FINALIZANDO...' : `No, finalizar ahora (${retroactiveModal.actualTimeStr})`}
              </button>

              <button 
                className="btn btn-ghost w-full text-sm text-muted"
                onClick={() => setRetroactiveModal({ open: false, suggestedTime: null, suggestedTimeStr: '', actualTimeStr: '', workdayId: null, allTasksCompleted: false })}
                disabled={actionLoading}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFLICTO DE COCHE COMPARTIDO */}
      {hasCarConflict && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '420px', padding: '24px' }}>
            <div className="text-center mb-6">
              <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>🚗⚠️</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, color: 'var(--color-primary)' }}>
                Conflicto de coche activo
              </h3>
              <p className="text-sm mt-3" style={{ color: '#334155', lineHeight: 1.5 }}>
                Hemos detectado que tanto tú como tu compañero <strong>{companionInfo.name}</strong> tenéis el coche activo.
              </p>
              <p className="text-xs mt-2" style={{ color: '#475569', lineHeight: 1.5 }}>
                Para evitar que se registre el kilometraje por duplicado en el sistema, solo uno de vosotros debe marcar que lleva el coche. ¿Quién conduce hoy?
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                className="btn btn-primary w-full py-4 font-bold flex justify-center items-center gap-2"
                onClick={() => handleResolveCarConflict(false)}
                disabled={actionLoading}
                style={{ backgroundColor: '#2563eb', borderColor: '#2563eb' }}
              >
                {actionLoading ? 'PROCESANDO...' : '🙋 Lo llevo yo (Conduzco yo)'}
              </button>
              
              <button 
                className="btn w-full py-3 text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50"
                onClick={() => handleResolveCarConflict(true)}
                disabled={actionLoading}
                style={{ color: '#475569' }}
              >
                {actionLoading ? 'PROCESANDO...' : `🚗 Lo lleva ${companionInfo.name}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

