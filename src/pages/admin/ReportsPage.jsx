import { useState, useEffect } from 'react';
import { getScheduledServicesRange, updateScheduledServiceStatus, deleteScheduledService } from '../../services/scheduleService';
import { getCheckInsRange, deleteCheckIn } from '../../services/checkInService';
import { getCommunities } from '../../services/communityService';
import { getOperarios } from '../../services/authService';
import { transferService } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDecimalHours, formatMinutes } from '../../utils/formatTime';

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterCommunity, setFilterCommunity] = useState('');
  const [filterOperario, setFilterOperario] = useState('');
  const [appliedCommunity, setAppliedCommunity] = useState('');
  const [activeTab, setActiveTab] = useState('services');

  const [communities, setCommunities] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [services, setServices] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  
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
      setServices(svcs);
      setCheckIns(chks);
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
        <button className={`tab ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>
          Servicios
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
