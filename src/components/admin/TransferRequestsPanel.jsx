import { useState, useEffect } from 'react';
import { getPendingTransfers, approveTransfer, rejectTransfer } from '../../services/transferService';
import { getOperarios } from '../../services/authService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function TransferRequestsPanel({ onActionComplete }) {
  const [requests, setRequests] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [transfers, ops] = await Promise.all([
        getPendingTransfers(),
        getOperarios()
      ]);
      setRequests(transfers);
      setOperarios(ops);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const getOpName = (id) => operarios.find(o => o.uid === id)?.name || 'Cargando...';

  async function handleApprove(id) {
    if (!confirm('¿Validar este traspaso?')) return;
    setProcessingId(id);
    try {
      await approveTransfer(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      alert('Traspaso validado correctamente.');
      if (onActionComplete) onActionComplete();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id) {
    if (!confirm('¿Rechazar este traspaso? El trabajo volverá al operario original.')) return;
    setProcessingId(id);
    try {
      await rejectTransfer(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      alert('Traspaso rechazado. Los servicios han vuelto al operario original.');
      if (onActionComplete) onActionComplete();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <div className="p-4 text-center"><span className="spinner"></span></div>;
  if (requests.length === 0) return null;

  return (
    <div className="card shadow-lg border-0 bg-white mb-8 overflow-hidden animate-fadeIn">
      <div className="card-header bg-amber-50 border-b border-amber-100 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="font-black text-amber-900 leading-tight">Solicitudes de Traspaso</h3>
            <p className="text-xs font-bold text-amber-700 opacity-70 uppercase tracking-wider">Validación pendiente</p>
          </div>
        </div>
        <span className="badge bg-amber-500 text-white border-0 font-black px-3 py-1">{requests.length}</span>
      </div>
      
      <div className="divide-y divide-slate-100">
        {requests.map(req => (
          <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2 xs:gap-4 flex-1">
              <div className="flex flex-col items-center min-w-[50px]">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg shadow-inner">👤</div>
                <div className="text-[10px] font-black text-slate-500 mt-1 truncate max-w-[60px]">{getOpName(req.fromUserId).split(' ')[0]}</div>
              </div>
              
              <div className="text-amber-500 text-xl font-black shrink-0"> » </div>
              
              <div className="flex flex-col items-center min-w-[50px]">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-lg shadow-inner">👷</div>
                <div className="text-[10px] font-black text-blue-500 mt-1 truncate max-w-[60px]">{getOpName(req.toUserId).split(' ')[0]}</div>
              </div>

              <div className="ml-1 sm:ml-4 flex-1">
                <div className="font-black text-slate-800 text-sm leading-tight">
                  {req.type === 'single' ? 'Servicio Individual' : 
                   req.type === 'day' ? `Día (${req.serviceCount} serv.)` : 
                   `Semana (${req.serviceCount} serv.)`}
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm">
                    {(() => {
                      try {
                        if (req.date?.toDate) return format(req.date.toDate(), "d 'de' MMMM", { locale: es });
                        if (req.startDate?.toDate) return `${format(req.startDate.toDate(), "d/MM")} al ${format(req.endDate.toDate(), "d/MM")}`;
                        return "Fecha no especificada";
                      } catch (e) {
                        return "Error de fecha";
                      }
                    })()}
                  </div>
                  <div className="text-xs text-muted">Solicitado: {req.createdAt?.toDate ? format(req.createdAt.toDate(), 'HH:mm') : '--:--'}</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button 
                className="btn btn-sm btn-ghost text-red-600 hover:bg-red-50 font-bold border border-red-100 flex-1 sm:flex-none py-2"
                onClick={() => handleReject(req.id)}
                disabled={processingId === req.id}
              >
                Rechazar
              </button>
              <button 
                className="btn btn-sm btn-primary px-4 shadow-sm flex-1 sm:flex-none py-2"
                onClick={() => handleApprove(req.id)}
                disabled={processingId === req.id}
              >
                {processingId === req.id ? '...' : 'Validar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
