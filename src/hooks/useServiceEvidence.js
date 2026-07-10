import { useState, useEffect, useRef } from 'react';
import { uploadPhoto } from '../services/storageService';
import { updateScheduledServiceNotesAndPhotos } from '../services/scheduleService';

export function useServiceEvidence(serviceId, userProfile, service) {
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [clientSignature, setClientSignature] = useState(null);
  
  const [generalNotes, setGeneralNotes] = useState('');
  const [generalPhotos, setGeneralPhotos] = useState([]);
  const [uploadingGeneralPhoto, setUploadingGeneralPhoto] = useState(false);
  const [submittingGeneralEvidence, setSubmittingGeneralEvidence] = useState(false);
  const [submittedGeneralEvidence, setSubmittedGeneralEvidence] = useState(false);

  const lastInitializedServiceId = useRef(null);

  // Sincronizar evidencias generales únicamente cuando el servicio se carga por primera vez
  useEffect(() => {
    if (service && service.id === serviceId && lastInitializedServiceId.current !== serviceId) {
      setGeneralNotes(service.generalNotes || '');
      setGeneralPhotos(service.generalPhotoUrls || []);
      lastInitializedServiceId.current = serviceId;
    }
  }, [service, serviceId]);

  async function handleGeneralPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es demasiado grande (máximo 10MB)');
      return;
    }

    setUploadingGeneralPhoto(true);
    try {
      const url = await uploadPhoto(file, userProfile.uid, serviceId);
      setGeneralPhotos(prev => [...prev, url]);
    } catch (err) {
      alert('Error al subir foto: ' + err.message);
    } finally {
      setUploadingGeneralPhoto(false);
      if (e.target) e.target.value = '';
    }
  }

  async function handleSubmitGeneralEvidence() {
    setSubmittingGeneralEvidence(true);
    try {
      await updateScheduledServiceNotesAndPhotos(serviceId, generalNotes, generalPhotos);
      setSubmittedGeneralEvidence(true);
      setTimeout(() => setSubmittedGeneralEvidence(false), 3000);
    } catch (error) {
      alert('Error guardando evidencia: ' + error.message);
    } finally {
      setSubmittingGeneralEvidence(false);
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
    handleGeneralPhotoUpload,
    handleSubmitGeneralEvidence
  };
}
