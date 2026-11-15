import React, { useState } from 'react';
import { Factory, ShieldCheck, Eye, EyeOff, Lock, MailCheck, RefreshCw, LogOut } from 'lucide-react';
import { ErpProvider, useErp } from './context/ErpContext';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  const {
    user,
    authLoading,
    authError,
    authNotice,
    needsPasswordSetup,
    signInWithAdminCredentials,
    sendAdminPasswordSetupEmail,
    resendVerificationEmail,
    refreshAuthSession,
    signOutUser,
  } = useErp();
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
                Username ID
              </label>
              <input
                id="admin-login-id"
                type="text"
                required
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="admin"
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
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-2">
                <p>{authError}</p>
                {needsPasswordSetup && (
                  <button
                    type="button"
                    onClick={sendAdminPasswordSetupEmail}
                    className="inline-flex items-center rounded bg-red-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-800"
                  >
                    Send Password Setup Email
                  </button>
                )}
              </div>
            )}

            {authNotice && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {authNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Lock className="h-4 w-4" />
              <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>

          <div className="mt-5 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600" />
            <span>
              Protected admin portal for Chandramukhi Implex factory operations.
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Verify Admin Email Once
              </h2>
              <p className="text-xs text-slate-500">
                Verification link sent to {user.email}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Open your inbox, click the Firebase verification link to confirm admin access, then click{' '}
            <span className="font-semibold text-slate-800">Refresh &amp; Continue</span>.
          </p>

          {authError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {authError}
            </div>
          )}

          {authNotice && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {authNotice}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={refreshAuthSession}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh &amp; Continue</span>
            </button>
            <button
              type="button"
              onClick={resendVerificationEmail}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <span>Resend Verification Email</span>
            </button>
            <button
              type="button"
              onClick={signOutUser}
              className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Back to Login</span>
            </button>
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
    <ErrorBoundary>
      <ErpProvider>
        <AppContent />
      </ErpProvider>
    </ErrorBoundary>
  );
}
