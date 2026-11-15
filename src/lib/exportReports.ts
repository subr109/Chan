import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CompanySettings, Employee, Payment } from '../types/erp';
import { addDaysISO, getTodayISO } from './formatters';

export interface ReportPayload {
  title: string;
  fileSlug: string;
  companyName: string;
  dateRangeLabel: string;
  filterLabel: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  totalsRow?: Array<string | number>;
}

export function exportReportToExcel(payload: ReportPayload): void {
  const sheetData: Array<Array<string | number>> = [
    [payload.companyName],
    [payload.title],
    [`Period: ${payload.dateRangeLabel}`, `Filters: ${payload.filterLabel}`],
    [`Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
    payload.headers,
    ...payload.rows,
  ];

  if (payload.totalsRow) {
    sheetData.push(payload.totalsRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const colWidths = payload.headers.map((h, idx) => {
    const maxLen = Math.max(
      h.length,
      ...payload.rows.map((r) => String(r[idx] ?? '').length),
      payload.totalsRow ? String(payload.totalsRow[idx] ?? '').length : 0
    );
    return { wch: Math.min(Math.max(maxLen + 3, 12), 36) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, payload.fileSlug.slice(0, 30));
  XLSX.writeFile(wb, `${payload.fileSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportReportToPDF(payload: ReportPayload): void {
  const orientation = payload.headers.length > 7 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 64, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(payload.companyName, 32, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(payload.title, 32, 44);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - 32, 26, { align: 'right' });
  doc.text(`Period: ${payload.dateRangeLabel}`, pageWidth - 32, 44, { align: 'right' });

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(`Applied Filters: ${payload.filterLabel}`, 32, 84);

  const bodyRows = payload.rows.map((row) =>
    row.map((cell) => (typeof cell === 'string' ? cell.replace(/₹/g, 'Rs. ') : cell))
  );

  const footRows = payload.totalsRow
    ? [
        payload.totalsRow.map((cell) =>
          typeof cell === 'string' ? cell.replace(/₹/g, 'Rs. ') : cell
        ),
      ]
    : undefined;

  autoTable(doc, {
    startY: 96,
    head: [payload.headers],
    body: bodyRows,
    foot: footRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 32, right: 32 },
  });

  doc.save(`${payload.fileSlug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function formatRs(val: number): string {
  const safe = Number.isFinite(val) ? val : 0;
  return `Rs. ${safe.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function exportPaymentReceiptPDF(
  payment: Payment,
  settings: CompanySettings,
  employee?: Employee
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const companyName = settings.companyName || 'Chandramukhi Implex Pvt. Ltd.';
  const isDone = Boolean(payment.isPaymentDone);

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 84, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName, 36, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  const subParts = [settings.address, settings.phone, settings.gstin ? `GSTIN: ${settings.gstin}` : '']
    .filter(Boolean)
    .join('  |  ');
  doc.text(subParts || 'Garments Manufacturing & Apparel Production', 36, 48);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('PAYMENT RECEIPT', pageWidth - 36, 30, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Receipt No: ${payment.paymentCode}`, pageWidth - 36, 48, { align: 'right' });
  doc.text(`Date: ${payment.paymentDate}`, pageWidth - 36, 64, { align: 'right' });

  // Recipient & Status Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(36, 104, pageWidth - 72, 78, 4, 4, 'FD');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8.5);
  doc.text('PAID TO (EMPLOYEE)', 50, 122);
  doc.text('PAYMENT STATUS', pageWidth - 50, 122, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`${payment.employeeName} (${payment.employeeCode})`, 50, 140);

  doc.setTextColor(isDone ? 22 : 180, isDone ? 163 : 83, isDone ? 74 : 9);
  doc.text(isDone ? 'PAYMENT DONE' : 'PENDING / NOT DONE', pageWidth - 50, 140, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const empMeta = employee
    ? `${employee.workCategory}  |  Phone: ${employee.phone || 'N/A'}  |  ${employee.paymentType}`
    : 'Factory Workforce Ledger';
  doc.text(empMeta, 50, 160);
  doc.text(`Method: ${payment.paymentMethod}`, pageWidth - 50, 160, { align: 'right' });

  // Details Table
  autoTable(doc, {
    startY: 200,
    head: [['Description', 'Details']],
    body: [
      ['Payment Voucher / ID', payment.paymentCode],
      ['Payment Date', payment.paymentDate],
      ['Payment Category', payment.paymentType],
      ['Payment Mode', payment.paymentMethod],
      ['Reference / UTR / Voucher No.', payment.paymentReference || 'N/A'],
      ['Previous Payable Balance', formatRs(payment.previousBalance)],
      ['Amount Paid', formatRs(payment.amount)],
      ['Remaining Balance After Payment', formatRs(payment.remainingBalanceAfter)],
      ['Payment Status', isDone ? 'Done (Confirmed)' : 'Not Done (Pending)'],
      ['Remarks / Notes', payment.notes || '—'],
    ],
    theme: 'grid',
    styles: {
      fontSize: 9.5,
      cellPadding: 8,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 210, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 36, right: 36 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 520;

  // Signature lines
  const sigY = Math.min(finalY + 75, 740);
  doc.setDrawColor(148, 163, 184);
  doc.line(36, sigY, 210, sigY);
  doc.line(pageWidth - 210, sigY, pageWidth - 36, sigY);

  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Receiver Signature (Employee)', 36, sigY + 14);
  doc.text(`Authorized Signatory (${companyName})`, pageWidth - 36, sigY + 14, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated on ${new Date().toLocaleString('en-IN')} · Chandramukhi Implex Pvt. Ltd. ERP`,
    36,
    sigY + 42
  );

  doc.save(`Receipt_${payment.paymentCode}_${payment.employeeCode}.pdf`);
}

function buildAuditSheet(
  payments: Payment[],
  days: 7 | 15 | 30,
  companyName: string
): { ws: XLSX.WorkSheet; count: number; totalAmount: number; doneCount: number; doneAmount: number; pendingCount: number; pendingAmount: number } {
  const today = getTodayISO();
  const fromDate = addDaysISO(today, -days);
  const filtered = payments
    .filter((p) => p.paymentDate >= fromDate && p.paymentDate <= today)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const headers = [
    'Payment ID',
    'Payment Date',
    'Employee ID',
    'Employee Name',
    'Payment Type',
    'Method',
    'Reference / UTR',
    'Previous Balance (INR)',
    'Amount Paid (INR)',
    'Balance After (INR)',
    'Payment Done Status',
    'Notes',
  ];

  const rows = filtered.map((p) => [
    p.paymentCode,
    p.paymentDate,
    p.employeeCode,
    p.employeeName,
    p.paymentType,
    p.paymentMethod,
    p.paymentReference || '—',
    p.previousBalance,
    p.amount,
    p.remainingBalanceAfter,
    p.isPaymentDone ? 'Done' : 'Not Done',
    p.notes || '—',
  ]);

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0);
  const doneList = filtered.filter((p) => Boolean(p.isPaymentDone));
  const pendingList = filtered.filter((p) => !p.isPaymentDone);
  const doneAmount = doneList.reduce((s, p) => s + p.amount, 0);
  const pendingAmount = pendingList.reduce((s, p) => s + p.amount, 0);

  const sheetData: Array<Array<string | number>> = [
    [companyName],
    [`Payment Audit Report — Last ${days} Days (${fromDate} to ${today})`],
    [`Generated: ${new Date().toLocaleString('en-IN')}`, `Total Records: ${filtered.length}`, `Done: ${doneList.length}`, `Not Done: ${pendingList.length}`],
    [],
    headers,
    ...rows,
    [],
    ['TOTAL (ALL)', `${filtered.length} Entries`, '', '', '', '', '', '', totalAmount, '', '', ''],
    ['TOTAL (DONE)', `${doneList.length} Done`, '', '', '', '', '', '', doneAmount, '', 'Done', ''],
    ['TOTAL (NOT DONE)', `${pendingList.length} Pending`, '', '', '', '', '', '', pendingAmount, '', 'Not Done', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = headers.map((h, idx) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[idx] ?? '').length));
    return { wch: Math.min(Math.max(maxLen + 3, 14), 34) };
  });

  return {
    ws,
    count: filtered.length,
    totalAmount,
    doneCount: doneList.length,
    doneAmount,
    pendingCount: pendingList.length,
    pendingAmount,
  };
}

export function exportPaymentAuditExcel(
  payments: Payment[],
  mode: 7 | 15 | 30 | 'COMBINED',
  companyName: string
): void {
  const wb = XLSX.utils.book_new();
  const today = getTodayISO();

  if (mode === 'COMBINED') {
    const s7 = buildAuditSheet(payments, 7, companyName);
    const s15 = buildAuditSheet(payments, 15, companyName);
    const s30 = buildAuditSheet(payments, 30, companyName);

    const summaryData: Array<Array<string | number>> = [
      [companyName],
      ['Combined Payment Audit Summary (7 Days / 15 Days / 30 Days)'],
      [`Generated: ${new Date().toLocaleString('en-IN')}`, `As of Date: ${today}`],
      [],
      ['Audit Window', 'Total Entries', 'Total Disbursed (INR)', 'Done Entries', 'Done Amount (INR)', 'Not Done Entries', 'Not Done Amount (INR)'],
      ['Last 7 Days', s7.count, s7.totalAmount, s7.doneCount, s7.doneAmount, s7.pendingCount, s7.pendingAmount],
      ['Last 15 Days', s15.count, s15.totalAmount, s15.doneCount, s15.doneAmount, s15.pendingCount, s15.pendingAmount],
      ['Last 30 Days', s30.count, s30.totalAmount, s30.doneCount, s30.doneAmount, s30.pendingCount, s30.pendingAmount],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 15 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit Summary');
    XLSX.utils.book_append_sheet(wb, s7.ws, '7 Days Payments');
    XLSX.utils.book_append_sheet(wb, s15.ws, '15 Days Payments');
    XLSX.utils.book_append_sheet(wb, s30.ws, '30 Days Payments');
    XLSX.writeFile(wb, `payment_audit_7_15_30_days_${today}.xlsx`);
    return;
  }

  const sheet = buildAuditSheet(payments, mode, companyName);
  XLSX.utils.book_append_sheet(wb, sheet.ws, `${mode} Days Audit`);
  XLSX.writeFile(wb, `payment_audit_${mode}_days_${today}.xlsx`);
}

