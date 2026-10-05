# OmegaERP — Solar Project Work-Structure & BOQ Engine

**Version:** 0.1 (design for sign-off)
**Date:** 2026-10-05
**Repository:** `ebkantech/ERPSaurya2x`
**Branch:** `claude/gifted-bell-lp4g6m`
**Source of truth for the lifecycle:** *5 MW Rooftop Solar — Complete Study Book*
(uploaded), mapped here to a reusable, config-driven engine.

---

## 1. What we are building

A **Project Work-Structure Engine**: when a project is created with a
**capacity (MW)** and an **execution mode**, the engine instantiates a reusable,
engineer-editable **template** into that project — producing:

1. A staged **Work Breakdown Structure (WBS)** — the lifecycle stages and the
   work packages under each (Survey → Design → Procurement → Installation →
   Testing → Commissioning → Performance → Handover → O&M).
2. An **engineering sizing** block (strings, inverters, transformers, HT) derived
   from the chosen component specs.
3. A seeded, fully-editable **Bill of Quantities (BOQ)** with material + labour
   columns, following the book's BOQ method.

Two execution modes are first-class:

| Mode | `project_type` | Meaning | Extra scope vs the other |
|------|----------------|---------|--------------------------|
| **Open Roof (Rooftop)** | `rooftop` | PV on an existing building roof | Structural/roof survey, ballast or penetration fixing, roof waterproofing, parapet/access, no land civil works |
| **On-Site Solar EPC (Ground-mount)** | `ground_mount` | Ground-mounted plant on open land | Land survey/levelling, pile foundations, module tables/seasonal tilt, boundary & roads, trenching, security — no roof scope |

Both share the **electrical core** (DC → inverter → AC → transformer → HT → PCC
→ grid) and the **safety/control** subsystems (earthing, LPS/SPD, SCADA, PPC).

### Design principle (per your choice): **config-driven templates**
The template is the source of truth, not hard-coded math. An engineer edits a
template per mode (stages, work packages, BOQ lines, and *how each line scales*).
On project creation the engine **instantiates** the template and **seeds**
quantities from the scaling rule; every seeded value is then **editable** per
project before the structure is **locked**. Re-running against the 5 MW book
reproduces the reference plant exactly, but nothing is frozen in code.

---

## 2. How it fits the existing app

- Anchors to the existing **`core.ProjectMaster`** (has `total_mw`, `project_code`, `status`, `business_unit`).
- Reuses **`core.WorkPackage`** names where possible; the engine's WBS packages reference them.
- The instantiated BOQ is the natural feed into the existing procurement flow: a locked BOQ section can generate a **`purchase_orders` / `MaterialQuotation`** draft (future step, out of scope for v1 but the FK is designed in).
- New code lives in a new Django app **`solar_engine`** so it is cleanly separable and does not disturb the apps flagged in `docs/BREAK_POINTS.md`.

```
core.ProjectMaster ──1:1──> ProjectBuild ──*──> ProjectStage ──*──> ProjectWorkPackage
                                   │
                                   ├──*──> ProjectBoqItem      (seeded from BoqTemplateItem)
                                   └──1:1─> ProjectSizing       (strings/inverters/transformers)

WbsTemplate(mode) ──*──> WbsStage ──*──> WbsWorkPackage        (reusable, editable)
BoqTemplate(mode) ──*──> BoqSection ──*──> BoqTemplateItem      (reusable, editable)
ComponentSpecSet ────────────────────────────────────────────  (module Wp, inverter kW, …)
```

---

## 3. Data model

### 3.1 Enumerations
- `PROJECT_TYPE = {rooftop, ground_mount}`
- `QUANTITY_BASIS = {fixed, per_mw_ac, per_mwp_dc, per_string, per_inverter, per_transformer, per_acdb, per_sqm_area}`
  — how a BOQ line's quantity is seeded.
- `STAGE_STATUS / WP_STATUS = {pending, in_progress, completed, on_hold, skipped}`
- `BUILD_STATUS = {draft, locked, in_execution, completed}`

### 3.2 Template (config, reusable, editable)

**`ComponentSpecSet`** — the engineering inputs that drive sizing. Defaults from the book:
| field | default (book) |
|-------|----------------|
| `module_wp` | 550 |
| `modules_per_string` | 26 |
| `inverter_kw` | 125 |
| `transformer_mva` | 2.5 |
| `lv_voltage` / `ht_voltage` | 415 V / 11 kV |
| `target_dc_ac_ratio` | 1.20 |
| `modules_per_acdb_group` | (derived; 4 ACDB @ 5 MW) |

**`WbsTemplate`** `(name, project_type, is_active)` → **`WbsStage`** `(template, order, code, name, description)` → **`WbsWorkPackage`** `(stage, order, name, core_workpackage→core.WorkPackage?, discipline, is_parallel)`.

