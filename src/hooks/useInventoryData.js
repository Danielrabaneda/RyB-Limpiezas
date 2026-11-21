import { useState } from "react";
import {
  getProducts,
  getMaterialRequests,
  updateRequestStatus,
  deleteMaterialRequest,
  createProduct,
  updateProduct,
  deleteProduct,
  addStock,
  adjustStock,
  getStockMovements,
} from "../services/materialService";
import { getAllUsers } from "../services/authService";

import { useEffect } from "react";

export function useInventoryData({
  companyId,
  currentUser,
  userProfile,
  actionLoading,
  setActionLoading,
}) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [movements, setMovements] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!companyId) {
      setProducts([]);
      setOrders([]);
      setMovements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [pData, oData, uData, mData] = await Promise.all([
        getProducts(companyId),
        getMaterialRequests(companyId),
        getAllUsers(companyId),
        getStockMovements(companyId, 200),
      ]);

      setProducts(pData);
      setOrders(oData);
      setMovements(mData);

      const userMap = {};
      uData.forEach((u) => (userMap[u.uid] = u));
      setUsers(userMap);
    } catch (err) {
      console.error("[useInventoryData] Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset state before loading new tenant data to prevent stale data display
    setProducts([]);
    setOrders([]);
    setMovements([]);
    setUsers({});
    if (companyId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  const handleStatusChange = async (orderId, status) => {
    if (!currentUser?.uid || !companyId) return;
    setActionLoading(true);
    try {
      await updateRequestStatus(
        companyId,
        orderId,
        status,
        currentUser.uid,
        userProfile?.name || "Admin",
      );
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error updating request status:", err);
      alert(err.message || "Error al actualizar estado");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!confirm("¿Borrar este pedido?") || !companyId) return;
    setActionLoading(true);
    try {
      await deleteMaterialRequest(companyId, id);
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error deleting request:", err);
      alert("Error al borrar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddProduct = async (productData) => {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await createProduct(companyId, productData);
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error creating product:", err);
      alert("Error al añadir producto");
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditProductSubmit = async (productId, editData) => {
    if (!companyId) return;
    setActionLoading(true);
    try {
      await updateProduct(companyId, productId, editData);
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error updating product:", err);
      alert("Error al actualizar producto");
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (
      !confirm(
        "¿Borrar producto del catálogo? ¡Se perderá el inventario actual de este producto!",
      ) || !companyId
    )
      return;
    setActionLoading(true);
    try {
      await deleteProduct(companyId, id);
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error deleting product:", err);
      alert("Error al borrar producto");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStockAction = async (type, product, quantity, notes) => {
    if (!companyId) return;
    setActionLoading(true);
    try {
      if (type === "in") {
        await addStock(
          companyId,
          product.id,
          product.name,
          quantity,
          currentUser.uid,
          userProfile?.name || "Admin",
          notes,
        );
      } else if (type === "adjust") {
        await adjustStock(
          companyId,
          product.id,
          product.name,
          quantity,
          currentUser.uid,
          userProfile?.name || "Admin",
          notes,
        );
      }
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error adjusting/adding stock:", err);
      alert("Error actualizando stock");
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  return {
    products,
    setProducts,
    orders,
    setOrders,
    movements,
    setMovements,
    users,
    loading,
    loadData,
    handleStatusChange,
    handleDeleteOrder,
    handleAddProduct,
    handleEditProductSubmit,
    handleDeleteProduct,
    handleStockAction,
  };
}
