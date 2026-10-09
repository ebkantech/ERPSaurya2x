"""Seed one complete, realistic project lifecycle that lights up every page
of BOTH portals (OmegaERP work-structure + FieldTracker2x vendor portal).

Idempotent: re-running wipes the previously seeded demo objects (matched by the
fixed vendor code / project code below) and rebuilds them from scratch.

    python manage.py seed_portal_lifecycle

After it runs, log into FieldTracker2x with vendor code:  VPF001
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import ProjectMaster, Vendor
from solar_engine import billing, constants as C, services
from solar_engine.models import (
    BillingMilestone,
    HandoverCertificate,
    ProjectBuild,
    ProjectWorkPackage,
    SiteProgressEntry,
)

VENDOR_CODE = 'VPF001'
PROJECT_CODE = 'SEED-5MW'
# Pokaran, Rajasthan — used for the geo-tag on field progress
SITE_LAT, SITE_LNG = Decimal('26.919600'), Decimal('71.922500')
SITE_NAME = 'Pokaran Block-A'


class Command(BaseCommand):
    help = 'Seed a full vendor-portal lifecycle (project → PO → delivery → field progress → billing → handover).'

    @transaction.atomic
    def handle(self, *args, **opts):
        from deliveries.models import Delivery
        from purchase_orders.models import PurchaseOrder, PurchaseOrderItem
        from transport.models import VehicleMovement

        today = timezone.now().date()
        self._today = today
        w = self.stdout.write

        # ----- 0. clean any prior seed run -------------------------------
        self._wipe()
        w('Cleaned previous demo data.')

        # ----- 1. approving user (super admin → can approve milestones) --
        User = get_user_model()
        approver, created = User.objects.get_or_create(
            username='seed_admin',
            defaults={'email': 'seed_admin@example.com', 'is_staff': True, 'is_superuser': True},
        )
        if created:
            approver.set_password('seedadmin123')
            approver.save()

        # ----- 2. WBS / BOQ / spec templates -----------------------------
        # Only seed templates if they are missing. seed_solar_templates DELETES
        # and recreates them, which fails (ProtectedError) once real project
        # builds already reference them — so skip it when defaults exist.
        from solar_engine.services import EngineError
        try:
            services._default_spec_set()
            services._default_wbs_template(C.PROJECT_TYPE_GROUND)
            services._default_boq_template(C.PROJECT_TYPE_GROUND)
            w('Solar templates already present — skipping seed_solar_templates.')
        except EngineError:
            call_command('seed_solar_templates')
            w('Seeded solar templates.')

        # ----- 3. vendor -------------------------------------------------
        vendor = Vendor.objects.create(
            vendor_id=VENDOR_CODE,
            company_name='Saurya Structures & EPC Pvt Ltd',
            vendor_name='Saurya Structures',
            contact_person='Ramesh Choudhary',
            mobile_number='9829000111',
            email_id='ramesh@sauryastructures.example',
            address='Plot 14, RIICO Industrial Area',
            city='Jodhpur', state='Rajasthan', pin_code='342001', country='India',
            vendor_type='partner', vendor_category='sub-contractor',
            gst_no='08ABCDE1234F1Z5', gst_type='Regular', pan_no='ABCDE1234F',
            bank_account_name='Saurya Structures & EPC Pvt Ltd',
            account_number='50100123456789', account_type='current',
            status='active',
        )
        w(f'Vendor {vendor.vendor_id} created (id={vendor.id}).')

        # ----- 4. project + engine build (stages/WPs/BOQ/sizing) ---------
        project = ProjectMaster.objects.create(
            project_code=PROJECT_CODE,
            project_name='Pokaran 5 MW Ground-Mount Solar EPC',
            client_name='Rajasthan Green Power Ltd',
            project_location='Pokaran, Rajasthan',
            business_unit='Solar EPC',
            total_mw=Decimal('5.00'),
            status='in_progress',
        )
        # A cleared site + assessment so the per-site development gate passes.
        self._seed_cleared_site(project, w)

        build = services.instantiate_build(project, C.PROJECT_TYPE_GROUND, Decimal('5'),
                                            user=approver)
        build.status = C.BUILD_IN_EXECUTION
        build.save(update_fields=['status'])
        w(f'Build #{build.id} instantiated ({build.stages.count()} stages).')

        # ----- 5. assign vendor to work packages + set schedule/status ---
        stages = list(build.stages.order_by('order'))
        start = today - timedelta(days=90)
        for i, st in enumerate(stages):
            st.planned_start = start + timedelta(days=i * 12)
            st.planned_end = st.planned_start + timedelta(days=11)
            if i < len(stages) - 2:
                st.status = C.STATUS_COMPLETED
                st.actual_start = st.planned_start
                st.actual_end = st.planned_end
            elif i == len(stages) - 2:
                st.status = C.STATUS_IN_PROGRESS
                st.actual_start = st.planned_start
            st.save()

        wps = list(ProjectWorkPackage.objects.filter(stage__build=build).order_by('stage__order', 'order'))
        # Assign the vendor to this vendor's civil/structural scope — take the first ~6 WPs
        scope = wps[:6]
        for idx, wp in enumerate(scope):
            wp.assigned_vendor = vendor
            wp.status = C.STATUS_COMPLETED if idx < 3 else (C.STATUS_IN_PROGRESS if idx < 5 else C.STATUS_PENDING)
            wp.save()
        w(f'Assigned vendor to {len(scope)} work packages.')

        # ----- 5b. free-issue material engagement (BOM → requisition → MIS) --
        # Engage the last package of this vendor's scope on free-issue material:
        # the company supplies material; the vendor does labour/machinery/
        # installation only, drawing material via a requisition + issue slip.
        if scope:
            from solar_engine import free_issue as fi
            from solar_engine.models import WorkPackageBom
            fiwp = scope[-1]
            fiwp.engagement_type = ProjectWorkPackage.ENGAGEMENT_FREE_ISSUE
            fiwp.save()
            if not fiwp.bom_lines.exists():
                for nm, un, qty, rate in [
                    ('Module mounting structure (hot-dip galvanised)', 'MT', '18', '72000'),
                    ('Earthing strip 25x3mm GI', 'm', '600', '95'),
                    ('DC cable 4 sq.mm (solar)', 'm', '2400', '38'),
                ]:
                    WorkPackageBom.objects.create(
                        work_package=fiwp, material_name=nm, unit=un,
                        bom_quantity=Decimal(qty), rate=Decimal(rate))
            if not fiwp.requisitions.exists():
                bom = list(fiwp.bom_lines.all())
                req = fi.create_requisition(
                    fiwp,
                    [{'bom_line': bom[0].id, 'quantity': '10'},
                     {'bom_line': bom[1].id, 'quantity': '350'}],
                    vendor=vendor, note='Site requisition for mounting + earthing.')
                fi.issue_material(
                    fiwp,
                    [{'bom_line': bom[0].id, 'quantity': '10'},
                     {'bom_line': bom[1].id, 'quantity': '350'}],
                    requisition=req, issued_by_name='Stores')
            w(f'Free-issue material demo on "{fiwp.name}" (BOM + requisition + MIS).')

        # ----- 6. purchase orders + items --------------------------------
        po1 = PurchaseOrder.objects.create(
            po_number='PO-SEED-0001', po_date=today - timedelta(days=70), vendor=vendor, project=project,
            business_division='solar', project_site_name=SITE_NAME,
            project_location='Pokaran, Rajasthan',
            delivery_address='Pokaran Solar Park, Gate 2, Rajasthan',
            total_po_value=Decimal('2850000.00'), paid_amount=Decimal('1200000.00'),
            outstanding_amount=Decimal('1650000.00'), status='partially_delivered',
            expected_delivery_date=today - timedelta(days=40),
            payment_terms='30% advance, 60% on delivery, 10% retention',
        )
        po2 = PurchaseOrder.objects.create(
            po_number='PO-SEED-0002', po_date=today - timedelta(days=35), vendor=vendor, project=project,
            business_division='solar', project_site_name=SITE_NAME,
            project_location='Pokaran, Rajasthan',
            delivery_address='Pokaran Solar Park, Gate 2, Rajasthan',
            total_po_value=Decimal('1450000.00'), paid_amount=Decimal('0.00'),
            outstanding_amount=Decimal('1450000.00'), status='approved',
            expected_delivery_date=today + timedelta(days=10),
            payment_terms='50% advance, 50% on delivery',
        )

        def item(po, cat, name, unit, ordered, delivered, rate, brand=''):
            ordered, delivered, rate = Decimal(ordered), Decimal(delivered), Decimal(rate)
            pending = ordered - delivered
            total = (ordered * rate).quantize(Decimal('0.01'))
            if delivered <= 0:
                stt = 'pending'
            elif pending <= 0:
                stt = 'fully_delivered'
            else:
                stt = 'partially_delivered'
            return PurchaseOrderItem.objects.create(
                po=po, material_category=cat, material_name=name, unit=unit, brand=brand,
                ordered_quantity=ordered, delivered_quantity=delivered, pending_quantity=pending,
                unit_rate=rate, gst_percentage=Decimal('18.00'), total_amount=total, item_status=stt,
            )

        it1 = item(po1, 'Structure', 'MMS Module Mounting Structure (galv.)', 'MT', '120', '120', '18000', 'Saurya')
        it2 = item(po1, 'Civil', 'Pile foundation (driven)', 'Nos', '1820', '1820', '450')
        it3 = item(po1, 'Hardware', 'Fasteners & clamps set', 'Set', '420', '300', '650')
        it4 = item(po2, 'Cables', 'DC Cable 4 sq.mm', 'Mtr', '26000', '0', '48')
        it5 = item(po2, 'Earthing', 'Earthing kit (chemical)', 'Nos', '90', '0', '2200')
        w('2 purchase orders with 5 line items created.')

        # ----- 7. deliveries (completed + partial) -----------------------
        d1 = Delivery.objects.create(
            po=po1, po_item=it1, delivery_reference_code='DLV-0001',
            delivery_date=today - timedelta(days=55), delivered_quantity=Decimal('120'),
            pending_quantity_after_delivery=Decimal('0'), delivery_location=SITE_NAME,
            site_received_by='Site Store — M. Khan', delivery_status='received',
        )
        d2 = Delivery.objects.create(
            po=po1, po_item=it3, delivery_reference_code='DLV-0002',
            delivery_date=today - timedelta(days=20), delivered_quantity=Decimal('300'),
            pending_quantity_after_delivery=Decimal('120'), delivery_location=SITE_NAME,
            site_received_by='Site Store — M. Khan', delivery_status='partially_received',
        )
        w('2 deliveries created.')

        # ----- 8. vehicle movements (one live / in-transit) --------------
        VehicleMovement.objects.create(
            delivery=d1, vehicle_number='RJ19-GA-4521', vehicle_type='Trailer 40ft',
            transporter_name='Marwar Logistics', driver_name='Suresh', driver_mobile_number='9828123456',
            lr_number='LR-55120', e_way_bill_number='EWB-9981234567',
            dispatch_date=today - timedelta(days=58), expected_arrival_date=today - timedelta(days=55),
            actual_arrival_date=today - timedelta(days=55), vehicle_status='unloaded',
            loading_location='Jodhpur Plant', unloading_location=SITE_NAME,
            gps_tracking_link='https://maps.google.com/?q=26.9196,71.9225', freight_amount=Decimal('28000'),
        )
        VehicleMovement.objects.create(
            delivery=d2, vehicle_number='RJ19-GB-7788', vehicle_type='LCV',
            transporter_name='Marwar Logistics', driver_name='Imran', driver_mobile_number='9828987654',
            lr_number='LR-55210', e_way_bill_number='EWB-9981299999',
            dispatch_date=today - timedelta(days=2), expected_arrival_date=today + timedelta(days=1),
            vehicle_status='in_transit', loading_location='Jodhpur Plant', unloading_location=SITE_NAME,
            gps_tracking_link='https://maps.google.com/?q=26.9196,71.9225', freight_amount=Decimal('9000'),
        )
        w('2 vehicle movements created (1 live in-transit).')

        # ----- 9. field progress entries (geo-tagged, source=field) ------
        # progress ramps up over time across the vendor's WPs
        plan = [
            (scope[0], 'Site survey & layout', [(85, 100), (60, 100), (40, 80)]),
            (scope[1], 'Pile foundation',       [(80, 100), (50, 75)]),
            (scope[2], 'MMS erection',          [(70, 100), (45, 70)]),
            (scope[3], 'Module mounting',       [(30, 55)]),
            (scope[4], 'DC cabling',            [(10, 25)]),
        ]
        n = 0
        for wp, label, pts in plan:
            for k, (_, pct) in enumerate(pts):
                dd = today - timedelta(days=30 - k * 10)
                SiteProgressEntry.objects.create(
                    build=build, site_name=SITE_NAME, stage=wp.stage, work_package=wp, vendor=vendor,
                    progress_date=dd, progress_percent=Decimal(pct),
                    status=(C.STATUS_COMPLETED if pct >= 100 else C.STATUS_IN_PROGRESS),
                    note=f'{label}: {pct}% complete', reporter_name='Ramesh Choudhary',
                    latitude=SITE_LAT, longitude=SITE_LNG, source=SiteProgressEntry.SOURCE_FIELD,
                )
                n += 1
        w(f'{n} geo-tagged field progress entries created.')

        # ----- 10. billing milestones (full lifecycle: paid→invoiced→pending→retention) --
        def milestone(wp, name, amount, retention, trigger, status='pending', po=None, order=0):
            return BillingMilestone.objects.create(
                build=build, work_package=wp, vendor=vendor, name=name, order=order,
                trigger_type=trigger, amount=Decimal(amount), retention_percent=Decimal(retention),
                payment_stage='after_installation',
                status=getattr(BillingMilestone, f'STATUS_{status.upper()}'),
            )

        m_paid = milestone(scope[0], 'Survey & layout completion', '150000', '5',
                           BillingMilestone.TRIGGER_WP_DONE, order=1)
        m_appr = milestone(scope[1], 'Pile foundation completion', '400000', '5',
                           BillingMilestone.TRIGGER_WP_DONE, order=2)
        m_inv = milestone(scope[2], 'MMS erection completion', '350000', '5',
                          BillingMilestone.TRIGGER_WP_DONE, order=3)
        m_pend = milestone(scope[3], 'Module mounting (50%)', '300000', '5',
                           BillingMilestone.TRIGGER_PROGRESS, order=4)
        m_pend.trigger_progress_percent = Decimal('50')
        m_pend.save(update_fields=['trigger_progress_percent'])
        m_ret = milestone(scope[0], 'Retention release on handover', '35000', '0',
                          BillingMilestone.TRIGGER_HANDOVER, order=5)

        # drive the lifecycle through the real service actions
        billing.milestone_action(m_paid, 'invoice', approver)
        billing.milestone_action(m_paid, 'approve', approver, purchase_order=po1)
        billing.milestone_action(m_paid, 'mark_paid', approver)

        billing.milestone_action(m_appr, 'invoice', approver)
        billing.milestone_action(m_appr, 'approve', approver, purchase_order=po1)

        billing.milestone_action(m_inv, 'invoice', approver)
        # m_pend stays pending; auto-eligibility handled by refresh below
        w('5 billing milestones created (paid / approved / invoiced / pending / retention).')

        # ----- 11. handover certificate → release retention -------------
        cert = HandoverCertificate.objects.create(
            build=build, vendor=vendor, site_name=SITE_NAME,
            scope_description='Civil & structural scope — survey, piling, MMS erection.',
            issued_date=today, issued_by=approver, status=HandoverCertificate.STATUS_ISSUED,
            remarks='Handover accepted by client representative on site.',
        )
        try:
            billing.generate_certificate_pdf(cert)
        except Exception as exc:  # reportlab optional
            w(f'  (certificate PDF skipped: {exc})')
        billing.release_retention_on_certificate(cert)
        w(f'Handover certificate {cert.certificate_number} issued; retention released.')

        # ----- 12. refresh auto-eligibility against field progress -------
        billing.refresh_milestones(build)

        # ----- 13. QA inspections + punch list --------------------------
        self._seed_quality(build, vendor, scope, w)

        # ----- 14. budget vs actual (seed demo figures) -----------------
        self._seed_budget(build, w)

        # ----- 15. engineering DMS (documents + revisions + approvals) --
        self._seed_dms(project, build, w)

        # ----- 16. subcontractor work order (labour-only) ---------------
        self._seed_work_order(project, build, vendor, scope, w)

        # ----- 17. sites / locations (per-location compliance) ----------
        self._seed_sites(project, w)

        w(self.style.SUCCESS(
            f'\nDone. Log into FieldTracker2x with vendor code "{VENDOR_CODE}". '
            f'ERP project: {PROJECT_CODE} (build #{build.id}).'))

    def _seed_quality(self, build, vendor, scope, w):
        """Seed a couple of QA inspections (one passed, one failed) and a few
        punch items against the vendor's work packages."""
        from solar_engine import quality as _q
        from solar_engine.models import PunchItem, QualityCheckpoint, QualityInspection
        wp0 = scope[1] if len(scope) > 1 else scope[0]
        wp1 = scope[2] if len(scope) > 2 else scope[0]
        # passed earthing inspection
        i1 = QualityInspection.objects.create(
            build=build, stage=wp0.stage, work_package=wp0, vendor=vendor,
            site_name=SITE_NAME, inspection_type=QualityInspection.TYPE_EARTHING,
            inspection_date=self._today, reporter_name='Ramesh Choudhary',
            latitude=SITE_LAT, longitude=SITE_LNG, source=QualityInspection.SOURCE_FIELD)
        _q.apply_template(i1)
        for cp in i1.checkpoints.all():
            cp.measured = '0.6'; cp.result = QualityCheckpoint.RESULT_PASS; cp.save()
        i1.status = _q.auto_status(i1); i1.save(update_fields=['status'])
        # failed megger inspection
        i2 = QualityInspection.objects.create(
            build=build, stage=wp1.stage, work_package=wp1, vendor=vendor,
            site_name=SITE_NAME, inspection_type=QualityInspection.TYPE_MEGGER,
            inspection_date=self._today, reporter_name='Ramesh Choudhary',
            latitude=SITE_LAT, longitude=SITE_LNG, source=QualityInspection.SOURCE_FIELD)
        _q.apply_template(i2)
        for n, cp in enumerate(i2.checkpoints.all()):
            cp.measured = '0.4' if n == 1 else '250'
            cp.result = QualityCheckpoint.RESULT_FAIL if n == 1 else QualityCheckpoint.RESULT_PASS
            cp.save()
        i2.status = _q.auto_status(i2); i2.save(update_fields=['status'])
        # punch items
        PunchItem.objects.create(
            build=build, stage=wp1.stage, work_package=wp1, vendor=vendor, site_name=SITE_NAME,
            title='MMS purlin misaligned (Row 12)', description='Purlin out of tolerance, needs re-shimming.',
            discipline=PunchItem.DISC_MECH, severity=PunchItem.SEV_HIGH, raised_on=self._today,
            raiser_name='Ramesh Choudhary',
            latitude=SITE_LAT, longitude=SITE_LNG, source=PunchItem.SOURCE_FIELD)
        PunchItem.objects.create(
            build=build, stage=wp0.stage, work_package=wp0, vendor=vendor, site_name=SITE_NAME,
            title='Earth pit cover missing', description='Safety cover not installed on pit E-7.',
            discipline=PunchItem.DISC_SAFETY, severity=PunchItem.SEV_MEDIUM, raised_on=self._today,
            raiser_name='Site EHS', status=PunchItem.STATUS_RESOLVED, resolved_on=self._today,
            source=PunchItem.SOURCE_FIELD)
        w('QA seeded (2 inspections: 1 passed / 1 failed · 2 punch items).')

    def _seed_budget(self, build, w):
        """Seed a ProjectBudget from the BOQ, then set demo budgeted/actual
        figures per cost head (the BOQ ships zero rates)."""
        from solar_engine import budget as _bud
        from solar_engine.models import BudgetLine
        budget = _bud.ensure_budget(build)
        _bud.seed_from_boq(budget)
        # realistic-ish 5 MW ground-mount demo figures (₹), by cost-head keyword
        plan = {
            'module': (165000000, 120000000), 'mounting': (22000000, 18000000),
            'structure': (22000000, 18000000), 'inverter': (28000000, 20000000),
            'dc': (9000000, 6000000), 'ac': (8000000, 3000000), 'cable': (9000000, 6000000),
            'transformer': (12000000, 4000000), 'civil': (18000000, 14000000),
            'earth': (3500000, 2500000), 'survey': (1500000, 1500000),
            'erection': (12000000, 7000000), 'testing': (2500000, 0), 'bos': (6000000, 2000000),
        }
        from decimal import Decimal
        for line in budget.lines.all():
            key = line.cost_head.lower()
            match = next((v for k, v in plan.items() if k in key), None)
            if match:
                line.budgeted_amount = Decimal(match[0])
                line.actual_amount = Decimal(match[1])
                line.committed_amount = Decimal(match[0])
                line.save(update_fields=['budgeted_amount', 'actual_amount', 'committed_amount'])
        budget.status = 'approved'
        budget.save(update_fields=['status'])
        w(f'Budget seeded ({budget.lines.count()} cost heads).')

    def _seed_dms(self, project, build, w):
        """Seed engineering documents with revision history + a DISCOM approval."""
        from solar_engine import dms as _dms
        from solar_engine.models import (
            EngineeringDocument as ED, DocumentRevision as DR, StatutoryApproval as SA)
        from datetime import date, timedelta
        today = date.today()
        specs = [
            ('SLD-5MW-001', '5 MW Main Single Line Diagram', ED.DISC_ELEC, ED.CAT_SLD, 2, True),
            ('PV-LAYOUT-001', 'PVsyst Array Layout & Shadow Plan', ED.DISC_LAYOUT, ED.CAT_PVSYST, 1, True),
            ('CIV-FND-010', 'Pile Foundation GA Drawing', ED.DISC_CIVIL, ED.CAT_CAD, 1, False),
            ('STR-MMS-020', 'Module Mounting Structure Detail', ED.DISC_STRUCT, ED.CAT_CAD, 0, False),
        ]
        for doc_no, title, disc, cat, extra_revs, approve in specs:
            if ED.objects.filter(doc_no=doc_no).exists():
                continue
            doc = ED.objects.create(project=project, build=build, doc_no=doc_no,
                                    title=title, discipline=disc, category=cat)
            _dms.add_revision(doc, change_note='Initial issue', prepared_by_name='Design Cell')
            for i in range(extra_revs):
                _dms.add_revision(doc, change_note=f'Revision {i + 1} — review comments incorporated',
                                  prepared_by_name='Design Cell')
            if approve:
                _dms.set_revision_status(doc.current_revision, DR.STATUS_APPROVED)
        # one submitted-for-DISCOM document + a statutory approval record
        sld = ED.objects.filter(doc_no='SLD-5MW-001').first()
        if sld:
            sld.status = ED.STATUS_FOR_DISCOM
            sld.save(update_fields=['status'])
            if not SA.objects.filter(project=project, approval_type='Feeder approval').exists():
                SA.objects.create(
                    project=project, document=sld, authority='DISCOM (JVVNL)',
                    approval_type='Feeder approval', reference_no='JVVNL/APR/5MW/2026/114',
                    status=SA.STATUS_SUBMITTED, submitted_date=today - timedelta(days=12),
                    remark='Awaiting feeder sanction for 5 MW evacuation.')
                SA.objects.create(
                    project=project, authority='CEIG Rajasthan',
                    approval_type='Energisation / charging permission',
                    status=SA.STATUS_PENDING, remark='To be filed after erection completion.')
        w(f'DMS seeded ({ED.objects.filter(project=project).count()} documents + DISCOM/CEIG approvals).')

    def _seed_work_order(self, project, build, vendor, scope, w):
        """Issue a labour-only subcontractor work order over the vendor's scope."""
        from solar_engine import work_orders as _wo
        from solar_engine.models import SubcontractWorkOrder
        if SubcontractWorkOrder.objects.filter(project=project, vendor=vendor).exists():
            return
        lines = [{'work_package_id': wp.id, 'line_value': str(400000 + i * 50000)}
                 for i, wp in enumerate(scope)]
        wo = _wo.create_work_order(
            project, vendor, 'Civil, MMS & electrical installation (labour)',
            lines=lines, engagement_type='milestone',
            rate_basis=SubcontractWorkOrder.RATE_PER_WATT, rate_per_wp='4.25',
            contract_value=str(sum(400000 + i * 50000 for i in range(len(scope)))),
            retention_percent='5',
            scope_note='Labour, machinery and installation for the vendor scope; '
                       'material free-issued by the company where applicable.')
        # Issue without propagating so the mixed milestone/free-issue demo on the
        # work packages (set earlier) is preserved.
        _wo.issue_work_order(wo, propagate=False)
        w(f'Work order {wo.wo_no} issued over {len(lines)} work packages.')

    def _seed_sites(self, project, w):
        """Seed two locations with per-site assessment + NOC checklists: one
        fully cleared, one still pending — so the project shows a mixed,
        per-location compliance picture. Project MW rolls up from the sites."""
        from solar_engine import services as _svc
        from solar_engine.models import ProjectSite, SiteAssessmentItem, StatutoryApproval
        if ProjectSite.objects.filter(project=project).exists():
            return
        specs = [
            ('Pokaran Block-A', 'Pokaran, Rajasthan', '3.000', True),
            ('Pokaran Block-B', 'Pokaran, Rajasthan', '2.000', False),
        ]
        for i, (name, loc, mw, clear) in enumerate(specs, 1):
            site = ProjectSite.objects.create(
                project=project, site_code=f'{project.project_code}-S{i:02d}',
                site_name=name, location=loc, capacity_mw=Decimal(mw))
            _svc.apply_default_site_assessments(site)
            _svc.apply_default_noc_checklist(project, site=site)
            if clear:
                SiteAssessmentItem.objects.filter(site=site).update(status=SiteAssessmentItem.STATUS_CLEARED)
                StatutoryApproval.objects.filter(site=site).update(status=StatutoryApproval.STATUS_APPROVED)
                _svc.maybe_autoclear_site(site)
        _svc.recalc_project_mw(project)
        w('2 sites seeded (Block-A cleared, Block-B pending) with per-location assessment + NOCs.')

    def _seed_cleared_site(self, project, w):
        """Create a cleared ProjectSite (+ cleared mandatory assessments) so the
        per-site development gate allows the demo build. No-op where the Sites
        feature is absent (e.g. the cloud clone)."""
        try:
            from core.models import SiteAssessment
            ProjectSite = SiteAssessment._meta.get_field('site').related_model
        except (ImportError, Exception):
            w('  (Sites feature absent — skipping site/assessment seed.)')
            return
        site, _ = ProjectSite.objects.get_or_create(
            project=project, site_code='SEED-S1',
            defaults={'site_name': SITE_NAME, 'capacity_mw': Decimal('5.00'),
                      'village': 'Pokaran', 'district': 'Jaisalmer', 'state': 'Rajasthan',
                      'latitude': SITE_LAT, 'longitude': SITE_LNG, 'status': 'cleared'},
        )
        if site.status != 'cleared':
            site.status = 'cleared'
            site.save(update_fields=['status'])
        spec = getattr(SiteAssessment, 'DOCUMENT_SPEC', [])
        for order, row in enumerate(spec):
            key, label, mandatory = row[0], row[1], (row[2] if len(row) > 2 else True)
            SiteAssessment.objects.get_or_create(
                site=site, document_key=key,
                defaults={'is_mandatory': mandatory, 'display_order': order,
                          'status': 'cleared', 'file_name': f'{key}.pdf'},
            )
        w(f'Cleared site {site.site_code} seeded ({SiteAssessment.objects.filter(site=site).count()} assessment docs).')

    def _wipe(self):
        """Remove the previously seeded demo objects so re-runs are clean."""
        from deliveries.models import Delivery
        from payments.models import VendorPayment
        from purchase_orders.models import PurchaseOrder
        from transport.models import VehicleMovement

        vendor = Vendor.objects.filter(vendor_id=VENDOR_CODE).first()
        if vendor:
            VehicleMovement.objects.filter(delivery__po__vendor=vendor).delete()
            Delivery.objects.filter(po__vendor=vendor).delete()
            VendorPayment.objects.filter(vendor=vendor).delete()
            PurchaseOrder.objects.filter(vendor=vendor).delete()
            SiteProgressEntry.objects.filter(vendor=vendor).delete()
            BillingMilestone.objects.filter(vendor=vendor).delete()
            HandoverCertificate.objects.filter(vendor=vendor).delete()
        project = ProjectMaster.objects.filter(project_code=PROJECT_CODE).first()
        if project:
            ProjectBuild.objects.filter(project=project).delete()
            try:
                from core.models import SiteAssessment
                ProjectSite = SiteAssessment._meta.get_field('site').related_model
                ProjectSite.objects.filter(project=project).delete()  # cascades assessments
            except (ImportError, Exception):
                pass
            project.delete()
        if vendor:
            vendor.delete()
