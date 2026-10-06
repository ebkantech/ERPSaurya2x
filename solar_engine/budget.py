"""Budget vs Actual helpers: seed cost-head lines from the BOQ, and roll up
budget / committed / actual with a milestone-payment cross-check."""
from collections import OrderedDict
from decimal import Decimal

from .models import BillingMilestone, BudgetLine, ProjectBudget


def ensure_budget(build):
    budget, _ = ProjectBudget.objects.get_or_create(build=build)
    return budget


def seed_from_boq(budget):
    """Create one budget line per BOQ section (budgeted = section total). No-op
    if lines already exist."""
    if budget.lines.exists():
        return 0
    sections = OrderedDict()
    for it in budget.build.boq_items.all():
        sections.setdefault(it.section_name, {'total': Decimal('0'), 'order': it.section_order})
        sections[it.section_name]['total'] += (it.total_amount or Decimal('0'))
    rows = [
        BudgetLine(budget=budget, order=info['order'], cost_head=name,
                   kind=BudgetLine.CAPEX, budgeted_amount=info['total'])
        for name, info in sections.items()
    ]
    BudgetLine.objects.bulk_create(rows)
    return len(rows)


def _milestone_reference(build):
    """Build-linked actuals we can trust: approved / paid via billing milestones."""
    ms = BillingMilestone.objects.filter(build=build)
    approved = paid = retention = Decimal('0')
    for m in ms:
        net = m.net_payable or Decimal('0')
        if m.status == BillingMilestone.STATUS_PAID:
            paid += net
        if m.status in (BillingMilestone.STATUS_APPROVED, BillingMilestone.STATUS_PAID):
            approved += net
        if m.status not in (BillingMilestone.STATUS_PAID,):
            retention += (m.retention_amount or Decimal('0'))
    return {
        'milestone_approved': str(approved),
        'milestone_paid': str(paid),
        'retention_held': str(retention),
        'milestone_count': ms.count(),
    }


def _match_line(lines, text):
    """Match a PO item (by category/name text) to a budget line via keyword."""
    text = (text or '').lower()
    for l in lines:
        for kw in l.cost_head.lower().replace('/', ' ').split():
            if len(kw) >= 4 and kw in text:
                return l
    return None


def sync_actuals(budget):
    """Auto-fill each cost head's committed (PO ordered value) and actual
    (PO delivered value) from the project's purchase orders, matched by
    material category -> cost head. Unmatched spend lands in 'Unallocated (PO)'."""
    from purchase_orders.models import PurchaseOrderItem
    project = budget.build.project
    items = PurchaseOrderItem.objects.filter(po__project=project).select_related('po')
    lines = list(budget.lines.exclude(cost_head='Unallocated (PO)'))
    agg = {l.id: [Decimal('0'), Decimal('0')] for l in lines}
    un = [Decimal('0'), Decimal('0')]
    n = 0
    for it in items:
        n += 1
        committed = it.total_amount or Decimal('0')
        actual = (it.delivered_quantity or Decimal('0')) * (it.unit_rate or Decimal('0'))
        line = _match_line(lines, f"{it.material_category} {it.material_name}")
        bucket = agg[line.id] if line else un
        bucket[0] += committed
        bucket[1] += actual
    for l in lines:
        l.committed_amount, l.actual_amount = agg[l.id]
        l.save(update_fields=['committed_amount', 'actual_amount'])
    if un[0] or un[1]:
        ul, _ = BudgetLine.objects.get_or_create(
            budget=budget, cost_head='Unallocated (PO)', defaults={'order': 999})
        ul.committed_amount, ul.actual_amount = un
        ul.save(update_fields=['committed_amount', 'actual_amount'])
    return n


def rollup(budget):
    lines = list(budget.lines.all())
    t_budget = sum((l.budgeted_amount or Decimal('0')) for l in lines)
    t_committed = sum((l.committed_amount or Decimal('0')) for l in lines)
    t_actual = sum((l.actual_amount or Decimal('0')) for l in lines)
    ref = _milestone_reference(budget.build)
    line_rows = [{
        'id': l.id, 'order': l.order, 'cost_head': l.cost_head, 'kind': l.kind,
        'kind_display': l.get_kind_display(),
        'budgeted_amount': str(l.budgeted_amount), 'committed_amount': str(l.committed_amount),
        'actual_amount': str(l.actual_amount), 'variance': str(l.variance),
        'consumed_percent': l.consumed_percent, 'note': l.note,
    } for l in lines]
    over = t_actual > t_budget
    # ready to close: everything budgeted is spent-or-under, nothing left on milestones
    ready = (budget.build.billing_milestones.exclude(
        status=BillingMilestone.STATUS_PAID).count() == 0) and not over
    return {
        'budget': {'id': budget.id, 'status': budget.status, 'currency': budget.currency, 'note': budget.note},
        'lines': line_rows,
        'totals': {
            'budgeted': str(t_budget), 'committed': str(t_committed), 'actual': str(t_actual),
            'variance': str(t_budget - t_actual),
            'consumed_percent': round(float(t_actual / t_budget * 100), 1) if t_budget > 0 else 0,
            'over_budget': over,
        },
        'reference': ref,
        'ready_to_close': ready,
    }
