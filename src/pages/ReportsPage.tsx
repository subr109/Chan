import React, { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { addDaysISO, formatCurrency, formatNumber, formatTimestamp, getTodayISO } from '../lib/formatters';
import { exportPaymentAuditExcel, exportReportToExcel, exportReportToPDF, ReportPayload } from '../lib/exportReports';

type ReportCategory =
  | 'STOCK'
  | 'EMPLOYEE'
  | 'PRODUCTION'
  | 'TASK'
  | 'EMPLOYEE_EARNINGS'
  | 'EMPLOYEE_PAYMENT'
  | 'PENDING_WORK'
  | 'REJECTED_GOODS'
  | 'PRODUCT_PRODUCTION'
  | 'STOCK_MOVEMENT';

type DatePreset = 'weekly' | '15days' | 'monthly' | '6months' | 'yearly' | 'custom';

const REPORT_OPTIONS: Array<{ id: ReportCategory; label: string }> = [
  { id: 'STOCK', label: '1. Stock Report' },
  { id: 'EMPLOYEE', label: '2. Employee Report' },
  { id: 'PRODUCTION', label: '3. Production Report' },
  { id: 'TASK', label: '4. Task Report' },
  { id: 'EMPLOYEE_EARNINGS', label: '5. Employee Earnings Report' },
  { id: 'EMPLOYEE_PAYMENT', label: '6. Employee Payment Report' },
  { id: 'PENDING_WORK', label: '7. Pending Work Report' },
  { id: 'REJECTED_GOODS', label: '8. Rejected Goods Report' },
  { id: 'PRODUCT_PRODUCTION', label: '9. Product-wise Production Report' },
  { id: 'STOCK_MOVEMENT', label: '10. Stock Movement Report' },
];

function getTxDateISO(ts: unknown): string {
  if (!ts) return getTodayISO();
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toISOString().slice(0, 10);
  }
  return getTodayISO();
}

