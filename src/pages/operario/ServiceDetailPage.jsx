import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { getCommunity } from '../../services/communityService';
import { getCommunityTasks } from '../../services/taskService';
import { updateScheduledServiceStatus, addCompanionToService, removeCompanionFromService } from '../../services/scheduleService';
import { 
  createCheckIn, completeCheckOut, getActiveCheckIn,
  createTaskExecution, updateTaskExecution, getTaskExecutionsForService,
  isWithinRange
} from '../../services/checkInService';
import { uploadPhoto } from '../../services/storageService';
import { transferService } from '../../services/transferService';
import { getOperarios } from '../../services/authService';
import TransferModal from '../../components/TransferModal';
import CompanionModal from '../../components/CompanionModal';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { format } from 'date-fns';

export default function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { userProfile } = useAuth();
  const { getCurrentPosition, loading: geoLoading } = useGeolocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [service, setService] = useState(null);
  const [community, setCommunity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskExecutions, setTaskExecutions] = useState([]);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [companionModalOpen, setCompanionModalOpen] = useState(false);
  const [operariosMap, setOperariosMap] = useState({});
  const [selectedTaskExec, setSelectedTaskExec] = useState(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState(null);
  const [suggestedIn, setSuggestedIn] = useState(null);
  const [suggestedOut, setSuggestedOut] = useState(null);

  useEffect(() => {
    loadServiceDetail();
    
    // Cargar sugerencias de geolocalización
    const sIn = localStorage.getItem(`detected_entry_${serviceId}`);
    const sOut = localStorage.getItem(`detected_exit_${serviceId}`);
    if (sIn) setSuggestedIn(new Date(sIn));
    if (sOut) setSuggestedOut(new Date(sOut));
  }, [serviceId]);

  async function loadServiceDetail() {
    try {
      // Load service
      const svcSnap = await getDoc(doc(db, 'scheduledServices', serviceId));
      if (!svcSnap.exists()) return;
      const svcData = { id: svcSnap.id, ...svcSnap.data() };
      setService(svcData);

      // Load community
      const comm = await getCommunity(svcData.communityId);
      setCommunity(comm);

      // Load tasks for this community, but only keep the specific task for this service
      const commTasks = await getCommunityTasks(svcData.communityId);
      if (svcData.communityTaskId) {
        setTasks(commTasks.filter(t => t.id === svcData.communityTaskId));
      } else {
        setTasks(commTasks); // Fallback for old data
      }

      // Load task executions
      // Load operarios for mapping companion IDs to names
      try {
        const ops = await getOperarios();
        const map = {};
        ops.forEach(op => map[op.uid] = op.name);
        setOperariosMap(map);
      } catch (e) {
        console.error('Error cargando operarios', e);
      }

      const execs = await getTaskExecutionsForService(serviceId);
      setTaskExecutions(execs);

      // Check active checkin
      const checkIn = await getActiveCheckIn(userProfile.uid);
      if (checkIn && checkIn.scheduledServiceId === serviceId) {
        setActiveCheckIn(checkIn);
      }
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
      await transferService({
        serviceId,
        fromUserId: userProfile.uid,
        toUserId,
        requesterRole: 'operario'
      });
      alert('Traspaso solicitado correctamente.');
      setTransferModalOpen(false);
      navigate('/operario');
    } catch (err) {
      alert('Error en el traspaso: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddCompanionConfirm(companionId) {
    if (!companionId) return;
    setActionLoading(true);
    try {
      await addCompanionToService(serviceId, companionId);
      setCompanionModalOpen(false);
      await loadServiceDetail();
    } catch (err) {
      alert('Error añadiendo acompañante: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveCompanion(companionId) {
    if (!window.confirm('¿Seguro que este compañero ya no está en el servicio?')) return;
    setActionLoading(true);
    try {
      await removeCompanionFromService(serviceId, companionId);
      await loadServiceDetail();
    } catch (err) {
      alert('Error quitando acompañante: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckIn(manualTime = null) {
    setActionLoading(true);
    try {
      const pos = await getCurrentPosition();
      
      // Validate distance (solo si no es manual o para informar)
      if (community?.location) {
        const commLat = community.location._lat || community.location.latitude || 0;
        const commLng = community.location._long || community.location.longitude || 0;
        const check = isWithinRange(pos.lat, pos.lng, commLat, commLng, 500);
        setDistanceInfo(check);
      }

      const checkInId = await createCheckIn({
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        lat: pos.lat,
        lng: pos.lng,
        manualTime: manualTime
      });

      await updateScheduledServiceStatus(serviceId, 'in_progress');

      // Limpiar sugerencia utilizada
      localStorage.removeItem(`detected_entry_${serviceId}`);
      setSuggestedIn(null);

      // Create task execution entries for each task
      for (const task of tasks) {
        const existing = taskExecutions.find(e => e.communityTaskId === task.id);
        if (!existing) {
          await createTaskExecution({
            scheduledServiceId: serviceId,
            communityTaskId: task.id,
            userId: userProfile.uid,
          });
        }
      }

      await loadServiceDetail();
    } catch (err) {
      alert('Error: ' + err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut(manualTime = null) {
    if (!activeCheckIn) return;
    setActionLoading(true);
    try {
      const pos = await getCurrentPosition();
      const result = await completeCheckOut(activeCheckIn.id, pos.lat, pos.lng, manualTime);

      // Update status
      await updateScheduledServiceStatus(serviceId, 'completed');

      // Limpiar sugerencia utilizada
      localStorage.removeItem(`detected_exit_${serviceId}`);
      setSuggestedOut(null);

      alert(`Servicio finalizado. Duración: ${result.duration} minutos`);
      setActiveCheckIn(null);
      await loadServiceDetail();
    } catch (err) {
      alert('Error: ' + err);
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleTaskStatus(exec) {
    const newStatus = exec.status === 'completed' ? 'pending' : 'completed';
    await updateTaskExecution(exec.id, { status: newStatus });
    await loadServiceDetail();
  }

  async function handlePhotoUpload(e, execId) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadPhoto(file, userProfile.uid, serviceId);
      const exec = taskExecutions.find(ex => ex.id === execId);
      const currentPhotos = exec?.photoUrls || [];
      await updateTaskExecution(execId, { photoUrls: [...currentPhotos, url] });
      await loadServiceDetail();
    } catch (err) {
      alert('Error subiendo foto: ' + err);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveNotes(execId) {
    await updateTaskExecution(execId, { notes });
    await loadServiceDetail();
  }

  if (loading) {
    return <div className="flex justify-center p-6"><div className="spinner"></div></div>;
  }

  if (!service) {
    return <div className="empty-state"><p>Servicio no encontrado</p></div>;
  }

  const isCheckedIn = !!activeCheckIn;
  const isCompleted = service.status === 'completed';
  const isTitular = service.assignedUserId === userProfile.uid;
  const isCompanion = service.companionIds?.includes(userProfile.uid) && !isTitular;
  // Si es solo acompañante, solo puede ver.
  const readonlyMode = isCompanion || isCompleted;

  return (
    <div className="animate-fadeIn">
      {/* Back button */}
      <button className="btn btn-ghost mb-4" onClick={() => navigate('/operario')} style={{ marginLeft: '-8px' }}>
        ← Volver
      </button>

      {/* Community info */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 style={{ fontSize: 'var(--font-xl)', fontWeight: 800 }}>{community?.name}</h2>
            <p className="text-sm text-muted">{community?.address}</p>
            {isCompanion && (
              <span className="badge badge-info mt-2" style={{ display: 'inline-block' }}>🤝 Modo Acompañante</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`badge ${
              service.status === 'completed' ? 'badge-success' :
              service.status === 'in_progress' ? 'badge-info' :
              'badge-warning'
            }`}>
              {service.status === 'completed' ? '✅ Completado' :
              service.status === 'in_progress' ? '🔄 En curso' : '⏳ Pendiente'}
            </span>
            {!isCompleted && !isCheckedIn && isTitular && (
              <button 
                className="btn btn-ghost btn-xs" 
                onClick={() => setTransferModalOpen(true)}
                style={{ color: 'var(--color-warning)', padding: '4px 8px', border: '1px solid currentColor' }}
              >
                🔄 Traspasar
              </button>
            )}
          </div>
        </div>
        {distanceInfo && (
          <div className={`mt-2 text-xs ${distanceInfo.withinRange ? '' : ''}`} style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: distanceInfo.withinRange ? 'var(--color-success-light)' : 'var(--color-warning-light)',
          }}>
            📍 Distancia: {distanceInfo.distance}m {distanceInfo.withinRange ? '✅' : '⚠️ Fuera de rango'}
          </div>
        )}
      </div>

      <TransferModal 
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onConfirm={handleTransferConfirm}
        loading={actionLoading}
        title={`Traspasar servicio ${community?.name}`}
      />

      <CompanionModal
        isOpen={companionModalOpen}
        onClose={() => setCompanionModalOpen(false)}
        onConfirm={handleAddCompanionConfirm}
        loading={actionLoading}
        excludeUserIds={[userProfile.uid, ...(service.companionIds || [])]}
      />

      {/* Check-in/out button */}
      {!isCompleted && isTitular && (
        <div className="mb-4 flex flex-col gap-2">
          {/* Sugerencias de geolocalización */}
          {!isCheckedIn && suggestedIn && (
            <div className="card" style={{ border: '2px dashed var(--color-accent)', background: 'var(--color-accent-light)' }}>
              <p className="text-xs font-bold mb-2">📍 Se detectó tu llegada a las {format(suggestedIn, 'HH:mm')}</p>
              <button 
                className="btn btn-primary btn-sm w-full" 
                onClick={() => handleCheckIn(suggestedIn)}
                disabled={actionLoading}
              >
                Usar hora sugerida
              </button>
            </div>
          )}

          {isCheckedIn && suggestedOut && (
            <div className="card" style={{ border: '2px dashed var(--color-danger)', background: 'var(--color-danger-light)' }}>
              <p className="text-xs font-bold mb-2">🏃 Se detectó tu salida a las {format(suggestedOut, 'HH:mm')}</p>
              <button 
                className="btn btn-danger btn-sm w-full" 
                onClick={() => handleCheckOut(suggestedOut)}
                disabled={actionLoading}
              >
                Usar hora sugerida
              </button>
            </div>
          )}

          {!isCheckedIn ? (
            <button
              className="checkin-btn start"
              onClick={() => handleCheckIn()}
              disabled={actionLoading || geoLoading}
            >
              {actionLoading ? '📍 Obteniendo ubicación...' : '📍 Iniciar servicio'}
            </button>
          ) : (
            <button
              className="checkin-btn stop"
              onClick={() => handleCheckOut()}
              disabled={actionLoading || geoLoading}
            >
              {actionLoading ? '📍 Finalizando...' : '🛑 Finalizar servicio'}
            </button>
          )}
        </div>
      )}

      {/* Task checklist */}
      <div className="card">
        <h3 className="card-title mb-4">📋 Tareas</h3>
        {taskExecutions.length === 0 && tasks.length > 0 && !isCheckedIn ? (
          <p className="text-muted text-sm">Ficha entrada para ver las tareas</p>
        ) : taskExecutions.length === 0 ? (
          <p className="text-muted text-sm">No hay tareas configuradas</p>
        ) : (
          <div className="task-checklist">
            {taskExecutions.map(exec => {
              const task = tasks.find(t => t.id === exec.communityTaskId);
              const isDone = exec.status === 'completed';
              return (
                <div key={exec.id} className={`task-item ${isDone ? 'completed' : ''}`}>
                  <div
                    className={`task-checkbox ${isDone ? 'checked' : ''}`}
                    onClick={() => !readonlyMode && toggleTaskStatus(exec)}
                  >
                    {isDone && '✓'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className={`task-name ${isDone ? 'done' : ''}`}>
                      {task?.taskName || 'Tarea'}
                    </div>
                    
                    {/* Notes */}
                    {isCheckedIn && !readonlyMode && (
                      <div className="mt-2">
                        <textarea
                          className="form-textarea"
                          placeholder="Añadir notas..."
                          style={{ minHeight: '50px', fontSize: 'var(--font-xs)' }}
                          defaultValue={exec.notes || ''}
                          onBlur={(e) => {
                            if (e.target.value !== exec.notes) {
                              updateTaskExecution(exec.id, { notes: e.target.value });
                            }
                          }}
                        />
                      </div>
                    )}
                    {exec.notes && readonlyMode && (
                      <p className="text-xs text-muted mt-2">📝 {exec.notes}</p>
                    )}

                    {/* Photos */}
                    <div className="photo-upload">
                      {exec.photoUrls?.map((url, i) => (
                        <img key={i} src={url} alt={`Evidencia ${i+1}`} className="photo-thumb" />
                      ))}
                      {isCheckedIn && !readonlyMode && (
                        <label className="photo-upload-btn">
                          📷
                          <span>Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => handlePhotoUpload(e, exec.id)}
                          />
                        </label>
                      )}
                    </div>
                    {uploadingPhoto && <p className="text-xs text-muted mt-2">Subiendo foto...</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compañeros */}
      {isTitular && (
        <div className="card mt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title m-0">🤝 Acompañantes</h3>
            {!isCompleted && isCheckedIn && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => setCompanionModalOpen(true)}
              >
                + Añadir
              </button>
            )}
          </div>
          
          {(!service.companionLogs || service.companionLogs.length === 0) ? (
            <p className="text-muted text-sm">No hay acompañantes en este servicio.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {service.companionLogs.map((log, i) => {
                const isActive = !log.leftAt;
                const name = operariosMap[log.userId] || 'Compañero';
                return (
                  <div key={i} className="flex justify-between items-center p-3" style={{ background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div className="font-bold text-sm">
                        {name} {isActive && <span className="text-success text-xs">● Activo</span>}
                      </div>
                      <div className="text-xs text-muted">
                        Entrada: {format(new Date(log.joinedAt), 'HH:mm')}
                        {log.leftAt && ` - Salida: ${format(new Date(log.leftAt), 'HH:mm')}`}
                      </div>
                    </div>
                    {isActive && !isCompleted && (
                      <button 
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => handleRemoveCompanion(log.userId)}
                        style={{ border: '1px solid var(--color-danger)' }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
