import { useState, useEffect } from 'react';
import { getMileageReport, recalculateBulk } from '../../services/mileageService';
import { getCheckInsRange } from '../../services/checkInService';
import { getCommunities } from '../../services/communityService';
import { getOperarios } from '../../services/authService';
import { getWorkdaysForAdmin } from '../../services/workdayService';
import { calculateDailyMileage } from '../../services/mileageService';
import { format, subDays, startOfWeek, endOfWeek, isPast, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getGroupInfo } from '../../utils/dateGrouping';


export default function KilometrajePage() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterOperario, setFilterOperario] = useState('');
  const [filterCommunity, setFilterCommunity] = useState('');

  const [communities, setCommunities] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [mileageData, setMileageData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState(new Set());
  const [expandedDays, setExpandedDays] = useState(new Set());

  // Auto-expand current week on data load
  useEffect(() => {
    if (mileageData.length > 0) {
      const today = new Date();
      const info = getGroupInfo(today);
      const currentWeekKey = info?.groupKey;
      
      const newExpanded = new Set(expandedWeeks);
      if (currentWeekKey) newExpanded.add(currentWeekKey);
      setExpandedWeeks(newExpanded);
      
      // Also expand today
      const todayKey = format(today, 'yyyy-MM-dd');
      const newDays = new Set(expandedDays);
      newDays.add(todayKey);
      setExpandedDays(newDays);
    }
  }, [mileageData.length]);

  useEffect(() => {
    loadBaseData();
  }, []);

  async function loadBaseData() {
    const [comms, ops] = await Promise.all([getCommunities(), getOperarios()]);
    setCommunities(comms);
    setOperarios(ops);
    await loadReport();
  }

  async function loadReport() {
    setLoading(true);
    try {
      const filters = {};
      if (filterOperario) filters.userId = filterOperario;
      
      let results = await getMileageReport(new Date(startDate), new Date(endDate), filters);

      // Filtro por comunidad en memoria
      if (filterCommunity) {
        results = results.filter(r => 
          // Si es manual, lo mostramos si el usuario está filtrado (ya está filtrado por userId arriba)
          // O si no hay filtro de usuario, mostramos todos los manuales + los auto que coincidan
          r.type === 'manual' || 
          r.tramos?.some(t => 
            t.origenId === filterCommunity || t.destinoId === filterCommunity
          )
        );
      }
      
      // Solo mostrar operarios que hayan generado kilómetros
      results = results.filter(r => (r.totalKm || 0) > 0);
      
      setMileageData(results);
    } catch (err) {
      console.error('[Kilometraje] Error cargando informe:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecalculate() {
    if (!filterOperario) {
      alert('Selecciona un operario para recalcular');
      return;
    }
    if (!window.confirm('¿Recalcular el kilometraje del operario seleccionado para este periodo? Esto puede tardar unos segundos.')) return;
    
    setRecalculating(true);
    try {
      const operario = operarios.find(o => o.uid === filterOperario);
      const workdays = await getWorkdaysForAdmin(new Date(startDate), new Date(endDate), filterOperario);
      
      // Build car sessions by date
      const carSessionsByDate = {};
      workdays.forEach(wd => {
        if (wd.carSessions && wd.carSessions.length > 0) {
          const dateStr = wd.date?.toDate ? format(wd.date.toDate(), 'yyyy-MM-dd') : '';
          if (dateStr) {
            if (!carSessionsByDate[dateStr]) carSessionsByDate[dateStr] = [];
            carSessionsByDate[dateStr].push(...wd.carSessions);
          }
        }
      });

      await recalculateBulk(
        new Date(startDate),
        new Date(endDate),
        filterOperario,
        operario?.name || 'Operario',
        carSessionsByDate
      );
      
      await loadReport();
      alert('Recálculo completado');
    } catch (err) {
      console.error('[Kilometraje] Error recalculando:', err);
      alert('Error al recalcular: ' + err.message);
    } finally {
      setRecalculating(false);
    }
  }

  async function handleRecalculateDay(record) {
    if (!window.confirm(`¿Recalcular el día ${record.date} para ${record.userName}?`)) return;
    setRecalculating(true);
    try {
      const workdays = await getWorkdaysForAdmin(new Date(record.date), new Date(record.date), record.userId);
      const carSessions = workdays.reduce((acc, wd) => {
        if (wd.carSessions) acc.push(...wd.carSessions);
        return acc;
      }, []);
      
      await calculateDailyMileage(
        record.userId,
        new Date(record.date),
        record.userName,
        carSessions
      );
      await loadReport();
    } catch (err) {
      alert('Error al recalcular: ' + err.message);
    } finally {
      setRecalculating(false);
    }
  }

  function getOperarioName(id) {
    return operarios.find(o => o.uid === id)?.name || id?.substring(0, 8) + '...';
  }

  // Summary stats
  const totalKm = Math.round(mileageData.reduce((acc, d) => acc + (d.totalKm || 0), 0) * 100) / 100;
  const totalDays = mileageData.length;
  const totalTramos = mileageData.reduce((acc, d) => acc + (d.totalTramos || 0), 0);
  const totalSospechosos = mileageData.reduce((acc, d) => acc + (d.tramosSospechosos || 0), 0);

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

  // Hierarchical Grouping (Week/Month/Year -> Day -> Operario)
  const hierarchicalData = (() => {
    const groups = {};

    const parseDate = (d) => d?.toDate ? d.toDate() : new Date(d);

    const initOp = (groupKey, groupInfo, dayKey, opId, opName) => {
      if (!groups[groupKey]) {
        groups[groupKey] = {
          weekId: groupKey, // Keep weekId to minimize JSX changes
          id: groupKey,
          label: groupInfo.label,
          subLabel: groupInfo.subLabel,
          type: groupInfo.type,
          isCurrent: groupInfo.isCurrent,
          isComplete: !groupInfo.isCurrent,
          sortDate: groupInfo.sortDate,
          days: {},
          stats: { totalKm: 0, totalTramos: 0, tramosSospechosos: 0, count: 0 }
        };
      }
      if (!groups[groupKey].days[dayKey]) {
        const dayDate = new Date(dayKey);
        groups[groupKey].days[dayKey] = {
          dayId: dayKey,
          label: format(dayDate, "EEEE d 'de' MMMM", { locale: es }),
          date: dayDate,
          operators: {},
          stats: { totalKm: 0, totalTramos: 0, tramosSospechosos: 0, count: 0 }
        };
      }
      if (!groups[groupKey].days[dayKey].operators[opId]) {
        groups[groupKey].days[dayKey].operators[opId] = {
          opId,
          name: opName,
          records: [],
          stats: { totalKm: 0 }
        };
      }
      return groups[groupKey].days[dayKey].operators[opId];
    };

    mileageData.forEach(record => {
      const date = parseDate(record.date);
      if (!date || isNaN(date.getTime())) return;
      
      const info = getGroupInfo(date);
      if (!info) return;

      const groupKey = info.groupKey;
      const dayKey = format(date, 'yyyy-MM-dd');
      const opId = record.userId;
      const opName = record.userName || getOperarioName(opId);

      const op = initOp(groupKey, info, dayKey, opId, opName);
      op.records.push(record);
      const km = record.totalKm || 0;
      op.stats.totalKm += km;
      
      groups[groupKey].stats.totalKm += km;
      groups[groupKey].stats.totalTramos += (record.totalTramos || 0);
      groups[groupKey].stats.tramosSospechosos += (record.tramosSospechosos || 0);
      groups[groupKey].stats.count++;
      
      groups[groupKey].days[dayKey].stats.totalKm += km;
      groups[groupKey].days[dayKey].stats.totalTramos += (record.totalTramos || 0);
      groups[groupKey].days[dayKey].stats.tramosSospechosos += (record.tramosSospechosos || 0);
      groups[groupKey].days[dayKey].stats.count++;
    });

    return Object.values(groups)
      .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
      .map(group => ({
        ...group,
        days: Object.values(group.days)
          .sort((a, b) => b.dayId.localeCompare(a.dayId))
          .map(day => ({
            ...day,
            operators: Object.values(day.operators).sort((a, b) => a.name.localeCompare(b.name))
          }))
      }));
  })();

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
              🚗
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700, textTransform: 'capitalize' }}>{day.label}</h3>
              {isRecent && <span className="text-xs text-accent font-bold">Esta Semana</span>}
            </div>
          </div>
          <div className="day-stats flex gap-4 text-sm font-semibold">
            <span title="Km Totales" style={{ color: 'var(--color-primary)' }}>
              📏 {day.stats.totalKm.toFixed(1)} km
            </span>
            {day.stats.tramosSospechosos > 0 && (
              <span title="Tramos Sospechosos" className="text-danger">
                ⚠️ {day.stats.tramosSospechosos}
              </span>
            )}
            <span style={{ color: 'var(--text-muted)' }}>{isExpanded ? '🔽' : '▶️'}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="day-content mt-2 ml-2 flex flex-col gap-4 p-4 bg-white rounded-lg border border-gray-100 shadow-inner">
            {day.operators.map(op => (
              <div key={op.opId} className="operator-block border-b last:border-0 pb-4 last:pb-0">
                {op.records.map((record, rIdx) => (
                  <div key={record.id || rIdx} className="mb-2">
                    <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                      <h4 className="font-bold text-primary flex items-center gap-2" style={{ margin: 0 }}>
                        👤 {op.name}
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm" style={{ color: 'var(--color-primary)', fontSize: 'var(--font-md)' }}>
                          {record.totalKm?.toFixed(1)} km
                        </span>
                        {record.type === 'manual' && (
                          <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                            MANUAL
                          </span>
                        )}
                        {record.tramosSospechosos > 0 && (
                          <span className="badge badge-danger" style={{ fontSize: '10px' }}>
                            ⚠️ {record.tramosSospechosos}
                          </span>
                        )}
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => { e.stopPropagation(); handleRecalculateDay(record); }}
                          disabled={recalculating}
                          title="Recalcular este día"
                          style={{ padding: '2px 6px' }}
                        >
                          🔄
                        </button>
                      </div>
                    </div>

                    {/* Route detail */}
                    <div style={{ 
                      padding: 'var(--space-4)', 
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      borderLeft: '4px solid var(--color-primary)'
                    }}>
                      <div style={{ marginBottom: 'var(--space-3)' }} className="flex justify-between items-center flex-wrap gap-2">
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                          {record.type === 'manual' ? 'Registro Manual' : `${record.totalTramos || 0} tramos`} | Versión: {record.version || 1}
                        </p>
                      </div>

                      {record.type === 'manual' ? (
                        <div className="alert alert-warning text-xs mb-0" style={{ padding: 'var(--space-2) var(--space-3)' }}>
                          ℹ️ Este kilometraje fue ingresado manualmente por el operario y no dispone de detalle de tramos.
                        </div>
                      ) : (!record.tramos || record.tramos.length === 0) ? (
                        <p className="text-xs text-muted mb-0" style={{ textAlign: 'center' }}>
                          Sin tramos registrados este día
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {record.tramos.map((tramo, tIdx) => (
                            <div 
                              key={tIdx}
                              style={{
                                padding: 'var(--space-2) var(--space-3)',
                                borderRadius: 'var(--radius-md)',
                                background: tramo.sospechoso 
                                  ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' 
                                  : tramo.mismoCentro 
                                    ? '#f1f5f9'
                                    : 'white',
                                border: tramo.sospechoso 
                                  ? '1px solid #fca5a5' 
                                  : '1px solid var(--border-light)',
                                opacity: tramo.mismoCentro ? 0.6 : 1
                              }}
                            >
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="font-semibold text-xs text-gray-800">
                                  {tIdx + 1}. {tramo.origenNombre} → {tramo.destinoNombre}
                                  {tramo.sospechoso && <span style={{ marginLeft: '0.5rem' }}>⚠️</span>}
                                  {tramo.mismoCentro && <span className="text-[10px] text-muted" style={{ marginLeft: '0.5rem' }}>(mismo centro)</span>}
                                  {tramo.esCaminando && <span className="badge badge-success" style={{ marginLeft: '0.5rem', background: '#dcfce7', color: '#166534', fontSize: '9px', padding: '1px 4px' }}>🚶 Caminando</span>}
                                  {!tramo.mismoCentro && !tramo.esCaminando && !tramo.enCoche && <span className="badge badge-neutral" style={{ marginLeft: '0.5rem', background: '#e2e8f0', color: '#475569', fontSize: '9px', padding: '1px 4px' }}>❌ Sin coche</span>}
                                </div>
                              </div>
                              
                              {!tramo.mismoCentro && !tramo.esCaminando && (
                                <div className="flex gap-3 flex-wrap mt-1 text-[10px] text-muted">
                                  <span>
                                    🕐 {tramo.horaSalida?.toDate 
                                      ? format(tramo.horaSalida.toDate(), 'HH:mm')
                                      : '??'} → {tramo.horaLlegada?.toDate 
                                      ? format(tramo.horaLlegada.toDate(), 'HH:mm') 
                                      : '??'} ({tramo.minutosDesplazamiento} min)
                                  </span>
                                  <span>📏 {tramo.kmEstimados?.toFixed(1)} km</span>
                                  <span>🚗 ~{tramo.velocidadEstimada?.toFixed(0)} km/h</span>
                                  {tramo.sospechoso && (
                                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                                      ⚠️ SOSPECHOSO
                                    </span>
                                  )}
                                </div>
                              )}

                              {tramo.esCaminando && (
                                <div className="text-[10px] text-muted mt-0.5">
                                  Distancia muy corta ({Math.round(tramo.kmLineaRecta * 1000)}m). Se asume desplazamiento a pie.
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>🚗 Kilometraje</h2>

      {/* Filters */}
      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">Desde</label>
          <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Hasta</label>
          <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Operario</label>
          <select className="form-select" value={filterOperario} onChange={e => setFilterOperario(e.target.value)}>
            <option value="">Todos</option>
            {operarios.map(o => <option key={o.uid} value={o.uid}>{o.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Centro</label>
          <select className="form-select" value={filterCommunity} onChange={e => setFilterCommunity(e.target.value)}>
            <option value="">Todos</option>
            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={loadReport}>🔍 Filtrar</button>
        {filterOperario && (
          <button 
            className="btn btn-outline" 
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            {recalculating ? '⏳ Recalculando...' : '🔄 Recalcular periodo'}
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-primary)' }}>{totalKm.toFixed(1)}</div>
          <div className="stat-label">km totales</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalDays}</div>
          <div className="stat-label">Días con registro</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalTramos}</div>
          <div className="stat-label">Tramos recorridos</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalSospechosos > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {totalSospechosos > 0 ? `⚠️ ${totalSospechosos}` : '✅ 0'}
          </div>
          <div className="stat-label">Tramos sospechosos</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-6"><div className="spinner"></div></div>
      ) : (
        <div className="hierarchical-reports">
          {hierarchicalData.map(week => {
            const isCurrentWeek = week.isCurrent;

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
                        {week.type === 'year' ? '🗓️' : week.type === 'month' ? '📅' : (expandedWeeks.has(week.weekId) ? '📂' : '📁')}
                      </div>
                      <div>
                        <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700 }}>{week.label}</h3>
                        <span className="text-xs text-muted">{week.subLabel}</span>
                      </div>
                    </div>
                    <div className="week-stats flex gap-4 text-sm font-semibold">
                      <span title="Días con Registro" style={{ color: 'var(--color-primary)' }}>
                        📅 {week.stats.count} registros
                      </span>
                      <span title="Km Totales" style={{ color: 'var(--color-accent)' }}>
                        📏 {week.stats.totalKm.toFixed(1)} km
                      </span>
                      {week.stats.tramosSospechosos > 0 && (
                        <span title="Tramos Sospechosos" className="text-danger">
                          ⚠️ {week.stats.tramosSospechosos}
                        </span>
                      )}
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
              📭 Sin datos de kilometraje para este periodo. Los km se calculan automáticamente cuando el operario activa el modo coche y finaliza su jornada.
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="card mt-6" style={{ 
        background: 'var(--bg-subtle)', 
        borderLeft: '4px solid var(--color-primary)',
        padding: 'var(--space-4)' 
      }}>
        <h4 className="font-bold text-sm mb-2">ℹ️ ¿Cómo funciona?</h4>
        <ul style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', listStyle: 'disc', paddingLeft: '1.5rem', lineHeight: 1.8 }}>
          <li>El operario activa el <strong>modo coche 🚗</strong> desde su app cuando va en coche.</li>
          <li>Al finalizar jornada, el sistema calcula automáticamente la distancia entre centros visitados.</li>
          <li>Las distancias se estiman con <strong>Haversine × 1.3</strong> (factor carretera).</li>
          <li>Los tramos con <strong>velocidad imposible (&gt;150 km/h)</strong> se marcan como sospechosos.</li>
          <li>Solo se cuentan los fichajes realizados <strong>mientras el modo coche estaba activo</strong>.</li>
          <li>Puedes <strong>recalcular</strong> cualquier día si se corrigieron fichajes.</li>
        </ul>
      </div>
    </div>
  );
}
