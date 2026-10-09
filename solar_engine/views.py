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


def build_unlock_view(request, build_id):
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    build = get_object_or_404(ProjectBuild, pk=build_id)
    try:
        build = services.unlock_build(build, request.user)
    except PermissionDenied as exc:
        return JsonResponse({'error': str(exc)}, status=403)
    return JsonResponse({'message': 'Build unlocked for editing.', 'build': serialize_build(build)})


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
    if request.method not in ('POST', 'PATCH', 'DELETE'):
        return JsonResponse({'error': 'POST/PATCH/DELETE required'}, status=405)
    wp = get_object_or_404(ProjectWorkPackage, pk=wp_id)

    if request.method == 'DELETE':
        if not wp.stage.build.is_editable:
            return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
        wp.delete()
        return JsonResponse({'message': 'Work package removed.'})

    data = _body(request)
    editable = wp.stage.build.is_editable
    # Structural edits (name/discipline/order/move) only while draft.
    if any(k in data for k in ('name', 'discipline', 'order', 'stage_id')) and not editable:
        return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return JsonResponse({'error': 'Work package name cannot be empty.'}, status=400)
        wp.name = name[:200]
    if 'discipline' in data:
        wp.discipline = (data['discipline'] or '').strip()[:80]
    if 'order' in data:
        try:
            wp.order = int(data['order'])
        except (ValueError, TypeError):
            return JsonResponse({'error': 'Invalid order.'}, status=400)
    if 'stage_id' in data and data['stage_id']:
        target = ProjectStage.objects.filter(pk=data['stage_id'], build=wp.stage.build).first()
        if not target:
            return JsonResponse({'error': 'Target stage not found in this build.'}, status=400)
        wp.stage = target
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
    if 'engagement_type' in data:
        et = (data['engagement_type'] or '').strip()
        if et not in dict(ProjectWorkPackage.ENGAGEMENT_CHOICES):
            return JsonResponse({'error': 'Invalid engagement type.'}, status=400)
        wp.engagement_type = et
    wp.save()
    return JsonResponse({'message': 'Work package updated.', 'work_package': serialize_work_package(wp)})


def workpackage_create_view(request, stage_id):
    """Add a work package to a stage (choose from library or custom)."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    stage = get_object_or_404(ProjectStage, pk=stage_id)
    if not stage.build.is_editable:
        return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
    data = _body(request)
    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'Work package name is required.'}, status=400)
    order = stage.work_packages.count() + 1
    wp = ProjectWorkPackage.objects.create(
        stage=stage, name=name[:200], discipline=(data.get('discipline') or '').strip()[:80], order=order,
    )
    return JsonResponse({'message': 'Work package added.', 'work_package': serialize_work_package(wp)}, status=201)


def stage_update_view(request, stage_id):
    """Update a stage: title/code/description/order (draft only), plus
    execution status and milestone dates; DELETE removes the stage."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method not in ('POST', 'PATCH', 'DELETE'):
        return JsonResponse({'error': 'POST/PATCH/DELETE required'}, status=405)
    stage = get_object_or_404(ProjectStage, pk=stage_id)

    if request.method == 'DELETE':
        if not stage.build.is_editable:
            return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
        stage.delete()
        return JsonResponse({'message': 'Stage removed.'})

    data = _body(request)
    editable = stage.build.is_editable
    if any(k in data for k in ('name', 'code', 'description', 'order', 'is_parallel')) and not editable:
        return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return JsonResponse({'error': 'Stage name cannot be empty.'}, status=400)
        stage.name = name[:200]
    if 'code' in data:
        stage.code = (data['code'] or '').strip()[:30]
    if 'description' in data:
        stage.description = str(data['description'])
    if 'is_parallel' in data:
        stage.is_parallel = bool(data['is_parallel'])
    if 'order' in data:
        try:
            stage.order = int(data['order'])
        except (ValueError, TypeError):
            return JsonResponse({'error': 'Invalid order.'}, status=400)
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


