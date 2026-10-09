"""Core engine: sizing calculator, template instantiation, lock & the
auto-drafted procurement quotation.

Design: templates are the source of truth (config-driven). Sizing produces
*seed* values that reproduce the 5 MW study book; every seeded value stays
editable until the build is locked.
"""
import math
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from permissions.constants import ROLE_PROJECT_MANAGER
from permissions.utils import get_user_role, is_admin_like

from . import constants as C
from .models import (
    BoqTemplate,
    ComponentSpecSet,
    ProjectBoqItem,
    ProjectBuild,
    ProjectSizing,
    ProjectStage,
    ProjectWorkPackage,
    WbsTemplate,
)


class EngineError(Exception):
    """Recoverable engine failure surfaced to callers as a 400."""


def _d(value):
    return Decimal(str(value))


# --- Permissions ----------------------------------------------------------
def can_lock_build(user):
    """Super admin / admin (covered by is_admin_like) or project manager."""
    if is_admin_like(user):
        return True
    return get_user_role(user) == ROLE_PROJECT_MANAGER


# --- Sizing calculator ----------------------------------------------------
def compute_sizing(ac_mw, spec):
    """Reproduce the study book from AC capacity + component specs.

    5 MW defaults → 40 inverters, 420 strings, 10,920 modules, 6.006 MWp,
    2 transformers, 4 ACDB.
    """
    ac_mw = _d(ac_mw)
    if ac_mw <= 0:
        raise EngineError('AC capacity must be greater than zero.')

    module_wp = _d(spec.module_wp)
    per_string = int(spec.modules_per_string)
    inverter_kw = _d(spec.inverter_kw)
    transformer_mva = _d(spec.transformer_mva)
    per_acdb = max(int(spec.inverters_per_acdb), 1)
    ratio = _d(spec.target_dc_ac_ratio)

    inverter_count = math.ceil(ac_mw * 1000 / inverter_kw)

    dc_target_mwp = ac_mw * ratio
    modules_needed = math.ceil(dc_target_mwp * 1_000_000 / module_wp)
    string_count = int(Decimal(modules_needed / per_string).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if per_string else 0
    string_count = max(string_count, 1)
    module_count = string_count * per_string

    dc_capacity_mwp = (_d(module_count) * module_wp) / _d(1_000_000)
    dc_ac_ratio = dc_capacity_mwp / ac_mw
    transformer_count = math.ceil(ac_mw / transformer_mva) if transformer_mva > 0 else 0
    acdb_count = math.ceil(inverter_count / per_acdb)

    return {
        'dc_capacity_mwp': dc_capacity_mwp.quantize(Decimal('0.0001')),
        'module_count': module_count,
        'string_count': string_count,
        'inverter_count': inverter_count,
        'transformer_count': transformer_count,
        'acdb_count': acdb_count,
        'dc_ac_ratio': dc_ac_ratio.quantize(Decimal('0.001')),
    }


def _basis_value(basis, ac_mw, sizing):
    return {
        C.BASIS_FIXED: Decimal('1'),
        C.BASIS_PER_MW_AC: _d(ac_mw),
        C.BASIS_PER_MWP_DC: _d(sizing['dc_capacity_mwp']),
        C.BASIS_PER_STRING: _d(sizing['string_count']),
        C.BASIS_PER_INVERTER: _d(sizing['inverter_count']),
        C.BASIS_PER_TRANSFORMER: _d(sizing['transformer_count']),
        C.BASIS_PER_ACDB: _d(sizing['acdb_count']),
        C.BASIS_PER_MODULE: _d(sizing['module_count']),
    }.get(basis, Decimal('1'))


# --- Default template resolution -----------------------------------------
def _default_spec_set():
    spec = ComponentSpecSet.objects.filter(is_default=True, is_active=True).first()
    if not spec:
        raise EngineError('No default component spec set. Run seed_solar_templates.')
    return spec


def _default_wbs_template(project_type):
    tpl = WbsTemplate.objects.filter(project_type=project_type, is_active=True).order_by('-is_default', 'id').first()
    if not tpl:
        raise EngineError(f'No active WBS template for {project_type}. Run seed_solar_templates.')
    return tpl


def _default_boq_template(project_type):
    tpl = BoqTemplate.objects.filter(project_type=project_type, is_active=True).order_by('-is_default', 'id').first()
    if not tpl:
        raise EngineError(f'No active BOQ template for {project_type}. Run seed_solar_templates.')
    return tpl


# --- Instantiation --------------------------------------------------------
SITE_CLEARED = 'cleared'

# Standard per-site assessment checklist (land/location compliance).
DEFAULT_SITE_ASSESSMENTS = [
    'Topographical / land survey',
    'Soil resistivity test',
    'Land title / ownership verification',
    'Shadow analysis & row spacing',
    'Access road & logistics feasibility',
]

# Standard solar-EPC statutory NOC / certificate checklist. Applied per site
# (or project-wide). Each is a mandatory StatutoryApproval that must reach
# Approved (or Waived) before development can start.
DEFAULT_NOC_CHECKLIST = [
    ('DISCOM', 'Feasibility / connectivity approval'),
    ('DISCOM', 'Feeder / evacuation approval'),
    ('CEIG / Electrical Inspectorate', 'Drawing approval'),
    ('Chief Electrical Inspector (CEIG)', 'Energisation / charging permission'),
    ('State Pollution Control Board', 'Consent to Establish (CTE)'),
    ('Fire Department', 'Fire NOC'),
    ('Revenue / Land Authority', 'Land use / conversion clearance'),
]


def recalc_project_mw(project):
    """Roll the project's total MW up from the sum of its sites' capacities."""
    from django.db.models import Sum
    from .models import ProjectSite
    agg = ProjectSite.objects.filter(project=project).aggregate(s=Sum('capacity_mw'))
    total = agg['s'] or Decimal('0')
    if project.total_mw != total:
        project.total_mw = total
        project.save(update_fields=['total_mw'])
    return total


def apply_default_site_assessments(site):
    """Ensure a site has the standard mandatory assessment checklist."""
    from .models import SiteAssessmentItem
    created = 0
    for name in DEFAULT_SITE_ASSESSMENTS:
        if not SiteAssessmentItem.objects.filter(site=site, name=name).exists():
            SiteAssessmentItem.objects.create(site=site, name=name, is_mandatory=True)
            created += 1
    return created


def apply_default_noc_checklist(project, site=None):
    """Ensure the standard mandatory NOC checklist exists for a site (or the
    project when site is None). Returns the number created."""
    from .models import StatutoryApproval
    created = 0
    for authority, approval_type in DEFAULT_NOC_CHECKLIST:
        if not StatutoryApproval.objects.filter(
                project=project, site=site, authority=authority, approval_type=approval_type).exists():
            StatutoryApproval.objects.create(
                project=project, site=site, authority=authority, approval_type=approval_type,
                is_mandatory=True, status=StatutoryApproval.STATUS_PENDING,
                remark='Auto-added from the standard NOC checklist.')
            created += 1
    return created


def maybe_autoclear_site(site):
    """Flip a site to 'cleared' once all its mandatory assessments and
    mandatory NOCs are satisfied; otherwise mark it 'in_assessment' while work
    is in progress. Never overrides an explicit 'on_hold'."""
    from .models import ProjectSite, StatutoryApproval
    if site.status == ProjectSite.STATUS_ON_HOLD:
        return site
    assess_ok = not site.assessments.filter(is_mandatory=True).exclude(
        status__in=list(site.assessments.model.SATISFIED_STATUSES)).exists()
    noc_ok = not site.statutory_approvals.filter(is_mandatory=True).exclude(
        status__in=list(StatutoryApproval.SATISFIED_STATUSES)).exists()
    has_any = site.assessments.exists() or site.statutory_approvals.exists()
    new_status = site.status
    if assess_ok and noc_ok and has_any:
        new_status = ProjectSite.STATUS_CLEARED
    elif has_any:
        new_status = ProjectSite.STATUS_IN_ASSESSMENT
    if new_status != site.status:
        site.status = new_status
        site.save(update_fields=['status', 'updated_at'])
    return site


def site_blockers(project):
    """Per-site reasons the project is not development-ready. A project with no
    registered site is blocked; each non-cleared site lists its pending
    mandatory assessment items."""
    from .models import ProjectSite
    sites = list(ProjectSite.objects.filter(project=project))
    # No locations recorded yet → nothing to gate on here (project-level NOCs
    # may still gate). Once a site exists, it must be cleared.
    reasons = []
    for s in sites:
        if s.is_cleared:
            continue
        pending = list(s.assessments.filter(is_mandatory=True).exclude(
            status__in=list(s.assessments.model.SATISFIED_STATUSES)).values_list('name', flat=True))
        label = f'{s.site_name} ({s.capacity_mw} MW)'
        detail = f" — pending: {', '.join(pending)}" if pending else ''
        reasons.append(f'{label} [{s.get_status_display()}]{detail}')
    return reasons


def noc_blockers(project):
    """Every mandatory StatutoryApproval (project-wide or per-site) not yet
    Approved/Waived, labelled with its site/location where applicable."""
    from .models import StatutoryApproval
    rows = (StatutoryApproval.objects.filter(project=project, is_mandatory=True)
            .select_related('site'))
    reasons = []
    for a in rows:
        if a.status not in StatutoryApproval.SATISFIED_STATUSES:
            where = f'{a.site.site_name} · ' if a.site_id else ''
            reasons.append(f'{where}{a.authority} · {a.approval_type} [{a.get_status_display()}]')
    return reasons


# Back-compat alias — older callers used this name.
def site_assessment_blockers(project):
    return site_blockers(project)


def project_readiness(project):
    """Combined development-gate readiness for a project.

    Returns {'locked', 'reasons', 'sites', 'nocs'}. Development (the
    work-structure build) is allowed only when every site is cleared AND every
    mandatory certificate / NOC (project-wide or per-site) is Approved/Waived.
    """
    sites = site_blockers(project)
    nocs = noc_blockers(project)
    reasons = [f'Site: {s}' for s in sites] + [f'Pending NOC: {n}' for n in nocs]
    return {
        'locked': bool(sites or nocs),
        'reasons': reasons,
        'sites': sites,
        'nocs': nocs,
    }


@transaction.atomic
def instantiate_build(project, project_type, ac_mw, spec_set=None,
                      foundation_type='', wbs_template=None, boq_template=None, user=None):
    """Create a ProjectBuild for `project`: sizing + WBS stages/packages +
    seeded BOQ. One non-cancelled build per project."""
    if project_type not in dict(C.PROJECT_TYPE_CHOICES):
        raise EngineError('Invalid project type.')
    if ProjectBuild.objects.filter(project=project).exists():
        raise EngineError('This project already has a work-structure build.')

    # Development gate: the project must be "ready" — every site cleared AND
    # every mandatory certificate / NOC (DMS) approved — before the
    # work-structure build can start.
    readiness = project_readiness(project)
    if readiness['locked']:
        raise EngineError(
            'Development is blocked until the project is cleared. '
            + ' | '.join(readiness['reasons']))

    spec_set = spec_set or _default_spec_set()
    wbs_template = wbs_template or _default_wbs_template(project_type)
    boq_template = boq_template or _default_boq_template(project_type)
    if project_type == C.PROJECT_TYPE_GROUND and not foundation_type:
        foundation_type = C.FOUNDATION_PILE

    build = ProjectBuild.objects.create(
        project=project,
        project_type=project_type,
        ac_capacity_mw=_d(ac_mw),
        foundation_type=foundation_type if project_type == C.PROJECT_TYPE_GROUND else '',
        spec_set=spec_set,
        wbs_template=wbs_template,
        boq_template=boq_template,
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )

    sizing = compute_sizing(ac_mw, spec_set)
    ProjectSizing.objects.create(build=build, **sizing)

    # Copy WBS stages + work packages
    for stage in wbs_template.stages.all().prefetch_related('work_packages'):
        p_stage = ProjectStage.objects.create(
            build=build, order=stage.order, code=stage.code, name=stage.name,
            description=stage.description, is_parallel=stage.is_parallel, source_stage=stage,
        )
        ProjectWorkPackage.objects.bulk_create([
            ProjectWorkPackage(
                stage=p_stage, order=wp.order, name=wp.name, discipline=wp.discipline,
                allocation=None, notes=wp.notes, source_wp=wp,
            )
            for wp in stage.work_packages.all()
        ])

    # Seed BOQ from template, quantities scaled by basis
    boq_rows = []
    for section in boq_template.sections.all().prefetch_related('items'):
        for item in section.items.all():
            qty = (item.quantity_factor * _basis_value(item.quantity_basis, ac_mw, sizing))
            qty = qty.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            boq_rows.append(ProjectBoqItem(
                build=build, section_name=section.name, section_order=section.order,
                order=item.order, description=item.description, specification=item.specification,
                unit=item.unit, quantity=qty, material_rate=item.default_material_rate,
                labour_rate=item.default_labour_rate, is_material=section.is_material,
                source_item=item,
            ))
    ProjectBoqItem.objects.bulk_create(boq_rows)
    return build


# --- Auto-drafted procurement quotation -----------------------------------
@transaction.atomic
def generate_quotation_from_boq(build, user=None):
    """Draft a purchase_orders.Quotation from the build's material BOQ lines."""
    from purchase_orders.models import Quotation, QuotationItem

    if build.generated_quotation_id:
        return build.generated_quotation

    project = build.project
    quotation = Quotation.objects.create(
        client_name=getattr(project, 'client_name', '') or '',
        sender_name='',
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )

    items = []
    for boq in build.boq_items.filter(is_material=True):
        qty = int((boq.quantity or Decimal('0')).to_integral_value(rounding=ROUND_HALF_UP))
        if qty <= 0:
            continue
        items.append(QuotationItem(
            quotation=quotation,
            material_name=boq.description[:255],
            unit=boq.unit or 'Nos',
            quantity=qty,
        ))
    QuotationItem.objects.bulk_create(items)

    build.generated_quotation = quotation
    build.save(update_fields=['generated_quotation', 'updated_at'])
    return quotation


@transaction.atomic
def lock_build(build, user):
    """Lock a draft build (freezes structure) and auto-draft the procurement
    quotation. Restricted to super admin / admin / project manager."""
    if not can_lock_build(user):
        raise PermissionDenied('Only an admin or project manager can lock a build.')
    if build.status != C.BUILD_DRAFT:
        raise EngineError('Only a draft build can be locked.')

    build.status = C.BUILD_LOCKED
    build.locked_by = user if getattr(user, 'is_authenticated', False) else None
    build.locked_at = timezone.now()
    build.save(update_fields=['status', 'locked_by', 'locked_at', 'updated_at'])

    quotation = generate_quotation_from_boq(build, user=user)
    return build, quotation


@transaction.atomic
def unlock_build(build, user):
    """Re-open a locked build for editing (back to draft). Restricted to
    super admin / admin / project manager. The already-drafted quotation is
    left intact."""
    if not can_lock_build(user):
        raise PermissionDenied('Only an admin or project manager can unlock a build.')
    if build.status == C.BUILD_DRAFT:
        return build
    build.status = C.BUILD_DRAFT
    build.locked_by = None
    build.locked_at = None
    build.save(update_fields=['status', 'locked_by', 'locked_at', 'updated_at'])
    return build
