import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantDoc } from "../utils/tenantFirestore";
import { useTenant } from "../contexts/TenantContext";
import {
  enableClientPortal,
  disableClientPortal,
} from "../services/clientPortalService";
import { uploadPhoto } from "../services/storageService";
import {
  uploadDocument,
  getCommunityGuides,
  deleteDocument,
} from "../services/documentVaultService";

export default function useCommunityPortal({
  selectedCommunity,
  setSelectedCommunity,
  setCommunities,
  actionLoading,
  setActionLoading,
  userProfile,
}) {
  const { companyId } = useTenant();
  // Document library and portal states
  const [communityDocs, setCommunityDocs] = useState([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", file: null });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const handleTogglePortal = async () => {
    if (!selectedCommunity) return;
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (selectedCommunity.portalToken) {
        if (
          !window.confirm(
            "¿Estás seguro de que quieres desactivar el portal público de esta comunidad? El enlace actual dejará de funcionar inmediatamente.",
          )
        )
          return;
        await disableClientPortal(
          companyId,
          selectedCommunity.id,
          selectedCommunity.portalToken,
        );
        const updated = {
          ...selectedCommunity,
          portalToken: null,
          portalTokenCreatedAt: null,
        };
        setSelectedCommunity(updated);
        setCommunities((prev) =>
          prev.map((c) => (c.id === selectedCommunity.id ? updated : c)),
        );
        alert("Portal público desactivado correctamente.");
      } else {
        const token = await enableClientPortal(companyId, selectedCommunity.id);
        const updated = {
          ...selectedCommunity,
          portalToken: token,
          portalTokenCreatedAt: new Date(),
        };
        setSelectedCommunity(updated);
        setCommunities((prev) =>
          prev.map((c) => (c.id === selectedCommunity.id ? updated : c)),
        );
        alert("Portal público activado correctamente.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al cambiar el estado del portal: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!selectedCommunity || !selectedCommunity.portalToken) return;
    if (
      !window.confirm(
        "¿Estás seguro de que quieres cambiar el enlace? El enlace actual y el código QR anterior dejarán de funcionar de inmediato.",
      )
    )
      return;
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await disableClientPortal(
        companyId,
        selectedCommunity.id,
        selectedCommunity.portalToken,
      );
      const token = await enableClientPortal(companyId, selectedCommunity.id);
      const updated = {
        ...selectedCommunity,
        portalToken: token,
        portalTokenCreatedAt: new Date(),
      };
      setSelectedCommunity(updated);
      setCommunities((prev) =>
        prev.map((c) => (c.id === selectedCommunity.id ? updated : c)),
      );
      alert("Enlace mágico regenerado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al regenerar el enlace: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleVisitTimes = async () => {
    if (!selectedCommunity) return;
    const newValue = !(selectedCommunity.showVisitTimes !== false);
    try {
      const communityRef = tenantDoc(db, companyId, "communities", selectedCommunity.id);
      await updateDoc(communityRef, { showVisitTimes: newValue });

      const updated = { ...selectedCommunity, showVisitTimes: newValue };
      setSelectedCommunity(updated);
      setCommunities((prev) =>
        prev.map((c) => (c.id === selectedCommunity.id ? updated : c)),
      );
    } catch (err) {
      console.error("Error al actualizar opciones del portal:", err);
      alert("Error al guardar configuración: " + err.message);
    }
  };

  const handleAddDocument = async (e) => {
    if (e) e.preventDefault();
    if (!docForm.title || !docForm.file) {
      alert("Por favor, indica un título y selecciona un archivo.");
      return;
    }
    setUploadingDoc(true);
    try {
      const fileUrl = await uploadPhoto(
        companyId,
        docForm.file,
        userProfile.uid,
        `guides_${selectedCommunity.id}`,
      );
      await uploadDocument(companyId, {
        title: docForm.title,
        category: "community_guide",
        communityId: selectedCommunity.id,
        fileUrl,
      });
      alert("Documento guardado con éxito.");
      setShowDocModal(false);
      setDocForm({ title: "", file: null });
      const updatedDocs = await getCommunityGuides(companyId, selectedCommunity.id);
      setCommunityDocs(updatedDocs);
    } catch (err) {
      console.error(err);
      alert("Error al subir documento: " + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!confirm("¿Seguro que deseas eliminar este documento?")) return;
    try {
      await deleteDocument(companyId, docId);
      alert("Documento eliminado.");
      const updatedDocs = await getCommunityGuides(companyId, selectedCommunity.id);
      setCommunityDocs(updatedDocs);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar documento: " + err.message);
    }
  };

  return {
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
    handleDeleteDoc,
  };
}
