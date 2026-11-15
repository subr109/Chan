import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, X, FileDown, FileSpreadsheet } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { deletePayment, recordPayment, togglePaymentDone } from '../services/erpService';
import { addDaysISO, formatCurrency, formatNumber, getTodayISO } from '../lib/formatters';
import { exportPaymentAuditExcel, exportPaymentReceiptPDF } from '../lib/exportReports';
import { LedgerPaymentType, Payment, PaymentMethod } from '../types/erp';
import { ConfirmModal } from '../components/ConfirmModal';

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Bank Transfer', 'UPI', 'Cheque'];
const LEDGER_TYPES: LedgerPaymentType[] = ['Regular Payment', 'Advance Payment', 'Settlement'];

export function PaymentLedgerPage() {
  const { employees, payments, settings, isAdmin, showToast, dataLoading } = useErp();

  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 7 | 15 | 30>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DONE' | 'NOT_DONE'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Payment form state
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<LedgerPaymentType>('Regular Payment');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isPaymentDone, setIsPaymentDone] = useState(true);

  const summary = useMemo(() => {
    const totalEarnings = employees.reduce((s, e) => s + e.totalApprovedEarnings, 0);
    const totalPaid = employees.reduce((s, e) => s + e.totalPaid, 0);
    const totalOutstanding = employees.reduce((s, e) => s + e.outstandingBalance, 0);
    const totalAdvances = payments
      .filter((p) => p.paymentType === 'Advance Payment')
      .reduce((s, p) => s + p.amount, 0);
    return { totalEarnings, totalPaid, totalOutstanding, totalAdvances };
  }, [employees, payments]);

  const employeeLedgerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => {
        if (employeeFilter !== 'ALL' && e.id !== employeeFilter) return false;
        if (!q) return true;
        return e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q);
      })
      .map((e) => {
        const empPayments = payments.filter((p) => p.employeeId === e.id);
        const advancePaid = empPayments
          .filter((p) => p.paymentType === 'Advance Payment')
          .reduce((s, p) => s + p.amount, 0);
        const regularPaid = empPayments
          .filter((p) => p.paymentType !== 'Advance Payment')
          .reduce((s, p) => s + p.amount, 0);
        return {
          employee: e,
          advancePaid,
          regularPaid,
        };
      });
  }, [employees, payments, search, employeeFilter]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = getTodayISO();
    const minDate = periodFilter === 'ALL' ? '' : addDaysISO(today, -periodFilter);

    return payments.filter((p) => {
      if (employeeFilter !== 'ALL' && p.employeeId !== employeeFilter) return false;
      if (periodFilter !== 'ALL' && (p.paymentDate < minDate || p.paymentDate > today)) return false;
      const done = Boolean(p.isPaymentDone);
      if (statusFilter === 'DONE' && !done) return false;
      if (statusFilter === 'NOT_DONE' && done) return false;
      if (!q) return true;
      return (
        p.paymentCode.toLowerCase().includes(q) ||
        p.employeeName.toLowerCase().includes(q) ||
        p.employeeCode.toLowerCase().includes(q) ||
        p.paymentReference.toLowerCase().includes(q)
      );
    });
  }, [payments, search, employeeFilter, periodFilter, statusFilter]);

  const openPaymentModal = (empId?: string) => {
    const targetId = empId || employees[0]?.id || '';
    const emp = employees.find((e) => e.id === targetId);
    setSelectedEmpId(targetId);
    setAmount(emp && emp.outstandingBalance > 0 ? String(emp.outstandingBalance) : '');
    setPaymentType('Regular Payment');
    setPaymentDate(getTodayISO());
    setPaymentMethod('Cash');
    setPaymentReference('');
    setNotes('');
    setIsPaymentDone(true);
    setModalOpen(true);
  };

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmpId) || null,
    [employees, selectedEmpId]
  );

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await recordPayment({
        employeeId: selectedEmpId,
        amount: Number(amount),
        paymentType,
        paymentDate,
        paymentMethod,
        paymentReference,
        notes,
        isPaymentDone,
      });
      showToast('success', `Recorded ${formatCurrency(Number(amount))} payment successfully.`);
      setModalOpen(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDone = async (pay: Payment) => {
    const nextVal = !Boolean(pay.isPaymentDone);
    setTogglingId(pay.id);
    try {
      await togglePaymentDone(pay.id, nextVal);
      showToast(
        'info',
        `${pay.paymentCode} marked as ${nextVal ? 'Payment Done' : 'Not Done'}.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update payment status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDownloadReceipt = (pay: Payment) => {
    try {
      const emp = employees.find((e) => e.id === pay.employeeId);
      exportPaymentReceiptPDF(pay, settings, emp);
      showToast('success', `Downloaded PDF receipt for ${pay.paymentCode}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to generate receipt.');
    }
  };

  const handleAuditExcel = (mode: 7 | 15 | 30 | 'COMBINED') => {
    try {
      const scoped =
        employeeFilter === 'ALL'
          ? payments
          : payments.filter((p) => p.employeeId === employeeFilter);
      exportPaymentAuditExcel(
        scoped,
        mode,
        settings.companyName || 'Chandramukhi Implex Pvt. Ltd.'
      );
      showToast(
        'success',
        mode === 'COMBINED'
          ? 'Downloaded Combined 7 / 15 / 30 Days Audit Excel.'
          : `Downloaded ${mode}-Day Payment Audit Excel.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Audit Excel export failed.');
    }
  };

  const handleDeletePayment = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deletePayment(
        deleteTarget.id,
        deleteTarget.employeeId,
        deleteTarget.amount,
        deleteTarget.paymentCode
      );
      showToast('success', `Deleted payment ${deleteTarget.paymentCode} and restored balance.`);
      setDeleteTarget(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Employee Payment Ledger</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Formula: Outstanding Balance = Total Approved Earnings - Total Payments (supports partial &amp; advance payments)
          </p>
        </div>
        <button
          type="button"
          onClick={() => openPaymentModal()}
          disabled={employees.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Approved Earnings</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatCurrency(summary.totalEarnings)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Payments Disbursed</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
            {formatCurrency(summary.totalPaid)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Advance Payments</p>
          <p className="mt-1 font-mono text-xl font-semibold text-indigo-700 tabular-nums">
            {formatCurrency(summary.totalAdvances)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Remaining Payable Balance</p>
          <p className="mt-1 font-mono text-xl font-semibold text-amber-700 tabular-nums">
            {formatCurrency(summary.totalOutstanding)}
          </p>
        </div>
      </div>

      {/* Audit Excel Export Strip (7 Days, 15 Days, 30 Days) */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Payment Audit Excel Exports</h3>
          <p className="text-xs text-slate-500">
            Download audited payment sheets for 7, 15, or 30 days including Payment Done verification status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAuditExcel(7)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>7 Days Excel</span>
          </button>
          <button
            type="button"
            onClick={() => handleAuditExcel(15)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>15 Days Excel</span>
          </button>
          <button
            type="button"
            onClick={() => handleAuditExcel(30)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
            <span>30 Days Excel</span>
          </button>
          <button
            type="button"
            onClick={() => handleAuditExcel('COMBINED')}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Combined 7/15/30d Audit</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name, ID, payment code, or ref..."
            className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
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

          <select
            value={periodFilter}
            onChange={(e) => {
              const val = e.target.value;
              setPeriodFilter(val === 'ALL' ? 'ALL' : (Number(val) as 7 | 15 | 30));
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Dates</option>
            <option value="7">Last 7 Days</option>
            <option value="15">Last 15 Days</option>
            <option value="30">Last 30 Days</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'DONE' | 'NOT_DONE')}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DONE">Done Only</option>
            <option value="NOT_DONE">Not Done Only</option>
          </select>
        </div>
      </div>

      {/* Employee-wise Payables Summary */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Employee Payable Balances</h3>
        </div>
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading ledger...</div>
        ) : employeeLedgerRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-white text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3 text-right">Accepted Work</th>
                  <th className="px-4 py-3 text-right">Total Earnings</th>
                  <th className="px-4 py-3 text-right">Advances</th>
                  <th className="px-4 py-3 text-right">Previous Payments</th>
                  <th className="px-4 py-3 text-right">Remaining Payable</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeLedgerRows.map(({ employee: e, advancePaid, regularPaid }) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{e.name}</p>
                      <p className="font-mono text-xs text-slate-500">{e.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {formatNumber(e.totalAcceptedQty)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(e.totalApprovedEarnings)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-indigo-700">
                      {formatCurrency(advancePaid)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {formatCurrency(regularPaid)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                        e.outstandingBalance > 0
                          ? 'text-amber-700'
                          : e.outstandingBalance < 0
                            ? 'text-indigo-700'
                            : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(e.outstandingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openPaymentModal(e.id)}
                        className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
                      >
                        Pay / Advance
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Transaction History */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Payment Transaction History ({filteredPayments.length})
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            Done: {filteredPayments.filter((p) => Boolean(p.isPaymentDone)).length} · Not Done:{' '}
            {filteredPayments.filter((p) => !p.isPaymentDone).length}
          </span>
        </div>
        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No payment disbursements match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-white text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-3">Payment ID</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Method &amp; Ref</th>
                  <th className="px-4 py-3 text-right">Amount Paid</th>
                  <th className="px-4 py-3 text-right">Balance After</th>
                  <th className="px-4 py-3">Payment Done</th>
                  <th className="px-4 py-3 text-right">Receipt &amp; Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((pay) => {
                  const done = Boolean(pay.isPaymentDone);
                  return (
                    <tr key={pay.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                        {pay.paymentCode}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {pay.paymentDate}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{pay.employeeName}</p>
                        <p className="font-mono text-xs text-slate-500">{pay.employeeCode}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{pay.paymentType}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">{pay.paymentMethod}</p>
                        <p className="font-mono text-slate-500">{pay.paymentReference || 'No ref'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatCurrency(pay.amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatCurrency(pay.remainingBalanceAfter)}
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 select-none">
                          <input
                            type="checkbox"
                            checked={done}
                            disabled={togglingId === pay.id}
                            onChange={() => handleToggleDone(pay)}
                            aria-label={`Mark payment ${pay.paymentCode} as done`}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span
                            className={`text-xs font-medium ${
                              done ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {done ? 'Done' : 'Not Done'}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(pay)}
                            title="Download Payment Receipt (PDF)"
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <FileDown className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Receipt</span>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(pay)}
                              title="Delete Payment Entry"
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

      {/* Record Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Record Employee Payment</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Select Employee *
                </label>
                <select
                  required
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employeeCode}) — Bal: {formatCurrency(e.outstandingBalance)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEmployee && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Approved Earnings:</span>
                    <span className="font-mono font-medium">{formatCurrency(selectedEmployee.totalApprovedEarnings)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Already Paid:</span>
                    <span className="font-mono font-medium">{formatCurrency(selectedEmployee.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1">
                    <span className="font-semibold text-slate-800">Current Payable Balance:</span>
                    <span className="font-mono font-semibold text-amber-700">
                      {formatCurrency(selectedEmployee.outstandingBalance)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount Paid (₹) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Type *
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as LedgerPaymentType)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {LEDGER_TYPES.map((lt) => (
                      <option key={lt} value={lt}>
                        {lt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Reference / UTR / Voucher No.
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. UPI-9928172 or Cash Voucher #12"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional payment remarks..."
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 select-none">
                <input
                  type="checkbox"
                  checked={isPaymentDone}
                  onChange={(e) => setIsPaymentDone(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Payment Done (Disbursed &amp; Confirmed)</span>
              </label>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Reverse & Delete Payment"
        description={`Delete payment ${deleteTarget?.paymentCode} (${formatCurrency(deleteTarget?.amount || 0)}) for ${deleteTarget?.employeeName}? This will restore the amount to their outstanding payable balance.`}
        confirmLabel="Delete Payment"
        busy={busy}
        onConfirm={handleDeletePayment}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
