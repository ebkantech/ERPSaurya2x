from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

from .build import ProjectBuild

class ProjectBudget(models.Model):
    """A build's cost budget, broken into cost-head lines. Actuals are tracked
    per line (editable) and cross-checked against milestone payments."""

    STATUS_DRAFT = 'draft'
    STATUS_APPROVED = 'approved'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'), (STATUS_APPROVED, 'Approved'), (STATUS_CLOSED, 'Closed'),
    ]

    build = models.OneToOneField(ProjectBuild, on_delete=models.CASCADE, related_name='budget')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    currency = models.CharField(max_length=10, default='INR')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_budgets')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_project_budget'

    def __str__(self):
        return f'Budget for build #{self.build_id} ({self.status})'


class BudgetLine(models.Model):
    CAPEX = 'capex'
    OPEX = 'opex'
    KIND_CHOICES = [(CAPEX, 'CapEx'), (OPEX, 'OpEx')]

    budget = models.ForeignKey(ProjectBudget, on_delete=models.CASCADE, related_name='lines')
    order = models.PositiveIntegerField(default=0)
    cost_head = models.CharField(max_length=120)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=CAPEX)
    budgeted_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    committed_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    actual_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'solar_budget_line'
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.cost_head}: {self.budgeted_amount}'

    @property
    def variance(self):
        return (self.budgeted_amount or Decimal('0')) - (self.actual_amount or Decimal('0'))

    @property
    def consumed_percent(self):
        b = self.budgeted_amount or Decimal('0')
        if b <= 0:
            return 0
        return round(float((self.actual_amount or Decimal('0')) / b * 100), 1)

