# OmegaERP (ERPSaurya2x) — Break Points & Risk Register

**Date:** 2026-10-05
**Scope:** Current `main` of `ebkantech/ERPSaurya2x`
**Method:** Live analysis — ran the Django system check, migration check and the
test suite; probed every URL anonymously (GET + POST) with CSRF enforced; read
the implicated view/model/settings code. Each finding below cites concrete
evidence (`file:line`), so it can be reproduced.

> A "break point" here means a place where the application **breaks, can be
> broken, or silently does the wrong thing** — security gaps, data-loss paths,
> deploy-time failures and config traps. Findings are ordered by severity.
> This complements `docs/BRQ.md` (what the app is supposed to do).

---

## Severity summary

| Sev | Count | Theme |
|-----|-------|-------|
| 🔴 Critical | 3 | Unauthenticated data access/writes; missing migration; insecure default secret |
| 🟠 High | 4 | Inconsistent auth model; SQLite prod fallback; ephemeral media; destructive bulk ops |
| 🟡 Medium | 4 | Hardcoded reset password; unauthenticated AI/cost endpoint; system-health FS walk; CSRF on webhook path |
| 🔵 Low | 3 | Static manifest in tests; stale README/portal; duplicate vendor-create forms |

---

## 🔴 Critical

### BP-1 — Procurement, quotation and report APIs have **no server-side authentication**
The React app only guards routes **client-side** (`frontend/src/App.jsx:47`
`PrivateRoute`). Several backend apps do not re-check auth, so the endpoints are
reachable directly (curl/Postman) with **no login**.

**Confirmed anonymous (not redirected to login) via probe:**
- All Purchase Order APIs — list, **create**, detail, update, add item/reference/delivery/vehicle/invoice/**payment**/document/activity/notification, dashboard, vendor-options, bulk-generate, bulk-check (`purchase_orders/views.py`, `purchase_orders/urls.py`, aliased in `omegaerp/urls.py`).
- All Quotation APIs — list, **create**, detail, update, verify, **generate-po**, pdf (`purchase_orders/quotation_views.py`).
- Report APIs — `report_center_api`, `saved_report_create_api` (`reports/views.py`).
- `vendor_master` HTML page at `/procurement/vendors/` (GET; POST is at least gated by `can_create_vendors`).

**Evidence:** `purchase_orders/views.py:111 purchase_order_create_api` only
checks `request.method`; the user is used as `request.user if
request.user.is_authenticated else None` (lines 120, 627, 663) — i.e. anonymous
is explicitly tolerated. There is **no login-required middleware**
(`omegaerp/settings/base.py:47` MIDDLEWARE has only `AuthenticationMiddleware`).

**Impact:** Anyone who can reach the server can read procurement/financial data
and create/modify POs, payments, quotations and reports.

**Fix:** Add an auth gate to every data endpoint (decorator or a DRF-style
`permission_classes`), or a global login-required middleware with an explicit
allowlist (`/api/auth/login/`, the Razorpay webhook). Do **not** rely on the
SPA's `PrivateRoute`.

### BP-2 — Missing database migration for `search.ExistingDocument` → runtime crash in production
`search/models.py:22` defines `ExistingDocument`, but `search/migrations/` has
only `0001_initial.py` — no migration creates its table.

**Evidence:** `python manage.py makemigrations --check` reports
`search/migrations/0002_existingdocument.py … + Create model ExistingDocument`
is still pending. `build.sh` runs `migrate` (not `makemigrations`), so the table
is **never created** in production. Any query against `ExistingDocument`
(e.g. `search/management/commands/import_from_db.py`) raises
`Programming/OperationalError: relation does not exist`.

There is also a pending `core` migration
(`0005_alter_projectworkallocation_completed_mw`) — model/DB drift.

**Fix:** Run `python manage.py makemigrations search core`, commit the generated
files, and keep `makemigrations --check` in CI so drift fails the build.

### BP-3 — Insecure default `SECRET_KEY` silently used when the env var is unset
`omegaerp/settings/base.py:10` defines
`SECRET_KEY=(str, 'unsafe-development-secret-key')`. If `SECRET_KEY` is not set
in the environment, production boots with a **publicly known key** instead of
failing.

**Impact:** Known secret → forgeable sessions, signed cookies and password-reset
tokens.

**Fix:** In production settings require the key with no default
(`env('SECRET_KEY')` and let it raise), or assert it differs from the dev
sentinel at startup.

---

## 🟠 High

### BP-4 — Inconsistent authorization model across apps
Some apps **do** enforce auth and redirect anonymous users to `/admin/login/`
(all of `core.urls`, `administration`, `vendor-control`), while
`purchase_orders`, `quotations` and `reports` do not (BP-1). The split is
accidental, not designed, which makes it easy to add a new endpoint on the
"open" side and not notice.

**Fix:** One documented, enforced pattern for all JSON endpoints; add a
regression test that probes every URL anonymously and asserts 401/403.

### BP-5 — Production can silently fall back to **ephemeral SQLite**
`omegaerp/settings/base.py:~84` falls back to
`sqlite:///db.sqlite3` when none of `DATABASE_URL` / `POSTGRES_URL` / … are set.
On a serverless host (Vercel) the filesystem is reset per invocation, so data
"disappears" between requests with **no error**.

