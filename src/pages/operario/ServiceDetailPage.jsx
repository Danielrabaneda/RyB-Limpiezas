import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useServiceData } from "../../hooks/useServiceData";
import { useCheckInFlow } from "../../hooks/useCheckInFlow";
import { useServiceEvidence } from "../../hooks/useServiceEvidence";
import {
  transferService,
  rescheduleService,
} from "../../services/transferService";
import TransferModal from "../../components/TransferModal";
import RescheduleModal from "../../components/RescheduleModal";
import SignatureCanvas from "../../components/SignatureCanvas";
import CommunityInfoCard from "../../components/operario/CommunityInfoCard";
import CommunityDocsCard from "../../components/operario/CommunityDocsCard";
import CheckInControl from "../../components/operario/CheckInControl";
import TasksList from "../../components/operario/TasksList";
import GeneralEvidenceCard from "../../components/operario/GeneralEvidenceCard";
import CompanionsCard from "../../components/operario/CompanionsCard";

export default function ServiceDetailPage() {
  const { serviceId } = useParams();
  const { userProfile } = useAuth();
  const {
    getCurrentPosition,
    getFilteredPosition,
    loading: geoLoading,
  } = useGeolocation();
  const navigate = useNavigate();

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
    setActionLoading,
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
    handleSaveSignature,
  } = serviceEvidence;

  // Integrar hook de flujo de check-in (pasando clientSignature, setClientSignature y actionLoading compartido)
  const checkInFlow = useCheckInFlow(serviceId, userProfile, serviceData, {
    navigate,
    getCurrentPosition,
    getFilteredPosition,
    clientSignature,
    setClientSignature,
    actionLoading,
    setActionLoading,
  });

  const {
    distanceInfo,
    sendingGPS,
    gpsSent,
    suggestedIn,
    entrySource,
    suggestedOut,
    entryDetails,
    handleDismissSuggestion,
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
    sendGPSLocation,
  } = checkInFlow;

  async function handleTransferConfirm(toUserId) {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      await transferService({
        serviceId,
        fromUserId: userProfile.uid,
        toUserId,
        requesterRole: "operario",
      });
      alert("Traspaso solicitado correctamente.");
      setTransferModalOpen(false);
      navigate("/operario");
    } catch (err) {
      alert("Error en el traspaso: " + err.message);
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
        requesterRole: "operario",
        userId: userProfile.uid,
      });
      alert("Cambio de fecha solicitado. El administrador deberá validarlo.");
      setRescheduleModalOpen(false);
      loadStaticData();
    } catch (err) {
      alert("Error en el cambio de fecha: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="empty-state">
        <p>Servicio no encontrado</p>
      </div>
    );
  }

  const isCheckedIn = !!activeCheckIn;
  const isCompleted = service.status === "completed";
  const isInProgress = service.status === "in_progress";
  const isTitular = service.assignedUserId === userProfile.uid;
  const isCompanion = !isTitular;
  // Can edit if titular checked in OR is active companion and service is in progress
  const canEdit = !isCompleted && (isCheckedIn || isInProgress);
  const showTasks = isInProgress || isCompleted;

  return (
    <div className="animate-fadeIn">
      {/* Back button */}
      <button
        className="btn btn-ghost mb-4"
        onClick={() => navigate("/operario")}
        style={{ marginLeft: "-8px" }}
      >
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
        entryDetails={entryDetails}
        handleDismissSuggestion={handleDismissSuggestion}
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

      <GeneralEvidenceCard
        showTasks={showTasks}
        canEdit={canEdit}
        generalNotes={generalNotes}
        setGeneralNotes={setGeneralNotes}
        generalPhotos={generalPhotos}
        handleGeneralPhotoUpload={handleGeneralPhotoUpload}
        uploadingGeneralPhoto={uploadingGeneralPhoto}
        submittedGeneralEvidence={submittedGeneralEvidence}
        handleSubmitGeneralEvidence={handleSubmitGeneralEvidence}
        submittingGeneralEvidence={submittingGeneralEvidence}
      />

      <CompanionsCard
        isTitular={isTitular}
        activeWorkday={activeWorkday}
        service={service}
        isCompleted={isCompleted}
        operariosMap={operariosMap}
        handleRemoveCompanion={handleRemoveCompanion}
      />

      {showSignatureModal && (
        <SignatureCanvas
          onSave={handleSaveSignature}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  );
}
