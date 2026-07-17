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

export function useInventoryData({
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
    setLoading(true);
    try {
      const [pData, oData, uData, mData] = await Promise.all([
        getProducts(),
        getMaterialRequests(),
        getAllUsers(),
        getStockMovements(200),
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

  const handleStatusChange = async (orderId, status) => {
    if (!currentUser?.uid) return;
    setActionLoading(true);
    try {
      await updateRequestStatus(
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
    if (!confirm("¿Borrar este pedido?")) return;
    setActionLoading(true);
    try {
      await deleteMaterialRequest(id);
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error deleting request:", err);
      alert("Error al borrar");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddProduct = async (productData) => {
    setActionLoading(true);
    try {
      await createProduct(productData);
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
    setActionLoading(true);
    try {
      await updateProduct(productId, editData);
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
      )
    )
      return;
    setActionLoading(true);
    try {
      await deleteProduct(id);
      await loadData();
    } catch (err) {
      console.error("[useInventoryData] Error deleting product:", err);
      alert("Error al borrar producto");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStockAction = async (type, product, quantity, notes) => {
    setActionLoading(true);
    try {
      if (type === "in") {
        await addStock(
          product.id,
          product.name,
          quantity,
          currentUser.uid,
          userProfile?.name || "Admin",
          notes,
        );
      } else if (type === "adjust") {
        await adjustStock(
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
