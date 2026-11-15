# Security Specification — Chandramukhi Implex Pvt. Ltd. ERP

## 1. Data Invariants
1. **Verified Identity**: Every read and write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Admin & Ownership Isolation**: Only the bootstrapped admin (`sroy22000@gmail.com`), users listed in `/admins/{uid}`, or the document's `createdBy` owner (`resource.data.createdBy == request.auth.uid`) can access operational records. PII in `/employees` and `/users` is never exposed to unauthenticated or unrelated users.
3. **Strict Schema Enforcement**: Every `create` and `update` must pass `isValid[Entity](incoming())`, enforcing exact allowed keys (`hasAll` + `hasOnly`), string length limits, numeric bounds (e.g. `warehouseStock >= 0`, `amount > 0`), and regex ID guards (`^[a-zA-Z0-9_\-]+$`).
4. **Immutable Audit Trail**: `stockTransactions` and `auditLogs` are append-only (`allow update, delete: if false` for non-admin, and `stockTransactions` cannot be silently deleted even in UI; rules block `update` and `delete` on `stockTransactions` and `auditLogs`).
5. **Relational Integrity**:
   - Creating a `SubProduct` requires `existsAfter(/databases/$(database)/documents/products/$(incoming().parentProductId))`.
   - Creating a `Task` requires `exists(/databases/$(database)/documents/employees/$(incoming().employeeId))` and `exists(/databases/$(database)/documents/products/$(incoming().productId))`.
   - Creating a `WorkCompletion` requires `exists(/databases/$(database)/documents/tasks/$(incoming().taskId))`.
   - Creating a `Payment` requires `exists(/databases/$(database)/documents/employees/$(incoming().employeeId))`.
   - Creating a `StockTransaction` requires `exists(/databases/$(database)/documents/products/$(incoming().productId))` (or `existsAfter` when created atomically alongside a new product).
6. **Temporal Integrity**: `createdAt` must equal `request.time` on create and remain immutable (`incoming().createdAt == existing().createdAt`) on update; `updatedAt` must equal `request.time`.
7. **Self-Role Escalation Prevention**: Non-admin users creating `/users/{uid}` cannot assign `role: 'admin'`; they may only create `'staff'` for their own `uid`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Product Creation**: Anonymous client attempts `create` on `/products/prod1`.
2. **Email Spoofing**: Token with `email: "sroy22000@gmail.com"` and `email_verified: false` attempts `list` on `/employees`.
3. **Ghost Field / Shadow Update**: Authenticated user sends `isVerified: true` or `adminOverride: true` inside `/products/prod1` update.
4. **ID Poisoning**: Client attempts `create` on `/products/../../invalid$id` or a 500-char ID.
5. **Negative Stock Injection**: Client attempts to set `warehouseStock: -50` or `quantityIssued: -10` on `/products` or `/tasks`.
6. **Self-Role Escalation**: Non-admin user attempts `create` on `/users/{uid}` with `role: "admin"` or `create` on `/admins/{uid}`.
7. **Orphaned Task Creation**: Client attempts `create` on `/tasks/t1` referencing non-existent `employeeId: "nonexistent"` or `productId: "nonexistent"`.
8. **Orphaned Payment Creation**: Client attempts `create` on `/payments/p1` with `amount: 0` or referencing non-existent `employeeId`.
9. **Client Timestamp Tampering**: Client sends `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` server timestamp.
10. **Immutable Field Overwrite**: Client attempts to change `createdBy` or `createdAt` during an `update` on `/employees/emp1`.
11. **Audit History Tampering**: Client attempts `delete` or `update` on `/stockTransactions/tx1` or `/auditLogs/log1`.
12. **PII Blanket Read**: Non-admin user attempts `get` on `/employees/emp_owned_by_other` or `/users/other_uid`.