export function ReportsPage() {
  const {
    products,
    subProducts,
    employees,
    tasks,
    workCompletions,
    payments,
    stockTransactions,
    settings,
    showToast,
  } = useErp();

  const today = getTodayISO();
  const [reportType, setReportType] = useState<ReportCategory>('STOCK');
  const [datePreset, setDatePreset] = useState<DatePreset>('monthly');
  const [customStart, setCustomStart] = useState(addDaysISO(today, -30));
  const [customEnd, setCustomEnd] = useState(today);
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');

  const { fromDate, toDate } = useMemo(() => {
    if (datePreset === 'custom') {
      return { fromDate: customStart || '2000-01-01', toDate: customEnd || today };
    }
    const daysMap: Record<Exclude<DatePreset, 'custom'>, number> = {
      weekly: -7,
      '15days': -15,
      monthly: -30,
      '6months': -180,
      yearly: -365,
    };
    return { fromDate: addDaysISO(today, daysMap[datePreset]), toDate: today };
  }, [datePreset, customStart, customEnd, today]);

  const inRange = (dateStr: string) => {
    if (!dateStr) return true;
    return dateStr >= fromDate && dateStr <= toDate;
  };

  const reportPayload: ReportPayload = useMemo(() => {
    const companyName = settings.companyName || 'Chandramukhi Implex Pvt. Ltd.';
    const empLabel =
      employeeFilter === 'ALL'
        ? 'All Employees'
        : employees.find((e) => e.id === employeeFilter)?.name || employeeFilter;
    const prodLabel =
      productFilter === 'ALL'
        ? 'All Products'
        : products.find((p) => p.id === productFilter)?.name || productFilter;
    const dateRangeLabel = `${fromDate} to ${toDate}`;
    const filterLabel = `Employee: ${empLabel} · Product: ${prodLabel}`;

    switch (reportType) {
      case 'STOCK': {
        const list = products.filter((p) => productFilter === 'ALL' || p.id === productFilter);
        const rows = list.map((p) => [
          p.productCode,
          p.name,
          p.category,
          p.unit,
          p.openingStock + p.stockReceived,
          p.stockIssued,
          p.stockReturned,
          p.warehouseStock,
          p.employeeHeldStock,
          p.finishedGoodsStock,
          p.damagedStock,
        ]);
        const totals = list.reduce(
          (a, p) => [
            a[0] + p.openingStock + p.stockReceived,
            a[1] + p.stockIssued,
            a[2] + p.stockReturned,
            a[3] + p.warehouseStock,
            a[4] + p.employeeHeldStock,
            a[5] + p.finishedGoodsStock,
            a[6] + p.damagedStock,
          ],
          [0, 0, 0, 0, 0, 0, 0]
        );
        return {
          title: 'Stock Inventory Report',
          fileSlug: 'stock_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Code', 'Product', 'Category', 'Unit', 'Received', 'Issued', 'Returned', 'Warehouse', 'With Staff', 'Finished', 'Damaged'],
          rows,
          totalsRow: ['TOTAL', `${list.length} SKUs`, '', '', ...totals],
        };
      }

      case 'EMPLOYEE': {
        const list = employees.filter((e) => employeeFilter === 'ALL' || e.id === employeeFilter);
        const rows = list.map((e) => [
          e.employeeCode,
          e.name,
          e.workCategory,
          e.status,
          e.totalStockReceived,
          e.totalAcceptedQty,
          e.totalRejectedQty,
          e.totalUnusedReturned,
          e.currentMaterialBalance,
          formatCurrency(e.totalApprovedEarnings),
          formatCurrency(e.totalPaid),
          formatCurrency(e.outstandingBalance),
        ]);
        const sumRecv = list.reduce((s, e) => s + e.totalStockReceived, 0);
        const sumAcc = list.reduce((s, e) => s + e.totalAcceptedQty, 0);
        const sumRej = list.reduce((s, e) => s + e.totalRejectedQty, 0);
        const sumRet = list.reduce((s, e) => s + e.totalUnusedReturned, 0);
        const sumBal = list.reduce((s, e) => s + e.currentMaterialBalance, 0);
        const sumEarn = list.reduce((s, e) => s + e.totalApprovedEarnings, 0);
        const sumPaid = list.reduce((s, e) => s + e.totalPaid, 0);
        const sumOut = list.reduce((s, e) => s + e.outstandingBalance, 0);
        return {
          title: 'Employee Directory & Stock Balance Report',
          fileSlug: 'employee_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['ID', 'Name', 'Category', 'Status', 'Stock Recv', 'Accepted', 'Rejected', 'Returned', 'Held Bal', 'Earnings', 'Paid', 'Outstanding'],
          rows,
          totalsRow: ['TOTAL', `${list.length} Staff`, '', '', sumRecv, sumAcc, sumRej, sumRet, sumBal, formatCurrency(sumEarn), formatCurrency(sumPaid), formatCurrency(sumOut)],
        };
      }

      case 'PRODUCTION': {
        const list = workCompletions.filter(
          (wc) =>
            inRange(wc.completionDate) &&
            (employeeFilter === 'ALL' || wc.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || wc.productId === productFilter)
        );
        const rows = list.map((wc) => [
          wc.completionCode,
          wc.completionDate,
          wc.issueCode,
          wc.employeeName,
          wc.productName,
          wc.subProductName || '—',
          wc.acceptedQty,
          wc.rejectedQty,
          wc.unusedReturnedQty,
          formatCurrency(wc.earnedAmount),
        ]);
        return {
          title: 'Production Completion Report',
          fileSlug: 'production_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Completion ID', 'Date', 'Issue ID', 'Employee', 'Product', 'Sub-Product', 'Accepted', 'Rejected', 'Unused Ret.', 'Earned'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Entries`,
            '',
            '',
            '',
            '',
            list.reduce((s, w) => s + w.acceptedQty, 0),
            list.reduce((s, w) => s + w.rejectedQty, 0),
            list.reduce((s, w) => s + w.unusedReturnedQty, 0),
            formatCurrency(list.reduce((s, w) => s + w.earnedAmount, 0)),
          ],
        };
      }

      case 'TASK': {
        const list = tasks.filter(
          (t) =>
            inRange(t.issueDate) &&
            (employeeFilter === 'ALL' || t.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || t.productId === productFilter)
        );
        const rows = list.map((t) => [
          t.issueCode,
          t.issueDate,
          t.expectedCompletionDate,
          t.employeeName,
          t.productName,
          t.subProductName || '—',
          t.quantityIssued,
          t.completedAcceptedQty,
          t.completedRejectedQty,
          t.returnedUnusedQty,
          t.pendingQty,
          formatCurrency(t.earnedAmount),
          t.status,
        ]);
        return {
          title: 'Task & Stock Issue Report',
          fileSlug: 'task_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Issue ID', 'Issue Date', 'Due Date', 'Employee', 'Product', 'Sub-Product', 'Issued', 'Accepted', 'Rejected', 'Returned', 'Pending', 'Earned', 'Status'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Tasks`,
            '',
            '',
            '',
            '',
            list.reduce((s, t) => s + t.quantityIssued, 0),
            list.reduce((s, t) => s + t.completedAcceptedQty, 0),
            list.reduce((s, t) => s + t.completedRejectedQty, 0),
            list.reduce((s, t) => s + t.returnedUnusedQty, 0),
            list.reduce((s, t) => s + t.pendingQty, 0),
            formatCurrency(list.reduce((s, t) => s + t.earnedAmount, 0)),
            '',
          ],
        };
      }

      case 'EMPLOYEE_EARNINGS': {
        const filteredCompletions = workCompletions.filter(
          (wc) =>
            inRange(wc.completionDate) &&
            (employeeFilter === 'ALL' || wc.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || wc.productId === productFilter)
        );
        const byEmp = new Map<string, { code: string; name: string; acc: number; rej: number; rejApproved: number; earned: number }>();
        employees
          .filter((e) => employeeFilter === 'ALL' || e.id === employeeFilter)
          .forEach((e) => {
            byEmp.set(e.id, { code: e.employeeCode, name: e.name, acc: 0, rej: 0, rejApproved: 0, earned: 0 });
          });

        filteredCompletions.forEach((wc) => {
          const cur = byEmp.get(wc.employeeId) || {
            code: '-',
            name: wc.employeeName,
            acc: 0,
            rej: 0,
            rejApproved: 0,
            earned: 0,
          };
          cur.acc += wc.acceptedQty;
          cur.rej += wc.rejectedQty;
          if (wc.rejectedApprovedForPay) cur.rejApproved += wc.rejectedQty;
          cur.earned += wc.earnedAmount;
          byEmp.set(wc.employeeId, cur);
        });

        const entries = Array.from(byEmp.values());
        const rows = entries.map((e) => [e.code, e.name, e.acc, e.rej, e.rejApproved, formatCurrency(e.earned)]);
        return {
          title: 'Employee Earnings Report (Period Based)',
          fileSlug: 'employee_earnings_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Emp ID', 'Employee Name', 'Accepted Qty', 'Rejected Qty', 'Approved Rej. Qty', 'Approved Earnings'],
          rows,
          totalsRow: [
            'TOTAL',
            `${entries.length} Employees`,
            entries.reduce((s, e) => s + e.acc, 0),
            entries.reduce((s, e) => s + e.rej, 0),
            entries.reduce((s, e) => s + e.rejApproved, 0),
            formatCurrency(entries.reduce((s, e) => s + e.earned, 0)),
          ],
        };
      }

      case 'EMPLOYEE_PAYMENT': {
        const list = payments.filter(
          (p) => inRange(p.paymentDate) && (employeeFilter === 'ALL' || p.employeeId === employeeFilter)
        );
        const rows = list.map((p) => [
          p.paymentCode,
          p.paymentDate,
          p.employeeCode,
          p.employeeName,
          p.paymentType,
          p.paymentMethod,
          p.paymentReference || '—',
          formatCurrency(p.amount),
          formatCurrency(p.remainingBalanceAfter),
          p.isPaymentDone ? 'Done' : 'Not Done',
        ]);
        return {
          title: 'Employee Payment Disbursement Report',
          fileSlug: 'employee_payment_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Payment ID', 'Date', 'Emp ID', 'Employee', 'Type', 'Method', 'Reference', 'Amount Paid', 'Balance After', 'Status'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Payments`,
            '',
            '',
            '',
            '',
            '',
            formatCurrency(list.reduce((s, p) => s + p.amount, 0)),
            '',
            `Done: ${list.filter((p) => Boolean(p.isPaymentDone)).length}`,
          ],
        };
      }

      case 'PENDING_WORK': {
        const list = tasks.filter(
          (t) =>
            t.pendingQty > 0 &&
            inRange(t.issueDate) &&
            (employeeFilter === 'ALL' || t.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || t.productId === productFilter)
        );
        const rows = list.map((t) => [
          t.issueCode,
          t.employeeName,
          t.productName,
          t.subProductName || '—',
          t.issueDate,
          t.expectedCompletionDate,
          t.quantityIssued,
          t.completedAcceptedQty + t.completedRejectedQty,
          t.returnedUnusedQty,
          t.pendingQty,
          t.status,
        ]);
        return {
          title: 'Pending Work & Overdue Tasks Report',
          fileSlug: 'pending_work_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Issue ID', 'Employee', 'Product', 'Sub-Product', 'Issue Date', 'Due Date', 'Issued', 'Completed', 'Returned', 'Pending Qty', 'Status'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Open Tasks`,
            '',
            '',
            '',
            '',
            list.reduce((s, t) => s + t.quantityIssued, 0),
            list.reduce((s, t) => s + t.completedAcceptedQty + t.completedRejectedQty, 0),
            list.reduce((s, t) => s + t.returnedUnusedQty, 0),
            list.reduce((s, t) => s + t.pendingQty, 0),
            '',
          ],
        };
      }

      case 'REJECTED_GOODS': {
        const list = workCompletions.filter(
          (wc) =>
            wc.rejectedQty > 0 &&
            inRange(wc.completionDate) &&
            (employeeFilter === 'ALL' || wc.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || wc.productId === productFilter)
        );
        const rows = list.map((wc) => [
          wc.completionCode,
          wc.completionDate,
          wc.issueCode,
          wc.employeeName,
          wc.productName,
          wc.subProductName || '—',
          wc.rejectedQty,
          wc.rejectedApprovedForPay ? 'Approved' : 'Unpaid',
          wc.remarks || '—',
        ]);
        return {
          title: 'Rejected & Defective Goods Report',
          fileSlug: 'rejected_goods_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Completion ID', 'Date', 'Issue ID', 'Employee', 'Product', 'Sub-Product', 'Rejected Qty', 'Pay Status', 'Remarks'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Incidents`,
            '',
            '',
            '',
            '',
            list.reduce((s, w) => s + w.rejectedQty, 0),
            '',
            '',
          ],
        };
      }

      case 'PRODUCT_PRODUCTION': {
        const filteredTasks = tasks.filter(
          (t) =>
            inRange(t.issueDate) &&
            (employeeFilter === 'ALL' || t.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || t.productId === productFilter)
        );
        const byKey = new Map<
          string,
          { code: string; mainName: string; subName: string; issued: number; acc: number; rej: number; ret: number; pending: number; earned: number }
        >();
        subProducts
          .filter((sp) => productFilter === 'ALL' || sp.parentProductId === productFilter)
          .forEach((sp) => {
            byKey.set(`${sp.parentProductId}__${sp.id}`, {
              code: sp.subProductCode,
              mainName: sp.parentProductName,
              subName: sp.name,
              issued: 0,
              acc: 0,
              rej: 0,
              ret: 0,
              pending: 0,
              earned: 0,
            });
          });
        products
          .filter((p) => productFilter === 'ALL' || p.id === productFilter)
          .forEach((p) => {
            const hasSubs = subProducts.some((sp) => sp.parentProductId === p.id);
            if (!hasSubs) {
              byKey.set(`${p.id}__MAIN`, {
                code: p.productCode,
                mainName: p.name,
                subName: '—',
                issued: 0,
                acc: 0,
                rej: 0,
                ret: 0,
                pending: 0,
                earned: 0,
              });
            }
          });

        filteredTasks.forEach((t) => {
          const mapKey = `${t.productId}__${t.subProductId || 'MAIN'}`;
          const cur = byKey.get(mapKey) || {
            code: t.subProductCode || t.productCode,
            mainName: t.productName,
            subName: t.subProductName || 'Main Product Only',
            issued: 0,
            acc: 0,
            rej: 0,
            ret: 0,
            pending: 0,
            earned: 0,
          };
          cur.issued += t.quantityIssued;
          cur.acc += t.completedAcceptedQty;
          cur.rej += t.completedRejectedQty;
          cur.ret += t.returnedUnusedQty;
          cur.pending += t.pendingQty;
          cur.earned += t.earnedAmount;
          byKey.set(mapKey, cur);
        });

        const list = Array.from(byKey.values());
        const rows = list.map((p) => [p.code, p.mainName, p.subName, p.issued, p.acc, p.rej, p.ret, p.pending, formatCurrency(p.earned)]);
        return {
          title: 'Product & Sub-Product Production Summary Report',
          fileSlug: 'product_wise_production_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Code', 'Main Product', 'Sub-Product', 'Issued', 'Accepted', 'Rejected', 'Unused Ret.', 'Pending', 'Labour Cost'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Items`,
            '',
            list.reduce((s, p) => s + p.issued, 0),
            list.reduce((s, p) => s + p.acc, 0),
            list.reduce((s, p) => s + p.rej, 0),
            list.reduce((s, p) => s + p.ret, 0),
            list.reduce((s, p) => s + p.pending, 0),
            formatCurrency(list.reduce((s, p) => s + p.earned, 0)),
          ],
        };
      }

      case 'STOCK_MOVEMENT': {
        const list = stockTransactions.filter((tx) => {
          const d = getTxDateISO(tx.createdAt);
          return (
            inRange(d) &&
            (employeeFilter === 'ALL' || tx.employeeId === employeeFilter) &&
            (productFilter === 'ALL' || tx.productId === productFilter)
          );
        });
        const rows = list.map((tx) => [
          tx.transactionCode,
          formatTimestamp(tx.createdAt),
          tx.type.replace(/_/g, ' '),
          tx.productCode,
          tx.productName,
          tx.quantity,
          tx.warehouseDelta,
          tx.newWarehouseStock,
          tx.employeeName || '—',
          tx.referenceId || '—',
        ]);
        return {
          title: 'Stock Movement Audit Report',
          fileSlug: 'stock_movement_report',
          companyName,
          dateRangeLabel,
          filterLabel,
          headers: ['Tx ID', 'Timestamp', 'Movement Type', 'Code', 'Product', 'Qty', 'Wh. Delta', 'New Wh.', 'Employee', 'Ref ID'],
          rows,
          totalsRow: [
            'TOTAL',
            `${list.length} Transactions`,
            '',
            '',
            '',
            list.reduce((s, tx) => s + tx.quantity, 0),
            list.reduce((s, tx) => s + tx.warehouseDelta, 0),
            '',
            '',
            '',
          ],
        };
      }
    }
  }, [
    reportType,
    products,
    subProducts,
    employees,
    tasks,
    workCompletions,
    payments,
    stockTransactions,
    employeeFilter,
    productFilter,
    fromDate,
    toDate,
    settings.companyName,
  ]);

  const handleDownloadPDF = () => {
    try {
      exportReportToPDF(reportPayload);
      showToast('success', `Downloaded ${reportPayload.title} (PDF).`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'PDF export failed.');
    }
  };

  const handleDownloadExcel = () => {
    try {
      exportReportToExcel(reportPayload);
      showToast('success', `Downloaded ${reportPayload.title} (Excel).`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Excel export failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Download Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Manufacturing Reports &amp; Exports</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live database reports with automatic totals, date ranges, and PDF / Excel downloads.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileDown className="h-4 w-4 text-red-600" />
            <span>Download PDF</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Download Excel</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Report Category (10 Available)
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportCategory)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              {REPORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Filter by Employee
            </label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Filter by Product
            </label>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.productCode})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Range Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'weekly', label: 'Weekly (7d)' },
                { id: '15days', label: '15 Days' },
                { id: 'monthly', label: 'Monthly (30d)' },
                { id: '6months', label: '6 Months' },
                { id: 'yearly', label: 'Yearly' },
                { id: 'custom', label: 'Custom Range' },
              ] as Array<{ id: DatePreset; label: string }>
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDatePreset(preset.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  datePreset === preset.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {datePreset === 'custom' ? (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
              />
            </div>
          ) : (
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {fromDate} → {toDate}
            </span>
          )}
        </div>

        {/* Dedicated 7/15/30-Day Payment Audit Excel Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-700">
            Payment Audit Excel Packages:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {([7, 15, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  const scoped =
                    employeeFilter === 'ALL'
                      ? payments
                      : payments.filter((p) => p.employeeId === employeeFilter);
                  exportPaymentAuditExcel(
                    scoped,
                    days,
                    settings.companyName || 'Chandramukhi Implex Pvt. Ltd.'
                  );
                  showToast('success', `Downloaded ${days}-Day Payment Audit Excel.`);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                <span>{days} Days Audit Excel</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const scoped =
                  employeeFilter === 'ALL'
                    ? payments
                    : payments.filter((p) => p.employeeId === employeeFilter);
                exportPaymentAuditExcel(
                  scoped,
                  'COMBINED',
                  settings.companyName || 'Chandramukhi Implex Pvt. Ltd.'
                );
                showToast('success', 'Downloaded Combined 7 / 15 / 30 Days Audit Excel.');
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Combined 7/15/30d Audit Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{reportPayload.title}</h3>
            <p className="text-xs text-slate-500">
              {reportPayload.filterLabel} · {reportPayload.dateRangeLabel}
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {reportPayload.rows.length} rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-white text-slate-600">
              <tr>
                {reportPayload.headers.map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportPayload.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={reportPayload.headers.length}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    No saved records match this report filter and date range.
                  </td>
                </tr>
              ) : (
                reportPayload.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-2.5 whitespace-nowrap ${
                          typeof cell === 'number' || String(cell).startsWith('₹')
                            ? 'font-mono tabular-nums text-slate-900'
                            : 'text-slate-700'
                        }`}
                      >
                        {typeof cell === 'number' ? formatNumber(cell) : cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {reportPayload.totalsRow && reportPayload.rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <tr>
                  {reportPayload.totalsRow.map((cell, idx) => (
                    <td key={idx} className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                      {typeof cell === 'number' ? formatNumber(cell) : cell}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
