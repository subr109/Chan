import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
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
  googleProvider,
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

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ErpContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  isAdmin: boolean;
  dataLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithAdminCredentials: (loginId: string, password: string) => Promise<void>;
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
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
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
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
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
    user && user.emailVerified && user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );

  const isAdmin = isBootstrappedAdmin || hasAdminDoc;

  // Auth listener & profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthError(null);

      if (!currentUser) {
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
            displayName: (currentUser.displayName || currentUser.email || 'Factory User').slice(0, 100),
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

  // Firestore real-time subscriptions (only when authenticated)
  useEffect(() => {
    if (authLoading || !user) return;
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
        (snap) => {
          const profileDoc = snap.docs.find((d) => d.id === 'company_profile') || snap.docs[0];
          if (profileDoc) {
            const loaded = { id: profileDoc.id, ...(profileDoc.data() as Omit<CompanySettings, 'id'>) };
            setSettings(loaded);
            if (loaded.adminLoginId && loaded.adminPasswordHash) {
              try {
                localStorage.setItem(
                  'cm_admin_creds',
                  JSON.stringify({
                    loginId: loaded.adminLoginId,
                    passwordHash: loaded.adminPasswordHash,
                  })
                );
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
  }, [authLoading, user]);

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

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setAuthError(msg);
    }
  }, []);

  const signInWithAdminCredentials = useCallback(async (loginId: string, password: string) => {
    setAuthError(null);
    const trimmedId = loginId.trim();
    if (!trimmedId || !password) {
      setAuthError('Please enter both Admin Login ID and Password.');
      return;
    }

    // If user entered a full email address, attempt Firebase Email/Password auth directly
    if (trimmedId.includes('@')) {
      try {
        await signInWithEmailAndPassword(auth, trimmedId, password);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Email/Password sign-in failed.';
        setAuthError(msg);
        return;
      }
    }

    try {
      let expectedId = 'admin';
      let expectedHash = await sha256Hex('admin@123');

      try {
        const cached = localStorage.getItem('cm_admin_creds');
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
      if (trimmedId.toLowerCase() !== expectedId.toLowerCase() || providedHash !== expectedHash) {
        setAuthError('Invalid Admin Login ID or Password.');
        return;
      }

      if (!auth.currentUser) {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Admin authentication failed.';
      setAuthError(msg);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value: ErpContextValue = {
    user,
    authLoading,
    authError,
    isAdmin,
    dataLoading,
    signInWithGoogle,
    signInWithAdminCredentials,
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
