import { useState, useEffect } from 'react';
import { getScheduledServicesRange, updateScheduledServiceStatus, deleteScheduledService } from '../../services/scheduleService';
import { getCheckInsRange, deleteCheckIn } from '../../services/checkInService';
import { getCommunities } from '../../services/communityService';
import { getOperarios } from '../../services/authService';
import { transferService } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import { format, subDays, startOfWeek, endOfWeek, getWeek, isPast, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDecimalHours, formatMinutes } from '../../utils/formatTime';

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterCommunity, setFilterCommunity] = useState('');
  const [filterOperario, setFilterOperario] = useState('');
  const [appliedCommunity, setAppliedCommunity] = useState('');
  const [activeTab, setActiveTab] = useState('hierarchical');
  const [expandedWeeks, setExpandedWeeks] = useState(new Set());
  const [expandedDays, setExpandedDays] = useState(new Set());

  const [communities, setCommunities] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [services, setServices] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Auto-expand current week on data load
  useEffect(() => {
    if (services.length > 0 || checkIns.length > 0) {
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
  }, [services.length, checkIns.length]);
  
  // Transfer & Bulk Actions state
  const [transferModal, setTransferModal] = useState({ open: false, service: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedServices, setSelectedServices] = useState(new Set());

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
      if (filterCommunity) filters.communityId = filterCommunity;
      if (filterOperario) filters.userId = filterOperario;

      setAppliedCommunity(filterCommunity);

      const [svcs, chks] = await Promise.all([
        getScheduledServicesRange(new Date(startDate), new Date(endDate), filters),
        getCheckInsRange(new Date(startDate), new Date(endDate), filters),
      ]);
      
      // Sort newest first
      setServices(svcs.sort((a, b) => {
        const dateA = a.scheduledDate?.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
        const dateB = b.scheduledDate?.toDate ? b.scheduledDate.toDate() : new Date(b.scheduledDate);
        return dateB - dateA;
      }));
      setCheckIns(chks.sort((a, b) => {
        const dateA = a.checkInTime?.toDate ? a.checkInTime.toDate() : new Date(a.checkInTime);
        const dateB = b.checkInTime?.toDate ? b.checkInTime.toDate() : new Date(b.checkInTime);
        return dateB - dateA;
      }));
      
      setSelectedServices(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalServices = services.length;
  const completedServices = services.filter(s => s.status === 'completed').length;
  const missedServices = services.filter(s => s.status === 'missed').length;
  const pendingServices = services.filter(s => s.status === 'pending').length;
  const totalMinutes = checkIns.reduce((acc, c) => acc + (c.durationMinutes || 0), 0);

  // Group by community
  const byCommunity = {};
  services.forEach(s => {
    if (!byCommunity[s.communityId]) byCommunity[s.communityId] = { total: 0, completed: 0, minutes: 0 };
    byCommunity[s.communityId].total++;
    if (s.status === 'completed') byCommunity[s.communityId].completed++;
  });
  checkIns.forEach(c => {
    if (!byCommunity[c.communityId]) byCommunity[c.communityId] = { total: 0, completed: 0, minutes: 0 };
    byCommunity[c.communityId].minutes += (c.durationMinutes || 0);
  });

  // Group by operario
  const byOperario = {};
  services.forEach(s => {
    if (!byOperario[s.assignedUserId]) byOperario[s.assignedUserId] = { total: 0, completed: 0, minutes: 0 };
    byOperario[s.assignedUserId].total++;
    if (s.status === 'completed') byOperario[s.assignedUserId].completed++;
  });
  checkIns.forEach(c => {
    if (!byOperario[c.userId]) byOperario[c.userId] = { total: 0, completed: 0, minutes: 0 };
    byOperario[c.userId].minutes += (c.durationMinutes || 0);
  });

  // Daily Breakdown
  const breakdownByDay = {};
  let totalBreakdownMinutes = 0;
  checkIns.forEach(c => {
    if (!c.checkInTime) return;
    const day = format(c.checkInTime.toDate(), 'yyyy-MM-dd');
    if (!breakdownByDay[day]) {
      breakdownByDay[day] = { totalMinutes: 0, entries: [] };
    }
    const mins = c.durationMinutes || 0;
    breakdownByDay[day].totalMinutes += mins;
    breakdownByDay[day].entries.push(c);
    totalBreakdownMinutes += mins;
  });

  // Hierarchical Grouping (Week -> Day -> Operario)
  const hierarchicalData = (() => {
    const groups = {};

    const getWeekKey = (date) => {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = endOfWeek(date, { weekStartsOn: 1 });
      return `${format(start, 'yyyy-MM-dd')}_${format(end, 'yyyy-MM-dd')}`;
    };

    const initOp = (weekKey, dayKey, opId) => {
      if (!groups[weekKey]) {
        const [startStr, endStr] = weekKey.split('_');
        const startDateObj = parseISO(startStr);
        const endDateObj = parseISO(endStr);
        groups[weekKey] = {
          weekId: weekKey,
          label: `Semana ${format(startDateObj, 'dd/MM')} - ${format(endDateObj, 'dd/MM')}`,
          days: {},
          stats: { totalServices: 0, completed: 0, minutes: 0 },
          isComplete: isPast(endDateObj)
        };
      }
      if (!groups[weekKey].days[dayKey]) {
        const dayDate = parseISO(dayKey);
        groups[weekKey].days[dayKey] = {
          dayId: dayKey,
          label: format(dayDate, "EEEE d 'de' MMMM", { locale: es }),
          date: dayDate,
          operators: {},
          stats: { totalServices: 0, completed: 0, minutes: 0 }
        };
      }
      if (!groups[weekKey].days[dayKey].operators[opId]) {
        groups[weekKey].days[dayKey].operators[opId] = {
          opId,
          name: getOperarioName(opId),
          services: [],
          checkIns: [],
          stats: { totalServices: 0, completed: 0, minutes: 0 }
        };
      }
      return groups[weekKey].days[dayKey].operators[opId];
    };

    services.forEach(s => {
      const date = s.scheduledDate?.toDate?.() || (s.scheduledDate ? new Date(s.scheduledDate) : null);
      if (!date) return;
      const weekKey = getWeekKey(date);
      const dayKey = format(date, 'yyyy-MM-dd');
      const opId = s.assignedUserId;

      const op = initOp(weekKey, dayKey, opId);
      op.services.push(s);
      op.stats.totalServices++;
      if (s.status === 'completed') op.stats.completed++;
      
      groups[weekKey].stats.totalServices++;
      if (s.status === 'completed') groups[weekKey].stats.completed++;
      groups[weekKey].days[dayKey].stats.totalServices++;
      if (s.status === 'completed') groups[weekKey].days[dayKey].stats.completed++;
    });

    checkIns.forEach(c => {
      const date = c.checkInTime?.toDate?.() || (c.checkInTime ? new Date(c.checkInTime) : null);
      if (!date) return;
      const weekKey = getWeekKey(date);
      const dayKey = format(date, 'yyyy-MM-dd');
      const opId = c.userId;

      const op = initOp(weekKey, dayKey, opId);
      op.checkIns.push(c);
      const mins = c.durationMinutes || 0;
      op.stats.minutes += mins;
      groups[weekKey].stats.minutes += mins;
      groups[weekKey].days[dayKey].stats.minutes += mins;
    });

    // Convert to sorted array
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

  function renderDayOperators(day) {
    if (day.operators.length === 0) {
      return <p className="text-center text-muted text-sm py-2">Sin actividad registrada</p>;
    }

    return day.operators.map(op => (
      <div key={op.opId} className="operator-detail pb-3 border-bottom last:border-0" style={{ borderBottom: '1px solid var(--color-bg)' }}>
        <div className="flex justify-between items-center mb-3">
          <h5 className="font-bold text-sm text-primary flex items-center gap-2">
            👤 {op.name}
          </h5>
          <div className="flex gap-2">
            <span className="badge badge-primary">
              ⏱️ {formatMinutes(op.stats.minutes)}
            </span>
          </div>
        </div>
        
        <div className="grid grid-2 gap-6">
          {/* Services sub-list */}
          <div className="op-services bg-gray-50 p-3 rounded-lg border border-gray-100">
            <p className="text-xs font-bold text-muted mb-2 uppercase tracking-wider flex items-center gap-1">
              📋 Servicios ({op.stats.totalServices})
            </p>
            <div className="flex flex-col gap-1">
              {op.services.length === 0 && <span className="text-xs text-muted italic">Sin servicios asignados</span>}
              {op.services.map(s => (
                <div key={s.id} className="flex justify-between items-center text-xs p-1.5 bg-white shadow-sm border border-gray-100 rounded">
                  <span className="font-medium">{getCommunityName(s.communityId)}</span>
                  <span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-warning'}`} style={{ transform: 'scale(0.85)', originX: 'right' }}>
                    {s.status === 'completed' ? 'Completado' : s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Check-ins sub-list */}
          <div className="op-checkins bg-gray-50 p-3 rounded-lg border border-gray-100">
            <p className="text-xs font-bold text-muted mb-2 uppercase tracking-wider flex items-center gap-1">
              🕒 Fichajes ({op.checkIns.length})
            </p>
            <div className="flex flex-col gap-1">
              {op.checkIns.length === 0 && <span className="text-xs text-muted italic">Sin fichajes</span>}
              {op.checkIns.map(c => (
                <div key={c.id} className="flex justify-between items-center text-xs p-1.5 bg-white shadow-sm border border-gray-100 rounded">
                  <span>
                    <span className="text-success">{c.checkInTime?.toDate ? format(c.checkInTime.toDate(), 'HH:mm') : '--'}</span>
                    {' → '}
                    <span className={c.checkOutTime ? 'text-danger' : 'text-primary'}>
                      {c.checkOutTime?.toDate ? format(c.checkOutTime.toDate(), 'HH:mm') : 'Activo'}
                    </span>
                  </span>
                  <span className="font-bold text-primary">{formatMinutes(c.durationMinutes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ));
  }

  function getCommunityName(id) {
    return communities.find(c => c.id === id)?.name || id?.substring(0, 8) + '...';
  }

  function getOperarioName(id) {
    return operarios.find(o => o.uid === id)?.name || id?.substring(0, 8) + '...';
  }

  const handleAdminTransfer = async (targetUser) => {
    if (!transferModal.service) return;
    setActionLoading(true);
    try {
      await transferService({
        serviceId: transferModal.service.id,
        fromUserId: transferModal.service.assignedUserId,
        toUserId: targetUser,
        requesterRole: 'admin'
      });
      alert('Servicio reasignado correctamente');
      setTransferModal({ open: false, service: null });
      loadReport();
    } catch (error) {
      console.error('Error reassigning:', error);
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleServiceDelete = async (id) => {
    if (confirm('¿Estás seguro de que deseas eliminar este registro de servicio? Esta acción no se puede deshacer.')) {
      try {
        await deleteScheduledService(id);
        setServices(services.filter(s => s.id !== id));
        const newSet = new Set(selectedServices);
        newSet.delete(id);
        setSelectedServices(newSet);
      } catch (err) {
        alert('Error al borrar: ' + err.message);
      }
    }
  };

  const toggleServiceSelection = (id) => {
    const newSet = new Set(selectedServices);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedServices(newSet);
  };

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

  const toggleAllServices = () => {
    if (services.length === 0) return;
    if (selectedServices.size === services.length) {
      setSelectedServices(new Set());
    } else {
      setSelectedServices(new Set(services.map(s => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedServices.size === 0) return;
    if (confirm(`¿Estás seguro de que deseas eliminar ${selectedServices.size} servicios seleccionados? Esta acción no se puede deshacer.`)) {
      setActionLoading(true);
      try {
        await Promise.all(Array.from(selectedServices).map(id => deleteScheduledService(id)));
        setServices(services.filter(s => !selectedServices.has(s.id)));
        setSelectedServices(new Set());
      } catch (err) {
        alert('Error al borrar: ' + err.message);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleCheckInDelete = async (id) => {
    if (confirm('¿Estás seguro de que deseas eliminar este registro de fichaje? Esta acción no se puede deshacer.')) {
      try {
        await deleteCheckIn(id);
        setCheckIns(checkIns.filter(c => c.id !== id));
      } catch (err) {
        alert('Error al borrar: ' + err.message);
      }
    }
  };

  return (
    <>
    <div className="animate-fadeIn">
      <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>📊 Informes</h2>

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
          <label className="form-label">Comunidad</label>
          <select className="form-select" value={filterCommunity} onChange={e => setFilterCommunity(e.target.value)}>
            <option value="">Todas</option>
            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Operario</label>
          <select className="form-select" value={filterOperario} onChange={e => setFilterOperario(e.target.value)}>
            <option value="">Todos</option>
            {operarios.map(o => <option key={o.uid} value={o.uid}>{o.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={loadReport}>🔍 Filtrar</button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-value">{totalServices}</div>
          <div className="stat-label">Servicios programados</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{completedServices}</div>
          <div className="stat-label">Completados</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{pendingServices}</div>
          <div className="stat-label">Pendientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatMinutes(totalMinutes)}</div>
          <div className="stat-label">Horas trabajadas</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'hierarchical' ? 'active' : ''}`} onClick={() => setActiveTab('hierarchical')}>
          Vista General
        </button>
        <button className={`tab ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>
          Todos los Servicios
        </button>
        <button className={`tab ${activeTab === 'community' ? 'active' : ''}`} onClick={() => setActiveTab('community')}>
          Por comunidad
        </button>
        <button className={`tab ${activeTab === 'operario' ? 'active' : ''}`} onClick={() => setActiveTab('operario')}>
          Por operario
        </button>
        <button className={`tab ${activeTab === 'checkins' ? 'active' : ''}`} onClick={() => setActiveTab('checkins')}>
          Fichajes
        </button>
        <button className={`tab ${activeTab === 'breakdown' ? 'active' : ''}`} onClick={() => setActiveTab('breakdown')}>
          Desglose Horas
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-6"><div className="spinner"></div></div>
      ) : (
        <>
          {/* Hierarchical View */}
          {activeTab === 'hierarchical' && (
            <div className="hierarchical-reports">
              {hierarchicalData.map(week => {
                if (!week.isComplete) {
                  // Current Week: Show days directly as top-level rows
                  return week.days.map(day => (
                    <div key={day.dayId} className="day-card mb-3">
                      <div 
                        className={`day-header card ${expandedDays.has(day.dayId) ? 'expanded' : ''}`}
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
                          borderLeft: expandedDays.has(day.dayId) ? '6px solid var(--color-primary)' : '1px solid var(--color-border)'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="day-icon" style={{ fontSize: '1.2rem', background: 'var(--color-bg)', padding: '8px', borderRadius: '50%' }}>
                            📅
                          </div>
                          <div>
                            <h3 style={{ fontSize: 'var(--font-base)', fontWeight: 700, textTransform: 'capitalize' }}>{day.label}</h3>
                            <span className="text-xs text-primary font-bold">Hoy / Esta Semana</span>
                          </div>
                        </div>
                        <div className="day-stats flex gap-4 text-sm font-semibold">
                          <span title="Servicios Completados" style={{ color: 'var(--color-success)' }}>
                            ✅ {day.stats.completed}/{day.stats.totalServices}
                          </span>
                          <span title="Horas Totales" style={{ color: 'var(--color-primary)' }}>
                            ⏱️ {formatMinutes(day.stats.minutes)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{expandedDays.has(day.dayId) ? '🔽' : '▶️'}</span>
                        </div>
                      </div>

                      {expandedDays.has(day.dayId) && (
                        <div className="day-content mt-2 ml-2 flex flex-col gap-3 p-4 bg-white rounded-lg border border-gray-100 shadow-inner">
                          {renderDayOperators(day)}
                        </div>
                      )}
                    </div>
                  ));
                } else {
                  // Completed Week: Show a week button
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
                          borderLeft: expandedWeeks.has(week.weekId) ? '4px solid var(--color-primary)' : '1px solid var(--color-border)'
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
                          <span title="Servicios Completados" style={{ color: 'var(--color-success)' }}>
                            ✅ {week.stats.completed}/{week.stats.totalServices}
                          </span>
                          <span title="Horas Totales" style={{ color: 'var(--color-primary)' }}>
                            ⏱️ {formatMinutes(week.stats.minutes)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{expandedWeeks.has(week.weekId) ? '🔽' : '▶️'}</span>
                        </div>
                      </div>

                      {expandedWeeks.has(week.weekId) && (
                        <div className="week-content mt-2 ml-4 flex flex-col gap-2">
                          {week.days.map(day => (
                            <div key={day.dayId} className="day-card">
                              <div 
                                className={`day-header card ${expandedDays.has(day.dayId) ? 'expanded' : ''}`}
                                onClick={() => toggleDay(day.dayId)}
                                style={{ 
                                  padding: 'var(--space-3) var(--space-4)',
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  cursor: 'pointer',
                                  background: 'var(--color-bg-card)',
                                  boxShadow: 'var(--shadow-sm)',
                                  borderRadius: 'var(--radius-md)'
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <span style={{ fontSize: '1rem' }}>
                                    {expandedDays.has(day.dayId) ? '🔽' : '▶️'}
                                  </span>
                                  <h4 style={{ fontSize: 'var(--font-sm)', fontWeight: 600, textTransform: 'capitalize' }}>
                                    {day.label}
                                  </h4>
                                </div>
                                <div className="day-stats flex gap-3 text-xs">
                                  <span className="badge badge-success">
                                    {day.stats.completed}/{day.stats.totalServices} Svcs
                                  </span>
                                  <span className="badge badge-primary">
                                    {formatMinutes(day.stats.minutes)}
                                  </span>
                                </div>
                              </div>

                              {expandedDays.has(day.dayId) && (
                                <div className="day-content mt-2 ml-6 flex flex-col gap-3 p-4 bg-white rounded-lg border border-gray-100 shadow-inner">
                                  {renderDayOperators(day)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
              })}
              {hierarchicalData.length === 0 && (
                <div className="card text-center p-8 text-muted">
                  📭 No hay datos que mostrar para el rango seleccionado.
                </div>
              )}
            </div>
          )}

          {/* Services tab */}
          {activeTab === 'services' && (
            <div className="card" style={{ padding: 0 }}>
              {selectedServices.size > 0 && (
                <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-sm font-semibold">{selectedServices.size} servicios seleccionados</span>
                  <button 
                    className="btn btn-danger btn-sm" 
                    onClick={handleBulkDelete}
                    disabled={actionLoading}
                  >
                    🗑️ Eliminar seleccionados
                  </button>
                </div>
              )}
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={services.length > 0 && selectedServices.size === services.length}
                          onChange={toggleAllServices}
                        />
                      </th>
                      <th>Fecha</th>
                      <th>Comunidad</th>
                      <th>Operario</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map(s => (
                      <tr key={s.id} className={selectedServices.has(s.id) ? 'bg-primary-50' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedServices.has(s.id)}
                            onChange={() => toggleServiceSelection(s.id)}
                          />
                        </td>
                        <td className="text-sm">{s.scheduledDate?.toDate ? format(s.scheduledDate.toDate(), 'dd/MM/yyyy', { locale: es }) : '—'}</td>
                        <td className="font-semibold text-sm">{getCommunityName(s.communityId)}</td>
                        <td className="text-sm">{getOperarioName(s.assignedUserId)}</td>
                        <td className="text-right flex items-center justify-end gap-2">
                          {s.status === 'pending' && (
                            <>
                              <button 
                                className="btn btn-ghost btn-xs" 
                                onClick={() => setTransferModal({ open: true, service: s })}
                                style={{ color: 'var(--color-warning)' }}
                                title="Cambiar operario"
                              >
                                🔄
                              </button>
                              <button 
                                className="btn btn-ghost btn-sm" 
                                onClick={async () => {
                                  if(confirm('¿Marcar este servicio como completado manualmente?')) {
                                    await updateScheduledServiceStatus(s.id, 'completed');
                                    loadReport();
                                  }
                                }}
                                style={{ color: 'var(--color-primary)' }}
                              >
                                ✓ Completar manual
                              </button>
                            </>
                          )}
                          {s.status === 'completed' && <span className="text-success text-sm">Completado</span>}
                          {s.status !== 'pending' && s.status !== 'completed' && (
                            <span className={`badge ${
                              s.status === 'in_progress' ? 'badge-info' : 'badge-danger'
                            }`}>{s.status}</span>
                          )}
                        </td>
                        <td className="text-right">
                          <button 
                            className="btn btn-ghost btn-sm text-danger hover:bg-red-50"
                            onClick={() => handleServiceDelete(s.id)}
                            title="Eliminar registro"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {services.length === 0 && (
                      <tr><td colSpan="6" className="text-center text-muted p-6">Sin datos para este rango</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By community */}
          {activeTab === 'community' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>Comunidad</th><th>Servicios</th><th>Completados</th><th>% Cumplimiento</th><th>Horas</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(byCommunity).map(([cId, data]) => (
                      <tr key={cId}>
                        <td className="font-semibold text-sm">{getCommunityName(cId)}</td>
                        <td>{data.total}</td>
                        <td>{data.completed}</td>
                        <td>
                          <span className={`badge ${data.total > 0 && data.completed/data.total >= 0.8 ? 'badge-success' : 'badge-warning'}`}>
                            {data.total > 0 ? Math.round(data.completed/data.total*100) : 0}%
                          </span>
                        </td>
                        <td>{formatMinutes(data.minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By operario */}
          {activeTab === 'operario' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>Operario</th><th>Servicios</th><th>Completados</th><th>% Cumplimiento</th><th>Horas</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(byOperario).map(([uId, data]) => (
                      <tr key={uId}>
                        <td className="font-semibold text-sm">{getOperarioName(uId)}</td>
                        <td>{data.total}</td>
                        <td>{data.completed}</td>
                        <td>
                          <span className={`badge ${data.total > 0 && data.completed/data.total >= 0.8 ? 'badge-success' : 'badge-warning'}`}>
                            {data.total > 0 ? Math.round(data.completed/data.total*100) : 0}%
                          </span>
                        </td>
                        <td>{formatMinutes(data.minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Checkins tab */}
          {activeTab === 'checkins' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>Fecha</th><th>Operario</th><th>Comunidad</th><th>Entrada</th><th>Salida</th><th>Duración</th><th className="text-right">Acciones</th></tr>
                  </thead>
                  <tbody>
                    {checkIns.map(c => (
                      <tr key={c.id}>
                        <td className="text-sm">{c.checkInTime?.toDate ? format(c.checkInTime.toDate(), 'dd/MM/yyyy') : '—'}</td>
                        <td className="text-sm">{getOperarioName(c.userId)}</td>
                        <td className="font-semibold text-sm">{getCommunityName(c.communityId)}</td>
                        <td className="text-sm">{c.checkInTime?.toDate ? format(c.checkInTime.toDate(), 'HH:mm') : '—'}</td>
                        <td className="text-sm">{c.checkOutTime?.toDate ? format(c.checkOutTime.toDate(), 'HH:mm') : '🔴 Activo'}</td>
                        <td>{c.durationMinutes ? formatMinutes(c.durationMinutes) : '—'}</td>
                        <td className="text-right">
                          <button 
                            className="btn btn-ghost btn-sm text-danger hover:bg-red-50"
                            onClick={() => handleCheckInDelete(c.id)}
                            title="Eliminar registro"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {checkIns.length === 0 && (
                      <tr><td colSpan="6" className="text-center text-muted p-6">Sin fichajes en este rango</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Breakdown tab */}
          {activeTab === 'breakdown' && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 600, marginBottom: '0.25rem' }}>Resumen de Horas</h3>
                  <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
                    {appliedCommunity ? `Comunidad: ${getCommunityName(appliedCommunity)}` : 'Todas las comunidades'} 
                    {' | '} {format(new Date(startDate), 'dd/MM/yyyy')} - {format(new Date(endDate), 'dd/MM/yyyy')}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {formatMinutes(totalBreakdownMinutes)}
                  </div>
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Total horas periodo</div>
                </div>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      {!appliedCommunity && <th>Comunidades</th>}
                      <th>Operarios</th>
                      <th>Registros</th>
                      <th className="text-right">Horas / Día</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(breakdownByDay).sort().reverse().map(day => {
                      const data = breakdownByDay[day];
                      const uniqueOperarios = [...new Set(data.entries.map(c => getOperarioName(c.userId)))].join(', ');
                      const communityNames = appliedCommunity ? '' : [...new Set(data.entries.map(c => getCommunityName(c.communityId)))].join(', ');

                      return (
                        <tr key={day}>
                          <td className="font-semibold">{format(new Date(day), 'dd/MM/yyyy')}</td>
                          {!appliedCommunity && <td className="text-sm" style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={communityNames}>{communityNames}</td>}
                          <td className="text-sm" style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={uniqueOperarios}>{uniqueOperarios}</td>
                          <td className="text-sm" style={{ color: 'var(--text-muted)' }}>{data.entries.length} fichajes</td>
                          <td className="text-right font-semibold" style={{ color: 'var(--color-primary)' }}>{formatMinutes(data.totalMinutes)}</td>
                        </tr>
                      );
                    })}
                    {Object.keys(breakdownByDay).length === 0 && (
                      <tr><td colSpan={appliedCommunity ? "4" : "5"} className="text-center text-muted p-6">Sin datos para este rango</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>

    <TransferModal 
      isOpen={transferModal.open}
      onClose={() => setTransferModal({ open: false, service: null })}
      onConfirm={handleAdminTransfer}
      loading={actionLoading}
      title="Reasignar Servicio"
    />
  </>
  );
}
