import { useState, useEffect } from 'react';
import { getWorkdaysForAdmin, deleteWorkday } from '../../services/workdayService';
import { getAllUsers } from '../../services/authService';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDecimalHours, formatMinutes } from '../../utils/formatTime';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function ControlHorarioPage() {
  const [workdays, setWorkdays] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    userId: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadWorkdays();
  }, [filters, users]); 

  async function loadInitialData() {
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  async function loadWorkdays() {
    setLoading(true);
    try {
      const data = await getWorkdaysForAdmin(
        new Date(filters.startDate),
        new Date(filters.endDate),
        filters.userId || null
      );
      
      const enriched = data.map(wd => {
        const u = users.find(o => o.uid === wd.userId);
        return { ...wd, operarioName: u ? u.name : 'Desconocido' };
      });
      
      setWorkdays(enriched);
    } catch (err) {
      console.error('Error loading workdays:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteWorkday = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) {
      try {
        await deleteWorkday(id);
        setWorkdays(prev => prev.filter(wd => wd.id !== id));
      } catch (err) {
        alert('Error al eliminar el registro');
      }
    }
  };

  const handleExportPDF = () => {
    if (!filters.userId) {
      alert('Por favor, selecciona un operario primero para generar su informe detallado de firmas.');
      return;
    }
    const operario = users.find(u => u.uid === filters.userId);
    const operarioName = operario ? (operario.name || operario.email) : 'Operario';
    
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138); // Primary color
    doc.text('RyB Limpiezas', 14, 20);
    
    doc.setFontSize(16);
    doc.setTextColor(100);
    doc.text('Control Horario de Operario', 14, 30);
    
    // Info
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Operario: ${operarioName}`, 14, 45);
    doc.text(`Período: ${format(new Date(filters.startDate), 'dd/MM/yyyy')} al ${format(new Date(filters.endDate), 'dd/MM/yyyy')}`, 14, 52);
    doc.text(`Fecha de emisión: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 59);
    
    // Table
    const tableData = workdays.map(wd => [
      safeFormatDate(wd.date),
      safeFormatDate(wd.startTime, 'HH:mm'),
      safeFormatDate(wd.endTime, 'HH:mm'),
      wd.totalMinutes ? formatMinutes(wd.totalMinutes) : '-'
    ]);
    
    doc.autoTable({
      startY: 70,
      head: [['Fecha', 'Inicio', 'Fin', 'Duración']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillStyle: 'fill', fillColor: [37, 99, 235] }, // Accent color
    });
    
    // Totals
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Tiempo Total Formateado: ${formatMinutes(totalMinutes)}`, 14, finalY);
    
    // Signature lines
    const midY = finalY + 30;
    doc.setDrawColor(200);
    doc.line(14, midY, 80, midY);
    doc.line(120, midY, 190, midY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Firma de la Empresa', 14, midY + 7);
    doc.text('Firma del Operario', 120, midY + 7);
    
    // Footer notice
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Este documento sirve como registro oficial de las jornadas realizadas en el período indicado.', 14, doc.internal.pageSize.height - 10);
    
    doc.save(`Control_Horario_${operarioName.replace(/\s+/g, '_')}_${filters.startDate}.pdf`);
  };



  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const totalMinutes = workdays.reduce((acc, current) => acc + (current.totalMinutes || 0), 0);
  const totalHours = totalMinutes / 60;

  const safeFormatDate = (dateVal, formatStr = 'dd/MM/yyyy') => {
    try {
      if (!dateVal) return '-';
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      // Validar si la fecha es válida
      if (isNaN(d.getTime())) return '-';
      return format(d, formatStr);
    } catch (e) {
      return '-';
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="card mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Operario</label>
            <select 
              name="userId" 
              className="input" 
              value={filters.userId} 
              onChange={handleFilterChange}
            >
              <option value="">Todos los registrados</option>
              {Array.isArray(users) && users.map(u => (
                <option key={u.uid} value={u.uid}>{u.name || u.email}</option>
              ))}
            </select>

          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">Desde</label>
            <input 
              type="date" 
              name="startDate" 
              className="input" 
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="label">Hasta</label>
            <input 
              type="date" 
              name="endDate" 
              className="input" 
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="flex-none">
            <button 
              onClick={handleExportPDF}
              className="btn btn-primary"
              style={{ 
                height: '42px', 
                background: 'var(--color-accent)', 
                borderColor: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
              }}
              title="Descargar registro en PDF"
            >
              <span style={{ fontSize: '1.2rem' }}>📄</span> 
              <span>GENERAR PDF</span>
            </button>
          </div>
        </div>
      </div>

      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-label text-muted">Total Registros</div>
          <div className="stat-value text-primary">{workdays.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label text-muted">Horas Totales del Periodo</div>
          <div className="stat-value text-accent">{formatMinutes(totalMinutes)}</div>
        </div>
      </div>

      <div className="card overflow-x-auto shadow-sm">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Operario</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Duración</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8"><div className="spinner mx-auto"></div></td></tr>
            ) : workdays.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-8 text-muted italic">No se encontraron jornadas en este rango</td></tr>
            ) : (
              workdays.map(wd => (
                <tr key={wd.id} className="hover:bg-slate-50 transition-colors">
                  <td className="font-bold">
                    {safeFormatDate(wd.date)}
                  </td>
                  <td>
                    <span className="font-medium text-slate-700">{wd.userName || wd.operarioName || 'Desconocido'}</span>
                  </td>
                  <td className="text-slate-600">{safeFormatDate(wd.startTime, 'HH:mm')}</td>
                  <td className="text-slate-600">{safeFormatDate(wd.endTime, 'HH:mm')}</td>
                  <td className="font-medium">
                    {wd.totalMinutes ? formatMinutes(wd.totalMinutes) : '-'}
                  </td>
                  <td>
                    <span 
                      className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{ 
                        backgroundColor: wd.status === 'active' ? '#fff7ed' : '#f0fdf4',
                        color: wd.status === 'active' ? '#c2410c' : '#15803d',
                        border: `1px solid ${wd.status === 'active' ? '#ffedd5' : '#dcfce7'}`
                      }}
                    >
                      {wd.status === 'active' ? '● En curso' : '✓ Finalizada'}
                    </span>
                  </td>
                  <td className="text-right">
                    <button 
                      onClick={() => handleDeleteWorkday(wd.id)}
                      className="btn btn-ghost btn-sm text-danger"
                      title="Eliminar registro"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

}
