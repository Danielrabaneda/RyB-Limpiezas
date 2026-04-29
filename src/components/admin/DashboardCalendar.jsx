import { useState, useEffect } from 'react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek,
  getDay, isToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import { getScheduledServicesRange, generateServicesForMonth, syncServicesForMonth } from '../../services/scheduleService';

export default function DashboardCalendar({ operarios }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthServices, setMonthServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadMonthData();
  }, [currentMonth]);

  async function loadMonthData() {
    setLoading(true);
    try {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const svcs = await getScheduledServicesRange(start, end);
      setMonthServices(svcs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!confirm(`¿Generar servicios para todo el mes de ${format(currentMonth, 'MMMM', { locale: es })}?`)) return;
    setGenerating(true);
    try {
      const created = await generateServicesForMonth(currentMonth);
      alert(`Se han generado ${created} nuevos servicios.`);
      await loadMonthData();
    } catch (err) {
      alert('Error generis servicios');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSync() {
    if (!confirm(`¿Actualizar y sincronizar servicios para todo el mes de ${format(currentMonth, 'MMMM', { locale: es })}?`)) return;
    setGenerating(true);
    try {
      const result = await syncServicesForMonth(currentMonth);
      alert(`Sincronización completada:\n${result.createdCount} creados.\n${result.deletedCount} obsoletos eliminados.`);
      await loadMonthData();
    } catch (err) {
      alert('Error al actualizar servicios');
    } finally {
      setGenerating(false);
    }
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
  });

  const getServicesForDay = (date) => {
    return monthServices.filter(s => {
      const sDate = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : (s.scheduledDate ? new Date(s.scheduledDate) : null);
      if (!sDate || isNaN(sDate.getTime())) return false;
      return isSameDay(sDate, date);
    });
  };

  const selectedDayServices = getServicesForDay(selectedDate);
  // Group by operario
  const groupedByOperario = {};
  operarios.forEach(op => {
    groupedByOperario[op.uid] = {
      name: op.name,
      services: selectedDayServices.filter(s => s.assignedUserId === op.uid)
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar Grid */}
      <div className="lg:col-span-2 card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h3>
            <div className="flex gap-1">
              <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>◀</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>▶</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              className="btn btn-primary btn-sm"
              onClick={handleGenerate}
              disabled={generating}
              title="Genera servicios faltantes sin borrar nada"
            >
              {generating ? '⌛...' : '📅 Generar mes'}
            </button>
            <button 
              className="btn btn-outline btn-sm"
              onClick={handleSync}
              disabled={generating}
              title="Sincroniza: quita servicios obsoletos y añade modificaciones"
            >
              {generating ? '⌛...' : '🔄 Actualizar mes'}
            </button>
          </div>
        </div>

        <div className="calendar-grid">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="calendar-header-cell">{d}</div>
          ))}
          {days.map(day => {
            const daySvcs = getServicesForDay(day);
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div 
                key={day.toISOString()} 
                className={`calendar-day-cell ${!isCurrentMonth ? 'outside' : ''} ${isSelected ? 'selected' : ''} ${today ? 'today' : ''}`}
                onClick={() => setSelectedDate(day)}
              >
                <span className="day-number">{format(day, 'd')}</span>
                {daySvcs.length > 0 && (
                  <div className="day-indicators">
                    <span className="svc-count">{daySvcs.length}</span>
                    <div className="svc-dots">
                      {Array.from({ length: Math.min(daySvcs.length, 3) }).map((_, i) => (
                        <div key={i} className="svc-dot"></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Detail View */}
      <div className="card">
        <div className="card-header border-b mb-4 pb-4">
          <h4 className="font-bold text-lg">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
          </h4>
          <p className="text-sm text-muted">{selectedDayServices.length} servicios totales</p>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '500px' }}>
          {operarios.map(op => {
            const opSvcs = groupedByOperario[op.uid].services;
            if (opSvcs.length === 0) return null;

            return (
              <div key={op.uid} className="op-day-group">
                <div className="flex items-center gap-2 mb-2 p-2 bg-slate-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                    {op.name.charAt(0)}
                  </div>
                  <span className="font-semibold text-sm">{op.name}</span>
                  <span className="badge badge-primary scale-75 ml-auto">{opSvcs.length}</span>
                </div>
                <div className="flex flex-col gap-2 pl-4 border-l-2 border-slate-100">
                  {opSvcs.map(s => (
                    <div key={s.id} className="text-xs p-2 rounded border border-slate-50 shadow-sm bg-white">
                    <div className="font-medium">Comunidad: {s.communityName || 'Cargando...'}</div>
                    <div className={`mt-1 font-bold ${s.status === 'completed' ? 'text-green-600' : 'text-orange-500'}`}>
                        {s.status === 'completed' ? '✓ Completado' : '○ Pendiente'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {selectedDayServices.length === 0 && (
            <div className="text-center py-12">
              <span className="text-4xl mb-4 block">🏝️</span>
              <p className="text-muted text-sm">No hay servicios programados para este día</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .calendar-header-cell {
          text-align: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-muted);
          padding: 8px;
        }
        .calendar-day-cell {
          aspect-ratio: 1;
          border-radius: var(--radius-md);
          padding: 8px;
          cursor: pointer;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: all 0.2s;
          border: 1px solid transparent;
          background: #f8fafc;
        }
        .calendar-day-cell:hover {
          background: #f1f5f9;
          transform: translateY(-2px);
        }
        .calendar-day-cell.outside {
          opacity: 0.3;
        }
        .calendar-day-cell.selected {
          background: #eff6ff;
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }
        .calendar-day-cell.today {
          background: #fffbeb;
          border-color: #f59e0b;
        }
        .day-number {
          font-weight: 700;
          font-size: 0.9rem;
        }
        .day-indicators {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .svc-count {
          font-size: 0.65rem;
          font-weight: 800;
          color: #3b82f6;
        }
        .svc-dots {
          display: flex;
          gap: 2px;
        }
        .svc-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #3b82f6;
        }
        .op-day-group {
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}
