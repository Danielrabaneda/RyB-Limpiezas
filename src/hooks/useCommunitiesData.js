import { useState, useEffect, useCallback } from "react";
import {
  getCommunities,
  createCommunity,
  updateCommunity,
  deleteCommunity,
} from "../services/communityService";
import { getOperarios } from "../services/authService";
import { getAdministrators } from "../services/administratorService";
import {
  getPendingSuggestionsForCommunity,
  acceptSuggestion,
  rejectSuggestion,
} from "../services/gpsSuggestionService";
import { useTenant } from "../contexts/TenantContext";

export default function useCommunitiesData({
  actionLoading,
  setActionLoading,
}) {
  const { companyId } = useTenant();
  // Core states matching the approved plan
  const [communities, setCommunities] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [administrators, setAdministrators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [geocoding, setGeocoding] = useState(false);

  // Form states and GPS suggestions inside the edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingCommunity, setEditingCommunity] = useState(null);
  const [gpsSuggestions, setGpsSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [form, setForm] = useState({
    name: "",
    address: "",
    lat: "",
    lng: "",
    type: "comunidad",
    contactPerson: "",
    contactPhone: "",
    individualTimeTracking: false,
    preferredTime: "",
    billingCif: "",
    billingAddress: "",
    basePrice: "0",
    paymentMethod: "transferencia",
    billingEmail: "",
    billingIban: "",
    billingMandateRef: "",
    billingMandateDate: "",
    administratorId: "",
  });

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [comms, ops, admins] = await Promise.all([
        getCommunities(companyId),
        getOperarios(companyId),
        getAdministrators(companyId),
      ]);
      setCommunities(comms || []);
      setOperarios(ops || []);
      setAdministrators(admins || []);
      setSelectedCommunity((current) => {
        if (!current) return null;
        const fresh = comms.find((c) => c.id === current.id);
        return fresh ? { ...current, ...fresh } : current;
      });
    } catch (err) {
      console.error("Error loading communities data:", err);
      alert("Error crítico al cargar datos: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [loadData, companyId]);

  const openCreateModal = () => {
    setEditingCommunity(null);
    setForm({
      name: "",
      address: "",
      lat: "",
      lng: "",
      type: "comunidad",
      contactPerson: "",
      contactPhone: "",
      individualTimeTracking: false,
      preferredTime: "",
      billingCif: "",
      billingAddress: "",
      basePrice: "0",
      paymentMethod: "transferencia",
      billingEmail: "",
      billingIban: "",
      billingMandateRef: "",
      billingMandateDate: "",
      administratorId: "",
    });
    setShowModal(true);
  };

  const openEditModal = (comm) => {
    setEditingCommunity(comm);
    setForm({
      name: comm.name,
      address: comm.address,
      lat: comm.location?._lat || comm.location?.latitude || "",
      lng: comm.location?._long || comm.location?.longitude || "",
      type: comm.type,
      contactPerson: comm.contactPerson || "",
      contactPhone: comm.contactPhone || "",
      individualTimeTracking: comm.individualTimeTracking || false,
      preferredTime: comm.preferredTime || "",
      billingCif: comm.billingCif || "",
      billingAddress: comm.billingAddress || "",
      basePrice: String(comm.basePrice || 0),
      paymentMethod: comm.paymentMethod || "transferencia",
      billingEmail: comm.billingEmail || "",
      billingIban: comm.billingIban || "",
      billingMandateRef: comm.billingMandateRef || "",
      billingMandateDate: comm.billingMandateDate || "",
      administratorId: comm.administratorId || "",
    });
    setShowModal(true);
    loadGPSSuggestions(comm.id);
  };

  const loadGPSSuggestions = async (communityId) => {
    if (!communityId || !companyId) return;
    setLoadingSuggestions(true);
    try {
      const suggestions = await getPendingSuggestionsForCommunity(companyId, communityId);
      setGpsSuggestions(suggestions);
    } catch (err) {
      console.error("Error loading GPS suggestions:", err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion) => {
    setForm((f) => ({
      ...f,
      lat: suggestion.lat.toFixed(7),
      lng: suggestion.lng.toFixed(7),
    }));
    if (!companyId) return;
    await acceptSuggestion(companyId, suggestion.id);
    setGpsSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
  };

  const handleRejectSuggestion = async (suggestionId) => {
    if (!companyId) return;
    await rejectSuggestion(companyId, suggestionId);
    setGpsSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
  };

  const handleGeocode = async () => {
    if (!form.address) return alert("Introduce una dirección primero");
    setGeocoding(true);

    try {
      const addressParts = form.address.split(",").map((p) => p.trim());
      const city = addressParts.length > 1 ? addressParts[1] : "";

      const queries = [
        form.address,
        addressParts.filter((_, i) => i !== 0).join(", "),
        city || "Murcia, España",
      ];

      let result = null;

      for (const query of queries) {
        if (!query) continue;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=es`;
        const response = await fetch(url, {
          headers: {
            "Accept-Language": "es",
            "User-Agent": "RyB-Limpiezas-App/1.0",
          },
        });
        const data = await response.json();
        if (data && data.length > 0) {
          result = data[0];
          break;
        }
      }

      if (result) {
        setForm((f) => ({
          ...f,
          lat: parseFloat(result.lat).toFixed(6),
          lng: parseFloat(result.lon).toFixed(6),
        }));

        // Exact parity with original: notify aproximated location console log
        if (
          queries.indexOf(result.display_name) !== 0 &&
          !result.display_name
            .toLowerCase()
            .includes(addressParts[0].toLowerCase())
        ) {
          console.log("Ubicación aproximada encontrada:", result.display_name);
        }
      } else {
        alert(
          "No se pudo encontrar la ubicación. Intenta escribir solo el nombre de la calle y la ciudad.",
        );
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      alert("Error al conectar con el servicio de mapas.");
    } finally {
      setGeocoding(false);
    }
  };

  const handleSaveCommunity = async (e) => {
    if (e) e.preventDefault();
    if (actionLoading) return;
    setActionLoading(true);
    try {
      let finalBillingEmail = form.billingEmail || "";
      const emailInput = document.getElementById("new-billing-email");
      if (emailInput && emailInput.value.trim()) {
        const val = emailInput.value.trim().replace(/[,;]/g, "");
        if (val && val.includes("@")) {
          const list = finalBillingEmail
            .split(/[,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
          if (!list.includes(val)) {
            list.push(val);
            finalBillingEmail = list.join(", ");
          }
        }
      }

      const communityData = {
        name: form.name,
        address: form.address,
        lat: parseFloat(form.lat) || 0,
        lng: parseFloat(form.lng) || 0,
        type: form.type,
        contactPerson: form.contactPerson,
        contactPhone: form.contactPhone,
        individualTimeTracking: !!form.individualTimeTracking,
        preferredTime: form.preferredTime || null,
        billingCif: form.billingCif || "",
        billingAddress: form.billingAddress || "",
        basePrice: parseFloat(form.basePrice) || 0,
        paymentMethod: form.paymentMethod || "transferencia",
        billingEmail: finalBillingEmail,
        billingIban: form.billingIban || "",
        billingMandateRef: form.billingMandateRef || "",
        billingMandateDate: form.billingMandateDate || "",
        administratorId: form.administratorId || "",
      };

      if (editingCommunity) {
        await updateCommunity(companyId, editingCommunity.id, communityData);
      } else {
        await createCommunity(companyId, communityData);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCommunity = async (id) => {
    if (!confirm("¿Desactivar esta comunidad?")) return;
    if (actionLoading || !companyId) return;
    setActionLoading(true);
    try {
      await deleteCommunity(companyId, id);
      setSelectedCommunity(null);
      await loadData();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return {
    communities,
    setCommunities,
    operarios,
    setOperarios,
    administrators,
    setAdministrators,
    loading,
    setLoading,
    selectedCommunity,
    setSelectedCommunity,
    assignments,
    setAssignments,
    showModal,
    setShowModal,
    editingCommunity,
    setEditingCommunity,
    form,
    setForm,
    geocoding,
    setGeocoding,
    gpsSuggestions,
    setGpsSuggestions,
    loadingSuggestions,
    setLoadingSuggestions,
    loadData,
    openCreateModal,
    openEditModal,
    loadGPSSuggestions,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleGeocode,
    handleSaveCommunity,
    handleDeleteCommunity,
  };
}
