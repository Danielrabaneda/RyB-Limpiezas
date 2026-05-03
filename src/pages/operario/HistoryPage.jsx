import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getScheduledServicesForWeek } from '../../services/scheduleService';
import { getCommunity } from '../../services/communityService';
import { getWorkdaysForOperario } from '../../services/workdayService';
import { getMileageForWeek, getMileageForMonth } from '../../services/mileageService';
import { format, startOfWeek, endOfWeek, addDays, subWeeks, addWeeks, isSameDay, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDecimalHours, formatMinutes } from '../../utils/formatTime';
import { transferDay, transferWeek } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';

import PlanningCalendar from '../../components/PlanningCalendar';

export default function HistoryPage() {
  const { userProfile } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar', 'services', 'workdays', 'mileage'
  
  const [services, setServices] = useState([]);
  const [workdays, setWorkdays] = useState([]);
  const [mileageWeek, setMileageWeek] = useState([]);   // registros de km de la semana
  const [mileageMonth, setMileageMonth] = useState([]); // registros del mes para el total
  const [loading, setLoading] = useState(true);
  
  // Transfer state
  const [transferModal, setTransferModal] = useState({ open: false, type: '', date: null });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (userProfile?.uid) {
      if (activeTab === 'services') loadServices();
      else if (activeTab === 'mileage') loadMileage();
      else loadWorkdays();
    }
  }, [userProfile, currentWeek, currentMonth, activeTab]);

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

  async function loadMileage() {
    setLoading(true);
    try {
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
      const [weekData, monthData] = await Promise.all([
        getMileageForWeek(userProfile.uid, weekStart, weekEnd),
        getMileageForMonth(userProfile.uid, currentMonth.getFullYear(), currentMonth.getMonth()),
      ]);
      setMileageWeek(weekData);
      setMileageMonth(monthData);
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

  // Totales km
  const weekTotalKm  = mileageWeek.reduce((acc, r) => acc + (r.totalKm || 0), 0);
  const monthTotalKm = mileageMonth.reduce((acc, r) => acc + (r.totalKm || 0), 0);

  const safeFormatDate = (dateVal, formatStr = 'HH:mm') => {
    if (!dateVal) return '-';
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return '-';
    return format(d, formatStr);
  };

  const tabStyle = (tab) => ({
    padding: '6px 12px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-xs)',
    fontWeight: 700,
    background: activeTab === tab ? 'white' : 'transparent',
    boxShadow: activeTab === tab ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
    color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
    border: 'none',
    cursor: 'pointer'
  });

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
          <button onClick={() => setActiveTab('calendar')} style={tabStyle('calendar')}>
            Calendario
          </button>
          <button onClick={() => setActiveTab('services')} style={tabStyle('services')}>
            Lista
          </button>
          <button onClick={() => setActiveTab('workdays')} style={tabStyle('workdays')}>
            Horas
          </button>
          <button onClick={() => setActiveTab('mileage')} style={tabStyle('mileage')}>
            🚗 Km
          </button>
        </div>
      </div>

      {/* Week navigation (Lista y Horas) */}
      {(activeTab === 'services' || activeTab === 'workdays') && (
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

      {/* Week + Month navigation para Kilómetros */}
      {activeTab === 'mileage' && (
        <>
          {/* Selector de mes (para total mensual) */}
          <div className="card mb-3" style={{
            padding: '10px var(--space-4)',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            color: 'white',
            borderRadius: 'var(--radius-lg)'
          }}>
            <div className="flex items-center justify-between">
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'white' }}
                onClick={() => {
                  const prev = subMonths(currentMonth, 1);
                  setCurrentMonth(prev);
                  setCurrentWeek(prev);
                }}
              >←</button>
              <div className="text-center">
                <div style={{ fontSize: 'var(--font-xs)', opacity: 0.7, marginBottom: 2 }}>
                  Total {format(currentMonth, 'MMMM yyyy', { locale: es })}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
                  🚗 {Math.round(monthTotalKm * 10) / 10} km
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'white' }}
                onClick={() => {
                  const next = addMonths(currentMonth, 1);
                  setCurrentMonth(next);
                  setCurrentWeek(next);
                }}
              >→</button>
            </div>
          </div>

          {/* Selector de semana */}
          <div className="flex items-center justify-between mb-4 card" style={{ padding: '8px var(--space-4)' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>←</button>
            <div className="text-center">
              <div className="font-bold text-sm">
                Semana del {format(weekDays[0], "d 'de' MMMM", { locale: es })}
              </div>
              <div className="text-xs text-primary font-bold">
                Esta semana: {Math.round(weekTotalKm * 10) / 10} km
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>→</button>
          </div>
        </>
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
      ) : activeTab === 'calendar' ? null : activeTab === 'services' ? (
        /* VISTA DE SERVICIOS */
        <div className="flex flex-col gap-4">
          {weekDays.map(day => {
            const dayServices = services.filter(s => {
              const sDate = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
              return format(sDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
            });
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

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
      ) : activeTab === 'workdays' ? (
        /* VISTA DE JORNADA (HORAS) */
        <div className="flex flex-col gap-3">
          {weekDays.slice().reverse().map(day => {
            const targetDayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(day);
            const daySessions = workdays.filter(wd => {
              const wdDate = wd.date?.toDate ? wd.date.toDate() : new Date(wd.date);
              const wdDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(wdDate);
              return wdDateStr === targetDayStr;
            });

            if (daySessions.length === 0) {
              return (
                <div key={day.toISOString()} className="card" style={{ padding: 'var(--space-4)', opacity: 0.7 }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-sm text-slate-500">
                        {format(day, 'EEEE d', { locale: es })}
                      </div>
                      <div className="text-xs text-muted italic">No hay registro</div>
                    </div>
                  </div>
                </div>
              );
            }

            const dayTotalMinutes = daySessions.reduce((acc, s) => acc + (s.totalMinutes || 0), 0);
            const isAnyActive = daySessions.some(s => s.status === 'active');
            
            const sortedSessions = [...daySessions].sort((a, b) => {
              const aTime = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
              const bTime = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
              return aTime - bTime;
            });

            return (
              <div key={day.toISOString()} className="card" style={{ 
                padding: 'var(--space-4)',
                borderLeft: isAnyActive ? '4px solid var(--color-warning)' : 'none'
              }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">
                      {format(day, 'EEEE d', { locale: es })}
                    </div>
                    <div className="text-xs text-muted">
                      {daySessions.length > 1 ? (
                        <span className="flex flex-col gap-0.5 mt-1">
                          {daySessions.map((s, idx) => (
                            <span key={s.id} className="block">
                              Sesión {idx + 1}: {safeFormatDate(s.startTime)} - {safeFormatDate(s.endTime)} ({formatMinutes(s.totalMinutes || 0)})
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span>
                          Entrada: {safeFormatDate(daySessions[0].startTime)} | 
                          Salida: {safeFormatDate(daySessions[0].endTime)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="font-black text-primary text-lg">
                      {formatMinutes(dayTotalMinutes)}
                    </div>
                    <span className="badge badge-sm" style={{ 
                      background: !isAnyActive ? '#dcfce7' : '#fff7ed',
                      color: !isAnyActive ? '#166534' : '#9a3412',
                      fontWeight: 700
                    }}>
                      {isAnyActive ? 'En curso' : 'Completada'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab === 'mileage' ? (
        /* VISTA DE KILÓMETROS */
        <div className="flex flex-col gap-3">
          {weekDays.slice().reverse().map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayRecord = mileageWeek.find(r => r.date === dayStr);

            if (!dayRecord || dayRecord.totalKm === 0) {
              return (
                <div key={day.toISOString()} className="card" style={{ padding: 'var(--space-4)', opacity: 0.7 }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-sm text-slate-500">
                        {format(day, 'EEEE d', { locale: es })}
                      </div>
                      <div className="text-xs text-muted italic">Sin uso del vehículo</div>
                    </div>
                    <div style={{ fontSize: '1.1rem', color: '#cbd5e1', fontWeight: 800 }}>
                      — km
                    </div>
                  </div>
                </div>
              );
            }

            const isManual = dayRecord.type === 'manual';
            const hasSuspicious = dayRecord.tramosSospechosos > 0;

            return (
              <div key={day.toISOString()} className="card" style={{ 
                padding: 'var(--space-4)',
                borderLeft: hasSuspicious ? '4px solid var(--color-warning)' : '4px solid #3b82f6'
              }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">
                      {format(day, 'EEEE d', { locale: es })}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {isManual ? (
                        <span style={{ color: '#6366f1', fontWeight: 600 }}>✏️ Registro manual</span>
                      ) : dayRecord.totalTramos > 0 ? (
                        <span>{dayRecord.totalTramos} tramo{dayRecord.totalTramos !== 1 ? 's' : ''} calculados</span>
                      ) : (
                        <span>GPS / migas de pan</span>
                      )}
                      {hasSuspicious && (
                        <span style={{ color: 'var(--color-warning)', marginLeft: 6, fontWeight: 700 }}>
                          ⚠️ {dayRecord.tramosSospechosos} sospechoso{dayRecord.tramosSospechosos !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Desglose de tramos si los hay */}
                    {dayRecord.tramos && dayRecord.tramos.filter(t => !t.mismoCentro).length > 0 && (
                      <div className="mt-1" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {dayRecord.tramos.filter(t => !t.mismoCentro).map((tramo, idx) => (
                          <div key={idx} className="text-xs text-muted" style={{ fontSize: '10px' }}>
                            <span style={{ fontWeight: 600 }}>{tramo.origenNombre}</span>
                            <span style={{ margin: '0 4px', opacity: 0.5 }}>→</span>
                            <span style={{ fontWeight: 600 }}>{tramo.destinoNombre}</span>
                            <span style={{ marginLeft: 4, color: '#3b82f6' }}>
                              {tramo.kmEstimados} km
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontSize: '1.4rem',
                      fontWeight: 900,
                      color: '#1d4ed8',
                      letterSpacing: '-0.5px',
                      lineHeight: 1
                    }}>
                      {Math.round(dayRecord.totalKm * 10) / 10}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, marginTop: 1 }}>
                      km
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}


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
