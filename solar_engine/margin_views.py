"""Profitability / margin API — ERP-session authenticated."""
import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from core.models import ProjectMaster
from permissions.utils import require_authenticated

from . import margin as _margin


def _auth(request):
    return require_authenticated(request)


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


def project_margin_view(request, project_id):
    """GET  → the project's margin breakdown.
    POST → set commercial inputs {client_rate_per_wp?, overhead_percent?, note?}
           then return the recomputed margin.
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'POST':
        data = _body(request)
        c = _margin.get_commercials(project)
        if 'client_rate_per_wp' in data:
            c.client_rate_per_wp = data['client_rate_per_wp'] or 0
        if 'overhead_percent' in data:
            c.overhead_percent = data['overhead_percent'] or 0
        if 'note' in data:
            c.note = data['note'] or ''
        c.save()
    elif request.method != 'GET':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    return JsonResponse(_margin.compute_margin(project))
