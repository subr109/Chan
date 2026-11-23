import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { BOOTSTRAPPED_ADMIN_EMAIL, auth, db, handleFirestoreError } from '../lib/firebase';
import {
  clampString,
  generateDocId,
  generateSequentialCode,
  sanitizeCode,
  sha256Hex,
  toSafeNumber,
} from '../lib/formatters';
import {
  CompanySettings,
  Employee,
  EmployeeStatus,
  LedgerPaymentType,
  OperationType,
  PaymentMethod,
  PaymentType,
  Product,
  ProductUnit,
  SubProduct,
  Task,
  WorkCompletion,
} from '../types/erp';

function requireUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please sign in.');
  }
  return user;
}

function isPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('permission') || msg.includes('insufficient') || msg.includes('missing or insufficient');
}

// ---------------------------------------------------------
// PRODUCTS & STOCK MANAGEMENT
// ---------------------------------------------------------

export interface CreateProductInput {
  productCode: string;
  name: string;
  category: string;
  unit: ProductUnit;
  rate: number;
  defaultLabourRate: number;
  openingStock: number;
  minStockLevel: number;
}

export async function createProduct(input: CreateProductInput): Promise<string> {
  const user = requireUser();
  const productId = generateDocId('prod');
  const opening = Math.max(0, toSafeNumber(input.openingStock));
  const code = sanitizeCode(input.productCode, 'PRD');
  const name = clampString(input.name, 120);
  const category = clampString(input.category, 60);
  const rate = Math.max(0, toSafeNumber(input.rate));
  const defaultLabourRate = Math.max(0, toSafeNumber(input.defaultLabourRate));
  const minStockLevel = Math.max(0, toSafeNumber(input.minStockLevel));

  if (!name || !category) {
    throw new Error('Product name and category are required.');
  }

  try {
    const batch = writeBatch(db);
    const prodRef = doc(db, 'products', productId);

    batch.set(prodRef, {
      productCode: code,
      name,
      category,
      unit: input.unit,
      rate,
      defaultLabourRate,
      openingStock: opening,
      stockReceived: 0,
      stockIssued: 0,
      stockReturned: 0,
      damagedStock: 0,
      otherDeductions: 0,
      warehouseStock: opening,
      employeeHeldStock: 0,
      finishedGoodsStock: 0,
      minStockLevel,
      isActive: true,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (opening > 0) {
      const txId = generateDocId('tx');
      const txRef = doc(db, 'stockTransactions', txId);
      batch.set(txRef, {
        transactionCode: generateSequentialCode('TXN'),
        productId,
        productName: name,
        productCode: code,
        type: 'OPENING',
        quantity: opening,
        warehouseDelta: opening,
        employeeHeldDelta: 0,
        finishedGoodsDelta: 0,
        damagedDelta: 0,
        previousWarehouseStock: 0,
        newWarehouseStock: opening,
        employeeId: '',
        employeeName: '',
        referenceId: productId,
        remarks: 'Initial opening stock balance',
        isAuthorizedAdjustment: false,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return productId;
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
    }
    throw err;
  }
}

export async function updateProductDetails(
  product: Product,
  updates: Partial<Pick<Product, 'productCode' | 'name' | 'category' | 'unit' | 'rate' | 'defaultLabourRate' | 'minStockLevel' | 'isActive'>>
): Promise<void> {
  requireUser();
  const prodRef = doc(db, 'products', product.id);
  try {
    await updateDoc(prodRef, {
      productCode: sanitizeCode(updates.productCode ?? product.productCode, 'PRD'),
      name: clampString(updates.name ?? product.name, 120),
      category: clampString(updates.category ?? product.category, 60),
      unit: updates.unit ?? product.unit,
      rate: Math.max(0, toSafeNumber(updates.rate ?? product.rate)),
      defaultLabourRate: Math.max(0, toSafeNumber(updates.defaultLabourRate ?? product.defaultLabourRate)),
      minStockLevel: Math.max(0, toSafeNumber(updates.minStockLevel ?? product.minStockLevel)),
      isActive: updates.isActive ?? product.isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${product.id}`);
    }
    throw err;
  }
}

export async function receiveStock(productId: string, quantity: number, remarks: string): Promise<void> {
  const user = requireUser();
  const qty = toSafeNumber(quantity);
  if (qty <= 0) throw new Error('Received quantity must be greater than zero.');

  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db, 'products', productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists()) throw new Error('Product not found.');

      const data = snap.data() as Product;
      const prevWarehouse = toSafeNumber(data.warehouseStock);
      const nextWarehouse = toSafeNumber(prevWarehouse + qty);
      const nextReceived = toSafeNumber(toSafeNumber(data.stockReceived) + qty);

      tx.update(prodRef, {
        stockReceived: nextReceived,
        warehouseStock: nextWarehouse,
        updatedAt: serverTimestamp(),
      });

      const txId = generateDocId('tx');
      const txRef = doc(db, 'stockTransactions', txId);
      tx.set(txRef, {
        transactionCode: generateSequentialCode('TXN'),
        productId,
        productName: clampString(data.name, 120),
        productCode: clampString(data.productCode, 40),
        type: 'RECEIVE',
        quantity: qty,
        warehouseDelta: qty,
        employeeHeldDelta: 0,
        finishedGoodsDelta: 0,
        damagedDelta: 0,
        previousWarehouseStock: prevWarehouse,
        newWarehouseStock: nextWarehouse,
        employeeId: '',
        employeeName: '',
        referenceId: '',
        remarks: clampString(remarks || 'Stock received into warehouse', 500),
        isAuthorizedAdjustment: false,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
    }
    throw err;
  }
}

export interface StockAdjustmentInput {
  productId: string;
  adjustmentType: 'DAMAGE_DEDUCTION' | 'AUTHORIZED_ADJUSTMENT';
  deltaQuantity: number; // negative deducts warehouse, positive adds (only for AUTHORIZED_ADJUSTMENT)
  remarks: string;
  allowNegativeOverride: boolean;
  isAdmin: boolean;
}

export async function recordStockAdjustment(input: StockAdjustmentInput): Promise<void> {
  const user = requireUser();
  if (!input.isAdmin) {
    throw new Error('Only an authorized administrator can perform stock adjustments.');
  }
  const delta = toSafeNumber(input.deltaQuantity);
  if (delta === 0) throw new Error('Adjustment quantity cannot be zero.');
  if (input.adjustmentType === 'DAMAGE_DEDUCTION' && delta > 0) {
    throw new Error('Damage deduction must reduce warehouse stock (use negative or positive deduction qty).');
  }
  if (!input.remarks.trim()) {
    throw new Error('Audit remarks are required for stock adjustments.');
  }

  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db, 'products', input.productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists()) throw new Error('Product not found.');

      const data = snap.data() as Product;
      const prevWarehouse = toSafeNumber(data.warehouseStock);
      const nextWarehouse = toSafeNumber(prevWarehouse + delta);

      if (nextWarehouse < 0 && !input.allowNegativeOverride) {
        throw new Error('Stock cannot become negative without an authorized negative-stock override enabled in Settings.');
      }

      const deductionAbs = delta < 0 ? Math.abs(delta) : 0;
      const additionAbs = delta > 0 ? delta : 0;

      tx.update(prodRef, {
        warehouseStock: nextWarehouse,
        stockReceived: toSafeNumber(toSafeNumber(data.stockReceived) + additionAbs),
        otherDeductions: toSafeNumber(toSafeNumber(data.otherDeductions) + deductionAbs),
        damagedStock:
          input.adjustmentType === 'DAMAGE_DEDUCTION'
            ? toSafeNumber(toSafeNumber(data.damagedStock) + deductionAbs)
            : toSafeNumber(data.damagedStock),
        updatedAt: serverTimestamp(),
      });

      const txId = generateDocId('tx');
      const txRef = doc(db, 'stockTransactions', txId);
      tx.set(txRef, {
        transactionCode: generateSequentialCode('ADJ'),
        productId: input.productId,
        productName: clampString(data.name, 120),
        productCode: clampString(data.productCode, 40),
        type: input.adjustmentType,
        quantity: Math.abs(delta),
        warehouseDelta: delta,
        employeeHeldDelta: 0,
        finishedGoodsDelta: 0,
        damagedDelta: input.adjustmentType === 'DAMAGE_DEDUCTION' ? deductionAbs : 0,
        previousWarehouseStock: prevWarehouse,
        newWarehouseStock: nextWarehouse,
        employeeId: '',
        employeeName: '',
        referenceId: '',
        remarks: clampString(input.remarks, 500),
        isAuthorizedAdjustment: true,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });

      const logId = generateDocId('log');
      tx.set(doc(db, 'auditLogs', logId), {
        action: input.adjustmentType,
        entityType: 'Product',
        entityId: input.productId,
        summary: `${data.name} (${data.productCode}) adjusted by ${delta} ${data.unit}. Reason: ${clampString(input.remarks, 250)}`,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `products/${input.productId}`);
    }
    throw err;
  }
}

export async function deleteProduct(product: Product, linkedSubProductsCount = 0): Promise<void> {
  const user = requireUser();
  if (product.employeeHeldStock > 0) {
    throw new Error('Cannot delete a product that currently has stock held by employees.');
  }
  if (linkedSubProductsCount > 0) {
    throw new Error('Delete all sub-products under this main product before deleting the main product.');
  }
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'products', product.id));
    batch.set(doc(db, 'auditLogs', generateDocId('log')), {
      action: 'DELETE_PRODUCT',
      entityType: 'Product',
      entityId: product.id,
      summary: `Deleted product ${product.name} (${product.productCode})`,
      performedBy: user.uid,
      performedByEmail: clampString(user.email || '', 160),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `products/${product.id}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------
// SUB-PRODUCTS (UNDER MAIN PRODUCTS)
// ---------------------------------------------------------

export interface CreateSubProductInput {
  parentProductId: string;
  subProductCode: string;
  name: string;
  unit: ProductUnit;
  rate: number;
  labourRate: number;
  description: string;
}

export async function createSubProduct(input: CreateSubProductInput): Promise<string> {
  const user = requireUser();
  if (!input.parentProductId) {
    throw new Error('Please select a Main Product.');
  }
  const subProductId = generateDocId('sub');
  const code = sanitizeCode(input.subProductCode, 'SUB');
  const name = clampString(input.name, 120);
  if (!name) throw new Error('Sub-product name is required.');

  try {
    await runTransaction(db, async (tx) => {
      const parentRef = doc(db, 'products', input.parentProductId);
      const parentSnap = await tx.get(parentRef);
      if (!parentSnap.exists()) {
        throw new Error('Selected main product no longer exists.');
      }
      const parent = parentSnap.data() as Product;

      tx.set(doc(db, 'subProducts', subProductId), {
        parentProductId: input.parentProductId,
        parentProductCode: clampString(parent.productCode, 40),
        parentProductName: clampString(parent.name, 120),
        subProductCode: code,
        name,
        unit: input.unit,
        rate: Math.max(0, toSafeNumber(input.rate)),
        labourRate: Math.max(0, toSafeNumber(input.labourRate)),
        description: clampString(input.description, 300),
        totalIssued: 0,
        totalCompleted: 0,
        totalEarned: 0,
        isActive: true,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return subProductId;
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.CREATE, `subProducts/${subProductId}`);
    }
    throw err;
  }
}

export async function updateSubProduct(
  subProduct: SubProduct,
  updates: Partial<Pick<SubProduct, 'subProductCode' | 'name' | 'unit' | 'rate' | 'labourRate' | 'description' | 'isActive'>>
): Promise<void> {
  requireUser();
  const nextName = clampString(updates.name ?? subProduct.name, 120);
  if (!nextName) throw new Error('Sub-product name is required.');
  try {
    await updateDoc(doc(db, 'subProducts', subProduct.id), {
      subProductCode: sanitizeCode(updates.subProductCode ?? subProduct.subProductCode, 'SUB'),
      name: nextName,
      unit: updates.unit ?? subProduct.unit,
      rate: Math.max(0, toSafeNumber(updates.rate ?? subProduct.rate)),
      labourRate: Math.max(0, toSafeNumber(updates.labourRate ?? subProduct.labourRate)),
      description: clampString(updates.description ?? subProduct.description, 300),
      isActive: updates.isActive ?? subProduct.isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `subProducts/${subProduct.id}`);
    }
    throw err;
  }
}

export async function deleteSubProduct(subProduct: SubProduct): Promise<void> {
  const user = requireUser();
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'subProducts', subProduct.id));
    batch.set(doc(db, 'auditLogs', generateDocId('log')), {
      action: 'DELETE_SUB_PRODUCT',
      entityType: 'SubProduct',
      entityId: subProduct.id,
      summary: `Deleted sub-product ${subProduct.name} (${subProduct.subProductCode}) under ${subProduct.parentProductName}`,
      performedBy: user.uid,
      performedByEmail: clampString(user.email || '', 160),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `subProducts/${subProduct.id}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------
// EMPLOYEE MANAGEMENT
// ---------------------------------------------------------

export interface EmployeeInput {
  employeeCode: string;
  name: string;
  phone: string;
  address: string;
  joiningDate: string;
  workCategory: string;
  paymentType: PaymentType;
  perPieceRate: number;
  status: EmployeeStatus;
}

export async function createEmployee(input: EmployeeInput): Promise<string> {
  const user = requireUser();
  const employeeId = generateDocId('emp');
  const code = sanitizeCode(input.employeeCode, 'EMP');
  const name = clampString(input.name, 100);
  if (!name) throw new Error('Employee name is required.');

  try {
    await setDoc(doc(db, 'employees', employeeId), {
      employeeCode: code,
      name,
      phone: clampString(input.phone, 30),
      address: clampString(input.address, 300),
      joiningDate: clampString(input.joiningDate, 20),
      workCategory: clampString(input.workCategory, 60),
      paymentType: input.paymentType,
      perPieceRate: Math.max(0, toSafeNumber(input.perPieceRate)),
      status: input.status,
      totalStockReceived: 0,
      totalWorkCompleted: 0,
      totalAcceptedQty: 0,
      totalRejectedQty: 0,
      totalUnusedReturned: 0,
      currentMaterialBalance: 0,
      totalApprovedEarnings: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return employeeId;
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.CREATE, `employees/${employeeId}`);
    }
    throw err;
  }
}

export async function updateEmployee(employee: Employee, input: EmployeeInput): Promise<void> {
  requireUser();
  const name = clampString(input.name, 100);
  if (!name) throw new Error('Employee name is required.');

  try {
    await updateDoc(doc(db, 'employees', employee.id), {
      employeeCode: sanitizeCode(input.employeeCode, 'EMP'),
      name,
      phone: clampString(input.phone, 30),
      address: clampString(input.address, 300),
      joiningDate: clampString(input.joiningDate, 20),
      workCategory: clampString(input.workCategory, 60),
      paymentType: input.paymentType,
      perPieceRate: Math.max(0, toSafeNumber(input.perPieceRate)),
      status: input.status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `employees/${employee.id}`);
    }
    throw err;
  }
}

export async function toggleEmployeeStatus(employee: Employee): Promise<void> {
  requireUser();
  const nextStatus: EmployeeStatus = employee.status === 'Active' ? 'Inactive' : 'Active';
  try {
    await updateDoc(doc(db, 'employees', employee.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `employees/${employee.id}`);
    }
    throw err;
  }
}

export async function deleteEmployee(employee: Employee): Promise<void> {
  const user = requireUser();
  if (employee.currentMaterialBalance > 0) {
    throw new Error('Cannot delete an employee who currently holds unreturned factory material.');
  }
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'employees', employee.id));
    batch.set(doc(db, 'auditLogs', generateDocId('log')), {
      action: 'DELETE_EMPLOYEE',
      entityType: 'Employee',
      entityId: employee.id,
      summary: `Deleted employee ${employee.name} (${employee.employeeCode})`,
      performedBy: user.uid,
      performedByEmail: clampString(user.email || '', 160),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `employees/${employee.id}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------
// STOCK ISSUE & TASK ASSIGNMENT
// ---------------------------------------------------------

export interface IssueTaskInput {
  employeeId: string;
  productId: string;
  subProductId?: string;
  quantityIssued: number;
  perUnitRate: number;
  issueDate: string;
  expectedCompletionDate: string;
  notes: string;
}

export async function issueStockTask(input: IssueTaskInput): Promise<string> {
  const user = requireUser();
  const qty = toSafeNumber(input.quantityIssued);
  const rate = Math.max(0, toSafeNumber(input.perUnitRate));

  if (qty <= 0) throw new Error('Issued quantity must be greater than zero.');
  if (!input.employeeId || !input.productId) {
    throw new Error('Both Employee and Main Product must be selected.');
  }

  const taskId = generateDocId('task');
  const issueCode = generateSequentialCode('ISS');

  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db, 'products', input.productId);
      const empRef = doc(db, 'employees', input.employeeId);
      const subProdRef = input.subProductId ? doc(db, 'subProducts', input.subProductId) : null;

      const [prodSnap, empSnap, subProdSnap] = await Promise.all([
        tx.get(prodRef),
        tx.get(empRef),
        subProdRef ? tx.get(subProdRef) : Promise.resolve(null),
      ]);
      if (!prodSnap.exists()) throw new Error('Selected main product does not exist.');
      if (!empSnap.exists()) throw new Error('Selected employee does not exist.');
      if (subProdRef && (!subProdSnap || !subProdSnap.exists())) {
        throw new Error('Selected sub-product does not exist.');
      }

      const prod = prodSnap.data() as Product;
      const emp = empSnap.data() as Employee;
      const subProd = subProdSnap?.exists() ? (subProdSnap.data() as SubProduct) : null;

      if (subProd && subProd.parentProductId !== input.productId) {
        throw new Error('Selected sub-product does not belong to the chosen main product.');
      }

      if (emp.status !== 'Active') {
        throw new Error(`Cannot issue stock to inactive employee ${emp.name}.`);
      }

      const prevWarehouse = toSafeNumber(prod.warehouseStock);
      if (qty > prevWarehouse) {
        throw new Error(
          `Insufficient warehouse stock for ${prod.name}. Available: ${prevWarehouse} ${prod.unit}, Requested: ${qty} ${prod.unit}.`
        );
      }

      const nextWarehouse = toSafeNumber(prevWarehouse - qty);
      const nextStockIssued = toSafeNumber(toSafeNumber(prod.stockIssued) + qty);
      const nextEmployeeHeld = toSafeNumber(toSafeNumber(prod.employeeHeldStock) + qty);

      tx.update(prodRef, {
        warehouseStock: nextWarehouse,
        stockIssued: nextStockIssued,
        employeeHeldStock: nextEmployeeHeld,
        updatedAt: serverTimestamp(),
      });

      tx.update(empRef, {
        totalStockReceived: toSafeNumber(toSafeNumber(emp.totalStockReceived) + qty),
        currentMaterialBalance: toSafeNumber(toSafeNumber(emp.currentMaterialBalance) + qty),
        updatedAt: serverTimestamp(),
      });

      if (subProdRef && subProd) {
        tx.update(subProdRef, {
          totalIssued: toSafeNumber(toSafeNumber(subProd.totalIssued) + qty),
          updatedAt: serverTimestamp(),
        });
      }

      const taskRef = doc(db, 'tasks', taskId);
      tx.set(taskRef, {
        issueCode,
        employeeId: input.employeeId,
        employeeCode: clampString(emp.employeeCode, 40),
        employeeName: clampString(emp.name, 100),
        productId: input.productId,
        productCode: clampString(prod.productCode, 40),
        productName: clampString(prod.name, 120),
        subProductId: subProd ? clampString(input.subProductId || '', 128) : '',
        subProductCode: subProd ? clampString(subProd.subProductCode, 40) : '',
        subProductName: subProd ? clampString(subProd.name, 120) : '',
        unit: clampString(subProd ? subProd.unit : prod.unit, 20),
        quantityIssued: qty,
        perUnitRate: rate,
        totalExpectedPayment: toSafeNumber(qty * rate),
        issueDate: clampString(input.issueDate, 20),
        expectedCompletionDate: clampString(input.expectedCompletionDate, 20),
        notes: clampString(input.notes, 500),
        completedAcceptedQty: 0,
        completedRejectedQty: 0,
        approvedRejectedQty: 0,
        returnedUnusedQty: 0,
        pendingQty: qty,
        earnedAmount: 0,
        status: 'Pending',
        paymentStatus: 'Unpaid',
        lastCompletionDate: '',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const subLabel = subProd ? ` [${subProd.name}]` : '';
      const txRef = doc(db, 'stockTransactions', generateDocId('tx'));
      tx.set(txRef, {
        transactionCode: generateSequentialCode('TXN'),
        productId: input.productId,
        productName: clampString(prod.name, 120),
        productCode: clampString(prod.productCode, 40),
        type: 'ISSUE',
        quantity: qty,
        warehouseDelta: -qty,
        employeeHeldDelta: qty,
        finishedGoodsDelta: 0,
        damagedDelta: 0,
        previousWarehouseStock: prevWarehouse,
        newWarehouseStock: nextWarehouse,
        employeeId: input.employeeId,
        employeeName: clampString(emp.name, 100),
        referenceId: issueCode,
        remarks: clampString(input.notes || `Issued${subLabel} to ${emp.name} (${issueCode})`, 500),
        isAuthorizedAdjustment: false,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    });

    return taskId;
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `tasks/${taskId}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------
// WORK COMPLETION (MULTIPLE INSTALLMENTS SUPPORTED)
// ---------------------------------------------------------

export interface WorkCompletionInput {
  taskId: string;
  acceptedQty: number;
  rejectedQty: number;
  unusedReturnedQty: number;
  completionDate: string;
  remarks: string;
}

export async function recordWorkCompletion(input: WorkCompletionInput): Promise<string> {
  const user = requireUser();
  const accepted = Math.max(0, toSafeNumber(input.acceptedQty));
  const rejected = Math.max(0, toSafeNumber(input.rejectedQty));
  const unusedReturned = Math.max(0, toSafeNumber(input.unusedReturnedQty));
  const totalProcessed = toSafeNumber(accepted + rejected + unusedReturned);

  if (totalProcessed <= 0) {
    throw new Error('Enter at least one non-zero quantity (Accepted, Rejected, or Unused Returned).');
  }

  const completionId = generateDocId('cmp');
  const completionCode = generateSequentialCode('CMP');

  try {
    await runTransaction(db, async (tx) => {
      const taskRef = doc(db, 'tasks', input.taskId);
      const taskSnap = await tx.get(taskRef);
      if (!taskSnap.exists()) throw new Error('Task / Stock Issue record not found.');

      const task = taskSnap.data() as Task;
      const prodRef = doc(db, 'products', task.productId);
      const empRef = doc(db, 'employees', task.employeeId);
      const subProdRef = task.subProductId ? doc(db, 'subProducts', task.subProductId) : null;

      const [prodSnap, empSnap, subProdSnap] = await Promise.all([
        tx.get(prodRef),
        tx.get(empRef),
        subProdRef ? tx.get(subProdRef) : Promise.resolve(null),
      ]);
      if (!prodSnap.exists()) throw new Error('Associated product record not found.');
      if (!empSnap.exists()) throw new Error('Associated employee record not found.');

      const prod = prodSnap.data() as Product;
      const emp = empSnap.data() as Employee;
      const subProd = subProdSnap?.exists() ? (subProdSnap.data() as SubProduct) : null;

      const prevPending = toSafeNumber(task.pendingQty);
      if (totalProcessed > prevPending) {
        throw new Error(
          `Processed total (${totalProcessed}) exceeds remaining pending quantity (${prevPending} ${task.unit}).`
        );
      }

      const newlyCompleted = toSafeNumber(accepted + rejected);
      const remainingWork = Math.max(0, toSafeNumber(prevPending - totalProcessed));
      const earnedThisEntry = toSafeNumber(accepted * toSafeNumber(task.perUnitRate));

      // Update Task
      const nextAccepted = toSafeNumber(toSafeNumber(task.completedAcceptedQty) + accepted);
      const nextRejected = toSafeNumber(toSafeNumber(task.completedRejectedQty) + rejected);
      const nextReturned = toSafeNumber(toSafeNumber(task.returnedUnusedQty) + unusedReturned);
      const nextEarned = toSafeNumber(toSafeNumber(task.earnedAmount) + earnedThisEntry);
      const nextStatus = remainingWork === 0 ? 'Completed' : 'In Progress';

      tx.update(taskRef, {
        completedAcceptedQty: nextAccepted,
        completedRejectedQty: nextRejected,
        returnedUnusedQty: nextReturned,
        pendingQty: remainingWork,
        earnedAmount: nextEarned,
        status: nextStatus,
        lastCompletionDate: clampString(input.completionDate, 20),
        updatedAt: serverTimestamp(),
      });

      // Update Product inventory
      const prevWarehouse = toSafeNumber(prod.warehouseStock);
      const nextWarehouse = toSafeNumber(prevWarehouse + unusedReturned);
      const nextReturnedStock = toSafeNumber(toSafeNumber(prod.stockReturned) + unusedReturned);
      const nextEmployeeHeld = Math.max(0, toSafeNumber(toSafeNumber(prod.employeeHeldStock) - totalProcessed));
      const nextFinishedGoods = toSafeNumber(toSafeNumber(prod.finishedGoodsStock) + accepted);
      const nextDamaged = toSafeNumber(toSafeNumber(prod.damagedStock) + rejected);

      tx.update(prodRef, {
        warehouseStock: nextWarehouse,
        stockReturned: nextReturnedStock,
        employeeHeldStock: nextEmployeeHeld,
        finishedGoodsStock: nextFinishedGoods,
        damagedStock: nextDamaged,
        updatedAt: serverTimestamp(),
      });

      // Update Employee ledger
      const nextApprovedEarnings = toSafeNumber(toSafeNumber(emp.totalApprovedEarnings) + earnedThisEntry);
      const currentPaid = toSafeNumber(emp.totalPaid);
      const nextOutstanding = toSafeNumber(nextApprovedEarnings - currentPaid);

      tx.update(empRef, {
        totalWorkCompleted: toSafeNumber(toSafeNumber(emp.totalWorkCompleted) + newlyCompleted),
        totalAcceptedQty: toSafeNumber(toSafeNumber(emp.totalAcceptedQty) + accepted),
        totalRejectedQty: toSafeNumber(toSafeNumber(emp.totalRejectedQty) + rejected),
        totalUnusedReturned: toSafeNumber(toSafeNumber(emp.totalUnusedReturned) + unusedReturned),
        currentMaterialBalance: Math.max(0, toSafeNumber(toSafeNumber(emp.currentMaterialBalance) - totalProcessed)),
        totalApprovedEarnings: nextApprovedEarnings,
        outstandingBalance: nextOutstanding,
        updatedAt: serverTimestamp(),
      });

      if (subProdRef && subProd) {
        tx.update(subProdRef, {
          totalCompleted: toSafeNumber(toSafeNumber(subProd.totalCompleted) + accepted),
          totalEarned: toSafeNumber(toSafeNumber(subProd.totalEarned) + earnedThisEntry),
          updatedAt: serverTimestamp(),
        });
      }

      // Create WorkCompletion installment record
      tx.set(doc(db, 'workCompletions', completionId), {
        completionCode,
        taskId: input.taskId,
        issueCode: clampString(task.issueCode, 60),
        employeeId: task.employeeId,
        employeeName: clampString(task.employeeName, 100),
        productId: task.productId,
        productName: clampString(task.productName, 120),
        subProductId: clampString(task.subProductId || '', 128),
        subProductCode: clampString(task.subProductCode || '', 40),
        subProductName: clampString(task.subProductName || '', 120),
        previouslyPendingQty: prevPending,
        newlyCompletedQty: newlyCompleted,
        acceptedQty: accepted,
        rejectedQty: rejected,
        rejectedApprovedForPay: false,
        rejectedApprovalBy: '',
        unusedReturnedQty: unusedReturned,
        remainingWorkQty: remainingWork,
        perUnitRate: toSafeNumber(task.perUnitRate),
        earnedAmount: earnedThisEntry,
        completionDate: clampString(input.completionDate, 20),
        remarks: clampString(input.remarks, 500),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      // Create immutable StockTransactions for each movement type
      if (accepted > 0) {
        tx.set(doc(db, 'stockTransactions', generateDocId('tx')), {
          transactionCode: generateSequentialCode('TXN'),
          productId: task.productId,
          productName: clampString(prod.name, 120),
          productCode: clampString(prod.productCode, 40),
          type: 'WORK_ACCEPTED',
          quantity: accepted,
          warehouseDelta: 0,
          employeeHeldDelta: -accepted,
          finishedGoodsDelta: accepted,
          damagedDelta: 0,
          previousWarehouseStock: prevWarehouse,
          newWarehouseStock: prevWarehouse,
          employeeId: task.employeeId,
          employeeName: clampString(emp.name, 100),
          referenceId: completionCode,
          remarks: clampString(`Finished goods accepted from ${emp.name} (${task.issueCode})`, 500),
          isAuthorizedAdjustment: false,
          performedBy: user.uid,
          performedByEmail: clampString(user.email || '', 160),
          createdAt: serverTimestamp(),
        });
      }

      if (rejected > 0) {
        tx.set(doc(db, 'stockTransactions', generateDocId('tx')), {
          transactionCode: generateSequentialCode('TXN'),
          productId: task.productId,
          productName: clampString(prod.name, 120),
          productCode: clampString(prod.productCode, 40),
          type: 'WORK_REJECTED',
          quantity: rejected,
          warehouseDelta: 0,
          employeeHeldDelta: -rejected,
          finishedGoodsDelta: 0,
          damagedDelta: rejected,
          previousWarehouseStock: prevWarehouse,
          newWarehouseStock: prevWarehouse,
          employeeId: task.employeeId,
          employeeName: clampString(emp.name, 100),
          referenceId: completionCode,
          remarks: clampString(`Rejected pieces recorded from ${emp.name} (${task.issueCode})`, 500),
          isAuthorizedAdjustment: false,
          performedBy: user.uid,
          performedByEmail: clampString(user.email || '', 160),
          createdAt: serverTimestamp(),
        });
      }

      if (unusedReturned > 0) {
        tx.set(doc(db, 'stockTransactions', generateDocId('tx')), {
          transactionCode: generateSequentialCode('TXN'),
          productId: task.productId,
          productName: clampString(prod.name, 120),
          productCode: clampString(prod.productCode, 40),
          type: 'RETURN_UNUSED',
          quantity: unusedReturned,
          warehouseDelta: unusedReturned,
          employeeHeldDelta: -unusedReturned,
          finishedGoodsDelta: 0,
          damagedDelta: 0,
          previousWarehouseStock: prevWarehouse,
          newWarehouseStock: nextWarehouse,
          employeeId: task.employeeId,
          employeeName: clampString(emp.name, 100),
          referenceId: completionCode,
          remarks: clampString(`Unused material returned to warehouse by ${emp.name} (${task.issueCode})`, 500),
          isAuthorizedAdjustment: false,
          performedBy: user.uid,
          performedByEmail: clampString(user.email || '', 160),
          createdAt: serverTimestamp(),
        });
      }
    });

    return completionId;
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `workCompletions/${completionId}`);
    }
    throw err;
  }
}

export async function approveRejectedPayment(completion: WorkCompletion, isAdmin: boolean): Promise<void> {
  const user = requireUser();
  if (!isAdmin) {
    throw new Error('Only an authorized administrator can approve payment for rejected pieces.');
  }
  if (completion.rejectedApprovedForPay || completion.rejectedQty <= 0) {
    throw new Error('This completion entry has no unapproved rejected pieces.');
  }

  const bonus = toSafeNumber(completion.rejectedQty * completion.perUnitRate);

  try {
    await runTransaction(db, async (tx) => {
      const cmpRef = doc(db, 'workCompletions', completion.id);
      const taskRef = doc(db, 'tasks', completion.taskId);
      const empRef = doc(db, 'employees', completion.employeeId);
      const subProdRef = completion.subProductId
        ? doc(db, 'subProducts', completion.subProductId)
        : null;

      const [cmpSnap, taskSnap, empSnap, subProdSnap] = await Promise.all([
        tx.get(cmpRef),
        tx.get(taskRef),
        tx.get(empRef),
        subProdRef ? tx.get(subProdRef) : Promise.resolve(null),
      ]);

      if (!cmpSnap.exists() || !taskSnap.exists() || !empSnap.exists()) {
        throw new Error('Referenced completion, task, or employee record no longer exists.');
      }

      const taskData = taskSnap.data() as Task;
      const empData = empSnap.data() as Employee;
      const subProd = subProdSnap?.exists() ? (subProdSnap.data() as SubProduct) : null;

      tx.update(cmpRef, {
        rejectedApprovedForPay: true,
        rejectedApprovalBy: clampString(user.email || user.uid, 160),
        earnedAmount: toSafeNumber(toSafeNumber(completion.earnedAmount) + bonus),
        remarks: clampString(`${completion.remarks ? completion.remarks + ' · ' : ''}Rejected qty approved for pay by ${user.email}`, 500),
      });

      tx.update(taskRef, {
        approvedRejectedQty: toSafeNumber(toSafeNumber(taskData.approvedRejectedQty) + completion.rejectedQty),
        earnedAmount: toSafeNumber(toSafeNumber(taskData.earnedAmount) + bonus),
        updatedAt: serverTimestamp(),
      });

      const nextEarnings = toSafeNumber(toSafeNumber(empData.totalApprovedEarnings) + bonus);
      tx.update(empRef, {
        totalApprovedEarnings: nextEarnings,
        outstandingBalance: toSafeNumber(nextEarnings - toSafeNumber(empData.totalPaid)),
        updatedAt: serverTimestamp(),
      });

      if (subProdRef && subProd) {
        tx.update(subProdRef, {
          totalEarned: toSafeNumber(toSafeNumber(subProd.totalEarned) + bonus),
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'auditLogs', generateDocId('log')), {
        action: 'APPROVE_REJECTED_PAY',
        entityType: 'WorkCompletion',
        entityId: completion.id,
        summary: `Approved ${completion.rejectedQty} rejected pieces on ${completion.completionCode} (+₹${bonus.toFixed(2)}) for ${completion.employeeName}`,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `workCompletions/${completion.id}`);
    }
    throw err;
  }
}

export async function deleteTask(task: Task): Promise<void> {
  const user = requireUser();
  if (task.completedAcceptedQty > 0 || task.completedRejectedQty > 0 || task.returnedUnusedQty > 0) {
    throw new Error('Cannot delete a task that already has recorded work completions or returns.');
  }

  try {
    await runTransaction(db, async (tx) => {
      const taskRef = doc(db, 'tasks', task.id);
      const prodRef = doc(db, 'products', task.productId);
      const empRef = doc(db, 'employees', task.employeeId);
      const subProdRef = task.subProductId ? doc(db, 'subProducts', task.subProductId) : null;

      const [prodSnap, empSnap, subProdSnap] = await Promise.all([
        tx.get(prodRef),
        tx.get(empRef),
        subProdRef ? tx.get(subProdRef) : Promise.resolve(null),
      ]);
      if (prodSnap.exists()) {
        const prod = prodSnap.data() as Product;
        const prevW = toSafeNumber(prod.warehouseStock);
        const nextW = toSafeNumber(prevW + task.quantityIssued);
        tx.update(prodRef, {
          warehouseStock: nextW,
          stockIssued: Math.max(0, toSafeNumber(toSafeNumber(prod.stockIssued) - task.quantityIssued)),
          employeeHeldStock: Math.max(0, toSafeNumber(toSafeNumber(prod.employeeHeldStock) - task.quantityIssued)),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'stockTransactions', generateDocId('tx')), {
          transactionCode: generateSequentialCode('REV'),
          productId: task.productId,
          productName: clampString(prod.name, 120),
          productCode: clampString(prod.productCode, 40),
          type: 'AUTHORIZED_ADJUSTMENT',
          quantity: task.quantityIssued,
          warehouseDelta: task.quantityIssued,
          employeeHeldDelta: -task.quantityIssued,
          finishedGoodsDelta: 0,
          damagedDelta: 0,
          previousWarehouseStock: prevW,
          newWarehouseStock: nextW,
          employeeId: task.employeeId,
          employeeName: clampString(task.employeeName, 100),
          referenceId: task.issueCode,
          remarks: `Reversed cancelled task ${task.issueCode}`,
          isAuthorizedAdjustment: true,
          performedBy: user.uid,
          performedByEmail: clampString(user.email || '', 160),
          createdAt: serverTimestamp(),
        });
      }

      if (empSnap.exists()) {
        const emp = empSnap.data() as Employee;
        tx.update(empRef, {
          totalStockReceived: Math.max(0, toSafeNumber(toSafeNumber(emp.totalStockReceived) - task.quantityIssued)),
          currentMaterialBalance: Math.max(0, toSafeNumber(toSafeNumber(emp.currentMaterialBalance) - task.quantityIssued)),
          updatedAt: serverTimestamp(),
        });
      }

      if (subProdRef && subProdSnap?.exists()) {
        const subProd = subProdSnap.data() as SubProduct;
        tx.update(subProdRef, {
          totalIssued: Math.max(0, toSafeNumber(toSafeNumber(subProd.totalIssued) - task.quantityIssued)),
          updatedAt: serverTimestamp(),
        });
      }

      tx.delete(taskRef);
      tx.set(doc(db, 'auditLogs', generateDocId('log')), {
        action: 'DELETE_TASK',
        entityType: 'Task',
        entityId: task.id,
        summary: `Cancelled & deleted task ${task.issueCode} (${task.quantityIssued} ${task.unit} of ${task.productName})`,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${task.id}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------
// EMPLOYEE PAYMENT LEDGER
// ---------------------------------------------------------

export interface RecordPaymentInput {
  employeeId: string;
  amount: number;
  paymentType: LedgerPaymentType;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  notes: string;
  isPaymentDone: boolean;
}

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const user = requireUser();
  const amount = toSafeNumber(input.amount);
  if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
  if (!input.employeeId) throw new Error('Please select an employee.');

  const paymentId = generateDocId('pay');
  const paymentCode = generateSequentialCode('PAY');

  try {
    await runTransaction(db, async (tx) => {
      const empRef = doc(db, 'employees', input.employeeId);
      const empSnap = await tx.get(empRef);
      if (!empSnap.exists()) throw new Error('Employee record not found.');

      const emp = empSnap.data() as Employee;
      const prevPaid = toSafeNumber(emp.totalPaid);
      const earnings = toSafeNumber(emp.totalApprovedEarnings);
      const prevOutstanding = toSafeNumber(earnings - prevPaid);
      const nextPaid = toSafeNumber(prevPaid + amount);
      const nextOutstanding = toSafeNumber(earnings - nextPaid);

      tx.update(empRef, {
        totalPaid: nextPaid,
        outstandingBalance: nextOutstanding,
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'payments', paymentId), {
        paymentCode,
        employeeId: input.employeeId,
        employeeCode: clampString(emp.employeeCode, 40),
        employeeName: clampString(emp.name, 100),
        amount,
        paymentType: input.paymentType,
        paymentDate: clampString(input.paymentDate, 20),
        paymentMethod: input.paymentMethod,
        paymentReference: clampString(input.paymentReference, 100),
        notes: clampString(input.notes, 300),
        previousBalance: prevOutstanding,
        remainingBalanceAfter: nextOutstanding,
        isPaymentDone: Boolean(input.isPaymentDone),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
    });

    return paymentId;
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `payments/${paymentId}`);
    }
    throw err;
  }
}

export async function togglePaymentDone(paymentId: string, isPaymentDone: boolean): Promise<void> {
  requireUser();
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      isPaymentDone: Boolean(isPaymentDone),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${paymentId}`);
    }
    throw err;
  }
}

export async function deletePayment(paymentId: string, employeeId: string, amount: number, paymentCode: string): Promise<void> {
  const user = requireUser();
  try {
    await runTransaction(db, async (tx) => {
      const empRef = doc(db, 'employees', employeeId);
      const payRef = doc(db, 'payments', paymentId);
      const empSnap = await tx.get(empRef);

      if (empSnap.exists()) {
        const emp = empSnap.data() as Employee;
        const nextPaid = Math.max(0, toSafeNumber(toSafeNumber(emp.totalPaid) - amount));
        const nextOutstanding = toSafeNumber(toSafeNumber(emp.totalApprovedEarnings) - nextPaid);
        tx.update(empRef, {
          totalPaid: nextPaid,
          outstandingBalance: nextOutstanding,
          updatedAt: serverTimestamp(),
        });
      }

      tx.delete(payRef);
      tx.set(doc(db, 'auditLogs', generateDocId('log')), {
        action: 'DELETE_PAYMENT',
        entityType: 'Payment',
        entityId: paymentId,
        summary: `Deleted payment ${paymentCode} (₹${amount.toFixed(2)}) and restored employee balance`,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `payments/${paymentId}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------
// SETTINGS & ADMIN MANAGEMENT
// ---------------------------------------------------------

export async function saveCompanySettings(settings: Omit<CompanySettings, 'id' | 'updatedBy' | 'updatedAt'>): Promise<void> {
  const user = requireUser();
  try {
    const loginId = clampString(settings.adminLoginId || 'admin', 60);
    const pwdHash = clampString(
      settings.adminPasswordHash || (await sha256Hex('Admin@123')),
      128
    );
    await setDoc(doc(db, 'settings', 'company_profile'), {
      companyName: clampString(settings.companyName || 'Chandramukhi Implex Pvt. Ltd.', 120),
      tagline: clampString(settings.tagline, 160),
      address: clampString(settings.address, 300),
      phone: clampString(settings.phone, 30),
      email: clampString(settings.email, 160),
      gstin: clampString(settings.gstin, 30),
      defaultLowStockThreshold: Math.max(0, toSafeNumber(settings.defaultLowStockThreshold)),
      allowNegativeStockOverride: Boolean(settings.allowNegativeStockOverride),
      adminLoginId: loginId,
      adminPasswordHash: pwdHash,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/company_profile');
    }
    throw err;
  }
}

export async function grantAdminAccess(targetUid: string, targetEmail: string): Promise<void> {
  const user = requireUser();
  const uid = clampString(targetUid, 128);
  if (!uid) throw new Error('User UID is required.');

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', uid), {
      uid,
      email: clampString(targetEmail, 160),
      grantedBy: user.uid,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', uid), {
      role: 'admin',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
    }
    throw err;
  }
}

export async function revokeAdminAccess(targetUid: string): Promise<void> {
  const user = requireUser();
  if (targetUid === user.uid) {
    throw new Error('You cannot revoke your own admin access.');
  }
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'admins', targetUid));
    batch.update(doc(db, 'users', targetUid), {
      role: 'staff',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, `admins/${targetUid}`);
    }
    throw err;
  }
}

export async function toggleUserActive(targetUid: string, isActive: boolean): Promise<void> {
  requireUser();
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
    throw err;
  }
}

export interface ResetAllDataOptions {
  isAdmin: boolean;
  resetSettings: boolean;
  clearAuditLogs: boolean;
}

export async function resetAllErpData(
  options: ResetAllDataOptions
): Promise<{ deletedCount: number }> {
  const user = requireUser();
  if (!options.isAdmin) {
    throw new Error('Only an administrator can reset system data.');
  }

  const isBootstrapped =
    (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const targets: Array<{ col: string; ownerField: string }> = [
    { col: 'workCompletions', ownerField: 'createdBy' },
    { col: 'tasks', ownerField: 'createdBy' },
    { col: 'payments', ownerField: 'createdBy' },
    { col: 'stockTransactions', ownerField: 'performedBy' },
    { col: 'subProducts', ownerField: 'createdBy' },
    { col: 'products', ownerField: 'createdBy' },
    { col: 'employees', ownerField: 'createdBy' },
  ];

  if (options.clearAuditLogs) {
    targets.push({ col: 'auditLogs', ownerField: 'performedBy' });
  }

  let deletedCount = 0;

  try {
    for (const target of targets) {
      const colRef = collection(db, target.col);
      const q = isBootstrapped
        ? colRef
        : query(colRef, where(target.ownerField, '==', user.uid));
      const snap = await getDocs(q);
      const refs = snap.docs.map((d) => d.ref);

      for (let i = 0; i < refs.length; i += 400) {
        const chunk = refs.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
        deletedCount += chunk.length;
      }
    }

    if (options.resetSettings) {
      const defaultPwdHash = await sha256Hex('Admin@123');
      await saveCompanySettings({
        companyName: 'Chandramukhi Implex Pvt. Ltd.',
        tagline: 'Garments Manufacturing & Apparel Production ERP',
        address: 'Industrial Garment Zone, Sector 4, India',
        phone: '+91 98000 00000',
        email: 'operations@chandramukhiimplex.com',
        gstin: '',
        defaultLowStockThreshold: 50,
        allowNegativeStockOverride: false,
        adminLoginId: 'admin',
        adminPasswordHash: defaultPwdHash,
      });
      try {
        localStorage.removeItem('cm_admin_creds_v2');
        localStorage.removeItem('cm_admin_creds');
      } catch {
        // ignore storage errors
      }
    }

    if (!options.clearAuditLogs) {
      await setDoc(doc(db, 'auditLogs', generateDocId('log')), {
        action: 'FACTORY_RESET',
        entityType: 'System',
        entityId: 'erp_workspace',
        summary: `Full ERP data reset completed (${deletedCount} records removed).`,
        performedBy: user.uid,
        performedByEmail: clampString(user.email || '', 160),
        createdAt: serverTimestamp(),
      });
    }

    return { deletedCount };
  } catch (err) {
    if (isPermissionError(err)) {
      handleFirestoreError(err, OperationType.DELETE, 'factory_reset');
    }
    throw err;
  }
}
