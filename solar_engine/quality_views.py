"""QA/Testing + Punch List endpoints.

Field portal (token auth): submit inspections and punch items from site.
ERP (login auth): monitor + manage (list/create/update/delete).
Mirrors the Daily Progress / field-ingest patterns."""
from datetime import date
from decimal import Decimal, InvalidOperation

from django.conf import settings as _settings
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt

from core.models import ProjectMaster
from . import quality as _q
from .models import (
    ProjectBuild, ProjectStage, ProjectWorkPackage,
    PunchItem, QualityInspection,
)
from .serializers import serialize_inspection, serialize_punch
from .views import _auth, _body


# --- shared helpers -------------------------------------------------------
def _field_token_ok(request):
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
    return None


def _parse_date(value, fallback=None):
    if not value:
        return fallback or date.today()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return fallback or date.today()


def _geo(data, obj):
    for f in ('latitude', 'longitude'):
        v = data.get(f)
        if v not in (None, ''):
            try:
                setattr(obj, f, Decimal(str(v)))
            except (InvalidOperation, TypeError):
                pass


def _build_from_project(data):
    project = None
    if data.get('project_id'):
        project = ProjectMaster.objects.filter(pk=data['project_id']).first()
    elif data.get('project_code'):
        project = ProjectMaster.objects.filter(project_code=data['project_code']).first()
    if not project:
        return None, JsonResponse({'error': 'project_id or project_code required and must exist.'}, status=400)
    build = ProjectBuild.objects.filter(project=project).first()
    if not build:
        return None, JsonResponse({'error': 'This project has no work structure yet.'}, status=400)
    return build, None


def _wp_stage(build, data):
    wp = None
    if data.get('work_package_id'):
        wp = ProjectWorkPackage.objects.filter(pk=data['work_package_id'], stage__build=build).first()
    stage = wp.stage if wp else None
    if not stage and data.get('stage_id'):
        stage = ProjectStage.objects.filter(pk=data['stage_id'], build=build).first()
    return wp, stage


def _make_inspection(build, data, request, source):
    wp, stage = _wp_stage(build, data)
    itype = (data.get('inspection_type') or QualityInspection.TYPE_GENERAL).strip()
    if itype not in dict(QualityInspection.TYPE_CHOICES):
        itype = QualityInspection.TYPE_GENERAL
    ins = QualityInspection(
        build=build, stage=stage, work_package=wp,
        site_name=(data.get('site_name') or '').strip() or 'Site',
        inspection_type=itype,
        inspection_date=_parse_date(data.get('inspection_date')),
        note=(data.get('note') or '').strip(),
        reporter_name=(data.get('reporter_name') or '').strip(),
        source=source,
    )
    _geo(data, ins)
    if request and getattr(request, 'FILES', None) and request.FILES.get('photo'):
        ins.photo = request.FILES['photo']
    if request and getattr(request, 'user', None) and request.user.is_authenticated:
        ins.reported_by = request.user
    ins.save()
    # checkpoints: explicit list wins, else seed from the type template
    items = data.get('checkpoints')
    if isinstance(items, str):
        import json
        try:
            items = json.loads(items)
        except ValueError:
            items = None
    if items:
        _q.set_checkpoints(ins, items)
    else:
        _q.apply_template(ins)
    # auto status unless explicitly provided
    explicit = (data.get('status') or '').strip()
    ins.status = explicit if explicit in dict(QualityInspection.STATUS_CHOICES) else _q.auto_status(ins)
    ins.save(update_fields=['status', 'vendor'])
    return ins


def _make_punch(build, data, request, source):
    wp, stage = _wp_stage(build, data)
    disc = (data.get('discipline') or PunchItem.DISC_OTHER).strip()
    if disc not in dict(PunchItem.DISCIPLINE_CHOICES):
        disc = PunchItem.DISC_OTHER
    sev = (data.get('severity') or PunchItem.SEV_MEDIUM).strip()
    if sev not in dict(PunchItem.SEVERITY_CHOICES):
        sev = PunchItem.SEV_MEDIUM
    p = PunchItem(
        build=build, stage=stage, work_package=wp,
        site_name=(data.get('site_name') or '').strip() or 'Site',
        title=(data.get('title') or '').strip() or 'Defect',
        description=(data.get('description') or '').strip(),
        discipline=disc, severity=sev,
        raised_on=_parse_date(data.get('raised_on')),
        target_date=_parse_date(data.get('target_date'), fallback=None) if data.get('target_date') else None,
        raiser_name=(data.get('reporter_name') or data.get('raiser_name') or '').strip(),
        source=source,
    )
    _geo(data, p)
    if request and getattr(request, 'FILES', None) and request.FILES.get('photo'):
        p.photo = request.FILES['photo']
    if request and getattr(request, 'user', None) and request.user.is_authenticated:
        p.raised_by = request.user
    p.save()
    return p


