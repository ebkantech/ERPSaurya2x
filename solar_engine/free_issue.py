"""Free-issue material engagement — services and BOM validation.

When a work package's ``engagement_type`` is ``free_issue`` the company owns
material procurement and *issues* material to the vendor, who is responsible
for labour, machinery and installation only. Material moves to the vendor in
two validated steps:

    1. Material Requisition (task-linked)  — the vendor/site requests material
       against the work package. Requested quantities are checked against the
       remaining BOM balance.
    2. Material Issue Slip / MIS           — the store issues material against
       (optionally) a requisition. Cumulative issued quantity for a material
       may never exceed the work package's bill-of-material quantity.

Both steps are validated against :class:`WorkPackageBom`, the bill of material
for the work package (seeded from the build's BOQ material rows, or entered by
the PM).
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from . import constants as C
from .services import EngineError
from .models import (
    ProjectWorkPackage,
    ProjectBoqItem,
    WorkPackageBom,
    MaterialRequisition,
    MaterialRequisitionLine,
    MaterialIssueSlip,
    MaterialIssueSlipLine,
    QualityInspection,
    QualityCheckpoint,
    PunchItem,
)


def material_window_state(work_package):
    """Return (is_open: bool, reason: str) for a free-issue work package's
    material request / MIS window.

    The window opens only when BOTH gates pass:
      1. PROGRESS  — the labour/installation work is complete
                     (work package status == 'completed').
      2. QA / QC   — the mandatory QA checklist is approved: a passed
                     QualityInspection exists, none of its checkpoints read
                     'fail', and no OPEN critical PunchItem remains.

    This is the single source of truth for the vendor's self-service MIS lock
    (field portal). The company store's direct issue is not gated by it.
    """
    wp = work_package
    if not wp.is_free_issue:
        return False, 'Work package is not on free-issue material.'

    # 1. progress gate
    if wp.status != C.STATUS_COMPLETED:
        return False, 'Locked: complete the labour work (mark this package Completed) to unlock the material issue (MIS) request.'

    # 2. QA/QC gate
    inspections = wp.inspections.all()
    if not inspections.exists():
        return False, 'Locked: no QA/QC inspection has been recorded for this package yet.'
    passed = inspections.filter(status=QualityInspection.STATUS_PASSED)
    if not passed.exists():
        return False, 'Locked: the QA/QC inspection for this package is not yet passed.'
    latest = passed.order_by('-inspection_date', '-id').first()
    failed_cp = latest.checkpoints.filter(result=QualityCheckpoint.RESULT_FAIL)
    if failed_cp.exists():
        bad = ', '.join(cp.parameter for cp in failed_cp[:3])
        return False, f'Locked: QA checkpoints not cleared ({bad}).'
    open_critical = wp.punch_items.filter(status=PunchItem.STATUS_OPEN, severity=PunchItem.SEV_CRITICAL)
    if open_critical.exists():
        return False, 'Locked: open critical punch items must be closed before material can be drawn.'

    return True, ''


def _dec(value, field='quantity'):
    try:
        d = Decimal(str(value if value not in (None, '') else '0'))
    except (InvalidOperation, TypeError, ValueError):
        raise EngineError(f'Invalid {field}: {value!r}')
    if d < 0:
        raise EngineError(f'{field} cannot be negative.')
    return d


def require_free_issue(work_package):
    """Guard: the given work package must be engaged on free-issue material."""
    if not work_package.is_free_issue:
        raise EngineError(
            f'Work package "{work_package.name}" is not on free-issue material '
            f'(engagement: {work_package.get_engagement_type_display()}). '
            f'Material requisitions and issue slips apply to free-issue work only.'
        )


# -------------------------------------------------------------------------
# Bill of material
# -------------------------------------------------------------------------
def seed_bom_from_boq(work_package, section_name=None, replace=False):
    """Seed the work package's BOM from the build's BOQ material rows.

    Only material rows (``is_material=True``) are copied. When ``section_name``
    is given, only that BOQ section is used; otherwise every material row on the
    build is copied. Existing BOM lines are kept unless ``replace`` is True.
    Returns the list of created ``WorkPackageBom`` rows.
    """
    build = work_package.stage.build
    if replace:
        work_package.bom_lines.all().delete()
    elif work_package.bom_lines.exists():
        return list(work_package.bom_lines.all())

    qs = build.boq_items.filter(is_material=True)
    if section_name:
        qs = qs.filter(section_name=section_name)

    created = []
    for i, item in enumerate(qs.order_by('section_order', 'order', 'id')):
        created.append(WorkPackageBom.objects.create(
            work_package=work_package,
            order=i,
            material_name=item.description,
            specification=item.specification,
            unit=item.unit,
            bom_quantity=item.quantity or Decimal('0'),
            rate=item.material_rate or Decimal('0'),
            source_boq_item=item,
        ))
    return created


def bom_balance(work_package):
    """Return the BOM with running balances for the work package."""
    lines = []
    for b in work_package.bom_lines.all():
        issued = b.issued_quantity
        requested = b.requested_quantity
        bom_qty = b.bom_quantity or Decimal('0')
        lines.append({
            'id': b.id,
            'material_code': b.material_code,
            'material_name': b.material_name,
            'unit': b.unit,
            'bom_quantity': bom_qty,
            'requested_quantity': requested,
            'issued_quantity': issued,
            'available_quantity': bom_qty - issued,
            'rate': b.rate,
        })
    return lines


# -------------------------------------------------------------------------
# Numbering
# -------------------------------------------------------------------------
def _next_no(model, field, prefix):
    year = timezone.now().year
    stem = f'{prefix}-{year}-'
    last = (model.objects.filter(**{f'{field}__startswith': stem})
            .aggregate(m=Max(field))['m'])
    seq = 1
    if last:
        try:
            seq = int(last.rsplit('-', 1)[1]) + 1
        except (ValueError, IndexError):
            seq = model.objects.filter(**{f'{field}__startswith': stem}).count() + 1
    return f'{stem}{seq:04d}'


# -------------------------------------------------------------------------
# Requisition
# -------------------------------------------------------------------------
@transaction.atomic
def create_requisition(work_package, lines, vendor=None, needed_by=None,
                       note='', user=None, raised_by_name=''):
    """Create a task-linked material requisition against a free-issue work
    package. ``lines`` is a list of dicts: ``{bom_line, quantity}`` (bom_line
    may be an id or a WorkPackageBom). Each requested quantity is validated
    against the BOM's remaining available balance.
    """
    require_free_issue(work_package)
    if not lines:
        raise EngineError('A requisition needs at least one line.')

    vendor = vendor or work_package.assigned_vendor

    req = MaterialRequisition(
        requisition_no=_next_no(MaterialRequisition, 'requisition_no', 'REQ'),
        work_package=work_package,
        vendor=vendor,
        needed_by=needed_by or None,
        note=note or '',
        raised_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
        raised_by_name=raised_by_name or '',
    )
    req.save()

    for ln in lines:
        bom = ln.get('bom_line')
        if not isinstance(bom, WorkPackageBom):
            bom = WorkPackageBom.objects.filter(
                pk=bom, work_package=work_package).first()
        if bom is None:
            raise EngineError('Requisition line must reference a BOM line of this work package.')
        qty = _dec(ln.get('quantity'), 'requested quantity')
        if qty <= 0:
            raise EngineError(f'{bom.material_name}: requested quantity must be greater than zero.')
        available = bom.available_quantity
        if qty > available:
            raise EngineError(
                f'{bom.material_name}: requested {qty} {bom.unit} exceeds the '
                f'BOM balance of {available} {bom.unit} '
                f'(BOM {bom.bom_quantity}, already issued {bom.issued_quantity}).'
            )
        MaterialRequisitionLine.objects.create(
            requisition=req,
            bom_line=bom,
            material_code=bom.material_code,
            material_name=bom.material_name,
            unit=bom.unit,
            quantity_requested=qty,
        )
    return req


# -------------------------------------------------------------------------
# Material Issue Slip (MIS)
# -------------------------------------------------------------------------
@transaction.atomic
def issue_material(work_package, lines, requisition=None, vendor=None,
                   issued_on=None, note='', user=None, issued_by_name=''):
    """Issue free-issue material to the vendor and record an MIS. ``lines`` is
    a list of dicts ``{bom_line, quantity}``. BOM validation: the cumulative
    issued quantity for a material (across all MIS of the work package) may
    never exceed its BOM quantity.
    """
    require_free_issue(work_package)
    if not lines:
        raise EngineError('An issue slip needs at least one line.')

    if requisition is not None and not isinstance(requisition, MaterialRequisition):
        requisition = MaterialRequisition.objects.filter(
            pk=requisition, work_package=work_package).first()
        if requisition is None:
            raise EngineError('Issue slip references a requisition that is not on this work package.')

    vendor = vendor or (requisition.vendor if requisition else None) or work_package.assigned_vendor

    mis = MaterialIssueSlip(
        mis_no=_next_no(MaterialIssueSlip, 'mis_no', 'MIS'),
        work_package=work_package,
        requisition=requisition,
        vendor=vendor,
        issued_on=issued_on or timezone.now().date(),
        note=note or '',
        issued_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
        issued_by_name=issued_by_name or '',
    )
    mis.save()

    for ln in lines:
        bom = ln.get('bom_line')
        if not isinstance(bom, WorkPackageBom):
            bom = WorkPackageBom.objects.filter(
                pk=bom, work_package=work_package).first()
        if bom is None:
            raise EngineError('Issue line must reference a BOM line of this work package.')
        qty = _dec(ln.get('quantity'), 'issue quantity')
        if qty <= 0:
            raise EngineError(f'{bom.material_name}: issue quantity must be greater than zero.')
        # BOM validation — cumulative issued may not exceed BOM quantity.
        available = bom.available_quantity
        if qty > available:
            raise EngineError(
                f'{bom.material_name}: issuing {qty} {bom.unit} would exceed the '
                f'bill of material. BOM {bom.bom_quantity} {bom.unit}, already '
                f'issued {bom.issued_quantity} {bom.unit}, {available} {bom.unit} left.'
            )
        MaterialIssueSlipLine.objects.create(
            issue_slip=mis,
            bom_line=bom,
            material_code=bom.material_code,
            material_name=bom.material_name,
            unit=bom.unit,
            quantity_issued=qty,
        )

    if requisition is not None:
        requisition.status = MaterialRequisition.STATUS_ISSUED
        requisition.save(update_fields=['status', 'updated_at'])
    return mis


def work_package_summary(work_package):
    """A compact free-issue summary for a work package, for API responses."""
    bom = bom_balance(work_package)
    total_bom = sum((b['bom_quantity'] for b in bom), Decimal('0'))
    total_issued = sum((b['issued_quantity'] for b in bom), Decimal('0'))
    return {
        'work_package_id': work_package.id,
        'work_package': work_package.name,
        'engagement_type': work_package.engagement_type,
        'is_free_issue': work_package.is_free_issue,
        'vendor': work_package.assigned_vendor.company_name if work_package.assigned_vendor_id else None,
        'vendor_id': work_package.assigned_vendor_id,
        'bom': bom,
        'bom_line_count': len(bom),
        'requisition_count': work_package.requisitions.count(),
        'issue_slip_count': work_package.issue_slips.count(),
        'fully_issued': total_bom > 0 and total_issued >= total_bom,
    }
