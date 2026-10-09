"""Goods Receipt Note (GRN) API — ERP-session authenticated."""
import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from core.models import ProjectMaster
from permissions.utils import require_authenticated

from . import grn as _grn
from .services import EngineError
from .models import GoodsReceiptNote, ProjectSite


def _auth(request):
    return require_authenticated(request)


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


def project_grn_view(request, project_id):
    """GET  → the project's goods receipts + received-stock pool.
    POST → create a GRN {site_id?, supplier?, consignment_ref?, received_date?,
           note?, lines:[{material_name, quantity_received, unit?, condition?,
           serial_numbers?}]}.
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'GET':
        grns = project.goods_receipts.prefetch_related('lines')
        pool = _grn.received_stock(project)
        return JsonResponse({
            'grns': [_grn.serialize(g) for g in grns],
            'received_stock': [{'material_name': k, 'quantity': str(v)} for k, v in sorted(pool.items())],
        })

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    site = None
    if data.get('site_id'):
        site = ProjectSite.objects.filter(pk=data['site_id'], project=project).first()
    try:
        grn = _grn.create_grn(
            project, data.get('lines') or [], site=site,
            supplier=data.get('supplier') or '', consignment_ref=data.get('consignment_ref') or '',
            received_date=data.get('received_date') or None, note=data.get('note') or '',
            user=getattr(request, 'user', None), received_by_name=data.get('received_by_name') or '',
        )
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': f'{grn.grn_no} recorded.', 'grn': _grn.serialize(grn)}, status=201)


def grn_detail_view(request, grn_id):
    """GET → one GRN. POST {status} → set status (received/verified/rejected)."""
    redirect = _auth(request)
    if redirect:
        return redirect
    grn = get_object_or_404(GoodsReceiptNote, pk=grn_id)
    if request.method == 'GET':
        return JsonResponse(_grn.serialize(grn))
    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)
    data = _body(request)
    if 'status' in data:
        if data['status'] not in dict(GoodsReceiptNote.STATUS_CHOICES):
            return JsonResponse({'error': 'Invalid status.'}, status=400)
        grn.status = data['status']
        grn.save(update_fields=['status'])
    return JsonResponse({'message': 'GRN updated.', 'grn': _grn.serialize(grn)})
