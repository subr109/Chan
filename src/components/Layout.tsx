import React, { useState } from 'react';
import {
  LayoutDashboard,
  Boxes,
  Users,
  ClipboardCheck,
  FileSpreadsheet,
  IndianRupee,
  Settings,
  LogOut,
  Menu,
  X,
  Factory,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { NavSection } from '../types/erp';

interface LayoutProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: NavSection;
  label: string;
  group: 'overview' | 'primary' | 'finance';
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'overview', icon: LayoutDashboard },
  { id: 'stock', label: 'Stock Management', group: 'primary', icon: Boxes },
  { id: 'employees', label: 'Employee Management', group: 'primary', icon: Users },
  { id: 'tasks', label: 'Task & Production', group: 'primary', icon: ClipboardCheck },
  { id: 'reports', label: 'Reports & Download', group: 'primary', icon: FileSpreadsheet },
  { id: 'payments', label: 'Payment Ledger', group: 'finance', icon: IndianRupee },
  { id: 'settings', label: 'Settings', group: 'finance', icon: Settings },
];

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Executive Dashboard',
  stock: 'Stock Management',
  employees: 'Employee Management',
  tasks: 'Task & Production Management',
  reports: 'Reports & Download',
  payments: 'Employee Payment Ledger',
  settings: 'Settings & Access Control',
};

export function Layout({ activeSection, onSelectSection, children }: LayoutProps) {
  const { user, isAdmin, settings, signOutUser, toast, clearToast } = useErp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (id: NavSection) => {
    onSelectSection(id);
    setMobileOpen(false);
  };

  const renderNavGroup = (group: NavItem['group'], heading: string) => {
    const items = NAV_ITEMS.filter((n) => n.group === group);
    return (
      <div className="mb-5">
        <p className="px-3 mb-1.5 text-[11px] font-medium tracking-wide text-slate-400">
          {heading}
        </p>
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white">
            <Factory className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-white">
              {settings.companyName || 'Chandramukhi Implex Pvt. Ltd.'}
            </p>
            <p className="truncate text-[11px] text-slate-400">Garment Manufacturing ERP</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary Sidebar">
        {renderNavGroup('overview', 'Overview')}
        {renderNavGroup('primary', 'Primary Operations')}
        {renderNavGroup('finance', 'Finance & System')}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="rounded-md bg-slate-800/70 px-3 py-2.5">
          <p className="truncate text-xs font-medium text-white">
            {user?.displayName || user?.email || 'Authenticated User'}
          </p>
          <p className="truncate text-[11px] text-slate-400 mt-0.5">
            {user?.email} · {isAdmin ? 'Administrator' : 'Factory Staff'}
          </p>
        </div>
        <button
          type="button"
          onClick={signOutUser}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[85vw]">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">
                Chandramukhi Implex
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
              Role: {isAdmin ? 'Admin' : 'Staff'}
            </span>
            <button
              type="button"
              onClick={() => handleNav('tasks')}
              className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
            >
              Issue Stock / Task
            </button>
          </div>
        </header>

        {/* Global Toast */}
        {toast && (
          <div className="mx-4 mt-4 sm:mx-6">
            <div
              className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${
                toast.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : toast.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-800'
              }`}
              role="status"
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={clearToast}
                className="rounded p-1 hover:bg-black/5"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
