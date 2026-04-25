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
import { getActiveWorkday } from '../../services/workdayService';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion } from 'firebase/firestore';
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
  const [otherActiveCheckIn, setOtherActiveCheckIn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [operariosMap, setOperariosMap] = useState({});
  const [selectedTaskExec, setSelectedTaskExec] = useState(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [distanceInfo, setDistanceInfo] = useState(null);
  const [suggestedIn, setSuggestedIn] = useState(null);
  const [suggestedOut, setSuggestedOut] = useState(null);
  const [activeWorkday, setActiveWorkday] = useState(null);

  useEffect(() => {
    if (!serviceId) return;

    // Reset state when service changes
    setActiveCheckIn(null);
    setService(null);
    setCommunity(null);
    setTasks([]);
    setTaskExecutions([]);
    setDistanceInfo(null);

    // 1. Listen to service document
    const unsubService = onSnapshot(doc(db, 'scheduledServices', serviceId), async (snap) => {
      if (!snap.exists()) {
        setLoading(false);
        return;
      }
      const svcData = { id: snap.id, ...snap.data() };
      setService(svcData);

      // Load static info if not already loaded
      if (!community) {
        const comm = await getCommunity(svcData.communityId);
        setCommunity(comm);
        
        const commTasks = await getCommunityTasks(svcData.communityId);
        if (svcData.communityTaskId) {
          setTasks(commTasks.filter(t => t.id === svcData.communityTaskId));
        } else {
          setTasks(commTasks);
        }
      }
    });

    // 2. Listen to task executions
    const qExecs = query(
      collection(db, 'taskExecutions'),
      where('scheduledServiceId', '==', serviceId)
    );
    const unsubExecs = onSnapshot(qExecs, (snap) => {
      setTaskExecutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. One-time fetches
    loadStaticData();
    
    // Cargar sugerencias de geolocalización
    const sIn = localStorage.getItem(`detected_entry_${serviceId}`);
    const sOut = localStorage.getItem(`detected_exit_${serviceId}`);
    if (sIn) setSuggestedIn(new Date(sIn));
    if (sOut) setSuggestedOut(new Date(sOut));

    return () => {
      unsubService();
      unsubExecs();
    };
  }, [serviceId]);

  async function loadStaticData() {
    try {
      // Operarios map
      const ops = await getOperarios();
      const map = {};
      ops.forEach(op => map[op.uid] = op.name);
      setOperariosMap(map);

      // Active check-in
      const checkIn = await getActiveCheckIn(userProfile.uid);
      if (checkIn) {
        if (checkIn.scheduledServiceId === serviceId) {
          setActiveCheckIn(checkIn);
          setOtherActiveCheckIn(null);
        } else {
          setActiveCheckIn(null);
          setOtherActiveCheckIn(checkIn);
        }
      } else {
        setActiveCheckIn(null);
        setOtherActiveCheckIn(null);
      }

      // Workday
      const workday = await getActiveWorkday(userProfile.uid);
      setActiveWorkday(workday);
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



  async function handleRemoveCompanion(companionId) {
    if (!window.confirm('¿Seguro que este compañero ya no está en el servicio?')) return;
    setActionLoading(true);
    try {
      await removeCompanionFromService(serviceId, companionId);
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

      // Prevent double check-in if already active
      if (activeCheckIn) {
        console.warn('Ya hay un fichaje activo. No se creará otro.');
        return;
      }

      const checkInId = await createCheckIn({
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        lat: pos.lat,
        lng: pos.lng,
        manualTime: manualTime
      });

      // Set active check-in immediately for better responsiveness
      setActiveCheckIn({
        id: checkInId,
        userId: userProfile.uid,
        communityId: service.communityId,
        scheduledServiceId: serviceId,
        checkInTime: manualTime ? new Date(manualTime) : new Date(),
        checkOutTime: null
      });

      await updateScheduledServiceStatus(serviceId, 'in_progress');

      // AUTO-ASSIGN GLOBAL COMPANION
      if (activeWorkday?.currentCompanionId) {
        // If not already a companion
        if (!service?.companionIds?.includes(activeWorkday.currentCompanionId)) {
          await addCompanionToService(serviceId, activeWorkday.currentCompanionId);
        }
      }

      // Limpiar sugerencia utilizada
      localStorage.removeItem(`detected_entry_${serviceId}`);
      setSuggestedIn(null);

      // Create task execution entries for each task
      let currentTasks = tasks;
      if (currentTasks.length === 0) {
        currentTasks = await getCommunityTasks(service.communityId);
        setTasks(currentTasks);
      }

      for (const task of currentTasks) {
        const existing = taskExecutions.find(e => e.communityTaskId === task.id);
        if (!existing) {
          await createTaskExecution({
            scheduledServiceId: serviceId,
            communityTaskId: task.id,
            userId: userProfile.uid,
          });
        }
      }

      await loadStaticData();
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
      loadStaticData();
    } catch (err) {
      alert('Error: ' + err);
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleTaskStatus(exec) {
    const newStatus = exec.status === 'completed' ? 'pending' : 'completed';
    await updateTaskExecution(exec.id, { status: newStatus });
  }

  async function handlePhotoUpload(e, execId) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validar tamaño (ej. 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es demasiado grande (máximo 10MB)');
      return;
    }

    setUploadingPhoto(true);
    try {
      const url = await uploadPhoto(file, userProfile.uid, serviceId);
      
      // Actualizar DB
      await updateDoc(doc(db, 'taskExecutions', execId), {
        photoUrls: arrayUnion(url)
      });
      
      // Actualizar estado local inmediatamente para mejor UX
      setTaskExecutions(prev => prev.map(ex => {
        if (ex.id === execId) {
          return {
            ...ex,
            photoUrls: [...(ex.photoUrls || []), url]
          };
        }
        return ex;
      }));
      
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Error subiendo foto: ' + (err.message || 'Error desconocido'));
    } finally {
      setUploadingPhoto(false);
      if (e.target) e.target.value = ''; // Clear input
    }
  }

  async function handleSaveNotes(execId) {
    await updateTaskExecution(execId, { notes });
  }

  if (loading) {
    return <div className="flex justify-center p-6"><div className="spinner"></div></div>;
  }

  if (!service) {
    return <div className="empty-state"><p>Servicio no encontrado</p></div>;
  }

  const isCheckedIn = !!activeCheckIn;
  const isCompleted = service.status === 'completed';
  const isInProgress = service.status === 'in_progress';
  const isTitular = service.assignedUserId === userProfile.uid;
  // Can edit if titular checked in OR is active companion and service is in progress
  const canEdit = !isCompleted && (isCheckedIn || isInProgress);
  const showTasks = isInProgress || isCompleted;

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



      {/* Check-in/out button */}
      {otherActiveCheckIn && !isCompleted && isTitular && (
        <div className="card mb-4" style={{ border: '2px solid var(--color-warning)', background: 'var(--color-warning-light)' }}>
          <p className="text-sm font-bold text-warning-dark mb-2">
            ⚠️ Tienes otro servicio en curso
          </p>
          <p className="text-xs mb-3">
            Debes finalizar el servicio activo antes de iniciar uno nuevo.
          </p>
          <button 
            className="btn btn-warning btn-sm w-full"
            onClick={() => navigate(`/operario/servicio/${otherActiveCheckIn.scheduledServiceId}`)}
          >
            Ir al servicio activo
          </button>
        </div>
      )}

      {((!isCompleted) || (isCheckedIn)) && isTitular && !otherActiveCheckIn && (
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
            <div className="flex flex-col gap-2 w-full">
              <button
                className="checkin-btn start"
                onClick={() => handleCheckIn()}
                disabled={actionLoading || geoLoading}
              >
                {actionLoading ? '📍 Obteniendo ubicación...' : '📍 Iniciar servicio'}
              </button>
              
              {isInProgress && (
                <button
                  className="btn btn-warning w-full flex items-center justify-center gap-2 mt-2"
                  onClick={async () => {
                    if (window.confirm('No tienes un fichaje activo. ¿Deseas marcar este servicio como terminado directamente?')) {
                      setActionLoading(true);
                      try {
                        await updateScheduledServiceStatus(serviceId, 'completed');
                        alert('Servicio marcado como terminado');
                        navigate('/operario');
                      } catch(e) {
                        alert('Error: ' + e.message);
                      } finally {
                        setActionLoading(false);
                      }
                    }
                  }}
                  disabled={actionLoading}
                >
                  ⚠️ Forzar Finalización
                </button>
              )}
            </div>
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
        {!showTasks && tasks.length > 0 ? (
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
                    onClick={() => canEdit && toggleTaskStatus(exec)}
                  >
                    {isDone && '✓'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className={`task-name ${isDone ? 'done' : ''}`}>
                      {task?.taskName || 'Tarea'}
                    </div>
                    
                    {/* Notes */}
                    {canEdit && (
                      <div className="mt-2">
                        <textarea
                          className="form-textarea"
                          placeholder="Añadir notas..."
                          style={{ minHeight: '50px', fontSize: 'var(--font-xs)' }}
                          defaultValue={exec.notes || ''}
                          onBlur={async (e) => {
                            if (e.target.value !== exec.notes) {
                              const val = e.target.value;
                              await updateTaskExecution(exec.id, { notes: val });
                              setTaskExecutions(prev => prev.map(ex => 
                                ex.id === exec.id ? { ...ex, notes: val } : ex
                              ));
                            }
                          }}
                        />
                      </div>
                    )}
                    {exec.notes && !canEdit && (
                      <p className="text-xs text-muted mt-2">📝 {exec.notes}</p>
                    )}

                    {/* Photos */}
                    <div className="photo-upload">
                      {exec.photoUrls?.map((url, i) => (
                        <img key={i} src={url} alt={`Evidencia ${i+1}`} className="photo-thumb" />
                      ))}
                      {canEdit && (
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

      {isTitular && (
        <div className="card mt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title m-0">🤝 Acompañantes</h3>
          </div>
          
          {activeWorkday?.currentCompanionId && (
            <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
              <span className="text-blue-600 text-sm">🤝</span>
              <span className="text-[10px] text-blue-700 font-medium">
                Acompañante global configurado: <strong>{operariosMap[activeWorkday.currentCompanionId] || '...'}</strong>
              </span>
            </div>
          )}
          
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
                    {isActive && !isCompleted && log.userId !== activeWorkday?.currentCompanionId && (
                      <button 
                        className="btn btn-ghost btn-xs text-danger"
                        onClick={() => handleRemoveCompanion(log.userId)}
                        style={{ border: '1px solid var(--color-danger)' }}
                      >
                        Quitar
                      </button>
                    )}
                    {isActive && log.userId === activeWorkday?.currentCompanionId && (
                      <span className="text-[10px] font-bold text-blue-500 uppercase">Fijo</span>
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
