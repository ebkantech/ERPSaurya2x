from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from accounts.models import StaffProfile
from core.models import ProjectMaster
from permissions.constants import ROLE_PROJECT_MANAGER, ROLE_SITE_STAFF

from . import constants as C
from . import services
from .models import ComponentSpecSet, ProjectBuild


class SizingCalculatorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')
        cls.spec = ComponentSpecSet.objects.get(is_default=True)

    def test_reproduces_5mw_study_book(self):
        sizing = services.compute_sizing(Decimal('5'), self.spec)
        self.assertEqual(sizing['inverter_count'], 40)
        self.assertEqual(sizing['string_count'], 420)
        self.assertEqual(sizing['module_count'], 10920)
        self.assertEqual(sizing['transformer_count'], 2)
        self.assertEqual(sizing['acdb_count'], 4)
        self.assertEqual(sizing['dc_capacity_mwp'], Decimal('6.0060'))

    def test_scales_to_1mw(self):
        sizing = services.compute_sizing(Decimal('1'), self.spec)
        self.assertEqual(sizing['inverter_count'], 8)   # ceil(1000/125)
        self.assertEqual(sizing['transformer_count'], 1)  # ceil(1/2.5)

    def test_zero_capacity_rejected(self):
        with self.assertRaises(services.EngineError):
            services.compute_sizing(Decimal('0'), self.spec)


class InstantiationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def test_instantiate_rooftop_build(self):
        project = ProjectMaster.objects.create(project_name='RT 5MW', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        self.assertEqual(build.sizing.inverter_count, 40)
        self.assertTrue(build.stages.count() >= 10)
        self.assertTrue(build.boq_items.count() > 0)
        # PV module line seeds to module_count
        module_line = build.boq_items.filter(description__icontains='PV module').first()
        self.assertEqual(module_line.quantity, Decimal('10920.00'))

    def test_ground_mount_defaults_to_pile(self):
        project = ProjectMaster.objects.create(project_name='GM 10MW', total_mw=Decimal('10'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_GROUND, Decimal('10'))
        self.assertEqual(build.foundation_type, C.FOUNDATION_PILE)

    def test_one_build_per_project(self):
        project = ProjectMaster.objects.create(project_name='Dup', total_mw=Decimal('5'))
        services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        with self.assertRaises(services.EngineError):
            services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))


class LockAndQuotationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def _staff(self, username, role):
        user = User.objects.create_user(username=username, password='x')
        StaffProfile.objects.create(user=user, staff_name=username, employee_id=username.upper(), role=role)
        return user

    def test_project_manager_can_lock_and_drafts_quotation(self):
        pm = self._staff('pm', ROLE_PROJECT_MANAGER)
        project = ProjectMaster.objects.create(project_name='Lockable', client_name='ACME', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        build, quotation = services.lock_build(build, pm)
        self.assertEqual(build.status, C.BUILD_LOCKED)
        self.assertIsNotNone(quotation)
        self.assertTrue(quotation.items.count() > 0)
        self.assertEqual(build.generated_quotation_id, quotation.id)

    def test_site_staff_cannot_lock(self):
        staff = self._staff('site', ROLE_SITE_STAFF)
        project = ProjectMaster.objects.create(project_name='NoLock', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        from django.core.exceptions import PermissionDenied
        with self.assertRaises(PermissionDenied):
            services.lock_build(build, staff)


class AllocationAndMilestoneTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def test_assign_vendor_and_dates(self):
        from core.models import Vendor
        project = ProjectMaster.objects.create(project_name='Alloc', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        wp = build.stages.first().work_packages.first()
        vendor = Vendor.objects.create(company_name='Acme EPC')
        wp.assigned_vendor = vendor
        wp.save()
        wp.refresh_from_db()
        self.assertEqual(wp.assigned_vendor_id, vendor.id)

        stage = build.stages.first()
        stage.planned_start = '2026-01-01'
        stage.actual_end = '2026-03-15'
        stage.save()
        stage.refresh_from_db()
        self.assertEqual(str(stage.planned_start), '2026-01-01')


class DailyProgressTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def test_field_ingest_requires_token(self):
        from core.models import Vendor
        project = ProjectMaster.objects.create(project_name='Prog', project_code='PRJ900', total_mw=Decimal('5'))
        services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        url = reverse('solar-field-ingest')
        # No token configured by default -> 503
        resp = self.client.post(url, data={'project_code': 'PRJ900', 'site_name': 'S1'})
        self.assertIn(resp.status_code, (503, 401))

    def test_field_ingest_with_token_creates_entry(self):
        project = ProjectMaster.objects.create(project_name='Prog2', project_code='PRJ901', total_mw=Decimal('5'))
        services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        url = reverse('solar-field-ingest')
        with self.settings(FIELD_INGEST_TOKEN='secret-123'):
            resp = self.client.post(
                url,
                data=json.dumps({'project_code': 'PRJ901', 'site_name': 'Pokaran', 'progress_percent': '40', 'reporter_name': 'Site Eng'}),
                content_type='application/json',
                HTTP_X_FIELD_TOKEN='secret-123',
            )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()['entry']['site_name'], 'Pokaran')

    def test_field_ingest_rejects_bad_token(self):
        project = ProjectMaster.objects.create(project_name='Prog3', project_code='PRJ902', total_mw=Decimal('5'))
        services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        url = reverse('solar-field-ingest')
        with self.settings(FIELD_INGEST_TOKEN='secret-123'):
            resp = self.client.post(url, data=json.dumps({'project_code': 'PRJ902', 'site_name': 'X'}),
                                    content_type='application/json', HTTP_X_FIELD_TOKEN='wrong')
        self.assertEqual(resp.status_code, 401)

    def test_progress_tab_requires_login(self):
        project = ProjectMaster.objects.create(project_name='Prog4', total_mw=Decimal('5'))
        resp = self.client.get(reverse('solar-project-progress', kwargs={'project_id': project.id}))
        self.assertIn(resp.status_code, (302, 401, 403))


import json  # noqa: E402


class WbsEditingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def setUp(self):
        self.user = User.objects.create_user(username='pm_edit', password='x', is_superuser=True)
        self.client.force_login(self.user)
        self.project = ProjectMaster.objects.create(project_name='Edit', total_mw=Decimal('5'))
        self.build = services.instantiate_build(self.project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))

    def test_add_rename_delete_stage(self):
        r = self.client.post(reverse('solar-stage-create', kwargs={'build_id': self.build.id}),
                             data=json.dumps({'name': 'Custom Stage'}), content_type='application/json')
        self.assertEqual(r.status_code, 201)
        sid = r.json()['stage']['id']
        r = self.client.patch(reverse('solar-stage', kwargs={'stage_id': sid}),
                              data=json.dumps({'name': 'Renamed Stage'}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['stage']['name'], 'Renamed Stage')
        r = self.client.delete(reverse('solar-stage', kwargs={'stage_id': sid}))
        self.assertEqual(r.status_code, 200)

    def test_add_and_move_work_package(self):
        stages = list(self.build.stages.all())
        s1, s2 = stages[0], stages[1]
        r = self.client.post(reverse('solar-stage-wp-create', kwargs={'stage_id': s1.id}),
                             data=json.dumps({'name': 'Custom WP'}), content_type='application/json')
        self.assertEqual(r.status_code, 201)
        wid = r.json()['work_package']['id']
        # move it to another stage
        r = self.client.patch(reverse('solar-workpackage', kwargs={'wp_id': wid}),
                              data=json.dumps({'stage_id': s2.id}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        from solar_engine.models import ProjectWorkPackage
        self.assertEqual(ProjectWorkPackage.objects.get(pk=wid).stage_id, s2.id)

    def test_reorder_stages(self):
        ids = list(self.build.stages.values_list('id', flat=True))
        reversed_ids = list(reversed(ids))
        r = self.client.post(reverse('solar-wbs-reorder', kwargs={'build_id': self.build.id}),
                             data=json.dumps({'stages': reversed_ids}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        new_first = self.build.stages.order_by('order', 'id').first().id
        self.assertEqual(new_first, reversed_ids[0])

    def test_library_lists_options(self):
        r = self.client.get(reverse('solar-wbs-library'))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(len(r.json()['work_package_names']) > 0)

    def test_locked_build_blocks_editing(self):
        services.lock_build(self.build, self.user)
        r = self.client.post(reverse('solar-stage-create', kwargs={'build_id': self.build.id}),
                             data=json.dumps({'name': 'Nope'}), content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_unlock_reenables_editing(self):
        services.lock_build(self.build, self.user)
        r = self.client.post(reverse('solar-build-unlock', kwargs={'build_id': self.build.id}))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['build']['status'], 'draft')
        r = self.client.post(reverse('solar-stage-create', kwargs={'build_id': self.build.id}),
                             data=json.dumps({'name': 'Now allowed'}), content_type='application/json')
        self.assertEqual(r.status_code, 201)


class BillingMilestoneTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def setUp(self):
        from core.models import Vendor
        from decimal import Decimal as D
        self.user = User.objects.create_user(username='pm_bill', password='x', is_superuser=True)
        self.client.force_login(self.user)
        self.project = ProjectMaster.objects.create(project_name='Bill', project_code='PRJ700', total_mw=D('5'))
        self.build = services.instantiate_build(self.project, C.PROJECT_TYPE_ROOFTOP, D('5'))
        self.vendor = Vendor.objects.create(company_name='Acme EPC')
        self.wp = self.build.stages.first().work_packages.first()
        self.wp.assigned_vendor = self.vendor
        self.wp.save()

    def _make_milestone(self, **kw):
        from decimal import Decimal as D
        from solar_engine.models import BillingMilestone
        return BillingMilestone.objects.create(
            build=self.build, work_package=self.wp, name=kw.get('name', 'MS1'),
            amount=kw.get('amount', D('100000')), retention_percent=kw.get('retention', D('10')),
            trigger_type=kw.get('trigger', BillingMilestone.TRIGGER_PROGRESS),
            trigger_progress_percent=kw.get('pct', D('80')),
        )

    def test_create_milestone_via_api(self):
        r = self.client.post(reverse('solar-milestones', kwargs={'build_id': self.build.id}),
                             data=json.dumps({'work_package_id': self.wp.id, 'name': 'Foundation', 'amount': '50000', 'retention_percent': '5'}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['milestone']['net_payable'], '47500.00')

    def test_auto_eligible_on_progress(self):
        from solar_engine.models import SiteProgressEntry, BillingMilestone
        ms = self._make_milestone(trigger=BillingMilestone.TRIGGER_PROGRESS, pct='80')
        SiteProgressEntry.objects.create(build=self.build, work_package=self.wp, site_name='S1',
                                         progress_date='2026-01-01', progress_percent='90')
        from solar_engine import billing
        billing.refresh_milestones(self.build)
        ms.refresh_from_db()
        self.assertEqual(ms.status, BillingMilestone.STATUS_ELIGIBLE)

    def test_approve_posts_vendor_payment(self):
        from decimal import Decimal as D
        from purchase_orders.models import PurchaseOrder
        from solar_engine.models import BillingMilestone
        po = PurchaseOrder.objects.create(po_number='PO-700', vendor=self.vendor,
                                          project_site_name='Site', total_po_value=D('500000'))
        ms = self._make_milestone()
        ms.status = BillingMilestone.STATUS_ELIGIBLE; ms.save()
        r = self.client.post(reverse('solar-milestone', kwargs={'milestone_id': ms.id}),
                             data=json.dumps({'action': 'approve', 'purchase_order_id': po.id}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        ms.refresh_from_db()
        self.assertEqual(ms.status, BillingMilestone.STATUS_APPROVED)
        self.assertIsNotNone(ms.vendor_payment_id)
        self.assertEqual(po.payments.count(), 1)

    def test_handover_certificate_issue(self):
        r = self.client.post(reverse('solar-certificates', kwargs={'build_id': self.build.id}),
                             data=json.dumps({'vendor_id': self.vendor.id, 'site_name': 'Pokaran',
                                              'scope_description': 'DC + AC complete', 'issue': True}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['certificate']['status'], 'issued')
        self.assertTrue(r.json()['certificate']['certificate_number'].startswith('HOC'))

    def test_retention_release_on_certificate(self):
        from decimal import Decimal as D
        from solar_engine.models import BillingMilestone
        ret = BillingMilestone.objects.create(
            build=self.build, work_package=self.wp, name='Retention release',
            amount=D('10000'), retention_percent=D('0'),
            trigger_type=BillingMilestone.TRIGGER_HANDOVER, payment_stage='retention')
        self.assertEqual(ret.status, BillingMilestone.STATUS_PENDING)
        self.client.post(reverse('solar-certificates', kwargs={'build_id': self.build.id}),
                         data=json.dumps({'vendor_id': self.vendor.id, 'scope_description': 'all done', 'issue': True}),
                         content_type='application/json')
        ret.refresh_from_db()
        self.assertEqual(ret.status, BillingMilestone.STATUS_ELIGIBLE)

    def test_vendor_billing_summary(self):
        self._make_milestone()  # default 100000, retention 10%
        r = self.client.get(reverse('solar-billing-summary', kwargs={'build_id': self.build.id}))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(len(r.json()['summary']) >= 1)

    def test_vendor_portal_billing_token(self):
        self._make_milestone()
        url = reverse('solar-field-vendor-billing')
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            bad = self.client.get(url + f'?vendor_id={self.vendor.id}')
            self.assertEqual(bad.status_code, 401)
            ok = self.client.get(url + f'?vendor_id={self.vendor.id}', HTTP_X_FIELD_TOKEN='tok')
            self.assertEqual(ok.status_code, 200)
            self.assertEqual(ok.json()['vendor']['id'], self.vendor.id)
            self.assertTrue(len(ok.json()['milestones']) >= 1)


class VendorPortalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def setUp(self):
        from core.models import Vendor
        from decimal import Decimal as D
        self.vendor = Vendor.objects.create(company_name='Portal EPC')
        self.project = ProjectMaster.objects.create(project_name='P', total_mw=D('5'))
        self.build = services.instantiate_build(self.project, C.PROJECT_TYPE_ROOFTOP, D('5'))
        self.wp = self.build.stages.first().work_packages.first()
        self.wp.assigned_vendor = self.vendor; self.wp.save()

    def test_auth_by_code(self):
        url = reverse('vp-auth')
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            bad = self.client.post(url, data=json.dumps({'code': self.vendor.vendor_id}), content_type='application/json')
            self.assertEqual(bad.status_code, 401)  # no token header
            ok = self.client.post(url, data=json.dumps({'code': self.vendor.vendor_id}),
                                  content_type='application/json', HTTP_X_FIELD_TOKEN='tok')
            self.assertEqual(ok.status_code, 200)
            self.assertEqual(ok.json()['vendor']['id'], self.vendor.id)
            wrong = self.client.post(url, data=json.dumps({'code': 'NOPE'}),
                                     content_type='application/json', HTTP_X_FIELD_TOKEN='tok')
            self.assertEqual(wrong.status_code, 401)

    def test_dashboard_and_scope(self):
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            d = self.client.get(reverse('vp-dashboard') + f'?vendor_id={self.vendor.id}', HTTP_X_FIELD_TOKEN='tok')
            self.assertEqual(d.status_code, 200)
            self.assertIn('work_progress_percent', d.json())
            w = self.client.get(reverse('vp-work-scope') + f'?vendor_id={self.vendor.id}', HTTP_X_FIELD_TOKEN='tok')
            self.assertEqual(w.status_code, 200)
            self.assertTrue(len(w.json()['work_scope']) >= 1)


class AuthTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')
        cls.project = ProjectMaster.objects.create(project_name='Auth', total_mw=Decimal('5'))

    def test_build_endpoint_requires_login(self):
        url = reverse('solar-project-build', kwargs={'project_id': self.project.id})
        resp = self.client.get(url)
        self.assertIn(resp.status_code, (302, 401, 403))

    def test_templates_endpoint_requires_login(self):
        resp = self.client.get(reverse('solar-templates'))
        self.assertIn(resp.status_code, (302, 401, 403))


class FreeIssueMaterialTests(TestCase):
    """BOM / requisition / MIS validation for free-issue work packages."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')
        from core.models import Vendor
        cls.vendor = Vendor.objects.create(
            vendor_id='VFI001', company_name='Free Issue Labour Co',
            vendor_type='partner', vendor_category='sub-contractor', status='active',
        )

    def _free_issue_wp(self, mw='5'):
        project = ProjectMaster.objects.create(project_name=f'FI {mw}', total_mw=Decimal(mw))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal(mw))
        wp = build.stages.first().work_packages.first()
        wp.engagement_type = wp.ENGAGEMENT_FREE_ISSUE
        wp.assigned_vendor = self.vendor
        wp.save()
        return build, wp

    def test_engagement_defaults_to_milestone(self):
        project = ProjectMaster.objects.create(project_name='Def', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        wp = build.stages.first().work_packages.first()
        self.assertEqual(wp.engagement_type, wp.ENGAGEMENT_MILESTONE)
        self.assertFalse(wp.is_free_issue)

    def test_requisition_and_issue_within_bom(self):
        from . import free_issue as fi
        from .models import WorkPackageBom
        _, wp = self._free_issue_wp()
        bom = WorkPackageBom.objects.create(
            work_package=wp, material_name='DCR Module 550Wp', unit='Nos',
            bom_quantity=Decimal('100'), rate=Decimal('12'))
        req = fi.create_requisition(wp, [{'bom_line': bom.id, 'quantity': '40'}], vendor=self.vendor)
        self.assertEqual(req.lines.count(), 1)
        self.assertTrue(req.requisition_no.startswith('REQ-'))
        mis = fi.issue_material(wp, [{'bom_line': bom.id, 'quantity': '40'}], requisition=req)
        self.assertTrue(mis.mis_no.startswith('MIS-'))
        bom.refresh_from_db()
        self.assertEqual(bom.issued_quantity, Decimal('40'))
        self.assertEqual(bom.available_quantity, Decimal('60'))
        req.refresh_from_db()
        self.assertEqual(req.status, req.STATUS_ISSUED)

    def test_issue_cannot_exceed_bom(self):
        from . import free_issue as fi
        from .models import WorkPackageBom
        _, wp = self._free_issue_wp()
        bom = WorkPackageBom.objects.create(
            work_package=wp, material_name='AC Cable', unit='m', bom_quantity=Decimal('100'))
        fi.issue_material(wp, [{'bom_line': bom.id, 'quantity': '70'}])
        with self.assertRaises(services.EngineError):
            fi.issue_material(wp, [{'bom_line': bom.id, 'quantity': '40'}])  # 70+40 > 100
        bom.refresh_from_db()
        self.assertEqual(bom.issued_quantity, Decimal('70'))  # second issue rolled back

    def test_requisition_cannot_exceed_bom_balance(self):
        from . import free_issue as fi
        from .models import WorkPackageBom
        _, wp = self._free_issue_wp()
        bom = WorkPackageBom.objects.create(
            work_package=wp, material_name='Earthing Strip', unit='m', bom_quantity=Decimal('50'))
        with self.assertRaises(services.EngineError):
            fi.create_requisition(wp, [{'bom_line': bom.id, 'quantity': '60'}])

    def test_free_issue_actions_rejected_on_milestone_wp(self):
        from . import free_issue as fi
        from .models import WorkPackageBom
        project = ProjectMaster.objects.create(project_name='MS', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        wp = build.stages.first().work_packages.first()  # milestone by default
        bom = WorkPackageBom.objects.create(
            work_package=wp, material_name='X', bom_quantity=Decimal('10'))
        with self.assertRaises(services.EngineError):
            fi.issue_material(wp, [{'bom_line': bom.id, 'quantity': '1'}])

    def test_seed_bom_from_boq_material_rows_only(self):
        from . import free_issue as fi
        build, wp = self._free_issue_wp()
        material_rows = build.boq_items.filter(is_material=True).count()
        created = fi.seed_bom_from_boq(wp)
        self.assertEqual(len(created), material_rows)
        self.assertTrue(all(b.source_boq_item_id for b in created))


class FreeIssuePortalLockTests(TestCase):
    """Field-portal MIS request lock: locked until labour work completes."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')
        from core.models import Vendor
        cls.vendor = Vendor.objects.create(
            vendor_id='VPLK01', company_name='Lock Test Labour Co',
            vendor_type='partner', vendor_category='sub-contractor', status='active')
        project = ProjectMaster.objects.create(project_name='Lock FI', total_mw=Decimal('5'))
        build = services.instantiate_build(project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        cls.wp = build.stages.first().work_packages.first()
        cls.wp.engagement_type = cls.wp.ENGAGEMENT_FREE_ISSUE
        cls.wp.assigned_vendor = cls.vendor
        cls.wp.status = C.STATUS_IN_PROGRESS
        cls.wp.save()
        from .models import WorkPackageBom
        cls.bom = WorkPackageBom.objects.create(
            work_package=cls.wp, material_name='GI Strip', unit='m', bom_quantity=Decimal('100'))

    def _issue(self, token='tok'):
        import json
        url = reverse('vp-issue-material') + f'?vendor_id={self.vendor.id}'
        return self.client.post(
            url, data=json.dumps({'work_package_id': self.wp.id,
                                  'lines': [{'bom_line_id': self.bom.id, 'quantity': '10'}]}),
            content_type='application/json', HTTP_X_FIELD_TOKEN=token)

    def _pass_qa(self, fail=False):
        """Attach a passed QA inspection (optionally with a failed checkpoint)."""
        from .models import QualityInspection, QualityCheckpoint
        insp = QualityInspection.objects.create(
            build=self.wp.stage.build, work_package=self.wp, vendor=self.vendor,
            site_name='Site', inspection_type='earth_continuity',
            inspection_date=__import__('datetime').date.today(),
            status=QualityInspection.STATUS_PASSED)
        QualityCheckpoint.objects.create(
            inspection=insp, order=1, parameter='Earth continuity',
            result=QualityCheckpoint.RESULT_FAIL if fail else QualityCheckpoint.RESULT_PASS)
        return insp

    def test_mis_locked_until_labour_complete(self):
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            resp = self._issue()
            self.assertEqual(resp.status_code, 403)
            self.assertFalse(resp.json().get('mis_unlocked', True))
        self.bom.refresh_from_db()
        self.assertEqual(self.bom.issued_quantity, Decimal('0'))  # nothing issued while locked

    def test_mis_still_locked_without_qa_even_if_completed(self):
        """Gate 1 passes (completed) but gate 2 (QA) not met → still locked."""
        self.wp.status = C.STATUS_COMPLETED
        self.wp.save()
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            resp = self._issue()
            self.assertEqual(resp.status_code, 403)
            self.assertIn('QA', resp.json()['error'])
        self.bom.refresh_from_db()
        self.assertEqual(self.bom.issued_quantity, Decimal('0'))

    def test_mis_locked_when_qa_has_failed_checkpoint(self):
        self.wp.status = C.STATUS_COMPLETED
        self.wp.save()
        self._pass_qa(fail=True)  # passed inspection but a FAILED checkpoint
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            resp = self._issue()
            self.assertEqual(resp.status_code, 403)
            self.assertIn('checkpoints', resp.json()['error'])

    def test_mis_unlocks_when_completed_and_qa_passed(self):
        self.wp.status = C.STATUS_COMPLETED
        self.wp.save()
        self._pass_qa()  # labour complete AND QA passed
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            resp = self._issue()
            self.assertEqual(resp.status_code, 201)
            self.assertTrue(resp.json()['mis_no'].startswith('MIS-'))
        self.bom.refresh_from_db()
        self.assertEqual(self.bom.issued_quantity, Decimal('10'))

    def test_open_critical_punch_blocks_mis(self):
        from .models import PunchItem
        self.wp.status = C.STATUS_COMPLETED
        self.wp.save()
        self._pass_qa()
        PunchItem.objects.create(
            build=self.wp.stage.build, work_package=self.wp, title='Loose bolt',
            raised_on=__import__('datetime').date.today(),
            status=PunchItem.STATUS_OPEN, severity=PunchItem.SEV_CRITICAL)
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            resp = self._issue()
            self.assertEqual(resp.status_code, 403)
            self.assertIn('punch', resp.json()['error'].lower())

    def test_work_scope_exposes_engagement_and_lock(self):
        with self.settings(FIELD_INGEST_TOKEN='tok'):
            url = reverse('vp-work-scope') + f'?vendor_id={self.vendor.id}'
            rows = self.client.get(url, HTTP_X_FIELD_TOKEN='tok').json()['work_scope']
        row = next(r for r in rows if r['id'] == self.wp.id)
        self.assertEqual(row['engagement_type'], 'free_issue')
        self.assertTrue(row['is_free_issue'])
        self.assertFalse(row['mis_unlocked'])  # in_progress → locked


class DmsTests(TestCase):
    """Engineering DMS: revision/version control + approval status sync."""

    @classmethod
    def setUpTestData(cls):
        cls.project = ProjectMaster.objects.create(project_name='DMS Proj', total_mw=Decimal('5'))

    def _doc(self):
        from .models import EngineeringDocument
        from . import dms
        doc = EngineeringDocument.objects.create(
            project=self.project, doc_no='SLD-001', title='Main SLD',
            discipline=EngineeringDocument.DISC_ELEC, category=EngineeringDocument.CAT_SLD)
        dms.add_revision(doc, change_note='Initial issue')
        return doc

    def test_first_revision_is_r0_and_current(self):
        doc = self._doc()
        self.assertEqual(doc.revisions.count(), 1)
        self.assertEqual(doc.current_revision.rev_no, 'R0')

    def test_new_revision_supersedes_previous(self):
        from . import dms
        from .models import DocumentRevision
        doc = self._doc()
        r0 = doc.current_revision
        r1 = dms.add_revision(doc, change_note='DISCOM comments incorporated')
        doc.refresh_from_db(); r0.refresh_from_db()
        self.assertEqual(r1.rev_no, 'R1')
        self.assertEqual(doc.current_revision_id, r1.id)
        self.assertEqual(r0.status, DocumentRevision.STATUS_SUPERSEDED)

    def test_approve_current_revision_marks_document_approved(self):
        from . import dms
        from .models import EngineeringDocument, DocumentRevision
        doc = self._doc()
        dms.set_revision_status(doc.current_revision, DocumentRevision.STATUS_APPROVED)
        doc.refresh_from_db()
        self.assertEqual(doc.status, EngineeringDocument.STATUS_APPROVED)
        self.assertIsNotNone(doc.current_revision.approved_on)

    def test_new_revision_after_approval_reopens_review(self):
        from . import dms
        from .models import EngineeringDocument, DocumentRevision
        doc = self._doc()
        dms.set_revision_status(doc.current_revision, DocumentRevision.STATUS_APPROVED)
        dms.add_revision(doc, change_note='Rev for as-built')
        doc.refresh_from_db()
        self.assertEqual(doc.status, EngineeringDocument.STATUS_IN_REVIEW)

    def test_documents_endpoint_requires_login(self):
        resp = self.client.get(reverse('solar-documents', args=[self.project.id]))
        self.assertIn(resp.status_code, (302, 401, 403))


class SubcontractWorkOrderTests(TestCase):
    """Labour-only subcontractor work orders: create, link WPs, issue→propagate."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')
        from core.models import Vendor
        cls.vendor = Vendor.objects.create(
            vendor_id='VWO001', company_name='WO Labour Co',
            vendor_type='partner', vendor_category='sub-contractor', status='active')
        from .models import ProjectWorkPackage
        cls.project = ProjectMaster.objects.create(project_name='WO Proj', total_mw=Decimal('5'))
        cls.build = services.instantiate_build(cls.project, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        cls.wps = list(ProjectWorkPackage.objects.filter(stage__build=cls.build)[:2])

    def _wo(self, **kw):
        from . import work_orders as wo
        return wo.create_work_order(
            self.project, self.vendor, kw.get('title', 'Civil & MMS labour'),
            lines=[{'work_package_id': self.wps[0].id, 'line_value': '500000'},
                   {'work_package_id': self.wps[1].id, 'line_value': '300000'}],
            engagement_type=kw.get('engagement_type', 'free_issue'),
            rate_basis='per_wp_wattage', rate_per_wp='3.50', contract_value='800000',
            retention_percent='5')

    def test_create_generates_wo_no_and_links(self):
        wo = self._wo()
        self.assertTrue(wo.wo_no.startswith('WO-'))
        self.assertEqual(wo.lines.count(), 2)
        self.assertEqual(wo.lines_value, Decimal('800000'))
        self.assertEqual(wo.status, wo.STATUS_DRAFT)

    def test_issue_propagates_vendor_and_engagement(self):
        from . import work_orders as wo_svc
        wo = self._wo(engagement_type='free_issue')
        wo_svc.issue_work_order(wo, propagate=True)
        wo.refresh_from_db()
        self.assertEqual(wo.status, wo.STATUS_ISSUED)
        for wp in self.wps:
            wp.refresh_from_db()
            self.assertEqual(wp.assigned_vendor_id, self.vendor.id)
            self.assertEqual(wp.engagement_type, 'free_issue')

    def test_issue_without_lines_rejected(self):
        from . import work_orders as wo_svc
        wo = wo_svc.create_work_order(self.project, self.vendor, 'Empty WO')
        with self.assertRaises(services.EngineError):
            wo_svc.issue_work_order(wo)

    def test_duplicate_work_package_line_rejected(self):
        from . import work_orders as wo_svc
        wo = self._wo()
        with self.assertRaises(services.EngineError):
            wo_svc.add_line(wo, self.wps[0].id, '100')

    def test_work_package_from_other_project_rejected(self):
        from . import work_orders as wo_svc
        from .models import ProjectWorkPackage
        other = ProjectMaster.objects.create(project_name='Other', total_mw=Decimal('5'))
        ob = services.instantiate_build(other, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        owp = ProjectWorkPackage.objects.filter(stage__build=ob).first()
        wo = wo_svc.create_work_order(self.project, self.vendor, 'X')
        with self.assertRaises(services.EngineError):
            wo_svc.add_line(wo, owp.id, '100')

    def test_work_orders_endpoint_requires_login(self):
        resp = self.client.get(reverse('solar-work-orders', args=[self.project.id]))
        self.assertIn(resp.status_code, (302, 401, 403))


class ProjectReadinessGateTests(TestCase):
    """Combined development gate: site cleared + mandatory NOC checklist."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def _project(self, name):
        return ProjectMaster.objects.create(project_name=name, total_mw=Decimal('5'))

    def test_no_nocs_no_sites_is_unlocked(self):
        # Sites feature absent in this clone → site part is empty; no NOCs → unlocked.
        p = self._project('Clean')
        r = services.project_readiness(p)
        self.assertFalse(r['locked'])
        # build should succeed
        b = services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        self.assertIsNotNone(b)

    def test_apply_checklist_locks_until_approved(self):
        from .models import StatutoryApproval
        p = self._project('Gated')
        n = services.apply_default_noc_checklist(p)
        self.assertEqual(n, len(services.DEFAULT_NOC_CHECKLIST))
        r = services.project_readiness(p)
        self.assertTrue(r['locked'])
        self.assertEqual(len(r['nocs']), n)
        # build must be blocked now
        with self.assertRaises(services.EngineError):
            services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        # approve/waive all mandatory NOCs
        for a in StatutoryApproval.objects.filter(project=p, is_mandatory=True):
            a.status = StatutoryApproval.STATUS_APPROVED
            a.save()
        r2 = services.project_readiness(p)
        self.assertFalse(r2['locked'])
        self.assertIsNotNone(services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5')))

    def test_waived_also_satisfies(self):
        from .models import StatutoryApproval
        p = self._project('Waive')
        services.apply_default_noc_checklist(p)
        StatutoryApproval.objects.filter(project=p).update(status=StatutoryApproval.STATUS_WAIVED)
        self.assertFalse(services.project_readiness(p)['locked'])

    def test_apply_checklist_idempotent(self):
        p = self._project('Idem')
        services.apply_default_noc_checklist(p)
        again = services.apply_default_noc_checklist(p)
        self.assertEqual(again, 0)

    def test_readiness_endpoint_requires_login(self):
        p = self._project('Auth')
        resp = self.client.get(reverse('solar-readiness', args=[p.id]))
        self.assertIn(resp.status_code, (302, 401, 403))


class PerSiteComplianceTests(TestCase):
    """Per-location sites: MW rollup + per-site assessment & NOC gate."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def _project(self):
        return ProjectMaster.objects.create(project_name='Multi-site', project_code='MS1', total_mw=Decimal('0'))

    def test_allocated_mw_sums_sites(self):
        from .models import ProjectSite
        p = ProjectMaster.objects.create(project_name='Alloc', project_code='AL1', total_mw=Decimal('10'))
        ProjectSite.objects.create(project=p, site_code='AL1-S01', site_name='A', capacity_mw=Decimal('3'))
        ProjectSite.objects.create(project=p, site_code='AL1-S02', site_name='B', capacity_mw=Decimal('2.5'))
        self.assertEqual(services.allocated_mw(p), Decimal('5.5'))

    def test_site_capacity_cannot_exceed_project(self):
        from .models import ProjectSite
        p = ProjectMaster.objects.create(project_name='Cap', project_code='CP1', total_mw=Decimal('5'))
        ProjectSite.objects.create(project=p, site_code='CP1-S01', site_name='A', capacity_mw=Decimal('3'))
        # 3 already allocated of 5 → a 3 MW site (total 6) must be rejected
        with self.assertRaises(services.EngineError):
            services.validate_site_capacity(p, Decimal('3'))
        # 2 MW fits exactly
        services.validate_site_capacity(p, Decimal('2'))

    def test_no_cap_when_project_capacity_unset(self):
        p = ProjectMaster.objects.create(project_name='NoCap', project_code='NC1', total_mw=Decimal('0'))
        services.validate_site_capacity(p, Decimal('999'))  # no error

    def test_no_site_is_not_blocked(self):
        # A project with no locations yet is not gated on sites.
        p = self._project()
        self.assertFalse(services.project_readiness(p)['locked'])

    def test_pending_site_blocks(self):
        from .models import ProjectSite
        p = self._project()
        ProjectSite.objects.create(project=p, site_code='MS1-S09', site_name='Pending', capacity_mw=Decimal('2'))
        self.assertTrue(services.project_readiness(p)['locked'])

    def test_site_cleared_when_assessments_and_nocs_satisfied(self):
        from .models import ProjectSite, SiteAssessmentItem, StatutoryApproval
        p = self._project()
        site = ProjectSite.objects.create(project=p, site_code='MS1-S01', site_name='A', capacity_mw=Decimal('5'))
        services.apply_default_site_assessments(site)
        services.apply_default_noc_checklist(p, site=site)
        # locked while pending
        self.assertTrue(services.project_readiness(p)['locked'])
        with self.assertRaises(services.EngineError):
            services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        # clear everything
        SiteAssessmentItem.objects.filter(site=site).update(status=SiteAssessmentItem.STATUS_CLEARED)
        StatutoryApproval.objects.filter(site=site).update(status=StatutoryApproval.STATUS_APPROVED)
        services.maybe_autoclear_site(site)
        site.refresh_from_db()
        self.assertEqual(site.status, ProjectSite.STATUS_CLEARED)
        self.assertFalse(services.project_readiness(p)['locked'])
        self.assertIsNotNone(services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5')))

    def test_one_pending_site_keeps_project_locked(self):
        from .models import ProjectSite, SiteAssessmentItem, StatutoryApproval
        p = self._project()
        s1 = ProjectSite.objects.create(project=p, site_code='MS1-S01', site_name='A', capacity_mw=Decimal('5'), status=ProjectSite.STATUS_CLEARED)
        s2 = ProjectSite.objects.create(project=p, site_code='MS1-S02', site_name='B', capacity_mw=Decimal('3'))
        services.apply_default_site_assessments(s2)
        r = services.project_readiness(p)
        self.assertTrue(r['locked'])
        self.assertTrue(any('B (3' in x for x in r['sites']))

    def test_per_site_noc_label_includes_site(self):
        from .models import ProjectSite, StatutoryApproval
        p = self._project()
        site = ProjectSite.objects.create(project=p, site_code='MS1-S01', site_name='Pokaran-A', capacity_mw=Decimal('5'), status=ProjectSite.STATUS_CLEARED)
        StatutoryApproval.objects.create(project=p, site=site, authority='DISCOM', approval_type='Feeder', is_mandatory=True, status='pending')
        nocs = services.noc_blockers(p)
        self.assertTrue(any('Pokaran-A' in n for n in nocs))

    def test_sites_endpoint_requires_login(self):
        p = self._project()
        resp = self.client.get(reverse('solar-sites', args=[p.id]))
        self.assertIn(resp.status_code, (302, 401, 403))


class MarginTests(TestCase):
    """Per-Watt profitability / margin calculator."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')
        from core.models import Vendor
        cls.vendor = Vendor.objects.create(
            vendor_id='VMG01', company_name='Margin Labour Co',
            vendor_type='partner', vendor_category='sub-contractor', status='active')

    def test_margin_math(self):
        from . import margin as m
        from . import work_orders as wo_svc
        from .models import ProjectWorkPackage
        p = ProjectMaster.objects.create(project_name='Margin', project_code='MG1', total_mw=Decimal('5'))
        build = services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        wp = ProjectWorkPackage.objects.filter(stage__build=build).first()
        # client pays 30 ₹/Wp → revenue = 30 * 5,000,000 = 150,000,000
        c = m.get_commercials(p); c.client_rate_per_wp = Decimal('30'); c.overhead_percent = Decimal('10'); c.save()
        # one labour work order worth 40,000,000 outflow
        w = wo_svc.create_work_order(p, self.vendor, 'Labour', lines=[{'work_package_id': wp.id, 'line_value': '40000000'}],
                                     contract_value='40000000')
        res = m.compute_margin(p)
        self.assertEqual(res['revenue'], '150000000.00')
        self.assertEqual(res['subcontractor_outflow'], '40000000.00')
        self.assertEqual(res['overhead'], '15000000.00')       # 10% of 150M
        self.assertEqual(res['margin'], '95000000.00')         # 150 - 40 - 15
        self.assertEqual(res['margin_per_wp'], '19.0000')      # 95M / 5M Wp
        self.assertEqual(res['margin_percent'], '63.33')

    def test_margin_endpoint_requires_login(self):
        p = ProjectMaster.objects.create(project_name='MgAuth', total_mw=Decimal('5'))
        resp = self.client.get(reverse('solar-margin', args=[p.id]))
        self.assertIn(resp.status_code, (302, 401, 403))


class GrnTests(TestCase):
    """Goods Receipt Note — inbound client-furnished material."""

    @classmethod
    def setUpTestData(cls):
        cls.project = ProjectMaster.objects.create(project_name='GRN Proj', project_code='GR1', total_mw=Decimal('5'))

    def test_create_grn_numbers_and_serials(self):
        from . import grn as g
        grn = g.create_grn(self.project, [
            {'material_name': '550Wp Module', 'quantity_received': '100', 'unit': 'Nos',
             'serial_numbers': 'M001\nM002\nM003'},
            {'material_name': 'String Inverter', 'quantity_received': '4', 'unit': 'Nos',
             'serial_numbers': 'INV-1, INV-2'},
        ], supplier='Client OEM', consignment_ref='CH-5521')
        self.assertTrue(grn.grn_no.startswith('GRN-'))
        self.assertEqual(grn.lines.count(), 2)
        self.assertEqual(grn.lines.get(material_name='550Wp Module').serial_count, 3)
        self.assertEqual(grn.lines.get(material_name='String Inverter').serial_count, 2)

    def test_received_stock_pools_ok_lines(self):
        from . import grn as g
        from .models import GoodsReceiptNote, GoodsReceiptLine
        g.create_grn(self.project, [{'material_name': 'Module', 'quantity_received': '100'}])
        grn2 = g.create_grn(self.project, [{'material_name': 'Module', 'quantity_received': '50'}])
        # a damaged line should NOT count
        GoodsReceiptLine.objects.create(grn=grn2, material_name='Module', quantity_received=Decimal('999'),
                                        condition=GoodsReceiptLine.CONDITION_DAMAGED)
        pool = g.received_stock(self.project)
        self.assertEqual(pool['Module'], Decimal('150'))

    def test_rejected_grn_excluded_from_stock(self):
        from . import grn as g
        from .models import GoodsReceiptNote
        grn = g.create_grn(self.project, [{'material_name': 'Cable', 'quantity_received': '500'}])
        grn.status = GoodsReceiptNote.STATUS_REJECTED; grn.save()
        self.assertNotIn('Cable', g.received_stock(self.project))

    def test_empty_grn_rejected(self):
        from . import grn as g
        with self.assertRaises(services.EngineError):
            g.create_grn(self.project, [])

    def test_grn_endpoint_requires_login(self):
        resp = self.client.get(reverse('solar-grn', args=[self.project.id]))
        self.assertIn(resp.status_code, (302, 401, 403))


class DossierTests(TestCase):
    """As-built dossier manifest aggregation."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_solar_templates')

    def test_manifest_aggregates_sections(self):
        from . import dossier as d, dms as dms_svc, grn as grn_svc
        from .models import (EngineeringDocument, DocumentRevision, HandoverCertificate)
        import datetime
        p = ProjectMaster.objects.create(project_name='Dossier', project_code='DS1', total_mw=Decimal('5'))
        build = services.instantiate_build(p, C.PROJECT_TYPE_ROOFTOP, Decimal('5'))
        # approved as-built doc
        doc = EngineeringDocument.objects.create(project=p, build=build, doc_no='AB-SLD-1',
            title='As-built SLD', discipline=EngineeringDocument.DISC_ELEC, category=EngineeringDocument.CAT_SLD)
        dms_svc.add_revision(doc, change_note='as-built')
        dms_svc.set_revision_status(doc.current_revision, DocumentRevision.STATUS_APPROVED)
        # GRN with serials
        grn_svc.create_grn(p, [{'material_name': 'Module', 'quantity_received': '3',
                                 'serial_numbers': 'S1\nS2\nS3'}])
        # handover cert (issued)
        HandoverCertificate.objects.create(build=build, certificate_number='HOC-1',
            site_name='A', status=HandoverCertificate.STATUS_ISSUED, issued_date=datetime.date.today())
        m = d.build_manifest(p)
        self.assertEqual(m['counts']['documents_approved'], 1)
        self.assertEqual(m['counts']['serials'], 3)
        self.assertEqual(m['counts']['certificates'], 1)
        self.assertEqual(m['counts']['punch_open'], 0)
        self.assertTrue(m['ready'])   # docs + no open punch + certificate

    def test_zip_builds(self):
        from . import dossier as d
        p = ProjectMaster.objects.create(project_name='Zip', project_code='ZP1', total_mw=Decimal('5'))
        name, data = d.build_zip(p)
        self.assertTrue(name.endswith('.zip'))
        import zipfile, io
        z = zipfile.ZipFile(io.BytesIO(data))
        self.assertIn('DOSSIER.md', z.namelist())
        self.assertIn('manifest.json', z.namelist())

    def test_dossier_endpoint_requires_login(self):
        p = ProjectMaster.objects.create(project_name='DAuth', total_mw=Decimal('5'))
        resp = self.client.get(reverse('solar-dossier', args=[p.id]))
        self.assertIn(resp.status_code, (302, 401, 403))
