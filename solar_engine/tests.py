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
