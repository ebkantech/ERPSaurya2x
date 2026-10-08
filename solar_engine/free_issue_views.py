"""API endpoints for the free-issue material engagement — BOM, task-linked
material requisitions and Material Issue Slips (MIS). All endpoints require an
authenticated ERP session (same gate as the rest of solar_engine)."""
import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from core.models import Vendor
from permissions.utils import require_authenticated

from . import free_issue as fi
from .services import EngineError
from .models import (
    ProjectWorkPackage,
    WorkPackageBom,
    MaterialRequisition,
    MaterialIssueSlip,
)


def _auth(request):
    return require_authenticated(request)


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


# ---- serializers ---------------------------------------------------------
def _ser_requisition(req):
    return {
        'id': req.id,
        'requisition_no': req.requisition_no,
        'work_package_id': req.work_package_id,
        'status': req.status,
        'status_display': req.get_status_display(),
        'vendor_id': req.vendor_id,
        'vendor': req.vendor.company_name if req.vendor_id else None,
        'needed_by': req.needed_by.isoformat() if req.needed_by else None,
        'note': req.note,
        'raised_by': req.raised_by_name or (req.raised_by.get_username() if req.raised_by_id else ''),
        'created_at': req.created_at.isoformat(),
        'lines': [{
            'id': l.id, 'bom_line_id': l.bom_line_id,
            'material_code': l.material_code, 'material_name': l.material_name,
            'unit': l.unit, 'quantity_requested': str(l.quantity_requested),
        } for l in req.lines.all()],
    }


def _ser_mis(mis):
    return {
        'id': mis.id,
        'mis_no': mis.mis_no,
        'work_package_id': mis.work_package_id,
        'requisition_id': mis.requisition_id,
        'requisition_no': mis.requisition.requisition_no if mis.requisition_id else None,
        'status': mis.status,
        'status_display': mis.get_status_display(),
        'vendor_id': mis.vendor_id,
        'vendor': mis.vendor.company_name if mis.vendor_id else None,
        'issued_on': mis.issued_on.isoformat() if mis.issued_on else None,
        'note': mis.note,
        'issued_by': mis.issued_by_name or (mis.issued_by.get_username() if mis.issued_by_id else ''),
        'created_at': mis.created_at.isoformat(),
        'lines': [{
            'id': l.id, 'bom_line_id': l.bom_line_id,
            'material_code': l.material_code, 'material_name': l.material_name,
            'unit': l.unit, 'quantity_issued': str(l.quantity_issued),
        } for l in mis.lines.all()],
    }


def _ser_bom_line(d):
    # bom_balance() returns Decimals — stringify for JSON.
    return {k: (str(v) if hasattr(v, 'quantize') else v) for k, v in d.items()}


# ---- endpoints -----------------------------------------------------------
def work_package_free_issue_view(request, wp_id):
    """GET  → the work package's free-issue summary (BOM + balances, counts).
    POST → seed the BOM from the build's BOQ material rows
           body: {action:'seed_bom', section_name?, replace?}
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    wp = get_object_or_404(ProjectWorkPackage, pk=wp_id)

    if request.method == 'GET':
        summary = fi.work_package_summary(wp)
        summary['bom'] = [_ser_bom_line(b) for b in summary['bom']]
        summary['requisitions'] = [_ser_requisition(r) for r in wp.requisitions.all()]
        summary['issue_slips'] = [_ser_mis(m) for m in wp.issue_slips.all()]
        return JsonResponse(summary)

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    action = data.get('action')
    try:
        if action == 'seed_bom':
            created = fi.seed_bom_from_boq(
                wp, section_name=data.get('section_name') or None,
                replace=bool(data.get('replace')),
            )
            return JsonResponse({'message': f'{len(created)} BOM line(s) ready.',
                                 'bom': [_ser_bom_line(b) for b in fi.bom_balance(wp)]})
        if action == 'add_bom_line':
            fi.require_free_issue(wp)
            WorkPackageBom.objects.create(
                work_package=wp,
                order=wp.bom_lines.count(),
                material_code=(data.get('material_code') or '')[:60],
                material_name=(data.get('material_name') or '').strip()[:200],
                specification=data.get('specification') or '',
                unit=(data.get('unit') or 'Nos')[:40],
                bom_quantity=data.get('bom_quantity') or 0,
                rate=data.get('rate') or 0,
            )
            return JsonResponse({'message': 'BOM line added.',
                                 'bom': [_ser_bom_line(b) for b in fi.bom_balance(wp)]})
        return JsonResponse({'error': 'Unknown action.'}, status=400)
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)


def requisitions_view(request, wp_id):
    """GET  → list requisitions for a work package.
    POST → create a task-linked requisition.
           body: {vendor_id?, needed_by?, note?, lines:[{bom_line_id, quantity}]}
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    wp = get_object_or_404(ProjectWorkPackage, pk=wp_id)

    if request.method == 'GET':
        return JsonResponse({'requisitions': [_ser_requisition(r) for r in wp.requisitions.all()]})

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    vendor = None
    if data.get('vendor_id'):
        vendor = Vendor.objects.filter(pk=data['vendor_id']).first()
        if vendor is None:
            return JsonResponse({'error': 'Vendor not found.'}, status=400)
    lines = [{'bom_line': l.get('bom_line_id'), 'quantity': l.get('quantity')}
             for l in (data.get('lines') or [])]
    try:
        req = fi.create_requisition(
            wp, lines, vendor=vendor, needed_by=data.get('needed_by') or None,
            note=data.get('note') or '', user=getattr(request, 'user', None),
            raised_by_name=data.get('raised_by_name') or '',
        )
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': f'Requisition {req.requisition_no} raised.',
                         'requisition': _ser_requisition(req)}, status=201)


def issue_slips_view(request, wp_id):
    """GET  → list Material Issue Slips for a work package.
    POST → issue material (records an MIS, validated against the BOM).
           body: {requisition_id?, vendor_id?, issued_on?, note?, lines:[{bom_line_id, quantity}]}
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    wp = get_object_or_404(ProjectWorkPackage, pk=wp_id)

    if request.method == 'GET':
        return JsonResponse({'issue_slips': [_ser_mis(m) for m in wp.issue_slips.all()]})

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    vendor = None
    if data.get('vendor_id'):
        vendor = Vendor.objects.filter(pk=data['vendor_id']).first()
        if vendor is None:
            return JsonResponse({'error': 'Vendor not found.'}, status=400)
    lines = [{'bom_line': l.get('bom_line_id'), 'quantity': l.get('quantity')}
             for l in (data.get('lines') or [])]
    try:
        mis = fi.issue_material(
            wp, lines, requisition=data.get('requisition_id') or None, vendor=vendor,
            issued_on=data.get('issued_on') or None, note=data.get('note') or '',
            user=getattr(request, 'user', None), issued_by_name=data.get('issued_by_name') or '',
        )
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': f'Material issued — {mis.mis_no}.',
                         'issue_slip': _ser_mis(mis)}, status=201)
