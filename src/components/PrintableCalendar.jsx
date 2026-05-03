import { format, isSameDay, isSameMonth, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PrintableCalendar({ month, services, selectedOpId, operarios, communities, allTasks }) {
  const monthName = format(month, 'MMMM yyyy', { locale: es });
  const isIndividual = selectedOpId !== 'all';
  const selectedOpName = operarios.find(o => o.uid === selectedOpId)?.name || '';

  // Preparar cuadrícula de días (Lunes a Domingo)
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Agrupar en semanas de 7 días
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const getServicesForDay = (date) => {
    return services.filter(s => {
      const sDate = s.scheduledDate?.toDate ? s.scheduledDate.toDate() : new Date(s.scheduledDate);
      return isSameDay(sDate, date) && (selectedOpId === 'all' || s.assignedUserId === selectedOpId);
    });
  };

  const getCommunityName = (id) => communities.find(c => c.id === id)?.name || '...';

  // Canvas REDUCIDO: html2canvas renderiza mejor el texto en canvases más pequeños
  // A4 landscape ratio (297/210 ≈ 1.414). Usaremos scale:4 en html2canvas para alta calidad
  const W = 1400;
  const H = 1200;

  return (
    <div 
      id="printable-calendar-wrapper"
      style={{ 
        position: 'fixed', 
        left: '-9999px', 
        top: '-9999px', 
        width: '0px',
        height: '0px',
        overflow: 'hidden',
        zIndex: -9999,
        pointerEvents: 'none',
        opacity: 0
      }}
    >
      <div id="printable-calendar-root" style={{ 
        width: `${W}px`, 
        height: `${H}px`, 
        backgroundColor: 'white', 
        padding: '16px 20px', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000'
      }}>
        {/* ===== HEADER ===== */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-end', 
          borderBottom: '2px solid #000', 
          paddingBottom: '4px', 
          marginBottom: '5px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ 
              backgroundColor: '#000', 
              color: '#fff', 
              padding: '2px 7px', 
              fontWeight: '900', 
              fontSize: '15px', 
              lineHeight: '1' 
            }}>RYB</div>
            <div style={{ fontWeight: '900', fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RyB Limpiezas</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '900', textTransform: 'capitalize', margin: '0', lineHeight: '1' }}>{monthName}</h1>
            {isIndividual && (
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#000', marginTop: '2px' }}>
                OPERARIO: {selectedOpName.toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', fontWeight: '900' }}>Daniel Rabaneda</div>
            <div style={{ fontSize: '6px', color: '#333', textTransform: 'uppercase', fontWeight: 'bold' }}>Planificación Mensual</div>
          </div>
        </div>

        {/* ===== GRID DEL CALENDARIO ===== */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(5, 1.2fr) repeat(2, 0.5fr)', 
          gridTemplateRows: `auto repeat(${weeks.length}, 1fr)`,
          border: '2px solid #000',
          flex: 1,
          backgroundColor: '#fff'
        }}>
          {/* Cabecera de días */}
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
            <div key={d} style={{ 
              borderRight: '1px solid #000', 
              borderBottom: '2px solid #000', 
              padding: '3px 0', 
              textAlign: 'center', 
              fontSize: '9px', 
              fontWeight: '900', 
              textTransform: 'uppercase', 
              backgroundColor: '#eee',
              letterSpacing: '0.3px'
            }}>
              {d}
            </div>
          ))}

          {/* Celdas de días */}
          {allDays.map((day, idx) => {
            const daySvcs = getServicesForDay(day);
            const isCurrentMonth = isSameMonth(day, month);
            
            return (
              <div key={idx} style={{ 
                borderRight: '1px solid #999', 
                borderBottom: '1px solid #999', 
                padding: '1px 2px', 
                backgroundColor: !isCurrentMonth ? '#f8f8f8' : '#fff',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {/* Número de día */}
                <div style={{ 
                  textAlign: 'right',
                  fontSize: '11px', 
                  fontWeight: '900', 
                  color: isCurrentMonth ? '#000' : '#bbb',
                  lineHeight: '1',
                  marginBottom: '1px',
                  flexShrink: 0
                }}>
                  {format(day, 'd')}
                </div>
                
                {/* Servicios - 2 columnas con puntos de color */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '0px', 
                  flex: 1, 
                  overflow: 'hidden',
                  alignContent: 'start'
                }}>
                  {isCurrentMonth && daySvcs.map(s => {
                    const task = allTasks.find(t => t.id === s.communityTaskId);
                    const dotColor = task?.printColor || '#ef4444';
                    return (
                      <div key={s.id} style={{ 
                        fontSize: '14px', 
                        lineHeight: '1.3', 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '0.5px 0',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis'
                      }}>
                        <span style={{ 
                          width: '9px', 
                          height: '9px', 
                          borderRadius: '50%', 
                          backgroundColor: dotColor, 
                          display: 'inline-block',
                          flexShrink: 0,
                          marginTop: '1px'
                        }}></span>
                        <span style={{ 
                          fontWeight: '700', 
                          color: '#000',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>{getCommunityName(s.communityId)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== FOOTER con leyenda de colores ===== */}
        <div style={{ 
          marginTop: '4px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '7px', fontWeight: 'bold', color: '#333' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }}></span>
              Limp. Escalera
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#eab308', display: 'inline-block' }}></span>
              Repaso Portal
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }}></span>
              Otras tareas
            </span>
          </div>
          <div style={{ fontSize: '6px', color: '#666', textAlign: 'right', fontWeight: 'bold' }}>
            Generado: {format(new Date(), "d/MM/yyyy HH:mm")}
          </div>
        </div>
      </div>
    </div>
  );
}
