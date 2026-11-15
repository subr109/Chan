import React, { useMemo, useState } from 'react';
import { Task, WorkCompletion } from '../types/erp';
import { formatNumber } from '../lib/formatters';

interface ProductionChartsProps {
  tasks: Task[];
  workCompletions: WorkCompletion[];
}

type ChartHorizon = 'daily' | 'weekly' | 'monthly';

interface Bucket {
  key: string;
  label: string;
  accepted: number;
  rejected: number;
  issued: number;
}

function getMondayISO(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export function ProductionCharts({ tasks, workCompletions }: ProductionChartsProps) {
  const [horizon, setHorizon] = useState<ChartHorizon>('daily');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const buckets: Bucket[] = useMemo(() => {
    const now = new Date();
    const list: Bucket[] = [];

    if (horizon === 'daily') {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        list.push({ key: iso, label, accepted: 0, rejected: 0, issued: 0 });
      }
      workCompletions.forEach((wc) => {
        const b = list.find((item) => item.key === wc.completionDate);
        if (b) {
          b.accepted += wc.acceptedQty;
          b.rejected += wc.rejectedQty;
        }
      });
      tasks.forEach((t) => {
        const b = list.find((item) => item.key === t.issueDate);
        if (b) {
          b.issued += t.quantityIssued;
        }
      });
    } else if (horizon === 'weekly') {
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i * 7);
        const mon = getMondayISO(d.toISOString().slice(0, 10));
        const monDate = new Date(`${mon}T00:00:00`);
        const label = `Wk ${monDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
        if (!list.some((item) => item.key === mon)) {
          list.push({ key: mon, label, accepted: 0, rejected: 0, issued: 0 });
        }
      }
      workCompletions.forEach((wc) => {
        if (!wc.completionDate) return;
        const wk = getMondayISO(wc.completionDate);
        const b = list.find((item) => item.key === wk);
        if (b) {
          b.accepted += wc.acceptedQty;
          b.rejected += wc.rejectedQty;
        }
      });
      tasks.forEach((t) => {
        if (!t.issueDate) return;
        const wk = getMondayISO(t.issueDate);
        const b = list.find((item) => item.key === wk);
        if (b) {
          b.issued += t.quantityIssued;
        }
      });
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        list.push({ key, label, accepted: 0, rejected: 0, issued: 0 });
      }
      workCompletions.forEach((wc) => {
        const ym = wc.completionDate?.slice(0, 7);
        const b = list.find((item) => item.key === ym);
        if (b) {
          b.accepted += wc.acceptedQty;
          b.rejected += wc.rejectedQty;
        }
      });
      tasks.forEach((t) => {
        const ym = t.issueDate?.slice(0, 7);
        const b = list.find((item) => item.key === ym);
        if (b) {
          b.issued += t.quantityIssued;
        }
      });
    }

    return list;
  }, [horizon, tasks, workCompletions]);

  const maxVal = useMemo(() => {
    const highest = Math.max(
      10,
      ...buckets.map((b) => Math.max(b.issued, b.accepted + b.rejected))
    );
    return Math.ceil(highest / 10) * 10;
  }, [buckets]);

  const totalPeriodAccepted = buckets.reduce((acc, b) => acc + b.accepted, 0);
  const totalPeriodRejected = buckets.reduce((acc, b) => acc + b.rejected, 0);
  const totalPeriodIssued = buckets.reduce((acc, b) => acc + b.issued, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Production &amp; Issue Output</h3>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Accepted: {formatNumber(totalPeriodAccepted)} · Rejected: {formatNumber(totalPeriodRejected)} · Issued: {formatNumber(totalPeriodIssued)}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 self-start">
          {(['daily', 'weekly', 'monthly'] as ChartHorizon[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setHorizon(tab);
                setHoveredIdx(null);
              }}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                horizon === tab
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs bg-indigo-600" />
          <span>Accepted Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs bg-slate-300" />
          <span>Material Issued</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs bg-red-500" />
          <span>Rejected Goods</span>
        </div>
      </div>

      {/* Chart Area */}
      <div className="mt-4 relative overflow-x-auto">
        <div className="min-w-[540px]">
          <svg viewBox="0 0 720 220" className="w-full h-56 overflow-visible">
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = 180 - pct * 155;
              const val = Math.round(maxVal * pct);
              return (
                <g key={pct}>
                  <line x1={44} y1={y} x2={708} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                  <text
                    x={36}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono tabular-nums"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {buckets.map((bucket, idx) => {
              const slotWidth = (708 - 52) / buckets.length;
              const centerX = 52 + idx * slotWidth + slotWidth / 2;
              const barW = Math.min(18, Math.max(8, slotWidth * 0.28));

              const issuedH = (bucket.issued / maxVal) * 155;
              const acceptedH = (bucket.accepted / maxVal) * 155;
              const rejectedH = (bucket.rejected / maxVal) * 155;

              const isHovered = hoveredIdx === idx;

              return (
                <g
                  key={bucket.key}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  {isHovered && (
                    <rect
                      x={centerX - slotWidth / 2 + 2}
                      y={20}
                      width={slotWidth - 4}
                      height={160}
                      fill="#f1f5f9"
                      rx={4}
                    />
                  )}

                  {/* Issued bar (left) */}
                  <rect
                    x={centerX - barW - 1.5}
                    y={180 - issuedH}
                    width={barW}
                    height={Math.max(0, issuedH)}
                    fill="#cbd5e1"
                    rx={2}
                  />

                  {/* Accepted bar (right) */}
                  <rect
                    x={centerX + 1.5}
                    y={180 - acceptedH}
                    width={barW}
                    height={Math.max(0, acceptedH)}
                    fill="#4f46e5"
                    rx={2}
                  />

                  {/* Rejected stacked above Accepted */}
                  {rejectedH > 0 && (
                    <rect
                      x={centerX + 1.5}
                      y={180 - acceptedH - rejectedH}
                      width={barW}
                      height={Math.max(2, rejectedH)}
                      fill="#ef4444"
                      rx={2}
                    />
                  )}

                  <text
                    x={centerX}
                    y={200}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] tabular-nums"
                  >
                    {bucket.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {hoveredIdx !== null && buckets[hoveredIdx] && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 tabular-nums">
              <span className="font-semibold text-slate-900">{buckets[hoveredIdx].label}</span>
              <div className="flex items-center gap-4">
                <span>Issued: {formatNumber(buckets[hoveredIdx].issued)}</span>
                <span className="text-indigo-700 font-medium">
                  Accepted: {formatNumber(buckets[hoveredIdx].accepted)}
                </span>
                <span className="text-red-600 font-medium">
                  Rejected: {formatNumber(buckets[hoveredIdx].rejected)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
