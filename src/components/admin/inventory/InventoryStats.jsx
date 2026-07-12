import React from 'react';
import { CATEGORIES } from '../../../utils/inventoryCategories';

export default function InventoryStats({
  products,
  movements,
  statsFilterRange,
  setStatsFilterRange,
  statsFilterFamily,
  setStatsFilterFamily,
  statsSearch,
  setStatsSearch,
  getGlobalDashboardData
}) {
  const s = getGlobalDashboardData();

  return (
    <div className="stats-dashboard flex flex-col gap-6">
      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm rounded-2xl bg-white">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rango Temporal</label>
            <select
              className="form-select text-sm py-1.5 px-3 min-w-[150px] bg-slate-50 border-slate-200 rounded-xl"
              value={statsFilterRange}
              onChange={e => setStatsFilterRange(e.target.value)}
            >
              <option value="3m">Últimos 3 meses</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="12m">Últimos 12 meses</option>
              <option value="all">Histórico Completo</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Familia / Categoría</label>
            <select
              className="form-select text-sm py-1.5 px-3 min-w-[180px] bg-slate-50 border-slate-200 rounded-xl"
              value={statsFilterFamily}
              onChange={e => setStatsFilterFamily(e.target.value)}
            >
              <option value="all">Todas las familias</option>
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Buscar Producto</label>
          <input
            type="text"
            className="form-input text-sm py-1.5 px-3 bg-slate-50 border-slate-200 rounded-xl"
            placeholder="Filtrar por nombre..."
            value={statsSearch}
            onChange={e => setStatsSearch(e.target.value)}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: 'var(--color-primary)' }}>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consumo Total</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{s.totalConsumed.toFixed(1)}</div>
            <div className="text-xs text-slate-400 mt-0.5">unidades entregadas</div>
          </div>
          <div className="text-3xl bg-blue-50 p-2.5 rounded-2xl">📦</div>
        </div>

        {/* KPI 2 */}
        <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: 'var(--color-accent)' }}>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Variación Mensual</div>
            <div className="text-2xl font-black text-slate-800 mt-1 flex items-center gap-1.5">
              {s.monthlyVariation > 0 ? (
                <span className="text-red-500">+{s.monthlyVariation.toFixed(0)}% 📈</span>
              ) : s.monthlyVariation < 0 ? (
                <span className="text-green-500">{s.monthlyVariation.toFixed(0)}% 📉</span>
              ) : (
                <span className="text-slate-500">0%</span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">últ. 30 días vs ant. 30 días</div>
          </div>
          <div className="text-3xl bg-cyan-50 p-2.5 rounded-2xl">🔄</div>
        </div>

        {/* KPI 3 */}
        <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: s.criticalStockCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stock Crítico</div>
            <div className={`text-2xl font-black mt-1 ${s.criticalStockCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {s.criticalStockCount}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">artículos bajo el mínimo</div>
          </div>
          <div className="text-3xl p-2.5 rounded-2xl" style={{ backgroundColor: s.criticalStockCount > 0 ? '#fef2f2' : '#f0fdf4' }}>{s.criticalStockCount > 0 ? '⚠️' : '✅'}</div>
        </div>

        {/* KPI 4 */}
        <div className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white" style={{ borderColor: 'var(--color-info)' }}>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entregas Totales</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{s.totalDeliveries}</div>
            <div className="text-xs text-slate-400 mt-0.5">solicitudes completadas</div>
          </div>
          <div className="text-3xl bg-indigo-50 p-2.5 rounded-2xl">👷</div>
        </div>
      </div>

      {/* Line Chart & Top 10 Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Line Chart (Evolución Temporal) */}
        <div className="card p-5 lg:col-span-7 flex flex-col justify-between shadow-sm rounded-2xl bg-white">
          <div>
            <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
              📈 Evolución de Consumo Temporal
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-medium">Total de unidades consumidas mensualmente en el periodo</p>
          </div>
          {s.totalConsumed === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 italic">
              No hay registros de consumo para este periodo.
            </div>
          ) : (
            <div className="w-full relative h-[200px] mt-2">
              {(() => {
                const maxVal = Math.max(...s.temporalData.map(d => d.value), 10);
                const svgWidth = 500;
                const svgHeight = 200;
                const paddingLeft = 45;
                const paddingRight = 15;
                const paddingTop = 20;
                const paddingBottom = 30;

                const chartWidth = svgWidth - paddingLeft - paddingRight;
                const chartHeight = svgHeight - paddingTop - paddingBottom;

                // Generate SVG points
                const points = s.temporalData.map((d, i) => {
                  const x = paddingLeft + (i / (s.temporalData.length - 1 || 1)) * chartWidth;
                  const y = paddingTop + chartHeight - (d.value / maxVal) * chartHeight;
                  return { x, y, value: d.value, label: d.label, count: d.count };
                });

                const pathD = points.length > 0 
                  ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                  : '';

                const areaD = points.length > 0
                  ? `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
                  : '';

                return (
                  <svg className="w-full h-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Gridlines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                      const y = paddingTop + chartHeight * ratio;
                      const valLabel = (maxVal * (1 - ratio)).toFixed(0);
                      return (
                        <g key={index}>
                          <line 
                            x1={paddingLeft} 
                            y1={y} 
                            x2={svgWidth - paddingRight} 
                            y2={y} 
                            stroke="#f1f5f9" 
                            strokeDasharray="4 4" 
                            strokeWidth="1.5"
                          />
                          <text 
                            x={paddingLeft - 8} 
                            y={y + 3} 
                            textAnchor="end" 
                            fill="#94a3b8" 
                            fontSize="8" 
                            fontWeight="800"
                          >
                            {valLabel}
                          </text>
                        </g>
                      );
                    })}

                    {/* Area */}
                    {areaD && <path d={areaD} fill="url(#areaGradient)" />}

                    {/* Line */}
                    {pathD && <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />}

                    {/* Dots & Labels */}
                    {points.map((p, i) => (
                      <g key={i} className="group cursor-pointer">
                        <circle 
                          cx={p.x} 
                          cy={p.y} 
                          r="4" 
                          fill="#ffffff" 
                          stroke="#2563eb" 
                          strokeWidth="2.5" 
                        />
                        <circle 
                          cx={p.x} 
                          cy={p.y} 
                          r="10" 
                          fill="transparent" 
                        />
                        <title>{`${p.label}: ${p.value.toFixed(1)} uds (${p.count} ent.)`}</title>
                      </g>
                    ))}

                    {/* X-axis labels */}
                    {points.map((p, i) => (
                      <text 
                        key={i} 
                        x={p.x} 
                        y={svgHeight - 8} 
                        textAnchor="middle" 
                        fill="#94a3b8" 
                        fontSize="8" 
                        fontWeight="700"
                      >
                        {p.label.split(' ')[0]}
                      </text>
                    ))}
                  </svg>
                );
              })()}
            </div>
          )}
        </div>

        {/* Top 10 Ranking */}
        <div className="card p-5 lg:col-span-5 shadow-sm rounded-2xl bg-white">
          <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
            📊 Top 10 Artículos Consumidos
          </h3>
          <p className="text-xs text-slate-400 mb-4 font-medium">Ranking de artículos más retirados por cantidad total</p>
          
          {s.rankingData.length === 0 ? (
            <div className="text-slate-400 italic text-center py-12 text-sm">
              No hay datos de consumo.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(() => {
                const maxRankVal = Math.max(...s.rankingData.map(d => d.value), 1);
                return s.rankingData.map((item, idx) => {
                  const percentage = (item.value / maxRankVal) * 100;
                  return (
                    <div key={item.id} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-600 max-w-[70%] truncate">
                          {idx + 1}. {item.name}
                        </span>
                        <span className="font-bold text-slate-800">
                          {item.value.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">{item.unit}</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ 
                            width: `${percentage}%`,
                            background: 'linear-gradient(to right, var(--color-primary), var(--color-accent))'
                          }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Matriz Heatmap (Producto x Mes) */}
      <div className="card p-5 shadow-sm rounded-2xl bg-white">
        <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
          🔲 Matriz de Calor (Consumo Mensual por Artículo)
        </h3>
        <p className="text-xs text-slate-400 mb-5 font-medium">
          Cruza los 8 artículos más consumidos frente a los últimos 6 meses para ver la intensidad estacional de consumo.
        </p>

        {s.heatmapData.length === 0 ? (
          <div className="text-slate-400 italic text-center py-12 text-sm">
            No hay datos suficientes para generar el mapa de calor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px] flex flex-col gap-2">
              {/* Cabecera meses */}
              <div className="flex items-center text-xs font-bold text-slate-500 mb-1">
                <div className="w-1/3 truncate pr-4 text-left">Artículo</div>
                <div className="w-2/3 flex">
                  {s.heatmapMonths.map((mBucket, idx) => (
                    <div key={idx} className="flex-1 text-center py-1 border-r last:border-0 border-slate-100 bg-slate-50 rounded-md mx-0.5">
                      {mBucket.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Filas */}
              {s.heatmapData.map((row, rowIdx) => (
                <div key={row.product.id} className="flex items-center text-sm py-1.5 hover:bg-slate-50 rounded-lg px-1 transition-colors">
                  <div className="w-1/3 font-semibold text-slate-600 truncate pr-4 text-left">
                    {row.product.name}
                  </div>
                  <div className="w-2/3 flex">
                    {row.values.map((val, colIdx) => {
                      const opacity = s.maxHeatmapVal > 0 ? Math.min(Math.max(val / s.maxHeatmapVal, 0.04), 0.95) : 0.04;
                      const isZero = val === 0;
                      return (
                        <div 
                          key={colIdx} 
                          className="flex-1 text-center py-2 mx-0.5 rounded-lg font-bold text-xs relative group transition-all duration-300 cursor-pointer"
                          style={{
                            backgroundColor: isZero ? '#f8fafc' : `rgba(37, 99, 235, ${opacity})`,
                            color: isZero ? '#cbd5e1' : opacity > 0.5 ? '#ffffff' : '#1e3a8a',
                            border: isZero ? '1px dashed #e2e8f0' : 'none'
                          }}
                          title={`${row.product.name} - ${s.heatmapMonths[colIdx].label}: ${val.toFixed(1)} ${row.product.unit}`}
                        >
                          {val > 0 ? val.toFixed(0) : '-'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pareto ABC & Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pareto ABC */}
        <div className="card p-5 lg:col-span-6 shadow-sm rounded-2xl bg-white">
          <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
            🎯 Clasificación ABC (Rotación y Consumo)
          </h3>
          <p className="text-xs text-slate-400 mb-4 font-medium">
            Clasificación de productos basada en el principio de Pareto (los artículos Clase A representan el 80% del consumo total).
          </p>

          {s.abcData.length === 0 ? (
            <div className="text-slate-400 italic text-center py-12 text-sm">
              No hay artículos consumidos en el catálogo.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Summary Blocks */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-blue-500 text-white font-bold text-[10px] mb-1">A</span>
                  <div className="text-lg font-black text-blue-900">{s.abcData.filter(d => d.abcClass === 'A').length}</div>
                  <div className="text-[9px] text-blue-600 font-bold uppercase">Alta Rotación (80%)</div>
                </div>
                <div className="bg-cyan-50 p-2.5 rounded-xl border border-cyan-100 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-500 text-white font-bold text-[10px] mb-1">B</span>
                  <div className="text-lg font-black text-cyan-900">{s.abcData.filter(d => d.abcClass === 'B').length}</div>
                  <div className="text-[9px] text-cyan-600 font-bold uppercase">Rotación Media (15%)</div>
                </div>
                <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-slate-500 text-white font-bold text-[10px] mb-1">C</span>
                  <div className="text-lg font-black text-slate-800">{s.abcData.filter(d => d.abcClass === 'C').length}</div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase">Baja Rotación (5%)</div>
                </div>
              </div>

              {/* ABC Table list */}
              <div className="max-h-[220px] overflow-y-auto border border-slate-100 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold text-muted border-b">
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-center">Clase</th>
                      <th className="p-2.5 text-right">Consumo</th>
                      <th className="p-2.5 text-right">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.abcData.slice(0, 15).map(item => (
                      <tr key={item.product.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="p-2.5 font-medium truncate max-w-[120px]">{item.product.name}</td>
                        <td className="p-2.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full font-bold text-[9px] ${
                            item.abcClass === 'A' ? 'bg-blue-100 text-blue-700' :
                            item.abcClass === 'B' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {item.abcClass}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-bold">{item.value.toFixed(1)}</td>
                        <td className="p-2.5 text-right font-semibold text-slate-400">{item.cumulativePercent.toFixed(0)}%</td>
                      </tr>
                    ))}
                    {s.abcData.length > 15 && (
                      <tr>
                        <td colSpan="4" className="p-2.5 text-center text-[10px] text-muted italic">
                          Y {s.abcData.length - 15} productos más...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Tabla de Alertas */}
        <div className="card p-5 lg:col-span-6 shadow-sm rounded-2xl bg-white">
          <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
            🚨 Alertas de Consumo y Almacén
          </h3>
          <p className="text-xs text-slate-400 mb-4 font-medium">
            Alertas generadas por sobre-consumo reciente (más del 30% respecto al histórico) o stock crítico en artículos prioritarios (Clase A).
          </p>

          {s.alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-green-600 bg-green-50/40 border border-green-100 rounded-2xl h-[calc(100%-60px)] min-h-[200px]">
              <span className="text-3xl mb-2">✅</span>
              <span className="font-bold text-green-800">Todo en orden</span>
              <span className="text-slate-500 mt-1 max-w-[250px] font-medium">No se detectan anomalías de sobre-consumo ni stock crítico en artículos principales.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
              {s.alerts.map((alert, idx) => (
                <div 
                  key={idx} 
                  className={`p-3.5 rounded-xl border flex flex-col gap-1.5 text-xs ${
                    alert.type === 'stock' ? 'bg-red-50/60 border-red-100 text-red-900' : 'bg-amber-50/60 border-amber-100 text-amber-900'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1">
                    {alert.title}
                  </div>
                  <p className="text-slate-600 leading-relaxed font-semibold">
                    {alert.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
