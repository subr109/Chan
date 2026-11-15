import React, { useState } from 'react';
import { Factory, ShieldCheck, Eye, EyeOff, Lock } from 'lucide-react';
import { ErpProvider, useErp } from './context/ErpContext';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { StockManagementPage } from './pages/StockManagementPage';
import { EmployeeManagementPage } from './pages/EmployeeManagementPage';
import { TaskProductionPage } from './pages/TaskProductionPage';
import { ReportsPage } from './pages/ReportsPage';
import { PaymentLedgerPage } from './pages/PaymentLedgerPage';
import { SettingsPage } from './pages/SettingsPage';
import { NavSection } from './types/erp';

function AppContent() {
  const { user, authLoading, authError, signInWithGoogle, signInWithAdminCredentials } = useErp();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signInWithAdminCredentials(loginId, password);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          <p className="text-sm font-medium text-slate-600">
            Initializing Chandramukhi Implex ERP...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">
                Chandramukhi Implex Pvt. Ltd.
              </h1>
              <p className="text-xs text-slate-500">
                Garments Manufacturing Management System
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminSubmit} className="mt-6 border-t border-slate-100 pt-5 space-y-4">
            <div>
              <label htmlFor="admin-login-id" className="block text-xs font-medium text-slate-700 mb-1">
                Admin Login ID
              </label>
              <input
                id="admin-login-id"
                type="text"
                required
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Enter login ID (e.g. admin)"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-md border border-slate-200 py-2 pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Lock className="h-4 w-4" />
              <span>{submitting ? 'Verifying...' : 'Sign In as Admin'}</span>
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-medium text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span>Sign In with Google</span>
          </button>

          <div className="mt-5 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600" />
            <span>
              Admin credentials connect to your verified Firebase Firestore session for persistent storage.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout activeSection={activeSection} onSelectSection={setActiveSection}>
      {activeSection === 'dashboard' && <DashboardPage onNavigate={setActiveSection} />}
      {activeSection === 'stock' && <StockManagementPage />}
      {activeSection === 'employees' && <EmployeeManagementPage />}
      {activeSection === 'tasks' && <TaskProductionPage />}
      {activeSection === 'reports' && <ReportsPage />}
      {activeSection === 'payments' && <PaymentLedgerPage />}
      {activeSection === 'settings' && <SettingsPage />}
    </Layout>
  );
}

export default function App() {
  return (
    <ErpProvider>
      <AppContent />
    </ErpProvider>
  );
}
