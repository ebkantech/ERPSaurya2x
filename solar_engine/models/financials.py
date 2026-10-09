from decimal import Decimal

from django.db import models


class ProjectCommercials(models.Model):
    """Per-project commercial inputs for the profitability calculator:
    the client inflow rate (what the client pays, ₹/Wp) and the overhead
    deduction. Subcontractor outflow is derived from the project's work
    orders; revenue from the client rate × the project's MW."""

    project = models.OneToOneField('core.ProjectMaster', on_delete=models.CASCADE, related_name='commercials')
    client_rate_per_wp = models.DecimalField(max_digits=16, decimal_places=4, default=Decimal('0'))  # ₹/Wp inflow
    overhead_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    note = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_project_commercials'

    def __str__(self):
        return f'Commercials for project #{self.project_id} (₹{self.client_rate_per_wp}/Wp)'
