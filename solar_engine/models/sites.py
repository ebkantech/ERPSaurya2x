from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

from .dms import EngineeringDocument

class ProjectSite(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_IN_ASSESSMENT = 'in_assessment'
    STATUS_CLEARED = 'cleared'
    STATUS_ON_HOLD = 'on_hold'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'), (STATUS_IN_ASSESSMENT, 'In assessment'),
        (STATUS_CLEARED, 'Cleared'), (STATUS_ON_HOLD, 'On hold'),
    ]

    project = models.ForeignKey('core.ProjectMaster', on_delete=models.CASCADE, related_name='solar_sites')
    site_code = models.CharField(max_length=40, unique=True)
    site_name = models.CharField(max_length=200)
    location = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    capacity_mw = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal('0'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_project_site'
        ordering = ['project', 'site_code']

    def __str__(self):
        return f'{self.site_code} — {self.site_name}'

    @property
    def is_cleared(self):
        return self.status == self.STATUS_CLEARED


class SiteAssessmentItem(models.Model):
    """One assessment/compliance check for a site (e.g. topographical survey,
    soil resistivity, land title, shadow analysis). A site is development-ready
    only when its mandatory items are cleared (or waived)."""

    STATUS_PENDING = 'pending'
    STATUS_SUBMITTED = 'submitted'
    STATUS_CLEARED = 'cleared'
    STATUS_REJECTED = 'rejected'
    STATUS_WAIVED = 'waived'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'), (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_CLEARED, 'Cleared'), (STATUS_REJECTED, 'Rejected'),
        (STATUS_WAIVED, 'Waived / N/A'),
    ]
    SATISFIED_STATUSES = (STATUS_CLEARED, STATUS_WAIVED)

    site = models.ForeignKey(ProjectSite, on_delete=models.CASCADE, related_name='assessments')
    name = models.CharField(max_length=200)
    is_mandatory = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    document = models.ForeignKey(EngineeringDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name='assessment_items')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_site_assessment_item'
        ordering = ['site', 'id']

    def __str__(self):
        return f'{self.name} ({self.status})'

    @property
    def is_satisfied(self):
        return self.status in self.SATISFIED_STATUSES

