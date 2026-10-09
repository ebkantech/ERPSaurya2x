"""Sites / locations API — per-location records, assessment & NOC compliance.
ERP-session authenticated."""
import json

from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from core.models import ProjectMaster
from permissions.utils import require_authenticated

from . import services
from .models import ProjectSite, SiteAssessmentItem, StatutoryApproval


def _auth(request):
    return require_authenticated(request)


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


def _ser_site(s):
    assessments = list(s.assessments.all())
    nocs = list(s.statutory_approvals.all())
    pending_assess = [a for a in assessments if a.is_mandatory and not a.is_satisfied]
    pending_nocs = [n for n in nocs if n.is_mandatory and n.status not in StatutoryApproval.SATISFIED_STATUSES]
    return {
        'id': s.id, 'site_code': s.site_code, 'site_name': s.site_name,
        'location': s.location, 'capacity_mw': str(s.capacity_mw),
        'latitude': str(s.latitude) if s.latitude is not None else '',
        'longitude': str(s.longitude) if s.longitude is not None else '',
        'status': s.status, 'status_display': s.get_status_display(),
        'is_cleared': s.is_cleared, 'note': s.note,
        'assessment_count': len(assessments), 'assessment_pending': len(pending_assess),
        'noc_count': len(nocs), 'noc_pending': len(pending_nocs),
        'assessments': [{
            'id': a.id, 'name': a.name, 'is_mandatory': a.is_mandatory,
            'status': a.status, 'status_display': a.get_status_display(),
            'is_satisfied': a.is_satisfied, 'note': a.note,
        } for a in assessments],
        'nocs': [{
            'id': n.id, 'authority': n.authority, 'approval_type': n.approval_type,
            'status': n.status, 'status_display': n.get_status_display(),
            'is_mandatory': n.is_mandatory, 'is_satisfied': n.status in StatutoryApproval.SATISFIED_STATUSES,
            'reference_no': n.reference_no,
        } for n in nocs],
    }


def project_sites_view(request, project_id):
    """GET  → the project's sites (locations) with assessment & NOC status.
    POST → create a site {site_code?, site_name, location?, capacity_mw?, lat?, lng?,
           apply_checklists?} — optionally seed the standard assessment + NOC checklists.
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'GET':
        sites = project.solar_sites.prefetch_related('assessments', 'statutory_approvals')
        allocated = services.allocated_mw(project)
        cap = project.total_mw or 0
        return JsonResponse({
            'sites': [_ser_site(s) for s in sites],
            'project_total_mw': str(project.total_mw),
            'allocated_mw': str(allocated),
            'remaining_mw': str((project.total_mw or 0) - allocated),
            'readiness': services.project_readiness(project),
        })

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    name = (data.get('site_name') or '').strip()
    if not name:
        return JsonResponse({'error': 'Site name is required.'}, status=400)
    code = (data.get('site_code') or '').strip()
    if not code:
        base = (project.project_code or f'P{project.id}')
        code = f'{base}-S{project.solar_sites.count() + 1:02d}'
    if ProjectSite.objects.filter(site_code=code).exists():
        return JsonResponse({'error': f'Site code {code} already exists.'}, status=400)

    try:
        services.validate_site_capacity(project, data.get('capacity_mw') or 0)
        with transaction.atomic():
            site = ProjectSite.objects.create(
                project=project, site_code=code[:40], site_name=name[:200],
                location=(data.get('location') or '')[:255],
                capacity_mw=data.get('capacity_mw') or 0,
                latitude=data.get('latitude') or None, longitude=data.get('longitude') or None,
                note=data.get('note') or '',
            )
            if data.get('apply_checklists'):
                services.apply_default_site_assessments(site)
                services.apply_default_noc_checklist(project, site=site)
            services.recalc_project_mw(project)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': f'Site {site.site_code} added.', 'site': _ser_site(site)}, status=201)


def site_detail_view(request, site_id):
    """GET → one site.
    POST → {action?} : 'apply_checklists' | 'set_status' {status} | 'update' {fields} | 'delete'
           (bare body with fields also updates).
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    site = get_object_or_404(ProjectSite, pk=site_id)

    if request.method == 'GET':
        return JsonResponse(_ser_site(site))
    if request.method == 'DELETE':
        project = site.project
        site.delete()
        services.recalc_project_mw(project)
        return JsonResponse({'message': 'Site removed.'})
    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST/DELETE required'}, status=405)

    data = _body(request)
    action = data.get('action')
    if action == 'apply_checklists':
        services.apply_default_site_assessments(site)
        services.apply_default_noc_checklist(site.project, site=site)
        services.maybe_autoclear_site(site)
        return JsonResponse({'message': 'Checklists applied.', 'site': _ser_site(site)})
    if action == 'delete':
        project = site.project
        site.delete()
        services.recalc_project_mw(project)
        return JsonResponse({'message': 'Site removed.'})
    if action == 'set_status':
        if data.get('status') not in dict(ProjectSite.STATUS_CHOICES):
            return JsonResponse({'error': 'Invalid status.'}, status=400)
        site.status = data['status']
        site.save(update_fields=['status', 'updated_at'])
        return JsonResponse({'message': 'Site status updated.', 'site': _ser_site(site)})

    # field update
    for f in ('site_name', 'location', 'note'):
        if f in data:
            setattr(site, f, (data[f] or '')[:255])
    mw_changed = False
    if 'capacity_mw' in data:
        try:
            services.validate_site_capacity(site.project, data['capacity_mw'] or 0, exclude_site_id=site.id)
        except services.EngineError as e:
            return JsonResponse({'error': str(e)}, status=400)
        site.capacity_mw = data['capacity_mw'] or 0
        mw_changed = True
    if 'latitude' in data:
        site.latitude = data['latitude'] or None
    if 'longitude' in data:
        site.longitude = data['longitude'] or None
    site.save()
    if mw_changed:
        services.recalc_project_mw(site.project)
    return JsonResponse({'message': 'Site updated.', 'site': _ser_site(site)})


def site_assessment_detail_view(request, item_id):
    """POST {status} → set a site-assessment item's status; auto-clears the site
    when all its mandatory assessments and NOCs are satisfied."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    item = get_object_or_404(SiteAssessmentItem, pk=item_id)
    data = _body(request)
    if 'status' in data:
        if data['status'] not in dict(SiteAssessmentItem.STATUS_CHOICES):
            return JsonResponse({'error': 'Invalid status.'}, status=400)
        item.status = data['status']
    if 'is_mandatory' in data:
        item.is_mandatory = bool(data['is_mandatory'])
    if 'note' in data:
        item.note = data['note'] or ''
    item.save()
    services.maybe_autoclear_site(item.site)
    return JsonResponse({'message': 'Assessment updated.', 'site': _ser_site(item.site)})
