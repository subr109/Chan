import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  auth,
  db,
  handleFirestoreError,
} from '../lib/firebase';
import { getTodayISO, sha256Hex } from '../lib/formatters';
import {
  AuditLog,
  CompanySettings,
  Employee,
  OperationType,
  Payment,
  Product,
  StockTransaction,
  Task,
  UserProfile,
  WorkCompletion,
} from '../types/erp';

const ADMIN_CREDS_STORAGE_KEY = 'cm_admin_creds_v2';

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ErpContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  authNotice: string | null;
  needsPasswordSetup: boolean;
  isAdmin: boolean;
  dataLoading: boolean;
  signInWithAdminCredentials: (loginId: string, password: string) => Promise<void>;
  sendAdminPasswordSetupEmail: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthSession: () => Promise<void>;
  signOutUser: () => Promise<void>;
  products: Product[];
  stockTransactions: StockTransaction[];
  employees: Employee[];
  tasks: Task[];
  workCompletions: WorkCompletion[];
  payments: Payment[];
  settings: CompanySettings;
  users: UserProfile[];
  auditLogs: AuditLog[];
  toast: ToastState | null;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  clearToast: () => void;
}

const DEFAULT_SETTINGS: CompanySettings = {
  id: 'company_profile',
  companyName: 'Chandramukhi Implex Pvt. Ltd.',
  tagline: 'Garments Manufacturing & Apparel Production ERP',
  address: 'Industrial Garment Zone, Sector 4, India',
  phone: '+91 98000 00000',
  email: 'operations@chandramukhiimplex.com',
  gstin: '',
  defaultLowStockThreshold: 50,
  allowNegativeStockOverride: false,
  updatedBy: '',
  updatedAt: null,
};

const ErpContext = createContext<ErpContextValue | null>(null);

