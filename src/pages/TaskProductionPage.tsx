import React, { useMemo, useState } from 'react';
import { Plus, Search, CheckCircle2, Trash2, Eye, X, ShieldCheck } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  approveRejectedPayment,
  deleteTask,
  issueStockTask,
  recordWorkCompletion,
} from '../services/erpService';
import { addDaysISO, formatCurrency, formatNumber, getTodayISO } from '../lib/formatters';
import { Task, WorkCompletion } from '../types/erp';
import { ConfirmModal } from '../components/ConfirmModal';

type TaskFilterTab = 'ALL' | 'Pending' | 'In Progress' | 'Completed' | 'Overdue' | 'COMPLETIONS';

export function TaskProductionPage() {
  const { tasks, workCompletions, employees, products, subProducts, isAdmin, showToast, dataLoading } = useErp();

  const [activeTab, setActiveTab] = useState<TaskFilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('ALL');

  // Modals
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<Task | null>(null);
  const [detailTarget, setDetailTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [approveTarget, setApproveTarget] = useState<WorkCompletion | null>(null);

  const [busy, setBusy] = useState(false);

  // Issue Stock / Task Creation state
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedProdId, setSelectedProdId] = useState('');
  const [selectedSubProdId, setSelectedSubProdId] = useState('');
  const [quantityIssued, setQuantityIssued] = useState('');
  const [perUnitRate, setPerUnitRate] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayISO());
  const [expectedDate, setExpectedDate] = useState(addDaysISO(getTodayISO(), 7));
  const [notes, setNotes] = useState('');

  // Work Completion installment state
  const [acceptedQty, setAcceptedQty] = useState('');
  const [rejectedQty, setRejectedQty] = useState('0');
  const [unusedReturnedQty, setUnusedReturnedQty] = useState('0');
  const [completionDate, setCompletionDate] = useState(getTodayISO());
  const [completionRemarks, setCompletionRemarks] = useState('');

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'Active'),
    [employees]
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProdId) || null,
    [products, selectedProdId]
  );

  const activeSubProductsForProduct = useMemo(
    () => subProducts.filter((sp) => sp.parentProductId === selectedProdId && sp.isActive),
    [subProducts, selectedProdId]
  );

  const selectedSubProduct = useMemo(
    () => subProducts.find((sp) => sp.id === selectedSubProdId) || null,
    [subProducts, selectedSubProdId]
  );

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmpId) || null,
    [employees, selectedEmpId]
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (activeTab !== 'ALL' && activeTab !== 'COMPLETIONS' && t.status !== activeTab) return false;
      if (employeeFilter !== 'ALL' && t.employeeId !== employeeFilter) return false;
      if (!q) return true;
      return (
        t.issueCode.toLowerCase().includes(q) ||
        t.employeeName.toLowerCase().includes(q) ||
        t.employeeCode.toLowerCase().includes(q) ||
        t.productName.toLowerCase().includes(q) ||
        t.productCode.toLowerCase().includes(q) ||
        (t.subProductName || '').toLowerCase().includes(q) ||
        (t.subProductCode || '').toLowerCase().includes(q)
      );
    });
  }, [tasks, activeTab, employeeFilter, search]);

  const filteredCompletions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workCompletions.filter((wc) => {
      if (employeeFilter !== 'ALL' && wc.employeeId !== employeeFilter) return false;
      if (!q) return true;
      return (
        wc.completionCode.toLowerCase().includes(q) ||
        wc.issueCode.toLowerCase().includes(q) ||
        wc.employeeName.toLowerCase().includes(q) ||
        wc.productName.toLowerCase().includes(q) ||
        (wc.subProductName || '').toLowerCase().includes(q)
      );
    });
  }, [workCompletions, employeeFilter, search]);

  const summary = useMemo(() => {
    const totalIssued = tasks.reduce((s, t) => s + t.quantityIssued, 0);
    const totalAccepted = tasks.reduce((s, t) => s + t.completedAcceptedQty, 0);
    const totalRejected = tasks.reduce((s, t) => s + t.completedRejectedQty, 0);
    const totalPending = tasks.reduce((s, t) => s + t.pendingQty, 0);
    const totalEarnings = tasks.reduce((s, t) => s + t.earnedAmount, 0);
    return { totalIssued, totalAccepted, totalRejected, totalPending, totalEarnings };
  }, [tasks]);

  const openIssueModal = () => {
    const firstEmp = activeEmployees[0];
    const firstProd = products.find((p) => p.warehouseStock > 0) || products[0];
    const firstProdSubs = firstProd
      ? subProducts.filter((sp) => sp.parentProductId === firstProd.id && sp.isActive)
      : [];
    const firstSub = firstProdSubs[0] || null;

    setSelectedEmpId(firstEmp?.id || '');
    setSelectedProdId(firstProd?.id || '');
    setSelectedSubProdId(firstSub?.id || '');
    setQuantityIssued('');
    if (firstSub) {
      setPerUnitRate(String(firstSub.labourRate));
    } else if (firstProd && firstProd.defaultLabourRate > 0) {
      setPerUnitRate(String(firstProd.defaultLabourRate));
    } else {
      setPerUnitRate(String(firstEmp?.perPieceRate ?? 0));
    }
    const today = getTodayISO();
    setIssueDate(today);
    setExpectedDate(addDaysISO(today, 7));
    setNotes('');
    setIssueModalOpen(true);
  };

  const handleEmpChange = (empId: string) => {
    setSelectedEmpId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (
      !selectedSubProduct &&
      (!selectedProduct || selectedProduct.defaultLabourRate <= 0) &&
      emp &&
      emp.perPieceRate > 0
    ) {
      setPerUnitRate(String(emp.perPieceRate));
    }
  };

  const handleProdChange = (prodId: string) => {
    setSelectedProdId(prodId);
    const prod = products.find((p) => p.id === prodId);
    const subs = subProducts.filter((sp) => sp.parentProductId === prodId && sp.isActive);
    const firstSub = subs[0] || null;
    setSelectedSubProdId(firstSub?.id || '');

    if (firstSub) {
      setPerUnitRate(String(firstSub.labourRate));
    } else if (prod && prod.defaultLabourRate > 0) {
      setPerUnitRate(String(prod.defaultLabourRate));
    } else if (selectedEmployee && selectedEmployee.perPieceRate > 0) {
      setPerUnitRate(String(selectedEmployee.perPieceRate));
    } else {
      setPerUnitRate(String(prod?.defaultLabourRate ?? 0));
    }
  };

  const handleSubProdChange = (subId: string) => {
    setSelectedSubProdId(subId);
    const sub = subProducts.find((sp) => sp.id === subId);
    if (sub) {
      setPerUnitRate(String(sub.labourRate));
    } else if (selectedProduct && selectedProduct.defaultLabourRate > 0) {
      setPerUnitRate(String(selectedProduct.defaultLabourRate));
    } else if (selectedEmployee && selectedEmployee.perPieceRate > 0) {
      setPerUnitRate(String(selectedEmployee.perPieceRate));
    } else {
      setPerUnitRate('0');
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await issueStockTask({
        employeeId: selectedEmpId,
        productId: selectedProdId,
        subProductId: selectedSubProdId || undefined,
        quantityIssued: Number(quantityIssued),
        perUnitRate: Number(perUnitRate),
        issueDate,
        expectedCompletionDate: expectedDate,
        notes,
      });
      showToast('success', 'Stock issued and production task created successfully.');
      setIssueModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to issue stock.');
    } finally {
      setBusy(false);
    }
  };

  const openCompletionModal = (t: Task) => {
    setCompletionTarget(t);
    setAcceptedQty('');
    setRejectedQty('0');
    setUnusedReturnedQty('0');
    setCompletionDate(getTodayISO());
    setCompletionRemarks('');
  };

  const handleCompletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionTarget) return;
    setBusy(true);
    try {
      await recordWorkCompletion({
        taskId: completionTarget.id,
        acceptedQty: Number(acceptedQty || 0),
        rejectedQty: Number(rejectedQty || 0),
        unusedReturnedQty: Number(unusedReturnedQty || 0),
        completionDate,
        remarks: completionRemarks,
      });
      showToast('success', `Recorded work completion for ${completionTarget.issueCode}.`);
      setCompletionTarget(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to record completion.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteTask(deleteTarget);
      showToast('success', `Cancelled and reversed task ${deleteTarget.issueCode}.`);
      setDeleteTarget(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete task.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveRejected = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await approveRejectedPayment(approveTarget, isAdmin);
      showToast('success', `Approved rejected quantity payment for ${approveTarget.completionCode}.`);
      setApproveTarget(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  };

  // Live Completion Modal Calculation Preview
  const previewAccepted = Math.max(0, Number(acceptedQty) || 0);
  const previewRejected = Math.max(0, Number(rejectedQty) || 0);
  const previewUnused = Math.max(0, Number(unusedReturnedQty) || 0);
  const previewProcessed = previewAccepted + previewRejected + previewUnused;
  const previewRemaining = completionTarget
    ? completionTarget.pendingQty - previewProcessed
    : 0;
  const previewEarned = completionTarget
    ? previewAccepted * completionTarget.perUnitRate
    : 0;

  const taskCompletions = useMemo(
    () => (detailTarget ? workCompletions.filter((wc) => wc.taskId === detailTarget.id) : []),
    [detailTarget, workCompletions]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Stock Issue, Task Assignment &amp; Production
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Pending = Issued - Completed - Unused Returned · Earnings = Accepted × Per-Unit Rate
          </p>
        </div>
        <button
          type="button"
          onClick={openIssueModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Issue Stock / Assign Task</span>
        </button>
      </div>

      {/* Production KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Issued</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatNumber(summary.totalIssued)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Accepted Production</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
            {formatNumber(summary.totalAccepted)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Rejected Goods</p>
          <p className="mt-1 font-mono text-xl font-semibold text-red-600 tabular-nums">
            {formatNumber(summary.totalRejected)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Pending Quantity</p>
          <p className="mt-1 font-mono text-xl font-semibold text-amber-700 tabular-nums">
            {formatNumber(summary.totalPending)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Earned Labour Wages</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatCurrency(summary.totalEarnings)}
          </p>
        </div>
      </div>

      {/* Filter Bar & Status Tabs */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          {(
            [
              { id: 'ALL', label: `All Tasks (${tasks.length})` },
              { id: 'Pending', label: `Pending (${tasks.filter((t) => t.status === 'Pending').length})` },
              { id: 'In Progress', label: `In Progress (${tasks.filter((t) => t.status === 'In Progress').length})` },
              { id: 'Overdue', label: `Overdue (${tasks.filter((t) => t.status === 'Overdue').length})` },
              { id: 'Completed', label: `Completed (${tasks.filter((t) => t.status === 'Completed').length})` },
              { id: 'COMPLETIONS', label: `Completion History (${workCompletions.length})` },
            ] as Array<{ id: TaskFilterTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Issue ID, employee, or product..."
              className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.employeeCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table (Tasks vs Completion History) */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading tasks and production...</div>
        ) : activeTab === 'COMPLETIONS' ? (
          filteredCompletions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No work completion entries logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Completion ID</th>
                    <th className="px-4 py-3">Issue ID &amp; Date</th>
                    <th className="px-4 py-3">Employee &amp; Product</th>
                    <th className="px-4 py-3 text-right">Accepted</th>
                    <th className="px-4 py-3 text-right">Rejected</th>
                    <th className="px-4 py-3 text-right">Unused Ret.</th>
                    <th className="px-4 py-3 text-right">Remaining</th>
                    <th className="px-4 py-3 text-right">Earned</th>
                    <th className="px-4 py-3 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCompletions.map((wc) => (
                    <tr key={wc.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                        {wc.completionCode}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-slate-900">{wc.issueCode}</p>
                        <p className="font-mono text-xs text-slate-500">{wc.completionDate}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{wc.employeeName}</p>
                        <p className="text-xs text-slate-600">{wc.productName}</p>
                        {wc.subProductName && (
                          <p className="text-xs font-medium text-indigo-700">
                            ↳ {wc.subProductName} ({wc.subProductCode})
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {formatNumber(wc.acceptedQty)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-red-600">
                        {formatNumber(wc.rejectedQty)}
                        {wc.rejectedQty > 0 && wc.rejectedApprovedForPay && (
                          <span className="block text-[10px] text-emerald-700 font-sans">
                            Paid (Approved)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(wc.unusedReturnedQty)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                        {formatNumber(wc.remainingWorkQty)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(wc.earnedAmount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && wc.rejectedQty > 0 && !wc.rejectedApprovedForPay ? (
                          <button
                            type="button"
                            onClick={() => setApproveTarget(wc)}
                            className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 whitespace-nowrap"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Approve Rej. Pay</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filteredTasks.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No tasks match the current view</p>
            <p className="mt-1 text-xs text-slate-500">
              Issue raw materials or products to an employee to start tracking production installments.
            </p>
            <button
              type="button"
              onClick={openIssueModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              <span>Issue First Task</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-3">Issue ID &amp; Dates</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Issued</th>
                  <th className="px-4 py-3 text-right">Acc / Rej / Ret</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3 text-right">Rate / Earned</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-900">{t.issueCode}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {t.issueDate} → {t.expectedCompletionDate}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.employeeName}</p>
                      <p className="font-mono text-xs text-slate-500">{t.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.productName}</p>
                      {t.subProductName && (
                        <p className="text-xs font-medium text-indigo-700">
                          ↳ {t.subProductName} ({t.subProductCode})
                        </p>
                      )}
                      <p className="font-mono text-xs text-slate-500">{t.productCode}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(t.quantityIssued)} {t.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      <span className="text-emerald-700">{formatNumber(t.completedAcceptedQty)}</span> /{' '}
                      <span className="text-red-600">{formatNumber(t.completedRejectedQty)}</span> /{' '}
                      <span className="text-slate-600">{formatNumber(t.returnedUnusedQty)}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                      {formatNumber(t.pendingQty)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      <p className="font-semibold text-slate-900">{formatCurrency(t.earnedAmount)}</p>
                      <p className="text-slate-500">@ {formatCurrency(t.perUnitRate)}/u</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          t.status === 'Completed'
                            ? 'text-emerald-700'
                            : t.status === 'Overdue'
                              ? 'text-red-600'
                              : t.status === 'In Progress'
                                ? 'text-indigo-700'
                                : 'text-amber-700'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {t.pendingQty > 0 && (
                          <button
                            type="button"
                            onClick={() => openCompletionModal(t)}
                            title="Record Work Completion"
                            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Complete</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetailTarget(t)}
                          title="View Task Installments"
                          className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {isAdmin &&
                          t.completedAcceptedQty === 0 &&
                          t.completedRejectedQty === 0 &&
                          t.returnedUnusedQty === 0 && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(t)}
                              title="Cancel & Reverse Issue"
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Issue Stock / Create Task Modal */}
      {issueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Stock Issue Entry &amp; Task Assignment
              </h3>
              <button
                type="button"
                onClick={() => setIssueModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeEmployees.length === 0 || products.length === 0 ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Please ensure at least one Active Employee and one Product with warehouse stock exist before issuing a task.
              </div>
            ) : (
              <form onSubmit={handleIssueSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Select Active Employee *
                  </label>
                  <select
                    required
                    value={selectedEmpId}
                    onChange={(e) => handleEmpChange(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select Employee...</option>
                    {activeEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employeeCode}) — {emp.workCategory}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Select Main Product / Material *
                  </label>
                  <select
                    required
                    value={selectedProdId}
                    onChange={(e) => handleProdChange(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select Main Product...</option>
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} ({prod.productCode}) — Avail: {formatNumber(prod.warehouseStock)} {prod.unit}
                      </option>
                    ))}
                  </select>
                  {selectedProduct && (
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      Available Warehouse Stock:{' '}
                      <span className="font-mono font-semibold text-slate-900">
                        {formatNumber(selectedProduct.warehouseStock)} {selectedProduct.unit}
                      </span>
                    </p>
                  )}
                </div>

                {selectedProduct && (
                  <div>
                    <label className="block text-xs font-medium text-indigo-800 mb-1">
                      Select Sub-Product (Separate Rate)
                    </label>
                    {activeSubProductsForProduct.length > 0 ? (
                      <select
                        value={selectedSubProdId}
                        onChange={(e) => handleSubProdChange(e.target.value)}
                        className="w-full rounded-md border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                      >
                        {activeSubProductsForProduct.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name} ({sp.subProductCode}) — Labour Rate: {formatCurrency(sp.labourRate)}/{sp.unit}
                          </option>
                        ))}
                        <option value="">
                          Main Product Only — Default Rate: {formatCurrency(selectedProduct.defaultLabourRate)}/{selectedProduct.unit}
                        </option>
                      </select>
                    ) : (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        No sub-products defined under {selectedProduct.name}. Add sub-products in Stock Management to assign separate rates per sub-product.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Quantity Issued *
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      max={selectedProduct ? selectedProduct.warehouseStock : undefined}
                      step="any"
                      required
                      value={quantityIssued}
                      onChange={(e) => setQuantityIssued(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Per-Unit Labour Rate (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={perUnitRate}
                      onChange={(e) => setPerUnitRate(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                    {selectedSubProduct && (
                      <p className="mt-1 text-[11px] text-indigo-700 tabular-nums">
                        Sub-product rate: {formatCurrency(selectedSubProduct.labourRate)}/{selectedSubProduct.unit}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Issue Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Expected Completion Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Task Notes / Stitching Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Size specs, thread color, or batch remarks..."
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Live Automatic Calculation Preview */}
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Expected Payment:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatCurrency((Number(quantityIssued) || 0) * (Number(perUnitRate) || 0))}
                    </span>
                  </div>
                  {selectedProduct && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Warehouse Stock After Issue:</span>
                      <span
                        className={`font-mono font-semibold ${
                          selectedProduct.warehouseStock - (Number(quantityIssued) || 0) < 0
                            ? 'text-red-600'
                            : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(selectedProduct.warehouseStock - (Number(quantityIssued) || 0))}{' '}
                        {selectedProduct.unit}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setIssueModalOpen(false)}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy ? 'Issuing...' : 'Confirm Stock Issue'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Record Work Completion Installment Modal */}
      {completionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Record Work Completion — {completionTarget.issueCode}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {completionTarget.employeeName} · {completionTarget.productName}
                  {completionTarget.subProductName ? ` → ${completionTarget.subProductName} (${completionTarget.subProductCode})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletionTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCompletionSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs tabular-nums">
                <div>
                  <span className="text-slate-500 block">Issued</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatNumber(completionTarget.quantityIssued)} {completionTarget.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Pending Now</span>
                  <span className="font-mono font-semibold text-amber-700">
                    {formatNumber(completionTarget.pendingQty)} {completionTarget.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Labour Rate</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatCurrency(completionTarget.perUnitRate)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Accepted Qty *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={acceptedQty}
                    onChange={(e) => setAcceptedQty(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Rejected Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={rejectedQty}
                    onChange={(e) => setRejectedQty(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unused Returned
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={unusedReturnedQty}
                    onChange={(e) => setUnusedReturnedQty(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Completion Date *
                </label>
                <input
                  type="date"
                  required
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Quality Check / Installment Remarks
                </label>
                <input
                  type="text"
                  value={completionRemarks}
                  onChange={(e) => setCompletionRemarks(e.target.value)}
                  placeholder="Optional inspection notes..."
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Automatic Stock & Wage Calculation Preview */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-600">Newly Completed (Accepted + Rejected):</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatNumber(previewAccepted + previewRejected)} {completionTarget.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Remaining With Employee After Entry:</span>
                  <span
                    className={`font-mono font-semibold ${
                      previewRemaining < 0 ? 'text-red-600' : 'text-amber-700'
                    }`}
                  >
                    {formatNumber(previewRemaining)} {completionTarget.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Added to Finished Goods / Warehouse:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    +{formatNumber(previewAccepted)} Finished / +{formatNumber(previewUnused)} Warehouse
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <span className="font-medium text-slate-700">Approved Earnings (Accepted × Rate):</span>
                  <span className="font-mono font-semibold text-indigo-700">
                    {formatCurrency(previewEarned)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setCompletionTarget(null)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || previewRemaining < 0 || previewProcessed <= 0}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? 'Recording...' : 'Save Completion Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Details & Installment History Modal */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Task Ledger — {detailTarget.issueCode}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {detailTarget.employeeName} ({detailTarget.employeeCode}) · {detailTarget.productName}
                  {detailTarget.subProductName ? ` → ${detailTarget.subProductName}` : ''} · Issued {detailTarget.quantityIssued} {detailTarget.unit} on {detailTarget.issueDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {detailTarget.notes && (
              <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Notes: {detailTarget.notes}
              </p>
            )}
            <div className="mt-4 flex-1 overflow-y-auto">
              {taskCompletions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No production installments recorded for this issue yet.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Completion ID</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Accepted</th>
                      <th className="px-3 py-2 text-right">Rejected</th>
                      <th className="px-3 py-2 text-right">Unused Ret.</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                      <th className="px-3 py-2 text-right">Earned</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {taskCompletions.map((wc) => (
                      <tr key={wc.id}>
                        <td className="px-3 py-2 font-mono font-medium text-slate-900">{wc.completionCode}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{wc.completionDate}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{wc.acceptedQty}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">{wc.rejectedQty}</td>
                        <td className="px-3 py-2 text-right font-mono">{wc.unusedReturnedQty}</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-700">{wc.remainingWorkQty}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(wc.earnedAmount)}</td>
                        <td className="px-3 py-2 text-slate-600">{wc.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Cancel & Reverse Stock Issue"
        description={`Are you sure you want to cancel ${deleteTarget?.issueCode}? This will restore ${deleteTarget?.quantityIssued} ${deleteTarget?.unit} back to warehouse stock and write an audit entry.`}
        confirmLabel="Reverse & Delete Task"
        busy={busy}
        onConfirm={handleDeleteTask}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={Boolean(approveTarget)}
        title="Approve Payment for Rejected Pieces"
        description={`Authorize piece-rate payment for ${approveTarget?.rejectedQty} rejected pieces on ${approveTarget?.completionCode}? This adds ${formatCurrency((approveTarget?.rejectedQty || 0) * (approveTarget?.perUnitRate || 0))} to ${approveTarget?.employeeName}'s approved earnings.`}
        confirmLabel="Approve Payment"
        variant="warning"
        busy={busy}
        onConfirm={handleApproveRejected}
        onCancel={() => setApproveTarget(null)}
      />
    </div>
  );
}
