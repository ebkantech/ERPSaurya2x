"""Vendor / subcontractor portal API (read-only, token-authenticated,
vendor-scoped). The Next.js portal holds the field token server-side, logs the
vendor in by their vendor code, and calls these with ?vendor_id=."""
from decimal import Decimal

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from core.models import Vendor
from . import billing as _billing
from .models import BillingMilestone, ProjectBuild, ProjectWorkPackage, SiteProgressEntry
from .serializers import serialize_milestone


def _check_token(request):
    token = getattr(settings, 'FIELD_INGEST_TOKEN', '') or ''
    if not token:
        return JsonResponse({'error': 'Vendor portal is not configured.'}, status=503)
    supplied = request.headers.get('X-Field-Token', '')
    if not supplied:
        auth = request.headers.get('Authorization', '')
        if auth.lower().startswith('bearer '):
            supplied = auth[7:].strip()
    if supplied != token:
        return JsonResponse({'error': 'Invalid field token.'}, status=401)
    return None


def _vendor(request):
    vid = request.GET.get('vendor_id') or ''
    return Vendor.objects.filter(pk=vid).first() if vid else None


def _vendor_pos(vendor):
    from purchase_orders.models import PurchaseOrder
    return PurchaseOrder.objects.filter(vendor=vendor).order_by('-po_date', '-created_at')


@csrf_exempt
def vendor_auth(request):
    """POST {code} → verify a vendor/subcontractor code and return profile."""
    err = _check_token(request)
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    import json
    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = {}
    code = (body.get('code') or '').strip()
    if not code:
        return JsonResponse({'error': 'Vendor code is required.'}, status=400)
    v = Vendor.objects.filter(vendor_id__iexact=code).first()
    if not v:
        return JsonResponse({'error': 'Invalid vendor code.'}, status=401)
    return JsonResponse({'vendor': _profile(v)})


def _profile(v):
    return {
        'id': v.id, 'vendor_id': v.vendor_id,
        'company_name': v.company_name, 'vendor_name': v.vendor_name,
        'contact_person': v.contact_person, 'mobile_number': v.mobile_number,
        'email_id': v.email_id, 'city': v.city, 'state': v.state,
        'gst_no': v.gst_no, 'status': v.status,
    }


def vendor_profile(request):
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    return JsonResponse({'vendor': _profile(v)})


def vendor_dashboard(request):
    """Headline numbers: work progress, milestone billing, PO + logistics counts."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)

    # work progress across this vendor's work packages (field-reported)
    wp_ids = list(ProjectWorkPackage.objects.filter(assigned_vendor=v).values_list('id', flat=True))
    entries = SiteProgressEntry.objects.filter(work_package_id__in=wp_ids) if wp_ids else SiteProgressEntry.objects.none()
    latest = {}
    for e in entries:
        if e.work_package_id not in latest or (e.progress_percent or 0) > latest[e.work_package_id]:
            latest[e.work_package_id] = float(e.progress_percent or 0)
    avg_progress = round(sum(latest.values()) / len(latest)) if latest else 0

    ms = BillingMilestone.objects.filter(vendor=v)
    summ = _billing.vendor_billing_summary(ms.select_related('vendor'))
    srow = summ[0] if summ else None

    pos = _vendor_pos(v)
    from deliveries.models import Delivery
    deliveries = Delivery.objects.filter(po__vendor=v)
    return JsonResponse({
        'vendor': _profile(v),
        'work_progress_percent': avg_progress,
        'work_packages': len(wp_ids),
        'sites': sorted({e.site_name for e in entries}),
        'billing': srow,
        'po_count': pos.count(),
        'po_value': str(sum((p.total_po_value or Decimal('0')) for p in pos)),
        'outstanding': str(sum((p.outstanding_amount or Decimal('0')) for p in pos)),
        'delivery_count': deliveries.count(),
    })


def vendor_work_scope(request):
    """Work packages assigned to the vendor, with stage, milestones & progress."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    wps = ProjectWorkPackage.objects.filter(assigned_vendor=v).select_related('stage', 'stage__build__project')
    prog = {}
    for e in SiteProgressEntry.objects.filter(work_package__assigned_vendor=v):
        if (e.progress_percent or 0) > prog.get(e.work_package_id, 0):
            prog[e.work_package_id] = float(e.progress_percent or 0)
    rows = [{
        'id': w.id, 'name': w.name, 'stage': w.stage.name if w.stage_id else '',
        'project': getattr(w.stage.build.project, 'project_name', '') if w.stage_id else '',
        'project_code': getattr(w.stage.build.project, 'project_code', '') if w.stage_id else '',
        'status': w.status, 'progress_percent': prog.get(w.id, 0),
        'planned_start': w.stage.planned_start.isoformat() if w.stage_id and w.stage.planned_start else '',
        'planned_end': w.stage.planned_end.isoformat() if w.stage_id and w.stage.planned_end else '',
    } for w in wps]
    return JsonResponse({'work_scope': rows})