**`BoqTemplate`** `(name, project_type, is_active)` → **`BoqSection`** `(template, order, name)` → **`BoqTemplateItem`**:
```
section, order, description, specification, unit,
quantity_basis (QUANTITY_BASIS), quantity_factor (Decimal),
default_material_rate, default_labour_rate, wbs_stage (optional link)
```
`quantity_factor` is "per unit of the basis". E.g. a module line: basis
`per_mwp_dc`, factor ≈ 1820 (10,920 ÷ 6.006). Seeded qty = factor × basis value.

### 3.3 Project instance (generated, then editable)

**`ProjectBuild`** `(project→core.ProjectMaster 1:1, project_type, ac_capacity_mw, spec_set→ComponentSpecSet, wbs_template, boq_template, status=BUILD_STATUS, locked_at, created_by)`

**`ProjectSizing`** `(build 1:1, dc_capacity_mwp, module_count, string_count, inverter_count, transformer_count, acdb_count, dc_ac_ratio, …)` — computed on instantiate, editable until lock.

**`ProjectStage`** `(build, order, code, name, status, planned_start, planned_end, actual_start, actual_end, source_stage→WbsStage?)`
**`ProjectWorkPackage`** `(stage, order, name, discipline, status, allocation→core.ProjectWorkAllocation?, source_wp→WbsWorkPackage?)`
— the optional `allocation` FK is how a work package links to the existing
vendor/MW allocation model, so execution tracking reuses what's already there.

**`ProjectBoqItem`** `(build, section_name, order, description, specification, unit, quantity, material_rate, labour_rate, source_item→BoqTemplateItem?)`
with computed properties `material_amount = qty×material_rate`,
`labour_amount = qty×labour_rate`, `total = material+labour` — exactly the
book's BOQ column method (slide 29).

---

## 4. The sizing calculator (seed values)

Given `ac_mw` and a `ComponentSpecSet`, instantiation seeds `ProjectSizing`:

```
inverter_count   = ceil(ac_mw*1000 / inverter_kw)
dc_target_mwp    = ac_mw * target_dc_ac_ratio
modules_needed   = ceil(dc_target_mwp*1e6 / module_wp)
string_count     = round(modules_needed / modules_per_string)
module_count     = string_count * modules_per_string
dc_capacity_mwp  = module_count * module_wp / 1e6
dc_ac_ratio      = dc_capacity_mwp / ac_mw
transformer_count= ceil(ac_mw / transformer_mva)
acdb_count       = ceil(inverter_count / inverters_per_acdb)   # default group size from specs
```

**Verification against the book (5 MW, defaults):**
`inverter_count = ceil(5000/125) = 40` ✓ · `dc_target = 6.0 MWp` →
`modules = ceil(6.0e6/550)=10,910 → 420 strings? ` — the book rounds to
**420 strings × 26 = 10,920 modules → 6.006 MWp** (DC/AC 1.20). The engine
rounds on **whole strings**, reproducing 420 strings / 10,920 modules / 6.006 MWp
exactly ✓ · `transformers = ceil(5/2.5)=2` ✓ · `ACDB = 4` ✓. These seed values
are then editable, per your config-driven requirement.

> Every computed value carries the book's disclaimer in the UI: *"Final project
> values must follow approved drawings, datasheets, calculations, standards and
> utility requirements."*

---

## 5. Seeded templates (from the study book)

Two `WbsTemplate`s and two `BoqTemplate`s are shipped via a seed command
(`manage.py seed_solar_templates`), both editable afterwards.

### 5.1 WBS stages (shared spine, mode-specific packages)
1. **Survey & Feasibility** — site survey, shadow analysis; *(rooftop)* structural/roof-load survey; *(ground)* land survey, soil resistivity (Wenner), levelling.
2. **Engineering & Design** — SLD, string/inverter/AC layout, earthing & LPS, HT, SCADA architecture, IFC drawing control.
3. **Approvals** — structural approval, utility/grid SLD approval, metering approval.
4. **Procurement & Inspection** — modules, structure, inverter, cables, ACDB, transformer, HT panel, metering, earthing, LPS, SCADA; receipt/NCR records.
5. **Mobilization & Civil/Roof Prep** — *(rooftop)* roof prep, waterproofing, ballast/penetration fixing; *(ground)* piling, foundations, module tables, trenching, roads/boundary.
6. **Mounting & Module Installation** — structure, alignment/torque/bonding, modules, string cabling.
7. **DC Installation & Pre-Commissioning** — DC cabling, isolators/SPD, polarity, string Voc, IR, I-V, thermography.
8. **AC / Transformer / HT** — ACDB, LT cabling, transformer, HT VCB/CT/PT/relay, PCC & metering.
9. **Safety Systems (parallel)** — equipment earthing, earth grid, lightning protection, SPD coordination.
10. **Monitoring & Control (parallel)** — SCADA, weather station, PPC.
11. **Testing & Commissioning** — AC/transformer/HT tests, pre-commissioning checklist, energization sequence, synchronization, anti-islanding.
12. **Performance Test** — PR, MWh, availability, punch-list closure.
13. **Handover** — as-built drawings, test/commissioning reports, relay settings, warranties, O&M manuals, training.
14. **O&M** — scheduled maintenance, performance monitoring, spares.

