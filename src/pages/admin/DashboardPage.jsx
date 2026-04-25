import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getCommunities } from '../../services/communityService';
import { getOperarios } from '../../services/authService';
import { getScheduledServicesRange } from '../../services/scheduleService';
import { getCheckInsRange } from '../../services/checkInService';
import { generateServicesForDays, generateServicesForRange, cleanupDuplicateScheduledServices } from '../../services/scheduleService';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import PlanningCalendar from '../../components/PlanningCalendar';
import TransferRequestsPanel from '../../components/admin/TransferRequestsPanel';

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({
    communities: 0,
    operarios: 0,
    todayServices: 0,
    pendingServices: 0,
    completedToday: 0,
    activeCheckIns: 0,
  });
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [communitiesList, ops, todayServices, checkIns] = await Promise.all([
        getCommunities(),
        getOperarios(),
        getScheduledServicesRange(new Date(), new Date()),
        getCheckInsRange(new Date(), new Date()),
      ]);

      const completed = todayServices.filter(s => s.status === 'completed').length;
      const pending = todayServices.filter(s => s.status === 'pending').length;
      const active = checkIns.filter(c => !c.checkOutTime).length;

      setStats({
        communities: communitiesList.length,
        operarios: ops.length,
        todayServices: todayServices.length,
        pendingServices: pending,
        completedToday: completed,
        activeCheckIns: active,
      });

      setOperarios(ops);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p className="text-muted">Cargando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, color: 'var(--color-text)' }}>
            Hola, {userProfile?.name || 'Admin'} 👋
          </h2>
          <p className="text-muted text-sm">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-4 gap-4 mb-8">
        <div className="stat-card shadow-sm">
          <div className="stat-icon blue">🏢</div>
          <div className="stat-value">{stats.communities}</div>
          <div className="stat-label">Comunidades</div>
        </div>
        <div className="stat-card shadow-sm">
          <div className="stat-icon green">👷</div>
          <div className="stat-value">{stats.operarios}</div>
          <div className="stat-label">Operarios</div>
        </div>
        <div className="stat-card shadow-sm">
          <div className="stat-icon orange">📋</div>
          <div className="stat-value">{stats.todayServices}</div>
          <div className="stat-label">Servicios hoy</div>
        </div>
        <div className="stat-card shadow-sm">
          <div className="stat-icon purple">✅</div>
          <div className="stat-value">{stats.completedToday}</div>
          <div className="stat-label">Completados hoy</div>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <h3 className="section-title mb-4">⚡ Acciones Rápidas</h3>
      <div className="grid grid-4 gap-3 mb-8">
        <button 
          onClick={() => navigate('/admin/inventory')}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: 'auto', background: 'white' }}
        >
          <span style={{ fontSize: '1.5rem' }}>📦</span>
          <span className="text-xs font-bold uppercase tracking-wider">Materiales</span>
        </button>
        <button 
          onClick={() => navigate('/admin/reports')}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: 'auto', background: 'white' }}
        >
          <span style={{ fontSize: '1.5rem' }}>📄</span>
          <span className="text-xs font-bold uppercase tracking-wider">Informes</span>
        </button>
        <button 
          onClick={() => navigate('/admin/communities')}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: 'auto', background: 'white' }}
        >
          <span style={{ fontSize: '1.5rem' }}>🏢</span>
          <span className="text-xs font-bold uppercase tracking-wider">Comunidades</span>
        </button>
        <button 
          onClick={() => navigate('/admin/operarios')}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-primary hover:bg-white shadow-sm"
          style={{ height: 'auto', background: 'white' }}
        >
          <span style={{ fontSize: '1.5rem' }}>👷</span>
          <span className="text-xs font-bold uppercase tracking-wider">Operarios</span>
        </button>
        <button 
          onClick={async () => {
            if (!window.confirm('¿Eliminar servicios duplicados de la base de datos? Esta operación no se puede deshacer.')) return;
            try {
              const n = await cleanupDuplicateScheduledServices();
              alert(`✅ Limpieza completada. ${n} duplicado(s) eliminado(s).`);
              loadDashboard();
            } catch (err) {
              alert('❌ Error durante la limpieza: ' + err.message);
            }
          }}
          className="btn btn-ghost p-4 flex flex-col items-center gap-2 border border-slate-100 hover:border-red-200 hover:bg-red-50 shadow-sm"
          style={{ height: 'auto', background: 'white' }}
        >
          <span style={{ fontSize: '1.5rem' }}>🧹</span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#dc2626' }}>Limpiar Dup.</span>
        </button>
      </div>

      <TransferRequestsPanel onActionComplete={() => {
        loadDashboard();
        setRefreshKey(prev => prev + 1);
      }} />

      <div className="mb-12">
        <h3 className="section-title mb-6">📅 Planificación Mensual</h3>
        <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-100">
          <PlanningCalendar key={refreshKey} isAdmin operarios={operarios} />
        </div>
      </div>

      {/* Operarios activos */}
      <div className="card shadow-md border-0 bg-white" style={{ borderLeft: '4px solid #3b82f6' }}>
        <div className="card-header border-0 bg-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📍</span>
            <h3 className="card-title text-slate-800 m-0">Operarios activos actualmente</h3>
          </div>
          <span className="badge badge-primary">{stats.activeCheckIns}</span>
        </div>

        <div className="p-4">
          {stats.activeCheckIns === 0 ? (
            <p className="text-muted text-sm italic">Ningún operario fichado en este momento.</p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="pulse-dot"></span>
              <span className="text-sm font-medium text-blue-700">{stats.activeCheckIns} operario(s) realizando servicios en tiempo real.</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .section-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--color-text);
          border-left: 4px solid var(--color-primary);
          padding-left: 12px;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  );
}