def vendor_po_history(request):
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    rows = [{
        'id': p.id, 'po_number': p.po_number,
        'po_date': p.po_date.isoformat() if p.po_date else '',
        'project_site_name': p.project_site_name, 'status': p.status,
        'total_po_value': str(p.total_po_value), 'paid_amount': str(p.paid_amount),
        'outstanding_amount': str(p.outstanding_amount),
        'delivery_status': p.delivery_status_summary, 'payment_status': p.payment_status_summary,
    } for p in _vendor_pos(v)]
    return JsonResponse({'purchase_orders': rows})


def vendor_materials(request):
    """Materials ordered in the vendor's POs, with live delivery status."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    from purchase_orders.models import PurchaseOrderItem
    items = PurchaseOrderItem.objects.filter(po__vendor=v).select_related('po').order_by('-po__po_date')
    rows = [{
        'po_number': it.po.po_number, 'material_name': it.material_name,
        'category': it.material_category, 'unit': it.unit,
        'ordered_quantity': str(it.ordered_quantity), 'delivered_quantity': str(it.delivered_quantity),
        'pending_quantity': str(it.pending_quantity), 'item_status': it.item_status,
        'total_amount': str(it.total_amount),
        'live': it.pending_quantity and float(it.pending_quantity) > 0,
    } for it in items]
    return JsonResponse({'materials': rows})


def vendor_logistics(request):
    """Deliveries + vehicle movements for the vendor's POs (live + history)."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    from deliveries.models import Delivery
    from transport.models import VehicleMovement
    deliveries = Delivery.objects.filter(po__vendor=v).select_related('po').order_by('-delivery_date')
    d_rows = [{
        'po_number': d.po.po_number, 'reference': d.delivery_reference_code,
        'delivery_date': d.delivery_date.isoformat() if d.delivery_date else '',
        'delivered_quantity': str(d.delivered_quantity), 'location': d.delivery_location,
        'status': d.delivery_status, 'received_by': d.site_received_by,
    } for d in deliveries]
    vehicles = VehicleMovement.objects.filter(delivery__po__vendor=v).select_related('delivery', 'delivery__po').order_by('-dispatch_date')
    v_rows = [{
        'po_number': veh.delivery.po.po_number if veh.delivery_id else '',
        'vehicle_number': veh.vehicle_number, 'transporter': veh.transporter_name,
        'driver': veh.driver_name, 'lr_number': veh.lr_number,
        'dispatch_date': veh.dispatch_date.isoformat() if veh.dispatch_date else '',
        'expected_arrival': veh.expected_arrival_date.isoformat() if veh.expected_arrival_date else '',
        'actual_arrival': veh.actual_arrival_date.isoformat() if veh.actual_arrival_date else '',
        'status': veh.vehicle_status, 'gps_link': veh.gps_tracking_link,
        'from': veh.loading_location, 'to': veh.unloading_location,
    } for veh in vehicles]
    return JsonResponse({'deliveries': d_rows, 'vehicles': v_rows})


def vendor_sites(request):
    """Geo-tagged sites where the vendor is scoped (from field progress)."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    sites = {}
    for e in SiteProgressEntry.objects.filter(work_package__assigned_vendor=v).order_by('-progress_date'):
        s = sites.setdefault(e.site_name, {'site_name': e.site_name, 'latitude': None, 'longitude': None,
                                           'last_update': '', 'progress_percent': 0})
        if e.latitude is not None and s['latitude'] is None:
            s['latitude'] = float(e.latitude); s['longitude'] = float(e.longitude) if e.longitude is not None else None
        if not s['last_update']:
            s['last_update'] = e.progress_date.isoformat() if e.progress_date else ''
        s['progress_percent'] = max(s['progress_percent'], float(e.progress_percent or 0))
    return JsonResponse({'sites': list(sites.values())})


def vendor_billing(request):
    """Milestones + billing summary for the logged-in vendor."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    ms = (BillingMilestone.objects.filter(vendor=v)
          .select_related('vendor', 'work_package', 'build__project'))
    rows = []
    for m in ms:
        row = serialize_milestone(m)
        row['project'] = getattr(m.build.project, 'project_name', '')
        row['project_code'] = getattr(m.build.project, 'project_code', '')
        rows.append(row)
    summ = _billing.vendor_billing_summary(ms)
    return JsonResponse({'summary': summ[0] if summ else None, 'milestones': rows})


def vendor_quality(request):
    """QA inspections + punch items for the logged-in vendor's work."""
    err = _check_token(request)
    if err:
        return err
    v = _vendor(request)
    if not v:
        return JsonResponse({'error': 'vendor_id required / not found.'}, status=400)
    from .models import PunchItem, QualityInspection
    from .serializers import serialize_inspection, serialize_punch
    ins = (QualityInspection.objects.filter(vendor=v)
           .select_related('work_package', 'stage').prefetch_related('checkpoints'))
    punch = PunchItem.objects.filter(vendor=v).select_related('work_package')
    return JsonResponse({
        'inspections': [serialize_inspection(i) for i in ins],
        'punch_items': [serialize_punch(p) for p in punch],
        'open_defects': punch.exclude(status__in=['resolved', 'verified', 'closed']).count(),
        'failed_inspections': ins.filter(status='failed').count(),
    })
