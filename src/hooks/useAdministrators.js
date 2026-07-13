import { useState } from 'react';
import { createAdministrator, updateAdministrator, deleteAdministrator } from '../services/administratorService';

export default function useAdministrators({ onRefresh, actionLoading, setActionLoading }) {
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    phone: '',
    contactPerson: ''
  });

  const openCreateAdminModal = () => {
    setEditingAdmin(null);
    setAdminForm({ name: '', email: '', phone: '', contactPerson: '' });
    setShowAdminModal(true);
  };

  const openEditAdminModal = (admin) => {
    setEditingAdmin(admin);
    setAdminForm({
      name: admin.name || '',
      email: admin.email || '',
      phone: admin.phone || '',
      contactPerson: admin.contactPerson || ''
    });
    setShowAdminModal(true);
  };

  const handleSaveAdmin = async (e) => {
    if (e) e.preventDefault();
    if (actionLoading) return; // Prevent concurrent submissions
    setActionLoading(true);
    try {
      if (editingAdmin) {
        await updateAdministrator(editingAdmin.id, adminForm);
      } else {
        await createAdministrator(adminForm);
      }
      setShowAdminModal(false);
      if (onRefresh) await onRefresh();
      alert(editingAdmin ? 'Administrador actualizado correctamente.' : 'Administrador creado correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error al guardar administrador: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAdmin = async (id) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este Administrador de Fincas? Se desactivará de la lista.')) return;
    if (actionLoading) return; // Prevent concurrent submissions
    setActionLoading(true);
    try {
      await deleteAdministrator(id);
      if (onRefresh) await onRefresh();
      alert('Administrador eliminado correctamente.');
    } catch (err) {
      console.error(err);
      alert('Error al eliminar administrador: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return {
    showAdminModal,
    setShowAdminModal,
    editingAdmin,
    adminForm,
    setAdminForm,
    openCreateAdminModal,
    openEditAdminModal,
    handleSaveAdmin,
    handleDeleteAdmin
  };
}
