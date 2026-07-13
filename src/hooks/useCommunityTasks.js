import { useState } from 'react';
import { format } from 'date-fns';
import {
  getCommunityTasks,
  createCommunityTask,
  updateCommunityTask,
  deleteCommunityTask,
  createAssignment,
  getAssignmentsForCommunity,
  deleteAssignment
} from '../services/taskService';
import {
  generateServicesForTask,
  deleteAllServicesForTask
} from '../services/scheduleService';
import { transferPermanent } from '../services/transferService';

export default function useCommunityTasks({
  selectedCommunity,
  setAssignments,
  actionLoading,
  setActionLoading,
  userProfile
}) {
  const [communityTasks, setCommunityTasks] = useState([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null = create mode, task = edit mode
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [reassignModal, setReassignModal] = useState({ open: false, task: null });

  const [taskForm, setTaskForm] = useState({
    taskName: '', 
    frequencyType: 'weekly', 
    frequencyValue: 1,
    weekDays: [], 
    monthDays: [],
    serviceMode: 'periodic', // 'periodic', 'once', 'range'
    punctualDate: format(new Date(), 'yyyy-MM-dd'),
    startDate: '', // Fecha de inicio para periódicas
    endDate: '',   // Fecha de fin (opcional)
    weekOfMonth: '', // 1, 2, 3, 4, 5
    monthOfYear: '', // 0-11
    assignedUserId: '', // Operario específico para esta tarea
    flexibleWeek: false,
    isGarage: false, // Indica si es una tarea de garaje
    printColor: '#ef4444', // Color para impresión: verde, amarillo o rojo
    isUrgent: false,
  });

  const openCreateTaskModal = () => {
    setEditingTask(null);
    setTaskForm({
      taskName: '',
      frequencyType: 'weekly',
      frequencyValue: 1,
      weekDays: [],
      monthDays: [],
      serviceMode: 'periodic',
      punctualDate: format(new Date(), 'yyyy-MM-dd'),
      startDate: '',
      endDate: '',
      weekOfMonth: '',
      monthOfYear: '',
      assignedUserId: '',
      flexibleWeek: false,
      isGarage: false,
      printColor: '#ef4444',
      isUrgent: false,
    });
    setShowTaskModal(true);
  };

  const openEditTaskModal = (task) => {
    setEditingTask(task);
    setTaskForm({
      taskName: task.taskName || '',
      frequencyType: task.frequencyType || 'weekly',
      frequencyValue: task.frequencyValue || 1,
      weekDays: task.weekDays || [],
      monthDays: task.monthDays || [],
      serviceMode: task.serviceMode || 'periodic',
      punctualDate: task.punctualDate ? (typeof task.punctualDate === 'string' ? task.punctualDate : format(task.punctualDate.toDate?.() || new Date(task.punctualDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd'),
      startDate: task.startDate ? (typeof task.startDate === 'string' ? task.startDate : format(task.startDate.toDate?.() || new Date(task.startDate), 'yyyy-MM-dd')) : '',
      endDate: task.endDate ? (typeof task.endDate === 'string' ? task.endDate : format(task.endDate.toDate?.() || new Date(task.endDate), 'yyyy-MM-dd')) : '',
      weekOfMonth: task.weekOfMonth != null ? String(task.weekOfMonth) : '',
      monthOfYear: task.monthOfYear != null ? String(task.monthOfYear) : '',
      assignedUserId: task.assignedUserId || '',
      flexibleWeek: task.flexibleWeek || false,
      isGarage: task.isGarage || false,
      printColor: task.printColor || '#ef4444',
      isUrgent: task.isUrgent || false,
    });
    setShowTaskModal(true);
  };

  const toggleWeekDay = (day) => {
    setTaskForm(prev => ({
      ...prev,
      weekDays: prev.weekDays.includes(day)
        ? prev.weekDays.filter(d => d !== day)
        : [...prev.weekDays, day],
    }));
  };

  const handleSaveTask = async (e) => {
    if (e) e.preventDefault();
    if (!selectedCommunity) return;
    if (actionLoading) return;
    setActionLoading(true);

    const taskData = {
      communityId: selectedCommunity.id,
      taskName: taskForm.taskName,
      assignedUserId: taskForm.assignedUserId || null,
      frequencyValue: parseInt(taskForm.frequencyValue) || 1,
      weekDays: taskForm.weekDays,
      monthDays: taskForm.monthDays.map(Number),
      frequencyType: taskForm.serviceMode === 'once' ? 'once' : (taskForm.serviceMode === 'range' ? 'range' : taskForm.frequencyType),
      punctualDate: taskForm.serviceMode === 'once' ? taskForm.punctualDate : null,
      startDate: taskForm.startDate || null,
      endDate: taskForm.endDate || null,
      weekOfMonth: taskForm.weekOfMonth ? parseInt(taskForm.weekOfMonth) : null,
      monthOfYear: taskForm.monthOfYear !== '' ? parseInt(taskForm.monthOfYear) : null,
      serviceMode: taskForm.serviceMode || 'periodic',
      flexibleWeek: taskForm.flexibleWeek || false,
      isGarage: taskForm.isGarage || false,
      printColor: taskForm.printColor || '#ef4444',
      isUrgent: taskForm.isUrgent || false,
    };

    try {
      if (editingTask) {
        // UPDATE existing task — regenerates future services automatically inside updateCommunityTask
        await updateCommunityTask(editingTask.id, taskData);
      } else {
        // CREATE new task + generate services
        const newTask = await createCommunityTask(taskData);
        if (newTask?.id) await generateServicesForTask(newTask.id);
      }

      setShowTaskModal(false);
      setEditingTask(null);
      const tasks = await getCommunityTasks(selectedCommunity.id);
      setCommunityTasks(tasks);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveTask = async (task) => {
    if (actionLoading) return;

    // Step 1: choose deletion mode
    const deleteAll = window.confirm(
      `¿Eliminar la tarea "${task.taskName}"?\n\n` +
      `• ACEPTAR → Eliminar tarea + TODO el historial de servicios\n` +
      `• CANCELAR → Ir al siguiente paso para eliminar solo futuros`
    );

    if (!deleteAll) {
      // Step 1b: user chose "only future" path — ask one final confirmation
      const confirmFuture = window.confirm(
        `Se eliminarán solo los servicios FUTUROS PENDIENTES de "${task.taskName}" y se desactivará la tarea.\n\n¿Confirmar?`
      );
      if (!confirmFuture) return;
    } else {
      // Safety confirm before wiping all history
      const confirmAll = window.confirm(
        `⚠️ ATENCIÓN: Se borrarán PERMANENTEMENTE todos los registros históricos de "${task.taskName}" (servicios completados incluidos).\n\n¿Estás seguro?`
      );
      if (!confirmAll) return;
    }

    setActionLoading(true);
    try {
      if (deleteAll) {
        await deleteAllServicesForTask(task.id);
      }
      await deleteCommunityTask(task.id);
      const tasks = await getCommunityTasks(selectedCommunity.id);
      setCommunityTasks(tasks);
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentReassign = async (toUserId) => {
    if (!toUserId || !reassignModal.task) return;
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await transferPermanent({
        communityTaskId: reassignModal.task.id,
        fromUserId: reassignModal.task.assignedUserId,
        toUserId,
        adminUserId: userProfile.uid
      });
      
      alert('Tarea reasignada permanentemente. Se han regenerado los servicios futuros.');
      setReassignModal({ open: false, task: null });
      const tasks = await getCommunityTasks(selectedCommunity.id);
      setCommunityTasks(tasks);
    } catch (err) {
      alert('Error en reasignación: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignOperario = async (e) => {
    if (e) e.preventDefault();
    if (!assignUserId || !selectedCommunity) return;
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await createAssignment({ communityId: selectedCommunity.id, userId: assignUserId });
      
      // Generar servicios para todas las tareas de esta comunidad para el nuevo operario
      for (const t of communityTasks) {
        await generateServicesForTask(t.id);
      }

      setShowAssignModal(false);
      setAssignUserId('');
      const assigns = await getAssignmentsForCommunity(selectedCommunity.id);
      setAssignments(assigns);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAssignment = async (id) => {
    if (!selectedCommunity) return;
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await deleteAssignment(id);
      const assigns = await getAssignmentsForCommunity(selectedCommunity.id);
      setAssignments(assigns);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return {
    communityTasks,
    setCommunityTasks,
    showTaskModal,
    setShowTaskModal,
    editingTask,
    setEditingTask,
    taskForm,
    setTaskForm,
    showAssignModal,
    setShowAssignModal,
    assignUserId,
    setAssignUserId,
    reassignModal,
    setReassignModal,
    openCreateTaskModal,
    openEditTaskModal,
    toggleWeekDay,
    handleSaveTask,
    handleRemoveTask,
    handlePermanentReassign,
    handleAssignOperario,
    handleRemoveAssignment
  };
}
