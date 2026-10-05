import json
from decimal import Decimal, InvalidOperation

from django.core.exceptions import PermissionDenied, ValidationError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt

from core.models import ProjectMaster, Vendor
from permissions.utils import require_authenticated

from . import constants as C
from . import services
from .models import ComponentSpecSet, ProjectBoqItem, ProjectBuild, ProjectStage, ProjectWorkPackage, WbsTemplate, BoqTemplate
from .serializers import serialize_build, serialize_boq_item, serialize_stage, serialize_work_package, serialize_sizing

_DATE_FIELDS = ('planned_start', 'planned_end', 'actual_start', 'actual_end')


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
    if 'assigned_vendor_id' in data:
        vid = data['assigned_vendor_id'] or None
        if vid and not Vendor.objects.filter(pk=vid).exists():
            return JsonResponse({'error': 'Vendor not found.'}, status=400)
        wp.assigned_vendor_id = vid
    wp.save()
    return JsonResponse({'message': 'Work package updated.', 'work_package': serialize_work_package(wp)})


def stage_update_view(request, stage_id):
    """Update a stage's execution status and milestone dates
    (planned/actual start & end)."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'POST/PATCH required'}, status=405)
    stage = get_object_or_404(ProjectStage, pk=stage_id)
    data = _body(request)
    if 'status' in data:
        if data['status'] not in dict(C.EXECUTION_STATUS_CHOICES):
            return JsonResponse({'error': 'Invalid status.'}, status=400)
        stage.status = data['status']
    for field in _DATE_FIELDS:
        if field in data:
            value = (data[field] or '').strip() if isinstance(data[field], str) else data[field]
            setattr(stage, field, value or None)
    try:
        stage.save()
    except (ValueError, ValidationError):
        return JsonResponse({'error': 'Invalid date value (use YYYY-MM-DD).'}, status=400)
    return JsonResponse({'message': 'Stage updated.', 'stage': serialize_stage(stage)})


def vendor_options_view(request):
    """Lightweight vendor list for the work-allocation dropdown."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    vendors = Vendor.objects.order_by('company_name').values('id', 'company_name', 'vendor_name', 'vendor_id')
    return JsonResponse({'vendors': [
        {'id': v['id'], 'name': v['company_name'] or v['vendor_name'] or v['vendor_id'], 'vendor_id': v['vendor_id']}
        for v in vendors
    ]})


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


# --- Daily work progress ---------------------------------------------------
from datetime import date as _date  # noqa: E402
from django.conf import settings as _settings  # noqa: E402
from django.contrib.auth.models import User  # noqa: E402
from .models import ProjectSizing  # noqa: E402  (ensure models import side-effect)
from .models import SiteProgressEntry  # noqa: E402
from .serializers import serialize_progress  # noqa: E402


def _coerce_decimal(value, field):
    from decimal import Decimal as _D
    try:
        return _D(str(value)), None
    except Exception:
        return None, JsonResponse({'error': f'Invalid {field}.'}, status=400)


def _create_progress_entry(build, data, request=None, source=SiteProgressEntry.SOURCE_WEB):
    """Shared builder for an entry from a payload (web form or field portal)."""
    site_name = (data.get('site_name') or '').strip()
    if not site_name:
        return None, JsonResponse({'error': 'site_name is required.'}, status=400)

    pdate = (data.get('progress_date') or '').strip() or _date.today().isoformat()
    pct, err = _coerce_decimal(data.get('progress_percent', 0) or 0, 'progress_percent')
    if err:
        return None, err

    entry = SiteProgressEntry(
        build=build, site_name=site_name, progress_date=pdate,
        progress_percent=pct, unit=(data.get('unit') or '').strip(),
        note=(data.get('note') or '').strip(), source=source,
        reporter_name=(data.get('reporter_name') or '').strip(),
    )
    if data.get('status') in dict(C.EXECUTION_STATUS_CHOICES):
        entry.status = data['status']
    if data.get('quantity') not in (None, '', 'null'):
        q, err = _coerce_decimal(data['quantity'], 'quantity')
        if err:
            return None, err
        entry.quantity = q
    if data.get('stage_id'):
        entry.stage = build.stages.filter(pk=data['stage_id']).first()
    if data.get('work_package_id'):
        wp = ProjectWorkPackage.objects.filter(pk=data['work_package_id'], stage__build=build).first()
        entry.work_package = wp
    if data.get('vendor_id'):
        entry.vendor = Vendor.objects.filter(pk=data['vendor_id']).first()
    if request is not None and getattr(request, 'FILES', None) and request.FILES.get('photo'):
        entry.photo = request.FILES['photo']
    if request is not None and getattr(request.user, 'is_authenticated', False):
        entry.reported_by = request.user
    entry.save()
    entry.refresh_from_db()  # normalise field types (e.g. date) for serialization
    return entry, None


