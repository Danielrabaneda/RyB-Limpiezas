import React, { useState } from "react";
import { CATEGORIES } from "../../../utils/inventoryCategories";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts";

// ==================== CUSTOM TOOLTIP COMPONENTS ====================

function TemporalTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.92)",
        backdropFilter: "blur(8px)",
        borderRadius: 12,
        padding: "10px 14px",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      <p style={{ color: "#94a3b8", fontSize: 11, margin: 0, fontWeight: 600 }}>
        {data.label}
      </p>
      <p
        style={{
          color: "#fff",
          fontSize: 16,
          margin: "4px 0 2px",
          fontWeight: 800,
        }}
      >
        {data.value.toFixed(1)}{" "}
        <span style={{ fontSize: 11, color: "#94a3b8" }}>uds</span>
      </p>
      <p style={{ color: "#64748b", fontSize: 10, margin: 0 }}>
        {data.count} entregas
      </p>
    </div>
  );
}

function RankingTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.92)",
        backdropFilter: "blur(8px)",
        borderRadius: 12,
        padding: "10px 14px",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      <p style={{ color: "#e2e8f0", fontSize: 12, margin: 0, fontWeight: 700 }}>
        {data.name}
      </p>
      <p
        style={{
          color: "#fff",
          fontSize: 16,
          margin: "4px 0 0",
          fontWeight: 800,
        }}
      >
        {data.value.toFixed(1)}{" "}
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{data.unit}</span>
      </p>
    </div>
  );
}

function ParetoTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  const classColors = { A: "#3b82f6", B: "#06b6d4", C: "#94a3b8" };
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.92)",
        backdropFilter: "blur(8px)",
        borderRadius: 12,
        padding: "10px 14px",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        maxWidth: 220,
      }}
    >
      <p
        style={{
          color: "#e2e8f0",
          fontSize: 11,
          margin: 0,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {data.name}
      </p>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}
      >
        <span
          style={{
            background: classColors[data.abcClass] || "#94a3b8",
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 6,
          }}
        >
          Clase {data.abcClass}
        </span>
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>
          {data.value.toFixed(1)}
        </span>
        <span style={{ color: "#64748b", fontSize: 10 }}>uds</span>
      </div>
      <p style={{ color: "#64748b", fontSize: 10, margin: "4px 0 0" }}>
        Acumulado: {data.cumulativePercent.toFixed(1)}%
      </p>
    </div>
  );
}

// ==================== HEATMAP COLOR SCALE ====================

function getHeatmapColor(value, maxVal) {
  if (value === 0)
    return { bg: "#f8fafc", text: "#cbd5e1", border: "1px dashed #e2e8f0" };
  const ratio = Math.min(value / maxVal, 1);
  // White → Blue → Indigo → Violet
  let r, g, b;
  if (ratio <= 0.33) {
    const t = ratio / 0.33;
    r = Math.round(239 - t * (239 - 147));
    g = Math.round(246 - t * (246 - 197));
    b = Math.round(255 - t * (255 - 253));
  } else if (ratio <= 0.66) {
    const t = (ratio - 0.33) / 0.33;
    r = Math.round(147 - t * (147 - 79));
    g = Math.round(197 - t * (197 - 70));
    b = Math.round(253 - t * (253 - 229));
  } else {
    const t = (ratio - 0.66) / 0.34;
    r = Math.round(79 - t * (79 - 55));
    g = Math.round(70 - t * 70);
    b = Math.round(229 - t * (229 - 163));
  }
  const textColor = ratio > 0.4 ? "#ffffff" : "#1e293b";
  return { bg: `rgb(${r}, ${g}, ${b})`, text: textColor, border: "none" };
}

// ==================== MAIN COMPONENT ====================

