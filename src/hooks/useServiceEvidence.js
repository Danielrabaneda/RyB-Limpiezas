import { useState, useEffect, useRef } from "react";
import { useTenant } from "../contexts/TenantContext";
import { uploadPhoto } from "../services/storageService";
import { updateScheduledServiceNotesAndPhotos } from "../services/scheduleService";

export function useServiceEvidence(
  serviceId,
  userProfile,
  service,
  options = {},
) {
  const { companyId } = useTenant();
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [clientSignature, setClientSignature] = useState(null);

  const [generalNotes, setGeneralNotes] = useState("");
  const [generalPhotos, setGeneralPhotos] = useState([]);
  const [uploadingGeneralPhoto, setUploadingGeneralPhoto] = useState(false);
  const [submittingGeneralEvidence, setSubmittingGeneralEvidence] =
    useState(false);
  const [submittedGeneralEvidence, setSubmittedGeneralEvidence] =
    useState(false);

  const lastInitializedServiceId = useRef(null);

  // Sincronizar evidencias generales únicamente cuando el servicio se carga por primera vez
  useEffect(() => {
    if (
      service &&
      service.id === serviceId &&
      lastInitializedServiceId.current !== serviceId
    ) {
      setGeneralNotes(service.generalNotes || "");
      setGeneralPhotos(service.generalPhotoUrls || []);
      lastInitializedServiceId.current = serviceId;
    }
  }, [service, serviceId]);

  async function handleGeneralPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("La imagen es demasiado grande (máximo 10MB)");
      return;
    }

    setUploadingGeneralPhoto(true);
    try {
      const url = await uploadPhoto(companyId, file, userProfile.uid, serviceId);
      setGeneralPhotos((prev) => [...prev, url]);
    } catch (err) {
      alert("Error al subir foto: " + err.message);
    } finally {
      setUploadingGeneralPhoto(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleSubmitGeneralEvidence() {
    setSubmittingGeneralEvidence(true);
    try {
      await updateScheduledServiceNotesAndPhotos(
        serviceId,
        generalNotes,
        generalPhotos,
      );
      setSubmittedGeneralEvidence(true);
      setTimeout(() => setSubmittedGeneralEvidence(false), 3000);
    } catch (error) {
      alert("Error guardando evidencia: " + error.message);
    } finally {
      setSubmittingGeneralEvidence(false);
    }
  }

  const [uploadingSignature, setUploadingSignature] = useState(false);

  async function handleSaveSignature({ base64Image, signerName }) {
    setShowSignatureModal(false);
    setUploadingSignature(true);
    if (options.setActionLoading) options.setActionLoading(true);
    try {
      const byteString = atob(base64Image.split(",")[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: "image/png" });
      const file = new File(
        [blob],
        `signature_${serviceId}_${Date.now()}.png`,
        { type: "image/png" },
      );

      const imageUrl = await uploadPhoto(companyId, file, userProfile.uid, serviceId);
      setClientSignature({
        imageUrl,
        signerName,
        signedAt: new Date(),
      });
      alert("Firma guardada correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar firma: " + err.message);
    } finally {
      setUploadingSignature(false);
      if (options.setActionLoading) options.setActionLoading(false);
    }
  }

  return {
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
  };
}