function toEpochMs(ts: unknown): number {
  if (!ts) return 0;
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const t = new Date(ts).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function ErpProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);

  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockTransactions, setStockTransactions] = useState<StockTransaction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rawTasks, setRawTasks] = useState<Task[]>([]);
  const [workCompletions, setWorkCompletions] = useState<WorkCompletion[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const isBootstrappedAdmin = Boolean(
    user &&
      emailVerified &&
      user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );

  const isAdmin = isBootstrappedAdmin || hasAdminDoc;

  // Auth listener & profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setEmailVerified(Boolean(currentUser?.emailVerified));
      setAuthError(null);

      if (!currentUser || !currentUser.emailVerified) {
        setHasAdminDoc(false);
        setProducts([]);
        setStockTransactions([]);
        setEmployees([]);
        setRawTasks([]);
        setWorkCompletions([]);
        setPayments([]);
        setUsers([]);
        setAuditLogs([]);
        setDataLoading(false);
        setAuthLoading(false);
        return;
      }

      setNeedsPasswordSetup(false);
      setAuthNotice(null);

      try {
        const adminSnap = await getDoc(doc(db, 'admins', currentUser.uid));
        const adminExists = adminSnap.exists();
        setHasAdminDoc(adminExists);

        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const isUserAdmin =
          (currentUser.emailVerified &&
            currentUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) ||
          adminExists;

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: (currentUser.email || '').slice(0, 160),
            displayName: (currentUser.displayName || 'Administrator').slice(0, 100),
            role: isUserAdmin ? 'admin' : 'staff',
            isActive: true,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('Profile sync note:', err);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Firestore real-time subscriptions (only when authenticated and emailVerified)
  useEffect(() => {
    if (authLoading || !user || !emailVerified) return;
    setDataLoading(true);

    const adminQueryMode = Boolean(
      user.emailVerified && user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    );

    const buildRef = (colName: string, ownerField = 'createdBy') => {
      const base = collection(db, colName);
      return adminQueryMode ? base : query(base, where(ownerField, '==', user.uid));
    };

    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 6) {
        setDataLoading(false);
      }
    };

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        buildRef('products', 'createdBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setProducts(items);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'products')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('stockTransactions', 'performedBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<StockTransaction, 'id'>) }))
            .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
          setStockTransactions(items);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'stockTransactions')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('employees', 'createdBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Employee, 'id'>) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setEmployees(items);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('tasks', 'createdBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }))
            .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
          setRawTasks(items);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('workCompletions', 'createdBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<WorkCompletion, 'id'>) }))
            .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
          setWorkCompletions(items);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'workCompletions')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('payments', 'createdBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Payment, 'id'>) }))
            .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
          setPayments(items);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('settings', 'updatedBy'),
        async (snap) => {
          const profileDoc = snap.docs.find((d) => d.id === 'company_profile') || snap.docs[0];
          if (profileDoc) {
            const loaded = { id: profileDoc.id, ...(profileDoc.data() as Omit<CompanySettings, 'id'>) };
            setSettings(loaded);
            if (loaded.adminLoginId && loaded.adminPasswordHash) {
              try {
                const legacyHash = await sha256Hex('admin@123');
                if (loaded.adminPasswordHash !== legacyHash) {
                  localStorage.setItem(
                    ADMIN_CREDS_STORAGE_KEY,
                    JSON.stringify({
                      loginId: loaded.adminLoginId,
                      passwordHash: loaded.adminPasswordHash,
                    })
                  );
                }
              } catch {
                // ignore storage errors
              }
            }
          } else {
            setSettings(DEFAULT_SETTINGS);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'settings')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('users', 'uid'),
        (snap) => {
          setUsers(snap.docs.map((d) => d.data() as UserProfile));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      )
    );

    unsubs.push(
      onSnapshot(
        buildRef('auditLogs', 'performedBy'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }))
            .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
          setAuditLogs(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authLoading, user, emailVerified]);

  // Dynamically compute Overdue status for tasks whose expected completion date passed while pendingQty > 0
  const tasks = useMemo(() => {
    const today = getTodayISO();
    return rawTasks.map((t) => {
      if (t.pendingQty > 0 && t.expectedCompletionDate && t.expectedCompletionDate < today) {
        return { ...t, status: 'Overdue' as const };
      }
      return t;
    });
  }, [rawTasks]);

  const signInWithAdminCredentials = useCallback(async (loginId: string, password: string) => {
    setAuthError(null);
    setAuthNotice(null);
    setNeedsPasswordSetup(false);

    const trimmedId = loginId.trim();
    if (!trimmedId || !password) {
      setAuthError('Please enter both Username ID and Password.');
      return;
    }

    try {
      let expectedId = 'admin';
      let expectedHash = await sha256Hex('Admin@123');

      try {
        localStorage.removeItem('cm_admin_creds');
        const cached = localStorage.getItem(ADMIN_CREDS_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { loginId?: string; passwordHash?: string };
          if (parsed.loginId && parsed.passwordHash) {
            expectedId = parsed.loginId;
            expectedHash = parsed.passwordHash;
          }
        }
      } catch {
        // fallback to defaults
      }

      const providedHash = await sha256Hex(password);
      if (trimmedId !== expectedId || providedHash !== expectedHash) {
        setAuthError('Invalid Username ID or Password.');
        return;
      }

      try {
        await signInWithEmailAndPassword(auth, BOOTSTRAPPED_ADMIN_EMAIL, password);
      } catch (signInErr) {
        const code = (signInErr as { code?: string })?.code || '';

        if (code === 'auth/operation-not-allowed') {
          setAuthError(
            'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method for project pivotal-rampart-7cbh2, then sign in again.'
          );
          return;
        }

        if (
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password'
        ) {
          try {
            const cred = await createUserWithEmailAndPassword(
              auth,
              BOOTSTRAPPED_ADMIN_EMAIL,
              password
            );
            await sendEmailVerification(cred.user).catch(() => {});
            setAuthNotice(
              `Admin account initialized. A verification email was sent to ${BOOTSTRAPPED_ADMIN_EMAIL}.`
            );
            return;
          } catch (createErr) {
            const createCode = (createErr as { code?: string })?.code || '';
            if (createCode === 'auth/email-already-in-use') {
              setNeedsPasswordSetup(true);
              setAuthError(
                `Credentials verified, but ${BOOTSTRAPPED_ADMIN_EMAIL} in Firebase Auth does not have this password set yet. Click "Send Password Setup Email" below to set Admin@123.`
              );
              return;
            }
            if (createCode === 'auth/operation-not-allowed') {
              setAuthError(
                'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password under Authentication → Sign-in method for project pivotal-rampart-7cbh2, then sign in again.'
              );
              return;
            }
            throw createErr;
          }
        }

        throw signInErr;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Admin authentication failed.';
      setAuthError(msg);
    }
  }, []);

  const sendAdminPasswordSetupEmail = useCallback(async () => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      await sendPasswordResetEmail(auth, BOOTSTRAPPED_ADMIN_EMAIL);
      setNeedsPasswordSetup(false);
      setAuthNotice(
        `Password setup email sent to ${BOOTSTRAPPED_ADMIN_EMAIL}. Open the link, set your password to Admin@123, then sign in here.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send password setup email.';
      setAuthError(msg);
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    setAuthError(null);
    setAuthNotice(null);
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice(`Verification email sent to ${auth.currentUser.email}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send verification email.';
      setAuthError(msg);
    }
  }, []);

  const refreshAuthSession = useCallback(async () => {
    setAuthError(null);
    if (!auth.currentUser) return;
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const refreshed = auth.currentUser;
      setUser(refreshed);
      setEmailVerified(Boolean(refreshed?.emailVerified));
      if (refreshed && !refreshed.emailVerified) {
        setAuthError('Email is still not verified yet. Please click the verification link in your inbox first.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not refresh session.';
      setAuthError(msg);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setNeedsPasswordSetup(false);
    setAuthError(null);
    setAuthNotice(null);
    await signOut(auth);
  }, []);

  const value: ErpContextValue = {
    user,
    authLoading,
    authError,
    authNotice,
    needsPasswordSetup,
    isAdmin,
    dataLoading,
    signInWithAdminCredentials,
    sendAdminPasswordSetupEmail,
    resendVerificationEmail,
    refreshAuthSession,
    signOutUser,
    products,
    stockTransactions,
    employees,
    tasks,
    workCompletions,
    payments,
    settings,
    users,
    auditLogs,
    toast,
    showToast,
    clearToast,
  };

  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
}

export function useErp() {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error('useErp must be used inside ErpProvider');
  return ctx;
}
