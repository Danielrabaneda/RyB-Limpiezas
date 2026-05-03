import { useState, useEffect, useRef } from 'react';
import { getCommunities, createCommunity, updateCommunity, deleteCommunity } from '../../services/communityService';
import { getCommunityTasks, createCommunityTask, updateCommunityTask, deleteCommunityTask } from '../../services/taskService';
import { getAssignmentsForCommunity, createAssignment, deleteAssignment } from '../../services/taskService';
import { getOperarios } from '../../services/authService';
import { generateServicesForTask, deleteAllServicesForTask } from '../../services/scheduleService';
import { format } from 'date-fns';
import { transferPermanent } from '../../services/transferService';
import { useAuth } from '../../contexts/AuthContext';
import TransferModal from '../../components/TransferModal';
import GarageYearlyView from '../../components/GarageYearlyView';

export default function CommunitiesPage() {
  const { userProfile } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCommunity, setEditingCommunity] = useState(null);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [communityTasks, setCommunityTasks] = useState([]);
  const [reassignModal, setReassignModal] = useState({ open: false, task: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null = create mode, task = edit mode
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'garages'

  // Form state
  const [form, setForm] = useState({
    name: '', address: '', lat: '', lng: '', type: 'comunidad',
    contactPerson: '', contactPhone: '', individualTimeTracking: false
  });

  const [taskForm, setTaskForm] = useState({
    taskName: '', 
    frequencyType: 'weekly', 
    frequencyValue: 1,
    weekDays: [], 
    monthDays: [],
    serviceMode: 'periodic', // 'periodic', 'once', 'range'
    punctualDate: format(new Date(), 'yyyy-MM-dd'),
    startDate: '', // Fecha de inicio para periódicas
    endDate: '',   // Fecha de fin (opcional)
    weekOfMonth: '', // 1, 2, 3, 4, 5
    monthOfYear: '', // 0-11
    assignedUserId: '', // Operario específico para esta tarea
    flexibleWeek: false,
    isGarage: false, // Indica si es una tarea de garaje
    printColor: '#ef4444', // Color para impresión: verde, amarillo o rojo
  });

  const [assignUserId, setAssignUserId] = useState('');

  // Prevenir que el modal se cierre o pierda foco por clics accidentales
  const modalRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [comms, ops] = await Promise.all([getCommunities(), getOperarios()]);
      setCommunities(comms || []);
      setOperarios(ops || []);
    } catch (err) {
      console.error("Error loading communities data:", err);
      alert('Error crítico al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function selectCommunity(community) {
    if (!community) return;
    try {
      setSelectedCommunity(community);
      const [tasks, assigns] = await Promise.all([
        getCommunityTasks(community.id),
        getAssignmentsForCommunity(community.id),
      ]);
      setCommunityTasks(tasks || []);
      setAssignments(assigns || []);
    } catch (err) {
      console.error("Error selecting community:", err);
      alert('Error al cargar detalles de la comunidad.');
    }
  }

  function openCreateModal() {
    setEditingCommunity(null);
    setForm({ name: '', address: '', lat: '', lng: '', type: 'comunidad', contactPerson: '', contactPhone: '', individualTimeTracking: false });
    setShowModal(true);
  }

  function openEditModal(comm) {
    setEditingCommunity(comm);
    setForm({
      name: comm.name,
      address: comm.address,
      lat: comm.location?._lat || comm.location?.latitude || '',
      lng: comm.location?._long || comm.location?.longitude || '',
      type: comm.type,
      contactPerson: comm.contactPerson || '',
      contactPhone: comm.contactPhone || '',
      individualTimeTracking: comm.individualTimeTracking || false,
    });
    setShowModal(true);
  }

  const [geocoding, setGeocoding] = useState(false);

    async function handleGeocode() {
      if (!form.address) return alert('Introduce una dirección primero');
      setGeocoding(true);
      
      try {
        const addressParts = form.address.split(',').map(p => p.trim());
        const city = addressParts.length > 1 ? addressParts[1] : '';
        
        // Intentos en orden de especificidad
        const queries = [
          form.address, // 1. Dirección completa
          addressParts.filter((_, i) => i !== 0).join(', '), // 2. Sin el nombre de la calle/número (solo ciudad/zona)
          city || 'Murcia, España' // 3. Solo la ciudad o provincia por defecto
        ];

        let result = null;

        for (const query of queries) {
          if (!query) continue;
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=es`;
          const response = await fetch(url, {
            headers: { 'Accept-Language': 'es', 'User-Agent': 'RyB-Limpiezas-App/1.0' }
          });
          const data = await response.json();
          if (data && data.length > 0) {
            result = data[0];
            break; 
          }
        }
        
        if (result) {
          setForm(f => ({
            ...f,
            lat: parseFloat(result.lat).toFixed(6),
            lng: parseFloat(result.lon).toFixed(6)
          }));
          // Si no fue el primer intento (dirección exacta), avisamos sutilmente
          if (queries.indexOf(result.display_name) !== 0 && !result.display_name.toLowerCase().includes(addressParts[0].toLowerCase())) {
            console.log("Ubicación aproximada encontrada:", result.display_name);
          }
        } else {
          alert('No se pudo encontrar la ubicación. Intenta escribir solo el nombre de la calle y la ciudad.');
        }
      } catch (err) {
        console.error('Geocoding error:', err);
        alert('Error al conectar con el servicio de mapas.');
      } finally {
        setGeocoding(false);
      }
    }

  async function handleSaveCommunity(e) {
    e.preventDefault();
    try {
      const communityData = {
        name: form.name,
        address: form.address,
        lat: parseFloat(form.lat) || 0,
        lng: parseFloat(form.lng) || 0,
        type: form.type,
        contactPerson: form.contactPerson,
        contactPhone: form.contactPhone,
        individualTimeTracking: !!form.individualTimeTracking,
      };

      if (editingCommunity) {
        await updateCommunity(editingCommunity.id, communityData);
      } else {
        await createCommunity(communityData);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleDeleteCommunity(id) {
    if (!confirm('¿Desactivar esta comunidad?')) return;
    await deleteCommunity(id);
    setSelectedCommunity(null);
    await loadData();
  }

  function openEditTaskModal(task) {
    setEditingTask(task);
    setTaskForm({
      taskName: task.taskName || '',
      frequencyType: task.frequencyType || 'weekly',
      frequencyValue: task.frequencyValue || 1,
      weekDays: task.weekDays || [],
      monthDays: task.monthDays || [],
      serviceMode: task.serviceMode || 'periodic',
      punctualDate: task.punctualDate ? (typeof task.punctualDate === 'string' ? task.punctualDate : format(task.punctualDate.toDate?.() || new Date(task.punctualDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd'),
      startDate: task.startDate ? (typeof task.startDate === 'string' ? task.startDate : format(task.startDate.toDate?.() || new Date(task.startDate), 'yyyy-MM-dd')) : '',
      endDate: task.endDate ? (typeof task.endDate === 'string' ? task.endDate : format(task.endDate.toDate?.() || new Date(task.endDate), 'yyyy-MM-dd')) : '',
      weekOfMonth: task.weekOfMonth != null ? String(task.weekOfMonth) : '',
      monthOfYear: task.monthOfYear != null ? String(task.monthOfYear) : '',
      assignedUserId: task.assignedUserId || '',
      flexibleWeek: task.flexibleWeek || false,
      isGarage: task.isGarage || false,
      printColor: task.printColor || '#ef4444',
    });
    setShowTaskModal(true);
  }

  function openCreateTaskModal() {
    setEditingTask(null);
    setTaskForm({
      taskName: '', frequencyType: 'weekly', frequencyValue: 1, weekDays: [], monthDays: [],
      serviceMode: 'periodic', punctualDate: format(new Date(), 'yyyy-MM-dd'),
      startDate: '', endDate: '', weekOfMonth: '', monthOfYear: '', assignedUserId: '', flexibleWeek: false,
      isGarage: false,
      printColor: '#ef4444',
    });
    setShowTaskModal(true);
  }

  async function handleSaveTask(e) {
    e.preventDefault();
    const taskData = {
      communityId: selectedCommunity.id,
      taskName: taskForm.taskName,
      assignedUserId: taskForm.assignedUserId || null,
      frequencyValue: parseInt(taskForm.frequencyValue) || 1,
      weekDays: taskForm.weekDays,
      monthDays: taskForm.monthDays.map(Number),
      frequencyType: taskForm.serviceMode === 'once' ? 'once' : (taskForm.serviceMode === 'range' ? 'range' : taskForm.frequencyType),
      punctualDate: taskForm.serviceMode === 'once' ? taskForm.punctualDate : null,
      startDate: taskForm.startDate || null,
      endDate: taskForm.endDate || null,
      weekOfMonth: taskForm.weekOfMonth ? parseInt(taskForm.weekOfMonth) : null,
      monthOfYear: taskForm.monthOfYear !== '' ? parseInt(taskForm.monthOfYear) : null,
      serviceMode: taskForm.serviceMode || 'periodic',
      flexibleWeek: taskForm.flexibleWeek || false,
      isGarage: taskForm.isGarage || false,
      printColor: taskForm.printColor || '#ef4444',
    };

    try {
      if (editingTask) {
        // UPDATE existing task — regenerates future services automatically inside updateCommunityTask
        await updateCommunityTask(editingTask.id, taskData);
      } else {
        // CREATE new task + generate services
        const newTask = await createCommunityTask(taskData);
        if (newTask?.id) await generateServicesForTask(newTask.id);
      }

      setShowTaskModal(false);
      setEditingTask(null);
      const tasks = await getCommunityTasks(selectedCommunity.id);
      setCommunityTasks(tasks);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleRemoveTask(task) {
    // Step 1: choose deletion mode
    const deleteAll = window.confirm(
      `¿Eliminar la tarea "${task.taskName}"?\n\n` +
      `• ACEPTAR → Eliminar tarea + TODO el historial de servicios\n` +
      `• CANCELAR → Ir al siguiente paso para eliminar solo futuros`
    );

    if (!deleteAll) {
      // Step 1b: user chose "only future" path — ask one final confirmation
      const confirmFuture = window.confirm(
        `Se eliminarán solo los servicios FUTUROS PENDIENTES de "${task.taskName}" y se desactivará la tarea.\n\n¿Confirmar?`
      );
      if (!confirmFuture) return;
    } else {
      // Safety confirm before wiping all history
      const confirmAll = window.confirm(
        `⚠️ ATENCIÓN: Se borrarán PERMANENTEMENTE todos los registros históricos de "${task.taskName}" (servicios completados incluidos).\n\n¿Estás seguro?`
      );
      if (!confirmAll) return;
    }


    try {
      if (deleteAll) {
        await deleteAllServicesForTask(task.id);
      }
      await deleteCommunityTask(task.id);
      const tasks = await getCommunityTasks(selectedCommunity.id);
      setCommunityTasks(tasks);
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  }

  const handlePermanentReassign = async (toUserId) => {
    if (!toUserId || !reassignModal.task) return;
    setActionLoading(true);
    try {
      await transferPermanent({
        communityTaskId: reassignModal.task.id,
        fromUserId: reassignModal.task.assignedUserId,
        toUserId,
        adminUserId: userProfile.uid
      });
      
      alert('Tarea reasignada permanentemente. Se han regenerado los servicios futuros.');
      setReassignModal({ open: false, task: null });
      // Refresh tasks
      const tasks = await getCommunityTasks(selectedCommunity.id);
      setCommunityTasks(tasks);
    } catch (err) {
      alert('Error en reasignación: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };



  async function handleAssignOperario(e) {
    e.preventDefault();
    if (!assignUserId) return;
    try {
      await createAssignment({ communityId: selectedCommunity.id, userId: assignUserId });
      
      // Generar servicios para todas las tareas de esta comunidad para el nuevo operario
      for (const t of communityTasks) {
        await generateServicesForTask(t.id);
      }

      setShowAssignModal(false);
      const assigns = await getAssignmentsForCommunity(selectedCommunity.id);
      setAssignments(assigns);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  async function handleRemoveAssignment(id) {
    await deleteAssignment(id);
    const assigns = await getAssignmentsForCommunity(selectedCommunity.id);
    setAssignments(assigns);
  }

  const WEEKDAYS = [
    { val: 1, label: 'Lun' }, { val: 2, label: 'Mar' }, { val: 3, label: 'Mié' },
    { val: 4, label: 'Jue' }, { val: 5, label: 'Vie' }, { val: 6, label: 'Sáb' }, { val: 0, label: 'Dom' },
  ];

  const FREQ_LABELS = { 
    once: 'Puntual', 
    range: 'Periodo (Rango)',
    weekly: 'Semanal', 
    biweekly: 'Quincenal', 
    monthly: 'Mensual', 
    bimonthly: 'Bimensual (cada 2 meses)', 
    trimonthly: 'Trimestral (cada 3 meses)', 
    semiannual: 'Semestral (cada 6 meses)', 
    annual: 'Anual (cada 12 meses)',
    custom: 'Personalizada' 
  };

  const MONTHS = [
    { val: 0, label: 'Enero' }, { val: 1, label: 'Febrero' }, { val: 2, label: 'Marzo' },
    { val: 3, label: 'Abril' }, { val: 4, label: 'Mayo' }, { val: 5, label: 'Junio' },
    { val: 6, label: 'Julio' }, { val: 7, label: 'Agosto' }, { val: 8, label: 'Septiembre' },
    { val: 9, label: 'Octubre' }, { val: 10, label: 'Noviembre' }, { val: 11, label: 'Diciembre' }
  ];

  function toggleWeekDay(day) {
    setTaskForm(prev => ({
      ...prev,
      weekDays: prev.weekDays.includes(day)
        ? prev.weekDays.filter(d => d !== day)
        : [...prev.weekDays, day],
    }));
  }

  const safeFormat = (date, pattern) => {
    try {
      if (!date) return '';
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      return format(d, pattern);
    } catch (e) {
      return '';
    }
  };

  const filteredCommunities = Array.isArray(communities) ? communities.filter(comm => 
    (comm.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (comm.address || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
        <p className="text-muted">Cargando comunidades...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800 }}>Comunidades</h2>
          <div className="flex items-center gap-2">
            <button 
              className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('list')}
            >
              🏢 Listado
            </button>
            <button 
              className={`btn ${activeTab === 'garages' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('garages')}
            >
              🚗 Garajes
            </button>
          </div>
        </div>
        {activeTab === 'list' && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            ➕ Nueva comunidad
          </button>
        )}
      </div>

      {activeTab === 'list' ? (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1.5fr', gap: 'var(--space-6)' }}>
        {/* Community list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-semibold">📋 Listado ({filteredCommunities.length !== communities.length ? `${filteredCommunities.length}/${communities.length}` : communities.length})</h3>
          </div>
          
          <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-light)' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar comunidad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {Array.isArray(filteredCommunities) && filteredCommunities.map(comm => (
              <div
                key={comm.id}
                onClick={() => selectCommunity(comm)}
                style={{
                  padding: 'var(--space-4) var(--space-5)',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  background: selectedCommunity?.id === comm.id ? 'var(--color-primary-100)' : 'transparent',
                  borderLeft: selectedCommunity?.id === comm.id ? '4px solid var(--color-primary)' : '4px solid transparent',
                  boxShadow: selectedCommunity?.id === comm.id ? 'inset 0 0 0 1px rgba(37, 99, 235, 0.1)' : 'none',
                  transition: 'all var(--transition-fast)',
                }}
                className="community-list-item"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{comm?.name || 'Comunidad sin nombre'}</div>
                    <div className="text-xs text-muted">{comm?.address || ''}</div>
                  </div>
                  {selectedCommunity?.id !== comm.id && (
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '10px' }}>
                      Ver ➔
                    </button>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <span className="badge badge-info text-xs">
                    {comm?.type || 'comunidad'}
                  </span>
                </div>
              </div>
            ))}
            {(!communities || communities.length === 0) && (
              <div className="empty-state">
                <p>No hay comunidades creadas</p>
              </div>
            )}
            {communities && communities.length > 0 && filteredCommunities.length === 0 && (
              <div className="empty-state">
                <p>No se encontraron comunidades</p>
              </div>
            )}
          </div>
        </div>

        {/* Community detail */}
        {selectedCommunity ? (
          <div className="flex flex-col gap-4">
            {/* Info */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">🏢 {selectedCommunity.name}</h3>
                <div className="flex gap-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(selectedCommunity)}>✏️ Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCommunity(selectedCommunity.id)}>🗑️</button>
                </div>
              </div>
              <div className="grid grid-2 gap-4">
                <div><span className="text-xs text-muted">Dirección</span><p className="font-medium text-sm">{selectedCommunity.address}</p></div>
                <div><span className="text-xs text-muted">Tipo</span><p className="font-medium text-sm">{selectedCommunity.type}</p></div>
                <div><span className="text-xs text-muted">Contacto</span><p className="font-medium text-sm">{selectedCommunity.contactPerson || '—'}</p></div>
                <div><span className="text-xs text-muted">Teléfono</span><p className="font-medium text-sm">{selectedCommunity.contactPhone || '—'}</p></div>
              </div>
            </div>

            {/* Tasks */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">📋 Tareas configuradas</h3>
                <button className="btn btn-primary btn-sm" onClick={openCreateTaskModal}>➕ Añadir</button>
              </div>
              {communityTasks.length === 0 ? (
                <p className="text-muted text-sm">No hay tareas configuradas</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {communityTasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between" style={{ padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: task.printColor || '#ef4444', display: 'inline-block', flexShrink: 0, border: '1px solid rgba(0,0,0,0.15)' }}></span>
                          {task.taskName}
                          {task.assignedUserId && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium border border-purple-200">👤 {operarios.find(o => o.uid === task.assignedUserId)?.name || 'Asignado'}</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {FREQ_LABELS[task.frequencyType] || task.frequencyType}
                          {task.frequencyType === 'once' && task.punctualDate && ` — ${safeFormat(task.punctualDate, 'dd/MM/yyyy')}`}
                          {task.frequencyType === 'range' && task.startDate && ` — Desde ${safeFormat(task.startDate, 'dd/MM/yyyy')} hasta ${safeFormat(task.endDate, 'dd/MM/yyyy')}`}
                          {task.weekOfMonth && ` — ${task.weekOfMonth}ª semana del mes`}
                          {task.flexibleWeek && ` — (Semana Flexible)`}
                          {task.monthOfYear !== undefined && task.monthOfYear !== null && ` — Solo en ${MONTHS.find(m => m.val === task.monthOfYear)?.label}`}
                          {task.weekDays?.length > 0 && !task.flexibleWeek && ` — ${task.weekDays.map(d => WEEKDAYS.find(w => w.val === d)?.label).join(', ')}`}
                          {task.monthDays?.length > 0 && !task.flexibleWeek && ` — Días: ${task.monthDays.join(', ')}`}
                          {task.startDate && task.frequencyType !== 'range' && task.frequencyType !== 'once' && ` (Inicia: ${safeFormat(task.startDate, 'MM/yyyy')})`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Reasignar permanentemente"
                          onClick={() => setReassignModal({ open: true, task })}
                          style={{ fontSize: '0.8rem' }}
                        >🔁</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Editar tarea"
                          onClick={() => openEditTaskModal(task)}
                          style={{ fontSize: '0.8rem' }}
                        >✏️</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Eliminar tarea"
                          onClick={() => handleRemoveTask(task)}
                          style={{ color: '#dc2626', fontSize: '0.8rem' }}
                        >🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assignments */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">👷 Operarios asignados</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAssignModal(true)}>➕ Asignar</button>
              </div>
              {assignments.length === 0 ? (
                <p className="text-muted text-sm">No hay operarios asignados</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {assignments.map(assign => {
                    const op = operarios.find(o => o.uid === assign.userId);
                    return (
                      <div key={assign.id} className="flex items-center justify-between" style={{ padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                        <div className="flex items-center gap-3">
                          <div className="sidebar-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                            {op?.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{op?.name || 'Desconocido'}</div>
                            <div className="text-xs text-muted">{op?.email}</div>
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveAssignment(assign.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🏢</div>
              <h3 className="empty-state-title">Selecciona una comunidad</h3>
              <p className="text-muted text-sm">Haz clic en una comunidad para ver sus detalles, tareas y asignaciones</p>
            </div>
          </div>
        )}
      </div>
      ) : (
        <GarageYearlyView />
      )}

      {/* Modal: Create/Edit Community */}
      {showModal && (
        <div 
          className="modal-overlay" 
          onMouseDown={(e) => {
            // Solo cerrar si el clic es directamente en el fondo sombreado
            if (e.target.className === 'modal-overlay') setShowModal(false);
          }}
        >
          <div className="modal" ref={modalRef}>
            <div className="modal-header">
              <h3 className="modal-title">{editingCommunity ? 'Editar comunidad' : 'Nueva comunidad'}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveCommunity}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre de la Comunidad</label>
                  <input 
                    className="form-input" 
                    value={form.name} 
                    onChange={e => setForm(f => ({...f, name: e.target.value}))} 
                    placeholder="Ej: Urbanización El Sol"
                    autoComplete="off"
                    required 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <div className="flex gap-2">
                    <input 
                      className="form-input" 
                      style={{ flex: 1 }}
                      value={form.address} 
                      onChange={e => setForm(f => ({...f, address: e.target.value}))} 
                      placeholder="Ej: Calle Principal 1, Madrid"
                      required 
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={handleGeocode}
                      disabled={geocoding}
                      style={{ whiteSpace: 'nowrap', minWidth: '100px' }}
                    >
                      {geocoding ? '⌛...' : '📍 Localizar'}
                    </button>
                  </div>
                  <p className="text-xs text-muted mt-1">Usa el botón para obtener las coordenadas para el GPS automáticamente.</p>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Latitud</label>
                    <input className="form-input" type="number" step="any" value={form.lat} onChange={e => setForm(f => ({...f, lat: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Longitud</label>
                    <input className="form-input" type="number" step="any" value={form.lng} onChange={e => setForm(f => ({...f, lng: e.target.value}))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                      <option value="comunidad">Comunidad</option>
                      <option value="garaje">Garaje</option>
                      <option value="oficinas">Oficinas</option>
                      <option value="local">Local comercial</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Persona de contacto</label>
                    <input className="form-input" value={form.contactPerson} onChange={e => setForm(f => ({...f, contactPerson: e.target.value}))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono contacto</label>
                  <input className="form-input" value={form.contactPhone} onChange={e => setForm(f => ({...f, contactPhone: e.target.value}))} />
                </div>
                <div className="form-group" style={{ padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <label className="form-label flex items-center gap-2 cursor-pointer mb-1" style={{ display: 'flex', alignItems: 'center' }}>
                    <input 
                      type="checkbox" 
                      style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                      checked={form.individualTimeTracking}
                      onChange={e => setForm(f => ({...f, individualTimeTracking: e.target.checked}))}
                    />
                    <span style={{ fontWeight: 'bold' }}>Seguimiento de tiempo individual</span>
                  </label>
                  <p className="text-xs text-muted" style={{ marginLeft: '26px' }}>
                    Si se marca, el operario no requerirá iniciar la jornada general para trabajar en servicios de esta comunidad. El tiempo general se desactivará si todos sus servicios de hoy son individuales.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={geocoding}>
                  {editingCommunity ? 'Guardar Cambios' : 'Crear Comunidad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Task */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingTask ? '✏️ Editar tarea' : '➕ Nueva tarea'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowTaskModal(false); setEditingTask(null); }}>✕</button>
            </div>
            <form onSubmit={handleSaveTask}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre de la tarea</label>
                  <input className="form-input" value={taskForm.taskName} onChange={e => setTaskForm(f => ({...f, taskName: e.target.value}))} placeholder="Ej: Limpieza de portal" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Color en calendario impreso</label>
                  <div className="flex items-center gap-3">
                    {[
                      { color: '#22c55e', label: 'Escalera' },
                      { color: '#eab308', label: 'Portal' },
                      { color: '#ef4444', label: 'Otras' },
                    ].map(opt => (
                      <button
                        key={opt.color}
                        type="button"
                        onClick={() => setTaskForm(f => ({...f, printColor: opt.color}))}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: opt.color,
                          border: taskForm.printColor === opt.color ? '3px solid #000' : '2px solid rgba(0,0,0,0.15)',
                          cursor: 'pointer',
                          boxShadow: taskForm.printColor === opt.color ? '0 0 0 2px white, 0 0 0 4px ' + opt.color : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        title={opt.label}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-1">🟢 Limpieza Escalera &nbsp; 🟡 Repaso Portal &nbsp; 🔴 Otras tareas</p>
                </div>

                <div className="form-group">
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input 
                      type="checkbox" 
                      style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      checked={taskForm.isGarage}
                      onChange={e => setTaskForm(f => ({...f, isGarage: e.target.checked}))}
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">🚗 Es Limpieza de Garaje</span>
                      <span className="text-xs text-slate-500">Si se marca, aparecerá en el cuadrante anual.</span>
                      {taskForm.isGarage && taskForm.serviceMode === 'periodic' && (
                        <div className="mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold inline-block animate-pulse">
                          💡 TIP: Elige un día de la semana (ej: Viernes)
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">Asignar a operario (Opcional)</label>
                  <select className="form-select" value={taskForm.assignedUserId} onChange={e => setTaskForm(f => ({...f, assignedUserId: e.target.value}))}>
                    <option value="">— Cualquiera asignado a la comunidad —</option>
                    {operarios.filter(o => o.active).map(op => (
                      <option key={op.uid} value={op.uid}>{op.name} ({op.email})</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Tipo de programación</label>
                  <div className="grid grid-3 gap-2 bg-slate-50 p-1 rounded-lg">
                    <button 
                      type="button"
                      className={`btn btn-sm ${taskForm.serviceMode === 'periodic' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setTaskForm(f => ({...f, serviceMode: 'periodic'}))}
                    >Periódica</button>
                    <button 
                      type="button"
                      className={`btn btn-sm ${taskForm.serviceMode === 'once' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setTaskForm(f => ({...f, serviceMode: 'once'}))}
                    >Un solo día</button>
                    <button 
                      type="button"
                      className={`btn btn-sm ${taskForm.serviceMode === 'range' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setTaskForm(f => ({...f, serviceMode: 'range'}))}
                    >Periodo (Días seguidos)</button>
                  </div>
                </div>

                {taskForm.serviceMode === 'once' && (
                  <div className="form-group animate-slideDown">
                    <label className="form-label">Fecha concreta</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={taskForm.punctualDate} 
                      onChange={e => setTaskForm(f => ({...f, punctualDate: e.target.value}))} 
                      required 
                    />
                  </div>
                )}

                {taskForm.serviceMode === 'range' && (
                  <div className="form-row animate-slideDown p-4 bg-slate-50 rounded-xl mb-4 border border-slate-200">
                    <div className="form-group mb-0">
                      <label className="form-label text-xs font-bold uppercase text-slate-500">Desde</label>
                      <input type="date" className="form-input" value={taskForm.startDate} onChange={e => setTaskForm(f => ({...f, startDate: e.target.value}))} required />
                    </div>
                    <div className="form-group mb-0">
                      <label className="form-label text-xs font-bold uppercase text-slate-500">Hasta</label>
                      <input type="date" className="form-input" value={taskForm.endDate} onChange={e => setTaskForm(f => ({...f, endDate: e.target.value}))} required />
                    </div>
                  </div>
                )}
                
                {taskForm.serviceMode === 'periodic' && (
                  <>
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label font-bold text-indigo-900">Frecuencia</label>
                          <select className="form-select border-indigo-200" value={taskForm.frequencyType} onChange={e => setTaskForm(f => ({...f, frequencyType: e.target.value}))}>
                            <option value="weekly">Semanal</option>
                            <option value="biweekly">Quincenal</option>
                            <option value="monthly">Mensual</option>
                            <option value="bimonthly">Cada 2 meses</option>
                            <option value="trimonthly">Cada 3 meses</option>
                            <option value="quadrimonthly">Cada 4 meses</option>
                            <option value="semiannual">Cada 6 meses</option>
                            <option value="eightmonthly">Cada 8 meses</option>
                            <option value="annual">Anual</option>
                          </select>
                          {['bimonthly', 'trimonthly', 'quadrimonthly', 'semiannual', 'eightmonthly'].includes(taskForm.frequencyType) && (
                            <div className="mt-2 text-[10px] text-indigo-600 font-medium">
                              Se programará en: {
                                taskForm.frequencyType === 'bimonthly' ? 'Ene, Mar, May, Jul, Sep, Nov' :
                                taskForm.frequencyType === 'trimonthly' ? 'Ene, Abr, Jul, Oct' :
                                taskForm.frequencyType === 'quadrimonthly' ? 'Ene, May, Sep' :
                                taskForm.frequencyType === 'semiannual' ? 'Ene, Jul' :
                                'Ene, Sep'
                              }
                            </div>
                          )}
                        </div>
                        <div className="form-group">
                          <label className="form-label font-bold text-indigo-900">Veces (X)</label>
                          <input className="form-input border-indigo-200" type="number" min="1" value={taskForm.frequencyValue} onChange={e => setTaskForm(f => ({...f, frequencyValue: e.target.value}))} />
                        </div>
                      </div>

                      {(taskForm.serviceMode === 'periodic') && (
                        <div className="form-group mt-2">
                          <label className="form-label text-xs font-bold text-indigo-700">Días de la semana</label>
                          <div className="chip-group">
                            {WEEKDAYS.map(d => (
                              <button type="button" key={d.val} className={`chip ${taskForm.weekDays.includes(d.val) ? 'selected' : ''}`} onClick={() => toggleWeekDay(d.val)}>
                                {d.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {(['monthly', 'bimonthly', 'trimonthly', 'quadrimonthly', 'semiannual', 'eightmonthly', 'annual'].includes(taskForm.frequencyType)) && (
                        <div className="form-group mt-2">
                          <div className="grid grid-2 gap-4">
                            <div>
                              <label className="text-xs font-bold text-indigo-700">Días del mes (Ej: 1, 15)</label>
                              <input className="form-input border-indigo-200" placeholder="Ej: 1, 15" value={taskForm.monthDays.join(', ')} onChange={e => setTaskForm(f => ({...f, monthDays: e.target.value.split(',').map(s => s.trim()).filter(Boolean)}))} />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-indigo-700">Semana del mes</label>
                              <select className="form-select border-indigo-200" value={taskForm.weekOfMonth} onChange={e => setTaskForm(f => ({...f, weekOfMonth: e.target.value}))}>
                                <option value="">Cualquier semana</option>
                                <option value="1">1ª semana</option>
                                <option value="2">2ª semana</option>
                                <option value="3">3ª semana</option>
                                <option value="4">4ª semana</option>
                                <option value="5">Última semana</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-xl border-2 transition-all" 
                         style={{ 
                           background: taskForm.flexibleWeek ? 'var(--color-warning-light)' : '#f8fafc',
                           borderColor: taskForm.flexibleWeek ? 'var(--color-warning)' : 'var(--color-border)',
                           boxShadow: taskForm.flexibleWeek ? '0 4px 12px rgba(245, 158, 11, 0.1)' : 'none'
                         }}>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${taskForm.flexibleWeek ? 'bg-warning border-warning' : 'border-slate-300'}`}>
                          {taskForm.flexibleWeek && <span className="text-white text-xs">✓</span>}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={taskForm.flexibleWeek}
                          onChange={e => setTaskForm(f => ({...f, flexibleWeek: e.target.checked}))}
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">📅 Tarea de Semana Flexible</span>
                          <span className="text-xs text-slate-500">Aparecerá toda la semana hasta que se marque como "Hecho"</span>
                        </div>
                      </label>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg mt-4">
                      <h4 className="text-xs font-bold text-blue-800 uppercase mb-2">Configuración avanzada de inicio</h4>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="text-xs text-blue-700 font-semibold text-muted">Mes de inicio/específico</label>
                          <select className="form-select" value={taskForm.monthOfYear} onChange={e => setTaskForm(f => ({...f, monthOfYear: e.target.value}))}>
                            <option value="">A partir de ahora / Todos los meses</option>
                            {MONTHS.map(m => (
                              <option key={m.val} value={m.val}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="text-xs text-blue-700 font-semibold text-muted">A partir del día</label>
                          <input type="date" className="form-input" value={taskForm.startDate} onChange={e => setTaskForm(f => ({...f, startDate: e.target.value}))} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowTaskModal(false); setEditingTask(null); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editingTask ? 'Guardar cambios' : 'Crear tarea'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Operario */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Asignar operario</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAssignOperario}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Seleccionar operario</label>
                  <select className="form-select" value={assignUserId} onChange={e => setAssignUserId(e.target.value)} required>
                    <option value="">— Elige un operario —</option>
                    {operarios.filter(o => o.active && !assignments.find(a => a.userId === o.uid)).map(op => (
                      <option key={op.uid} value={op.uid}>{op.name} ({op.email})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Asignar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Permanent Reassign */}
      <TransferModal
        isOpen={reassignModal.open}
        onClose={() => setReassignModal({ open: false, task: null })}
        onConfirm={handlePermanentReassign}
        loading={actionLoading}
        title={`Reasignar PERMANENTEMENTE: ${reassignModal.task?.taskName}`}
        excludeUserId={reassignModal.task?.assignedUserId}
      />
    </div>
  );
}
