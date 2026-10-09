from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

from .build import ProjectWorkPackage

class SubcontractWorkOrder(models.Model):
    RATE_PER_WP = 'per_wp'
    RATE_PER_WATT = 'per_wp_wattage'
    RATE_LUMPSUM = 'lumpsum'
    RATE_BASIS_CHOICES = [
        (RATE_PER_WP, 'Per work package'),
        (RATE_PER_WATT, 'Per Watt (₹/Wp)'),
        (RATE_LUMPSUM, 'Lump sum'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_ISSUED = 'issued'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_COMPLETED = 'completed'
    STATUS_CLOSED = 'closed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'), (STATUS_ISSUED, 'Issued'),
        (STATUS_IN_PROGRESS, 'In progress'), (STATUS_COMPLETED, 'Completed'),
        (STATUS_CLOSED, 'Closed'), (STATUS_CANCELLED, 'Cancelled'),
    ]

    wo_no = models.CharField(max_length=40, unique=True)
    project = models.ForeignKey('core.ProjectMaster', on_delete=models.CASCADE, related_name='work_orders')
    vendor = models.ForeignKey('core.Vendor', on_delete=models.PROTECT, related_name='work_orders')
    engagement_type = models.CharField(
        max_length=20, choices=ProjectWorkPackage.ENGAGEMENT_CHOICES,
        default=ProjectWorkPackage.ENGAGEMENT_MILESTONE,
    )
    title = models.CharField(max_length=200)
    scope_note = models.TextField(blank=True)
    contract_value = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    rate_basis = models.CharField(max_length=20, choices=RATE_BASIS_CHOICES, default=RATE_LUMPSUM)
    rate_per_wp = models.DecimalField(max_digits=16, decimal_places=4, default=Decimal('0'))  # ₹/Wp outflow
    retention_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='work_orders_created')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_subcontract_work_order'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.wo_no} — {self.vendor_id}'

    @property
    def lines_value(self):
        agg = self.lines.aggregate(s=models.Sum('line_value'))
        return agg['s'] or Decimal('0')

    @property
    def work_package_count(self):
        return self.lines.count()


class SubcontractWorkOrderLine(models.Model):
    work_order = models.ForeignKey(SubcontractWorkOrder, on_delete=models.CASCADE, related_name='lines')
    work_package = models.ForeignKey(ProjectWorkPackage, on_delete=models.CASCADE, related_name='work_order_lines')
    line_value = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'solar_subcontract_wo_line'
        ordering = ['id']
        unique_together = [('work_order', 'work_package')]

    def __str__(self):
        return f'{self.work_order.wo_no} · {self.work_package.name}'

