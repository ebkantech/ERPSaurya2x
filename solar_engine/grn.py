"""Goods Receipt Note (GRN) — services. Inbound client-furnished material."""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from .services import EngineError
from .models import GoodsReceiptNote, GoodsReceiptLine


def _dec(v, field='quantity'):
    try:
        d = Decimal(str(v if v not in (None, '') else '0'))
    except (InvalidOperation, TypeError, ValueError):
        raise EngineError(f'Invalid {field}: {v!r}')
    if d < 0:
        raise EngineError(f'{field} cannot be negative.')
    return d


def _next_grn_no():
    year = timezone.now().year
    stem = f'GRN-{year}-'
    last = GoodsReceiptNote.objects.filter(grn_no__startswith=stem).aggregate(m=Max('grn_no'))['m']
    seq = 1
    if last:
        try:
            seq = int(last.rsplit('-', 1)[1]) + 1
        except (ValueError, IndexError):
            seq = GoodsReceiptNote.objects.filter(grn_no__startswith=stem).count() + 1
    return f'{stem}{seq:04d}'


@transaction.atomic
def create_grn(project, lines, site=None, supplier='', consignment_ref='',
               received_date=None, note='', user=None, received_by_name=''):
    """Record a goods receipt for client-furnished material. ``lines`` is a
    list of dicts: {material_name, material_code?, unit?, quantity_received,
    condition?, serial_numbers?, note?}."""
    if not lines:
        raise EngineError('A GRN needs at least one line.')
    grn = GoodsReceiptNote.objects.create(
        grn_no=_next_grn_no(), project=project, site=site,
        supplier=supplier or '', consignment_ref=consignment_ref or '',
        received_date=received_date or timezone.now().date(),
        received_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
        received_by_name=received_by_name or '', note=note or '',
    )
    for ln in lines:
        name = (ln.get('material_name') or '').strip()
        if not name:
            raise EngineError('Each GRN line needs a material name.')
        GoodsReceiptLine.objects.create(
            grn=grn, material_code=(ln.get('material_code') or '')[:60],
            material_name=name[:200], unit=(ln.get('unit') or 'Nos')[:40],
            quantity_received=_dec(ln.get('quantity_received'), 'quantity received'),
            condition=ln.get('condition') or GoodsReceiptLine.CONDITION_OK,
            serial_numbers=ln.get('serial_numbers') or '',
            note=(ln.get('note') or '')[:255],
        )
    return grn


def received_stock(project):
    """Per-material received quantity (from verified/received GRNs) — the
    available pool that free-issue MIS draws from."""
    lines = GoodsReceiptLine.objects.filter(
        grn__project=project,
        grn__status__in=[GoodsReceiptNote.STATUS_RECEIVED, GoodsReceiptNote.STATUS_VERIFIED],
        condition=GoodsReceiptLine.CONDITION_OK,
    )
    pool = {}
    for l in lines:
        key = l.material_name
        pool[key] = pool.get(key, Decimal('0')) + (l.quantity_received or Decimal('0'))
    return pool


def serialize(grn):
    return {
        'id': grn.id, 'grn_no': grn.grn_no, 'project_id': grn.project_id,
        'site_id': grn.site_id, 'site': grn.site.site_name if grn.site_id else '',
        'supplier': grn.supplier, 'consignment_ref': grn.consignment_ref,
        'received_date': grn.received_date.isoformat() if grn.received_date else '',
        'status': grn.status, 'status_display': grn.get_status_display(),
        'received_by': grn.received_by_name or (grn.received_by.get_username() if grn.received_by_id else ''),
        'note': grn.note, 'created_at': grn.created_at.isoformat(),
        'line_count': grn.lines.count(),
        'serial_total': sum(l.serial_count for l in grn.lines.all()),
        'lines': [{
            'id': l.id, 'material_code': l.material_code, 'material_name': l.material_name,
            'unit': l.unit, 'quantity_received': str(l.quantity_received),
            'condition': l.condition, 'condition_display': l.get_condition_display(),
            'serial_numbers': l.serial_numbers, 'serial_count': l.serial_count, 'note': l.note,
        } for l in grn.lines.all()],
    }