def stage_create_view(request, build_id):
    """Add a new stage to a build's work breakdown."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    build = get_object_or_404(ProjectBuild, pk=build_id)
    if not build.is_editable:
        return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
    data = _body(request)
    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'Stage name is required.'}, status=400)
    order = build.stages.count() + 1
    code = (data.get('code') or '').strip()[:30] or f'S{order}'
    stage = ProjectStage.objects.create(
        build=build, name=name[:200], code=code, description=str(data.get('description') or ''),
        is_parallel=bool(data.get('is_parallel')), order=order,
    )
    return JsonResponse({'message': 'Stage added.', 'stage': serialize_stage(stage)}, status=201)


def wbs_reorder_view(request, build_id):
    """Persist new ordering. Body may include:
      {"stages": [id, id, ...]}  -> stage order
      {"stage_id": X, "work_packages": [id, ...]}  -> WP order within a stage
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    build = get_object_or_404(ProjectBuild, pk=build_id)
    if not build.is_editable:
        return JsonResponse({'error': 'Build is locked; work breakdown cannot be edited.'}, status=400)
    data = _body(request)

    stage_ids = data.get('stages')
    if isinstance(stage_ids, list):
        valid = set(build.stages.values_list('id', flat=True))
        for idx, sid in enumerate(stage_ids, 1):
            if sid in valid:
                ProjectStage.objects.filter(pk=sid).update(order=idx)

    wp_ids = data.get('work_packages')
    if isinstance(wp_ids, list) and data.get('stage_id'):
        stage = build.stages.filter(pk=data['stage_id']).first()
        if stage:
            valid = set(ProjectWorkPackage.objects.filter(stage__build=build).values_list('id', flat=True))
            for idx, wid in enumerate(wp_ids, 1):
                if wid in valid:
                    ProjectWorkPackage.objects.filter(pk=wid).update(order=idx)
    return JsonResponse({'message': 'Order updated.'})