export default function InventoryStats({
  products,
  movements,
  statsFilterRange,
  setStatsFilterRange,
  statsFilterFamily,
  setStatsFilterFamily,
  statsSearch,
  setStatsSearch,
  getGlobalDashboardData,
}) {
  const s = getGlobalDashboardData();
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = useState(null);

  // Prepare Pareto chart data
  const paretoChartData = s.abcData.slice(0, 15).map((item, idx) => ({
    name: item.product.name,
    shortName:
      item.product.name.length > 12
        ? item.product.name.slice(0, 12) + "…"
        : item.product.name,
    value: item.value,
    cumulativePercent: item.cumulativePercent,
    abcClass: item.abcClass,
    index: idx,
  }));

  // Bar colors by ABC class
  const classBarColors = { A: "#3b82f6", B: "#06b6d4", C: "#cbd5e1" };

  return (
    <div className="stats-dashboard flex flex-col gap-6">
      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm rounded-2xl bg-white">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Rango Temporal
            </label>
            <select
              className="form-select text-sm py-1.5 px-3 min-w-[150px] bg-slate-50 border-slate-200 rounded-xl"
              value={statsFilterRange}
              onChange={(e) => setStatsFilterRange(e.target.value)}
            >
              <option value="3m">Últimos 3 meses</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="12m">Últimos 12 meses</option>
              <option value="all">Histórico Completo</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Familia / Categoría
            </label>
            <select
              className="form-select text-sm py-1.5 px-3 min-w-[180px] bg-slate-50 border-slate-200 rounded-xl"
              value={statsFilterFamily}
              onChange={(e) => setStatsFilterFamily(e.target.value)}
            >
              <option value="all">Todas las familias</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Buscar Producto
          </label>
          <input
            type="text"
            className="form-input text-sm py-1.5 px-3 bg-slate-50 border-slate-200 rounded-xl"
            placeholder="Filtrar por nombre..."
            value={statsSearch}
            onChange={(e) => setStatsSearch(e.target.value)}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div
          className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white"
          style={{ borderColor: "var(--color-primary)" }}
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Consumo Total
            </div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {s.totalConsumed.toFixed(1)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              unidades entregadas
            </div>
          </div>
          <div className="text-3xl bg-blue-50 p-2.5 rounded-2xl">📦</div>
        </div>

        {/* KPI 2 */}
        <div
          className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white"
          style={{ borderColor: "var(--color-accent)" }}
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Variación Mensual
            </div>
            <div className="text-2xl font-black text-slate-800 mt-1 flex items-center gap-1.5">
              {s.monthlyVariation > 0 ? (
                <span className="text-red-500">
                  +{s.monthlyVariation.toFixed(0)}% 📈
                </span>
              ) : s.monthlyVariation < 0 ? (
                <span className="text-green-500">
                  {s.monthlyVariation.toFixed(0)}% 📉
                </span>
              ) : (
                <span className="text-slate-500">0%</span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              últ. 30 días vs ant. 30 días
            </div>
          </div>
          <div className="text-3xl bg-cyan-50 p-2.5 rounded-2xl">🔄</div>
        </div>

        {/* KPI 3 */}
        <div
          className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white"
          style={{
            borderColor:
              s.criticalStockCount > 0
                ? "var(--color-danger)"
                : "var(--color-success)",
          }}
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Stock Crítico
            </div>
            <div
              className={`text-2xl font-black mt-1 ${s.criticalStockCount > 0 ? "text-red-600" : "text-slate-800"}`}
            >
              {s.criticalStockCount}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              artículos bajo el mínimo
            </div>
          </div>
          <div
            className="text-3xl p-2.5 rounded-2xl"
            style={{
              backgroundColor: s.criticalStockCount > 0 ? "#fef2f2" : "#f0fdf4",
            }}
          >
            {s.criticalStockCount > 0 ? "⚠️" : "✅"}
          </div>
        </div>

        {/* KPI 4 */}
        <div
          className="card p-4 flex items-center justify-between border-l-4 shadow-sm rounded-2xl bg-white"
          style={{ borderColor: "var(--color-info)" }}
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Entregas Totales
            </div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {s.totalDeliveries}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              solicitudes completadas
            </div>
          </div>
          <div className="text-3xl bg-indigo-50 p-2.5 rounded-2xl">👷</div>
        </div>
      </div>

      {/* ==================== EVOLUCIÓN TEMPORAL (Recharts AreaChart) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="card p-5 lg:col-span-7 flex flex-col justify-between shadow-sm rounded-2xl bg-white">
          <div>
            <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
              📈 Evolución de Consumo Temporal
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-medium">
              Total de unidades consumidas mensualmente en el periodo
            </p>
          </div>
          {s.totalConsumed === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 italic">
              No hay registros de consumo para este periodo.
            </div>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={s.temporalData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorConsumo"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => val.split(" ")[0]}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    content={<TemporalTooltip />}
                    cursor={{
                      stroke: "#3b82f6",
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#colorConsumo)"
                    dot={{
                      r: 4,
                      fill: "#fff",
                      stroke: "#3b82f6",
                      strokeWidth: 2.5,
                    }}
                    activeDot={{
                      r: 6,
                      fill: "#3b82f6",
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ==================== TOP 10 RANKING (Recharts BarChart Horizontal) ==================== */}
        <div className="card p-5 lg:col-span-5 shadow-sm rounded-2xl bg-white">
          <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
            📊 Top 10 Artículos Consumidos
          </h3>
          <p className="text-xs text-slate-400 mb-4 font-medium">
            Ranking de artículos más retirados por cantidad total
          </p>

          {s.rankingData.length === 0 ? (
            <div className="text-slate-400 italic text-center py-12 text-sm">
              No hay datos de consumo.
            </div>
          ) : (
            <div
              style={{
                width: "100%",
                height: Math.max(s.rankingData.length * 32, 160),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={s.rankingData}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    horizontal={false}
                  />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                    tickFormatter={(val) =>
                      val.length > 16 ? val.slice(0, 16) + "…" : val
                    }
                  />
                  <Tooltip
                    content={<RankingTooltip />}
                    cursor={{ fill: "rgba(59, 130, 246, 0.04)" }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 6, 6, 0]}
                    animationDuration={600}
                    label={{
                      position: "right",
                      fontSize: 10,
                      fontWeight: 700,
                      fill: "#334155",
                      formatter: (val) => val.toFixed(1),
                    }}
                  >
                    {s.rankingData.map((entry, index) => {
                      const colors = [
                        "#3b82f6",
                        "#6366f1",
                        "#8b5cf6",
                        "#a78bfa",
                        "#818cf8",
                        "#60a5fa",
                        "#38bdf8",
                        "#22d3ee",
                        "#67e8f9",
                        "#a5f3fc",
                      ];
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={colors[index % colors.length]}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ==================== HEATMAP (Grid mejorado con escala de color intensa) ==================== */}
      <div className="card p-5 shadow-sm rounded-2xl bg-white">
        <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
          🔲 Matriz de Calor (Consumo Mensual por Artículo)
        </h3>
        <p className="text-xs text-slate-400 mb-5 font-medium">
          Cruza los 8 artículos más consumidos frente a los últimos 6 meses para
          ver la intensidad estacional de consumo.
        </p>

        {s.heatmapData.length === 0 ? (
          <div className="text-slate-400 italic text-center py-12 text-sm">
            No hay datos suficientes para generar el mapa de calor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr repeat(" + s.heatmapMonths.length + ", 1fr)",
                  gap: 4,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#64748b",
                    padding: "6px 8px",
                  }}
                >
                  Artículo
                </div>
                {s.heatmapMonths.map((mBucket, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#64748b",
                      textAlign: "center",
                      padding: "6px 4px",
                      background: "#f8fafc",
                      borderRadius: 8,
                    }}
                  >
                    {mBucket.label}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {s.heatmapData.map((row, rowIdx) => (
                <div
                  key={row.product.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr repeat(" + s.heatmapMonths.length + ", 1fr)",
                    gap: 4,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#334155",
                      padding: "8px 8px",
                      display: "flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.product.name}
                  </div>
                  {row.values.map((val, colIdx) => {
                    const colors = getHeatmapColor(val, s.maxHeatmapVal);
                    const isHovered =
                      hoveredHeatmapCell?.row === rowIdx &&
                      hoveredHeatmapCell?.col === colIdx;
                    return (
                      <div
                        key={colIdx}
                        onMouseEnter={() =>
                          setHoveredHeatmapCell({ row: rowIdx, col: colIdx })
                        }
                        onMouseLeave={() => setHoveredHeatmapCell(null)}
                        style={{
                          textAlign: "center",
                          padding: "10px 4px",
                          borderRadius: 10,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "default",
                          backgroundColor: colors.bg,
                          color: colors.text,
                          border: colors.border,
                          transform: isHovered ? "scale(1.1)" : "scale(1)",
                          transition: "all 0.2s ease",
                          boxShadow: isHovered
                            ? "0 4px 12px rgba(0,0,0,0.15)"
                            : "none",
                          position: "relative",
                          zIndex: isHovered ? 2 : 1,
                        }}
                        title={`${row.product.name} - ${s.heatmapMonths[colIdx].label}: ${val.toFixed(1)} ${row.product.unit}`}
                      >
                        {val > 0 ? val.toFixed(0) : "–"}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Color scale legend */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 6,
                  marginTop: 12,
                  paddingRight: 4,
                }}
              >
                <span
                  style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}
                >
                  Menor
                </span>
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio, i) => {
                  const c = getHeatmapColor(
                    ratio * s.maxHeatmapVal || 0.01,
                    s.maxHeatmapVal,
                  );
                  return (
                    <div
                      key={i}
                      style={{
                        width: 20,
                        height: 14,
                        borderRadius: 4,
                        backgroundColor: c.bg,
                        border:
                          ratio === 0
                            ? "1px dashed #e2e8f0"
                            : "1px solid rgba(0,0,0,0.05)",
                      }}
                    />
                  );
                })}
                <span
                  style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}
                >
                  Mayor
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== PARETO ABC (Recharts ComposedChart) + Alertas ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pareto ABC */}
        <div className="card p-5 lg:col-span-6 shadow-sm rounded-2xl bg-white">
          <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
            🎯 Clasificación ABC (Rotación y Consumo)
          </h3>
          <p className="text-xs text-slate-400 mb-4 font-medium">
            Clasificación de productos basada en el principio de Pareto (los
            artículos Clase A representan el 80% del consumo total).
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
                  <span className="inline-block px-2 py-0.5 rounded-full bg-blue-500 text-white font-bold text-[10px] mb-1">
                    A
                  </span>
                  <div className="text-lg font-black text-blue-900">
                    {s.abcData.filter((d) => d.abcClass === "A").length}
                  </div>
                  <div className="text-[9px] text-blue-600 font-bold uppercase">
                    Alta Rotación (80%)
                  </div>
                </div>
                <div className="bg-cyan-50 p-2.5 rounded-xl border border-cyan-100 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-500 text-white font-bold text-[10px] mb-1">
                    B
                  </span>
                  <div className="text-lg font-black text-cyan-900">
                    {s.abcData.filter((d) => d.abcClass === "B").length}
                  </div>
                  <div className="text-[9px] text-cyan-600 font-bold uppercase">
                    Rotación Media (15%)
                  </div>
                </div>
                <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-slate-500 text-white font-bold text-[10px] mb-1">
                    C
                  </span>
                  <div className="text-lg font-black text-slate-800">
                    {s.abcData.filter((d) => d.abcClass === "C").length}
                  </div>
                  <div className="text-[9px] text-slate-500 font-bold uppercase">
                    Baja Rotación (5%)
                  </div>
                </div>
              </div>

              {/* Pareto Chart */}
              {paretoChartData.length > 0 && (
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={paretoChartData}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="shortName"
                        tick={{ fontSize: 8, fill: "#94a3b8", fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{
                          fontSize: 10,
                          fill: "#94a3b8",
                          fontWeight: 600,
                        }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 9, fill: "#f59e0b", fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        width={35}
                        domain={[0, 100]}
                        tickFormatter={(val) => `${val}%`}
                      />
                      <Tooltip content={<ParetoTooltip />} />
                      <ReferenceLine
                        yAxisId="right"
                        y={80}
                        stroke="#f59e0b"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{
                          value: "80%",
                          position: "right",
                          fontSize: 9,
                          fill: "#f59e0b",
                          fontWeight: 700,
                        }}
                      />
                      <ReferenceLine
                        yAxisId="right"
                        y={95}
                        stroke="#ef4444"
                        strokeDasharray="4 2"
                        strokeWidth={1}
                        label={{
                          value: "95%",
                          position: "right",
                          fontSize: 9,
                          fill: "#ef4444",
                          fontWeight: 700,
                        }}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="value"
                        radius={[4, 4, 0, 0]}
                        animationDuration={600}
                      >
                        {paretoChartData.map((entry, index) => (
                          <Cell
                            key={`pareto-cell-${index}`}
                            fill={classBarColors[entry.abcClass]}
                          />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulativePercent"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{
                          r: 3,
                          fill: "#f59e0b",
                          stroke: "#fff",
                          strokeWidth: 1.5,
                        }}
                        activeDot={{ r: 5, fill: "#f59e0b" }}
                        animationDuration={800}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ABC Table (compact) */}
              <div className="max-h-[180px] overflow-y-auto border border-slate-100 rounded-xl">
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
                    {s.abcData.slice(0, 15).map((item) => (
                      <tr
                        key={item.product.id}
                        className="border-b last:border-0 hover:bg-slate-50"
                      >
                        <td className="p-2.5 font-medium truncate max-w-[120px]">
                          {item.product.name}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-full font-bold text-[9px] ${
                              item.abcClass === "A"
                                ? "bg-blue-100 text-blue-700"
                                : item.abcClass === "B"
                                  ? "bg-cyan-100 text-cyan-700"
                                  : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {item.abcClass}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-bold">
                          {item.value.toFixed(1)}
                        </td>
                        <td className="p-2.5 text-right font-semibold text-slate-400">
                          {item.cumulativePercent.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                    {s.abcData.length > 15 && (
                      <tr>
                        <td
                          colSpan="4"
                          className="p-2.5 text-center text-[10px] text-muted italic"
                        >
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

        {/* ==================== ALERTAS (sin cambios) ==================== */}
        <div className="card p-5 lg:col-span-6 shadow-sm rounded-2xl bg-white">
          <h3 className="text-md font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
            🚨 Alertas de Consumo y Almacén
          </h3>
          <p className="text-xs text-slate-400 mb-4 font-medium">
            Alertas generadas por sobre-consumo reciente (más del 30% respecto
            al histórico) o stock crítico en artículos prioritarios (Clase A).
          </p>

          {s.alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-green-600 bg-green-50/40 border border-green-100 rounded-2xl h-[calc(100%-60px)] min-h-[200px]">
              <span className="text-3xl mb-2">✅</span>
              <span className="font-bold text-green-800">Todo en orden</span>
              <span className="text-slate-500 mt-1 max-w-[250px] font-medium">
                No se detectan anomalías de sobre-consumo ni stock crítico en
                artículos principales.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
              {s.alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex flex-col gap-1.5 text-xs ${
                    alert.type === "stock"
                      ? "bg-red-50/60 border-red-100 text-red-900"
                      : "bg-amber-50/60 border-amber-100 text-amber-900"
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
