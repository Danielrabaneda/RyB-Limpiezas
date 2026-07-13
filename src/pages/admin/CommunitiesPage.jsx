import { useState, useEffect, useRef } from 'react';
import { getCommunityTasks, getAssignmentsForCommunity } from '../../services/taskService';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import TransferModal from '../../components/TransferModal';
import GarageYearlyView from '../../components/GarageYearlyView';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getCommunityGuides } from '../../services/documentVaultService';
import useCommunitiesData from '../../hooks/useCommunitiesData';
import useCommunityTasks from '../../hooks/useCommunityTasks';
import useCommunityPortal from '../../hooks/useCommunityPortal';
import useAdministrators from '../../hooks/useAdministrators';
import AdministratorTab from '../../components/admin/communities/AdministratorTab';
import CommunityListPanel from '../../components/admin/communities/CommunityListPanel';
import CommunityDetailPanel from '../../components/admin/communities/CommunityDetailPanel';
import CommunityFormModal from '../../components/admin/communities/CommunityFormModal';
import TaskFormModal from '../../components/admin/communities/TaskFormModal';






export default function CommunitiesPage() {
  const { userProfile } = useAuth();
  const [actionLoading, setActionLoading] = useState(false);

  // Custom Hooks
  const {
    communities, setCommunities,
    operarios, setOperarios,
    administrators, setAdministrators,
    loading, setLoading,
    selectedCommunity, setSelectedCommunity,
    assignments, setAssignments,
    showModal, setShowModal,
    editingCommunity, setEditingCommunity,
    form, setForm,
    geocoding, setGeocoding,
    gpsSuggestions, setGpsSuggestions,
    loadingSuggestions, setLoadingSuggestions,
    loadData,
    openCreateModal,
    openEditModal,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleGeocode,
    handleSaveCommunity,
    handleDeleteCommunity
  } = useCommunitiesData({ actionLoading, setActionLoading });

  const {
    communityTasks,
    setCommunityTasks,
    showTaskModal,
    setShowTaskModal,
    editingTask,
    setEditingTask,
    taskForm,
    setTaskForm,
    showAssignModal,
    setShowAssignModal,
    assignUserId,
    setAssignUserId,
    reassignModal,
    setReassignModal,
    openCreateTaskModal,
    openEditTaskModal,
    toggleWeekDay,
    handleSaveTask,
    handleRemoveTask,
    handlePermanentReassign,
    handleAssignOperario,
    handleRemoveAssignment
  } = useCommunityTasks({
    selectedCommunity,
    setAssignments,
    actionLoading,
    setActionLoading,
    userProfile
  });

  const {
    communityDocs,
    setCommunityDocs,
    showDocModal,
    setShowDocModal,
    docForm,
    setDocForm,
    uploadingDoc,
    handleTogglePortal,
    handleRegenerateToken,
    handleToggleVisitTimes,
    handleAddDocument,
    handleDeleteDoc
  } = useCommunityPortal({
    selectedCommunity,
    setSelectedCommunity,
    setCommunities,
    actionLoading,
    setActionLoading,
    userProfile
  });

  const {
    showAdminModal,
    setShowAdminModal,
    editingAdmin,
    adminForm,
    setAdminForm,
    openCreateAdminModal,
    openEditAdminModal,
    handleSaveAdmin,
    handleDeleteAdmin
  } = useAdministrators({
    onRefresh: loadData,
    actionLoading,
    setActionLoading
  });

  // UI States (Area B)
  const modalRef = useRef(null);
  const [activeTab, setActiveTab] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAdmin, setFilterAdmin] = useState('all');

  // GPS Pending Real-time Listener
  const [pendingGPSCommunityIds, setPendingGPSCommunityIds] = useState(new Set());
  const [filterGPS, setFilterGPS] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'gpsSuggestions'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set(snap.docs.map(d => d.data().communityId).filter(Boolean));
      setPendingGPSCommunityIds(ids);
      if (ids.size === 0) setFilterGPS(false);
    });
    return () => unsub();
  }, []);

  // Orchestrator selectCommunity function (Option B)
  const selectCommunity = async (community) => {
    if (!community) return;
    try {
      setSelectedCommunity(community);
      const [tasks, assigns, docs] = await Promise.all([
        getCommunityTasks(community.id),
        getAssignmentsForCommunity(community.id),
        getCommunityGuides(community.id)
      ]);
      setCommunityTasks(tasks || []);
      setAssignments(assigns || []);
      setCommunityDocs(docs || []);
    } catch (err) {
      console.error("Error selecting community:", err);
      alert('Error al cargar detalles de la comunidad.');
    }
  };

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

  const filteredCommunities = Array.isArray(communities) ? communities.filter(comm => {
    const matchesSearch =
      (comm.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comm.address || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGPSFilter = !filterGPS || pendingGPSCommunityIds.has(comm.id);
    
    const commType = comm.type || 'comunidad';
    const matchesTypeFilter = filterType === 'all' || commType === filterType;
    
    let matchesAdminFilter = true;
    if (filterAdmin === 'none') {
      matchesAdminFilter = !comm.administratorId;
    } else if (filterAdmin !== 'all') {
      matchesAdminFilter = comm.administratorId === filterAdmin;
    }
    
    return matchesSearch && matchesGPSFilter && matchesTypeFilter && matchesAdminFilter;
  }) : [];

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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
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
            <button 
              className={`btn ${activeTab === 'administrators' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('administrators')}
            >
              💼 Administradores
            </button>
          </div>
        </div>
        {activeTab === 'list' && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            ➕ Nueva comunidad
          </button>
        )}
        {activeTab === 'administrators' && (
          <button className="btn btn-primary" onClick={openCreateAdminModal}>
            ➕ Nuevo Administrador
          </button>
        )}
      </div>

      {activeTab === 'list' ? (
        <div className="grid communities-grid">
        {/* Community list */}
        <CommunityListPanel
          communities={communities}
          filteredCommunities={filteredCommunities}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filterType={filterType}
          setFilterType={setFilterType}
          filterAdmin={filterAdmin}
          setFilterAdmin={setFilterAdmin}
          administrators={administrators}
          pendingGPSCommunityIds={pendingGPSCommunityIds}
          filterGPS={filterGPS}
          setFilterGPS={setFilterGPS}
          selectedCommunity={selectedCommunity}
          selectCommunity={selectCommunity}
        />

        {/* Community detail */}
        {selectedCommunity ? (
          <CommunityDetailPanel
            selectedCommunity={selectedCommunity}
            setSelectedCommunity={setSelectedCommunity}
            setCommunities={setCommunities}
            openEditModal={openEditModal}
            handleDeleteCommunity={handleDeleteCommunity}
            administrators={administrators}
            communityTasks={communityTasks}
            openCreateTaskModal={openCreateTaskModal}
            openEditTaskModal={openEditTaskModal}
            handleRemoveTask={handleRemoveTask}
            setReassignModal={setReassignModal}
            operarios={operarios}
            assignments={assignments}
            setShowAssignModal={setShowAssignModal}
            handleRemoveAssignment={handleRemoveAssignment}
            communityDocs={communityDocs}
            setShowDocModal={setShowDocModal}
            handleDeleteDoc={handleDeleteDoc}
            handleTogglePortal={handleTogglePortal}
            handleRegenerateToken={handleRegenerateToken}
            actionLoading={actionLoading}
            FREQ_LABELS={FREQ_LABELS}
            MONTHS={MONTHS}
            WEEKDAYS={WEEKDAYS}
            safeFormat={safeFormat}
          />
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
      ) : activeTab === 'garages' ? (
        <GarageYearlyView />
      ) : (
        /* Administrators Management Tab */
        <AdministratorTab
          administrators={administrators}
          communities={communities}
          showAdminModal={showAdminModal}
          setShowAdminModal={setShowAdminModal}
          editingAdmin={editingAdmin}
          adminForm={adminForm}
          setAdminForm={setAdminForm}
          openEditAdminModal={openEditAdminModal}
          handleSaveAdmin={handleSaveAdmin}
          handleDeleteAdmin={handleDeleteAdmin}
          actionLoading={actionLoading}
        />
      )}

            {/* Modal: Create/Edit Community */}
      <CommunityFormModal
        showModal={showModal}
        setShowModal={setShowModal}
        modalRef={modalRef}
        editingCommunity={editingCommunity}
        form={form}
        setForm={setForm}
        handleGeocode={handleGeocode}
        geocoding={geocoding}
        gpsSuggestions={gpsSuggestions}
        loadingSuggestions={loadingSuggestions}
        handleAcceptSuggestion={handleAcceptSuggestion}
        handleRejectSuggestion={handleRejectSuggestion}
        handleSaveCommunity={handleSaveCommunity}
        administrators={administrators}
      />

            {/* Modal: Add Task */}
      <TaskFormModal
        showTaskModal={showTaskModal}
        setShowTaskModal={setShowTaskModal}
        editingTask={editingTask}
        setEditingTask={setEditingTask}
        taskForm={taskForm}
        setTaskForm={setTaskForm}
        handleSaveTask={handleSaveTask}
        operarios={operarios}
        WEEKDAYS={WEEKDAYS}
        MONTHS={MONTHS}
        FREQ_LABELS={FREQ_LABELS}
        toggleWeekDay={toggleWeekDay}
      />

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
        isAdmin={true}
        title={`Reasignar PERMANENTEMENTE: ${reassignModal.task?.taskName}`}
        excludeUserId={reassignModal.task?.assignedUserId}
      />

      {/* Modal: Subir Documento a la Biblioteca */}
      {showDocModal && (
        <div className="modal-overlay" onClick={() => setShowDocModal(false)}>
          <div className="modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📄 Subir Documento a la Biblioteca</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDocModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddDocument}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label text-xs font-bold">Título del Documento</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej. Instrucciones del Cuarto de Contadores"
                    value={docForm.title}
                    onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label text-xs font-bold">Archivo (PDF o Imagen)</label>
                  <input 
                    type="file" 
                    className="form-input"
                    accept="application/pdf,image/*"
                    onChange={e => setDocForm(f => ({ ...f, file: e.target.files[0] }))}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDocModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={uploadingDoc}>
                  {uploadingDoc ? 'Subiendo...' : 'Subir Documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
