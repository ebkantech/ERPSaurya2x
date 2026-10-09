"""Subcontractor Work Order API — ERP-session authenticated."""
import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from core.models import ProjectMaster, Vendor
from permissions.utils import require_authenticated

from . import work_orders as wo_svc
from .services import EngineError
from .models import SubcontractWorkOrder


def _auth(request):
    return require_authenticated(request)


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


def project_work_orders_view(request, project_id):
    """GET  → the project's subcontractor work orders.
    POST → create a (draft) work order.
           body: {vendor_id, title, engagement_type?, rate_basis?, rate_per_wp?,
                  contract_value?, retention_percent?, scope_note?, start_date?,
                  end_date?, lines:[{work_package_id, line_value?}]}
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'GET':
        wos = SubcontractWorkOrder.objects.filter(project=project).select_related('vendor')
        return JsonResponse({'work_orders': [wo_svc.serialize(w) for w in wos]})

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    vendor = Vendor.objects.filter(pk=data.get('vendor_id') or 0).first()
    if vendor is None:
        return JsonResponse({'error': 'Vendor not found.'}, status=400)
    try:
        wo = wo_svc.create_work_order(
            project, vendor, data.get('title'),
            lines=data.get('lines') or [],
            engagement_type=data.get('engagement_type'),
            rate_basis=data.get('rate_basis') or SubcontractWorkOrder.RATE_LUMPSUM,
            rate_per_wp=data.get('rate_per_wp') or '0',
            contract_value=data.get('contract_value') or '0',
            retention_percent=data.get('retention_percent') or '0',
            scope_note=data.get('scope_note') or '',
            start_date=data.get('start_date') or None,
            end_date=data.get('end_date') or None,
            user=getattr(request, 'user', None),
        )
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': f'Work order {wo.wo_no} created.',
                         'work_order': wo_svc.serialize(wo)}, status=201)


def work_order_detail_view(request, wo_id):
    """GET  → one work order.
    POST → actions: {action:'issue'|'set_status'|'add_line', ...}
           issue      : {propagate?}
           set_status : {status}
           add_line   : {work_package_id, line_value?}
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    wo = get_object_or_404(SubcontractWorkOrder, pk=wo_id)

    if request.method == 'GET':
        return JsonResponse(wo_svc.serialize(wo))

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    action = data.get('action')
    try:
        if action == 'issue':
            wo_svc.issue_work_order(wo, propagate=data.get('propagate', True))
            msg = f'Work order {wo.wo_no} issued.'
        elif action == 'set_status':
            wo_svc.set_status(wo, data.get('status') or '')
            msg = f'Work order {wo.wo_no} is now {wo.get_status_display()}.'
        elif action == 'add_line':
            wo_svc.add_line(wo, data.get('work_package_id'), data.get('line_value'))
            msg = 'Work package added to the work order.'
        else:
            return JsonResponse({'error': 'Unknown action.'}, status=400)
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': msg, 'work_order': wo_svc.serialize(wo)})