**Fix:** In production settings, fail hard if no Postgres URL is resolved rather
than defaulting to SQLite.

### BP-6 — Uploaded media is lost on serverless unless Blob is configured
`STORAGES['default']` is local `FileSystemStorage` unless
`BLOB_READ_WRITE_TOKEN` is set (`settings/base.py`). Vendor bank proofs, PO
documents, payment proofs etc. are written to an ephemeral disk on Vercel/
Render-without-disk and **vanish**.

**Fix:** Make object storage mandatory in production (assert the token), or
document a persistent-disk deployment target.

### BP-7 — Destructive "replace-all" bulk operations with no backup/confirmation
- Material import: `MaterialMaster.objects.all().delete()` then bulk-create from the uploaded `.xlsx` (`core/views.py import_material_master`).
- Project distribution save: `project.allocations.all().delete()` then bulk-create (`core/views.py save_project_distribution`).

Combined with BP-1/BP-4 (these live under `core.urls`, which **is** auth-gated,
so lower risk than PO), a single bad upload wipes the whole table.

**Fix:** Wrap in a transaction (project save already validates MW), take a
pre-change snapshot, and require explicit confirmation for full-table replace.

---

## 🟡 Medium

### BP-8 — Hardcoded fallback password on admin reset
`administration/views.py:418` —
`new_password = request.POST.get('new_password') or 'ChangeMe123!'`. If an admin
submits the reset action without a value, the account is set to a **well-known
password**.

**Fix:** Require an explicit password (or generate a random one and force change
on next login); never fall back to a constant.

### BP-9 — AI assistant endpoint is unauthenticated **and** `@csrf_exempt`
`search/views.py:160-161` — `api_chat` is `@csrf_exempt` and has no auth check,
mounted at `/api/chat/` (`omegaerp/urls.py`). It can invoke the OpenAI path.

**Impact:** Anonymous cost abuse (burns API quota) and data exposure from
whatever the assistant can retrieve.

**Fix:** Require authentication; keep CSRF (the SPA already sends the token) or
restrict to same-origin.

### BP-10 — `system_health_view` walks the entire media tree on every load
`administration/system_health_view` does `rglob('*')` over `MEDIA_ROOT` to sum
storage, plus a raw `SELECT 1`, on each request. On a large media set / object
storage this is slow and can time out.

**Fix:** Cache the figure or compute it from storage metadata asynchronously.

### BP-11 — Razorpay webhook correctly `@csrf_exempt`, but relies solely on signature
`payments/views.py razorpay_webhook` is `@csrf_exempt` (correct for a webhook)
and verifies the signature — **but** returns HTTP 200 even on internal errors
(by design, to stop retries) and skips verification entirely if
`RAZORPAY_WEBHOOK_SECRET` is blank (`gateway.verify_webhook_signature` returns
`False` → 400, which is fine). Confirm the secret is always set in production so
the endpoint cannot be driven by forged payloads; the swallow-all `except` also
hides genuine reconciliation failures.

**Fix:** Alert/log (not just `traceback.print_exc()`) on webhook processing
errors; assert the webhook secret is configured in production.

---

## 🔵 Low / Hygiene

### BP-12 — `ManifestStaticFilesStorage` requires `collectstatic` (test-env trap)
The test suite fails with `Missing staticfiles manifest entry for
'legacy/css/custom.css'` because tests don't run `collectstatic`. The file
**does** exist on disk (`static/legacy/css/custom.css`) and `build.sh` runs
`collectstatic`, so production is fine — but CI/tests need
`collectstatic` first or a non-manifest storage override for tests.

### BP-13 — README describes a vendor portal and paths that aren't in this repo
`README.md` references `vendor_portal_site/` and Windows absolute paths
(`C:/Users/...`); the directory is **absent** here. Misleads onboarding/deploy.

**Fix:** Trim the README to what ships, or add the portal.

### BP-14 — Two parallel vendor-create forms write the same table
`core.views.register_vendor` (full KYC, used by React) and
`vendors.views.vendor_master` (`VendorMasterForm`, shorter) both write
`core.Vendor`. Divergent validation on one entity invites inconsistent data.

**Fix:** Consolidate on one create path; make the other delegate to it.

---

## How to reproduce the headline finding (BP-1)

With the app running and **no login**, a `POST` to `/api/purchase-orders/create/`
(with a valid CSRF cookie from any GET) returns `201 Created` rather than
`401/403`. The anonymous URL probe used for this report drove every route with
GET and POST and recorded which ones bypassed the login redirect; the full
list is in BP-1.

## Suggested remediation order

1. **BP-1 / BP-4** — put an auth gate on all data endpoints (single biggest exposure).
2. **BP-2** — generate and commit the missing migrations; add `--check` to CI.
3. **BP-3 / BP-5 / BP-6** — harden production settings (secret, DB, storage) to fail fast instead of defaulting.
4. **BP-8 / BP-9** — close the reset-password fallback and lock down `/api/chat/`.
5. Everything else as hygiene.