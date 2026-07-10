import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useServiceData } from '../../hooks/useServiceData';
import { useCheckInFlow } from '../../hooks/useCheckInFlow';
import { useServiceEvidence } from '../../hooks/useServiceEvidence';
import { transferService, rescheduleService } from '../../services/transferService';
import TransferModal from '../../components/TransferModal';
import RescheduleModal from '../../components/RescheduleModal';
import SignatureCanvas from '../../components/SignatureCanvas';
import CommunityInfoCard from '../../components/operario/CommunityInfoCard';
import CommunityDocsCard from '../../components/operario/CommunityDocsCard';
import { format } from 'date-fns';

export default function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { userProfile } = useAuth();
  const { getCurrentPosition, getFilteredPosition, loading: geoLoading } = useGeolocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Integrar hook de datos del servicio
  const serviceData = useServiceData(serviceId, userProfile);
  const {
    service,
    community,
    tasks,
    taskExecutions,
    activeCheckIn,
    otherActiveCheckIn,
    loading,
    operariosMap,
    activeWorkday,
    communityDocs,
    groupedServices,
    loadStaticData,
    toggleTaskStatus,
    handleRemoveCompanion,
  } = serviceData;

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);

  // Integrar hook de evidencias y firma
  const serviceEvidence = useServiceEvidence(serviceId, userProfile, service);
  const {
    showSignatureModal,
    setShowSignatureModal,
    clientSignature,
    setClientSignature,
    generalNotes,
    setGeneralNotes,
    generalPhotos,
    setGeneralPhotos,
    uploadingGeneralPhoto,
    submittingGeneralEvidence,
    submittedGeneralEvidence,
    handleGeneralPhotoUpload,
    handleSubmitGeneralEvidence
  } = serviceEvidence;

  // Integrar hook de flujo de check-in (pasando clientSignature y setClientSignature desde serviceEvidence)
  const checkInFlow = useCheckInFlow(serviceId, userProfile, serviceData, {
    navigate,
    getCurrentPosition,
    getFilteredPosition,
    clientSignature,
    setClientSignature
  });

  const {
    actionLoading,
    distanceInfo,
    sendingGPS,
    gpsSent,
    suggestedIn,
    entrySource,
    suggestedOut,
    estimatedIn,
    estimatedOut,
    showManualEntryForm,
    setShowManualEntryForm,
    showManualExitForm,
    setShowManualExitForm,
    showFullManualForm,
    setShowFullManualForm,
    manualEntryTime,
    setManualEntryTime,
    manualExitTime,
    setManualExitTime,
    handleCheckIn,
    handleCheckOut,
    handleFullManualSubmit,
    handleForceComplete,
    sendGPSLocation
  } = checkInFlow;



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

  async function handleRescheduleConfirm(newDate) {
    setActionLoading(true);
    try {
      await rescheduleService({
        serviceId,
        newDate,
        requesterRole: 'operario',
        userId: userProfile.uid
      });
      alert('Cambio de fecha solicitado. El administrador deberá validarlo.');
      setRescheduleModalOpen(false);
      fetchServiceDetails();
    } catch (err) {
      alert('Error en el cambio de fecha: ' + err.message);
    } finally {
      setActionLoading(false);
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
  const isCompanion = !isTitular;
  // Can edit if titular checked in OR is active companion and service is in progress
  const canEdit = !isCompleted && (isCheckedIn || isInProgress);
  const showTasks = isInProgress || isCompleted;

  return (
    <div className="animate-fadeIn">
      {/* Back button */}
      <button className="btn btn-ghost mb-4" onClick={() => navigate('/operario')} style={{ marginLeft: '-8px' }}>
        ← Volver
      </button>

      <CommunityInfoCard
        community={community}
        service={service}
        isCompanion={isCompanion}
        isCompleted={isCompleted}
        isCheckedIn={isCheckedIn}
        isTitular={isTitular}
        setTransferModalOpen={setTransferModalOpen}
        setRescheduleModalOpen={setRescheduleModalOpen}
        distanceInfo={distanceInfo}
        gpsSent={gpsSent}
        sendingGPS={sendingGPS}
        sendGPSLocation={sendGPSLocation}
      />

      <CommunityDocsCard communityDocs={communityDocs} />

      <TransferModal 
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onConfirm={handleTransferConfirm}
        loading={actionLoading}
        title={`Traspasar servicio ${community?.name}`}
      />

      <RescheduleModal 
        isOpen={rescheduleModalOpen}
        onClose={() => setRescheduleModalOpen(false)}
        onConfirm={handleRescheduleConfirm}
        currentDate={service?.scheduledDate}
        loading={actionLoading}
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

      {((!isCompleted && isTitular) || isCheckedIn) && !otherActiveCheckIn && (
        <div className="mb-4 flex flex-col gap-3">
          
          {/* ================= SUGERENCIAS DE FICHAJE ================= */}
          {!isCheckedIn && (suggestedIn || estimatedIn || activeWorkday?.startTime) && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold text-slate-700 mb-2">💡 Sugerencias de Llegada:</h4>
              <div className="flex flex-col gap-2">
                {suggestedIn && (
                  <button 
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{ textAlign: 'left', background: entrySource === 'estimated' ? '#fdf4ff' : 'var(--color-accent-light)', borderColor: entrySource === 'estimated' ? '#f0abfc' : 'var(--color-accent)', color: '#0f172a', padding: '12px 16px', fontSize: '0.85rem' }}
                    onClick={() => {
                      handleCheckIn(suggestedIn);
                    }}
                    disabled={actionLoading}
                  >
                    <span>
                      {entrySource === 'estimated' ? '⏱️ Llegada estimada (background): ' : '📍 GPS detectado: '} 
                      <strong>{format(suggestedIn, 'HH:mm')}</strong>
                    </span>
                    <span>Usar →</span>
                  </button>
                )}
                {estimatedIn && (!suggestedIn || Math.abs(estimatedIn.getTime() - suggestedIn.getTime()) > 60000) && (
                  <button 
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{ textAlign: 'left', background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1', padding: '12px 16px', fontSize: '0.85rem' }}
                    onClick={() => {
                      handleCheckIn(estimatedIn);
                    }}
                    disabled={actionLoading}
                  >
                    <span>🚗 Llegada estimada (viaje): <strong>{format(estimatedIn, 'HH:mm')}</strong></span>
                    <span>Usar →</span>
                  </button>
                )}
                {activeWorkday?.startTime && !suggestedIn && !estimatedIn && (
                  <button 
                    className="btn btn-secondary flex items-center justify-between font-bold w-full"
                    style={{ textAlign: 'left', background: '#faf5ff', borderColor: '#e9d5ff', color: '#7c3aed', padding: '12px 16px', fontSize: '0.85rem' }}
                    onClick={() => {
                      const wdStart = activeWorkday.startTime.toDate ? activeWorkday.startTime.toDate() : new Date(activeWorkday.startTime);
                      handleCheckIn(wdStart);
                    }}
                    disabled={actionLoading}
                  >
                    <span>👷 Inicio de jornada: <strong>{format(activeWorkday.startTime.toDate ? activeWorkday.startTime.toDate() : new Date(activeWorkday.startTime), 'HH:mm')}</strong></span>
                    <span>Usar →</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {isCheckedIn && suggestedOut && (
            <div className="exit-suggestion-card animate-fadeIn">
              <div className="exit-suggestion-icon">🏃</div>
              <div className="exit-suggestion-content">
                <p className="exit-suggestion-title">Salida confirmada</p>
                <p className="exit-suggestion-subtitle">
                  Se detectó tu salida a las <strong>{format(suggestedOut, 'HH:mm')}</strong> y no volviste en 5 minutos
                </p>
              </div>
              <button 
                className="btn-pulse-glow" 
                onClick={() => handleCheckOut(suggestedOut)}
                disabled={actionLoading}
              >
                ⏱️ Finalizar a las {format(suggestedOut, 'HH:mm')}
              </button>
            </div>
          )}

          {/* ================= FORMULARIO ENTRADA MANUAL ================= */}
          {showManualEntryForm && !isCheckedIn && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold mb-3">⏱️ Iniciar con Hora Manual</h4>
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-xs font-semibold text-slate-600">Hora de llegada:</span>
                <input 
                  type="time" 
                  value={manualEntryTime} 
                  onChange={(e) => setManualEntryTime(e.target.value)}
                  className="form-input"
                  style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  className="btn btn-primary btn-sm flex-1 font-bold"
                  onClick={() => {
                    if (!manualEntryTime) return;
                    const [h, m] = manualEntryTime.split(':').map(Number);
                    const entryDate = new Date();
                    entryDate.setHours(h, m, 0, 0);
                    handleCheckIn(entryDate);
                    setShowManualEntryForm(false);
                  }}
                  disabled={actionLoading}
                >
                  Confirmar Entrada
                </button>
                <button 
                  className="btn btn-secondary btn-sm font-bold"
                  onClick={() => setShowManualEntryForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ================= FORMULARIO COMPLETO RETROACTIVO ================= */}
          {showFullManualForm && !isCheckedIn && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold mb-1">📝 Registrar Servicio Completo</h4>
              <p className="text-[10px] text-muted mb-4">Registra entrada y salida de forma retroactiva si no pudiste hacerlo al momento.</p>
              
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-600">Hora de llegada:</span>
                  <input 
                    type="time" 
                    value={manualEntryTime} 
                    onChange={(e) => setManualEntryTime(e.target.value)}
                    className="form-input"
                    style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-600">Hora de salida:</span>
                  <input 
                    type="time" 
                    value={manualExitTime} 
                    onChange={(e) => setManualExitTime(e.target.value)}
                    className="form-input"
                    style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  className="btn btn-success btn-sm flex-1 font-bold"
                  onClick={handleFullManualSubmit}
                  disabled={actionLoading}
                >
                  Guardar Registro
                </button>
                <button 
                  className="btn btn-secondary btn-sm font-bold"
                  onClick={() => setShowFullManualForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ================= FORMULARIO SALIDA MANUAL ================= */}
          {showManualExitForm && isCheckedIn && (
            <div className="card animate-fadeIn" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-4)' }}>
              <h4 className="text-xs font-bold mb-3">🛑 Finalizar con Hora Manual</h4>
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-xs font-semibold text-slate-600">Hora de salida:</span>
                <input 
                  type="time" 
                  value={manualExitTime} 
                  onChange={(e) => setManualExitTime(e.target.value)}
                  className="form-input"
                  style={{ width: '130px', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  className="btn btn-primary btn-sm flex-1 font-bold"
                  onClick={() => {
                    if (!manualExitTime) return;
                    const [h, m] = manualExitTime.split(':').map(Number);
                    const exitDate = new Date();
                    exitDate.setHours(h, m, 0, 0);
                    
                    const checkInTime = activeCheckIn.checkInTime?.toDate 
                      ? activeCheckIn.checkInTime.toDate() 
                      : new Date(activeCheckIn.checkInTime);
                    
                    if (exitDate.getTime() <= checkInTime.getTime()) {
                      alert('La hora de salida debe ser posterior a la de entrada.');
                      return;
                    }

                    handleCheckOut(exitDate);
                    setShowManualExitForm(false);
                  }}
                  disabled={actionLoading}
                >
                  Confirmar Salida
                </button>
                <button 
                  className="btn btn-secondary btn-sm font-bold"
                  onClick={() => setShowManualExitForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ================= BOTONES DE ACCIÓN PRINCIPALES ================= */}
          {!isCheckedIn ? (
            <div className="flex flex-col gap-2 w-full">
              {!showManualEntryForm && !showFullManualForm && (
                <>
                  <button
                    className="checkin-btn start"
                    onClick={() => handleCheckIn()}
                    disabled={actionLoading || geoLoading}
                  >
                    {actionLoading ? '📍 Obteniendo ubicación...' : '📍 Iniciar servicio'}
                  </button>
                  
                  <div className="flex gap-2 mt-1">
                    <button
                      className="btn btn-secondary btn-sm flex-1 font-bold"
                      onClick={() => setShowManualEntryForm(true)}
                    >
                      ⏱️ Entrada Manual
                    </button>
                    <button
                      className="btn btn-secondary btn-sm flex-1 font-bold"
                      onClick={() => setShowFullManualForm(true)}
                    >
                      📝 Todo Retroactivo
                    </button>
                  </div>
                </>
              )}
              
              {isInProgress && !showManualEntryForm && !showFullManualForm && (
                <button
                  className="btn btn-warning w-full flex items-center justify-center gap-2 mt-2"
                  onClick={handleForceComplete}
                  disabled={actionLoading}
                >
                  ⚠️ Forzar Finalización
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 w-full animate-fadeIn">
              {/* Card de firma del cliente */}
              <div className="card" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', padding: 'var(--space-3) var(--space-4)', margin: 0 }}>
                <h4 style={{ fontSize: 'var(--font-sm)', fontWeight: 'bold', margin: '0 0 var(--space-2) 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ✍️ Firma del Cliente (Opcional)
                </h4>
                {clientSignature ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-success-light)' }}>
                    <div style={{ flex: 1 }}>
                      <span className="text-xs font-bold text-success" style={{ display: 'block' }}>✅ Firma de conformidad registrada</span>
                      <span className="text-[10px] text-muted" style={{ display: 'block' }}>Nombre: {clientSignature.signerName}</span>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-ghost btn-xs" 
                      onClick={() => setClientSignature(null)}
                      style={{ color: 'var(--color-danger)', border: '1px solid var(--color-danger)', padding: '2px 6px', fontSize: '10px' }}
                    >
                      Borrar
                    </button>
                  </div>
                ) : (
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm w-full" 
                    onClick={() => setShowSignatureModal(true)}
                    disabled={actionLoading}
                    style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                  >
                    ✍️ Capturar firma de conformidad
                  </button>
                )}
              </div>

              {!showManualExitForm && (
                <>
                  <button
                    className="checkin-btn stop"
                    onClick={() => handleCheckOut()}
                    disabled={actionLoading || geoLoading}
                  >
                    {actionLoading ? '📍 Finalizando...' : '🛑 Finalizar servicio'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm w-full font-bold mt-1"
                    onClick={() => setShowManualExitForm(true)}
                  >
                    ⏱️ Salida Manual
                  </button>
                </>
              )}
            </div>
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
          <div className="flex flex-col gap-3">
            {taskExecutions.map(exec => {
              const task = tasks.find(t => t.id === exec.communityTaskId);
              const isDone = exec.status === 'completed';
              const isUrgent = task?.isUrgent || service?.isUrgent;
              
              const sName = (task?.taskName || '').toLowerCase();
              const isException = sName.includes('escalera') || sName.includes('portal') || sName.includes('garaje');

              return (
                <button
                  key={exec.id}
                  className={`btn w-full flex flex-col items-center justify-center p-4 rounded-xl shadow-sm transition-all ${
                    isDone 
                      ? 'bg-success text-white border-success' 
                      : 'bg-white text-dark border border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => canEdit && toggleTaskStatus(exec)}
                  style={{ minHeight: '80px' }}
                >
                  <span className="font-bold text-lg mb-1" style={{ wordBreak: 'break-word', textAlign: 'center' }}>
                    {isUrgent && !isDone ? '🚨 ' : ''}{task?.taskName || 'Tarea'}
                  </span>
                  {isDone ? (
                    <span className="text-sm font-semibold opacity-90">✅ COMPLETADO</span>
                  ) : isException ? (
                    <span className="text-xs text-muted font-medium">Automático al finalizar</span>
                  ) : (
                    <span className="text-xs text-primary font-bold uppercase tracking-wide">Pulsar para completar</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* General Evidences Card */}
      {showTasks && canEdit && (
        <div className="card mt-4">
          <h3 className="card-title mb-4">📸 Evidencias y Notas Generales</h3>
          <p className="text-xs text-muted mb-3">
            Las fotos y notas que añadas aquí se registrarán a nombre de esta comunidad para este servicio.
          </p>
          
          <textarea
            className="form-textarea mb-3"
            placeholder="Añadir notas sobre la comunidad..."
            style={{ minHeight: '80px', fontSize: 'var(--font-sm)' }}
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
          />

          <div className="photo-upload mb-4">
            {generalPhotos.map((url, i) => (
              <img key={i} src={url} alt={`Evidencia ${i+1}`} className="photo-thumb" />
            ))}
            <label className="photo-upload-btn">
              📷
              <span>Foto</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleGeneralPhotoUpload}
                disabled={uploadingGeneralPhoto}
              />
            </label>
          </div>

          {(generalPhotos.length > 0 || generalNotes.trim().length > 0) && (
            <div>
              {submittedGeneralEvidence ? (
                <div style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-success-light, #dcfce7)',
                  color: 'var(--color-success, #16a34a)',
                  fontSize: 'var(--font-sm)',
                  fontWeight: 700,
                  textAlign: 'center',
                }}>
                  ✅ Evidencia guardada correctamente
                </div>
              ) : (
                <button
                  className="btn btn-primary w-full p-3 text-sm font-bold"
                  onClick={handleSubmitGeneralEvidence}
                  disabled={submittingGeneralEvidence}
                >
                  {submittingGeneralEvidence ? '⏳ Guardando...' : '📤 Enviar Evidencias'}
                </button>
              )}
            </div>
          )}
          {uploadingGeneralPhoto && <p className="text-xs text-muted mt-2">Subiendo foto...</p>}
        </div>
      )}

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

      {showSignatureModal && (
        <SignatureCanvas 
          onSave={async ({ base64Image, signerName }) => {
            setShowSignatureModal(false);
            setActionLoading(true);
            try {
              // Convert base64 to file
              const byteString = atob(base64Image.split(',')[1]);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: 'image/png' });
              const file = new File([blob], `signature_${serviceId}_${Date.now()}.png`, { type: 'image/png' });
              
              const imageUrl = await uploadPhoto(file, userProfile.uid, serviceId);
              setClientSignature({
                imageUrl,
                signerName,
                signedAt: new Date()
              });
              alert('Firma guardada correctamente.');
            } catch (err) {
              console.error(err);
              alert('Error al guardar firma: ' + err.message);
            } finally {
              setActionLoading(false);
            }
          }}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  );
}
