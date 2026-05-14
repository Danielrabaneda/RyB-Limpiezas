import { useState, useEffect } from 'react';
import { getWorkdaysForAdmin, deleteWorkday, updateWorkdayTimes } from '../../services/workdayService';
import { getAllUsers } from '../../services/authService';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isPast, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDecimalHours, formatMinutes } from '../../utils/formatTime';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function ControlHorarioPage() {
  const [workdays, setWorkdays] = useState([]);
  const [users, setUsers] = useState([]);
  const [expandedWeeks, setExpandedWeeks] = useState(new Set());
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    userId: ''
  });
  const [editingWorkday, setEditingWorkday] = useState(null); // { id, startTime, endTime }
  const [editForm, setEditForm] = useState({ startTime: '', endTime: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // Auto-expand current week on data load
  useEffect(() => {
    if (workdays.length > 0) {
      const today = new Date();
      const start = startOfWeek(today, { weekStartsOn: 1 });
      const end = endOfWeek(today, { weekStartsOn: 1 });
      const currentWeekKey = `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`;
      
      const newExpanded = new Set(expandedWeeks);
      newExpanded.add(currentWeekKey);
      setExpandedWeeks(newExpanded);
      
      // Also expand today
      const todayKey = format(today, 'yyyy-MM-dd');
      const newDays = new Set(expandedDays);
      newDays.add(todayKey);
      setExpandedDays(newDays);
    }
  }, [workdays.length]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadWorkdays();
  }, [filters, users]); 

  async function loadInitialData() {
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  async function loadWorkdays() {
    setLoading(true);
    try {
      const data = await getWorkdaysForAdmin(
        new Date(filters.startDate),
        new Date(filters.endDate),
        filters.userId || null
      );
      
      const enriched = data.map(wd => {
        const u = users.find(o => o.uid === wd.userId);
        return { ...wd, operarioName: u ? u.name : 'Desconocido' };
      });
      
      setWorkdays(enriched);
    } catch (err) {
      console.error('Error loading workdays:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteWorkday = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) {
      try {
        await deleteWorkday(id);
        setWorkdays(prev => prev.filter(wd => wd.id !== id));
      } catch (err) {
        alert('Error al eliminar el registro');
      }
    }
  };

  const handleOpenEdit = (wd) => {
    const start = wd.startTime?.toDate ? wd.startTime.toDate() : new Date(wd.startTime);
    const end = wd.endTime?.toDate ? wd.endTime.toDate() : (wd.status === 'active' ? new Date() : new Date());
    
    setEditingWorkday(wd);
    setEditForm({
      startTime: format(start, "yyyy-MM-dd'T'HH:mm"),
      endTime: format(end, "yyyy-MM-dd'T'HH:mm")
    });
  };

  const handleSaveEdit = async () => {
    if (!editingWorkday) return;
    setActionLoading(true);
    try {
      await updateWorkdayTimes(
        editingWorkday.id,
        new Date(editForm.startTime),
        new Date(editForm.endTime)
      );
      setEditingWorkday(null);
      await loadWorkdays();
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const staleWorkdays = workdays.filter(wd => {
    if (wd.status !== 'active') return false;
    const date = wd.date?.toDate ? wd.date.toDate() : new Date(wd.startTime);
    return !isSameDay(date, new Date()) && isPast(date);
  });

  const handleExportPDF = () => {
    if (!filters.userId) {
      alert('Por favor, selecciona un operario primero para generar su informe detallado de firmas.');
      return;
    }
    const operario = users.find(u => u.uid === filters.userId);
    const operarioName = operario ? (operario.name || operario.email) : 'Operario';
    
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138); // Primary color
    doc.text('RyB Limpiezas', 14, 20);
    
    doc.setFontSize(16);
    doc.setTextColor(100);
    doc.text('Control Horario de Operario', 14, 30);
    
    // Info
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Operario: ${operarioName}`, 14, 45);
    doc.text(`Período: ${format(new Date(filters.startDate), 'dd/MM/yyyy')} al ${format(new Date(filters.endDate), 'dd/MM/yyyy')}`, 14, 52);
    doc.text(`Fecha de emisión: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 59);
    
    // Table
    // Agrupamos por día para el PDF (sumar sesiones del mismo día)
    const dailyGrouped = {};
    workdays.forEach(wd => {
      const dayKey = safeFormatDate(wd.date, 'yyyy-MM-dd');
      if (!dailyGrouped[dayKey]) {
        dailyGrouped[dayKey] = {
          date: wd.date,
          totalMinutes: 0,
          sessions: []
        };
      }
      dailyGrouped[dayKey].totalMinutes += (wd.totalMinutes || 0);
      dailyGrouped[dayKey].sessions.push(wd);
    });

    const sortedDays = Object.values(dailyGrouped).sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return dateA - dateB;
    });

    const tableData = sortedDays.map(day => [
      safeFormatDate(day.date),
      day.sessions.map(s => safeFormatDate(s.startTime, 'HH:mm')).join(', '),
      day.sessions.map(s => safeFormatDate(s.endTime, 'HH:mm')).join(', '),
      formatMinutes(day.totalMinutes)
    ]);
    
    doc.autoTable({
      startY: 70,
      head: [['Fecha', 'Inicio', 'Fin', 'Duración']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillStyle: 'fill', fillColor: [37, 99, 235] }, // Accent color
    });
    
    // Totals
    const totalMinutesSum = workdays.reduce((acc, wd) => acc + (wd.totalMinutes || 0), 0);
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Tiempo Total Formateado: ${formatMinutes(totalMinutesSum)}`, 14, finalY);
    
    // Signature lines
    const midY = finalY + 30;
    doc.setDrawColor(200);
    doc.line(14, midY, 80, midY);
    doc.line(120, midY, 190, midY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Firma de la Empresa', 14, midY + 7);
    doc.text('Firma del Operario', 120, midY + 7);
    
    // Footer notice
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Este documento sirve como registro oficial de las jornadas realizadas en el período indicado.', 14, doc.internal.pageSize.height - 10);
    
    doc.save(`Control_Horario_${operarioName.replace(/\s+/g, '_')}_${filters.startDate}.pdf`);
  };



  const totalMinutes = workdays.reduce((acc, current) => acc + (current.totalMinutes || 0), 0);
  
  const toggleWeek = (id) => {
    const newSet = new Set(expandedWeeks);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedWeeks(newSet);
  };

  const toggleDay = (id) => {
    const newSet = new Set(expandedDays);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedDays(newSet);
  };

  // Hierarchical Grouping (Week -> Day -> Operario)
  const hierarchicalData = (() => {
    const groups = {};

    const getWeekKey = (date) => {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = endOfWeek(date, { weekStartsOn: 1 });
      return `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`;
    };

    const parseDate = (d) => d?.toDate ? d.toDate() : new Date(d);

    const initOp = (weekKey, dayKey, opId, opName) => {
      if (!groups[weekKey]) {
        const [startStr, endStr] = weekKey.split('_');
        const startDateObj = new Date(startStr);
        const endDateObj = new Date(endStr);
        groups[weekKey] = {
          weekId: weekKey,
          label: `Semana ${format(startDateObj, 'dd/MM')} - ${format(endDateObj, 'dd/MM')}`,
          days: {},
          stats: { minutes: 0, count: 0 },
          isComplete: isPast(endDateObj) && !isSameDay(endDateObj, new Date())
        };
      }
      if (!groups[weekKey].days[dayKey]) {
        const dayDate = new Date(dayKey);
        groups[weekKey].days[dayKey] = {
          dayId: dayKey,
          label: format(dayDate, "EEEE d 'de' MMMM", { locale: es }),
          date: dayDate,
          operators: {},
          stats: { minutes: 0, count: 0 }
        };
      }
      if (!groups[weekKey].days[dayKey].operators[opId]) {
        groups[weekKey].days[dayKey].operators[opId] = {
          opId,
          name: opName,
          sessions: [],
          stats: { minutes: 0 }
        };
      }
      return groups[weekKey].days[dayKey].operators[opId];
    };

    workdays.forEach(wd => {
      const date = parseDate(wd.date);
      if (!date || isNaN(date.getTime())) return;
      const weekKey = getWeekKey(date);
      const dayKey = format(date, 'yyyy-MM-dd');
      const opId = wd.userId;
      const opName = wd.operarioName || wd.userName || 'Desconocido';

      const op = initOp(weekKey, dayKey, opId, opName);
      op.sessions.push(wd);
      const mins = wd.totalMinutes || 0;
      op.stats.minutes += mins;
      
      groups[weekKey].stats.minutes += mins;
      groups[weekKey].stats.count++;
      groups[weekKey].days[dayKey].stats.minutes += mins;
      groups[weekKey].days[dayKey].stats.count++;
    });

    return Object.values(groups)
      .sort((a, b) => b.weekId.localeCompare(a.weekId))
      .map(week => ({
        ...week,
        days: Object.values(week.days)
          .sort((a, b) => b.dayId.localeCompare(a.dayId))
          .map(day => ({
            ...day,
            operators: Object.values(day.operators).sort((a, b) => a.name.localeCompare(b.name))
          }))
      }));
  })();

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const totalMinutesSum = workdays.reduce((acc, current) => acc + (current.totalMinutes || 0), 0);

  const safeFormatDate = (dateVal, formatStr = 'dd/MM/yyyy') => {
    try {
      if (!dateVal) return '-';
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      // Validar si la fecha es válida
      if (isNaN(d.getTime())) return '-';
      return format(d, formatStr);
    } catch (e) {
      return '-';
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="card mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Operario</label>
            <select 
              name="userId" 
              className="input" 
              value={filters.userId} 
              onChange={handleFilterChange}
            >
              <option value="">Todos los registrados</option>
              {Array.isArray(users) && users.map(u => (
                <option key={u.uid} value={u.uid}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">Desde</label>
            <input 
              type="date" 
              name="startDate" 
              className="input" 
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">Hasta</label>
            <input 
              type="date" 
              name="endDate" 
              className="input" 
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="flex-none">
            <button 
              onClick={handleExportPDF}
              className="btn btn-primary"
              style={{ 
                height: '42px', 
                background: 'var(--color-accent)', 
                borderColor: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
              }}
              title="Descargar registro en PDF"
            >
              <span style={{ fontSize: '1.2rem' }}>📄</span> 
              <span>GENERAR PDF</span>
            </button>
          </div>
        </div>
      </div>

      {staleWorkdays.length > 0 && (
        <div 
          className="mb-6 p-4 rounded-xl flex flex-col gap-3"
          style={{ 
            background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
            border: '1px solid #fb923c',
            boxShadow: '0 4px 12px rgba(251, 146, 60, 0.15)'
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h4 className="font-bold text-orange-800">ATENCIÓN: Jornadas sin cerrar</h4>
              <p className="text-sm text-orange-700">
                Hay {staleWorkdays.length} jornada(s) que siguen abiertas desde días anteriores. 
                Los operarios verán un aviso al entrar hoy, pero puedes cerrarlas manualmente editando la hora de fin.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {staleWorkdays.map(sw => (
              <span key={sw.id} className="badge badge-warning text-[10px]">
                {sw.operarioName} ({safeFormatDate(sw.date)})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-2 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon blue">🔢</div>
          <div className="stat-value">{workdays.length}</div>
          <div className="stat-label">Total Sesiones</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">⏱️</div>
          <div className="stat-value">{formatMinutes(totalMinutesSum)}</div>
          <div className="stat-label">Horas Totales</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><div className="spinner"></div></div>
      ) : (
        <div className="hierarchical-reports">
          {hierarchicalData.map(week => {
            const isCurrentWeek = !week.isComplete;

            if (isCurrentWeek) {
              // Show days of current week directly
              return week.days.map(day => renderDayRow(day, true));
            } else {
              // Show collapsed week
              return (
                <div key={week.weekId} className="week-card mb-4">
                  <div 
                    className={`week-header card ${expandedWeeks.has(week.weekId) ? 'expanded' : ''}`}
                    onClick={() => toggleWeek(week.weekId)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      background: 'var(--color-bg-input)',
                      borderLeft: expandedWeeks.has(week.weekId) ? '4px solid var(--color-accent)' : '1px solid var(--color-border)',
                      padding: 'var(--space-4)'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="week-icon" style={{ fontSize: '1.2rem' }}>
                        {expandedWeeks.has(week.weekId) ? '📂' : '📁'}
                      </div>
                      <div>
                        <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700 }}>{week.label}</h3>
                        <span className="text-xs text-muted">Semana Finalizada</span>
                      </div>
                    </div>
                    <div className="week-stats flex gap-4 text-sm font-semibold">
                      <span title="Sesiones" style={{ color: 'var(--color-primary)' }}>
                        🔢 {week.stats.count} registros
                      </span>
                      <span title="Horas Totales" style={{ color: 'var(--color-accent)' }}>
                        ⏱️ {formatMinutes(week.stats.minutes)}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{expandedWeeks.has(week.weekId) ? '🔽' : '▶️'}</span>
                    </div>
                  </div>

                  {expandedWeeks.has(week.weekId) && (
                    <div className="week-content mt-2 ml-4 flex flex-col gap-2">
                      {week.days.map(day => renderDayRow(day, false))}
                    </div>
                  )}
                </div>
              );
            }
          })}

          {hierarchicalData.length === 0 && (
            <div className="card text-center p-12 text-muted italic">
              📭 No hay registros de control horario en este rango.
            </div>
          )}
        </div>
      )}
    </div>
  );

  function renderDayRow(day, isRecent = false) {
    const isExpanded = expandedDays.has(day.dayId);
    return (
      <div key={day.dayId} className="day-card mb-3">
        <div 
          className={`day-header card ${isExpanded ? 'expanded' : ''}`}
          onClick={() => toggleDay(day.dayId)}
          style={{ 
            padding: 'var(--space-4)',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            cursor: 'pointer',
            background: 'white',
            boxShadow: 'var(--shadow-md)',
            borderRadius: 'var(--radius-lg)',
            borderLeft: isExpanded ? '6px solid var(--color-accent)' : (isRecent ? '4px solid #e2e8f0' : '1px solid var(--color-border)')
          }}
        >
          <div className="flex items-center gap-3">
            <div className="day-icon" style={{ fontSize: '1.2rem', background: 'var(--color-bg)', padding: '8px', borderRadius: '50%' }}>
              🕒
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700, textTransform: 'capitalize' }}>{day.label}</h3>
              {isRecent && <span className="text-xs text-accent font-bold">Esta Semana</span>}
            </div>
          </div>
          <div className="day-stats flex gap-4 text-sm font-semibold">
            <span title="Horas Totales" style={{ color: 'var(--color-accent)' }}>
              ⏱️ {formatMinutes(day.stats.minutes)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{isExpanded ? '🔽' : '▶️'}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="day-content mt-2 ml-2 flex flex-col gap-4 p-4 bg-white rounded-lg border border-gray-100 shadow-inner">
            {day.operators.map(op => (
              <div key={op.opId} className="operator-block border-b last:border-0 pb-4 last:pb-0">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-bold text-primary flex items-center gap-2">
                    👤 {op.name}
                  </h4>
                  <span className="badge badge-primary">Total: {formatMinutes(op.stats.minutes)}</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="table table-sm" style={{ minWidth: '600px' }}>
                    <thead>
                      <tr>
                        <th>Inicio</th>
                        <th>Fin</th>
                        <th>Duración</th>
                        <th>Estado</th>
                        <th className="text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {op.sessions.map(wd => (
                        <tr key={wd.id} className="text-sm">
                          <td>{safeFormatDate(wd.startTime, 'HH:mm')}</td>
                          <td>{safeFormatDate(wd.endTime, 'HH:mm')}</td>
                          <td className="font-bold text-accent">{formatMinutes(wd.totalMinutes || 0)}</td>
                          <td>
                            <div className="flex flex-col gap-1">
                              <span 
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-center"
                                style={{ 
                                  backgroundColor: wd.status === 'active' ? '#fff7ed' : '#f0fdf4',
                                  color: wd.status === 'active' ? '#c2410c' : '#15803d',
                                  border: `1px solid ${wd.status === 'active' ? '#ffedd5' : '#dcfce7'}`
                                }}
                              >
                                {wd.status === 'active' ? '● En curso' : '✓ Finalizada'}
                              </span>
                              {wd.autoClosed && (
                                <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                  ⚠️ Auto-cerrada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleOpenEdit(wd)}
                                className="text-primary hover:scale-110 transition-transform p-1"
                                title="Editar jornada"
                              >
                                ✏️
                              </button>
                              <button 
                                onClick={() => handleDeleteWorkday(wd.id)}
                                className="text-danger hover:scale-110 transition-transform p-1"
                                title="Eliminar sesión"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* ... (rest of main div remains same) */}
      
      {/* MODAL EDICIÓN */}
      {editingWorkday && (
        <div className="modal-overlay">
          <div className="modal-content animate-scaleIn" style={{ maxWidth: '450px' }}>
            <h3 className="font-bold text-xl mb-4 border-b pb-2 flex items-center gap-2">
              ✏️ Editar Jornada - {editingWorkday.operarioName}
            </h3>
            
            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="label">Hora de Inicio</label>
                <input 
                  type="datetime-local"
                  className="input"
                  value={editForm.startTime}
                  onChange={(e) => setEditForm(prev => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Hora de Fin</label>
                <input 
                  type="datetime-local"
                  className="input"
                  value={editForm.endTime}
                  onChange={(e) => setEditForm(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>
              {editingWorkday.autoClosed && (
                <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg italic">
                  ℹ️ Esta jornada fue cerrada automáticamente por el sistema.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                className="btn btn-ghost"
                onClick={() => setEditingWorkday(null)}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleSaveEdit}
                disabled={actionLoading}
                style={{ background: 'var(--color-accent)' }}
              >
                {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}
