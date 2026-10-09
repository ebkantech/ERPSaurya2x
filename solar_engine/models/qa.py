from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

from .build import ProjectBuild, ProjectStage, ProjectWorkPackage

class QualityInspection(models.Model):
    """A QA/testing record against a work package / site: a header plus a set
    of measured checkpoints. Submitted from the ERP or the field portal."""

    SOURCE_WEB = 'web'
    SOURCE_FIELD = 'field'
    SOURCE_CHOICES = [(SOURCE_WEB, 'ERP Web'), (SOURCE_FIELD, 'Field Portal')]

    TYPE_TORQUE = 'torque_check'
    TYPE_MEGGER = 'megger_test'
    TYPE_EARTHING = 'earthing_continuity'
    TYPE_IV = 'iv_curve'
    TYPE_PRECOMM = 'pre_commissioning'
    TYPE_GENERAL = 'general'
    TYPE_CHOICES = [
        (TYPE_TORQUE, 'Torque check'),
        (TYPE_MEGGER, 'Megger / insulation resistance'),
        (TYPE_EARTHING, 'Earthing continuity'),
        (TYPE_IV, 'IV-curve tracing'),
        (TYPE_PRECOMM, 'Pre-commissioning'),
        (TYPE_GENERAL, 'General inspection'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_PASSED = 'passed'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending review'),
        (STATUS_PASSED, 'Passed'),
        (STATUS_FAILED, 'Failed'),
    ]

    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='inspections')
    stage = models.ForeignKey(ProjectStage, on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections')
    work_package = models.ForeignKey(ProjectWorkPackage, on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections')
    vendor = models.ForeignKey('core.Vendor', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections')

    site_name = models.CharField(max_length=200)
    inspection_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default=TYPE_GENERAL)
    inspection_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    note = models.TextField(blank=True)
    photo = models.FileField(upload_to='quality_inspections/', null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='quality_inspections')
    reporter_name = models.CharField(max_length=150, blank=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=SOURCE_WEB)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_quality_inspection'
        ordering = ['-inspection_date', '-created_at', '-id']

    def __str__(self):
        return f'{self.get_inspection_type_display()} @ {self.site_name} ({self.status})'

    @property
    def result_rollup(self):
        """pass/fail counts across checkpoints."""
        items = list(self.checkpoints.all())
        return {
            'total': len(items),
            'passed': sum(1 for i in items if i.result == QualityCheckpoint.RESULT_PASS),
            'failed': sum(1 for i in items if i.result == QualityCheckpoint.RESULT_FAIL),
        }

    def save(self, *args, **kwargs):
        if self.work_package_id and not self.vendor_id:
            self.vendor_id = self.work_package.assigned_vendor_id
        super().save(*args, **kwargs)


class QualityCheckpoint(models.Model):
    """One measured parameter inside a QualityInspection."""

    RESULT_PASS = 'pass'
    RESULT_FAIL = 'fail'
    RESULT_NA = 'na'
    RESULT_CHOICES = [(RESULT_PASS, 'Pass'), (RESULT_FAIL, 'Fail'), (RESULT_NA, 'N/A')]

    inspection = models.ForeignKey(QualityInspection, on_delete=models.CASCADE, related_name='checkpoints')
    order = models.PositiveIntegerField(default=0)
    parameter = models.CharField(max_length=200)
    spec = models.CharField(max_length=120, blank=True)       # acceptance / expected
    measured = models.CharField(max_length=120, blank=True)   # observed value
    unit = models.CharField(max_length=40, blank=True)
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, default=RESULT_NA)
    remark = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'solar_quality_checkpoint'
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.parameter}: {self.measured} ({self.result})'


class PunchItem(models.Model):
    """A construction defect / discrepancy logged in the field and tracked to
    resolution (punch list)."""

    PREFIX = 'PUN'
    SOURCE_WEB = 'web'
    SOURCE_FIELD = 'field'
    SOURCE_CHOICES = [(SOURCE_WEB, 'ERP Web'), (SOURCE_FIELD, 'Field Portal')]

    DISC_CIVIL = 'civil'
    DISC_MECH = 'mechanical'
    DISC_ELEC = 'electrical'
    DISC_SAFETY = 'safety'
    DISC_OTHER = 'other'
    DISCIPLINE_CHOICES = [
        (DISC_CIVIL, 'Civil'), (DISC_MECH, 'Mechanical'), (DISC_ELEC, 'Electrical'),
        (DISC_SAFETY, 'Safety'), (DISC_OTHER, 'Other'),
    ]

    SEV_LOW = 'low'
    SEV_MEDIUM = 'medium'
    SEV_HIGH = 'high'
    SEV_CRITICAL = 'critical'
    SEVERITY_CHOICES = [
        (SEV_LOW, 'Low'), (SEV_MEDIUM, 'Medium'), (SEV_HIGH, 'High'), (SEV_CRITICAL, 'Critical'),
    ]

    STATUS_OPEN = 'open'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_RESOLVED = 'resolved'
    STATUS_VERIFIED = 'verified'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'), (STATUS_IN_PROGRESS, 'In progress'),
        (STATUS_RESOLVED, 'Resolved'), (STATUS_VERIFIED, 'Verified'), (STATUS_CLOSED, 'Closed'),
    ]

    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='punch_items')
    stage = models.ForeignKey(ProjectStage, on_delete=models.SET_NULL, null=True, blank=True, related_name='punch_items')
    work_package = models.ForeignKey(ProjectWorkPackage, on_delete=models.SET_NULL, null=True, blank=True, related_name='punch_items')
    vendor = models.ForeignKey('core.Vendor', on_delete=models.SET_NULL, null=True, blank=True, related_name='punch_items')

    code = models.CharField(max_length=40, unique=True, blank=True)
    site_name = models.CharField(max_length=200)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    discipline = models.CharField(max_length=20, choices=DISCIPLINE_CHOICES, default=DISC_OTHER)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default=SEV_MEDIUM)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_OPEN)

    raised_on = models.DateField()
    target_date = models.DateField(null=True, blank=True)
    resolved_on = models.DateField(null=True, blank=True)

    photo = models.FileField(upload_to='punch_items/', null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='raised_punch_items')
    raiser_name = models.CharField(max_length=150, blank=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=SOURCE_WEB)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_punch_item'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.code or "PUN?"} · {self.title} ({self.status})'

    @property
    def is_open(self):
        return self.status in (self.STATUS_OPEN, self.STATUS_IN_PROGRESS)

    def save(self, *args, **kwargs):
        if self.work_package_id and not self.vendor_id:
            self.vendor_id = self.work_package.assigned_vendor_id
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating and not self.code:
            self.code = f'{self.PREFIX}{str(self.pk).zfill(4)}'
            super().save(update_fields=['code'])

