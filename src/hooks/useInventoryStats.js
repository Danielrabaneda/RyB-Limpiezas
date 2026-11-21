import { useState } from "react";
import { autoCategorize } from "../utils/inventoryCategories";

export function useInventoryStats({ products, movements, users }) {
  const [statsFilterRange, setStatsFilterRange] = useState("12m");
  const [statsFilterFamily, setStatsFilterFamily] = useState("all");
  const [statsSearch, setStatsSearch] = useState("");
  const [statsPeriod, setStatsPeriod] = useState("monthly");

  const getStatsData = (product) => {
    if (!product) {
      return {
        monthly: [],
        yearly: [],
        topOperators: [],
        totalConsumed: 0,
        avgMonthly: 0,
        avgYearly: 0,
        totalDeliveries: 0,
      };
    }

    const prodMovements = movements.filter(
      (m) => m.productId === product.id && m.type === "out",
    );

    const totalDeliveries = prodMovements.length;
    let totalConsumed = 0;
    prodMovements.forEach((m) => {
      totalConsumed += Math.abs(m.quantity || 0);
    });

    // 1. Calculate Monthly stats (last 12 months)
    const monthlyList = [];
    const now = new Date();
    const monthNames = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyList.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        value: 0,
        count: 0,
      });
    }

    prodMovements.forEach((m) => {
      const mDate = m.date?.toDate() || new Date();
      const mYear = mDate.getFullYear();
      const mMonth = mDate.getMonth();

      const bucket = monthlyList.find(
        (b) => b.year === mYear && b.month === mMonth,
      );
      if (bucket) {
        bucket.value += Math.abs(m.quantity || 0);
        bucket.count += 1;
      }
    });

    const avgMonthly =
      monthlyList.reduce((sum, item) => sum + item.value, 0) /
      (monthlyList.length || 1);

    // 2. Calculate Yearly stats (dynamically tracking all years with data)
    const yearsSet = new Set();
    yearsSet.add(now.getFullYear());
    prodMovements.forEach((m) => {
      const mDate = m.date?.toDate() || new Date();
      yearsSet.add(mDate.getFullYear());
    });

    const yearsList = Array.from(yearsSet).sort((a, b) => a - b);
    const yearlyData = yearsList.map((yr) => {
      let val = 0;
      let count = 0;
      prodMovements.forEach((m) => {
        const mDate = m.date?.toDate() || new Date();
        if (mDate.getFullYear() === yr) {
          val += Math.abs(m.quantity || 0);
          count += 1;
        }
      });
      return {
        label: String(yr),
        value: val,
        count: count,
      };
    });

    const avgYearly =
      yearlyData.reduce((sum, item) => sum + item.value, 0) /
      (yearlyData.length || 1);

    // 3. Top Operators
    const opConsumption = {};
    prodMovements.forEach((m) => {
      const uid = m.userId;
      if (uid) {
        opConsumption[uid] =
          (opConsumption[uid] || 0) + Math.abs(m.quantity || 0);
      }
    });

    const topOperators = Object.entries(opConsumption)
      .map(([uid, val]) => {
        const userObj = users[uid];
        const name = userObj
          ? userObj.name || userObj.displayName || "Operario Desconocido"
          : `UID: ${uid.slice(0, 6)}`;
        return {
          uid,
          name,
          value: val,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      monthly: monthlyList,
      yearly: yearlyData,
      topOperators,
      totalConsumed,
      avgMonthly,
      avgYearly,
      totalDeliveries,
    };
  };

  const getGlobalDashboardData = () => {
    const now = new Date();
    let cutoffDate = new Date();
    if (statsFilterRange === "3m") {
      cutoffDate.setMonth(now.getMonth() - 3);
    } else if (statsFilterRange === "6m") {
      cutoffDate.setMonth(now.getMonth() - 6);
    } else if (statsFilterRange === "12m") {
      cutoffDate.setMonth(now.getMonth() - 12);
    } else {
      cutoffDate = new Date(0);
    }

    const activeProducts = products.filter((p) => {
      const pCat = p.category || autoCategorize(p.name);
      const matchesFamily =
        statsFilterFamily === "all" || pCat === statsFilterFamily;
      const matchesSearch =
        statsSearch === "" ||
        p.name.toLowerCase().includes(statsSearch.toLowerCase());
      return matchesFamily && matchesSearch;
    });

    const activeProductIds = new Set(activeProducts.map((p) => p.id));

    const filteredMovements = movements.filter((m) => {
      if (m.type !== "out") return false;
      if (!activeProductIds.has(m.productId)) return false;
      const mDate = m.date?.toDate() || new Date();
      return mDate >= cutoffDate;
    });

    let totalConsumed = 0;
    filteredMovements.forEach((m) => {
      totalConsumed += Math.abs(m.quantity || 0);
    });

    const totalDeliveries = filteredMovements.length;
    const criticalStockCount = activeProducts.filter(
      (p) => (p.currentStock || 0) <= (p.minStock || 0),
    ).length;

    const nowMs = now.getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const last30DaysLimit = nowMs - thirtyDaysMs;
    const prev30DaysLimit = nowMs - 2 * thirtyDaysMs;

    let last30DaysQty = 0;
    let prev30DaysQty = 0;

    movements.forEach((m) => {
      if (m.type !== "out") return;
      if (!activeProductIds.has(m.productId)) return;
      const mDate = m.date?.toDate() || new Date();
      const mTime = mDate.getTime();
      if (mTime >= last30DaysLimit) {
        last30DaysQty += Math.abs(m.quantity || 0);
      } else if (mTime >= prev30DaysLimit) {
        prev30DaysQty += Math.abs(m.quantity || 0);
      }
    });

    let monthlyVariation = 0;
    if (prev30DaysQty > 0) {
      monthlyVariation =
        ((last30DaysQty - prev30DaysQty) / prev30DaysQty) * 100;
    } else if (last30DaysQty > 0) {
      monthlyVariation = 100;
    }

    const monthNames = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];
    const numMonths =
      statsFilterRange === "3m" ? 3 : statsFilterRange === "6m" ? 6 : 12;
    const temporalData = [];
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      temporalData.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        value: 0,
        count: 0,
      });
    }

    filteredMovements.forEach((m) => {
      const mDate = m.date?.toDate() || new Date();
      const mYear = mDate.getFullYear();
      const mMonth = mDate.getMonth();
      const bucket = temporalData.find(
        (b) => b.year === mYear && b.month === mMonth,
      );
      if (bucket) {
        bucket.value += Math.abs(m.quantity || 0);
        bucket.count += 1;
      }
    });

    const productConsumption = {};
    filteredMovements.forEach((m) => {
      productConsumption[m.productId] =
        (productConsumption[m.productId] || 0) + Math.abs(m.quantity || 0);
    });

    const rankingData = Object.entries(productConsumption)
      .map(([id, value]) => {
        const prod = products.find((p) => p.id === id);
        return {
          id,
          name: prod ? prod.name : `ID: ${id.slice(0, 6)}`,
          unit: prod ? prod.unit : "uds",
          value,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const sortedCatalogConsumption = activeProducts
      .map((p) => {
        const val = productConsumption[p.id] || 0;
        return {
          product: p,
          value: val,
        };
      })
      .sort((a, b) => b.value - a.value);

    const grandTotal = sortedCatalogConsumption.reduce(
      (sum, item) => sum + item.value,
      0,
    );

    let cumulativeSum = 0;
    const abcData = sortedCatalogConsumption.map((item) => {
      cumulativeSum += item.value;
      const cumulativePercent =
        grandTotal > 0 ? (cumulativeSum / grandTotal) * 100 : 100;

      let abcClass = "C";
      if (grandTotal > 0) {
        if (cumulativePercent <= 80) abcClass = "A";
        else if (cumulativePercent <= 95) abcClass = "B";
      } else {
        abcClass = "C";
      }

      return {
        ...item,
        cumulativePercent,
        abcClass,
      };
    });

    const alerts = [];
    abcData.forEach((item) => {
      const p = item.product;
      const stock = p.currentStock || 0;
      const minStock = p.minStock || 0;

      if (item.abcClass === "A" && stock <= minStock) {
        alerts.push({
          type: "stock",
          product: p,
          title: "⚠️ Stock crítico en artículo Clase A",
          description: `El producto "${p.name}" es de alta rotación (Clase A), pero su stock actual (${stock} ${p.unit}) está por debajo del mínimo de aviso (${minStock} ${p.unit}).`,
        });
      }

      const stats = getStatsData(p);
      const histMonthlyAvg = stats.avgMonthly;

      let pLast30Days = 0;
      movements.forEach((m) => {
        if (m.type === "out" && m.productId === p.id) {
          const mDate = m.date?.toDate() || new Date();
          if (mDate.getTime() >= last30DaysLimit) {
            pLast30Days += Math.abs(m.quantity || 0);
          }
        }
      });

      if (histMonthlyAvg > 0 && pLast30Days > histMonthlyAvg * 1.3) {
        alerts.push({
          type: "overconsumption",
          product: p,
          title: "🔥 Sobre-consumo detectado",
          description: `El consumo de "${p.name}" en los últimos 30 días (${pLast30Days.toFixed(1)} ${p.unit}) supera en un ${((pLast30Days / histMonthlyAvg - 1) * 100).toFixed(0)}% su promedio histórico mensual (${histMonthlyAvg.toFixed(1)} ${p.unit}).`,
        });
      }
    });

    const top8Products = sortedCatalogConsumption
      .slice(0, 8)
      .map((item) => item.product);
    const heatmapMonths = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      heatmapMonths.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: monthNames[d.getMonth()],
      });
    }

    const heatmapData = top8Products.map((p) => {
      const rowValues = heatmapMonths.map((mBucket) => {
        let val = 0;
        movements.forEach((m) => {
          if (m.type === "out" && m.productId === p.id) {
            const mDate = m.date?.toDate() || new Date();
            if (
              mDate.getFullYear() === mBucket.year &&
              mDate.getMonth() === mBucket.month
            ) {
              val += Math.abs(m.quantity || 0);
            }
          }
        });
        return val;
      });
      return {
        product: p,
        values: rowValues,
      };
    });

    const maxHeatmapVal = Math.max(...heatmapData.flatMap((r) => r.values), 1);

    return {
      totalConsumed,
      totalDeliveries,
      criticalStockCount,
      monthlyVariation,
      temporalData,
      rankingData,
      abcData,
      alerts,
      heatmapMonths,
      heatmapData,
      maxHeatmapVal,
    };
  };

  return {
    statsFilterRange,
    setStatsFilterRange,
    statsFilterFamily,
    setStatsFilterFamily,
    statsSearch,
    setStatsSearch,
    statsPeriod,
    setStatsPeriod,
    getStatsData,
    getGlobalDashboardData,
  };
}
