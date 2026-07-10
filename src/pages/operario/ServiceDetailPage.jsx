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
import CheckInControl from '../../components/operario/CheckInControl';
import TasksList from '../../components/operario/TasksList';
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
  const [actionLoading, setActionLoading] = useState(false);

  // Integrar hook de evidencias y firma (pasando setActionLoading para bloquear UI al firmar)
  const serviceEvidence = useServiceEvidence(serviceId, userProfile, service, {
    setActionLoading
  });
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
    uploadingSignature,
    handleGeneralPhotoUpload,
    handleSubmitGeneralEvidence,
    handleSaveSignature
  } = serviceEvidence;

  // Integrar hook de flujo de check-in (pasando clientSignature, setClientSignature y actionLoading compartido)
  const checkInFlow = useCheckInFlow(serviceId, userProfile, serviceData, {
    navigate,
    getCurrentPosition,
    getFilteredPosition,
    clientSignature,
    setClientSignature,
    actionLoading,
    setActionLoading
  });

  const {
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



      <CheckInControl
        isCheckedIn={isCheckedIn}
        isCompleted={isCompleted}
        isTitular={isTitular}
        otherActiveCheckIn={otherActiveCheckIn}
        suggestedIn={suggestedIn}
        entrySource={entrySource}
        estimatedIn={estimatedIn}
        estimatedOut={estimatedOut}
        activeWorkday={activeWorkday}
        suggestedOut={suggestedOut}
        showManualEntryForm={showManualEntryForm}
        setShowManualEntryForm={setShowManualEntryForm}
        manualEntryTime={manualEntryTime}
        setManualEntryTime={setManualEntryTime}
        showFullManualForm={showFullManualForm}
        setShowFullManualForm={setShowFullManualForm}
        showManualExitForm={showManualExitForm}
        setShowManualExitForm={setShowManualExitForm}
        manualExitTime={manualExitTime}
        setManualExitTime={setManualExitTime}
        actionLoading={actionLoading}
        geoLoading={geoLoading}
        activeCheckIn={activeCheckIn}
        clientSignature={clientSignature}
        setClientSignature={setClientSignature}
        setShowSignatureModal={setShowSignatureModal}
        isInProgress={isInProgress}
        navigate={navigate}
        handleCheckIn={handleCheckIn}
        handleCheckOut={handleCheckOut}
        handleFullManualSubmit={handleFullManualSubmit}
        handleForceComplete={handleForceComplete}
      />

      <TasksList
        showTasks={showTasks}
        tasks={tasks}
        taskExecutions={taskExecutions}
        service={service}
        canEdit={canEdit}
        toggleTaskStatus={toggleTaskStatus}
      />

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
          onSave={handleSaveSignature}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  );
}
