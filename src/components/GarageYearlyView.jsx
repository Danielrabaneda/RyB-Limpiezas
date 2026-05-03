import { useState, useEffect } from 'react';
import { getCommunities } from '../services/communityService';
import { getAllActiveTasks } from '../services/taskService';
import { getScheduledServicesRange, shouldScheduleOnDay } from '../services/scheduleService';
import { 
  format, startOfYear, endOfYear, eachMonthOfInterval, 
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDate
} from 'date-fns';
import { es } from 'date-fns/locale';

export default function GarageYearlyView() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState([]);
  const [services, setServices] = useState([]);

  const months = eachMonthOfInterval({
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1))
  });

  useEffect(() => {
    loadData();
  }, [year]);

  async function loadData() {
    setLoading(true);
    try {
      const allComms = await getCommunities();
      const allTasks = await getAllActiveTasks();
      
      // Filter tasks: marked as garage OR belonging to a community of type 'garaje'
      const garageTasks = allTasks.filter(task => {
        if (task.isGarage) return true;
        const comm = allComms.find(c => c.id === task.communityId);
        return comm && comm.type === 'garaje';
      });

      // Group tasks by community
      const communityMap = {};
      garageTasks.forEach(task => {
        if (!communityMap[task.communityId]) {
          const comm = allComms.find(c => c.id === task.communityId);
          if (comm) {
            communityMap[task.communityId] = { ...comm, tasks: [] };
          }
        }
        if (communityMap[task.communityId]) {
          communityMap[task.communityId].tasks.push(task);
        }
      });

      const finalData = Object.values(communityMap).sort((a, b) => a.name.localeCompare(b.name));

      // Load services for the whole year
      const yearStart = startOfYear(new Date(year, 0, 1));
      const yearEnd = endOfYear(new Date(year, 0, 1));
      const allServices = await getScheduledServicesRange(yearStart, yearEnd);
      
      setData(finalData);
      setServices(allServices);
    } catch (err) {
      console.error("Error loading garage yearly data:", err);
    } finally {
      setLoading(false);
    }
  }

  function getMonthContent(task, monthDate) {
    const monthServices = services.filter(s => 
      s.communityTaskId === task.id && 
      isSameMonth(s.scheduledDate.toDate(), monthDate)
    );

    const completed = monthServices.filter(s => s.status === 'completed');
    const pending = monthServices.filter(s => s.status === 'pending');
    
    if (completed.length > 0) {
      return (
        <div className="flex flex-col gap-1 items-center justify-center">
          {completed.map(s => (
            <span key={s.id} className="text-[10px] font-bold text-success bg-success-light px-1 rounded">
              {format(s.scheduledDate.toDate(), 'dd/MM')}
            </span>
          ))}
        </div>
      );
    }

    if (pending.length > 0) {
      return <div className="forecast-dot-sm" title="Tarea programada"></div>;
    }

    // Check for theoretical forecast (prevision) if no services exist in DB
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: mStart, end: mEnd });
    
    const forecastDay = days.find(day => shouldScheduleOnDay(task, day, { isForecasting: true }));

    if (forecastDay) {
      return (
        <div 
          className="forecast-dot-sm" 
          title={`Tarea prevista para el ${format(forecastDay, "d 'de' MMMM", { locale: es })}`}
        ></div>
      );
    }

    return null;
  }


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-10">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-2"></div>
        <p className="text-muted text-sm">Cargando cuadrante anual...</p>
      </div>
    );
  }

  return (
    <div className="card animate-fadeIn" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-header flex items-center justify-between" style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <h3 className="font-bold">🗓️ Cuadrante Anual de Garajes {year}</h3>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(year - 1)}>◀</button>
          <span className="font-bold">{year}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(year + 1)}>▶</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="w-full border-collapse" style={{ minWidth: '1000px' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-light)' }}>
              <th className="text-left p-3 border-b border-r sticky left-0 z-10 bg-inherit" style={{ width: '200px' }}>Comunidad / Garaje</th>
              <th className="text-left p-3 border-b border-r" style={{ width: '150px' }}>Tarea</th>
              {months.map(m => (
                <th key={m.getTime()} className="text-center p-2 border-b border-r text-xs uppercase font-bold text-muted">
                  {format(m, 'MMM', { locale: es })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={14} className="p-10 text-center text-muted">
                  No hay comunidades configuradas como "Garaje"
                </td>
              </tr>
            ) : data.map((garage) => (
              garage.tasks.length === 0 ? (
                <tr key={garage.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 border-b border-r font-semibold sticky left-0 z-10 bg-white">{garage.name}</td>
                  <td className="p-3 border-b border-r text-xs text-muted italic">Sin tareas</td>
                  {months.map(m => <td key={m.getTime()} className="p-2 border-b border-r"></td>)}
                </tr>
              ) : garage.tasks.map((task, idx) => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                  {idx === 0 && (
                    <td 
                      className="p-3 border-b border-r font-semibold sticky left-0 z-10 bg-white" 
                      rowSpan={garage.tasks.length}
                      style={{ verticalAlign: 'top' }}
                    >
                      {garage.name}
                    </td>
                  )}
                  <td className="p-3 border-b border-r text-xs font-semibold text-slate-700">
                    {task.taskName}
                  </td>
                  {months.map(m => (
                    <td key={m.getTime()} className="p-2 border-b border-r text-center align-middle" style={{ height: '50px' }}>
                      {getMonthContent(task, m)}
                    </td>
                  ))}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-slate-50 border-t flex gap-6 text-xs text-muted">
        <div className="flex items-center gap-2">
          <div className="forecast-dot-sm"></div>
          <span>Tarea prevista (Punto Rojo)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-success bg-success-light px-1 rounded">DD/MM</span>
          <span>Tarea realizada (Fecha de ejecución)</span>
        </div>
      </div>
    </div>
  );
}
