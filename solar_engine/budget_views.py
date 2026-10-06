"""Budget vs Actual endpoints (ERP login-auth)."""
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from . import budget as _b
from .models import BudgetLine, ProjectBudget, ProjectBuild
from .views import _auth, _body


def _dec(v, fallback=None):
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError):
        return fallback


def build_budget_view(request, build_id):
    """GET → budget rollup (lines, totals, milestone reference, closeout flag).
    POST → create the budget and seed lines from the BOQ."""
    err = _auth(request)
    if err:
        return err
    build = get_object_or_404(ProjectBuild, pk=build_id)
    if request.method == 'POST':
        budget = _b.ensure_budget(build)
        seeded = _b.seed_from_boq(budget)
        data = _body(request)
        if data.get('cost_head'):  # optional: add a single custom line
            BudgetLine.objects.create(
                budget=budget, cost_head=data['cost_head'][:120],
                kind=data.get('kind') if data.get('kind') in ('capex', 'opex') else 'capex',
                budgeted_amount=_dec(data.get('budgeted_amount'), Decimal('0')),
                order=budget.lines.count())
        return JsonResponse({'seeded': seeded, **_b.rollup(budget)}, status=201)
    budget = getattr(build, 'budget', None)
    if not budget:
        return JsonResponse({'budget': None, 'lines': [], 'totals': None,
                             'reference': None, 'ready_to_close': False})
    return JsonResponse(_b.rollup(budget))


def budget_line_view(request, line_id):
    """PATCH → update a line (amounts / cost head / kind). DELETE → remove it."""
    err = _auth(request)
    if err:
        return err
    line = get_object_or_404(BudgetLine, pk=line_id)
    if request.method == 'DELETE':
        line.delete()
        return JsonResponse({'message': 'Deleted.'})
    if request.method in ('PATCH', 'POST'):
        data = _body(request)
        if 'cost_head' in data:
            line.cost_head = (data.get('cost_head') or '').strip()[:120]
        if data.get('kind') in ('capex', 'opex'):
            line.kind = data['kind']
        for f in ('budgeted_amount', 'committed_amount', 'actual_amount'):
            if f in data:
                v = _dec(data.get(f))
                if v is not None:
                    setattr(line, f, v)
        if 'note' in data:
            line.note = (data.get('note') or '')[:255]
        line.save()
        return JsonResponse(_b.rollup(line.budget))
    return JsonResponse({'error': 'PATCH or DELETE required'}, status=405)


def budget_sync_view(request, build_id):
    """POST → recompute committed/actual per cost head from the project's POs."""
    err = _auth(request)
    if err:
        return err
    build = get_object_or_404(ProjectBuild, pk=build_id)
    budget = getattr(build, 'budget', None)
    if not budget:
        return JsonResponse({'error': 'No budget yet. Create it first.'}, status=400)
    count = _b.sync_actuals(budget)
    result = _b.rollup(budget)
    result['synced_items'] = count
    return JsonResponse(result)


def budget_status_view(request, build_id):
    """POST → set budget status (draft/approved/closed)."""
    err = _auth(request)
    if err:
        return err
    build = get_object_or_404(ProjectBuild, pk=build_id)
    budget = getattr(build, 'budget', None)
    if not budget:
        return JsonResponse({'error': 'No budget to update.'}, status=400)
    status = (_body(request).get('status') or '').strip()
    if status not in dict(ProjectBudget.STATUS_CHOICES):
        return JsonResponse({'error': 'Invalid status.'}, status=400)
    budget.status = status
    if status == ProjectBudget.STATUS_APPROVED and request.user.is_authenticated:
        budget.approved_by = request.user
    budget.save()
    return JsonResponse(_b.rollup(budget))
