"""Fill a project's site registry with realistic demo data.

Every site a user registers starts with an empty assessment file — that is the
point of the gate. This command exists so the screens can be demonstrated
without typing eight documents in by hand.

    python manage.py seed_site_demo                  # uses/creates a demo project
    python manage.py seed_site_demo --project PRJ003 # attach to an existing one
    python manage.py seed_site_demo --clear          # remove demo sites again
"""
import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import ProjectMaster, ProjectSite, SiteAssessment

DEMO_PROJECT = {
    'project_name': '205 MW Rajasthan KUSUM A & C',
    'client_name': 'Helios Power Ltd',
    'procurement_source': 'epc',
    'business_unit': 'Solar EPC',
    'project_location': 'Rajasthan',
    'total_mw': Decimal('205.00'),
    'status': 'running',
}

# Each site: fields, then how far its assessment has got.
#   cleared  → signed + verified, status cleared
#   uploaded → file on record, awaiting the client's or DISCOM's sign-off
#   pending  → nothing yet
DEMO_SITES = [
    {
        'site_name': 'Bhadla Block A',
        'capacity_mw': Decimal('45.00'),
        'land_area_acres': Decimal('182.40'),
        'mounting_type': 'ground_tracker',
        'village': 'Bhadla', 'tehsil': 'Bap', 'district': 'Jodhpur', 'state': 'Rajasthan',
        'latitude': Decimal('27.539800'), 'longitude': Decimal('71.912400'),
        'khasra_numbers': '98/1, 98/2',
        'land_title': 'allotment', 'owner_name': 'Rajasthan Renewable Energy Corp',
        'tenure_years': 30,
        'documents': {
            'site_clearance':    ('SCR-001.pdf',      'Helios Power Ltd',       '2026-06-18', 'R. Kulkarni', 'cleared'),
            'land_title':        ('allotment-98.pdf', 'RRECL',                  '2026-05-02', 'R. Kulkarni', 'cleared'),
            'revenue_record':    ('khasra-98.pdf',    'Tehsildar, Bap',         '2026-05-11', 'S. Mehta',    'cleared'),
            'topography':        ('topo-a1.pdf',      'GeoSurvey Pvt Ltd',      '2026-06-02', 'S. Mehta',    'cleared'),
            'grid_connectivity': ('grid-a1.pdf',      'Jodhpur DISCOM',         '2026-06-24', 'R. Kulkarni', 'cleared'),
            'approach_road':     ('road-a1.pdf',      'PWD Jodhpur',            '2026-06-28', 'S. Mehta',    'cleared'),
            'geotech':           ('geotech-a1.pdf',   'TerraTest Labs',         '2026-06-05', 'S. Mehta',    'cleared'),
        },
    },
    {
        'site_name': 'Bhadla Block B',
        'capacity_mw': Decimal('60.00'),
        'land_area_acres': Decimal('243.50'),
        'mounting_type': 'ground_tracker',
        'village': 'Bhadla', 'tehsil': 'Bap', 'district': 'Jodhpur', 'state': 'Rajasthan',
        'latitude': Decimal('27.548100'), 'longitude': Decimal('71.926700'),
        'khasra_numbers': '114/2, 114/3',
        'land_title': 'lease', 'owner_name': 'M. Choudhary', 'tenure_years': 29,
        'documents': {
            'site_clearance':    ('SCR-002.pdf',   'Helios Power Ltd',   '2026-07-14', 'R. Kulkarni', 'cleared'),
            'land_title':        ('lease-114.pdf', 'M. Choudhary',       '2026-06-02', 'R. Kulkarni', 'cleared'),
            'revenue_record':    ('khasra-114.pdf','Tehsildar, Bap',     '2026-06-11', 'S. Mehta',    'cleared'),
            'topography':        ('topo-b2.pdf',   'GeoSurvey Pvt Ltd',  '2026-07-28', 'S. Mehta',    'cleared'),
            'grid_connectivity': ('grid-req.pdf',  '',                   '',           '',            'uploaded'),
            'geotech':           ('geotech-b2.pdf','TerraTest Labs',     '2026-07-20', 'S. Mehta',    'cleared'),
        },
    },
    {
        'site_name': 'Jaisalmer North',
        'capacity_mw': Decimal('50.00'),
        'land_area_acres': Decimal('205.00'),
        'mounting_type': 'ground_fixed',
        'village': 'Nachna', 'tehsil': 'Pokhran', 'district': 'Jaisalmer', 'state': 'Rajasthan',
        'latitude': Decimal('27.098400'), 'longitude': Decimal('71.364500'),
        'khasra_numbers': '42/7',
        'land_title': 'allotment', 'owner_name': 'Rajasthan Renewable Energy Corp',
        'tenure_years': 30,
        'documents': {
            'site_clearance': ('SCR-003.pdf',    'Helios Power Ltd', '2026-08-21', 'R. Kulkarni', 'cleared'),
            'land_title':     ('allotment-42.pdf','RRECL',           '2026-08-04', 'S. Mehta',    'cleared'),
            'revenue_record': ('khasra-42.pdf',  '',                 '',           '',            'uploaded'),
        },
    },
    {
        'site_name': 'Phalodi East',
        'capacity_mw': Decimal('50.00'),
        'land_area_acres': Decimal('198.75'),
        'mounting_type': 'ground_fixed',
        'village': 'Phalodi', 'tehsil': 'Phalodi', 'district': 'Jodhpur', 'state': 'Rajasthan',
        'khasra_numbers': '7/1, 7/2',
        'documents': {},
    },
]


