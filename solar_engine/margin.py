"""Profitability / per-Watt margin — services.

Margin for a project:
    revenue (inflow)  = client_rate_per_wp × project MW
    outflow           = Σ subcontractor work-order values (labour, FIM model)
    overhead          = overhead_percent × revenue
    margin            = revenue − outflow − overhead
    margin ₹/Wp       = margin / MW
    margin %          = margin / revenue

In the client-furnished-material (FIM) model the client supplies modules and
inverters, so the subcontractor outflow is labour/installation (work orders),
not material procurement.
"""
from decimal import Decimal

from .models import ProjectCommercials, SubcontractWorkOrder, ProjectSite


def _q2(v):
    return (v or Decimal('0')).quantize(Decimal('0.01'))


def get_commercials(project):
    c, _ = ProjectCommercials.objects.get_or_create(project=project)
    return c


def compute_margin(project):
    c = get_commercials(project)
    mw = project.total_mw or Decimal('0')
    watts = mw * Decimal('1000000')  # MW → Wp
    rate = c.client_rate_per_wp or Decimal('0')

    revenue = rate * watts

    wos = list(SubcontractWorkOrder.objects.filter(project=project).exclude(
        status=SubcontractWorkOrder.STATUS_CANCELLED))
    outflow = sum((w.contract_value or Decimal('0') for w in wos), Decimal('0'))
    retention = sum(((w.contract_value or Decimal('0')) * (w.retention_percent or Decimal('0')) / Decimal('100')
                     for w in wos), Decimal('0'))

    overhead = revenue * (c.overhead_percent or Decimal('0')) / Decimal('100')
    margin = revenue - outflow - overhead
    margin_per_wp = (margin / watts) if watts else Decimal('0')
    margin_percent = (margin / revenue * Decimal('100')) if revenue else Decimal('0')

    sites = [{
        'site_name': s.site_name, 'capacity_mw': str(s.capacity_mw),
        'revenue': str(_q2(rate * (s.capacity_mw or Decimal('0')) * Decimal('1000000'))),
    } for s in ProjectSite.objects.filter(project=project)]

    return {
        'project_id': project.id,
        'total_mw': str(mw),
        'client_rate_per_wp': str(rate),
        'overhead_percent': str(c.overhead_percent or Decimal('0')),
        'revenue': str(_q2(revenue)),
        'subcontractor_outflow': str(_q2(outflow)),
        'overhead': str(_q2(overhead)),
        'retention_held': str(_q2(retention)),
        'margin': str(_q2(margin)),
        'margin_per_wp': str(margin_per_wp.quantize(Decimal('0.0001'))),
        'margin_percent': str(margin_percent.quantize(Decimal('0.01'))),
        'sites': sites,
        'work_orders': [{
            'wo_no': w.wo_no, 'vendor': w.vendor.company_name if w.vendor_id else '',
            'contract_value': str(w.contract_value or Decimal('0')),
            'rate_per_wp': str(w.rate_per_wp or Decimal('0')),
            'status': w.get_status_display(),
        } for w in wos],
    }
