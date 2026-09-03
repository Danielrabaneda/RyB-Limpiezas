import { useState, useEffect } from "react";
import { addStock } from "../services/materialService";
import { format } from "date-fns";

export function useShoppingList({
  companyId,
  products,
  activeTab,
  currentUser,
  userProfile,
  setActionLoading,
  loadData,
  setActiveTab,
}) {
  const [shoppingItems, setShoppingItems] = useState([]);

  // Auto-synchronize low stock items when switching to shopping tab
  useEffect(() => {
    if (activeTab === "shopping" && products.length > 0) {
      const lowStockItems = products
        .filter((p) => (p.currentStock || 0) <= (p.minStock || 0))
        .map((p) => {
          const diff = (p.minStock || 0) - (p.currentStock || 0);
          const defaultQty = diff > 0 ? diff : 5;
          return {
            id: p.id,
            name: p.name,
            unit: p.unit,
            currentStock: p.currentStock || 0,
            minStock: p.minStock || 0,
            category: p.category,
            quantityToBuy: defaultQty,
            checked: true,
            isManual: false,
          };
        });
      setShoppingItems(lowStockItems);
    }
  }, [activeTab, products]);

  const handleAddManualItem = (productId) => {
    if (!productId) return;
    const p = products.find((prod) => prod.id === productId);
    if (!p) return;

    if (shoppingItems.some((item) => item.id === p.id)) {
      alert("El producto ya está en la lista de compra");
      return;
    }

    const newItem = {
      id: p.id,
      name: p.name,
      unit: p.unit,
      currentStock: p.currentStock || 0,
      minStock: p.minStock || 0,
      category: p.category,
      quantityToBuy: 5,
      checked: true,
      isManual: true,
    };
    setShoppingItems([...shoppingItems, newItem]);
  };

  const handleCopyShoppingList = () => {
    const selected = shoppingItems.filter(
      (item) => item.checked && item.quantityToBuy > 0,
    );
    if (selected.length === 0) {
      alert("No hay productos seleccionados en la lista");
      return;
    }

    let text = `🛒 *RyB LIMPIEZAS - LISTA DE COMPRA*\n`;
    text += `Fecha: ${format(new Date(), "dd/MM/yyyy")}\n\n`;
    selected.forEach((item, idx) => {
      text += `${idx + 1}. *${item.name}*: ${item.quantityToBuy} ${item.unit} (Stock act: ${item.currentStock} ${item.unit})\n`;
    });

    navigator.clipboard
      .writeText(text)
      .then(() => alert("📋 Lista de compra copiada al portapapeles"))
      .catch((err) => alert("Error al copiar la lista"));
  };

  const handleCompletePurchase = async () => {
    const selected = shoppingItems.filter(
      (item) => item.checked && item.quantityToBuy > 0,
    );
    if (selected.length === 0) {
      alert("No hay productos seleccionados para comprar");
      return;
    }

    if (
      !confirm(
        `¿Registrar la entrada de stock para los ${selected.length} productos seleccionados?`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      for (const item of selected) {
        await addStock(
          companyId,
          item.id,
          item.name,
          item.quantityToBuy,
          currentUser.uid,
          userProfile?.name || "Admin",
          "Entrada automática desde Lista de Compra",
        );
      }
      alert("✅ Entrada de stock registrada con éxito");
      await loadData();
      setActiveTab("catalog");
    } catch (err) {
      console.error("[useShoppingList] Error completing purchase:", err);
      alert("Error al registrar la compra");
    } finally {
      setActionLoading(false);
    }
  };

  return {
    shoppingItems,
    setShoppingItems,
    handleAddManualItem,
    handleCopyShoppingList,
    handleCompletePurchase,
  };
}
