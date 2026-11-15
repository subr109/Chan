import React, { useMemo, useState } from 'react';
import { Plus, Search, UserCheck, UserX, Eye, Pencil, Trash2, X, FileDown } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  createEmployee,
  deleteEmployee,
  toggleEmployeeStatus,
  updateEmployee,
} from '../services/erpService';
import { formatCurrency, formatNumber, getTodayISO } from '../lib/formatters';
import { exportPaymentReceiptPDF } from '../lib/exportReports';
import { Employee, EmployeeStatus, PaymentType } from '../types/erp';
import { ConfirmModal } from '../components/ConfirmModal';

const WORK_CATEGORIES = ['Stitching', 'Cutting', 'Overlock', 'Finishing', 'Embroidery', 'Ironing & Packing', 'Quality Check'];
const PAYMENT_TYPES: PaymentType[] = ['Per Piece', 'Per Unit', 'Batch Rate'];

export function EmployeeManagementPage() {
  const { employees, tasks, workCompletions, payments, settings, isAdmin, showToast, dataLoading } = useErp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EmployeeStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [profileTarget, setProfileTarget] = useState<Employee | null>(null);
  const [profileTab, setProfileTab] = useState<'tasks' | 'completions' | 'payments'>('tasks');
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);

  // Form fields
  const [employeeCode, setEmployeeCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [joiningDate, setJoiningDate] = useState(getTodayISO());
  const [workCategory, setWorkCategory] = useState('Stitching');
  const [paymentType, setPaymentType] = useState<PaymentType>('Per Piece');
  const [perPieceRate, setPerPieceRate] = useState('0');
  const [status, setStatus] = useState<EmployeeStatus>('Active');

  const categories = useMemo(() => {
    const s = new Set(WORK_CATEGORIES);
    employees.forEach((e) => s.add(e.workCategory));
    return Array.from(s);
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && e.workCategory !== categoryFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.phone.toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter, categoryFilter]);

  const openAddModal = () => {
    setEditingEmployee(null);
    setEmployeeCode(`EMP-${String(employees.length + 1).padStart(3, '0')}`);
    setName('');
    setPhone('');
    setAddress('');
    setJoiningDate(getTodayISO());
    setWorkCategory('Stitching');
    setPaymentType('Per Piece');
    setPerPieceRate('0');
    setStatus('Active');
    setFormModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmployeeCode(emp.employeeCode);
    setName(emp.name);
    setPhone(emp.phone);
    setAddress(emp.address);
    setJoiningDate(emp.joiningDate);
    setWorkCategory(emp.workCategory);
    setPaymentType(emp.paymentType);
    setPerPieceRate(String(emp.perPieceRate));
    setStatus(emp.status);
    setFormModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        employeeCode,
        name,
        phone,
        address,
        joiningDate,
        workCategory,
        paymentType,
        perPieceRate: Number(perPieceRate),
        status,
      };
      if (editingEmployee) {
        await updateEmployee(editingEmployee, payload);
        showToast('success', `Updated employee ${name}.`);
      } else {
        await createEmployee(payload);
        showToast('success', `Registered employee ${name} (${employeeCode}).`);
      }
      setFormModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save employee.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    try {
      await toggleEmployeeStatus(emp);
      showToast(
        'info',
        `${emp.name} is now ${emp.status === 'Active' ? 'Inactive' : 'Active'}.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteEmployee(deleteTarget);
      showToast('success', `Deleted employee ${deleteTarget.name}.`);
      setDeleteTarget(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete employee.');
    } finally {
      setBusy(false);
    }
  };

  const liveProfileEmployee = useMemo(() => {
    if (!profileTarget) return null;
    return employees.find((e) => e.id === profileTarget.id) || profileTarget;
  }, [profileTarget, employees]);

  const profileTasks = useMemo(
    () => (liveProfileEmployee ? tasks.filter((t) => t.employeeId === liveProfileEmployee.id) : []),
    [liveProfileEmployee, tasks]
  );

  const profileCompletions = useMemo(
    () =>
      liveProfileEmployee
        ? workCompletions.filter((wc) => wc.employeeId === liveProfileEmployee.id)
        : [],
    [liveProfileEmployee, workCompletions]
  );

  const profilePayments = useMemo(
    () => (liveProfileEmployee ? payments.filter((p) => p.employeeId === liveProfileEmployee.id) : []),
    [liveProfileEmployee, payments]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Workforce &amp; Artisan Ledger</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track piece-rate workers, assigned material balances, earnings, and outstanding wages.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee name, ID, or phone..."
            className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Work Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | EmployeeStatus)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Employee Directory Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading employees...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No employees found</p>
            <p className="mt-1 text-xs text-slate-500">
              Register tailors, cutters, and finishing staff to assign stock and track wages.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Employee</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-3">Employee &amp; ID</th>
                  <th className="px-4 py-3">Category / Rate</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Held Stock</th>
                  <th className="px-4 py-3 text-right">Completed Qty</th>
                  <th className="px-4 py-3 text-right">Total Earnings</th>
                  <th className="px-4 py-3 text-right">Total Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileTarget(emp);
                          setProfileTab('tasks');
                        }}
                        className="text-left font-medium text-indigo-700 hover:underline"
                      >
                        {emp.name}
                      </button>
                      <p className="font-mono text-xs text-slate-500">
                        {emp.employeeCode} · {emp.phone || 'No phone'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-900">{emp.workCategory}</p>
                      <p className="font-mono text-xs text-slate-500 tabular-nums">
                        {formatCurrency(emp.perPieceRate)} / {emp.paymentType}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          emp.status === 'Active' ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-indigo-700 font-medium">
                      {formatNumber(emp.currentMaterialBalance)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(emp.totalAcceptedQty)}
                      {emp.totalRejectedQty > 0 && (
                        <span className="block text-[11px] text-red-600">
                          +{formatNumber(emp.totalRejectedQty)} rej.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(emp.totalApprovedEarnings)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {formatCurrency(emp.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-amber-700">
                      {formatCurrency(emp.outstandingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileTarget(emp);
                            setProfileTab('tasks');
                          }}
                          title="View Employee Ledger & Work History"
                          className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(emp)}
                          title="Edit Employee"
                          className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(emp)}
                          title={emp.status === 'Active' ? 'Deactivate Employee' : 'Activate Employee'}
                          className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                        >
                          {emp.status === 'Active' ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(emp)}
                            title="Delete Employee"
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

      {/* Add / Edit Employee Modal */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {editingEmployee ? 'Edit Employee Profile' : 'Register New Employee'}
              </h3>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unique Employee ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="EMP-001"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Employee Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98..."
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Joining Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Work Category *
                  </label>
                  <input
                    type="text"
                    required
                    list="work-categories-list"
                    value={workCategory}
                    onChange={(e) => setWorkCategory(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <datalist id="work-categories-list">
                    {WORK_CATEGORIES.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Type *
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {PAYMENT_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Per-Piece Labour Rate (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={perPieceRate}
                    onChange={(e) => setPerPieceRate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Residential / Workshop Address
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? 'Saving...' : editingEmployee ? 'Update Employee' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Profile & Stock/Work/Payment Ledger Modal */}
      {liveProfileEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {liveProfileEmployee.name} ·{' '}
                  <span className="font-mono text-sm text-slate-500">
                    {liveProfileEmployee.employeeCode}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {liveProfileEmployee.workCategory} · {liveProfileEmployee.paymentType} ({formatCurrency(liveProfileEmployee.perPieceRate)}/unit) · Joined {liveProfileEmployee.joiningDate} · {liveProfileEmployee.phone || 'No phone'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileTarget(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Section E: Employee-wise Stock Ledger Summary */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Total Stock Received</p>
                <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {formatNumber(liveProfileEmployee.totalStockReceived)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Completed (Acc / Rej)</p>
                <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {formatNumber(liveProfileEmployee.totalAcceptedQty)} /{' '}
                  <span className="text-red-600">{formatNumber(liveProfileEmployee.totalRejectedQty)}</span>
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Unused Returned</p>
                <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {formatNumber(liveProfileEmployee.totalUnusedReturned)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Current Material Bal.</p>
                <p className="mt-1 font-mono text-base font-semibold text-indigo-700 tabular-nums">
                  {formatNumber(liveProfileEmployee.currentMaterialBalance)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Outstanding Payment</p>
                <p className="mt-1 font-mono text-base font-semibold text-amber-700 tabular-nums">
                  {formatCurrency(liveProfileEmployee.outstandingBalance)}
                </p>
                <p className="text-[10px] text-slate-500 tabular-nums">
                  Earned {formatCurrency(liveProfileEmployee.totalApprovedEarnings)} · Paid {formatCurrency(liveProfileEmployee.totalPaid)}
                </p>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="mt-4 flex items-center gap-2 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setProfileTab('tasks')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  profileTab === 'tasks'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Issued Tasks ({profileTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('completions')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  profileTab === 'completions'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Work Completions ({profileCompletions.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('payments')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  profileTab === 'payments'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Payments ({profilePayments.length})
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {profileTab === 'tasks' && (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Issue ID</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Issue / Due</th>
                      <th className="px-3 py-2 text-right">Issued</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                      <th className="px-3 py-2 text-right">Earned</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profileTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-500">
                          No tasks assigned to this employee yet.
                        </td>
                      </tr>
                    ) : (
                      profileTasks.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 font-mono text-slate-900">{t.issueCode}</td>
                          <td className="px-3 py-2">{t.productName}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {t.issueDate} / {t.expectedCompletionDate}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{t.quantityIssued}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-700">{t.pendingQty}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(t.earnedAmount)}</td>
                          <td className="px-3 py-2 font-medium">{t.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {profileTab === 'completions' && (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Completion ID</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Accepted</th>
                      <th className="px-3 py-2 text-right">Rejected</th>
                      <th className="px-3 py-2 text-right">Unused Ret.</th>
                      <th className="px-3 py-2 text-right">Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profileCompletions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-500">
                          No work completions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      profileCompletions.map((wc) => (
                        <tr key={wc.id}>
                          <td className="px-3 py-2 font-mono text-slate-900">{wc.completionCode}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{wc.completionDate}</td>
                          <td className="px-3 py-2">{wc.productName}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">{wc.acceptedQty}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-red-600">{wc.rejectedQty}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{wc.unusedReturnedQty}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{formatCurrency(wc.earnedAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {profileTab === 'payments' && (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Payment ID</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Method / Ref</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Balance After</th>
                      <th className="px-3 py-2 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profilePayments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No payments disbursed to this employee yet.
                        </td>
                      </tr>
                    ) : (
                      profilePayments.map((pay) => (
                        <tr key={pay.id}>
                          <td className="px-3 py-2 font-mono text-slate-900">{pay.paymentCode}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{pay.paymentDate}</td>
                          <td className="px-3 py-2">{pay.paymentType}</td>
                          <td className="px-3 py-2">{pay.paymentMethod} {pay.paymentReference ? `· ${pay.paymentReference}` : ''}</td>
                          <td className="px-3 py-2 font-medium">
                            <span className={pay.isPaymentDone ? 'text-emerald-700' : 'text-amber-700'}>
                              {pay.isPaymentDone ? 'Done' : 'Not Done'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">{formatCurrency(pay.amount)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(pay.remainingBalanceAfter)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => exportPaymentReceiptPDF(pay, settings, liveProfileEmployee)}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <FileDown className="h-3 w-3 text-indigo-600" />
                              <span>PDF</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Employee Record"
        description={`Are you sure you want to permanently remove "${deleteTarget?.name}" (${deleteTarget?.employeeCode})?`}
        confirmLabel="Delete Employee"
        busy={busy}
        onConfirm={handleDeleteEmployee}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
