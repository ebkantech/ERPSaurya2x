# OmegaERP (ERPSaurya2x) — Business Requirements Document (BRQ)

**Version:** 1.0
**Date:** 2026-10-05
**Repository:** `ebkantech/ERPSaurya2x`
**Status:** Reverse-engineered from the current codebase (Django 6.0.5 backend + React SPA frontend)

> This BRQ was produced by reading the live source, data models, URL routing and
> views. It documents what the system **is required to do today** (as built),
> framed as business requirements, so it can serve as a baseline for sign-off,
> gap analysis and future scope. Known defects and risks are **not** listed here —
> they live in the companion document `docs/BREAK_POINTS.md`.

---

## 1. Purpose & Background

OmegaERP is an internal **Enterprise Resource Planning** workspace for a
renewable-energy / EPC (Engineering, Procurement, Construction) business whose
primary line is **solar** (with biogas, infrastructure and pharma divisions
also configured). It centralises vendor onboarding, project distribution,
material master data, procurement (quotations and purchase orders), delivery
and transport tracking, vendor payments, and staff administration.

The product is mid-migration from a legacy **server-rendered Django UI** to a
**React single-page application** that talks to the Django backend over JSON
APIs. Both UIs currently coexist (see `MIGRATION_AUDIT.md`).

## 2. Business Objectives

| # | Objective |
|---|-----------|
| O1 | Maintain a single source of truth for vendors, projects, materials and procurement |
| O2 | Formalise vendor onboarding, including KYC capture and an onboarding-fee collection step |
| O3 | Give each project a controlled work-package distribution across vendors with MW-capacity validation |
| O4 | Track the full procurement lifecycle: quotation → purchase order → delivery → invoice → payment |
| O5 | Enforce role-based access so staff only see and act on the vendors/tasks assigned to them |
| O6 | Provide reporting and an AI assistant over the operational data |
| O7 | Support cloud deployment (Render / Vercel) with PostgreSQL and object storage |

## 3. Stakeholders & Roles

Roles are defined in `permissions/constants.py` and mapped to Django groups:

| Role | Business meaning | Access tier |
|------|------------------|-------------|
| Super Admin / Admin | Full system control, administration module | Admin-like (all vendors/tasks) |
| HR | People/staff administration | Staff |
| Accounts / Accounts Staff | Payments, financial reporting | Staff |
| Purchase Manager / Purchase Staff | Procurement, POs, quotations | Staff |
| Vendor Manager | Vendor onboarding and allocation | Staff |
| Site Staff / Site Engineer | Field/project execution, deliveries | Staff |
| Project Manager | Project distribution and tracking | Staff |
| Viewer | Read-only | Read-only |

**Access model:** Admin-like roles see everything. Other staff see only the
vendors assigned to them through **Vendor Assignments**, and the tasks that
flow from those assignments. Viewers cannot write.

## 4. Scope

### 4.1 In scope (built today)
Vendor registration & master, project master & distribution, material master,
quotation builder, purchase orders (full lifecycle), deliveries, invoices/
challans, vehicle movements, vendor payments (incl. Razorpay onboarding fee),
vendor allocation/assignment, tasks & follow-ups, business documents,
notifications, saved reports, AI assistant (keyword + optional semantic search),
and a 19-screen administration module.

### 4.2 Out of scope / future
Full retirement of the legacy Django template UI; wiring the remaining
mock/hardcoded React screens to live APIs; a standalone vendor-facing portal
(referenced in README but **not present** in this repository).

## 5. Functional Requirements by Module

### FR-1 Authentication & Session
- FR-1.1 Staff authenticate with username/password via `POST /api/auth/login/`.
- FR-1.2 A "remember me" flag controls session expiry (browser-close vs persistent).
- FR-1.3 `GET /api/auth/session/` returns the current user, role and permissions; returns 401 when logged out.
- FR-1.4 `POST /api/auth/logout/` ends the session.
- FR-1.5 The React app guards routes client-side via `PrivateRoute`/`AuthContext`.

