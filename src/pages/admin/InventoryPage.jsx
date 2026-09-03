import { useState, useEffect } from "react";
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
} from "../../services/materialService";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../contexts/AuthContext";
import { getAllUsers } from "../../services/authService";
import { groupFlatList } from "../../utils/dateGrouping";
import { useInventoryData } from "../../hooks/useInventoryData";
import { useShoppingList } from "../../hooks/useShoppingList";
import { useInventoryStats } from "../../hooks/useInventoryStats";
import { useTenant } from "../../contexts/TenantContext";
import InventoryOrders from "../../components/admin/inventory/InventoryOrders";
import InventoryCatalog from "../../components/admin/inventory/InventoryCatalog";
import InventoryShopping from "../../components/admin/inventory/InventoryShopping";
import InventoryMovements from "../../components/admin/inventory/InventoryMovements";
import InventoryStats from "../../components/admin/inventory/InventoryStats";
import InventoryModals from "../../components/admin/inventory/InventoryModals";

import { CATEGORIES, autoCategorize } from "../../utils/inventoryCategories";

export default function InventoryPage() {
  const { companyId } = useTenant();
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("orders"); // 'orders', 'catalog', 'movements'
  const [actionLoading, setActionLoading] = useState(false);
  const {
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
    handleAddProduct: handleAddProductRaw,
    handleEditProductSubmit: handleEditProductSubmitRaw,
    handleDeleteProduct,
    handleStockAction: handleStockActionRaw,
  } = useInventoryData({
    companyId,
    currentUser,
    userProfile,
    actionLoading,
    setActionLoading,
  });

  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleGroup = (id) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedGroups(newSet);
  };

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    unit: "unidad",
    minStock: "5",
    category: "general",
  });
  const [stockModal, setStockModal] = useState({
    open: false,
    type: "in",
    product: null,
    quantity: "",
    notes: "",
  });
  const [statsModal, setStatsModal] = useState({ open: false, product: null });
  const [editProductModal, setEditProductModal] = useState({
    open: false,
    product: null,
    name: "",
    unit: "unidad",
    minStock: "5",
    category: "general",
  });

  const {
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
  } = useInventoryStats({ products, movements, users });

  const {
    shoppingItems,
    setShoppingItems,
    handleAddManualItem,
    handleCopyShoppingList,
    handleCompletePurchase,
  } = useShoppingList({
    products,
    activeTab,
    currentUser,
    userProfile,
    setActionLoading,
    loadData,
    setActiveTab,
    companyId,
  });

  useEffect(() => {
    // Redundant loadData removed since useInventoryData.js useEffect handles it on companyId changes.
  }, [companyId]);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      await handleAddProductRaw({
        ...newProduct,
        category: newProduct.category || autoCategorize(newProduct.name),
      });
      setNewProduct({
        name: "",
        unit: "unidad",
        minStock: "5",
        category: "general",
      });
      setShowAddProduct(false);
    } catch (err) {
      // Error already handled inside hook
    }
  };

  const handleEditProductSubmit = async (e) => {
    e.preventDefault();
    try {
      await handleEditProductSubmitRaw(editProductModal.product.id, {
        name: editProductModal.name,
        unit: editProductModal.unit,
        minStock: editProductModal.minStock,
        category: editProductModal.category,
      });
      setEditProductModal({
        open: false,
        product: null,
        name: "",
        unit: "unidad",
        minStock: "5",
        category: "general",
      });
    } catch (err) {
      // Error already handled inside hook
    }
  };

  const handleStockAction = async (e) => {
    e.preventDefault();
    try {
      await handleStockActionRaw(
        stockModal.type,
        stockModal.product,
        stockModal.quantity,
        stockModal.notes,
      );
      setStockModal({
        open: false,
        type: "in",
        product: null,
        quantity: "",
        notes: "",
      });
    } catch (err) {
      // Error handled in hook
    }
  };

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Gestión de Material</h1>
        <p className="page-subtitle">Control de stock, movimientos y pedidos</p>
      </div>

      <div className="tabs-container mb-6 flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          className={`btn btn-sm ${activeTab === "orders" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("orders")}
        >
          📋 Pedidos
        </button>
        <button
          className={`btn btn-sm ${activeTab === "catalog" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("catalog")}
        >
          📦 Inventario
        </button>
        <button
          className={`btn btn-sm ${activeTab === "shopping" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("shopping")}
        >
          🛒 Lista de Compra
        </button>
        <button
          className={`btn btn-sm ${activeTab === "movements" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("movements")}
        >
          📊 Movimientos
        </button>
        <button
          className={`btn btn-sm ${activeTab === "stats" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("stats")}
        >
          📈 Estadísticas
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando datos...</div>
      ) : activeTab === "orders" ? (
        <InventoryOrders
          orders={orders}
          users={users}
          products={products}
          expandedGroups={expandedGroups}
          actionLoading={actionLoading}
          toggleGroup={toggleGroup}
          handleDeleteOrder={handleDeleteOrder}
          handleStatusChange={handleStatusChange}
        />
      ) : activeTab === "catalog" ? (
        <InventoryCatalog
          products={products}
          actionLoading={actionLoading}
          setStockModal={setStockModal}
          setStatsModal={setStatsModal}
          setEditProductModal={setEditProductModal}
          handleDeleteProduct={handleDeleteProduct}
          setShowAddProduct={setShowAddProduct}
        />
      ) : activeTab === "shopping" ? (
        <InventoryShopping
          shoppingItems={shoppingItems}
          products={products}
          setShoppingItems={setShoppingItems}
          handleAddManualItem={handleAddManualItem}
          handleCopyShoppingList={handleCopyShoppingList}
          handleCompletePurchase={handleCompletePurchase}
          actionLoading={actionLoading}
        />
      ) : activeTab === "movements" ? (
        <InventoryMovements
          movements={movements}
          users={users}
          expandedGroups={expandedGroups}
          toggleGroup={toggleGroup}
        />
      ) : (
        <InventoryStats
          products={products}
          movements={movements}
          statsFilterRange={statsFilterRange}
          setStatsFilterRange={setStatsFilterRange}
          statsFilterFamily={statsFilterFamily}
          setStatsFilterFamily={setStatsFilterFamily}
          statsSearch={statsSearch}
          setStatsSearch={setStatsSearch}
          getGlobalDashboardData={getGlobalDashboardData}
        />
      )}

      <InventoryModals
        showAddProduct={showAddProduct}
        setShowAddProduct={setShowAddProduct}
        newProduct={newProduct}
        setNewProduct={setNewProduct}
        handleAddProduct={handleAddProduct}
        editProductModal={editProductModal}
        setEditProductModal={setEditProductModal}
        handleEditProductSubmit={handleEditProductSubmit}
        stockModal={stockModal}
        setStockModal={setStockModal}
        handleStockAction={handleStockAction}
        statsModal={statsModal}
        setStatsModal={setStatsModal}
        statsPeriod={statsPeriod}
        setStatsPeriod={setStatsPeriod}
        getStatsData={getStatsData}
        actionLoading={actionLoading}
      />
    </div>
  );
}