# --- field ingest (token) -------------------------------------------------
@csrf_exempt
def field_inspection_ingest(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    err = _field_token_ok(request)
    if err:
        return err
    data = _body(request)
    build, berr = _build_from_project(data)
    if berr:
        return berr
    ins = _make_inspection(build, data, request, QualityInspection.SOURCE_FIELD)
    return JsonResponse({'message': 'Inspection recorded.', 'inspection': serialize_inspection(ins)}, status=201)


@csrf_exempt
def field_punch_ingest(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    err = _field_token_ok(request)
    if err:
        return err
    data = _body(request)
    build, berr = _build_from_project(data)
    if berr:
        return berr
    p = _make_punch(build, data, request, PunchItem.SOURCE_FIELD)
    return JsonResponse({'message': 'Punch item logged.', 'punch': serialize_punch(p)}, status=201)


# --- ERP: inspection templates -------------------------------------------
def inspection_templates_view(request):
    err = _auth(request)
    if err:
        return err
    return JsonResponse({
        'types': [{'value': v, 'label': l, 'checkpoints': [
            {'parameter': p, 'spec': s, 'unit': u} for p, s, u in _q.template_for(v)
        ]} for v, l in QualityInspection.TYPE_CHOICES],
    })


# --- ERP: inspections -----------------------------------------------------
def build_inspections_view(request, build_id):
    err = _auth(request)
    if err:
        return err
    build = get_object_or_404(ProjectBuild, pk=build_id)
    if request.method == 'GET':
        qs = build.inspections.select_related('stage', 'work_package', 'vendor').prefetch_related('checkpoints')
        return JsonResponse({'inspections': [serialize_inspection(i) for i in qs]})
    if request.method == 'POST':
        ins = _make_inspection(build, _body(request), request, QualityInspection.SOURCE_WEB)
        return JsonResponse({'inspection': serialize_inspection(ins)}, status=201)
    return JsonResponse({'error': 'GET or POST required'}, status=405)


def inspection_detail_view(request, inspection_id):
    err = _auth(request)
    if err:
        return err
    ins = get_object_or_404(QualityInspection, pk=inspection_id)
    if request.method == 'DELETE':
        ins.delete()
        return JsonResponse({'message': 'Deleted.'})
    if request.method in ('PATCH', 'POST'):
        data = _body(request)
        if 'checkpoints' in data:
            _q.set_checkpoints(ins, data.get('checkpoints'))
        for f in ('site_name', 'note', 'reporter_name'):
            if f in data:
                setattr(ins, f, (data.get(f) or '').strip())
        status = (data.get('status') or '').strip()
        ins.status = status if status in dict(QualityInspection.STATUS_CHOICES) else _q.auto_status(ins)
        ins.save()
        return JsonResponse({'inspection': serialize_inspection(ins)})
    return JsonResponse({'inspection': serialize_inspection(ins)})


# --- ERP: punch list ------------------------------------------------------
def build_punch_view(request, build_id):
    err = _auth(request)
    if err:
        return err
    build = get_object_or_404(ProjectBuild, pk=build_id)
    if request.method == 'GET':
        qs = build.punch_items.select_related('work_package', 'vendor')
        status = request.GET.get('status')
        if status:
            qs = qs.filter(status=status)
        return JsonResponse({'punch_items': [serialize_punch(p) for p in qs]})
    if request.method == 'POST':
        p = _make_punch(build, _body(request), request, PunchItem.SOURCE_WEB)
        return JsonResponse({'punch': serialize_punch(p)}, status=201)
    return JsonResponse({'error': 'GET or POST required'}, status=405)


def punch_detail_view(request, punch_id):
    err = _auth(request)
    if err:
        return err
    p = get_object_or_404(PunchItem, pk=punch_id)
    if request.method == 'DELETE':
        p.delete()
        return JsonResponse({'message': 'Deleted.'})
    if request.method in ('PATCH', 'POST'):
        data = _body(request)
        for f in ('title', 'description', 'site_name'):
            if f in data:
                setattr(p, f, (data.get(f) or '').strip())
        for f, choices in (('discipline', PunchItem.DISCIPLINE_CHOICES),
                           ('severity', PunchItem.SEVERITY_CHOICES),
                           ('status', PunchItem.STATUS_CHOICES)):
            v = (data.get(f) or '').strip()
            if v and v in dict(choices):
                setattr(p, f, v)
        if data.get('assigned_vendor_id'):
            from core.models import Vendor
            v = Vendor.objects.filter(pk=data['assigned_vendor_id']).first()
            if v:
                p.vendor = v
        if data.get('target_date'):
            p.target_date = _parse_date(data['target_date'])
        if p.status in (PunchItem.STATUS_RESOLVED, PunchItem.STATUS_VERIFIED, PunchItem.STATUS_CLOSED) and not p.resolved_on:
            p.resolved_on = date.today()
        p.save()
        return JsonResponse({'punch': serialize_punch(p)})
    return JsonResponse({'punch': serialize_punch(p)})
