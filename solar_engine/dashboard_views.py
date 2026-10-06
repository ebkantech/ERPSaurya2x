"""Real dashboard data from the solar engine (replaces the old mock
KUSUM dashboard that was fed by the Solar Site Tracker)."""
from collections import OrderedDict
from decimal import Decimal

from django.db.models import Max
from django.http import JsonResponse

from .models import (
    BillingMilestone, ProjectBuild, ProjectStage, ProjectWorkPackage,
    PunchItem, QualityInspection, SiteProgressEntry,
)
from .views import _auth

C_COMPLETED = 'completed'
C_IN_PROGRESS = 'in_progress'


def _latest_progress_by_wp(build):
    out = {}
    for e in SiteProgressEntry.objects.filter(build=build):
        if e.work_package_id and float(e.progress_percent or 0) > out.get(e.work_package_id, 0):
            out[e.work_package_id] = float(e.progress_percent or 0)
    return out


def _vendor_stats(build, prog):
    rows = {}
    wps = ProjectWorkPackage.objects.filter(stage__build=build, assigned_vendor__isnull=False).select_related('assigned_vendor', 'stage')
    for w in wps:
        v = w.assigned_vendor
        r = rows.setdefault(v.id, {'name': v.company_name or v.vendor_name, 'packages': 0,
                                   'pcts': [], 'scope': '', 'in_prog_order': 10 ** 9})
        r['packages'] += 1
        r['pcts'].append(prog.get(w.id, 0))
        if w.status == C_IN_PROGRESS and w.stage and w.stage.order < r['in_prog_order']:
            r['in_prog_order'] = w.stage.order
            r['scope'] = w.stage.name
    result = []
    for r in rows.values():
        pct = round(sum(r['pcts']) / len(r['pcts'])) if r['pcts'] else 0
        result.append({'name': r['name'], 'packages': r['packages'], 'pct': pct,
                       'scope_label': r['scope'] or 'All stages complete'})
    return sorted(result, key=lambda x: -x['pct'])


def _stage_chart(build):
    rows = []
    for st in build.stages.order_by('order').prefetch_related('work_packages'):
        wps = list(st.work_packages.all())
        rows.append({
            'stage': (st.name or st.code)[:14],
            'completed': sum(1 for w in wps if w.status == C_COMPLETED),
            'inProgress': sum(1 for w in wps if w.status == C_IN_PROGRESS),
            'pending': sum(1 for w in wps if w.status not in (C_COMPLETED, C_IN_PROGRESS)),
        })
    return rows


def _timeline(build):
    buckets = OrderedDict()
    for e in SiteProgressEntry.objects.filter(build=build).order_by('progress_date'):
        if not e.progress_date:
            continue
        key = e.progress_date.strftime('%b')
        buckets.setdefault(key, []).append(float(e.progress_percent or 0))
    return [{'m': k, 'pct': round(sum(v) / len(v))} for k, v in buckets.items()]


def _serialize_build_card(b, prog_cache=None):
    sizing = getattr(b, 'sizing', None)
    return {
        'build_id': b.id,
        'project': getattr(b.project, 'project_name', ''),
        'project_code': getattr(b.project, 'project_code', ''),
        'type': b.get_project_type_display(),
        'mw': str(b.ac_capacity_mw),
        'status': b.get_status_display(),
        'progress': b.progress_percent,
        'vendors': ProjectWorkPackage.objects.filter(stage__build=b, assigned_vendor__isnull=False)
                   .values('assigned_vendor').distinct().count(),
        'sites': SiteProgressEntry.objects.filter(build=b).values('site_name').distinct().count(),
    }


def dashboard_view(request):
    """GET [?build_id=] → KPIs, project cards, and the selected build's charts."""
    err = _auth(request)
    if err:
        return err
    builds = list(ProjectBuild.objects.select_related('project', 'sizing').order_by('-updated_at'))
    cards = [_serialize_build_card(b) for b in builds]

    total_mw = sum((b.ac_capacity_mw or Decimal('0')) for b in builds)
    avg_progress = round(sum(c['progress'] for c in cards) / len(cards)) if cards else 0
    active_vendors = ProjectWorkPackage.objects.filter(assigned_vendor__isnull=False).values('assigned_vendor').distinct().count()
    open_punch = PunchItem.objects.exclude(status__in=['resolved', 'verified', 'closed']).count()
    failed_insp = QualityInspection.objects.filter(status='failed').count()

    sel_id = request.GET.get('build_id')
    sel = None
    if sel_id:
        sel = next((b for b in builds if str(b.id) == str(sel_id)), None)
    if not sel and builds:
        sel = builds[0]

    selected = None
    if sel:
        prog = _latest_progress_by_wp(sel)
        alerts = []
        f = QualityInspection.objects.filter(build=sel, status='failed').count()
        if f:
            alerts.append({'type': 'warn', 'msg': f'{f} QA inspection(s) failed — needs rework'})
        op = PunchItem.objects.filter(build=sel).exclude(status__in=['resolved', 'verified', 'closed']).count()
        if op:
            alerts.append({'type': 'warn', 'msg': f'{op} open punch item(s) on site'})
        hold = BillingMilestone.objects.filter(build=sel, status='on_hold').count()
        if hold:
            alerts.append({'type': 'info', 'msg': f'{hold} billing milestone(s) on hold'})
        if not alerts:
            alerts.append({'type': 'info', 'msg': 'No open issues on this project.'})
        selected = {
            **_serialize_build_card(sel),
            'vendor_stats': _vendor_stats(sel, prog),
            'stage_chart': _stage_chart(sel),
            'timeline': _timeline(sel),
            'alerts': alerts,
        }

    return JsonResponse({
        'kpis': {
            'projects': len(cards), 'total_mw': str(total_mw), 'avg_progress': avg_progress,
            'active_vendors': active_vendors, 'open_punch': open_punch, 'failed_inspections': failed_insp,
        },
        'projects': cards,
        'selected': selected,
    })
