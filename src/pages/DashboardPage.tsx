import React, { useMemo } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatCurrency, formatNumber, formatTimestamp } from '../lib/formatters';
import { ProductionCharts } from '../components/ProductionCharts';
import { NavSection } from '../types/erp';

interface DashboardPageProps {
  onNavigate: (section: NavSection) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const {
    dataLoading,
    products,
    employees,
    tasks,
    workCompletions,
    payments,
    stockTransactions,
    settings,
  } = useErp();

  const metrics = useMemo(() => {
    const totalProducts = products.length;
    const activeEmployees = employees.filter((e) => e.status === 'Active').length;
    const totalEmployees = employees.length;

    const warehouseStock = products.reduce((s, p) => s + p.warehouseStock, 0);
    const employeeHeldStock = products.reduce((s, p) => s + p.employeeHeldStock, 0);
    const finishedGoodsStock = products.reduce((s, p) => s + p.finishedGoodsStock, 0);
    const rejectedProducts = products.reduce((s, p) => s + p.damagedStock, 0);

    const totalWorkCompleted = workCompletions.reduce((s, wc) => s + wc.newlyCompletedQty, 0);
    const totalAcceptedProduction = workCompletions.reduce((s, wc) => s + wc.acceptedQty, 0);

    const pendingTasksList = tasks.filter((t) => t.pendingQty > 0);
    const pendingTaskCount = pendingTasksList.length;
    const pendingWorkQty = pendingTasksList.reduce((s, t) => s + t.pendingQty, 0);
    const overdueTasks = pendingTasksList.filter((t) => t.status === 'Overdue');

    const totalEarnings = employees.reduce((s, e) => s + e.totalApprovedEarnings, 0);
    const totalPayments = payments.reduce((s, p) => s + p.amount, 0);
    const outstandingPayments = employees.reduce((s, e) => s + e.outstandingBalance, 0);

    const lowStockProducts = products.filter(
      (p) => p.warehouseStock <= (p.minStockLevel ?? settings.defaultLowStockThreshold)
    );

    return {
      totalProducts,
      activeEmployees,
      totalEmployees,
      warehouseStock,
      employeeHeldStock,
      finishedGoodsStock,
      rejectedProducts,
      totalWorkCompleted,
      totalAcceptedProduction,
      pendingTaskCount,
      pendingWorkQty,
      overdueTasks,
      totalEarnings,
      totalPayments,
      outstandingPayments,
      lowStockProducts,
    };
  }, [products, employees, tasks, workCompletions, payments, settings.defaultLowStockThreshold]);

  if (dataLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Inventory & Production KPI Cards (Section G & Section 6) */}
      <section aria-label="Inventory and Production Metrics">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Inventory &amp; Production Position
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('stock')}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
          >
            <span>Open Stock Ledger</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Warehouse Available Stock</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatNumber(metrics.warehouseStock)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Across {metrics.totalProducts} registered products
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Total Stock Issued to Employees</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-indigo-700 tabular-nums">
              {formatNumber(metrics.employeeHeldStock)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Currently held on factory floor</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Finished Goods Stock</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
              {formatNumber(metrics.finishedGoodsStock)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Accepted production: {formatNumber(metrics.totalAcceptedProduction)}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Total Work Completed</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatNumber(metrics.totalWorkCompleted)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {workCompletions.length} completion installments logged
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Pending Employee Work</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
              {formatNumber(metrics.pendingWorkQty)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {metrics.pendingTaskCount} open tasks ({metrics.overdueTasks.length} overdue)
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Rejected Products</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-red-600 tabular-nums">
              {formatNumber(metrics.rejectedProducts)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Tracked separately from finished goods</p>
          </div>
        </div>
      </section>

      {/* Workforce & Payment Summary Strip */}
      <section aria-label="Workforce and Payment Summary">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Total Employees</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {metrics.totalEmployees}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {metrics.activeEmployees} active
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Total Products</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {metrics.totalProducts}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Active catalog SKUs</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Total Employee Earnings</p>
            <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {formatCurrency(metrics.totalEarnings)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Approved piece-rate wages</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Total Payments</p>
            <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
              {formatCurrency(metrics.totalPayments)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {payments.length} disbursements
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Outstanding Payments</p>
            <p className="mt-1 font-mono text-xl font-semibold text-amber-700 tabular-nums">
              {formatCurrency(metrics.outstandingPayments)}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="mt-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Settle Ledger
            </button>
          </div>
        </div>
      </section>

      {/* Production Charts */}
      <ProductionCharts tasks={tasks} workCompletions={workCompletions} />

      {/* Operational Alerts & Recent Movements */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Low Stock & Overdue Alerts */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Factory Alerts</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {metrics.lowStockProducts.length} low stock · {metrics.overdueTasks.length} overdue
            </span>
          </div>

          {metrics.lowStockProducts.length === 0 && metrics.overdueTasks.length === 0 ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              All warehouse stock levels are above minimum thresholds and no tasks are overdue.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {metrics.lowStockProducts.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        Low Stock Alert · Code {p.productCode}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-mono text-sm font-semibold text-amber-700 tabular-nums">
                      {formatNumber(p.warehouseStock)} {p.unit}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      Min: {formatNumber(p.minStockLevel)}
                    </p>
                  </div>
                </div>
              ))}

              {metrics.overdueTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {t.issueCode} — {t.employeeName}
                      </p>
                      <p className="text-xs text-slate-500">
                        Overdue Task · Due {t.expectedCompletionDate}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-mono text-sm font-semibold text-red-600 tabular-nums">
                      {formatNumber(t.pendingQty)} {t.unit}
                    </p>
                    <p className="text-[11px] text-slate-400">Pending</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Stock Movements */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent Stock Movements</h3>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Full Audit Report
            </button>
          </div>

          {stockTransactions.length === 0 ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No stock movements recorded yet. Add a product in Stock Management to get started.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {stockTransactions.slice(0, 6).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {tx.productName} · <span className="font-mono text-xs text-slate-500">{tx.transactionCode}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {tx.type.replace(/_/g, ' ')} {tx.employeeName ? `· ${tx.employeeName}` : ''} · {formatTimestamp(tx.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {formatNumber(tx.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
