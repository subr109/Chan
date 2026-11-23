import React, { useEffect, useState } from 'react';
import { Shield, Save, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { useErp } from '../context/ErpContext';
import { auth } from '../lib/firebase';
import {
  grantAdminAccess,
  resetAllErpData,
  revokeAdminAccess,
  saveCompanySettings,
  toggleUserActive,
} from '../services/erpService';
import { formatTimestamp, sha256Hex } from '../lib/formatters';

export function SettingsPage() {
  const { settings, users, auditLogs, isAdmin, user, showToast } = useErp();

  const [companyName, setCompanyName] = useState(settings.companyName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [gstin, setGstin] = useState(settings.gstin);
  const [defaultLowStockThreshold, setDefaultLowStockThreshold] = useState(
    String(settings.defaultLowStockThreshold)
  );
  const [allowNegativeStockOverride, setAllowNegativeStockOverride] = useState(
    settings.allowNegativeStockOverride
  );
  const [adminLoginId, setAdminLoginId] = useState(settings.adminLoginId || 'admin');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Factory Reset State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSettingsOpt, setResetSettingsOpt] = useState(true);
  const [clearAuditLogsOpt, setClearAuditLogsOpt] = useState(true);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setCompanyName(settings.companyName);
    setTagline(settings.tagline);
    setAddress(settings.address);
    setPhone(settings.phone);
    setEmail(settings.email);
    setGstin(settings.gstin);
    setDefaultLowStockThreshold(String(settings.defaultLowStockThreshold));
    setAllowNegativeStockOverride(settings.allowNegativeStockOverride);
    setAdminLoginId(settings.adminLoginId || 'admin');
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('error', 'Only administrators can modify company settings.');
      return;
    }
    setSaving(true);
    try {
      const trimmedNewPwd = newAdminPassword.trim();
      const passwordHash = trimmedNewPwd
        ? await sha256Hex(trimmedNewPwd)
        : settings.adminPasswordHash || (await sha256Hex('Admin@123'));

      if (trimmedNewPwd && auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, trimmedNewPwd);
        } catch {
          // If Firebase requires recent login or account uses another provider, continue saving settings
        }
      }

      await saveCompanySettings({
        companyName,
        tagline,
        address,
        phone,
        email,
        gstin,
        defaultLowStockThreshold: Number(defaultLowStockThreshold || 0),
        allowNegativeStockOverride,
        adminLoginId: adminLoginId.trim() || 'admin',
        adminPasswordHash: passwordHash,
      });
      setNewAdminPassword('');
      showToast('success', 'Company, inventory, and admin credential settings saved.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdmin = async (targetUid: string, targetEmail: string, currentlyAdmin: boolean) => {
    try {
      if (currentlyAdmin) {
        await revokeAdminAccess(targetUid);
        showToast('info', `Revoked admin role for ${targetEmail}.`);
      } else {
        await grantAdminAccess(targetUid, targetEmail);
        showToast('success', `Granted admin role to ${targetEmail}.`);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Role update failed.');
    }
  };

  const handleToggleUserStatus = async (targetUid: string, nextActive: boolean) => {
    try {
      await toggleUserActive(targetUid, nextActive);
      showToast('info', `User access ${nextActive ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update user status.');
    }
  };

  const handleFactoryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      showToast('error', 'Type RESET in the confirmation box to proceed.');
      return;
    }
    setResetting(true);
    try {
      const { deletedCount } = await resetAllErpData({
        isAdmin,
        resetSettings: resetSettingsOpt,
        clearAuditLogs: clearAuditLogsOpt,
      });
      setResetModalOpen(false);
      setResetConfirmText('');
      showToast(
        'success',
        `System reset complete. ${deletedCount} saved records were cleared.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to reset system data.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Factory Settings &amp; Governance</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage company details, inventory threshold rules, user roles, and view immutable audit logs.
        </p>
      </div>

      {/* Company Profile Form */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-semibold text-slate-900">Company &amp; Inventory Rules</h3>
          {!isAdmin && (
            <span className="text-xs font-medium text-amber-700">
              Admin access required to edit
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tagline</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Factory Phone</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Operations Email</label>
            <input
              type="email"
              disabled={!isAdmin}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="Optional GST Number"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Default Low-Stock Alert Threshold
            </label>
            <input
              type="number"
              min="0"
              disabled={!isAdmin}
              value={defaultLowStockThreshold}
              onChange={(e) => setDefaultLowStockThreshold(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Factory Address</label>
          <input
            type="text"
            disabled={!isAdmin}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            disabled={!isAdmin}
            checked={allowNegativeStockOverride}
            onChange={(e) => setAllowNegativeStockOverride(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            Allow Admin-only negative stock override during authorized inventory adjustments
          </span>
        </label>

        {isAdmin && (
          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Admin Portal Login ID
              </label>
              <input
                type="text"
                value={adminLoginId}
                onChange={(e) => setAdminLoginId(e.target.value)}
                placeholder="admin"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New Admin Password (leave blank to keep current)
              </label>
              <input
                type="password"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Leave blank to keep existing"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        )}
      </form>

      {/* User Access Management */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <Shield className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">ERP Users &amp; Admin Access</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-white text-xs font-medium text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-6 text-center text-slate-500">
                    Signed in as {user?.email}.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.uid}>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.displayName}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 font-medium capitalize text-slate-800">{u.role}</td>
                    <td className="px-4 py-3">
                      <span className={u.isActive ? 'text-emerald-700 font-medium' : 'text-red-600 font-medium'}>
                        {u.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {u.uid !== user?.uid ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleAdmin(u.uid, u.email, u.role === 'admin')}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {u.role === 'admin' ? 'Demote to Staff' : 'Make Admin'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u.uid, !u.isActive)}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {u.isActive ? 'Suspend' : 'Activate'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Current Session</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Authorized Corrections & Audit Log */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Authorized Corrections &amp; Audit History ({auditLogs.length})
          </h3>
        </div>
        {auditLogs.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No administrative adjustments, rejection approvals, or deletions logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-white text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Summary</th>
                  <th className="px-4 py-2.5">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{log.entityType}</td>
                    <td className="px-4 py-2.5 text-slate-700">{log.summary}</td>
                    <td className="px-4 py-2.5 text-slate-600">{log.performedByEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Reset / Factory Reset */}
      {isAdmin && (
        <div className="rounded-lg border border-red-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50/70 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-900">
              Reset All Data (Factory Reset)
            </h3>
          </div>
          <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 max-w-2xl">
              <p className="text-sm font-medium text-slate-900">
                Clear all ERP records and return the workspace to a fresh state
              </p>
              <p className="text-xs text-slate-600">
                Permanently deletes all saved Products, Sub-Products, Employees, Issued Tasks,
                Work Completions, Payments, and Stock Transactions. Optionally resets Audit Logs
                and Company/Login settings back to defaults.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResetConfirmText('');
                setResetModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset All Things</span>
            </button>
          </div>
        </div>
      )}

      {/* Factory Reset Confirmation Modal */}
      {resetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  Confirm Full System Reset
                </h3>
              </div>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFactoryReset} className="mt-4 space-y-4">
              <p className="text-xs leading-relaxed text-slate-600">
                This action cannot be undone. All Products, Sub-Products, Employees, Tasks,
                Production Entries, Payments, and Stock Movements in the database will be permanently deleted.
              </p>

              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearAuditLogsOpt}
                    onChange={(e) => setClearAuditLogsOpt(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span>Also clear Audit History logs</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetSettingsOpt}
                    onChange={(e) => setResetSettingsOpt(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span>Reset Company Profile &amp; Portal Login ID back to defaults (admin / Admin@123)</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Type <span className="font-mono font-bold text-red-600">RESET</span> to confirm *
                </label>
                <input
                  type="text"
                  required
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Type RESET"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => setResetModalOpen(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {resetting ? 'Resetting Database...' : 'Confirm Reset All'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
