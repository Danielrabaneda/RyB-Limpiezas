import { useState, useEffect } from "react";
import {
  getBillingSettings,
  saveBillingSettings,
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  deleteMultipleInvoices,
  emitInvoice,
  updateInvoiceStatus,
  generateMonthlyDrafts,
  getInvoiceTemplates,
  saveInvoiceTemplate,
  deleteInvoiceTemplate,
  getLastEmittedInvoice,
  emitAllInvoices,
  getNextInvoiceNumber,
  uploadInvoicePDFToStorage,
  sendInvoiceEmails,
  sendGroupedInvoiceEmails,
  buildVerifactuQrUrl,
  createRectifyingInvoice,
} from "../../services/invoiceService";
import { getCommunities } from "../../services/communityService";
import { getAdministrators } from "../../services/administratorService";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../contexts/AuthContext";
import { useTenant } from "../../contexts/TenantContext";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import JSZip from "jszip";
import {
  generateSepaXML,
  calculateSepaCreditorId,
  validateIBAN,
} from "../../services/sepaGenerator";

const parseLocaleFloat = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  const clean = String(val).replace(",", ".");
  return parseFloat(clean) || 0;
};

export default function InvoicesPage() {
  const { companyId } = useTenant();
  const { currentUser, userProfile } = useAuth();

  // Date filter states
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterMonth, setFilterMonth] = useState(String(currentMonth));

  // Tabs: 'drafts', 'pending', 'paid', 'settings'
  const [activeTab, setActiveTab] = useState("drafts");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAdmin, setFilterAdmin] = useState("");

  // Data states
  const [invoices, setInvoices] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [administrators, setAdministrators] = useState([]);
  const [billingSettings, setBillingSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewModal, setPreviewModal] = useState({ open: false, pdfUrl: "" });
  const [downloadModal, setDownloadModal] = useState({
    open: false,
    invoices: [],
  });
  const [lastInvoice, setLastInvoice] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState({});
  const [emailProgressModal, setEmailProgressModal] = useState({
    open: false,
    total: 0,
    current: 0,
    status: "idle", // 'idle', 'sending', 'completed', 'error'
    log: [],
  });

  // Templates and Add Modal states
  const [templates, setTemplates] = useState([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    clientType: "community", // 'community' or 'manual'
    selectedCommunityId: "",
    clientName: "",
    clientCif: "",
    clientAddress: "",
    clientEmail: "",
    paymentMethod: "transferencia",
    items: [{ description: "", quantity: 1, price: 0, total: 0 }],
    taxRate: 21,
    year: String(currentYear),
    month: String(currentMonth),
    saveAsTemplate: false,
    templateName: "",
  });

  // Modal states
  const [editModal, setEditModal] = useState({ open: false, invoice: null });
  const [editForm, setEditForm] = useState({
    clientName: "",
    clientCif: "",
    clientAddress: "",
    clientEmail: "",
    items: [],
    taxRate: 21,
    paymentMethod: "transferencia",
  });

  // Settings states local (for logo adjustment)
  const [settingsForm, setSettingsForm] = useState({
    companyName: "",
    nif: "",
    address: "",
    phone: "",
    contactPerson: "",
    inscriptionText: "",
    logoBase64: "",
    logoWidth: 45,
    logoHeight: 20,
    bankAccount: "",
    nextInvoiceSeq: 1,
    invoiceNumberFormat: "numeric",
    fileNamePattern: "Factura_{numero}_{comunidad}",
    useSaveAsDialog: false,
    seqMode: "manual",
    issueDateMode: "today",
    customIssueDate: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpEmail: "",
    smtpPassword: "",
    emailSubjectTemplate: "Factura {numero} - RyB Limpiezas",
    emailBodyTemplate: "",
    sepaSuffix: "000",
  });

  // SEPA Remittance modal state
  const [sepaModal, setSepaModal] = useState({
    open: false,
    collectionDate: "",
    eligibleInvoices: [],
    warnings: [],
    markAsPaid: false,
  });

  useEffect(() => {
    setInvoices([]);
    setCommunities([]);
    setTemplates([]);
    setBillingSettings(null);
    if (companyId) {
      loadInitialData();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      loadInvoices();
    }
  }, [filterYear, filterMonth, companyId]);

  useEffect(() => {
    setSelectedInvoices({});
  }, [activeTab, filterYear, filterMonth]);

  const loadInitialData = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [settings, comms, tmpls, lastInv, admins] = await Promise.all([
        getBillingSettings(companyId),
        getCommunities(companyId),
        getInvoiceTemplates(companyId),
        getLastEmittedInvoice(companyId),
        getAdministrators(companyId),
      ]);

      const lastSeq = lastInv ? parseInt(lastInv.invoiceSeq) || 0 : 0;
      const finalSettings = {
        ...settings,
        seqMode: settings.seqMode || "manual",
        nextInvoiceSeq:
          settings.seqMode === "auto" ? lastSeq + 1 : settings.nextInvoiceSeq,
      };

      setBillingSettings(finalSettings);
      setSettingsForm(finalSettings);
      setCommunities(comms);
      setTemplates(tmpls);
      setLastInvoice(lastInv);
      setAdministrators(admins || []);
      await loadInvoices();
    } catch (err) {
      console.error("Error loading initial billing data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    if (!companyId) return;
    try {
      const tmpls = await getInvoiceTemplates(companyId);
      setTemplates(tmpls);
    } catch (err) {
      console.error("Error loading templates:", err);
    }
  };

  const loadInvoices = async () => {
    if (!companyId) return;
    try {
      const list = await getInvoices(companyId, filterYear, filterMonth);
      setInvoices(list);
    } catch (err) {
      console.error("Error loading invoices:", err);
    }
  };

  const handleGenerateDrafts = async () => {
    if (!companyId) return;
    if (
      !confirm(
        `¿Generar automáticamente los borradores del mes de ${getMonthName(parseInt(filterMonth))} de ${filterYear}?`,
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const count = await generateMonthlyDrafts(
        companyId,
        parseInt(filterMonth),
        parseInt(filterYear),
      );
      alert(`Se han generado ${count} borradores con éxito.`);
      await loadInvoices();
      setActiveTab("drafts");
    } catch (err) {
      console.error(err);
      alert("Error al generar los borradores: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmitInvoice = async (id) => {
    if (!companyId) return;
    if (
      !confirm(
        "¿Emitir factura oficial? Se le asignará un número oficial correlativo y no podrá editarse.",
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      await emitInvoice(companyId, id);
      alert("Factura emitida con éxito.");
      const lastInv = await getLastEmittedInvoice(companyId);
      setLastInvoice(lastInv);
      await loadInvoices();
      setActiveTab("pending");
    } catch (err) {
      console.error(err);
      alert("Error al emitir la factura: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmitAllDrafts = async () => {
    if (!companyId) return;
    const draftCount = filteredInvoices.length;
    if (draftCount === 0) return;

    if (
      !confirm(
        `¿Estás seguro de que deseas emitir oficialmente los ${draftCount} borradores visibles? Se les asignarán números oficiales correlativos y pasarán a estar pendientes de cobro.`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      const ids = filteredInvoices.map((inv) => inv.id);
      await emitAllInvoices(companyId, ids);
      alert(`Se han emitido ${draftCount} facturas oficiales con éxito.`);

      const lastInv = await getLastEmittedInvoice(companyId);
      setLastInvoice(lastInv);
      await loadInvoices();
      setActiveTab("pending");
    } catch (err) {
      console.error(err);
      alert("Error al emitir los borradores en lote: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAllDrafts = async () => {
    if (!companyId) return;
    const draftCount = filteredInvoices.length;
    if (draftCount === 0) return;

    if (
      !confirm(
        `¿Estás seguro de que deseas eliminar TODOS los ${draftCount} borradores visibles? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      const ids = filteredInvoices.map((inv) => inv.id);
      await deleteMultipleInvoices(companyId, ids);
      alert(`Se han eliminado ${draftCount} borradores con éxito.`);

      const lastInv = await getLastEmittedInvoice(companyId);
      setLastInvoice(lastInv);
      await loadInvoices();
    } catch (err) {
      console.error(err);
      alert("Error al borrar los borradores: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAsPaid = async (id) => {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await updateInvoiceStatus(companyId, id, "paid");
      await loadInvoices();
      setActiveTab("paid");
    } catch (err) {
      console.error(err);
      alert("Error al marcar factura como pagada: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetToPending = async (id) => {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await updateInvoiceStatus(companyId, id, "pending");
      await loadInvoices();
      setActiveTab("pending");
    } catch (err) {
      console.error(err);
      alert("Error al cambiar estado: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (!companyId) return;
    if (!confirm("¿Seguro que deseas eliminar esta factura?")) return;
    setActionLoading(true);
    try {
      await deleteInvoice(companyId, id);
      const lastInv = await getLastEmittedInvoice(companyId);
      setLastInvoice(lastInv);
      await loadInvoices();
    } catch (err) {
      console.error(err);
      alert("Error al borrar: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSelectRow = (id, checked) => {
    setSelectedInvoices((prev) => ({
      ...prev,
      [id]: !!checked,
    }));
  };

  const handleToggleSelectAll = (checked) => {
    if (checked) {
      const newSelections = {};
      filteredInvoices.forEach((inv) => {
        newSelections[inv.id] = true;
      });
      setSelectedInvoices(newSelections);
    } else {
      setSelectedInvoices({});
    }
  };

  const handleDeleteSelected = async () => {
    const selectedIds = Object.keys(selectedInvoices).filter(
      (id) => selectedInvoices[id],
    );
    if (selectedIds.length === 0) return;

    if (
      !confirm(
        `¿Estás seguro de que deseas eliminar las ${selectedIds.length} facturas seleccionadas? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      await deleteMultipleInvoices(companyId, selectedIds);
      alert(`Se han eliminado ${selectedIds.length} facturas con éxito.`);
      setSelectedInvoices({});

      const lastInv = await getLastEmittedInvoice(companyId);
      setLastInvoice(lastInv);
      await loadInvoices();
    } catch (err) {
      console.error(err);
      alert("Error al borrar las facturas seleccionadas: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setActionLoading(true);
      if (!companyId) return;
      try {
        await saveBillingSettings(companyId, settingsForm);
        setBillingSettings(settingsForm);
        alert("Configuración guardada correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar configuración: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Logo file upload handler with automatic resizing/compression
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Verify file is image
    if (!file.type.startsWith("image/")) {
      alert("Por favor, selecciona un archivo de imagen válido (PNG, JPG).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas to resize image
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 400; // 400px is more than enough for a PDF logo (rendered at ~45mm)
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 with quality compression
        const compressedBase64 = canvas.toDataURL("image/png");

        setSettingsForm((prev) => ({
          ...prev,
          logoBase64: compressedBase64,
        }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Modal add handlers
  const handleOpenAddInvoice = async () => {
    setActionLoading(true);
    let nextNum = "Borrador";
    try {
      nextNum = await getNextInvoiceNumber(companyId, filterYear);
    } catch (err) {
      console.error("Error fetching next invoice number:", err);
    } finally {
      setActionLoading(false);
    }

    setAddForm({
      clientType: "community",
      selectedCommunityId: "",
      clientName: "",
      clientCif: "",
      clientAddress: "",
      clientEmail: "",
      paymentMethod: "transferencia",
      items: [{ description: "", quantity: 1, price: 0, total: 0 }],
      taxRate: 21,
      year: filterYear,
      month: filterMonth,
      saveAsTemplate: false,
      templateName: "",
      invoiceNumber: nextNum,
    });
    setAddModalOpen(true);
  };

  const handleSelectTemplate = (templateId) => {
    if (!templateId) return;
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;

    setAddForm((prev) => ({
      ...prev,
      clientType: "manual", // Force manual type to show fields
      selectedCommunityId: "",
      clientName: tmpl.client?.name || "",
      clientCif: tmpl.client?.cif || "",
      clientAddress: tmpl.client?.billingAddress || "",
      clientEmail: tmpl.client?.email || "",
      paymentMethod: tmpl.paymentMethod || "transferencia",
      items: tmpl.items
        ? tmpl.items.map((item) => ({ ...item }))
        : [{ description: "", quantity: 1, price: 0, total: 0 }],
      taxRate: tmpl.taxRate || 21,
    }));
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!templateId) return;
    if (!confirm("¿Seguro que deseas eliminar esta plantilla frecuente?"))
      return;

    setActionLoading(true);
    try {
      await deleteInvoiceTemplate(companyId, templateId);
      alert("Plantilla eliminada con éxito.");
      await loadTemplates();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar plantilla: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectCommunity = (commId) => {
    if (!commId) {
      setAddForm((prev) => ({
        ...prev,
        selectedCommunityId: "",
        clientName: "",
        clientCif: "",
        clientAddress: "",
        clientEmail: "",
        paymentMethod: "transferencia",
      }));
      return;
    }

    const comm = communities.find((c) => c.id === commId);
    if (!comm) return;

    setAddForm((prev) => ({
      ...prev,
      selectedCommunityId: commId,
      clientName: comm.name,
      clientCif: comm.billingCif || "",
      clientAddress: comm.billingAddress || comm.address || "",
      clientEmail: comm.billingEmail || comm.contactPhone || "",
      paymentMethod: comm.paymentMethod || "transferencia",
    }));
  };

  const handleAddAddItemRow = () => {
    setAddForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { description: "", quantity: 1, price: 0, total: 0 },
      ],
    }));
  };

  const handleAddRemoveItemRow = (idx) => {
    setAddForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleAddItemChange = (idx, field, value) => {
    setAddForm((prev) => {
      const newItems = prev.items.map((item, i) => {
        if (i !== idx) return item;

        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "price") {
          const q =
            field === "quantity"
              ? parseLocaleFloat(value)
              : parseLocaleFloat(item.quantity);
          const p =
            field === "price"
              ? parseLocaleFloat(value)
              : parseLocaleFloat(item.price);
          updated.total = parseFloat((q * p).toFixed(2));
        }
        return updated;
      });
      return { ...prev, items: newItems };
    });
  };

  const handleSaveNewInvoice = async (e) => {
    e.preventDefault();
    if (addForm.items.length === 0) {
      alert("La factura debe tener al menos un concepto.");
      return;
    }
    if (addForm.items.some((item) => !item.description.trim())) {
      alert("Todos los conceptos deben tener descripción.");
      return;
    }
    if (addForm.saveAsTemplate && !addForm.templateName.trim()) {
      alert("Por favor, indica un nombre para la plantilla frecuente.");
      return;
    }

    setActionLoading(true);
    try {
      let finalClientEmail = addForm.clientEmail || "";
      const emailInput = document.getElementById("new-client-email-add");
      if (emailInput && emailInput.value.trim()) {
        const val = emailInput.value.trim().replace(/[,;]/g, "");
        if (val && val.includes("@")) {
          const list = finalClientEmail
            .split(/[,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
          if (!list.includes(val)) {
            list.push(val);
            finalClientEmail = list.join(", ");
          }
        }
      }

      const subtotal = addForm.items.reduce(
        (sum, item) => sum + (parseFloat(item.total) || 0),
        0,
      );
      const taxAmount = parseFloat(
        (subtotal * (parseFloat(addForm.taxRate) / 100)).toFixed(2),
      );
      const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));

      const typedNum = addForm.invoiceNumber?.trim() || "Borrador";
      const isDraft = typedNum.toLowerCase() === "borrador";
      let invoiceSeq = null;
      if (!isDraft) {
        const seqMatch = typedNum.match(/\d+$/);
        if (seqMatch) {
          invoiceSeq = parseInt(seqMatch[0]);
        }
      }

      let issueDate = new Date();
      if (
        !isDraft &&
        billingSettings &&
        billingSettings.issueDateMode === "custom" &&
        billingSettings.customIssueDate
      ) {
        issueDate = new Date(billingSettings.customIssueDate + "T00:00:00");
      }
      const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      const invoiceData = {
        invoiceNumber: typedNum,
        ...(invoiceSeq !== null ? { invoiceSeq } : {}),
        status: isDraft ? "draft" : "pending",
        year: parseInt(addForm.year),
        month: parseInt(addForm.month),
        client: {
          communityId:
            addForm.clientType === "community"
              ? addForm.selectedCommunityId
              : "",
          name: addForm.clientName,
          cif: addForm.clientCif,
          billingAddress: addForm.clientAddress,
          email: finalClientEmail,
        },
        items: addForm.items.map((item) => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          price: parseFloat(item.price) || 0,
          total: parseFloat(item.total) || 0,
        })),
        subtotal,
        taxRate: parseFloat(addForm.taxRate) || 0,
        taxAmount,
        totalAmount,
        paymentMethod: addForm.paymentMethod,
        issueDate: isDraft ? null : issueDate,
        dueDate: isDraft ? null : dueDate,
      };

      await createInvoice(companyId, invoiceData);

      // Try to increment sequence in settings if a manual number was typed
      if (!isDraft && invoiceSeq !== null) {
        try {
          if (
            billingSettings &&
            invoiceSeq >= (parseInt(billingSettings.nextInvoiceSeq) || 1)
          ) {
            await saveBillingSettings(companyId, {
              nextInvoiceSeq: invoiceSeq + 1,
            });
            setBillingSettings((prev) => ({
              ...prev,
              nextInvoiceSeq: invoiceSeq + 1,
            }));
          }
        } catch (seqErr) {
          console.warn(
            "Could not auto-increment settings nextInvoiceSeq:",
            seqErr,
          );
        }
      }

      if (addForm.saveAsTemplate) {
        const templateData = {
          name: addForm.templateName.trim(),
          client: {
            name: addForm.clientName,
            cif: addForm.clientCif,
            billingAddress: addForm.clientAddress,
            email: finalClientEmail,
          },
          items: addForm.items.map((item) => ({
            description: item.description,
            quantity: parseFloat(item.quantity) || 1,
            price: parseFloat(item.price) || 0,
            total: parseFloat(item.total) || 0,
          })),
          taxRate: parseFloat(addForm.taxRate) || 0,
          paymentMethod: addForm.paymentMethod,
        };
        await saveInvoiceTemplate(companyId, templateData);
      }

      alert(
        isDraft
          ? "Factura manual creada correctamente en borradores."
          : "Factura manual emitida correctamente.",
      );
      setAddModalOpen(false);
      await Promise.all([loadInvoices(), loadTemplates()]);
    } catch (err) {
      console.error(err);
      alert("Error al crear la factura manual: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Modal edit handlers
  const handleOpenEdit = (inv) => {
    setEditModal({ open: true, invoice: inv });
    setEditForm({
      clientName: inv.client.name,
      clientCif: inv.client.cif || "",
      clientAddress: inv.client.billingAddress || "",
      clientEmail: inv.client.email || "",
      items: inv.items.map((item) => ({ ...item })),
      taxRate: inv.taxRate || 21,
      paymentMethod: inv.paymentMethod || "transferencia",
    });
  };

  const handleAddItemRow = () => {
    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { description: "", quantity: 1, price: 0, total: 0 },
      ],
    }));
  };

  const handleRemoveItemRow = (idx) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleItemChange = (idx, field, value) => {
    setEditForm((prev) => {
      const newItems = prev.items.map((item, i) => {
        if (i !== idx) return item;

        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "price") {
          const q =
            field === "quantity"
              ? parseLocaleFloat(value)
              : parseLocaleFloat(item.quantity);
          const p =
            field === "price"
              ? parseLocaleFloat(value)
              : parseLocaleFloat(item.price);
          updated.total = parseFloat((q * p).toFixed(2));
        }
        return updated;
      });
      return { ...prev, items: newItems };
    });
  };

  const handleSaveInvoiceEdit = async (e) => {
    e.preventDefault();
    if (editForm.items.length === 0) {
      alert("La factura debe tener al menos un concepto.");
      return;
    }
    if (editForm.items.some((item) => !item.description.trim())) {
      alert("Todos los conceptos deben tener descripción.");
      return;
    }

    setActionLoading(true);
    try {
      let finalClientEmail = editForm.clientEmail || "";
      const emailInput = document.getElementById("new-client-email-edit");
      if (emailInput && emailInput.value.trim()) {
        const val = emailInput.value.trim().replace(/[,;]/g, "");
        if (val && val.includes("@")) {
          const list = finalClientEmail
            .split(/[,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
          if (!list.includes(val)) {
            list.push(val);
            finalClientEmail = list.join(", ");
          }
        }
      }

      const subtotal = editForm.items.reduce(
        (sum, item) => sum + (parseFloat(item.total) || 0),
        0,
      );
      const taxAmount = parseFloat(
        (subtotal * (parseFloat(editForm.taxRate) / 100)).toFixed(2),
      );
      const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));

      const updatedData = {
        client: {
          ...editModal.invoice.client,
          name: editForm.clientName,
          cif: editForm.clientCif,
          billingAddress: editForm.clientAddress,
          email: finalClientEmail,
        },
        items: editForm.items,
        taxRate: parseFloat(editForm.taxRate) || 0,
        subtotal,
        taxAmount,
        totalAmount,
        paymentMethod: editForm.paymentMethod,
      };

      await updateInvoice(companyId, editModal.invoice.id, updatedData);
      setEditModal({ open: false, invoice: null });
      await loadInvoices();
    } catch (err) {
      console.error(err);
      alert("Error al guardar la factura");
    } finally {
      setActionLoading(false);
    }
  };

  // WhatsApp link generator
  const handleSendWhatsApp = (inv) => {
    const phone = inv.client.email?.replace(/[^0-9]/g, "") || ""; // fallback phone in email field sometimes
    const numFact = inv.invoiceNumber || "Borrador";
    const amount =
      inv.totalAmount.toLocaleString("es-ES", { minimumFractionDigits: 2 }) +
      "€";

    let text = `Hola, le adjuntamos los detalles de la factura *${numFact}* de RyB Limpiezas correspondiente a la comunidad *${inv.client.name}*.\n\n`;
    text += `• Importe Total: *${amount}* (IVA incl.)\n`;
    text += `• Método de Pago: *${inv.paymentMethod === "transferencia" ? "Transferencia Bancaria" : inv.paymentMethod === "recibo" ? "Recibo Domiciliado" : "Efectivo"}*\n`;
    if (inv.paymentMethod === "transferencia" && billingSettings?.bankAccount) {
      text += `• IBAN para ingreso: *${billingSettings.bankAccount}*\n`;
    }
    text += `\nQuedamos a su disposición para cualquier duda. ¡Gracias por confiar en nosotros!`;

    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/${phone ? phone : ""}?text=${encoded}`;
    window.open(url, "_blank");
  };

  // PDF generator exactly like the image
  const generatePDF = async (inv, mode = "download") => {
    if (!billingSettings) return;

    const doc = new jsPDF("p", "mm", "a4");

    // 1. Logo (Editable in size)
    if (billingSettings.logoBase64) {
      try {
        doc.addImage(
          billingSettings.logoBase64,
          "PNG",
          14,
          12,
          parseFloat(billingSettings.logoWidth) || 45,
          parseFloat(billingSettings.logoHeight) || 20,
        );
      } catch (e) {
        console.error("Error drawing logo in PDF:", e);
        // Fallback text logo
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(37, 99, 235);
        doc.text(billingSettings.companyName || "RyB Limpiezas", 14, 22);
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(37, 99, 235);
      doc.text(billingSettings.companyName || "RyB Limpiezas", 14, 22);
    }

    // 2. Title "FACTURA" (right-aligned, light gray)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(215, 218, 224); // light gray
    doc.text("FACTURA", 196, 22, { align: "right" });

    // 3. Company details (left column, below logo)
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text(`NIF: ${billingSettings.nif || ""}`, 14, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // slate-600

    const companyAddressLines = doc.splitTextToSize(
      billingSettings.address || "",
      75,
    );
    doc.text(companyAddressLines, 14, 45);

    const phoneY = 45 + companyAddressLines.length * 4.5;
    doc.text(`Teléfono: ${billingSettings.phone || ""}`, 14, phoneY);

    // 4. Metadata right column (FECHA, Nº FACTURA, PARA, FACTURAR A)
    doc.setFontSize(9);
    const labelX = 115;
    const valueX = 148;

    // Row 1: FECHA
    doc.setFont("helvetica", "oblique");
    doc.setTextColor(120, 120, 120);
    doc.text("FECHA:", labelX, 33);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const dateFormatted = inv.issueDate
      ? format(
          inv.issueDate.toDate
            ? inv.issueDate.toDate()
            : new Date(inv.issueDate),
          "dd/MM/yyyy",
        )
      : format(new Date(), "dd/MM/yyyy");
    doc.text(dateFormatted, valueX, 33);

    // Row 2: Nº DE FACTURA
    doc.setFont("helvetica", "oblique");
    doc.setTextColor(120, 120, 120);
    doc.text("Nº DE FACTURA:", labelX, 39);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(String(inv.invoiceNumber || "Borrador"), valueX, 39);

    // Row 3: PARA
    doc.setFont("helvetica", "oblique");
    doc.setTextColor(120, 120, 120);
    doc.text("PARA:", labelX, 45);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(String(inv.client.name || ""), valueX, 45);

    // Row 4: FACTURAR A
    doc.setFont("helvetica", "oblique");
    doc.setTextColor(120, 120, 120);
    doc.text("FACTURAR A:", labelX, 51);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);

    const billToLines = [
      inv.client.name || "",
      inv.client.cif ? `NIF:  ${inv.client.cif}` : "",
      ...doc.splitTextToSize(inv.client.billingAddress || "", 48),
    ].filter(Boolean);

    doc.text(billToLines, valueX, 51);

    // 5. Drawing Table Grid (Exactly like the image)
    const tableStartY = 70;
    const tableEndY = 175;
    const rowHeight = 6.2;
    const tableWidth = 182;
    const startX = 14;
    const endX = startX + tableWidth;

    const colSplit1 = 130; // DESCRIPCIÓN split
    const colSplit2 = 155; // I split

    // Fill header background
    doc.setFillColor(235, 237, 240); // Light gray
    doc.rect(startX, tableStartY, tableWidth, 7, "F");

    // Table outer border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.25);
    doc.rect(startX, tableStartY, tableWidth, tableEndY - tableStartY);

    // Table vertical dividers
    doc.line(colSplit1, tableStartY, colSplit1, tableEndY);
    doc.line(colSplit2, tableStartY, colSplit2, tableEndY);

    // Table horizontal row dividers
    const numRows = Math.floor((tableEndY - (tableStartY + 7)) / rowHeight);
    for (let r = 0; r <= numRows; r++) {
      const yLine = tableStartY + 7 + r * rowHeight;
      if (yLine < tableEndY) {
        doc.line(startX, yLine, endX, yLine);
      }
    }

    // Table Header Text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("DESCRIPCIÓN", startX + 2, tableStartY + 4.8);
    doc.text("I", (colSplit1 + colSplit2) / 2, tableStartY + 4.8, {
      align: "center",
    });
    doc.text("IMPORTE", (colSplit2 + endX) / 2, tableStartY + 4.8, {
      align: "center",
    });

    // Table Row Content
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);

    (inv.items || []).forEach((item, idx) => {
      const yPos = tableStartY + 7 + idx * rowHeight + 4.3;
      if (yPos < tableEndY) {
        doc.text(String(item.description || ""), startX + 2, yPos);
        doc.text(
          String(item.quantity || "1"),
          (colSplit1 + colSplit2) / 2,
          yPos,
          { align: "center" },
        );

        // Format price
        doc.text("€", colSplit2 + 3, yPos);
        const priceFormatted = parseFloat(item.total || 0).toLocaleString(
          "es-ES",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
        );
        doc.text(priceFormatted, endX - 2, yPos, { align: "right" });
      }
    });

    // 6. Totals Grid (Below Table, on the right side)
    const totalsStartY = tableEndY;
    const totalsRowHeight = 6.2;
    const totalsSplitX = colSplit2; // 155

    // Total fields: TOTAL BRUTO, IVA, TOTAL IVA, OTROS, TOTAL
    const totalFields = [
      {
        label: "TOTAL BRUTO",
        val: parseFloat(inv.subtotal || 0).toLocaleString("es-ES", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        hasCurrency: true,
      },
      {
        label: "IVA",
        val: `${parseFloat(inv.taxRate || 21)
          .toFixed(2)
          .replace(".", ",")}%`,
        hasCurrency: false,
      },
      {
        label: "TOTAL IVA",
        val: parseFloat(inv.taxAmount || 0).toLocaleString("es-ES", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        hasCurrency: true,
      },
      { label: "OTROS", val: "-", hasCurrency: false },
      {
        label: "TOTAL",
        val: parseFloat(inv.totalAmount || 0).toLocaleString("es-ES", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        hasCurrency: true,
        isBold: true,
      },
    ];

    totalFields.forEach((field, idx) => {
      const yLineTop = totalsStartY + idx * totalsRowHeight;

      // Draw border boxes for values
      doc.setDrawColor(200, 200, 200);
      doc.rect(totalsSplitX, yLineTop, endX - totalsSplitX, totalsRowHeight);

      // Label text
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(8.5);
      if (field.isBold) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(9.5);
      } else {
        doc.setFont("helvetica", "oblique");
      }
      doc.text(field.label, totalsSplitX - 2, yLineTop + 4.5, {
        align: "right",
      });

      // Value text inside box
      if (field.isBold) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
      }

      if (field.hasCurrency) {
        doc.text("€", totalsSplitX + 3, yLineTop + 4.5);
      }
      doc.text(field.val, endX - 2, yLineTop + 4.5, { align: "right" });
    });

    // 7. Footer Message (on the left, aligned with totals)
    const msgStartY = totalsStartY + 4;
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `Si tiene alguna pregunta acerca de esta factura, póngase en contacto con`,
      startX,
      msgStartY,
    );
    doc.text(
      `${billingSettings.contactPerson || "Daniel Rabaneda"}, Teléfono: ${billingSettings.phone || "687983162"}`,
      startX,
      msgStartY + 4.5,
    );

    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9.5);
    doc.text("GRACIAS POR CONFIAR EN NOSOTROS", startX, msgStartY + 11);

    // 8. Bank Account details (Optional)
    if (billingSettings.bankAccount) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Número de Cuenta (IBAN) para transferencia: ${billingSettings.bankAccount}`,
        startX,
        msgStartY + 19,
      );
    }

    // 8.5 VERIFACTU: Código QR de verificación
    if (
      inv.status !== "draft" &&
      inv.invoiceNumber &&
      inv.invoiceNumber !== "Borrador"
    ) {
      try {
        const qrUrl = buildVerifactuQrUrl(inv, billingSettings);
        const qrDataUrl = await QRCode.toDataURL(qrUrl, {
          margin: 1,
          width: 100,
        });

        const qrX = startX;
        const qrY = 212;
        const qrSize = 25; // 25x25 mm

        doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text("VERI*FACTU", qrX, qrY + qrSize + 4.5);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(
          "Factura verificable en la Sede electrónica de la AEAT",
          qrX,
          qrY + qrSize + 8.5,
        );
      } catch (qrErr) {
        console.error("Error generating or adding QR code to PDF:", qrErr);
      }
    }

    // 9. Mercantile Registry Inscription (Bottom Center)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    const inscriptionText = billingSettings.inscriptionText || "";
    const inscriptionLines = doc.splitTextToSize(inscriptionText, 180);
    doc.text(inscriptionLines, 105, 280, { align: "center" });

    // Build filename from configured pattern
    const pdfMonthNames = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    const dateForFile = inv.issueDate
      ? format(
          inv.issueDate.toDate
            ? inv.issueDate.toDate()
            : new Date(inv.issueDate),
          "dd-MM-yyyy",
        )
      : format(new Date(), "dd-MM-yyyy");
    const pattern =
      billingSettings?.fileNamePattern || "Factura_{numero}_{comunidad}";
    const filename =
      pattern
        .replace("{numero}", inv.invoiceNumber || "Borrador")
        .replace("{comunidad}", (inv.client.name || "").replace(/\s+/g, "_"))
        .replace("{fecha}", dateForFile)
        .replace("{mes}", pdfMonthNames[inv.month] || "")
        .replace("{a\u00f1o}", String(inv.year || new Date().getFullYear())) +
      ".pdf";

    if (mode === "preview") {
      // Preview mode: show in modal
      const pdfBlob = doc.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      setPreviewModal({ open: true, pdfUrl });
    } else if (mode === "return") {
      // Return mode: return the blob and filename directly
      return {
        blob: doc.output("blob"),
        filename,
      };
    } else {
      // Download mode
      if (billingSettings?.useSaveAsDialog && window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: "Documento PDF",
                accept: { "application/pdf": [".pdf"] },
              },
            ],
          });
          const writable = await handle.createWritable();
          const blob = doc.output("blob");
          await writable.write(blob);
          await writable.close();
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Error saving PDF:", err);
            doc.save(filename);
          }
        }
      } else {
        doc.save(filename);
      }
    }
  };

  const handleOpenDownloadAll = () => {
    if (filteredInvoices.length === 0) return;
    setDownloadModal({ open: true, invoices: filteredInvoices });
  };

  const handleSaveToFolder = async () => {
    if (!window.showDirectoryPicker) {
      alert(
        "Tu navegador no soporta la selección directa de carpetas. Por favor, usa la opción de archivo ZIP o abre esta página en Google Chrome o Microsoft Edge.",
      );
      return;
    }

    setDownloadModal((prev) => ({ ...prev, open: false }));
    setActionLoading(true);

    try {
      const directoryHandle = await window.showDirectoryPicker({
        mode: "readwrite",
      });

      let successCount = 0;

      for (const inv of downloadModal.invoices) {
        const result = await generatePDF(inv, "return");
        if (!result) continue;

        const { blob, filename } = result;

        const fileHandle = await directoryHandle.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        successCount++;
      }

      alert(
        `¡Completado! Se han guardado ${successCount} facturas correctamente en la carpeta seleccionada.`,
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error saving PDFs to folder:", err);
        alert(`Ocurrió un error al guardar los PDFs: ${err.message}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadAsZIP = async () => {
    setDownloadModal((prev) => ({ ...prev, open: false }));
    setActionLoading(true);

    try {
      const zip = new JSZip();
      let successCount = 0;

      for (const inv of downloadModal.invoices) {
        const result = await generatePDF(inv, "return");
        if (!result) continue;

        const { blob, filename } = result;
        zip.file(filename, blob);
        successCount++;
      }

      if (successCount === 0) {
        alert("No se pudo generar ningún PDF.");
        setActionLoading(false);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });

      const dateStr = format(new Date(), "yyyy-MM-dd");
      const zipFilename = `Facturas_${getMonthName(parseInt(filterMonth))}_${filterYear}_${dateStr}.zip`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = zipFilename;
      link.click();

      setTimeout(() => URL.revokeObjectURL(link.href), 100);

      alert(
        `¡Completado! Se ha descargado el archivo ZIP con ${successCount} facturas.`,
      );
    } catch (err) {
      console.error("Error creating ZIP archive:", err);
      alert(`Ocurrió un error al generar el archivo ZIP: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendEmails = async (invoicesList) => {
    if (!billingSettings?.smtpHost || !billingSettings?.smtpEmail) {
      alert(
        "Por favor, configure los detalles del correo emisor (SMTP) en la pestaña de Ajustes antes de enviar correos.",
      );
      return;
    }

    setEmailProgressModal({
      open: true,
      total: invoicesList.length,
      current: 0,
      status: "sending",
      log: ["Iniciando proceso de envío de correos..."],
    });
    setActionLoading(true);

    try {
      const processedIds = [];

      for (let i = 0; i < invoicesList.length; i++) {
        const inv = invoicesList[i];

        setEmailProgressModal((prev) => ({
          ...prev,
          log: [
            ...prev.log,
            `Preparando PDF para factura ${inv.invoiceNumber || "Borrador"} (${inv.client.name})...`,
          ],
        }));

        let pdfUrl = inv.pdfUrl;
        let storagePath = inv.pdfStoragePath;

        if (!pdfUrl || !storagePath) {
          setEmailProgressModal((prev) => ({
            ...prev,
            log: [...prev.log, `Generando PDF en segundo plano...`],
          }));

          const pdfResult = await generatePDF(inv, "return");
          if (!pdfResult) {
            setEmailProgressModal((prev) => ({
              ...prev,
              log: [
                ...prev.log,
                `❌ Error: No se pudo generar el PDF para la factura ${inv.invoiceNumber || "Borrador"}.`,
              ],
            }));
            continue;
          }

          setEmailProgressModal((prev) => ({
            ...prev,
            log: [...prev.log, `Subiendo PDF a almacenamiento de Firebase...`],
          }));

          storagePath = `companies/${companyId}/invoices/${inv.id}/${pdfResult.filename}`;
          const storageUrl = await uploadInvoicePDFToStorage(
            companyId,
            inv.id,
            pdfResult.blob,
            pdfResult.filename,
          );
          pdfUrl = storageUrl;

          await updateInvoice(companyId, inv.id, { pdfUrl, pdfStoragePath: storagePath });

          setInvoices((prev) =>
            prev.map((item) =>
              item.id === inv.id
                ? { ...item, pdfUrl, pdfStoragePath: storagePath }
                : item,
            ),
          );
        }

        processedIds.push(inv.id);
      }

      if (processedIds.length === 0) {
        setEmailProgressModal((prev) => ({
          ...prev,
          status: "completed",
          log: [
            ...prev.log,
            `Proceso finalizado. No se prepararon facturas válidas.`,
          ],
        }));
        return;
      }

      setEmailProgressModal((prev) => ({
        ...prev,
        log: [
          ...prev.log,
          `Enviando petición de procesamiento agrupado al servidor para ${processedIds.length} facturas...`,
        ],
      }));

      const response = await sendGroupedInvoiceEmails(companyId, processedIds);
      const results = response?.results || [];

      let successCount = 0;
      let errorCount = 0;

      results.forEach((res) => {
        if (res.status === "success") {
          successCount++;
          const now = new Date();
          setInvoices((prev) =>
            prev.map((item) =>
              item.id === res.id
                ? { ...item, emailSent: true, emailSentAt: now }
                : item,
            ),
          );
        } else {
          errorCount++;
          setEmailProgressModal((prev) => ({
            ...prev,
            log: [
              ...prev.log,
              `❌ Error en factura ID ${res.id}: ${res.error || "Fallo desconocido"}`,
            ],
          }));
        }
      });

      setEmailProgressModal((prev) => ({
        ...prev,
        current: successCount,
        status: "completed",
        log: [
          ...prev.log,
          `Proceso finalizado. Facturas enviadas con éxito: ${successCount}. Fallidas: ${errorCount}.`,
        ],
      }));
    } catch (err) {
      console.error("Error overall email process:", err);
      setEmailProgressModal((prev) => ({
        ...prev,
        status: "error",
        log: [...prev.log, `❌ Error general en el proceso: ${err.message}`],
      }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendSingleEmail = (inv) => {
    if (inv.status === "draft") {
      alert(
        "No se pueden enviar borradores por correo. Primero emita la factura.",
      );
      return;
    }
    if (
      confirm(
        `¿Estás seguro de enviar la factura ${inv.invoiceNumber} por email a ${inv.client.email}?`,
      )
    ) {
      handleSendEmails([inv]);
    }
  };

  const handleSendSelectedEmails = () => {
    const selectedList = filteredInvoices.filter(
      (inv) => selectedInvoices[inv.id],
    );
    if (selectedList.length === 0) return;

    // Check if any draft is selected
    const hasDrafts = selectedList.some((inv) => inv.status === "draft");
    if (hasDrafts) {
      alert(
        "Una o más de las facturas seleccionadas son borradores. Por favor, desmarca los borradores antes de enviar por email.",
      );
      return;
    }

    if (
      confirm(
        `¿Estás seguro de enviar ${selectedList.length} facturas por email?`,
      )
    ) {
      handleSendEmails(selectedList);
      setSelectedInvoices({});
    }
  };

  const handleSendAllFilteredEmails = () => {
    const activeList = filteredInvoices.filter((inv) => inv.status !== "draft");
    if (activeList.length === 0) {
      alert(
        "No hay facturas emitidas disponibles en esta lista para enviar por email.",
      );
      return;
    }
    if (
      confirm(
        `¿Estás seguro de enviar por email las ${activeList.length} facturas de esta sección?`,
      )
    ) {
      handleSendEmails(activeList);
    }
  };

  // Helper translations
  const getMonthName = (m) => {
    const names = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    return names[m];
  };

  const filteredInvoices = invoices
    .filter((inv) => {
      let matchesTab = false;
      if (activeTab === "drafts") matchesTab = inv.status === "draft";
      else if (activeTab === "pending") matchesTab = inv.status === "pending";
      else if (activeTab === "paid") matchesTab = inv.status === "paid";

      if (!matchesTab) return false;

      if (filterAdmin) {
        const communityId = inv.client?.communityId || "";
        const comm = communities.find((c) => c.id === communityId);
        const adminId =
          inv.client?.administratorId || comm?.administratorId || "";
        if (adminId !== filterAdmin) return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const name = (inv.client?.name || "").toLowerCase();
      const cif = (inv.client?.cif || "").toLowerCase();
      const invNum = (inv.invoiceNumber || "").toLowerCase();
      return name.includes(term) || cif.includes(term) || invNum.includes(term);
    })
    .sort((a, b) => {
      const nameA = a.client?.name || "";
      const nameB = b.client?.name || "";
      return nameA.localeCompare(nameB, "es", { sensitivity: "base" });
    });

  // Calculate totals for summary cards
  const summaryTotals = (() => {
    let facturado = 0;
    let cobrado = 0;
    let pendiente = 0;

    invoices.forEach((inv) => {
      if (inv.status === "pending") {
        facturado += inv.totalAmount;
        pendiente += inv.totalAmount;
      } else if (inv.status === "paid") {
        facturado += inv.totalAmount;
        cobrado += inv.totalAmount;
      }
    });
    return { facturado, cobrado, pendiente };
  })();

  // ==================== SEPA REMITTANCE HANDLERS ====================
  const handleOpenSepaModal = () => {
    // Filter pending invoices with 'recibo' payment method
    const pendingInvoices = invoices.filter((inv) => inv.status === "pending");
    const eligible = [];
    const warnings = [];

    pendingInvoices.forEach((inv) => {
      if (inv.paymentMethod !== "recibo") return;

      const clientIban = inv.client?.iban || "";
      const mandateRef = inv.client?.mandateRef || "";
      const mandateDate = inv.client?.mandateDate || "";

      const ibanResult = clientIban
        ? validateIBAN(clientIban)
        : { valid: false, error: "Sin IBAN" };

      if (!clientIban) {
        warnings.push(
          `⚠️ ${inv.client.name} (Factura ${inv.invoiceNumber}): No tiene IBAN configurado. Se excluirá de la remesa.`,
        );
        return;
      }
      if (!ibanResult.valid) {
        warnings.push(
          `❌ ${inv.client.name} (Factura ${inv.invoiceNumber}): IBAN inválido (${ibanResult.error}). Se excluirá.`,
        );
        return;
      }
      if (!mandateRef) {
        warnings.push(
          `⚠️ ${inv.client.name} (Factura ${inv.invoiceNumber}): Sin referencia de mandato SEPA. Se incluirá con referencia genérica.`,
        );
      }

      eligible.push({
        ...inv,
        _cleanIban: ibanResult.iban,
        _mandateRef:
          mandateRef ||
          `MNDT-${inv.client.communityId?.substring(0, 8) || "GEN"}`,
        _mandateDate: mandateDate || "2020-01-01",
      });
    });

    if (
      eligible.length === 0 &&
      pendingInvoices.filter((i) => i.paymentMethod === "recibo").length === 0
    ) {
      alert(
        'No hay facturas pendientes con método de pago "Recibo Domiciliado" para este periodo.',
      );
      return;
    }

    // Default collection date: 5 business days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 5);
    const defaultDateStr = format(defaultDate, "yyyy-MM-dd");

    setSepaModal({
      open: true,
      collectionDate: defaultDateStr,
      eligibleInvoices: eligible,
      warnings,
      markAsPaid: false,
    });
  };

  const handleGenerateSepaXML = async () => {
    if (!billingSettings) return;
    const { eligibleInvoices, collectionDate, markAsPaid } = sepaModal;

    if (eligibleInvoices.length === 0) {
      alert("No hay facturas válidas para incluir en la remesa.");
      return;
    }

    if (!collectionDate) {
      alert("Debes indicar una fecha de cobro/adeudo.");
      return;
    }

    // Validate creditor data
    const creditorIbanResult = validateIBAN(billingSettings.bankAccount || "");
    if (!creditorIbanResult.valid) {
      alert(
        "El IBAN de la empresa (cuenta bancaria en Ajustes de Factura) no es válido. Por favor, configúralo primero.",
      );
      return;
    }

    try {
      const creditorId = calculateSepaCreditorId(
        "ES",
        billingSettings.nif || "",
        billingSettings.sepaSuffix || "000",
      );

      const sepaInvoices = eligibleInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || "SN",
        totalAmount: inv.totalAmount,
        client: {
          name: inv.client.name,
          iban: inv._cleanIban,
          mandateRef: inv._mandateRef,
          mandateDate: inv._mandateDate,
        },
      }));

      const xml = generateSepaXML({
        creditor: {
          name: billingSettings.companyName || "RyB Limpiezas",
          nif: billingSettings.nif || "",
          iban: creditorIbanResult.iban,
          creditorId,
        },
        invoices: sepaInvoices,
        collectionDate,
      });

      // Download the XML file
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const monthName = getMonthName(parseInt(filterMonth));
      a.href = url;
      a.download = `Remesa_SEPA_${monthName}_${filterYear}_${format(new Date(), "yyyyMMdd")}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Optionally mark invoices as paid
      if (markAsPaid) {
        for (const inv of eligibleInvoices) {
          await updateInvoiceStatus(companyId, inv.id, "paid");
        }
        await loadInvoices();
      }

      setSepaModal((prev) => ({ ...prev, open: false }));
      alert(
        `✅ Remesa SEPA generada con éxito. Se han incluido ${eligibleInvoices.length} adeudos por un total de ${eligibleInvoices.reduce((sum, i) => sum + i.totalAmount, 0).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €.`,
      );
    } catch (err) {
      console.error("Error generating SEPA XML:", err);
      alert("Error al generar la remesa SEPA: " + err.message);
    }
  };

  return (
    <div className="page-container animate-fadeIn">
      {/* Header section */}
      <div className="header-section mb-6">
        <p className="page-subtitle">
          Generación, edición y control de cobro de facturas mensuales
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon blue">📊</div>
          <div className="stat-value">
            {summaryTotals.facturado.toLocaleString("es-ES", {
              minimumFractionDigits: 2,
            })}{" "}
            €
          </div>
          <div className="stat-label">Total Facturado (Emitido)</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div className="stat-value">
            {summaryTotals.cobrado.toLocaleString("es-ES", {
              minimumFractionDigits: 2,
            })}{" "}
            €
          </div>
          <div className="stat-label">Total Cobrado</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">⏳</div>
          <div className="stat-value">
            {summaryTotals.pendiente.toLocaleString("es-ES", {
              minimumFractionDigits: 2,
            })}{" "}
            €
          </div>
          <div className="stat-label">Total Pendiente de Cobro</div>
        </div>
      </div>

      {/* Filter and Global Actions Card */}
      {activeTab !== "settings" && (
        <div className="card mb-6 p-4">
          <div className="flex flex-wrap justify-between items-end gap-4">
            <div className="flex gap-4 items-end flex-wrap flex-1">
              <div style={{ minWidth: "140px" }}>
                <label className="form-label" style={{ marginBottom: "4px" }}>
                  Año periodo
                </label>
                <select
                  className="form-select"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                >
                  {[
                    currentYear - 2,
                    currentYear - 1,
                    currentYear,
                    currentYear + 1,
                    currentYear + 2,
                  ].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: "160px" }}>
                <label className="form-label" style={{ marginBottom: "4px" }}>
                  Mes periodo
                </label>
                <select
                  className="form-select"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i} value={i}>
                      {getMonthName(i)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: "180px" }}>
                <label className="form-label" style={{ marginBottom: "4px" }}>
                  Administrador de Fincas
                </label>
                <select
                  className="form-select"
                  value={filterAdmin}
                  onChange={(e) => setFilterAdmin(e.target.value)}
                >
                  <option value="">— Todos —</option>
                  {administrators.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search input for invoices */}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label className="form-label" style={{ marginBottom: "4px" }}>
                  Buscar comunidad o NIF/CIF
                </label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--color-text-muted)",
                      fontSize: "0.875rem",
                    }}
                  >
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Escribe el nombre o CIF para buscar..."
                    className="form-input"
                    style={{ paddingLeft: "32px", width: "100%" }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                className="btn btn-primary w-full"
                onClick={handleGenerateDrafts}
                disabled={actionLoading || loading}
              >
                ⚡ Generar Borradores del Mes
              </button>
              <button
                type="button"
                className="btn btn-success w-full"
                onClick={handleOpenAddInvoice}
                disabled={actionLoading || loading}
              >
                ➕ Añadir Factura Manual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-container mb-6 flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          className={`btn btn-sm ${activeTab === "drafts" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("drafts")}
        >
          📋 Borradores ({invoices.filter((i) => i.status === "draft").length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "pending" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("pending")}
        >
          ⏳ Pendientes ({invoices.filter((i) => i.status === "pending").length}
          )
        </button>
        <button
          className={`btn btn-sm ${activeTab === "paid" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("paid")}
        >
          ✅ Cobradas ({invoices.filter((i) => i.status === "paid").length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === "settings" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("settings")}
        >
          ⚙️ Ajustes Factura
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div className="flex justify-center p-8">
          <div className="spinner"></div>
        </div>
      ) : activeTab === "settings" ? (
        /* Settings Tab */
        <div className="card">
          <h3
            className="text-md font-bold mb-4 border-b pb-2 flex items-center gap-2"
            style={{ color: "var(--color-primary)" }}
          >
            ⚙️ Configuración del Documento de Factura
          </h3>
          <form onSubmit={handleSaveSettings}>
            <div className="grid grid-2 gap-4">
              <div className="form-group">
                <label className="form-label">
                  Nombre Comercial de la Empresa
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={settingsForm.companyName}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      companyName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">NIF / CIF de la Empresa</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={settingsForm.nif}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, nif: e.target.value })
                  }
                />
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label className="form-label">
                  Dirección Fiscal / Domicilio Social
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={settingsForm.address}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      address: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono de Contacto</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={settingsForm.phone}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, phone: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Persona de Contacto (Preguntas Factura)
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={settingsForm.contactPerson}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      contactPerson: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label className="form-label">
                  Cuenta Bancaria para Transferencia (IBAN)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej: ES21 0000 0000 0000 0000 0000"
                  value={settingsForm.bankAccount}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      bankAccount: e.target.value,
                    })
                  }
                />
              </div>

              {/* Logo Settings */}
              <div
                className="form-group"
                style={{
                  gridColumn: "span 2",
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  marginTop: "10px",
                }}
              >
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "12px",
                  }}
                >
                  🖼️ Logotipo Corporativo
                </h4>
                <div
                  style={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {settingsForm.logoBase64 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <img
                        src={settingsForm.logoBase64}
                        alt="Preview"
                        style={{
                          maxHeight: "80px",
                          maxWidth: "200px",
                          objectFit: "contain",
                          background: "#fff",
                          padding: "6px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{
                          color: "#dc2626",
                          fontSize: "11px",
                          padding: "2px 8px",
                        }}
                        onClick={() =>
                          setSettingsForm({ ...settingsForm, logoBase64: "" })
                        }
                      >
                        ✕ Eliminar Logo
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "2px dashed #cbd5e1",
                        padding: "20px",
                        borderRadius: "8px",
                        textAlign: "center",
                        flex: 1,
                        color: "#64748b",
                      }}
                    >
                      <p className="text-xs mb-2">
                        No se ha subido ningún logotipo para el PDF.
                      </p>
                      <label
                        className="btn btn-outline btn-sm"
                        style={{ cursor: "pointer", display: "inline-flex" }}
                      >
                        📁 Seleccionar Imagen
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={handleLogoUpload}
                        />
                      </label>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      flex: 1,
                      minWidth: "200px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        className="form-label"
                        style={{ fontSize: "11px" }}
                      >
                        Ancho en PDF (mm)
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        min="10"
                        max="100"
                        value={settingsForm.logoWidth}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            logoWidth: parseInt(e.target.value) || 45,
                          })
                        }
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        className="form-label"
                        style={{ fontSize: "11px" }}
                      >
                        Alto en PDF (mm)
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        min="5"
                        max="50"
                        value={settingsForm.logoHeight}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            logoHeight: parseInt(e.target.value) || 20,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Numbering Settings */}
              <div
                className="form-group"
                style={{
                  gridColumn: "span 2",
                  padding: "16px",
                  background: "#f0fdf4",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #bbf7d0",
                  marginTop: "10px",
                }}
              >
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "12px",
                  }}
                >
                  🔢 Numeración de Facturas
                </h4>

                {/* Numbering Mode Selector */}
                <div
                  style={{
                    marginBottom: "14px",
                    borderBottom: "1px solid #bbf7d0",
                    paddingBottom: "12px",
                  }}
                >
                  <label
                    className="form-label"
                    style={{ fontSize: "12px", fontWeight: "bold" }}
                  >
                    Modo de Numeración
                  </label>
                  <div
                    style={{
                      display: "flex",
                      gap: "20px",
                      marginTop: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="seqMode"
                        value="manual"
                        checked={settingsForm.seqMode === "manual"}
                        onChange={() => {
                          setSettingsForm((prev) => ({
                            ...prev,
                            seqMode: "manual",
                          }));
                        }}
                        style={{
                          width: "16px",
                          height: "16px",
                          accentColor: "var(--color-primary)",
                        }}
                      />
                      Manual (Iniciar en una numeración específica)
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="seqMode"
                        value="auto"
                        checked={settingsForm.seqMode === "auto"}
                        onChange={() => {
                          const lastSeq = lastInvoice
                            ? parseInt(lastInvoice.invoiceSeq) || 0
                            : 0;
                          setSettingsForm((prev) => ({
                            ...prev,
                            seqMode: "auto",
                            nextInvoiceSeq: lastSeq + 1,
                          }));
                        }}
                        style={{
                          width: "16px",
                          height: "16px",
                          accentColor: "var(--color-primary)",
                        }}
                      />
                      Automático (Seguir por la última numeración registrada)
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <label className="form-label" style={{ fontSize: "11px" }}>
                      Próximo nº de factura
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      disabled={settingsForm.seqMode === "auto"}
                      style={
                        settingsForm.seqMode === "auto"
                          ? {
                              background: "#e2e8f0",
                              cursor: "not-allowed",
                              color: "#475569",
                            }
                          : {}
                      }
                      value={settingsForm.nextInvoiceSeq}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          nextInvoiceSeq: parseInt(e.target.value) || 1,
                        })
                      }
                    />
                    <p
                      style={{
                        fontSize: "10px",
                        color: "#64748b",
                        marginTop: "4px",
                      }}
                    >
                      {settingsForm.seqMode === "auto"
                        ? "Establecido automáticamente en base a la última factura emitida."
                        : "Este será el número de la próxima factura que se emita. Puedes cambiarlo para empezar desde cualquier número."}
                    </p>
                  </div>
                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <label className="form-label" style={{ fontSize: "11px" }}>
                      Formato de numeración
                    </label>
                    <select
                      className="form-select"
                      value={settingsForm.invoiceNumberFormat}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          invoiceNumberFormat: e.target.value,
                        })
                      }
                    >
                      <option value="numeric">
                        Numérico simple (59, 60, 61...)
                      </option>
                      <option value="formatted">
                        Con prefijo (F-2026-0059, F-2026-0060...)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Database info panel if in auto mode */}
                {settingsForm.seqMode === "auto" && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      background: "#eff6ff",
                      borderRadius: "6px",
                      border: "1px solid #bfdbfe",
                      fontSize: "12px",
                      color: "#1e3a8a",
                    }}
                  >
                    ℹ️ <strong>Último registro en base de datos:</strong>
                    <div style={{ marginTop: "4px" }}>
                      • Última factura emitida:{" "}
                      {lastInvoice ? (
                        <strong>
                          {lastInvoice.invoiceNumber} (Secuencia:{" "}
                          {lastInvoice.invoiceSeq})
                        </strong>
                      ) : (
                        <strong>
                          Ninguna (se iniciará desde la secuencia 1)
                        </strong>
                      )}
                    </div>
                    <div>
                      • Siguiente número a generar:{" "}
                      <strong>
                        {lastInvoice
                          ? (parseInt(lastInvoice.invoiceSeq) || 0) + 1
                          : 1}
                      </strong>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: "12px",
                    padding: "8px 12px",
                    background: "#fff",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Vista previa del próximo número:{" "}
                  </span>
                  <strong
                    style={{ fontSize: "13px", color: "var(--color-primary)" }}
                  >
                    {settingsForm.invoiceNumberFormat === "formatted"
                      ? `F-${new Date().getFullYear()}-${String(settingsForm.nextInvoiceSeq || 1).padStart(4, "0")}`
                      : String(settingsForm.nextInvoiceSeq || 1)}
                  </strong>
                </div>
              </div>

              {/* Invoice Issue Date Settings */}
              <div
                className="form-group"
                style={{
                  gridColumn: "span 2",
                  padding: "16px",
                  background: "#f5f3ff",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #ddd6fe",
                  marginTop: "10px",
                }}
              >
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "12px",
                  }}
                >
                  📅 Fecha de Emisión de Facturas
                </h4>

                <div
                  style={{
                    display: "flex",
                    gap: "20px",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "220px" }}>
                    <label
                      className="form-label"
                      style={{ fontSize: "12px", fontWeight: "bold" }}
                    >
                      Modo de Fecha de Emisión
                    </label>
                    <select
                      className="form-select"
                      value={settingsForm.issueDateMode || "today"}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          issueDateMode: e.target.value,
                        })
                      }
                    >
                      <option value="today">
                        Fecha del día en el que se emite (Actual)
                      </option>
                      <option value="custom">
                        Fecha específica personalizada
                      </option>
                    </select>
                  </div>

                  {settingsForm.issueDateMode === "custom" && (
                    <div style={{ flex: 1, minWidth: "180px" }}>
                      <label
                        className="form-label"
                        style={{ fontSize: "11px", fontWeight: "bold" }}
                      >
                        Fecha específica de emisión
                      </label>
                      <input
                        type="date"
                        className="form-input"
                        required
                        value={settingsForm.customIssueDate || ""}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            customIssueDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
                <p
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    marginTop: "8px",
                    margin: 0,
                  }}
                >
                  Indica qué fecha se asignará a las facturas cuando se emiten
                  (desde borradores o creación manual). La fecha de vencimiento
                  se calculará automáticamente a 30 días a partir de esta fecha
                  de emisión.
                </p>
              </div>

              {/* PDF Save Configuration */}
              <div
                className="form-group"
                style={{
                  gridColumn: "span 2",
                  padding: "16px",
                  background: "#eff6ff",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #bfdbfe",
                  marginTop: "10px",
                }}
              >
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "12px",
                  }}
                >
                  💾 Configuración de Guardado de PDF
                </h4>
                <div style={{ marginBottom: "12px" }}>
                  <label className="form-label" style={{ fontSize: "11px" }}>
                    Patrón de nombre del archivo
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={settingsForm.fileNamePattern}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        fileNamePattern: e.target.value,
                      })
                    }
                    placeholder="Factura_{numero}_{comunidad}"
                  />
                  <p
                    style={{
                      fontSize: "10px",
                      color: "#64748b",
                      marginTop: "4px",
                    }}
                  >
                    Variables disponibles: <code>{"{numero}"}</code>{" "}
                    <code>{"{comunidad}"}</code> <code>{"{fecha}"}</code>{" "}
                    <code>{"{mes}"}</code> <code>{"{año}"}</code>
                  </p>
                  <div
                    style={{
                      marginTop: "4px",
                      padding: "6px 10px",
                      background: "#fff",
                      borderRadius: "4px",
                      border: "1px solid #e2e8f0",
                      fontSize: "11px",
                    }}
                  >
                    Ejemplo:{" "}
                    <strong>
                      {(
                        settingsForm.fileNamePattern ||
                        "Factura_{numero}_{comunidad}"
                      )
                        .replace("{numero}", "59")
                        .replace("{comunidad}", "Edif_Los_Olivos")
                        .replace("{fecha}", format(new Date(), "dd-MM-yyyy"))
                        .replace("{mes}", "Junio")
                        .replace("{año}", String(new Date().getFullYear()))}
                      .pdf
                    </strong>
                  </div>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <input
                    type="checkbox"
                    id="useSaveAsDialog"
                    checked={settingsForm.useSaveAsDialog || false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        useSaveAsDialog: e.target.checked,
                      })
                    }
                    style={{
                      width: "18px",
                      height: "18px",
                      accentColor: "var(--color-primary)",
                    }}
                  />
                  <label
                    htmlFor="useSaveAsDialog"
                    style={{ fontSize: "0.8125rem", cursor: "pointer" }}
                  >
                    Usar diálogo "Guardar Como" para elegir carpeta al descargar
                    {!window.showSaveFilePicker && (
                      <span
                        style={{
                          color: "#d97706",
                          fontSize: "11px",
                          display: "block",
                        }}
                      >
                        ⚠️ Tu navegador no soporta esta función. Usa Chrome o
                        Edge para habilitarla.
                      </span>
                    )}
                  </label>
                </div>
              </div>

              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label className="form-label">
                  Texto de Inscripción Mercantil (Pie de Página)
                </label>
                <textarea
                  className="form-textarea"
                  rows="3"
                  value={settingsForm.inscriptionText}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      inscriptionText: e.target.value,
                    })
                  }
                />
              </div>

              {/* SEPA Remittance Settings */}
              <div
                className="form-group"
                style={{
                  gridColumn: "span 2",
                  padding: "16px",
                  background: "#ecfdf5",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid #a7f3d0",
                  marginTop: "10px",
                }}
              >
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "12px",
                  }}
                >
                  🏦 Remesas Bancarias SEPA (Cuaderno 19)
                </h4>
                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: "0 0 160px" }}>
                    <label className="form-label" style={{ fontSize: "11px" }}>
                      Sufijo Acreedor SEPA
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      maxLength={3}
                      placeholder="000"
                      value={settingsForm.sepaSuffix || "000"}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          sepaSuffix: e.target.value
                            .replace(/[^0-9]/g, "")
                            .substring(0, 3),
                        })
                      }
                      style={{
                        fontFamily: "monospace",
                        textAlign: "center",
                        letterSpacing: "4px",
                        fontSize: "1.1rem",
                      }}
                    />
                    <p
                      style={{
                        fontSize: "10px",
                        color: "#64748b",
                        marginTop: "4px",
                      }}
                    >
                      Código de 3 dígitos asignado por tu banco. El valor por
                      defecto suele ser 000.
                    </p>
                  </div>
                  <div style={{ flex: 1, minWidth: "250px" }}>
                    <label className="form-label" style={{ fontSize: "11px" }}>
                      Identificador de Acreedor SEPA (calculado)
                    </label>
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#fff",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontFamily: "monospace",
                        fontSize: "1rem",
                        letterSpacing: "1px",
                        color: "#059669",
                        fontWeight: "bold",
                      }}
                    >
                      {(() => {
                        try {
                          return calculateSepaCreditorId(
                            "ES",
                            settingsForm.nif || "",
                            settingsForm.sepaSuffix || "000",
                          );
                        } catch {
                          return "ES??000" + (settingsForm.nif || "????????");
                        }
                      })()}
                    </div>
                    <p
                      style={{
                        fontSize: "10px",
                        color: "#64748b",
                        marginTop: "4px",
                      }}
                    >
                      Este es el identificador que te identifica como acreedor
                      en las remesas. Se calcula a partir de tu NIF y el sufijo.
                      Verifica que coincida con el que te ha proporcionado tu
                      banco.
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: "10px",
                    padding: "8px 12px",
                    background: "#f0fdf4",
                    borderRadius: "6px",
                    border: "1px solid #bbf7d0",
                    fontSize: "11px",
                    color: "#166534",
                  }}
                >
                  ℹ️ Para generar remesas, asegúrate de que la{" "}
                  <strong>Cuenta Bancaria (IBAN)</strong> de la empresa esté
                  configurada arriba y que las comunidades con método de pago
                  "Recibo Domiciliado" tengan su IBAN y mandato SEPA configurado
                  en su ficha.
                </div>
              </div>

              {/* SMTP Settings */}
              <div
                style={{
                  gridColumn: "span 2",
                  marginTop: "16px",
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: "16px",
                }}
              >
                <h4
                  className="text-sm font-bold mb-3 flex items-center gap-2"
                  style={{ color: "var(--color-primary)" }}
                >
                  📧 Configuración de Correo Emisor (SMTP)
                </h4>
                <div className="grid grid-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Servidor SMTP (Host)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="smtp.example.com"
                      value={settingsForm.smtpHost || ""}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          smtpHost: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Puerto SMTP</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="587"
                      value={settingsForm.smtpPort || ""}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          smtpPort: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Emisor (Usuario)</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="facturas@empresa.com"
                      value={settingsForm.smtpEmail || ""}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          smtpEmail: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Contraseña SMTP / App Password
                    </label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="••••••••••••••••"
                      value={settingsForm.smtpPassword || ""}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          smtpPassword: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <input
                        type="checkbox"
                        id="smtpSecure"
                        checked={settingsForm.smtpSecure || false}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            smtpSecure: e.target.checked,
                          })
                        }
                        style={{
                          width: "18px",
                          height: "18px",
                          accentColor: "var(--color-primary)",
                        }}
                      />
                      <label
                        htmlFor="smtpSecure"
                        style={{ fontSize: "0.8125rem", cursor: "pointer" }}
                      >
                        Usar conexión segura SSL/TLS (Normalmente puerto 465.
                        Para puerto 587 desmarcar)
                      </label>
                    </div>
                  </div>

                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="form-label">
                      Plantilla de Asunto de Email
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Factura {numero} - RyB Limpiezas"
                      value={settingsForm.emailSubjectTemplate || ""}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          emailSubjectTemplate: e.target.value,
                        })
                      }
                    />
                    <small style={{ color: "var(--text-muted)" }}>
                      Puedes usar: <code>{`{numero}`}</code>,{" "}
                      <code>{`{comunidad}`}</code>, <code>{`{mes}`}</code>,{" "}
                      <code>{`{año}`}</code>
                    </small>
                  </div>

                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="form-label">
                      Cuerpo del Email (Soporta HTML básico)
                    </label>
                    <textarea
                      className="form-textarea"
                      rows="4"
                      placeholder="<p>Hola,</p><p>Le adjuntamos la factura...</p>"
                      value={settingsForm.emailBodyTemplate || ""}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          emailBodyTemplate: e.target.value,
                        })
                      }
                    />
                    <small style={{ color: "var(--text-muted)" }}>
                      Puedes usar: <code>{`{numero}`}</code>,{" "}
                      <code>{`{comunidad}`}</code>, <code>{`{mes}`}</code>,{" "}
                      <code>{`{año}`}</code>
                    </small>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="modal-footer"
              style={{ borderTop: "none", padding: "16px 0 0 0" }}
            >
              <button
                type="submit"
                className="btn btn-primary"
                disabled={actionLoading}
              >
                {actionLoading ? "Guardando..." : "Guardar Ajustes"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Invoices Table View */
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <h4
              style={{
                margin: 0,
                fontWeight: "bold",
                fontSize: "0.875rem",
                color: "#334155",
              }}
            >
              {activeTab === "drafts"
                ? "Borradores"
                : activeTab === "pending"
                  ? "Pendientes de Cobro"
                  : "Facturas Cobradas"}{" "}
              ({filteredInvoices.length})
            </h4>
            <div style={{ display: "flex", gap: "8px" }}>
              {activeTab === "drafts" && filteredInvoices.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onClick={handleEmitAllDrafts}
                    disabled={actionLoading}
                  >
                    🚀 Emitir todos los borradores ({filteredInvoices.length})
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onClick={handleDeleteAllDrafts}
                    disabled={actionLoading}
                  >
                    🗑️ Borrar todos los borradores ({filteredInvoices.length})
                  </button>
                </>
              )}
              {filteredInvoices.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={handleOpenDownloadAll}
                  disabled={actionLoading}
                >
                  📥 Descargar todos los PDFs ({filteredInvoices.length})
                </button>
              )}
              {filteredInvoices.length > 0 && activeTab !== "drafts" && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderColor: "var(--color-primary)",
                    color: "var(--color-primary)",
                  }}
                  onClick={handleSendAllFilteredEmails}
                  disabled={actionLoading}
                >
                  ✉️ Enviar todas por Email ({filteredInvoices.length})
                </button>
              )}
              {activeTab === "pending" &&
                filteredInvoices.some((i) => i.paymentMethod === "recibo") && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "linear-gradient(135deg, #059669, #047857)",
                      color: "white",
                      border: "none",
                      fontWeight: "bold",
                    }}
                    onClick={handleOpenSepaModal}
                    disabled={actionLoading}
                  >
                    🏦 Generar Remesa SEPA
                  </button>
                )}
              {Object.keys(selectedInvoices).filter(
                (id) => selectedInvoices[id],
              ).length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={handleDeleteSelected}
                  disabled={actionLoading}
                >
                  🗑️ Borrar seleccionadas (
                  {
                    Object.keys(selectedInvoices).filter(
                      (id) => selectedInvoices[id],
                    ).length
                  }
                  )
                </button>
              )}
              {Object.keys(selectedInvoices).filter(
                (id) => selectedInvoices[id],
              ).length > 0 &&
                activeTab !== "drafts" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onClick={handleSendSelectedEmails}
                    disabled={actionLoading}
                  >
                    ✉️ Enviar seleccionadas (
                    {
                      Object.keys(selectedInvoices).filter(
                        (id) => selectedInvoices[id],
                      ).length
                    }
                    )
                  </button>
                )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase font-bold text-muted border-b">
                  <th className="p-3">
                    {activeTab === "drafts" ? "Borrador" : "Factura Nº"}
                  </th>
                  <th className="p-3">Comunidad</th>
                  <th className="p-3 text-center">CIF/NIF</th>
                  <th className="p-3 text-center">Base Imponible</th>
                  <th className="p-3 text-center">IVA</th>
                  <th className="p-3 text-center">Importe Total</th>
                  <th className="p-3 text-right">
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: "4px",
                      }}
                    >
                      <span>Acciones</span>
                      {filteredInvoices.length > 0 && (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "10px",
                            fontWeight: "normal",
                            textTransform: "none",
                            cursor: "pointer",
                            color: "#64748b",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={filteredInvoices.every(
                              (inv) => !!selectedInvoices[inv.id],
                            )}
                            onChange={(e) =>
                              handleToggleSelectAll(e.target.checked)
                            }
                            style={{
                              width: "13px",
                              height: "13px",
                              cursor: "pointer",
                            }}
                          />
                          Seleccionar todo
                        </label>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="p-6 text-center text-muted italic"
                    >
                      No hay facturas registradas en este estado para el periodo
                      seleccionado.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3 font-semibold">
                        {activeTab === "drafts" ? (
                          "📝 Borrador"
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span>📄 {inv.invoiceNumber}</span>
                            {inv.emailSent && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "#dcfce7",
                                  color: "#15803d",
                                  padding: "2px 6px",
                                  borderRadius: "12px",
                                  fontSize: "9px",
                                  fontWeight: "bold",
                                }}
                                title={
                                  inv.emailSentAt
                                    ? `Enviado por email el ${format(inv.emailSentAt.toDate ? inv.emailSentAt.toDate() : new Date(inv.emailSentAt), "dd/MM/yyyy HH:mm")}`
                                    : "Enviado por email"
                                }
                              >
                                📩 Enviado
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">
                          {inv.client.name}
                        </div>
                        {activeTab !== "drafts" && inv.issueDate && (
                          <div className="text-[10px] text-muted">
                            Emitida:{" "}
                            {format(
                              inv.issueDate.toDate
                                ? inv.issueDate.toDate()
                                : new Date(inv.issueDate),
                              "dd/MM/yyyy",
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center text-sm font-medium text-slate-600">
                        {inv.client.cif || "—"}
                      </td>
                      <td className="p-3 text-center text-sm">
                        {inv.subtotal.toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </td>
                      <td className="p-3 text-center text-xs text-muted">
                        {inv.taxAmount.toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        € ({inv.taxRate}%)
                      </td>
                      <td className="p-3 text-center font-bold text-slate-800">
                        {inv.totalAmount.toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </td>
                      <td
                        className="p-3 text-right"
                        style={{ minWidth: "330px" }}
                      >
                        <div className="flex justify-end gap-1.5">
                          <input
                            type="checkbox"
                            checked={!!selectedInvoices[inv.id]}
                            onChange={(e) =>
                              handleToggleSelectRow(inv.id, e.target.checked)
                            }
                            style={{
                              width: "15px",
                              height: "15px",
                              marginRight: "8px",
                              alignSelf: "center",
                              cursor: "pointer",
                            }}
                            title="Seleccionar para borrado en lote"
                          />
                          {inv.status === "draft" && (
                            <>
                              <button
                                className="btn btn-xs btn-success"
                                onClick={() => handleEmitInvoice(inv.id)}
                                disabled={actionLoading}
                                title="Emitir Factura Oficial"
                              >
                                🚀 Emitir
                              </button>
                              <button
                                className="btn btn-xs btn-secondary"
                                onClick={() => handleOpenEdit(inv)}
                                disabled={actionLoading}
                                title="Editar conceptos o datos fiscales"
                              >
                                ✏️ Editar
                              </button>
                            </>
                          )}
                          {inv.status === "pending" && (
                            <>
                              <button
                                className="btn btn-xs btn-success"
                                onClick={() => handleMarkAsPaid(inv.id)}
                                disabled={actionLoading}
                                title="Marcar como cobrada"
                              >
                                💸 Cobrada
                              </button>
                              <button
                                className="btn btn-xs btn-secondary"
                                onClick={() => handleOpenEdit(inv)}
                                disabled={actionLoading}
                                title="Editar factura emitida"
                              >
                                ✏️ Editar
                              </button>
                            </>
                          )}
                          {inv.status === "paid" && (
                            <>
                              <button
                                className="btn btn-xs btn-ghost text-xs"
                                onClick={() => handleResetToPending(inv.id)}
                                disabled={actionLoading}
                                style={{ color: "#d97706" }}
                                title="Deshacer cobro (volver a pendiente)"
                              >
                                🔄 Deshacer
                              </button>
                              <button
                                className="btn btn-xs btn-secondary"
                                onClick={() => handleOpenEdit(inv)}
                                disabled={actionLoading}
                                title="Editar factura emitida"
                              >
                                ✏️ Editar
                              </button>
                            </>
                          )}
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => generatePDF(inv, "preview")}
                            title="Vista previa de la factura"
                          >
                            👁️ Ver
                          </button>
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => generatePDF(inv)}
                            title="Descargar Factura PDF"
                          >
                            📥 PDF
                          </button>
                          {inv.status !== "draft" && (
                            <button
                              className="btn btn-xs btn-outline"
                              style={{
                                borderColor: "var(--color-primary)",
                                color: "var(--color-primary)",
                              }}
                              onClick={() => handleSendSingleEmail(inv)}
                              disabled={actionLoading}
                              title="Enviar factura por Email"
                            >
                              ✉️ Email
                            </button>
                          )}
                          <button
                            className="btn btn-xs"
                            style={{
                              backgroundColor: "#25d366",
                              color: "white",
                              border: "none",
                            }}
                            onClick={() => handleSendWhatsApp(inv)}
                            title="Enviar detalles por WhatsApp"
                          >
                            💬 WA
                          </button>
                          <button
                            className="btn btn-ghost btn-xs text-danger ml-1"
                            onClick={() => handleDeleteInvoice(inv.id)}
                            disabled={actionLoading}
                            title="Eliminar factura"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Manual Invoice */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div
            className="modal"
            style={{ maxWidth: "650px", width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">➕ Añadir Factura Manual</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveNewInvoice}>
              <div
                className="modal-body"
                style={{ maxHeight: "70vh", overflowY: "auto" }}
              >
                {/* Templates Selection */}
                <div
                  style={{
                    padding: "12px",
                    background: "#f1f5f9",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <h4
                    style={{
                      fontWeight: "bold",
                      fontSize: "0.875rem",
                      marginBottom: "8px",
                      color: "var(--color-primary)",
                    }}
                  >
                    📁 Cargar de Plantilla Frecuente
                  </h4>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <select
                      className="form-select"
                      style={{ flex: 1 }}
                      value=""
                      onChange={(e) => handleSelectTemplate(e.target.value)}
                    >
                      <option value="">-- Seleccionar plantilla... --</option>
                      {templates.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {templates.length > 0 && (
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "11px",
                        color: "#64748b",
                      }}
                    >
                      O gestiona plantillas existentes:
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                          marginTop: "4px",
                        }}
                      >
                        {templates.map((tmpl) => (
                          <div
                            key={tmpl.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              background: "#fff",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              border: "1px solid #cbd5e1",
                            }}
                          >
                            <span>{tmpl.name}</span>
                            <button
                              type="button"
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "#dc2626",
                                fontWeight: "bold",
                                fontSize: "10px",
                                marginLeft: "4px",
                              }}
                              onClick={() => handleDeleteTemplate(tmpl.id)}
                              title="Eliminar plantilla"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Client Type Toggle */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "12px" }}>
                    Tipo de Cliente
                  </label>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="add-client-type"
                        value="community"
                        checked={addForm.clientType === "community"}
                        onChange={() =>
                          setAddForm((prev) => ({
                            ...prev,
                            clientType: "community",
                            selectedCommunityId: "",
                            clientName: "",
                            clientCif: "",
                            clientAddress: "",
                            clientEmail: "",
                            paymentMethod: "transferencia",
                          }))
                        }
                      />
                      Comunidad Registrada
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="add-client-type"
                        value="manual"
                        checked={addForm.clientType === "manual"}
                        onChange={() =>
                          setAddForm((prev) => ({
                            ...prev,
                            clientType: "manual",
                            selectedCommunityId: "",
                            clientName: "",
                            clientCif: "",
                            clientAddress: "",
                            clientEmail: "",
                            paymentMethod: "transferencia",
                          }))
                        }
                      />
                      Datos Manuales / Cliente Puntual
                    </label>
                  </div>
                </div>

                {/* Community Selector (only if community type) */}
                {addForm.clientType === "community" && (
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Seleccionar Comunidad
                    </label>
                    <select
                      className="form-select"
                      required
                      value={addForm.selectedCommunityId}
                      onChange={(e) => handleSelectCommunity(e.target.value)}
                    >
                      <option value="">-- Elige una comunidad --</option>
                      {communities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Client fiscal details section */}
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "10px",
                    color: "var(--color-primary)",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                  }}
                >
                  👤 Datos Fiscales del Cliente
                </h4>
                <div className="grid grid-2 gap-3 mb-4">
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Nombre / Razón Social
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={addForm.clientName}
                      onChange={(e) =>
                        setAddForm({ ...addForm, clientName: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      CIF / NIF
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={addForm.clientCif}
                      onChange={(e) =>
                        setAddForm({ ...addForm, clientCif: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Dirección de Facturación
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={addForm.clientAddress}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          clientAddress: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Email / Teléfono de Envío
                    </label>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                        }}
                      >
                        {(addForm.clientEmail || "")
                          .split(/[,;]/)
                          .map((e) => e.trim())
                          .filter(Boolean)
                          .map((email, idx) => (
                            <span
                              key={idx}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "#e2e8f0",
                                color: "#334155",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: "500",
                              }}
                            >
                              {email}
                              <button
                                type="button"
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#64748b",
                                  cursor: "pointer",
                                  padding: "0 2px",
                                  fontWeight: "bold",
                                }}
                                onClick={() => {
                                  const list = (addForm.clientEmail || "")
                                    .split(/[,;]/)
                                    .map((e) => e.trim())
                                    .filter(Boolean);
                                  list.splice(idx, 1);
                                  setAddForm((prev) => ({
                                    ...prev,
                                    clientEmail: list.join(", "),
                                  }));
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Añadir email..."
                          id="new-client-email-add"
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === "," ||
                              e.key === ";"
                            ) {
                              e.preventDefault();
                              const val = e.target.value
                                .trim()
                                .replace(/[,;]/g, "");
                              if (val && val.includes("@")) {
                                const list = (addForm.clientEmail || "")
                                  .split(/[,;]/)
                                  .map((e) => e.trim())
                                  .filter(Boolean);
                                if (!list.includes(val)) {
                                  list.push(val);
                                  setAddForm((prev) => ({
                                    ...prev,
                                    clientEmail: list.join(", "),
                                  }));
                                }
                                e.target.value = "";
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "13px" }}
                          onClick={() => {
                            const input = document.getElementById(
                              "new-client-email-add",
                            );
                            if (input) {
                              const val = input.value.trim();
                              if (val && val.includes("@")) {
                                const list = (addForm.clientEmail || "")
                                  .split(/[,;]/)
                                  .map((e) => e.trim())
                                  .filter(Boolean);
                                if (!list.includes(val)) {
                                  list.push(val);
                                  setAddForm((prev) => ({
                                    ...prev,
                                    clientEmail: list.join(", "),
                                  }));
                                }
                                input.value = "";
                              }
                            }
                          }}
                        >
                          ➕
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Método de Pago
                    </label>
                    <select
                      className="form-select"
                      value={addForm.paymentMethod}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          paymentMethod: e.target.value,
                        })
                      }
                    >
                      <option value="transferencia">
                        Transferencia Bancaria
                      </option>
                      <option value="recibo">Recibo Domiciliado</option>
                      <option value="efectivo">Efectivo</option>
                    </select>
                  </div>
                </div>

                {/* Period & Invoice Number Section */}
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "10px",
                    color: "var(--color-primary)",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                  }}
                >
                  📅 Datos y Período de Facturación
                </h4>
                <div className="grid-3-col mb-4">
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Número de Factura
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: "8px" }}
                      placeholder="Ej: Borrador o número"
                      value={addForm.invoiceNumber || ""}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          invoiceNumber: e.target.value,
                        })
                      }
                      required
                    />
                    <small
                      style={{
                        fontSize: "10px",
                        color: "#64748b",
                        display: "block",
                        marginTop: "2px",
                      }}
                    >
                      Usa <strong>Borrador</strong> para crear borrador
                    </small>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Año período
                    </label>
                    <select
                      className="form-select"
                      value={addForm.year}
                      onChange={(e) =>
                        setAddForm({ ...addForm, year: e.target.value })
                      }
                    >
                      {[
                        currentYear - 2,
                        currentYear - 1,
                        currentYear,
                        currentYear + 1,
                        currentYear + 2,
                      ].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Mes período
                    </label>
                    <select
                      className="form-select"
                      value={addForm.month}
                      onChange={(e) =>
                        setAddForm({ ...addForm, month: e.target.value })
                      }
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i} value={i}>
                          {getMonthName(i)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Concept rows list */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                  }}
                >
                  <h4
                    style={{
                      fontWeight: "bold",
                      fontSize: "0.875rem",
                      color: "var(--color-primary)",
                      margin: 0,
                    }}
                  >
                    📋 Conceptos Facturados
                  </h4>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddAddItemRow}
                  >
                    ➕ Añadir Concepto
                  </button>
                </div>

                <div className="flex flex-col gap-3 mb-4">
                  {addForm.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        background: "#f8fafc",
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Descripción
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          required
                          placeholder="Ej: Abrillantado extraordinario portal"
                          value={item.description}
                          onChange={(e) =>
                            handleAddItemChange(
                              idx,
                              "description",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div style={{ width: "60px" }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Cant.
                        </label>
                        <input
                          type="number"
                          className="form-input text-center"
                          style={{ padding: "8px 4px" }}
                          required
                          min="0"
                          step="any"
                          value={item.quantity}
                          onChange={(e) =>
                            handleAddItemChange(idx, "quantity", e.target.value)
                          }
                        />
                      </div>
                      <div style={{ width: "90px" }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Precio (€)
                        </label>
                        <input
                          type="number"
                          className="form-input text-right"
                          style={{ padding: "8px" }}
                          required
                          min="0"
                          step="any"
                          value={item.price}
                          onChange={(e) =>
                            handleAddItemChange(idx, "price", e.target.value)
                          }
                        />
                      </div>
                      <div style={{ width: "90px" }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Total (€)
                        </label>
                        <input
                          type="text"
                          className="form-input text-right"
                          style={{
                            padding: "8px",
                            background: "#f1f5f9",
                            fontWeight: "bold",
                          }}
                          readOnly
                          value={(item.total || 0).toLocaleString("es-ES", {
                            minimumFractionDigits: 2,
                          })}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon text-danger"
                        style={{ alignSelf: "flex-end", minWidth: "36px" }}
                        onClick={() => handleAddRemoveItemRow(idx)}
                        disabled={addForm.items.length <= 1}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>

                {/* Calculations summary */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "20px",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                  }}
                >
                  <div style={{ width: "100px" }}>
                    <label className="form-label" style={{ fontSize: "11px" }}>
                      Tipo IVA (%)
                    </label>
                    <input
                      type="number"
                      className="form-input text-center"
                      min="0"
                      max="100"
                      value={addForm.taxRate}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          taxRate: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: "0.875rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      alignSelf: "flex-end",
                    }}
                  >
                    <div>
                      Subtotal:{" "}
                      <strong className="text-slate-800">
                        {addForm.items
                          .reduce(
                            (sum, item) => sum + (parseFloat(item.total) || 0),
                            0,
                          )
                          .toLocaleString("es-ES", {
                            minimumFractionDigits: 2,
                          })}{" "}
                        €
                      </strong>
                    </div>
                    <div>
                      IVA ({addForm.taxRate}%):{" "}
                      <strong className="text-slate-800">
                        {(
                          addForm.items.reduce(
                            (sum, item) => sum + (parseFloat(item.total) || 0),
                            0,
                          ) *
                          (addForm.taxRate / 100)
                        ).toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </strong>
                    </div>
                    <div style={{ fontSize: "1.05rem", marginTop: "4px" }}>
                      Importe Total:{" "}
                      <strong
                        className="text-primary"
                        style={{ fontSize: "1.2rem" }}
                      >
                        {(
                          addForm.items.reduce(
                            (sum, item) => sum + (parseFloat(item.total) || 0),
                            0,
                          ) *
                          (1 + addForm.taxRate / 100)
                        ).toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Template option to save */}
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    background: "#eff6ff",
                    borderRadius: "8px",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      id="saveAsTemplate"
                      checked={addForm.saveAsTemplate}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          saveAsTemplate: e.target.checked,
                        })
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        accentColor: "var(--color-primary)",
                        cursor: "pointer",
                      }}
                    />
                    <label
                      htmlFor="saveAsTemplate"
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: "bold",
                        color: "var(--color-primary)",
                        cursor: "pointer",
                      }}
                    >
                      Guardar como plantilla de factura frecuente
                    </label>
                  </div>
                  {addForm.saveAsTemplate && (
                    <div style={{ marginTop: "8px" }}>
                      <label
                        className="form-label"
                        style={{ fontSize: "12px", marginBottom: "4px" }}
                      >
                        Nombre identificativo de la plantilla
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="Ej: Limpieza puntual - Cristalera Edif. B"
                        value={addForm.templateName}
                        onChange={(e) =>
                          setAddForm({
                            ...addForm,
                            templateName: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAddModalOpen(false)}
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Creando..." : "Crear Borrador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Invoice */}
      {editModal.open && editModal.invoice && (
        <div
          className="modal-overlay"
          onClick={() => setEditModal({ open: false, invoice: null })}
        >
          <div
            className="modal"
            style={{ maxWidth: "650px", width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {editModal.invoice.status === "draft"
                  ? "Editar Factura Borrador"
                  : `✏️ Editar Factura Emitida (${editModal.invoice.invoiceNumber})`}
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditModal({ open: false, invoice: null })}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveInvoiceEdit}>
              <div
                className="modal-body"
                style={{ maxHeight: "70vh", overflowY: "auto" }}
              >
                {editModal.invoice.status !== "draft" && (
                  <div
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fbbf24",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      marginBottom: "16px",
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                    <div style={{ fontSize: "0.8125rem", color: "#92400e" }}>
                      <strong>Factura ya emitida</strong>. Los cambios en los
                      datos y conceptos se guardarán, pero el número de factura
                      no se modificará.
                    </div>
                  </div>
                )}

                {/* Client fiscal details section */}
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.875rem",
                    marginBottom: "10px",
                    color: "var(--color-primary)",
                  }}
                >
                  👤 Datos Fiscales del Cliente
                </h4>
                <div className="grid grid-2 gap-3 mb-4">
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Nombre / Razón Social
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={editForm.clientName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, clientName: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      CIF / NIF
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editForm.clientCif}
                      onChange={(e) =>
                        setEditForm({ ...editForm, clientCif: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Dirección de Facturación
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editForm.clientAddress}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          clientAddress: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Email / Teléfono de Envío
                    </label>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                        }}
                      >
                        {(editForm.clientEmail || "")
                          .split(/[,;]/)
                          .map((e) => e.trim())
                          .filter(Boolean)
                          .map((email, idx) => (
                            <span
                              key={idx}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "#e2e8f0",
                                color: "#334155",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: "500",
                              }}
                            >
                              {email}
                              <button
                                type="button"
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#64748b",
                                  cursor: "pointer",
                                  padding: "0 2px",
                                  fontWeight: "bold",
                                }}
                                onClick={() => {
                                  const list = (editForm.clientEmail || "")
                                    .split(/[,;]/)
                                    .map((e) => e.trim())
                                    .filter(Boolean);
                                  list.splice(idx, 1);
                                  setEditForm((prev) => ({
                                    ...prev,
                                    clientEmail: list.join(", "),
                                  }));
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Añadir email..."
                          id="new-client-email-edit"
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" ||
                              e.key === "," ||
                              e.key === ";"
                            ) {
                              e.preventDefault();
                              const val = e.target.value
                                .trim()
                                .replace(/[,;]/g, "");
                              if (val && val.includes("@")) {
                                const list = (editForm.clientEmail || "")
                                  .split(/[,;]/)
                                  .map((e) => e.trim())
                                  .filter(Boolean);
                                if (!list.includes(val)) {
                                  list.push(val);
                                  setEditForm((prev) => ({
                                    ...prev,
                                    clientEmail: list.join(", "),
                                  }));
                                }
                                e.target.value = "";
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "13px" }}
                          onClick={() => {
                            const input = document.getElementById(
                              "new-client-email-edit",
                            );
                            if (input) {
                              const val = input.value.trim();
                              if (val && val.includes("@")) {
                                const list = (editForm.clientEmail || "")
                                  .split(/[,;]/)
                                  .map((e) => e.trim())
                                  .filter(Boolean);
                                if (!list.includes(val)) {
                                  list.push(val);
                                  setEditForm((prev) => ({
                                    ...prev,
                                    clientEmail: list.join(", "),
                                  }));
                                }
                                input.value = "";
                              }
                            }
                          }}
                        >
                          ➕
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: "12px" }}>
                      Método de Pago
                    </label>
                    <select
                      className="form-select"
                      value={editForm.paymentMethod}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          paymentMethod: e.target.value,
                        })
                      }
                    >
                      <option value="transferencia">
                        Transferencia Bancaria
                      </option>
                      <option value="recibo">Recibo Domiciliado</option>
                      <option value="efectivo">Efectivo</option>
                    </select>
                  </div>
                </div>

                {/* Concept rows list */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                  }}
                >
                  <h4
                    style={{
                      fontWeight: "bold",
                      fontSize: "0.875rem",
                      color: "var(--color-primary)",
                      margin: 0,
                    }}
                  >
                    📋 Conceptos Facturados
                  </h4>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddItemRow}
                  >
                    ➕ Añadir Concepto
                  </button>
                </div>

                <div className="flex flex-col gap-3 mb-4">
                  {editForm.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        background: "#f8fafc",
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Descripción
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          required
                          placeholder="Ej: Limpieza mantenimiento"
                          value={item.description}
                          onChange={(e) =>
                            handleItemChange(idx, "description", e.target.value)
                          }
                        />
                      </div>
                      <div style={{ width: "60px" }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Cant.
                        </label>
                        <input
                          type="number"
                          className="form-input text-center"
                          style={{ padding: "8px 4px" }}
                          required
                          min="0"
                          step="any"
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(idx, "quantity", e.target.value)
                          }
                        />
                      </div>
                      <div style={{ width: "90px" }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Precio (€)
                        </label>
                        <input
                          type="number"
                          className="form-input text-right"
                          style={{ padding: "8px" }}
                          required
                          min="0"
                          step="any"
                          value={item.price}
                          onChange={(e) =>
                            handleItemChange(idx, "price", e.target.value)
                          }
                        />
                      </div>
                      <div style={{ width: "90px" }}>
                        <label
                          className="form-label"
                          style={{ fontSize: "11px", marginBottom: "2px" }}
                        >
                          Total (€)
                        </label>
                        <input
                          type="text"
                          className="form-input text-right"
                          style={{
                            padding: "8px",
                            background: "#f1f5f9",
                            fontWeight: "bold",
                          }}
                          readOnly
                          value={(item.total || 0).toLocaleString("es-ES", {
                            minimumFractionDigits: 2,
                          })}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon text-danger"
                        style={{ alignSelf: "flex-end", minWidth: "36px" }}
                        onClick={() => handleRemoveItemRow(idx)}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>

                {/* Invoice calculations summary */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "20px",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                  }}
                >
                  <div style={{ width: "100px" }}>
                    <label className="form-label" style={{ fontSize: "11px" }}>
                      Tipo IVA (%)
                    </label>
                    <input
                      type="number"
                      className="form-input text-center"
                      min="0"
                      max="100"
                      value={editForm.taxRate}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          taxRate: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: "0.875rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      alignSelf: "flex-end",
                    }}
                  >
                    <div>
                      Subtotal:{" "}
                      <strong className="text-slate-800">
                        {editForm.items
                          .reduce(
                            (sum, item) => sum + (parseFloat(item.total) || 0),
                            0,
                          )
                          .toLocaleString("es-ES", {
                            minimumFractionDigits: 2,
                          })}{" "}
                        €
                      </strong>
                    </div>
                    <div>
                      IVA ({editForm.taxRate}%):{" "}
                      <strong className="text-slate-800">
                        {(
                          editForm.items.reduce(
                            (sum, item) => sum + (parseFloat(item.total) || 0),
                            0,
                          ) *
                          (editForm.taxRate / 100)
                        ).toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </strong>
                    </div>
                    <div style={{ fontSize: "1.05rem", marginTop: "4px" }}>
                      Importe Total:{" "}
                      <strong
                        className="text-primary"
                        style={{ fontSize: "1.2rem" }}
                      >
                        {(
                          editForm.items.reduce(
                            (sum, item) => sum + (parseFloat(item.total) || 0),
                            0,
                          ) *
                          (1 + editForm.taxRate / 100)
                        ).toLocaleString("es-ES", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        €
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditModal({ open: false, invoice: null })}
                  disabled={actionLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Guardando..." : "Guardar Factura"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Preview PDF */}
      {previewModal.open && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (previewModal.pdfUrl) URL.revokeObjectURL(previewModal.pdfUrl);
            setPreviewModal({ open: false, pdfUrl: "" });
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: "900px",
              width: "95vw",
              height: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">👁️ Vista Previa de Factura</h3>
              <div className="flex gap-2">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = previewModal.pdfUrl;
                    a.download = "Factura_preview.pdf";
                    a.click();
                  }}
                >
                  📥 Descargar PDF
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (previewModal.pdfUrl)
                      URL.revokeObjectURL(previewModal.pdfUrl);
                    setPreviewModal({ open: false, pdfUrl: "" });
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden", background: "#f1f5f9" }}>
              <iframe
                src={previewModal.pdfUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Vista previa de factura"
              />
            </div>
          </div>
        </div>
      )}
      {/* Modal: Batch Download Selection */}
      {downloadModal.open && (
        <div
          className="modal-overlay"
          onClick={() => setDownloadModal({ open: false, invoices: [] })}
        >
          <div
            className="modal animate-fadeIn"
            style={{ maxWidth: "500px", width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">📥 Descargar lote de PDFs</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDownloadModal({ open: false, invoices: [] })}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ padding: "20px" }}>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#64748b",
                  marginBottom: "16px",
                }}
              >
                Vas a descargar <strong>{downloadModal.invoices.length}</strong>{" "}
                documentos PDF en lote correspondientes a la vista de{" "}
                <strong>
                  {activeTab === "drafts"
                    ? "Borradores"
                    : activeTab === "pending"
                      ? "Facturas Pendientes"
                      : "Facturas Cobradas"}
                </strong>
                .
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Option 1: Direct Folder Select */}
                <button
                  type="button"
                  onClick={handleSaveToFolder}
                  disabled={!window.showDirectoryPicker}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    width: "100%",
                    padding: "16px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: window.showDirectoryPicker ? "#fff" : "#f8fafc",
                    cursor: window.showDirectoryPicker
                      ? "pointer"
                      : "not-allowed",
                    textAlign: "left",
                    transition: "all 0.2s",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onMouseEnter={(e) => {
                    if (window.showDirectoryPicker) {
                      e.currentTarget.style.borderColor =
                        "var(--color-primary)";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (window.showDirectoryPicker) {
                      e.currentTarget.style.borderColor = "#cbd5e1";
                      e.currentTarget.style.backgroundColor = "#fff";
                    }
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "1.25rem" }}>📁</span>
                    <strong style={{ fontSize: "0.9rem", color: "#1e293b" }}>
                      Guardar en una carpeta elegida
                    </strong>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Selecciona una carpeta local de tu dispositivo. Los PDFs se
                    guardarán directamente en ella uno por uno.
                  </span>
                  {!window.showDirectoryPicker && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#d97706",
                        marginTop: "6px",
                        fontWeight: "500",
                      }}
                    >
                      ⚠️ No soportado en tu navegador actual (usa Chrome o
                      Edge).
                    </span>
                  )}
                </button>

                {/* Option 2: ZIP File */}
                <button
                  type="button"
                  onClick={handleDownloadAsZIP}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    width: "100%",
                    padding: "16px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.backgroundColor = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#cbd5e1";
                    e.currentTarget.style.backgroundColor = "#fff";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span style={{ fontSize: "1.25rem" }}>📦</span>
                    <strong style={{ fontSize: "0.9rem", color: "#1e293b" }}>
                      Descargar todo en un archivo ZIP
                    </strong>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Genera y descarga un único archivo comprimido .zip que
                    contiene todos los archivos PDF.
                  </span>
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDownloadModal({ open: false, invoices: [] })}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Email Sending Progress Console */}
      {emailProgressModal.open && (
        <div className="modal-overlay">
          <div
            className="modal animate-fadeIn"
            style={{ maxWidth: "600px", width: "95vw" }}
          >
            <div className="modal-header">
              <h3 className="modal-title">✉️ Envío de Facturas por Email</h3>
              {emailProgressModal.status !== "sending" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setEmailProgressModal({
                      open: false,
                      total: 0,
                      current: 0,
                      status: "idle",
                      log: [],
                    })
                  }
                >
                  ✕
                </button>
              )}
            </div>
            <div className="modal-body" style={{ padding: "20px" }}>
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  <span>Progreso de envío</span>
                  <span>
                    {emailProgressModal.current} de {emailProgressModal.total}
                  </span>
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "#e2e8f0",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${emailProgressModal.total > 0 ? (emailProgressModal.current / emailProgressModal.total) * 100 : 0}%`,
                      height: "100%",
                      background: "var(--color-primary)",
                      transition: "width 0.3s ease",
                    }}
                  ></div>
                </div>
              </div>

              {/* Console log box */}
              <div
                style={{
                  background: "#0f172a",
                  color: "#38bdf8",
                  padding: "12px",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  height: "200px",
                  overflowY: "auto",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)",
                }}
              >
                {emailProgressModal.log.map((line, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "4px",
                      color: line.startsWith("❌")
                        ? "#ef4444"
                        : line.startsWith("✅")
                          ? "#22c55e"
                          : line.startsWith("⚠️")
                            ? "#f59e0b"
                            : "#38bdf8",
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={emailProgressModal.status === "sending"}
                onClick={() =>
                  setEmailProgressModal({
                    open: false,
                    total: 0,
                    current: 0,
                    status: "idle",
                    log: [],
                  })
                }
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: SEPA Remittance */}
      {sepaModal.open && (
        <div
          className="modal-overlay"
          onClick={() => setSepaModal((prev) => ({ ...prev, open: false }))}
        >
          <div
            className="modal"
            style={{ maxWidth: "750px", width: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">🏦 Generar Remesa Bancaria SEPA</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setSepaModal((prev) => ({ ...prev, open: false }))
                }
              >
                ✕
              </button>
            </div>
            <div
              className="modal-body"
              style={{ padding: "20px", maxHeight: "70vh", overflowY: "auto" }}
            >
              {/* Collection date */}
              <div style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ fontWeight: "bold" }}>
                  📅 Fecha de Cobro / Adeudo
                </label>
                <input
                  type="date"
                  className="form-input"
                  style={{ maxWidth: "220px" }}
                  value={sepaModal.collectionDate}
                  onChange={(e) =>
                    setSepaModal((prev) => ({
                      ...prev,
                      collectionDate: e.target.value,
                    }))
                  }
                />
                <p
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    marginTop: "4px",
                  }}
                >
                  Fecha en la que el banco realizará el cargo en las cuentas de
                  las comunidades. Debe ser al menos 2 días hábiles en el
                  futuro.
                </p>
              </div>

              {/* Eligible invoices summary */}
              <div style={{ marginBottom: "16px" }}>
                <h4
                  style={{
                    fontWeight: "bold",
                    fontSize: "0.85rem",
                    marginBottom: "8px",
                    color: "#059669",
                  }}
                >
                  ✅ Facturas incluidas en la remesa (
                  {sepaModal.eligibleInvoices.length})
                </h4>
                {sepaModal.eligibleInvoices.length > 0 ? (
                  <div
                    style={{
                      border: "1px solid #d1fae5",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.8rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#ecfdf5" }}>
                          <th
                            style={{
                              padding: "8px 12px",
                              textAlign: "left",
                              fontWeight: "bold",
                              color: "#065f46",
                            }}
                          >
                            Factura
                          </th>
                          <th
                            style={{
                              padding: "8px 12px",
                              textAlign: "left",
                              fontWeight: "bold",
                              color: "#065f46",
                            }}
                          >
                            Comunidad
                          </th>
                          <th
                            style={{
                              padding: "8px 12px",
                              textAlign: "center",
                              fontWeight: "bold",
                              color: "#065f46",
                            }}
                          >
                            IBAN
                          </th>
                          <th
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              fontWeight: "bold",
                              color: "#065f46",
                            }}
                          >
                            Importe
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sepaModal.eligibleInvoices.map((inv) => (
                          <tr
                            key={inv.id}
                            style={{ borderTop: "1px solid #d1fae5" }}
                          >
                            <td
                              style={{
                                padding: "6px 12px",
                                fontWeight: "bold",
                              }}
                            >
                              {inv.invoiceNumber}
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              {inv.client.name}
                            </td>
                            <td
                              style={{
                                padding: "6px 12px",
                                textAlign: "center",
                                fontFamily: "monospace",
                                fontSize: "0.7rem",
                                color: "#475569",
                              }}
                            >
                              {inv._cleanIban
                                ? `${inv._cleanIban.substring(0, 4)}...${inv._cleanIban.substring(inv._cleanIban.length - 4)}`
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: "6px 12px",
                                textAlign: "right",
                                fontWeight: "bold",
                              }}
                            >
                              {inv.totalAmount.toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              €
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr
                          style={{
                            borderTop: "2px solid #059669",
                            background: "#ecfdf5",
                          }}
                        >
                          <td
                            colSpan="3"
                            style={{
                              padding: "8px 12px",
                              fontWeight: "bold",
                              color: "#065f46",
                            }}
                          >
                            TOTAL REMESA
                          </td>
                          <td
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              fontWeight: "bold",
                              fontSize: "1rem",
                              color: "#059669",
                            }}
                          >
                            {sepaModal.eligibleInvoices
                              .reduce((sum, i) => sum + i.totalAmount, 0)
                              .toLocaleString("es-ES", {
                                minimumFractionDigits: 2,
                              })}{" "}
                            €
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      background: "#fef2f2",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      color: "#991b1b",
                      fontSize: "0.85rem",
                    }}
                  >
                    ❌ No hay facturas válidas para incluir en la remesa. Revisa
                    que las comunidades con método "Recibo Domiciliado" tengan
                    su IBAN correctamente configurado.
                  </div>
                )}
              </div>

              {/* Warnings */}
              {sepaModal.warnings.length > 0 && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px",
                    background: "#fffbeb",
                    borderRadius: "8px",
                    border: "1px solid #fde68a",
                  }}
                >
                  <h4
                    style={{
                      fontWeight: "bold",
                      fontSize: "0.8rem",
                      marginBottom: "6px",
                      color: "#92400e",
                    }}
                  >
                    ⚠️ Advertencias
                  </h4>
                  {sepaModal.warnings.map((w, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: "0.75rem",
                        color: "#78350f",
                        marginBottom: "3px",
                      }}
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Mark as paid checkbox */}
              {sepaModal.eligibleInvoices.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    background: "#f8fafc",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <input
                    type="checkbox"
                    id="sepaMarkAsPaid"
                    checked={sepaModal.markAsPaid}
                    onChange={(e) =>
                      setSepaModal((prev) => ({
                        ...prev,
                        markAsPaid: e.target.checked,
                      }))
                    }
                    style={{
                      width: "18px",
                      height: "18px",
                      accentColor: "#059669",
                    }}
                  />
                  <label
                    htmlFor="sepaMarkAsPaid"
                    style={{ fontSize: "0.8125rem", cursor: "pointer" }}
                  >
                    Marcar automáticamente las facturas remesadas como{" "}
                    <strong>"Cobradas"</strong> tras generar el archivo
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setSepaModal((prev) => ({ ...prev, open: false }))
                }
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  background: "linear-gradient(135deg, #059669, #047857)",
                  color: "white",
                  border: "none",
                  fontWeight: "bold",
                }}
                onClick={handleGenerateSepaXML}
                disabled={sepaModal.eligibleInvoices.length === 0}
              >
                🏦 Descargar Remesa XML ({sepaModal.eligibleInvoices.length}{" "}
                adeudos)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
