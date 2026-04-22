import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getScheduledServicesForWeek } from '../../services/scheduleService';
import { getCommunity } from '../../services/communityService';
import { getWorkdaysForOperario } from '../../services/workdayService';
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDecimalHours, formatMinutes } from '../../utils/formatTime';
import { transferDay, transferWeek } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';

import PlanningCalendar from '../../components/PlanningCalendar';

export default function HistoryPage() {
  const { userProfile } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar', 'services' o 'workdays'
  
  const [services, setServices] = useState([]);
  const [workdays, setWorkdays] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Transfer state
  const [transferModal, setTransferModal] = useState({ open: false, type: '', date: null });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (userProfile?.uid) {
      if (activeTab === 'services') loadServices();
      else loadWorkdays();
    }
  }, [userProfile, currentWeek, activeTab]);

  async function loadServices() {
    setLoading(true);
    try {
      const svcs = await getScheduledServicesForWeek(userProfile.uid, currentWeek);
      const cache = {};
      const enriched = [];
      for (const svc of svcs) {
        if (!cache[svc.communityId]) {
          cache[svc.communityId] = await getCommunity(svc.communityId);
        }
        enriched.push({ ...svc, community: cache[svc.communityId] });
      }
      setServices(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkdays() {
    setLoading(true);
    try {
      const start = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const end = endOfWeek(currentWeek, { weekStartsOn: 1 });
      const data = await getWorkdaysForOperario(userProfile.uid, start, end);
      setWorkdays(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransferConfirm(toUserId) {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      if (transferModal.type === 'day') {
        await transferDay({
          date: transferModal.date,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
        alert('Traspaso de día solicitado correctamente.');
      } else if (transferModal.type === 'week') {
        await transferWeek({
          dateInWeek: currentWeek,
          fromUserId: userProfile.uid,
          toUserId,
          requesterRole: 'operario'
        });
        alert('Traspaso de semana solicitado correctamente.');
      }
      setTransferModal({ open: false, type: '', date: null });
      await loadServices();
    } catch (err) {
      alert('Error en el traspaso: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const totalMinutes = workdays.reduce((acc, curr) => acc + (curr.totalMinutes || 0), 0);
  const totalHours = totalMinutes / 60;

  const safeFormatDate = (dateVal, formatStr = 'HH:mm') => {
    if (!dateVal) return '-';
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return '-';
    return format(d, formatStr);
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 800 }}>📅 Historial</h2>
        
        {/* TABS */}
        <div style={{ 
          background: 'var(--color-bg-alt)', 
          padding: '4px', 
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          gap: '4px'
        }}>
          <button 
            onClick={() => setActiveTab('calendar')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-xs)',
              fontWeight: 700,
              background: activeTab === 'calendar' ? 'white' : 'transparent',
              boxShadow: activeTab === 'calendar' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
              color: activeTab === 'calendar' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Calendario
          </button>
          <button 
            onClick={() => setActiveTab('services')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-xs)',
              fontWeight: 700,
              background: activeTab === 'services' ? 'white' : 'transparent',
              boxShadow: activeTab === 'services' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
              color: activeTab === 'services' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Lista
          </button>
          <button 
            onClick={() => setActiveTab('workdays')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-xs)',
              fontWeight: 700,
              background: activeTab === 'workdays' ? 'white' : 'transparent',
              boxShadow: activeTab === 'workdays' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
              color: activeTab === 'workdays' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Horas
          </button>
        </div>
      </div>

      {/* Week navigation (Solo para Lista y Horas) */}
      {activeTab !== 'calendar' && (
        <div className="flex items-center justify-between mb-4 card" style={{ padding: '8px var(--space-4)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>←</button>
          <div className="text-center">
            <div className="font-bold text-sm">
              Semana del {format(weekDays[0], "d 'de' MMMM", { locale: es })}
            </div>
            {activeTab === 'workdays' && (
              <div className="text-xs text-primary font-bold">Total: {formatMinutes(totalMinutes)}</div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>→</button>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="mb-6">
          <PlanningCalendar userId={userProfile.uid} />
        </div>
      )}

       {activeTab === 'services' && (
        <div className="mb-6 flex justify-center px-4">
          {(() => {
            const hasStartedWeek = services.some(s => s.status === 'completed' || s.status === 'in_progress');
            if (hasStartedWeek) {
              return (
                <div className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
                  🔒 Traspaso de semana bloqueado (hay servicios iniciados)
                </div>
              );
            }
            return (
              <button 
                className="btn btn-secondary btn-sm flex items-center gap-2 w-full sm:w-auto justify-center" 
                style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d', fontWeight: 800 }}
                onClick={() => setTransferModal({ open: true, type: 'week', date: null })}
              >
                <span className="text-lg">🔄</span> 
                <span>Traspasar esta semana</span>
              </button>
            );
          })()}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-6"><div className="spinner"></div></div>
      ) : activeTab === 'services' ? (
        /* VISTA DE SERVICIOS */
        <div className="flex flex-col gap-4">
          {weekDays.map(day => {
            const dayServices = services.filter(s => {
              const sDate = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
              return isSameDay(sDate, day);
            });
            const isToday = isSameDay(day, new Date());

            return (
              <div key={day.toISOString()} className="card" style={{
                padding: 'var(--space-4)',
                borderLeft: isToday ? '4px solid var(--color-primary)' : 'none',
              }}>
                <div className="flex items-center justify-between mb-3 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">
                      {format(day, 'EEEE d', { locale: es })}
                    </span>
                    {dayServices.length > 0 && (() => {
                      const hasStartedDay = dayServices.some(s => s.status === 'completed' || s.status === 'in_progress');
                      if (hasStartedDay) return (
                        <span className="text-[10px] font-bold text-slate-300 ml-2">Bloqueado 🚫</span>
                      );
                      return (
                        <button 
                          className="btn btn-ghost btn-xs flex items-center gap-1" 
                          onClick={() => setTransferModal({ open: true, type: 'day', date: day })}
                          style={{ color: 'var(--color-warning)', padding: '2px 4px' }}
                          title="Traspasar este día"
                        >
                          <span className="text-[14px]">🔄</span> <span className="hidden sm:inline">Traspasar Día</span>
                          <span className="sm:hidden text-[10px] font-bold">Día</span>
                        </button>
                      );
                    })()}
                  </div>
                  <span className="badge badge-sm">{dayServices.length}</span>
                </div>
                
                {dayServices.length === 0 ? (
                  <p className="text-xs text-muted italic">Sin servicios programados</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {dayServices.map(svc => (
                      <div key={svc.id} className="flex items-center gap-3">
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: svc.status === 'completed' ? 'var(--color-success)' : 'var(--color-warning)',
                          flexShrink: 0,
                        }} />
                        <div style={{ flex: 1 }}>
                          <div className="font-semibold text-sm">{svc.community?.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA DE JORNADA (HORAS) */
        <div className="flex flex-col gap-3">
          {weekDays.slice().reverse().map(day => {
            const dayWorkday = workdays.find(wd => {
              const wdDate = wd.date?.toDate ? wd.date.toDate() : new Date(wd.date);
              return isSameDay(wdDate, day);
            });

            return (
              <div key={day.toISOString()} className="card" style={{ padding: 'var(--space-4)' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">
                      {format(day, 'EEEE d', { locale: es })}
                    </div>
                    {dayWorkday ? (
                      <div className="text-xs text-muted">
                        Entrada: {safeFormatDate(dayWorkday.startTime)} | 
                        Salida: {safeFormatDate(dayWorkday.endTime)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted italic">No hay registro</div>
                    )}
                  </div>
                  {dayWorkday && (
                    <div style={{ textAlign: 'right' }}>
                      <div className="font-black text-primary">
                        {dayWorkday.totalMinutes ? formatMinutes(dayWorkday.totalMinutes) : '-'}
                      </div>
                      <span className="badge badge-sm" style={{ 
                        background: dayWorkday.status === 'completed' ? '#dcfce7' : '#fff7ed',
                        color: dayWorkday.status === 'completed' ? '#166534' : '#9a3412'
                      }}>
                        {dayWorkday.status === 'active' ? 'En curso' : 'Listo'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL TRASPASO */}
      <TransferModal 
        isOpen={transferModal.open}
        onClose={() => setTransferModal({ open: false, type: '', date: null })}
        onConfirm={handleTransferConfirm}
        loading={actionLoading}
        title={transferModal.type === 'day' 
          ? `Traspasar día ${transferModal.date ? format(transferModal.date, 'dd/MM') : ''}` 
          : 'Traspasar semana completa'}
      />
    </div>
  );
}

