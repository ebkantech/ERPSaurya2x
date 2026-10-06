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
