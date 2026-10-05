import json
from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie

from core.models import ProjectMaster
from permissions.utils import require_authenticated

from . import constants as C
from . import services
from .models import ComponentSpecSet, ProjectBoqItem, ProjectBuild, ProjectWorkPackage, WbsTemplate, BoqTemplate
from .serializers import serialize_build, serialize_boq_item, serialize_work_package, serialize_sizing


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


def _auth(request):
    """Return a redirect/None auth gate; all endpoints require login (BP-1/BP-4)."""
    return require_authenticated(request)


@ensure_csrf_cookie
def project_build_view(request, project_id):
    """GET  → the project's build (sizing, WBS, BOQ).
    POST → instantiate a build: {project_type, ac_capacity_mw, spec_set_id?, foundation_type?}.
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'GET':
        build = ProjectBuild.objects.filter(project=project).first()
        if not build:
            return JsonResponse({'build': None}, status=200)
        return JsonResponse({'build': serialize_build(build)})

    if request.method == 'POST':
        data = _body(request)
        project_type = (data.get('project_type') or '').strip()
        try:
            ac_mw = Decimal(str(data.get('ac_capacity_mw') or project.total_mw or '0'))
        except (InvalidOperation, TypeError):
            return JsonResponse({'error': 'Invalid ac_capacity_mw.'}, status=400)

        spec_set = None
        if data.get('spec_set_id'):
            spec_set = ComponentSpecSet.objects.filter(pk=data['spec_set_id'], is_active=True).first()
            if not spec_set:
                return JsonResponse({'error': 'Spec set not found.'}, status=400)

        try:
            build = services.instantiate_build(
                project=project, project_type=project_type, ac_mw=ac_mw,
                spec_set=spec_set, foundation_type=(data.get('foundation_type') or ''),
                user=request.user,
            )
        except services.EngineError as exc:
            return JsonResponse({'error': str(exc)}, status=400)
        return JsonResponse({'message': 'Work structure generated.', 'build': serialize_build(build)}, status=201)

    return JsonResponse({'error': 'GET or POST required'}, status=405)


def build_lock_view(request, build_id):
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    build = get_object_or_404(ProjectBuild, pk=build_id)
    try:
        build, quotation = services.lock_build(build, request.user)
    except PermissionDenied as exc:
        return JsonResponse({'error': str(exc)}, status=403)
    except services.EngineError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    return JsonResponse({
        'message': 'Build locked and procurement quotation drafted.',
        'build': serialize_build(build),
        'quotation_id': quotation.id if quotation else None,
        'quotation_number': quotation.quotation_number if quotation else None,
    })


def sizing_update_view(request, build_id):
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'POST/PATCH required'}, status=405)
    build = get_object_or_404(ProjectBuild, pk=build_id)
    if not build.is_editable:
        return JsonResponse({'error': 'Build is locked and cannot be edited.'}, status=400)
    sizing = build.sizing
    data = _body(request)
    int_fields = ['module_count', 'string_count', 'inverter_count', 'transformer_count', 'acdb_count']
    dec_fields = ['dc_capacity_mwp', 'dc_ac_ratio']
    try:
        for f in int_fields:
            if f in data:
                setattr(sizing, f, int(data[f]))
        for f in dec_fields:
            if f in data:
                setattr(sizing, f, Decimal(str(data[f])))
    except (ValueError, InvalidOperation):
        return JsonResponse({'error': 'Invalid sizing value.'}, status=400)
    sizing.save()
    return JsonResponse({'message': 'Sizing updated.', 'sizing': serialize_sizing(sizing)})


def boq_item_update_view(request, item_id):
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'POST/PATCH required'}, status=405)
    item = get_object_or_404(ProjectBoqItem, pk=item_id)
    if not item.build.is_editable:
        return JsonResponse({'error': 'Build is locked and cannot be edited.'}, status=400)
    data = _body(request)
    try:
        if 'quantity' in data:
            item.quantity = Decimal(str(data['quantity']))
        if 'material_rate' in data:
            item.material_rate = Decimal(str(data['material_rate']))
        if 'labour_rate' in data:
            item.labour_rate = Decimal(str(data['labour_rate']))
    except (InvalidOperation, TypeError):
        return JsonResponse({'error': 'Invalid numeric value.'}, status=400)
    for f in ('description', 'specification', 'unit'):
        if f in data:
            setattr(item, f, str(data[f]))
    item.save()
    return JsonResponse({'message': 'BOQ item updated.', 'item': serialize_boq_item(item)})


def workpackage_update_view(request, wp_id):
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'POST/PATCH required'}, status=405)
    wp = get_object_or_404(ProjectWorkPackage, pk=wp_id)
    data = _body(request)
    if 'status' in data:
        if data['status'] not in dict(C.EXECUTION_STATUS_CHOICES):
            return JsonResponse({'error': 'Invalid status.'}, status=400)
        wp.status = data['status']
    if 'notes' in data:
        wp.notes = str(data['notes'])
    if 'allocation_id' in data:
        wp.allocation_id = data['allocation_id'] or None
    wp.save()
    return JsonResponse({'message': 'Work package updated.', 'work_package': serialize_work_package(wp)})


def templates_list_view(request):
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    mode = (request.GET.get('mode') or '').strip()
    wbs = WbsTemplate.objects.filter(is_active=True)
    boq = BoqTemplate.objects.filter(is_active=True)
    if mode:
        wbs = wbs.filter(project_type=mode)
        boq = boq.filter(project_type=mode)
    return JsonResponse({
        'component_specs': [
            {'id': s.id, 'name': s.name, 'is_default': s.is_default,
             'module_wp': str(s.module_wp), 'modules_per_string': s.modules_per_string,
             'inverter_kw': str(s.inverter_kw), 'transformer_mva': str(s.transformer_mva),
             'target_dc_ac_ratio': str(s.target_dc_ac_ratio)}
            for s in ComponentSpecSet.objects.filter(is_active=True)
        ],
        'wbs_templates': [
            {'id': t.id, 'name': t.name, 'project_type': t.project_type, 'is_default': t.is_default}
            for t in wbs
        ],
        'boq_templates': [
            {'id': t.id, 'name': t.name, 'project_type': t.project_type, 'is_default': t.is_default}
            for t in boq
        ],
        'project_types': [{'value': v, 'label': l} for v, l in C.PROJECT_TYPE_CHOICES],
        'foundation_types': [{'value': v, 'label': l} for v, l in C.FOUNDATION_CHOICES],
    })
