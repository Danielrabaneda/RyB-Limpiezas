import { useState, useEffect } from 'react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek,
  isToday 
} from 'date-fns';
import { es } from 'date-fns/locale';
import { getScheduledServicesRange, generateServicesForMonth, syncServicesForMonth } from '../services/scheduleService';
import { getCommunities } from '../services/communityService';
import { transferService, transferDay, transferWeek, rescheduleService } from '../services/transferService';
import TransferModal from './TransferModal';
import RescheduleModal from './RescheduleModal';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import PrintableCalendar from './PrintableCalendar';
import ServiceItem from './ServiceItem';
import jsPDF from 'jspdf';

export default function PlanningCalendar({ userId = null, isAdmin = false, operarios = [] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthServices, setMonthServices] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  // Transfer state
  const [transferModal, setTransferModal] = useState({ open: false, type: '', date: null, serviceId: null, fromUserId: null });
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, serviceId: null, currentDate: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPrintOpId, setSelectedPrintOpId] = useState('all');

  useEffect(() => {
    loadMonthData();
  }, [currentMonth, userId]);

  useEffect(() => {
    // Load communities and tasks for reference
    async function loadRefs() {
      console.log('Cargando referencias (comunidades y tareas)...');
      try {
        const comSnap = await getDocs(collection(db, 'communities'));
        const comData = comSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCommunities(comData);
        console.log(`${comData.length} comunidades totales cargadas.`);
      } catch (e) { console.error('Error cargando comunidades:', e); }

      try {
        const q = query(collection(db, 'communityTasks'), where('active', '==', true));
        const tasksSnap = await getDocs(q);
        const taskList = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllTasks(taskList);
        console.log(`${taskList.length} tareas totales cargadas.`);
      } catch (e) { console.error('Error cargando tareas:', e); }
    }
    loadRefs();
  }, []);

  async function loadMonthData() {
    setLoading(true);
    try {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const filters = userId ? { userId } : {};
      const svcs = await getScheduledServicesRange(start, end, filters);
      setMonthServices(svcs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!isAdmin) return;
    if (!confirm(`¿Generar servicios para todo el mes de ${format(currentMonth, 'MMMM', { locale: es })}?`)) return;
    setGenerating(true);
    try {
      const created = await generateServicesForMonth(currentMonth);
      alert(`Se han generado ${created} nuevos servicios.`);
      await loadMonthData();
    } catch (err) {
      console.error(err);
      alert('Error al generar servicios');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSync() {
    if (!isAdmin) return;
    if (!confirm(`¿Sincronizar y actualizar servicios para el mes de ${format(currentMonth, 'MMMM', { locale: es })}?\n(Eliminará servicios pendientes obsoletos y creará nuevos según la configuración activa)`)) return;
    setGenerating(true);
    try {
      const result = await syncServicesForMonth(currentMonth);
      
      if (result.createdCount === 0 && result.deletedCount === 0) {
        alert("El calendario ya está al día. Los cambios realizados en las comunidades se sincronizan automáticamente al guardar.");
      } else {
        alert(`Sincronización completada:\n- ${result.createdCount} servicios nuevos creados.\n- ${result.deletedCount} servicios obsoletos eliminados.`);
      }
      
      await loadMonthData();
    } catch (err) {
      console.error(err);
      alert('Error al sincronizar servicios');
    } finally {
      setGenerating(false);
    }
  }

  async function handleTransferConfirm(toUserId) {
    if (!toUserId) return;
    setActionLoading(true);
    try {
      const role = isAdmin ? 'admin' : 'operario';
      if (transferModal.type === 'single') {
        await transferService({
          serviceId: transferModal.serviceId,
          fromUserId: transferModal.fromUserId,
          toUserId,
          requesterRole: role
        });
      } else if (transferModal.type === 'day') {
        await transferDay({
          date: transferModal.date,
          fromUserId: transferModal.fromUserId,
          toUserId,
          requesterRole: role
        });
      } else if (transferModal.type === 'week') {
        await transferWeek({
          dateInWeek: transferModal.date,
          fromUserId: transferModal.fromUserId,
          toUserId,
          requesterRole: role
        });
      }
      
      alert(isAdmin ? 'Traspaso realizado con éxito.' : 'Solicitud de traspaso enviada al administrador.');
      setTransferModal({ open: false, type: '', date: null, serviceId: null, fromUserId: null });
      await loadMonthData();
    } catch (err) {
      console.error(err);
      alert('Error en el traspaso: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRescheduleConfirm(newDate) {
    if (!newDate) return;
    setActionLoading(true);
    try {
      const role = isAdmin ? 'admin' : 'operario';
      await rescheduleService({
        serviceId: rescheduleModal.serviceId,
        newDate,
        requesterRole: role,
        userId: userId || null
      });
      alert(isAdmin ? 'Fecha actualizada con éxito.' : 'Solicitud de cambio de fecha enviada al administrador.');
      setRescheduleModal({ open: false, serviceId: null, currentDate: null });
      await loadMonthData();
    } catch (err) {
      console.error(err);
      alert('Error al cambiar fecha: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // ── Generación directa PDF con jsPDF (sin html2canvas) ──────────────────
  const generatePDFDirect = () => {
    const pdf = new jsPDF('l', 'mm', 'a4');
    const W = pdf.internal.pageSize.getWidth();  // 297mm
    const H = pdf.internal.pageSize.getHeight(); // 210mm
    const mX = 4;   // margen horizontal
    const mY = 3.5; // margen vertical

    // ── Datos del mes ─────────────────────────────────────────────────────
    const monthStart = startOfMonth(currentMonth);
    const monthEnd   = endOfMonth(currentMonth);
    const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 });
    const allDays    = eachDayOfInterval({ start: calStart, end: calEnd });
    const weeks      = [];
    for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

    const filteredServices = monthServices.filter(s =>
      selectedPrintOpId === 'all' || s.assignedUserId === selectedPrintOpId
    );
    const getCommunityName = (id) => communities.find(c => c.id === id)?.name || '?';
    const getServicesForDay = (date) => filteredServices.filter(s => {
      const d = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
      return isSameDay(d, date);
    });
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1,3),16);
      const g = parseInt(hex.slice(3,5),16);
      const b = parseInt(hex.slice(5,7),16);
      return [r,g,b];
    };

    // ── Layout ────────────────────────────────────────────────────────────
    const usableW    = W - 2 * mX;
    const headerH    = 9;
    const footerH    = 5;
    const calHeaderH = 5;
    const calGridH   = H - 2 * mY - headerH - footerH - calHeaderH;
    const rowH       = calGridH / weeks.length;

    const totalRatio = 5 * 1.2 + 2 * 0.5;
    const unitW      = usableW / totalRatio;
    const colW       = [1.2,1.2,1.2,1.2,1.2,0.5,0.5].map(r => r * unitW);
    const colX       = [];
    let cx = mX;
    for (const w of colW) { colX.push(cx); cx += w; }

    const gridTop = mY + headerH + calHeaderH;

    // ── HEADER ────────────────────────────────────────────────────────────
    pdf.setFillColor(0,0,0);
    pdf.rect(mX, mY, 11, 6, 'F');
    pdf.setTextColor(255,255,255);
    pdf.setFont('helvetica','bold');
    pdf.setFontSize(8);
    pdf.text('RYB', mX + 1.5, mY + 4.3);

    pdf.setTextColor(0,0,0);
    pdf.setFontSize(5.5);
    pdf.text('RyB Limpiezas', mX + 13, mY + 4);

    const monthName = format(currentMonth, 'MMMM yyyy', { locale: es });
    pdf.setFontSize(14);
    pdf.setFont('helvetica','bold');
    pdf.text(monthName.charAt(0).toUpperCase() + monthName.slice(1), W/2, mY + 5.5, { align: 'center' });

    const selectedOpName = operarios.find(o => o.uid === selectedPrintOpId)?.name || '';
    if (selectedPrintOpId !== 'all' && selectedOpName) {
      pdf.setFontSize(7);
      pdf.text(`OPERARIO: ${selectedOpName.toUpperCase()}`, W/2, mY + 8.5, { align: 'center' });
    }

    pdf.setFontSize(6);
    pdf.setFont('helvetica','bold');
    pdf.text('Daniel Rabaneda', W - mX, mY + 4, { align: 'right' });
    pdf.setFontSize(4.5);
    pdf.setFont('helvetica','normal');
    pdf.text('Planificación Mensual', W - mX, mY + 7, { align: 'right' });

    // Línea bajo header
    pdf.setDrawColor(0,0,0);
    pdf.setLineWidth(0.4);
    pdf.line(mX, mY + headerH, W - mX, mY + headerH);

    // ── CABECERA DÍAS ─────────────────────────────────────────────────────
    const dayNames = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    pdf.setFillColor(238,238,238);
    pdf.rect(mX, mY + headerH, usableW, calHeaderH, 'F');
    pdf.setTextColor(0,0,0);
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica','bold');
    dayNames.forEach((d, i) => {
      const midX = colX[i] + colW[i] / 2;
      pdf.text(d.toUpperCase(), midX, mY + headerH + 3.3, { align: 'center' });
    });

    // Línea bajo cabecera días
    pdf.setLineWidth(0.4);
    pdf.line(mX, mY + headerH + calHeaderH, W - mX, mY + headerH + calHeaderH);

    // ── GRID + CELDAS ─────────────────────────────────────────────────────
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(160,160,160);

    weeks.forEach((week, wIdx) => {
      const rowTop = gridTop + wIdx * rowH;

      week.forEach((day, dIdx) => {
        const cellX = colX[dIdx];
        const cellW = colW[dIdx];
        const isCurrentMonth = isSameMonth(day, currentMonth);

        // Fondo fuera del mes
        if (!isCurrentMonth) {
          pdf.setFillColor(248,248,248);
          pdf.rect(cellX, rowTop, cellW, rowH, 'F');
        }

        // Número de día
        pdf.setFont('helvetica','bold');
        pdf.setFontSize(7);
        pdf.setTextColor(isCurrentMonth ? 0 : 180, isCurrentMonth ? 0 : 180, isCurrentMonth ? 0 : 180);
        pdf.text(format(day,'d'), cellX + cellW - 1, rowTop + 4, { align: 'right' });

        // Servicios — 2 columnas
        if (isCurrentMonth) {
          const svcs = getServicesForDay(day);
          const colHalf = cellW / 2;
          const fontSize = 5;
          const lineH    = 3.2;
          const startY   = rowTop + 5.5;
          const dotR     = 0.9;

          pdf.setFontSize(fontSize);
          pdf.setFont('helvetica','bold');

          svcs.forEach((s, sIdx) => {
            const col  = sIdx % 2;       // 0 = izq, 1 = der
            const row  = Math.floor(sIdx / 2);
            const tx   = cellX + col * colHalf + 2.5 + dotR * 2 + 0.5;
            const ty   = startY + row * lineH;
            const dotX = cellX + col * colHalf + 2.0;
            const dotY = ty - 0.9;

            if (ty + lineH > rowTop + rowH - 0.5) return; // clip

            const task = allTasks.find(t => t.id === s.communityTaskId);
            const color = task?.printColor || '#ef4444';
            const [r,g,b] = hexToRgb(color);

            pdf.setFillColor(r,g,b);
            pdf.circle(dotX, dotY, dotR, 'F');

            pdf.setTextColor(0,0,0);
            const name = getCommunityName(s.communityId);
            const maxW = colHalf - 2.5 - dotR * 2 - 1;
            const truncated = pdf.splitTextToSize(name, maxW)[0];
            pdf.text(truncated, tx, ty);
          });
        }

        // Líneas borde celda
        pdf.setDrawColor(160,160,160);
        pdf.setLineWidth(0.2);
        pdf.rect(cellX, rowTop, cellW, rowH, 'S');
      });
    });

    // Borde exterior
    pdf.setDrawColor(0,0,0);
    pdf.setLineWidth(0.5);
    pdf.rect(mX, gridTop, usableW, rowH * weeks.length, 'S');

    // ── FOOTER / LEYENDA ──────────────────────────────────────────────────
    const footerY = H - mY - footerH + 3;
    const legend = [
      { color: '#22c55e', label: 'Limp. Escalera' },
      { color: '#eab308', label: 'Repaso Portal' },
      { color: '#ef4444', label: 'Otras tareas' },
    ];
    let lx = mX;
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica','bold');
    legend.forEach(({ color, label }) => {
      const [r,g,b] = hexToRgb(color);
      pdf.setFillColor(r,g,b);
      pdf.circle(lx + 1.5, footerY - 1, 1.5, 'F');
      pdf.setTextColor(50,50,50);
      pdf.text(label, lx + 4, footerY);
      lx += pdf.getTextWidth(label) + 7;
    });

    pdf.setFontSize(5);
    pdf.setFont('helvetica','normal');
    pdf.setTextColor(120,120,120);
    pdf.text(`Generado: ${format(new Date(),'d/MM/yyyy HH:mm')}`, W - mX, footerY, { align: 'right' });

    return pdf;
  };



  // Descargar como archivo PDF
  const handleDownloadPDF = async () => {
    setActionLoading(true);
    try {
      const pdf = generatePDFDirect();
      pdf.save(`Calendario_${format(currentMonth, 'MMMM_yyyy', { locale: es })}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Error al generar PDF.');
    } finally {
      setActionLoading(false);
    }
  };

  // Abrir PDF en pestaña nueva para imprimir directamente
  const handlePrintPDF = async () => {
    setActionLoading(true);
    try {
      const pdf = generatePDFDirect();
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.focus();
          printWindow.print();
        });
      }
    } catch (err) {
      console.error('Error printing PDF:', err);
      alert('Error al preparar impresión.');
    } finally {
      setActionLoading(false);
    }
  };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
  });

  const getServicesForDay = (date) => {
    return monthServices.filter(s => {
      if (!s.scheduledDate) return false;
      const sDate = s.scheduledDate.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
      if (isNaN(sDate.getTime())) return false;
      return isSameDay(sDate, date);
    });
  };

  const selectedDayServices = getServicesForDay(selectedDate);
  const getCommunityName = (id) => communities.find(c => c.id === id)?.name || 'Comunidad...';

  // Group by operario (Admin view only)
  const groupedByOperario = {};
  if (isAdmin) {
    operarios.forEach(op => {
      groupedByOperario[op.uid] = {
        name: op.name,
        services: selectedDayServices.filter(s => s.assignedUserId === op.uid)
      };
    });
  }

  function renderOperarioActions() {
    const hasStartedDay = selectedDayServices.some(s => s.status === 'completed' || s.status === 'in_progress');
    
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekServices = monthServices.filter(s => {
      const sDate = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
      return sDate >= weekStart && sDate <= weekEnd && s.assignedUserId === (userId || s.assignedUserId);
    });
    const hasStartedWeek = weekServices.some(s => s.status === 'completed' || s.status === 'in_progress');

    return (
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
        {!hasStartedDay ? (
          <button 
            className="btn btn-ghost btn-xs whitespace-nowrap" 
            onClick={() => setTransferModal({ open: true, type: 'day', date: selectedDate, fromUserId: userId })}
            style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: '10px' }}
          >
            🔄 Traspasar Día
          </button>
        ) : (
          <div className="text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 bg-slate-50">
            🚫 Día bloqueado para traspasos
          </div>
        )}
        
        {!hasStartedWeek ? (
          <button 
            className="btn btn-ghost btn-xs whitespace-nowrap" 
            onClick={() => setTransferModal({ open: true, type: 'week', date: selectedDate, fromUserId: userId })}
            style={{ border: '1px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: '10px' }}
          >
            📅 Traspasar Sem
          </button>
        ) : (
          <div className="text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded flex items-center gap-1 bg-slate-50">
            🚫 Sem bloqueada
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* Calendar Grid Container */}
      <div className="w-full xl:w-2/3 flex-shrink-0">

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <h3 className="text-lg sm:text-xl font-black capitalize text-slate-800">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h3>
            <div className="flex gap-2">
              <button 
                className="btn btn-ghost btn-sm bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 p-0 flex items-center justify-center transition-all" 
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                ◀
              </button>
              <button 
                className="btn btn-ghost btn-sm bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 p-0 flex items-center justify-center transition-all" 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                ▶
              </button>
            </div>
          </div>
          
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <div className="flex items-center gap-2 mr-2">
                  <select 
                    className="select select-sm border-slate-200 text-xs font-bold"
                    value={selectedPrintOpId}
                    onChange={(e) => setSelectedPrintOpId(e.target.value)}
                    style={{ height: '32px', borderRadius: '8px' }}
                  >
                    <option value="all">Todos los operarios</option>
                    {operarios.map(op => (
                      <option key={op.uid} value={op.uid}>{op.name}</option>
                    ))}
                  </select>
                  <button 
                    className="btn btn-ghost btn-sm bg-white border border-slate-200 hover:bg-slate-50 px-3 flex items-center gap-2 shadow-sm"
                    onClick={handlePrintPDF}
                    disabled={actionLoading}
                    style={{ height: '32px', borderRadius: '8px' }}
                  >
                    {actionLoading ? (
                      <span className="spinner spinner-primary w-3 h-3"></span>
                    ) : (
                      <><span>🖨️</span> <span className="hidden sm:inline">Imprimir</span></>
                    )}
                  </button>
                  <button 
                    className="btn btn-ghost btn-sm bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-3 flex items-center gap-2 shadow-sm"
                    onClick={handleDownloadPDF}
                    disabled={actionLoading}
                    style={{ height: '32px', borderRadius: '8px' }}
                  >
                    {actionLoading ? (
                      <span className="spinner spinner-primary w-3 h-3"></span>
                    ) : (
                      <><span>📄</span> <span className="hidden sm:inline">Guardar PDF</span></>
                    )}
                  </button>
                </div>
              )}
              <button 
                className="btn btn-primary btn-sm flex items-center gap-2 px-4 shadow-md hover:shadow-lg transition-all"
                onClick={handleGenerate}
                disabled={generating}
                title="Genera servicios faltantes sin borrar nada"
              >
                {generating ? (
                  <span className="spinner spinner-white"></span>
                ) : (
                  <><span>📅</span> Generar Mes</>
                )}
              </button>
              <button 
                className="btn btn-ghost btn-sm flex items-center gap-2 px-4 border border-blue-600 text-blue-600 hover:bg-blue-50 shadow-sm transition-all"
                onClick={handleSync}
                disabled={generating}
                title="Sincroniza: quita servicios obsoletos y añade modificaciones"
              >
                {generating ? (
                  <span className="spinner spinner-primary"></span>
                ) : (
                  <><span>🔄</span> Actualizar Mes</>
                )}
              </button>
            </div>
          )}
        </div>
        
        <div className="planning-grid-container custom-scrollbar">
          <div className="calendar-grid">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="calendar-header-cell">{d}</div>
          ))}
          {days.map((day, idx) => {
            const daySvcs = getServicesForDay(day);
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div 
                key={day instanceof Date && !isNaN(day.getTime()) ? day.toISOString() : idx} 
                className={`calendar-day-cell ${!isCurrentMonth ? 'outside' : ''} ${isSelected ? 'selected' : ''} ${today ? 'today' : ''}`}
                onClick={() => setSelectedDate(day)}
                style={{ animationDelay: `${idx * 0.01}s` }}
              >
                <span className="day-number">{format(day, 'd')}</span>
                {daySvcs.length > 0 && (
                  <div className="svc-indicators">
                    <span className="svc-count">{daySvcs.length}</span>
                    <div className="svc-dots">
                      {daySvcs.slice(0, 3).map((s, i) => (
                        <div 
                          key={s.id} 
                          className={`svc-dot ${s.status === 'completed' ? 'completed' : ''}`}
                        ></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Day Detail View Container */}
      <div className="w-full flex-shrink-0 xl:w-1/3 xl:sticky xl:top-24">
        <div className="card shadow-lg border-0 bg-white" style={{ minHeight: '520px', display: 'flex', flexDirection: 'column', paddingBottom: '20px' }}>
          
          {/* Day Header Summary */}
          <div className="px-6 pt-6 pb-2 bg-white border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
               <div>
                 <div className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">Detalle del día</div>
                 <h4 className="text-xl font-black text-slate-800 capitalize">
                   {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
                 </h4>
               </div>
               <div className="p-2 bg-blue-50 rounded-2xl">
                 <span className="text-2xl">📅</span>
               </div>
            </div>

            {selectedDayServices.length > 0 && (
              <div className="flex gap-2 mb-2">
                <div className="flex-1 bg-slate-50 border border-slate-100 p-2 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</div>
                  <div className="text-lg font-black text-slate-700">{selectedDayServices.length}</div>
                </div>
                <div className="flex-1 bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Listos</div>
                  <div className="text-lg font-black text-emerald-700">
                    {selectedDayServices.filter(s => s.status === 'completed').length}
                  </div>
                </div>
                <div className="flex-1 bg-rose-50 border border-rose-100 p-2 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Pendientes</div>
                  <div className="text-lg font-black text-rose-700">
                    {selectedDayServices.filter(s => s.status !== 'completed').length}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-4 px-6 pt-4">

          {isAdmin ? (
            /* ADMIN VIEW: Group by Operario */
            operarios.map(op => {
              const opSvcs = groupedByOperario[op.uid]?.services || [];
              if (opSvcs.length === 0) return null;

              return (
                <div key={op.uid} className="op-day-group animate-slideIn">
                  <div className="flex items-center gap-3 mb-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-sm font-black text-white shadow-sm">
                      {op.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 text-sm leading-tight">{op.name}</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{opSvcs.length} servicios</span>
                    </div>
                    
                    <div className="flex gap-1.5 ml-auto">
                       <button 
                         className="btn btn-ghost btn-xs text-amber-700 bg-white hover:bg-amber-50 p-2 h-8 flex items-center gap-1.5 border border-amber-200 shadow-sm"
                         onClick={() => setTransferModal({ open: true, type: 'day', date: selectedDate, fromUserId: op.uid })}
                         title="Traspasar todo el día"
                       >
                         <span className="text-sm">🔄</span> <span className="text-[10px] font-black uppercase">Día</span>
                       </button>
                       <button 
                         className="btn btn-ghost btn-xs text-blue-700 bg-white hover:bg-blue-50 p-2 h-8 flex items-center gap-1.5 border border-blue-200 shadow-sm"
                         onClick={() => setTransferModal({ open: true, type: 'week', date: selectedDate, fromUserId: op.uid })}
                         title="Traspasar toda la semana"
                       >
                         <span className="text-sm">📅</span> <span className="text-[10px] font-black uppercase">Sem</span>
                       </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 px-1 pb-4">
                    {opSvcs.map(s => (
                      <ServiceItem 
                        key={s.id} 
                        service={s} 
                        communityName={getCommunityName(s.communityId)} 
                        allTasks={allTasks}
                        onTransfer={() => setTransferModal({ open: true, type: 'single', serviceId: s.id, fromUserId: op.uid })}
                        onReschedule={() => setRescheduleModal({ open: true, serviceId: s.id, currentDate: s.scheduledDate })}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            /* OPERARIO VIEW: Simple list */
            <>
              {selectedDayServices.length > 0 && renderOperarioActions()}
              <div className="flex flex-col gap-4 px-1 pb-4">
                {selectedDayServices.map(s => (
                  <ServiceItem 
                    key={s.id} 
                    service={s} 
                    communityName={getCommunityName(s.communityId)} 
                    allTasks={allTasks}
                    onTransfer={() => setTransferModal({ open: true, type: 'single', serviceId: s.id, fromUserId: userId })}
                    onReschedule={() => setRescheduleModal({ open: true, serviceId: s.id, currentDate: s.scheduledDate })}
                    isOp 
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </>
          )}


          {selectedDayServices.length === 0 && (
            <div className="text-center py-16 opacity-40">
              <span className="text-5xl mb-4 block">☕</span>
              <p className="font-bold text-sm text-slate-600">Día sin servicios</p>
            </div>
          )}
        </div>

        {/* MODAL TRASPASO */}
        <TransferModal 
          isOpen={transferModal.open}
          onClose={() => setTransferModal({ open: false, type: '', date: null, serviceId: null, fromUserId: null })}
          onConfirm={handleTransferConfirm}
          loading={actionLoading}
          excludeUserId={transferModal.fromUserId}
          title={
            transferModal.type === 'single' ? 'Traspasar Servicio' :
            transferModal.type === 'day' ? `Traspasar Día ${format(transferModal.date || new Date(), 'dd/MM')}` :
            'Traspasar Semana Completa'
          }
        />

        {/* MODAL REPROGRAMAR FECHA */}
        <RescheduleModal 
          isOpen={rescheduleModal.open}
          onClose={() => setRescheduleModal({ open: false, serviceId: null, currentDate: null })}
          onConfirm={handleRescheduleConfirm}
          loading={actionLoading}
          currentDate={rescheduleModal.currentDate}
          title="Mover de día"
        />
      </div>
    </div>

    <PrintableCalendar 
        month={currentMonth}
        services={monthServices}
        selectedOpId={selectedPrintOpId}
        operarios={operarios}
        communities={communities}
        allTasks={allTasks}
      />

      <style>{`
        .planning-grid-container {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
          background: #fdfdfd;
          border: 1px solid #e2e8f0;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
          margin: 10px 0;
          position: relative;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          min-width: var(--calendar-min-width, 300px);
          width: 100%;
          margin: 0 auto;
          padding: 2px;
        }

        .calendar-header-cell {
          text-align: center;
          font-size: 0.6rem;
          font-weight: 900;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 0;
        }

        .calendar-day-cell {
          min-height: 40px;
          aspect-ratio: 1;
          border-radius: 6px;
          padding: 2px;
          cursor: pointer;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          background: #f8fafc;
        }

        @media (min-width: 640px) {
          .calendar-day-cell {
            padding: 8px;
            border-width: 2px;
          }
          .calendar-header-cell {
            font-size: 0.75rem;
          }
        }

        .calendar-day-cell:hover {
          background: #fff;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          border-color: #e2e8f0;
          z-index: 10;
        }

        .calendar-day-cell.selected {
          background: #fff;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px #3b82f633;
        }

        .calendar-day-cell.today {
          background: #fffbeb;
          border-color: #f59e0b;
        }

        .day-number {
          font-weight: 800;
          font-size: 0.8rem;
          color: #1e293b;
        }

        .svc-indicators {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .svc-count {
          font-size: 0.65rem;
          font-weight: 900;
          color: #3b82f6;
          background: #eff6ff;
          padding: 0 4px;
          border-radius: 8px;
        }

        .svc-dots {
          display: flex;
          gap: 2px;
        }

        .svc-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #cbd5e1;
        }

        .svc-dot.completed {
          background: #10b981;
        }

        .custom-scrollbar::-webkit-scrollbar {
          height: 4px;
          width: 4px;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      </div>
  );
}
