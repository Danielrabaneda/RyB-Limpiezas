import { useState, useEffect } from 'react';
import { getMileageReport, recalculateBulk } from '../../services/mileageService';
import { getCheckInsRange } from '../../services/checkInService';
import { getCommunities } from '../../services/communityService';
import { getOperarios } from '../../services/authService';
import { getWorkdaysForAdmin } from '../../services/workdayService';
import { calculateDailyMileage } from '../../services/mileageService';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

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
  const [expandedRow, setExpandedRow] = useState(null);

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
      
      setMileageData(results);
      setExpandedRow(null);
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
            carSessionsByDate[dateStr] = wd.carSessions;
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
      const carSessions = workdays.length > 0 ? (workdays[0].carSessions || []) : [];
      
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
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Operario</th>
                  <th className="text-right">km Total</th>
                  <th className="text-center">Tramos</th>
                  <th className="text-center">⚠️</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mileageData.map((record, idx) => (
                  <>
                    <tr 
                      key={record.id || idx}
                      onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                      className={expandedRow === idx ? 'bg-primary-50' : ''}
                    >
                      <td className="font-semibold text-sm">
                        {format(new Date(record.date), 'dd/MM/yyyy (EEE)', { locale: es })}
                      </td>
                      <td className="text-sm">{record.userName || getOperarioName(record.userId)}</td>
                      <td className="text-right font-semibold" style={{ color: 'var(--color-primary)' }}>
                        {record.totalKm?.toFixed(1)} km
                        {record.type === 'manual' && (
                          <span className="badge badge-warning" style={{ fontSize: '9px', marginLeft: '4px' }}>
                            MANUAL
                          </span>
                        )}
                      </td>
                      <td className="text-center text-sm">{record.totalTramos || 0}</td>
                      <td className="text-center">
                        {record.tramosSospechosos > 0 
                          ? <span className="badge badge-danger">⚠️ {record.tramosSospechosos}</span>
                          : <span className="text-sm text-muted">—</span>
                        }
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => { e.stopPropagation(); handleRecalculateDay(record); }}
                          disabled={recalculating}
                          title="Recalcular este día"
                        >
                          🔄
                        </button>
                      </td>
                    </tr>

                    {/* Detalle expandido */}
                    {expandedRow === idx && (
                      <tr key={`detail-${idx}`}>
                        <td colSpan="6" style={{ padding: 0 }}>
                          <div style={{ 
                            padding: 'var(--space-4)', 
                            background: 'var(--bg-subtle)',
                            borderTop: '2px solid var(--color-primary)',
                            borderBottom: '2px solid var(--color-primary)'
                          }}>
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                              <h4 style={{ fontWeight: 700, fontSize: 'var(--font-md)', marginBottom: 'var(--space-1)' }}>
                                📍 Detalle de ruta — {record.userName} — {format(new Date(record.date), 'dd/MM/yyyy')}
                              </h4>
                              <p className="text-sm text-muted">
                                Total: {record.totalKm?.toFixed(1)} km | {record.type === 'manual' ? 'Registro Manual' : `${record.totalTramos} tramos`} | Versión: {record.version || 1}
                              </p>
                            </div>

                            {record.type === 'manual' ? (
                              <div className="alert alert-warning text-sm">
                                ℹ️ Este kilometraje fue ingresado manualmente por el operario y no dispone de detalle de tramos.
                              </div>
                            ) : (!record.tramos || record.tramos.length === 0) ? (
                              <p className="text-sm text-muted" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
                                Sin tramos registrados este día
                              </p>
                            ) : (
                              <div className="flex flex-col gap-3">
                                {record.tramos.map((tramo, tIdx) => (
                                  <div 
                                    key={tIdx}
                                    style={{
                                      padding: 'var(--space-3)',
                                      borderRadius: 'var(--radius-lg)',
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
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="font-semibold text-sm">
                                        {tIdx + 1}. {tramo.origenNombre} → {tramo.destinoNombre}
                                        {tramo.sospechoso && <span style={{ marginLeft: '0.5rem' }}>⚠️</span>}
                                        {tramo.mismoCentro && <span className="text-xs text-muted" style={{ marginLeft: '0.5rem' }}>(mismo centro)</span>}
                                      </div>
                                    </div>
                                    
                                    {!tramo.mismoCentro && (
                                      <div className="flex gap-4 flex-wrap" style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
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
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}

                {mileageData.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted p-6">
                      Sin datos de kilometraje para este periodo. Los km se calculan automáticamente cuando el operario activa el modo coche y finaliza su jornada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