### FR-2 Vendor Management
- FR-2.1 Register a vendor with full KYC (company, contact, GST/PAN/Aadhaar, MSME/PF, turnover, bank details + bank-proof file upload ≤5 MB, pdf/jpg/png).
- FR-2.2 Auto-assign a vendor ID (`VPF###`) on creation.
- FR-2.3 List, search (by id/name/company/contact/GST) and filter vendors by status.
- FR-2.4 Update vendor records and resend the registration link.
- FR-2.5 Vendor-create permission is gated by `can_create` on the `vendors` module (admins always allowed) — one shared gate (`permissions.utils.can_create_vendors`) for both creation paths.

### FR-3 Vendor Onboarding Fee (Payments)
- FR-3.1 When Razorpay keys + a non-zero fee are configured, issue a hosted **Payment Link** and email it to the vendor.
- FR-3.2 Reconcile payment via a signed Razorpay **webhook** (`payment_link.paid` / `payment.captured`); idempotent; promotes the vendor to `active` once paid.
- FR-3.3 Offer a **bank-transfer / UPI** alternative using configured company account details.
- FR-3.4 The gateway degrades to "disabled" (never blocks registration) when keys/SDK/fee are absent.

### FR-4 Project Management
- FR-4.1 Maintain a Project Master (auto code `PRJ###`, client, business unit, location, total MW, status).
- FR-4.2 Distribute project work across vendors by **work package** with allocated/completed MW and timelines.
- FR-4.3 Distribution save **validates allocated MW against project capacity** and performs a destructive replace-all of allocations per project.

### FR-5 Material Management
- FR-5.1 Maintain a Material Master (code, work package, specification, qty, MW, rates, HSN, GST%).
- FR-5.2 Bulk-import material master from `.xlsx` (full-table replace) and clear imports.
- FR-5.3 Update a material's work package; expose list/options/create JSON APIs consumed by the React Material list.

### FR-6 Procurement — Quotations
- FR-6.1 Build a quotation (auto number `QTN####`) with client/sender parties and line items (material, unit, qty).
- FR-6.2 Edit while in Draft; **Verify** to lock editing; export a **PDF** (reportlab).
- FR-6.3 **Generate a Purchase Order** from a verified quotation (one-to-one; a quotation can convert only once).

### FR-7 Procurement — Purchase Orders
- FR-7.1 Create a PO (unique number, vendor, division, site, terms, documents, status) with auto vendor-tracking snapshot.
- FR-7.2 Add line items (qty × rate × GST → auto totals) and recompute PO value/outstanding.
- FR-7.3 Record against a PO: reference codes, deliveries, vehicle movements, invoices/challans, payments, business documents, notifications, and activity log entries.
- FR-7.4 Auto-derive PO delivery status, payment status and overall status from item/delivery/payment aggregates (`refresh_progress`).
- FR-7.5 Bulk-generate POs from `.xlsx` or `.pdf` product lists (with a pre-check/validation step).
- FR-7.6 Every write is journalled to PO Activity Log + System Audit Log + Vendor Activity Log.

### FR-8 Deliveries & Transport
- FR-8.1 Track deliveries against PO items with delivered quantities and statuses; roll up to item/PO level.
- FR-8.2 Record invoice/challan documents per delivery.
- FR-8.3 Record vehicle movements linked to deliveries.

### FR-9 Vendor Allocation (Vendor Control)
- FR-9.1 Assign staff to vendors as primary/supporting, with a uniqueness constraint of **one active primary per vendor**.
- FR-9.2 Maintain assignment history on every reassignment.
- FR-9.3 Bulk-assign (manual + Excel upload) and auto-distribute vendors across staff.
- FR-9.4 Provide dashboard, distribution, history and staff-performance views scoped by role.

### FR-10 Tasks & Follow-ups
- FR-10.1 Create vendor tasks, update status, and surface per-user follow-ups, scoped to accessible vendors.