def wbs_library_view(request):
    """Catalog of stage names + work-package names drawn from all WBS
    templates, so a PM can pick options when editing a project's breakdown."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    from .models import WbsStage, WbsWorkPackage
    mode = (request.GET.get('mode') or '').strip()
    stage_qs = WbsStage.objects.all()
    wp_qs = WbsWorkPackage.objects.all()
    if mode:
        stage_qs = stage_qs.filter(template__project_type=mode)
        wp_qs = wp_qs.filter(stage__template__project_type=mode)
    stages = sorted({(s.name or '').strip() for s in stage_qs if (s.name or '').strip()})
    packages = sorted({(w.name or '').strip() for w in wp_qs if (w.name or '').strip()})
    return JsonResponse({'stage_names': stages, 'work_package_names': packages})


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
    for _geo in ('latitude', 'longitude'):
        if data.get(_geo) not in (None, '', 'null'):
            try:
                setattr(entry, _geo, data[_geo])
            except Exception:
                pass
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


# --- Milestone billing & compliance ---------------------------------------
from . import billing as _billing  # noqa: E402
from .models import BillingMilestone, HandoverCertificate  # noqa: E402
from .serializers import serialize_milestone, serialize_certificate  # noqa: E402


def _po_options_for(build):
    """Purchase orders available to link a milestone payment to (vendors on
    this build's work packages)."""
    from purchase_orders.models import PurchaseOrder
    vendor_ids = set(
        ProjectWorkPackage.objects.filter(stage__build=build, assigned_vendor__isnull=False)
        .values_list('assigned_vendor_id', flat=True)
    )
    qs = PurchaseOrder.objects.all()
    if vendor_ids:
        qs = qs.filter(vendor_id__in=vendor_ids)
    return [{'id': p.id, 'po_number': p.po_number, 'vendor_id': p.vendor_id,
             'total_po_value': str(p.total_po_value)} for p in qs.order_by('-created_at')[:200]]


def build_milestones_view(request, build_id):
    """GET → milestones (auto-refreshed vs progress) + PO options.
    POST → create a milestone {work_package_id, name, amount, trigger_type,
    trigger_progress_percent?, retention_percent?, payment_stage?}."""
    redirect = _auth(request)
    if redirect:
        return redirect
    build = get_object_or_404(ProjectBuild, pk=build_id)

    if request.method == 'GET':
        _billing.refresh_milestones(build)
        rows = [serialize_milestone(m) for m in build.billing_milestones.select_related('work_package', 'vendor', 'purchase_order')]
        totals = {}
        for m in build.billing_milestones.all():
            totals[m.status] = totals.get(m.status, 0) + float(m.net_payable)
        return JsonResponse({'milestones': rows, 'po_options': _po_options_for(build),
                             'stage_choices': BillingMilestone.STAGE_CHOICES,
                             'trigger_choices': BillingMilestone.TRIGGER_CHOICES,
                             'totals_by_status': totals})

    if request.method == 'POST':
        data = _body(request)
        wp = ProjectWorkPackage.objects.filter(pk=data.get('work_package_id'), stage__build=build).first()
        if not wp:
            return JsonResponse({'error': 'Pick a work package in this build.'}, status=400)
        from decimal import Decimal as _D, InvalidOperation as _IE
        try:
            amount = _D(str(data.get('amount') or '0'))
            retention = _D(str(data.get('retention_percent') or '0'))
            trig_pct = _D(str(data.get('trigger_progress_percent') or '100'))
        except _IE:
            return JsonResponse({'error': 'Invalid numeric value.'}, status=400)
        ms = BillingMilestone.objects.create(
            build=build, work_package=wp, name=(data.get('name') or 'Milestone').strip()[:200],
            order=build.billing_milestones.count() + 1, amount=amount, retention_percent=retention,
            trigger_type=data.get('trigger_type') if data.get('trigger_type') in dict(BillingMilestone.TRIGGER_CHOICES) else BillingMilestone.TRIGGER_WP_DONE,
            trigger_progress_percent=trig_pct,
            payment_stage=data.get('payment_stage') if data.get('payment_stage') in dict(BillingMilestone.STAGE_CHOICES) else 'after_installation',
            notes=(data.get('notes') or '').strip(),
        )
        return JsonResponse({'message': 'Milestone added.', 'milestone': serialize_milestone(ms)}, status=201)

    return JsonResponse({'error': 'GET or POST required'}, status=405)


def milestone_detail_view(request, milestone_id):
    """PATCH → edit fields; DELETE → remove; POST → run an action
    {action: eligible|invoice|approve|mark_paid|hold|reopen, purchase_order_id?}."""
    redirect = _auth(request)
    if redirect:
        return redirect
    ms = get_object_or_404(BillingMilestone, pk=milestone_id)

    if request.method == 'DELETE':
        ms.delete()
        return JsonResponse({'message': 'Milestone removed.'})

    data = _body(request)
    if request.method == 'POST' and data.get('action'):
        from purchase_orders.models import PurchaseOrder
        po = None
        if data.get('purchase_order_id'):
            po = PurchaseOrder.objects.filter(pk=data['purchase_order_id']).first()
        try:
            ms = _billing.milestone_action(ms, data['action'], request.user, purchase_order=po)
        except PermissionDenied as exc:
            return JsonResponse({'error': str(exc)}, status=403)
        except _billing.EngineError as exc:
            return JsonResponse({'error': str(exc)}, status=400)
        return JsonResponse({'message': 'Milestone updated.', 'milestone': serialize_milestone(ms)})

    if request.method in ('PATCH', 'POST'):
        from decimal import Decimal as _D, InvalidOperation as _IE
        try:
            if 'name' in data:
                ms.name = (data['name'] or '').strip()[:200]
            if 'amount' in data:
                ms.amount = _D(str(data['amount']))
            if 'retention_percent' in data:
                ms.retention_percent = _D(str(data['retention_percent']))
            if 'trigger_progress_percent' in data:
                ms.trigger_progress_percent = _D(str(data['trigger_progress_percent']))
        except _IE:
            return JsonResponse({'error': 'Invalid numeric value.'}, status=400)
        if 'trigger_type' in data and data['trigger_type'] in dict(BillingMilestone.TRIGGER_CHOICES):
            ms.trigger_type = data['trigger_type']
        if 'payment_stage' in data and data['payment_stage'] in dict(BillingMilestone.STAGE_CHOICES):
            ms.payment_stage = data['payment_stage']
        if 'purchase_order_id' in data:
            ms.purchase_order_id = data['purchase_order_id'] or None
        if 'notes' in data:
            ms.notes = str(data['notes'])
        ms.save()
        return JsonResponse({'message': 'Milestone updated.', 'milestone': serialize_milestone(ms)})

    return JsonResponse({'error': 'PATCH/POST/DELETE required'}, status=405)


def build_certificates_view(request, build_id):
    """GET → handover certificates; POST → create one {vendor_id, site_name,
    scope_description, issued_date?, issue?}."""
    redirect = _auth(request)
    if redirect:
        return redirect
    build = get_object_or_404(ProjectBuild, pk=build_id)

    if request.method == 'GET':
        rows = [serialize_certificate(c) for c in build.handover_certificates.select_related('vendor')]
        return JsonResponse({'certificates': rows})

    if request.method == 'POST':
        data = _body(request)
        cert = HandoverCertificate.objects.create(
            build=build,
            vendor=Vendor.objects.filter(pk=data.get('vendor_id')).first() if data.get('vendor_id') else None,
            site_name=(data.get('site_name') or '').strip(),
            scope_description=(data.get('scope_description') or '').strip(),
            issued_date=(data.get('issued_date') or None) or None,
            issued_by=request.user if getattr(request.user, 'is_authenticated', False) else None,
            remarks=(data.get('remarks') or '').strip(),
        )
        if data.get('issue'):
            cert.status = HandoverCertificate.STATUS_ISSUED
            if not cert.issued_date:
                from datetime import date as _date
                cert.issued_date = _date.today()
            cert.save()
            _billing.generate_certificate_pdf(cert)
            _billing.release_retention_on_certificate(cert)
        return JsonResponse({'message': 'Handover certificate created.', 'certificate': serialize_certificate(cert)}, status=201)

    return JsonResponse({'error': 'GET or POST required'}, status=405)


def certificate_pdf_view(request, cert_id):
    """POST → (re)generate PDF and mark issued; GET → redirect to the stored PDF."""
    redirect = _auth(request)
    if redirect:
        return redirect
    cert = get_object_or_404(HandoverCertificate, pk=cert_id)
    if request.method == 'POST':
        cert.status = HandoverCertificate.STATUS_ISSUED
        if not cert.issued_date:
            from datetime import date as _date
            cert.issued_date = _date.today()
        cert.save()
        doc = _billing.generate_certificate_pdf(cert)
        if not doc:
            return JsonResponse({'error': 'PDF generation unavailable (reportlab missing).'}, status=503)
        _billing.release_retention_on_certificate(cert)
        return JsonResponse({'message': 'Certificate issued.', 'certificate': serialize_certificate(cert)})
    if cert.document:
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(cert.document.url)
    return JsonResponse({'error': 'No document generated yet.'}, status=404)


def build_billing_summary_view(request, build_id):
    """GET → per-vendor billing summary for a build (claimed/approved/paid/
    retention held)."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    build = get_object_or_404(ProjectBuild, pk=build_id)
    _billing.refresh_milestones(build)
    rows = _billing.vendor_billing_summary(
        build.billing_milestones.select_related('vendor').all())
    return JsonResponse({'summary': rows})


@csrf_exempt
def field_vendor_billing_view(request):
    """Token-auth read endpoint for the vendor / subcontractor portal.
    Header X-Field-Token (or Bearer); query/body: vendor_id (required).
    Returns that vendor's milestones + billing summary across all builds."""
    if request.method not in ('GET', 'POST'):
        return JsonResponse({'error': 'GET or POST required'}, status=405)
    token = getattr(_settings, 'FIELD_INGEST_TOKEN', '') or ''
    if not token:
        return JsonResponse({'error': 'Vendor portal access is not configured.'}, status=503)
    supplied = request.headers.get('X-Field-Token', '')
    if not supplied:
        auth = request.headers.get('Authorization', '')
        if auth.lower().startswith('bearer '):
            supplied = auth[7:].strip()
    if supplied != token:
        return JsonResponse({'error': 'Invalid field token.'}, status=401)

    vendor_id = request.GET.get('vendor_id') or (_body(request).get('vendor_id') if request.method == 'POST' else None)
    if not vendor_id:
        return JsonResponse({'error': 'vendor_id is required.'}, status=400)
    vendor = Vendor.objects.filter(pk=vendor_id).first()
    if not vendor:
        return JsonResponse({'error': 'Vendor not found.'}, status=404)

    milestones = (BillingMilestone.objects
                  .filter(vendor_id=vendor_id)
                  .select_related('vendor', 'work_package', 'purchase_order', 'build__project'))
    ms_rows = []
    for m in milestones:
        row = serialize_milestone(m)
        row['project'] = getattr(m.build.project, 'project_name', '')
        row['project_code'] = getattr(m.build.project, 'project_code', '')
        ms_rows.append(row)
    summary = _billing.vendor_billing_summary(milestones)
    return JsonResponse({
        'vendor': {'id': vendor.id, 'name': vendor.company_name or vendor.vendor_name},
        'summary': summary[0] if summary else None,
        'milestones': ms_rows,
    })


def _site_readiness(project):
    """Per-site development-gate status for the project's build button."""
    blockers = services.site_assessment_blockers(project)
    return {'ready': not blockers, 'blockers': blockers}


def site_readiness_view(request, project_id):
    """GET → whether the project's sites are cleared to start development."""
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)
    return JsonResponse(_site_readiness(project))