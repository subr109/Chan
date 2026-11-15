export type ProductUnit = 'Pieces' | 'Meters' | 'Rolls' | 'Sets' | 'Dozens';

export type StockTransactionType =
  | 'OPENING'
  | 'RECEIVE'
  | 'ISSUE'
  | 'RETURN_UNUSED'
  | 'WORK_ACCEPTED'
  | 'WORK_REJECTED'
  | 'DAMAGE_DEDUCTION'
  | 'AUTHORIZED_ADJUSTMENT';

export type PaymentType = 'Per Piece' | 'Per Unit' | 'Batch Rate';
export type EmployeeStatus = 'Active' | 'Inactive';
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
export type TaskPaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type LedgerPaymentType = 'Regular Payment' | 'Advance Payment' | 'Settlement';
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';

export interface Product {
  id: string;
  productCode: string;
  name: string;
  category: string;
  unit: ProductUnit;
  rate: number;
  defaultLabourRate: number;
  openingStock: number;
  stockReceived: number;
  stockIssued: number;
  stockReturned: number;
  damagedStock: number;
  otherDeductions: number;
  warehouseStock: number;
  employeeHeldStock: number;
  finishedGoodsStock: number;
  minStockLevel: number;
  isActive: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface SubProduct {
  id: string;
  parentProductId: string;
  parentProductCode: string;
  parentProductName: string;
  subProductCode: string;
  name: string;
  unit: ProductUnit;
  rate: number;
  labourRate: number;
  description: string;
  totalIssued: number;
  totalCompleted: number;
  totalEarned: number;
  isActive: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface StockTransaction {
  id: string;
  transactionCode: string;
  productId: string;
  productName: string;
  productCode: string;
  type: StockTransactionType;
  quantity: number;
  warehouseDelta: number;
  employeeHeldDelta: number;
  finishedGoodsDelta: number;
  damagedDelta: number;
  previousWarehouseStock: number;
  newWarehouseStock: number;
  employeeId: string;
  employeeName: string;
  referenceId: string;
  remarks: string;
  isAuthorizedAdjustment: boolean;
  performedBy: string;
  performedByEmail: string;
  createdAt: unknown;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  phone: string;
  address: string;
  joiningDate: string;
  workCategory: string;
  paymentType: PaymentType;
  perPieceRate: number;
  status: EmployeeStatus;
  totalStockReceived: number;
  totalWorkCompleted: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  totalUnusedReturned: number;
  currentMaterialBalance: number;
  totalApprovedEarnings: number;
  totalPaid: number;
  outstandingBalance: number;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Task {
  id: string;
  issueCode: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  productId: string;
  productCode: string;
  productName: string;
  subProductId?: string;
  subProductCode?: string;
  subProductName?: string;
  unit: string;
  quantityIssued: number;
  perUnitRate: number;
  totalExpectedPayment: number;
  issueDate: string;
  expectedCompletionDate: string;
  notes: string;
  completedAcceptedQty: number;
  completedRejectedQty: number;
  approvedRejectedQty: number;
  returnedUnusedQty: number;
  pendingQty: number;
  earnedAmount: number;
  status: TaskStatus;
  paymentStatus: TaskPaymentStatus;
  lastCompletionDate: string;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface WorkCompletion {
  id: string;
  completionCode: string;
  taskId: string;
  issueCode: string;
  employeeId: string;
  employeeName: string;
  productId: string;
  productName: string;
  subProductId?: string;
  subProductCode?: string;
  subProductName?: string;
  previouslyPendingQty: number;
  newlyCompletedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rejectedApprovedForPay: boolean;
  rejectedApprovalBy: string;
  unusedReturnedQty: number;
  remainingWorkQty: number;
  perUnitRate: number;
  earnedAmount: number;
  completionDate: string;
  remarks: string;
  createdBy: string;
  createdAt: unknown;
}

export interface Payment {
  id: string;
  paymentCode: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  amount: number;
  paymentType: LedgerPaymentType;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  notes: string;
  previousBalance: number;
  remainingBalanceAfter: number;
  isPaymentDone?: boolean;
  createdBy: string;
  createdAt: unknown;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  defaultLowStockThreshold: number;
  allowNegativeStockOverride: boolean;
  adminLoginId?: string;
  adminPasswordHash?: string;
  updatedBy: string;
  updatedAt: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'staff';
  isActive: boolean;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  performedBy: string;
  performedByEmail: string;
  createdAt: unknown;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export type NavSection =
  | 'dashboard'
  | 'stock'
  | 'employees'
  | 'tasks'
  | 'reports'
  | 'payments'
  | 'settings';
