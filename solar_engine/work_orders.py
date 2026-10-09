"""Subcontractor Work Order — services.

A work order binds a vendor (subcontractor) to a labour-only scope of work
packages under a milestone or free-issue engagement. Issuing a work order can
propagate the vendor + engagement onto the linked work packages, so the WBS,
MIS and billing all agree on who executes what and how they are engaged.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .services import EngineError
from .models import (
    ProjectWorkPackage,
    SubcontractWorkOrder,
    SubcontractWorkOrderLine,
)


def _dec(value, field='value'):
    try:
        return Decimal(str(value if value not in (None, '') else '0'))
    except (InvalidOperation, TypeError, ValueError):
        raise EngineError(f'Invalid {field}: {value!r}')


def _next_wo_no():
    year = timezone.now().year
    stem = f'WO-{year}-'
    last = SubcontractWorkOrder.objects.filter(wo_no__startswith=stem).aggregate(m=Max('wo_no'))['m']
    seq = 1
    if last:
        try:
            seq = int(last.rsplit('-', 1)[1]) + 1
        except (ValueError, IndexError):
            seq = SubcontractWorkOrder.objects.filter(wo_no__startswith=stem).count() + 1
    return f'{stem}{seq:04d}'


@transaction.atomic
def create_work_order(project, vendor, title, lines=None, engagement_type=None,
                      rate_basis=SubcontractWorkOrder.RATE_LUMPSUM, rate_per_wp='0',
                      contract_value='0', retention_percent='0', scope_note='',
                      start_date=None, end_date=None, user=None):
    """Create a draft work order for a vendor. ``lines`` is a list of
    ``{work_package_id, line_value?}`` dicts; each work package must belong to
    the project. Returns the SubcontractWorkOrder."""
    if not title or not str(title).strip():
        raise EngineError('Work order title is required.')
    engagement_type = engagement_type or ProjectWorkPackage.ENGAGEMENT_MILESTONE
    if engagement_type not in dict(ProjectWorkPackage.ENGAGEMENT_CHOICES):
        raise EngineError('Invalid engagement type.')
    if rate_basis not in dict(SubcontractWorkOrder.RATE_BASIS_CHOICES):
        raise EngineError('Invalid rate basis.')

    wo = SubcontractWorkOrder.objects.create(
        wo_no=_next_wo_no(), project=project, vendor=vendor,
        engagement_type=engagement_type, title=str(title).strip()[:200],
        scope_note=scope_note or '', contract_value=_dec(contract_value, 'contract value'),
        rate_basis=rate_basis, rate_per_wp=_dec(rate_per_wp, 'rate per Wp'),
        retention_percent=_dec(retention_percent, 'retention percent'),
        start_date=start_date or None, end_date=end_date or None,
        created_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
    )
    for ln in (lines or []):
        add_line(wo, ln.get('work_package_id'), ln.get('line_value'))
    return wo


def add_line(wo, work_package_id, line_value=None):
    wp = ProjectWorkPackage.objects.filter(pk=work_package_id, stage__build__project=wo.project).first()
    if wp is None:
        raise EngineError('Work package not found in this work order’s project.')
    if SubcontractWorkOrderLine.objects.filter(work_order=wo, work_package=wp).exists():
        raise EngineError(f'{wp.name} is already on this work order.')
    return SubcontractWorkOrderLine.objects.create(
        work_order=wo, work_package=wp, line_value=_dec(line_value, 'line value'))


@transaction.atomic
def issue_work_order(wo, propagate=True):
    """Issue a draft work order. When ``propagate`` is set, each linked work
    package adopts the work order's vendor and engagement type, so the WBS /
    MIS / billing agree with the contract."""
    if wo.status not in (SubcontractWorkOrder.STATUS_DRAFT, SubcontractWorkOrder.STATUS_ISSUED):
        raise EngineError(f'A {wo.get_status_display().lower()} work order cannot be issued.')
    if not wo.lines.exists():
        raise EngineError('Add at least one work package before issuing.')
    wo.status = SubcontractWorkOrder.STATUS_ISSUED
    wo.save(update_fields=['status', 'updated_at'])
    if propagate:
        for line in wo.lines.select_related('work_package'):
            wp = line.work_package
            wp.assigned_vendor = wo.vendor
            wp.engagement_type = wo.engagement_type
            wp.save(update_fields=['assigned_vendor', 'engagement_type'])
    return wo


@transaction.atomic
def set_status(wo, status):
    valid = dict(SubcontractWorkOrder.STATUS_CHOICES)
    if status not in valid:
        raise EngineError(f'Invalid status: {status}')
    wo.status = status
    wo.save(update_fields=['status', 'updated_at'])
    return wo


def serialize(wo):
    return {
        'id': wo.id, 'wo_no': wo.wo_no, 'title': wo.title,
        'project_id': wo.project_id,
        'vendor_id': wo.vendor_id,
        'vendor': wo.vendor.company_name if wo.vendor_id else '',
        'engagement_type': wo.engagement_type,
        'engagement_display': wo.get_engagement_type_display(),
        'status': wo.status, 'status_display': wo.get_status_display(),
        'rate_basis': wo.rate_basis, 'rate_basis_display': wo.get_rate_basis_display(),
        'rate_per_wp': str(wo.rate_per_wp),
        'contract_value': str(wo.contract_value),
        'lines_value': str(wo.lines_value),
        'retention_percent': str(wo.retention_percent),
        'start_date': wo.start_date.isoformat() if wo.start_date else '',
        'end_date': wo.end_date.isoformat() if wo.end_date else '',
        'scope_note': wo.scope_note,
        'work_package_count': wo.work_package_count,
        'created_at': wo.created_at.isoformat(),
        'lines': [{
            'id': l.id, 'work_package_id': l.work_package_id,
            'work_package': l.work_package.name,
            'stage': l.work_package.stage.name if l.work_package.stage_id else '',
            'status': l.work_package.status,
            'line_value': str(l.line_value),
        } for l in wo.lines.select_related('work_package', 'work_package__stage')],
    }
