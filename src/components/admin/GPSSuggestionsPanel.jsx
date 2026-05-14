import { useState, useEffect } from 'react';
import { getAllPendingSuggestions, acceptSuggestion, rejectSuggestion } from '../../services/gpsSuggestionService';
import { updateCommunity } from '../../services/communityService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function GPSSuggestionsPanel({ onActionComplete }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getAllPendingSuggestions();
      setSuggestions(data);
    } catch (err) {
      console.error('Error loading GPS suggestions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(suggestion) {
    if (!confirm(`¿Actualizar la ubicación de "${suggestion.communityName}" con las coordenadas sugeridas por ${suggestion.userName}?`)) return;
    
    setProcessingId(suggestion.id);
    try {
      // 1. Actualizar la comunidad
      await updateCommunity(suggestion.communityId, {
        lat: suggestion.lat,
        lng: suggestion.lng
      });
      
      // 2. Marcar sugerencia como aceptada
      await acceptSuggestion(suggestion.id);
      
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      alert('✅ Ubicación de la comunidad actualizada correctamente.');
      
      if (onActionComplete) onActionComplete();
    } catch (err) {
      alert('❌ Error al procesar: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id) {
    if (!confirm('¿Rechazar esta sugerencia de ubicación?')) return;
    
    setProcessingId(id);
    try {
      await rejectSuggestion(id);
      setSuggestions(prev => prev.filter(s => s.id !== id));
      if (onActionComplete) onActionComplete();
    } catch (err) {
      alert('❌ Error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <div className="p-4 text-center"><span className="spinner"></span></div>;
  if (suggestions.length === 0) return null;

  return (
    <div className="card shadow-lg border-0 bg-white mb-8 overflow-hidden animate-fadeIn">
      <div className="card-header bg-blue-50 border-b border-blue-100 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📍</span>
          <div>
            <h3 className="font-black text-blue-900 leading-tight">Sugerencias GPS</h3>
            <p className="text-xs font-bold text-blue-700 opacity-70 uppercase tracking-wider">Ubicaciones enviadas por operarios</p>
          </div>
        </div>
        <span className="badge bg-blue-500 text-white border-0 font-black px-3 py-1">{suggestions.length}</span>
      </div>
      
      <div className="divide-y divide-slate-100">
        {suggestions.map(suggestion => (
          <div key={suggestion.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex flex-col items-center min-w-[60px]">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-xl shadow-inner">📡</div>
                <div className="text-[10px] font-black text-slate-500 mt-1 truncate max-w-[80px]">
                  {suggestion.userName || 'Operario'}
                </div>
              </div>

              <div className="flex-1">
                <div className="font-black text-slate-800 text-base leading-tight mb-1">
                  {suggestion.communityName}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="badge bg-slate-100 text-slate-600 border-0 text-[10px] font-bold">
                    Precisión: ±{suggestion.accuracy}m
                  </span>
                  <span className="text-[10px] text-muted font-medium">
                    Enviado: {suggestion.createdAt?.toDate ? format(suggestion.createdAt.toDate(), "d MMM, HH:mm", { locale: es }) : '--:--'}
                  </span>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 font-mono">
                  {suggestion.lat.toFixed(6)}, {suggestion.lng.toFixed(6)}
                </div>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button 
                className="btn btn-sm btn-ghost text-slate-500 hover:bg-slate-100 font-bold border border-slate-200 flex-1 sm:flex-none px-3"
                onClick={() => handleReject(suggestion.id)}
                disabled={processingId === suggestion.id}
              >
                Descartar
              </button>
              <button 
                className="btn btn-sm btn-primary px-6 shadow-md flex-1 sm:flex-none font-bold"
                onClick={() => handleAccept(suggestion)}
                disabled={processingId === suggestion.id}
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}
              >
                {processingId === suggestion.id ? '...' : 'Aplicar Ubicación'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