def project_progress_view(request, project_id):
    """GET  → daily progress entries for the project (filters: site, vendor, from, to).
    POST → add an entry from the ERP 'Daily Work Progress' tab."""
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)
    build = ProjectBuild.objects.filter(project=project).first()
    if not build:
        return JsonResponse({'error': 'This project has no work structure yet.'}, status=400)

    if request.method == 'GET':
        qs = build.progress_entries.select_related('stage', 'work_package', 'vendor')
        site = (request.GET.get('site') or '').strip()
        vendor = (request.GET.get('vendor_id') or '').strip()
        dfrom = (request.GET.get('from') or '').strip()
        dto = (request.GET.get('to') or '').strip()
        if site:
            qs = qs.filter(site_name__icontains=site)
        if vendor:
            qs = qs.filter(vendor_id=vendor)
        if dfrom:
            qs = qs.filter(progress_date__gte=dfrom)
        if dto:
            qs = qs.filter(progress_date__lte=dto)
        entries = [serialize_progress(e) for e in qs[:500]]
        sites = sorted({e.site_name for e in build.progress_entries.all()})
        return JsonResponse({'entries': entries, 'sites': sites})

    if request.method == 'POST':
        entry, err = _create_progress_entry(build, _body(request), request=request)
        if err:
            return err
        return JsonResponse({'message': 'Progress recorded.', 'entry': serialize_progress(entry)}, status=201)

    return JsonResponse({'error': 'GET or POST required'}, status=405)


@csrf_exempt
def field_ingest_view(request):
    """Token-authenticated ingest for the FieldTracker portal.
    Requires header 'X-Field-Token' (or 'Authorization: Bearer <token>')
    matching settings.FIELD_INGEST_TOKEN. Body: JSON or multipart with
    project_id/project_code + the same fields the web form submits."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    token = getattr(_settings, 'FIELD_INGEST_TOKEN', '') or ''
    if not token:
        return JsonResponse({'error': 'Field ingest is not configured.'}, status=503)
    supplied = request.headers.get('X-Field-Token', '')
    if not supplied:
        auth = request.headers.get('Authorization', '')
        if auth.lower().startswith('bearer '):
            supplied = auth[7:].strip()
    if supplied != token:
        return JsonResponse({'error': 'Invalid field token.'}, status=401)

    data = _body(request)
    project = None
    if data.get('project_id'):
        project = ProjectMaster.objects.filter(pk=data['project_id']).first()
    elif data.get('project_code'):
        project = ProjectMaster.objects.filter(project_code=data['project_code']).first()
    if not project:
        return JsonResponse({'error': 'project_id or project_code is required and must exist.'}, status=400)
    build = ProjectBuild.objects.filter(project=project).first()
    if not build:
        return JsonResponse({'error': 'This project has no work structure yet.'}, status=400)

    entry, err = _create_progress_entry(build, data, request=request, source=SiteProgressEntry.SOURCE_FIELD)
    if err:
        return err
    return JsonResponse({'message': 'Progress ingested.', 'entry': serialize_progress(entry)}, status=201)