def _date(raw):
    return datetime.datetime.strptime(raw, '%Y-%m-%d').date() if raw else None


class Command(BaseCommand):
    help = "Seed demo sites and assessment data so the site registry screens can be demonstrated."

    def add_arguments(self, parser):
        parser.add_argument('--project', dest='project_code', default=None,
                            help='Attach the demo sites to this project code (e.g. PRJ003).')
        parser.add_argument('--clear', action='store_true',
                            help='Delete the demo sites instead of creating them.')

    def handle(self, *args, **options):
        code = options['project_code']

        if code:
            try:
                project = ProjectMaster.objects.get(project_code=code)
            except ProjectMaster.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'No project with code {code}.'))
                return
        else:
            project = ProjectMaster.objects.filter(
                project_name=DEMO_PROJECT['project_name']
            ).first()
            if project is None:
                project = ProjectMaster.objects.create(**DEMO_PROJECT)
                self.stdout.write(f'Created project {project.project_code} · {project.project_name}')

        demo_names = [s['site_name'] for s in DEMO_SITES]

        if options['clear']:
            removed, _ = ProjectSite.objects.filter(
                project=project, site_name__in=demo_names
            ).delete()
            self.stdout.write(self.style.SUCCESS(
                f'Removed demo sites from {project.project_code} ({removed} rows).'
            ))
            return

        created, skipped = 0, 0
        with transaction.atomic():
            for spec in DEMO_SITES:
                spec = dict(spec)
                documents = spec.pop('documents')

                if ProjectSite.objects.filter(project=project, site_name=spec['site_name']).exists():
                    skipped += 1
                    continue

                site = ProjectSite.objects.create(project=project, **spec)

                for key, (file_name, signed_by, signed_on, verified_by, status) in documents.items():
                    row = site.assessments.filter(document_key=key).first()
                    if row is None:
                        continue
                    row.file_name = file_name
                    row.signed_by = signed_by
                    row.signed_on = _date(signed_on)
                    row.verified_by = verified_by
                    row.verified_on = _date(signed_on)
                    row.status = status
                    row.save()

                site.recalculate_status()
                site.refresh_from_db()
                created += 1
                self.stdout.write(
                    f'  {site.site_code}  {site.site_name:<18} '
                    f'{site.capacity_mw} MW  '
                    f'{site.mandatory_cleared}/{site.mandatory_total}  {site.status}'
                )

        total = sum(
            (s.capacity_mw or Decimal('0')) for s in project.sites.all()
        )
        cleared = sum(1 for s in project.sites.all() if s.is_cleared)
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'{created} site(s) created, {skipped} already present.'
        ))
        self.stdout.write(
            f'{project.project_code}: {total} MW allocated of {project.total_mw} MW sanctioned · '
            f'{cleared} of {project.sites.count()} sites cleared'
        )
        self.stdout.write(
            self.style.WARNING('Execution stays locked until every site clears.')
            if cleared != project.sites.count()
            else self.style.SUCCESS('Execution unlocked.')
        )