### FR-11 Reporting
- FR-11.1 Produce report datasets (e.g. PO summary, vendor-PO) and allow saving report definitions.

### FR-12 AI Assistant
- FR-12.1 Answer natural-language queries over operational data via `POST /api/chat/` with intent detection and hybrid (keyword + optional semantic) search; semantic search degrades to keyword-only when ML deps are absent.

### FR-13 Administration (19 screens)
- FR-13.1 Profile, account security (password/contact/sessions), notification & personal preferences.
- FR-13.2 Company settings, ERP configuration, appearance/branding, dashboard & security settings.
- FR-13.3 User & role management, permission matrix, master data, audit logs, system health, backup/restore, email & WhatsApp settings, help/support.

## 6. Non-Functional Requirements

| # | Requirement |
|---|-------------|
| NFR-1 | **Security:** role-based authorization; server-side auth on all data endpoints; HTTPS/HSTS, secure cookies, CSRF, nosniff, X-Frame-Options DENY in production. |
| NFR-2 | **Data integrity:** destructive bulk operations (material/project import) run atomically; financial roll-ups computed server-side. |
| NFR-3 | **Auditability:** every procurement and admin write produces a System Audit Log entry. |
| NFR-4 | **Portability:** environment-driven config (`django-environ`); PostgreSQL in production; object storage (Vercel Blob) for uploads when configured. |
| NFR-5 | **Deployability:** WhiteNoise static serving, Gunicorn, `build.sh` runs `collectstatic` + `migrate`; Render/Vercel targets. |
| NFR-6 | **Performance:** list endpoints paginated/filterable; DB connection pooling (`CONN_MAX_AGE`) and health checks. |
| NFR-7 | **Resilience:** optional integrations (Razorpay, semantic search, PDF import) degrade gracefully when their dependencies/keys are absent. |

## 7. Data Model (key entities)

`Vendor`, `ProjectMaster`, `ProjectWorkAllocation`, `WorkPackage`,
`BusinessUnit`, `MaterialMaster`, `MaterialQuotation` (legacy) /
`Quotation`+`QuotationItem` (React), `PurchaseOrder`+`PurchaseOrderItem`+
`PurchaseOrderReferenceCode`+`PurchaseOrderActivityLog`, `Delivery`+
`DeliveryInvoiceChallan`, `VehicleMovement`, `VendorPayment`+
`VendorRegistrationPayment`, `VendorAssignment`+`VendorAssignmentHistory`,
`VendorTask`, `BusinessDocument`+`NotificationLog`, `Notification`,
`SavedReport`, `StaffProfile`, `RolePermission`, `SystemAuditLog`,
`VendorActivityLog`, search `Document`/`ExistingDocument`.

## 8. External Integrations

| Integration | Purpose | Failure mode |
|-------------|---------|--------------|
| Razorpay | Onboarding-fee payment links + webhook reconciliation | Degrades to "disabled" |
| OpenAI / embeddings | AI assistant semantic search | Degrades to keyword search |
| Email (SMTP) | Registration links, test mail | Configurable; no-op if unset |
| Vercel Blob | Private storage for vendor documents | Falls back to local filesystem |
| PostgreSQL / pgvector | Primary datastore + vector index | Falls back to SQLite (see break points) |

## 9. Assumptions & Constraints

- Python 3.14 / Django 6.0.5 is the target runtime (README); the code also runs on 3.13.
- The standalone vendor portal described in README is **not** in this repository.
- The legacy Django template UI is being retired; new frontend work targets `/api/` endpoints only.

## 10. Acceptance Criteria (baseline)

Each functional requirement above is "met" when its API endpoint(s) return the
documented success response for an **authorized** user and reject unauthorized
or malformed requests. Current deviations from this baseline — most importantly
endpoints that do not yet enforce authorization — are tracked in
`docs/BREAK_POINTS.md` and must be closed before production sign-off.