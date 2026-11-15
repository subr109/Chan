import React, { useMemo, useState } from 'react';
import { Plus, Search, PackagePlus, SlidersHorizontal, History, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  createProduct,
  deleteProduct,
  receiveStock,
  recordStockAdjustment,
  updateProductDetails,
} from '../services/erpService';
import { formatCurrency, formatNumber, formatTimestamp } from '../lib/formatters';
import { Product, ProductUnit } from '../types/erp';
import { ConfirmModal } from '../components/ConfirmModal';

const UNITS: ProductUnit[] = ['Pieces', 'Meters', 'Rolls', 'Sets', 'Dozens'];
const CATEGORIES = ['Shirts', 'Trousers', 'Kurtis', 'Denim', 'Raw Fabric', 'Accessories', 'General Garments'];

export function StockManagementPage() {
  const { products, stockTransactions, settings, isAdmin, showToast, dataLoading } = useErp();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<Product | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const [busy, setBusy] = useState(false);

  // Product Form State
  const [productCode, setProductCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Shirts');
  const [unit, setUnit] = useState<ProductUnit>('Pieces');
  const [rate, setRate] = useState('0');
  const [defaultLabourRate, setDefaultLabourRate] = useState('0');
  const [openingStock, setOpeningStock] = useState('0');
  const [minStockLevel, setMinStockLevel] = useState(String(settings.defaultLowStockThreshold || 50));

  // Receive Stock Form State
  const [receiveQty, setReceiveQty] = useState('');
  const [receiveRemarks, setReceiveRemarks] = useState('');

  // Adjust Stock Form State
  const [adjustType, setAdjustType] = useState<'DAMAGE_DEDUCTION' | 'AUTHORIZED_ADJUSTMENT'>('DAMAGE_DEDUCTION');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustRemarks, setAdjustRemarks] = useState('');

  const categories = useMemo(() => {
    const set = new Set(CATEGORIES);
    products.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (lowStockOnly && p.warehouseStock > p.minStockLevel) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter, lowStockOnly]);

  const totals = useMemo(() => {
    return filteredProducts.reduce(
      (acc, p) => {
        acc.warehouse += p.warehouseStock;
        acc.employeeHeld += p.employeeHeldStock;
        acc.finished += p.finishedGoodsStock;
        acc.damaged += p.damagedStock;
        return acc;
      },
      { warehouse: 0, employeeHeld: 0, finished: 0, damaged: 0 }
    );
  }, [filteredProducts]);

  const openAddModal = () => {
    setEditingProduct(null);
    setProductCode('');
    setName('');
    setCategory('Shirts');
    setUnit('Pieces');
    setRate('0');
    setDefaultLabourRate('0');
    setOpeningStock('0');
    setMinStockLevel(String(settings.defaultLowStockThreshold || 50));
    setProductModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setProductCode(p.productCode);
    setName(p.name);
    setCategory(p.category);
    setUnit(p.unit);
    setRate(String(p.rate));
    setDefaultLabourRate(String(p.defaultLabourRate));
    setOpeningStock(String(p.openingStock));
    setMinStockLevel(String(p.minStockLevel));
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingProduct) {
        await updateProductDetails(editingProduct, {
          productCode,
          name,
          category,
          unit,
          rate: Number(rate),
          defaultLabourRate: Number(defaultLabourRate),
          minStockLevel: Number(minStockLevel),
        });
        showToast('success', `Updated product ${name}.`);
      } else {
        await createProduct({
          productCode,
          name,
          category,
          unit,
          rate: Number(rate),
          defaultLabourRate: Number(defaultLabourRate),
          openingStock: Number(openingStock),
          minStockLevel: Number(minStockLevel),
        });
        showToast('success', `Created product ${name} with opening stock.`);
      }
      setProductModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setBusy(false);
    }
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget) return;
    setBusy(true);
    try {
      await receiveStock(receiveTarget.id, Number(receiveQty), receiveRemarks);
      showToast('success', `Received ${receiveQty} ${receiveTarget.unit} for ${receiveTarget.name}.`);
      setReceiveTarget(null);
      setReceiveQty('');
      setReceiveRemarks('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to receive stock.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setBusy(true);
    try {
      const rawQty = Number(adjustQty);
      const delta = adjustType === 'DAMAGE_DEDUCTION' ? -Math.abs(rawQty) : rawQty;
      await recordStockAdjustment({
        productId: adjustTarget.id,
        adjustmentType: adjustType,
        deltaQuantity: delta,
        remarks: adjustRemarks,
        allowNegativeOverride: settings.allowNegativeStockOverride,
        isAdmin,
      });
      showToast('success', `Recorded ${adjustType.replace(/_/g, ' ').toLowerCase()} for ${adjustTarget.name}.`);
      setAdjustTarget(null);
      setAdjustQty('');
      setAdjustRemarks('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to adjust stock.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteProduct(deleteTarget);
      showToast('success', `Deleted product ${deleteTarget.name}.`);
      setDeleteTarget(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete product.');
    } finally {
      setBusy(false);
    }
  };

  const productHistory = useMemo(() => {
    if (!historyTarget) return [];
    return stockTransactions.filter((tx) => tx.productId === historyTarget.id);
  }, [historyTarget, stockTransactions]);

  return (
    <div className="space-y-6">
      {/* Header & Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Warehouse &amp; Inventory Control</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Formula: Available = (Opening + Received) - Issued + Returned - Deductions
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Live Position Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Warehouse Available</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatNumber(totals.warehouse)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Employee-Held Stock</p>
          <p className="mt-1 font-mono text-xl font-semibold text-indigo-700 tabular-nums">
            {formatNumber(totals.employeeHeld)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Completed Finished Goods</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
            {formatNumber(totals.finished)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Damaged / Rejected</p>
          <p className="mt-1 font-mono text-xl font-semibold text-red-600 tabular-nums">
            {formatNumber(totals.damaged)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, code, or category..."
            className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setLowStockOnly((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              lowStockOnly
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Low-Stock Alerts Only</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading inventory...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No products match your filters</p>
            <p className="mt-1 text-xs text-slate-500">
              Add a garment item or raw material SKU to start tracking warehouse and factory stock.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Product</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-3">Product &amp; Code</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Rate / Labour</th>
                  <th className="px-4 py-3 text-right">Opening + Recv</th>
                  <th className="px-4 py-3 text-right">Issued</th>
                  <th className="px-4 py-3 text-right">Returned</th>
                  <th className="px-4 py-3 text-right">Warehouse Avail.</th>
                  <th className="px-4 py-3 text-right">With Staff</th>
                  <th className="px-4 py-3 text-right">Finished Goods</th>
                  <th className="px-4 py-3 text-right">Damaged</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const isLow = p.warehouseStock <= p.minStockLevel;
                  const totalRecv = p.openingStock + p.stockReceived;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {p.productCode} · {p.unit}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{p.category}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        <p className="text-slate-900">{formatCurrency(p.rate)}</p>
                        <p className="text-slate-500">Lab: {formatCurrency(p.defaultLabourRate)}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(totalRecv)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(p.stockIssued)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(p.stockReturned)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span
                          className={`font-semibold ${
                            isLow ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {formatNumber(p.warehouseStock)}
                        </span>
                        {isLow && (
                          <p className="text-[11px] font-sans font-medium text-amber-700">
                            Low Stock (Min {formatNumber(p.minStockLevel)})
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-indigo-700 font-medium">
                        {formatNumber(p.employeeHeldStock)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {formatNumber(p.finishedGoodsStock)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-red-600">
                        {formatNumber(p.damagedStock)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReceiveTarget(p);
                              setReceiveQty('');
                              setReceiveRemarks('');
                            }}
                            title="Receive Stock"
                            className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                          >
                            <PackagePlus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryTarget(p)}
                            title="Stock History"
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustTarget(p);
                                setAdjustType('DAMAGE_DEDUCTION');
                                setAdjustQty('');
                                setAdjustRemarks('');
                              }}
                              title="Authorized Adjustment / Damage"
                              className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Edit Product"
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              title="Delete Product"
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {editingProduct ? 'Edit Product Details' : 'Add New Product / Material'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Product Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    placeholder="e.g. CM-SHIRT-01"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cotton Formal Shirt"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    list="garment-categories"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <datalist id="garment-categories">
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit *
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as ProductUnit)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Product Value Rate (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Default Labour Rate (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={defaultLabourRate}
                    onChange={(e) => setDefaultLabourRate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                {!editingProduct && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Opening Stock *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={openingStock}
                      onChange={(e) => setOpeningStock(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Low-Stock Alert Threshold *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={minStockLevel}
                    onChange={(e) => setMinStockLevel(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Stock Modal */}
      {receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Receive Stock — {receiveTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setReceiveTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleReceiveStock} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 tabular-nums">
                Current Warehouse Stock: <span className="font-mono font-semibold">{formatNumber(receiveTarget.warehouseStock)} {receiveTarget.unit}</span>
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Quantity Received ({receiveTarget.unit}) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Supplier / Chalan Remarks
                </label>
                <input
                  type="text"
                  value={receiveRemarks}
                  onChange={(e) => setReceiveRemarks(e.target.value)}
                  placeholder="e.g. Chalan #408 from Surat Mills"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReceiveTarget(null)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? 'Updating...' : 'Add to Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authorized Adjustment / Damage Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Authorized Stock Adjustment — {adjustTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Adjustment Type *
                </label>
                <select
                  value={adjustType}
                  onChange={(e) =>
                    setAdjustType(e.target.value as 'DAMAGE_DEDUCTION' | 'AUTHORIZED_ADJUSTMENT')
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="DAMAGE_DEDUCTION">Damaged / Defective Stock Deduction</option>
                  <option value="AUTHORIZED_ADJUSTMENT">Authorized Audit Correction (+/-)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {adjustType === 'DAMAGE_DEDUCTION'
                    ? `Damaged Quantity to Deduct (${adjustTarget.unit}) *`
                    : `Adjustment Delta (use negative to deduct) *`}
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Audit Reason / Remarks *
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustRemarks}
                  onChange={(e) => setAdjustRemarks(e.target.value)}
                  placeholder="Required for permanent audit trail..."
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy ? 'Recording...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Stock Movement History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Product Stock Ledger — {historyTarget.name} ({historyTarget.productCode})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Warehouse: {formatNumber(historyTarget.warehouseStock)} · Employee-Held: {formatNumber(historyTarget.employeeHeldStock)} · Finished: {formatNumber(historyTarget.finishedGoodsStock)} · Damaged: {formatNumber(historyTarget.damagedStock)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto">
              {productHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No stock transactions found for this product.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Tx ID &amp; Time</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Wh. Delta</th>
                      <th className="px-3 py-2 text-right">New Wh.</th>
                      <th className="px-3 py-2">Employee / Ref</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productHistory.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-3 py-2">
                          <p className="font-mono font-medium text-slate-900">{tx.transactionCode}</p>
                          <p className="text-slate-400">{formatTimestamp(tx.createdAt)}</p>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700">
                          {tx.type.replace(/_/g, ' ')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatNumber(tx.quantity)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${tx.warehouseDelta > 0 ? 'text-emerald-700' : tx.warehouseDelta < 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                          {tx.warehouseDelta > 0 ? `+${tx.warehouseDelta}` : tx.warehouseDelta}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {formatNumber(tx.newWarehouseStock)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {tx.employeeName || tx.referenceId || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={tx.remarks}>
                          {tx.remarks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Product Record"
        description={`Are you sure you want to permanently delete "${deleteTarget?.name}" (${deleteTarget?.productCode})? Historical stock transactions remain preserved in the audit log.`}
        confirmLabel="Delete Product"
        busy={busy}
        onConfirm={handleDeleteProduct}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
