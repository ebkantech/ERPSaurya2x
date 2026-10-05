"""Seed / refresh the default component spec set and the rooftop + ground-mount
WBS and BOQ templates from the 5 MW study book.

Idempotent: re-running updates the default spec set in place and recreates the
seeded default templates (only those named "Study Book …"), leaving any
engineer-authored templates untouched.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from solar_engine import constants as C
from solar_engine import seed_data as S
from solar_engine.models import (
    BoqSection,
    BoqTemplate,
    BoqTemplateItem,
    ComponentSpecSet,
    WbsStage,
    WbsTemplate,
    WbsWorkPackage,
)

ROOFTOP_WBS_NAME = 'Study Book Rooftop WBS'
GROUND_WBS_NAME = 'Study Book Ground-mount WBS'
ROOFTOP_BOQ_NAME = 'Study Book Rooftop BOQ'
GROUND_BOQ_NAME = 'Study Book Ground-mount BOQ'


class Command(BaseCommand):
    help = 'Seed default solar component specs and WBS/BOQ templates.'

    @transaction.atomic
    def handle(self, *args, **options):
        spec = self._seed_spec()
        self._seed_wbs(ROOFTOP_WBS_NAME, C.PROJECT_TYPE_ROOFTOP, S.WBS_ROOFTOP)
        self._seed_wbs(GROUND_WBS_NAME, C.PROJECT_TYPE_GROUND, S.WBS_GROUND)
        self._seed_boq(ROOFTOP_BOQ_NAME, C.PROJECT_TYPE_ROOFTOP, S.BOQ_ROOFTOP)
        self._seed_boq(GROUND_BOQ_NAME, C.PROJECT_TYPE_GROUND, S.BOQ_GROUND)
        self.stdout.write(self.style.SUCCESS(
            f'Seeded spec "{spec.name}" and rooftop + ground templates.'
        ))

    def _seed_spec(self):
        data = dict(S.DEFAULT_SPEC)
        name = data.pop('name')
        # Only one default at a time.
        ComponentSpecSet.objects.exclude(name=name).update(is_default=False)
        spec, _ = ComponentSpecSet.objects.update_or_create(name=name, defaults=data)
        return spec

    def _seed_wbs(self, name, project_type, stages):
        WbsTemplate.objects.filter(name=name).delete()
        tpl = WbsTemplate.objects.create(
            name=name, project_type=project_type, is_active=True, is_default=True,
        )
        for s_order, (code, stage_name, is_parallel, packages) in enumerate(stages, 1):
            stage = WbsStage.objects.create(
                template=tpl, order=s_order, code=code, name=stage_name, is_parallel=is_parallel,
            )
            WbsWorkPackage.objects.bulk_create([
                WbsWorkPackage(stage=stage, order=w_order, name=pkg)
                for w_order, pkg in enumerate(packages, 1)
            ])
        return tpl

    def _seed_boq(self, name, project_type, sections):
        BoqTemplate.objects.filter(name=name).delete()
        tpl = BoqTemplate.objects.create(
            name=name, project_type=project_type, is_active=True, is_default=True,
        )
        for s_order, (section_name, is_material, items) in enumerate(sections, 1):
            section = BoqSection.objects.create(
                template=tpl, order=s_order, name=section_name, is_material=is_material,
            )
            BoqTemplateItem.objects.bulk_create([
                BoqTemplateItem(
                    section=section, order=i_order, description=desc, specification=note,
                    unit=unit, quantity_basis=basis, quantity_factor=factor,
                )
                for i_order, (desc, unit, basis, factor, note) in enumerate(items, 1)
            ])
        return tpl