### 5.2 BOQ sections (both modes; quantities seeded by basis)
PV Modules · Mounting Structure (mode-specific) · DC System (cables, connectors,
isolators, DC SPD) · Inverters · AC System (ACDB, LT cable, AC SPD) ·
Transformer · HT System (VCB, CT/PT, relay, metering) · Earthing ·
Lightning Protection · SCADA/PPC & Weather · Cable Trays & Accessories ·
Civil/Roof works (mode-specific) · Testing & Commissioning · Engineering & Docs.

Example seeded lines (5 MW rooftop):
| Description | Unit | Basis | Factor | Seed qty @5 MW |
|-------------|------|-------|--------|----------------|
| 550 Wp PV module | Nos | per_mwp_dc | 1818.18 | 10,920 |
| PV string set | Nos | per_string | 1 | 420 |
| 125 kW inverter | Nos | per_inverter | 1 | 40 |
| ACDB | Nos | per_acdb | 1 | 4 |
| 2.5 MVA transformer | Nos | per_transformer | 1 | 2 |
| HT VCB (incomer/outgoing/bus-coupler) | Nos | fixed | 4 | 4 |

---

## 6. Services / API

New views follow the app's existing plain-`JsonResponse` style and **enforce
authentication** (addressing BP-1/BP-4 for all new endpoints):

| Method & path | Purpose |
|---------------|---------|
| `POST /api/solar/projects/<project_id>/build/` | Instantiate a build for a project: body `{project_type, ac_capacity_mw, spec_set_id?}` → creates `ProjectBuild`+`ProjectSizing`+stages+WPs+seeded BOQ |
| `GET /api/solar/projects/<project_id>/build/` | Full build: sizing, stages, work packages, BOQ, totals |
| `PATCH /api/solar/builds/<id>/sizing/` | Override sizing values (while draft) |
| `PATCH /api/solar/boq-items/<id>/` | Edit a seeded BOQ line (qty/rates) |
| `PATCH /api/solar/workpackages/<id>/` | Update WP status / dates / vendor allocation |
| `POST /api/solar/builds/<id>/lock/` | Lock the build (freezes structure; enables PO generation) |
| `GET /api/solar/templates/?mode=` | List editable templates |
| CRUD on template objects | Engineer edits WBS/BOQ templates & component specs |

**Engine service** (`solar_engine/services.py`): `instantiate_build(project, project_type, ac_mw, spec_set)` runs inside `transaction.atomic`, computes sizing, copies template stages/WPs/BOQ with seeded quantities, and returns the build. Idempotent guard: a project has at most one non-cancelled build.

---

## 7. UI flow (React, future slice)
1. On a Project, **"Generate Work Structure"** → pick mode + confirm MW + spec set.
2. Review tabs: **Sizing** (calculator card, editable) · **WBS** (stage accordion with work packages, status, vendor allocation) · **BOQ** (sectioned editable grid with material/labour/total, section & grand totals).
3. **Lock** → structure becomes the execution baseline; WBS statuses drive a progress %; BOQ can spawn procurement.

v1 backend ships the models + engine + seed + JSON APIs + admin + tests; the React tab is a follow-up.

---

## 8. Scope & acceptance (v1)

**In:** `solar_engine` app; template + instance models; sizing calculator;
`seed_solar_templates` (rooftop + ground_mount from the book); `instantiate_build`
service; authenticated JSON APIs; Django admin for template editing; migrations;
unit tests proving the 5 MW book reproduces (40 inverters, 420 strings, 10,920
modules, 6.006 MWp, 2 transformers) and that seeded BOQ totals compute.

**Out (phase 2):** React UI tab; BOQ→PO/quotation generation; multi-spec
libraries; cost roll-up into project financials; PR-based review.

**Acceptance:** `manage.py migrate` + `manage.py seed_solar_templates` clean;
`manage.py test solar_engine` green; instantiating a 5 MW rooftop build yields
the book's sizing; all new endpoints return 401/403 when logged out.

---

## 9. Open items for your confirmation
1. Default **component specs** — keep the book's (550 Wp / 26 per string / 125 kW / 2.5 MVA / 11 kV, DC:AC 1.20)? These become the editable default spec set.
2. **Ground-mount foundation type** default — piled (driven pile) vs concrete pedestal? Affects the civil BOQ seed lines.
3. Should a **locked** BOQ auto-draft a procurement quotation now, or stay phase 2?
4. Who may **lock** a build — admins + project managers only?
