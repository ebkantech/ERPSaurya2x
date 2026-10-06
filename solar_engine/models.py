from decimal import Decimal

from django.conf import settings
from django.db import models

from . import constants as C


# =========================================================================
# Template layer — reusable, engineer-editable configuration
# =========================================================================
class ComponentSpecSet(models.Model):
    """Engineering inputs that drive the sizing calculator. The default row
    carries the 5 MW study-book values and is editable."""

    name = models.CharField(max_length=150, unique=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    module_wp = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('550'))
    modules_per_string = models.PositiveIntegerField(default=26)
    inverter_kw = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('125'))
    transformer_mva = models.DecimalField(max_digits=8, decimal_places=3, default=Decimal('2.5'))
    inverters_per_acdb = models.PositiveIntegerField(default=10)
    lv_voltage = models.PositiveIntegerField(default=415, help_text='Low-voltage AC, volts')
    ht_voltage_kv = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('11'))
    target_dc_ac_ratio = models.DecimalField(max_digits=5, decimal_places=3, default=Decimal('1.200'))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_component_spec_set'
        ordering = ['-is_default', 'name']

    def __str__(self):
        return self.name


class WbsTemplate(models.Model):
    name = models.CharField(max_length=150)
    project_type = models.CharField(max_length=20, choices=C.PROJECT_TYPE_CHOICES)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_wbs_template'
        ordering = ['project_type', '-is_default', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_project_type_display()})'


class WbsStage(models.Model):
    template = models.ForeignKey(WbsTemplate, on_delete=models.CASCADE, related_name='stages')
    order = models.PositiveIntegerField(default=0)
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_parallel = models.BooleanField(default=False)

    class Meta:
        db_table = 'solar_wbs_stage'
        ordering = ['template', 'order', 'id']

    def __str__(self):
        return f'{self.code} — {self.name}'


class WbsWorkPackage(models.Model):
    stage = models.ForeignKey(WbsStage, on_delete=models.CASCADE, related_name='work_packages')
    order = models.PositiveIntegerField(default=0)
    name = models.CharField(max_length=200)
    discipline = models.CharField(max_length=80, blank=True)
    core_workpackage = models.ForeignKey(
        'core.WorkPackage', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_wbs_packages',
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'solar_wbs_work_package'
        ordering = ['stage', 'order', 'id']

    def __str__(self):
        return self.name


class BoqTemplate(models.Model):
    name = models.CharField(max_length=150)
    project_type = models.CharField(max_length=20, choices=C.PROJECT_TYPE_CHOICES)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_boq_template'
        ordering = ['project_type', '-is_default', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_project_type_display()})'


class BoqSection(models.Model):
    template = models.ForeignKey(BoqTemplate, on_delete=models.CASCADE, related_name='sections')
    order = models.PositiveIntegerField(default=0)
    name = models.CharField(max_length=150)
    # Material sections feed the auto-drafted procurement quotation on lock.
    is_material = models.BooleanField(default=True)

    class Meta:
        db_table = 'solar_boq_section'
        ordering = ['template', 'order', 'id']

    def __str__(self):
        return self.name


class BoqTemplateItem(models.Model):
    section = models.ForeignKey(BoqSection, on_delete=models.CASCADE, related_name='items')
    order = models.PositiveIntegerField(default=0)
    description = models.CharField(max_length=255)
    specification = models.TextField(blank=True)
    unit = models.CharField(max_length=40, default='Nos')
    quantity_basis = models.CharField(max_length=20, choices=C.QUANTITY_BASIS_CHOICES, default=C.BASIS_FIXED)
    quantity_factor = models.DecimalField(max_digits=16, decimal_places=4, default=Decimal('1'))
    default_material_rate = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    default_labour_rate = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    wbs_stage_code = models.CharField(max_length=30, blank=True)

    class Meta:
        db_table = 'solar_boq_template_item'
        ordering = ['section', 'order', 'id']

    def __str__(self):
        return self.description


# =========================================================================
# Project-instance layer — generated per project, then editable
# =========================================================================
class ProjectBuild(models.Model):
    project = models.OneToOneField('core.ProjectMaster', on_delete=models.CASCADE, related_name='build')
    project_type = models.CharField(max_length=20, choices=C.PROJECT_TYPE_CHOICES)
    ac_capacity_mw = models.DecimalField(max_digits=10, decimal_places=3)
    foundation_type = models.CharField(max_length=30, choices=C.FOUNDATION_CHOICES, blank=True)

    spec_set = models.ForeignKey(ComponentSpecSet, on_delete=models.PROTECT, related_name='builds')
    wbs_template = models.ForeignKey(WbsTemplate, on_delete=models.PROTECT, related_name='builds')
    boq_template = models.ForeignKey(BoqTemplate, on_delete=models.PROTECT, related_name='builds')

    status = models.CharField(max_length=20, choices=C.BUILD_STATUS_CHOICES, default=C.BUILD_DRAFT)
    generated_quotation = models.ForeignKey(
        'purchase_orders.Quotation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_builds',
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_builds_created',
    )
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_builds_locked',
    )
    locked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_project_build'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'Build for {self.project} ({self.get_project_type_display()})'

    @property
    def is_editable(self):
        return self.status == C.BUILD_DRAFT

    @property
    def boq_totals(self):
        material = labour = Decimal('0')
        for item in self.boq_items.all():
            material += item.material_amount
            labour += item.labour_amount
        return {
            'material_amount': material,
            'labour_amount': labour,
            'total_amount': material + labour,
        }

    @property
    def progress_percent(self):
        stages = list(self.stages.exclude(status=C.STATUS_SKIPPED))
        if not stages:
            return 0
        done = sum(1 for s in stages if s.status == C.STATUS_COMPLETED)
        return round(done * 100 / len(stages))


class ProjectSizing(models.Model):
    build = models.OneToOneField(ProjectBuild, on_delete=models.CASCADE, related_name='sizing')
    dc_capacity_mwp = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal('0'))
    module_count = models.PositiveIntegerField(default=0)
    string_count = models.PositiveIntegerField(default=0)
    inverter_count = models.PositiveIntegerField(default=0)
    transformer_count = models.PositiveIntegerField(default=0)
    acdb_count = models.PositiveIntegerField(default=0)
    dc_ac_ratio = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal('0'))

    class Meta:
        db_table = 'solar_project_sizing'

    def __str__(self):
        return f'Sizing: {self.dc_capacity_mwp} MWp / {self.inverter_count} inverters'


class ProjectStage(models.Model):
    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='stages')
    order = models.PositiveIntegerField(default=0)
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_parallel = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=C.EXECUTION_STATUS_CHOICES, default=C.STATUS_PENDING)
    planned_start = models.DateField(null=True, blank=True)
    planned_end = models.DateField(null=True, blank=True)
    actual_start = models.DateField(null=True, blank=True)
    actual_end = models.DateField(null=True, blank=True)
    source_stage = models.ForeignKey(WbsStage, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'solar_project_stage'
        ordering = ['build', 'order', 'id']

    def __str__(self):
        return f'{self.code} — {self.name}'


class ProjectWorkPackage(models.Model):
    stage = models.ForeignKey(ProjectStage, on_delete=models.CASCADE, related_name='work_packages')
    order = models.PositiveIntegerField(default=0)
    name = models.CharField(max_length=200)
    discipline = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, choices=C.EXECUTION_STATUS_CHOICES, default=C.STATUS_PENDING)
    allocation = models.ForeignKey(
        'core.ProjectWorkAllocation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_work_packages',
    )
    # Work allocation: the vendor responsible for this work package.
    assigned_vendor = models.ForeignKey(
        'core.Vendor', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_work_packages',
    )
    notes = models.TextField(blank=True)
    source_wp = models.ForeignKey(WbsWorkPackage, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'solar_project_work_package'
        ordering = ['stage', 'order', 'id']

    def __str__(self):
        return self.name


class ProjectBoqItem(models.Model):
    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='boq_items')
    section_name = models.CharField(max_length=150)
    section_order = models.PositiveIntegerField(default=0)
    order = models.PositiveIntegerField(default=0)
    description = models.CharField(max_length=255)
    specification = models.TextField(blank=True)
    unit = models.CharField(max_length=40, default='Nos')
    quantity = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    material_rate = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    labour_rate = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    is_material = models.BooleanField(default=True)
    source_item = models.ForeignKey(BoqTemplateItem, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'solar_project_boq_item'
        ordering = ['build', 'section_order', 'order', 'id']

    def __str__(self):
        return self.description

    @property
    def material_amount(self):
        return (self.quantity or Decimal('0')) * (self.material_rate or Decimal('0'))

    @property
    def labour_amount(self):
        return (self.quantity or Decimal('0')) * (self.labour_rate or Decimal('0'))

    @property
    def total_amount(self):
        return self.material_amount + self.labour_amount

class SiteProgressEntry(models.Model):
    """A single daily field-progress record: for a project build, on a date,
    at a named site, against a WBS work package (which carries the vendor
    scope). Submitted either from the ERP 'Daily Work Progress' tab or from
    the FieldTracker field portal."""

    SOURCE_WEB = 'web'
    SOURCE_FIELD = 'field'
    SOURCE_CHOICES = [(SOURCE_WEB, 'ERP Web'), (SOURCE_FIELD, 'Field Portal')]

    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='progress_entries')
    site_name = models.CharField(max_length=200)
    stage = models.ForeignKey(ProjectStage, on_delete=models.SET_NULL, null=True, blank=True, related_name='progress_entries')
    work_package = models.ForeignKey(ProjectWorkPackage, on_delete=models.SET_NULL, null=True, blank=True, related_name='progress_entries')
    vendor = models.ForeignKey('core.Vendor', on_delete=models.SET_NULL, null=True, blank=True, related_name='site_progress_entries')

    progress_date = models.DateField()
    progress_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    quantity = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    unit = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=20, choices=C.EXECUTION_STATUS_CHOICES, default=C.STATUS_IN_PROGRESS)
    note = models.TextField(blank=True)
    photo = models.FileField(upload_to='field_progress/', null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='site_progress_reports',
    )
    reporter_name = models.CharField(max_length=150, blank=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=SOURCE_WEB)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_site_progress_entry'
        ordering = ['-progress_date', '-created_at', '-id']

    def __str__(self):
        return f'{self.site_name} @ {self.progress_date} ({self.progress_percent}%)'

    def save(self, *args, **kwargs):
        # Denormalise the vendor from the work package's allocation when absent.
        if self.work_package_id and not self.vendor_id:
            self.vendor_id = self.work_package.assigned_vendor_id
        super().save(*args, **kwargs)


class BillingMilestone(models.Model):
    """A payable milestone for a vendor against a specific work package.
    Eligibility auto-advances with work progress; approval posts a
    VendorPayment against a linked purchase order."""

    TRIGGER_MANUAL = 'manual'
    TRIGGER_PROGRESS = 'progress_threshold'
    TRIGGER_WP_DONE = 'wp_completion'
    TRIGGER_HANDOVER = 'handover_certificate'
    TRIGGER_CHOICES = [
        (TRIGGER_MANUAL, 'Manual'),
        (TRIGGER_PROGRESS, 'Progress reaches %'),
        (TRIGGER_WP_DONE, 'Work package completed'),
        (TRIGGER_HANDOVER, 'On handover certificate (retention release)'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_ELIGIBLE = 'eligible'
    STATUS_INVOICED = 'invoiced'
    STATUS_APPROVED = 'approved'
    STATUS_PAID = 'paid'
    STATUS_HOLD = 'on_hold'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_ELIGIBLE, 'Eligible'),
        (STATUS_INVOICED, 'Invoiced'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_PAID, 'Paid'),
        (STATUS_HOLD, 'On Hold'),
    ]

    # Payment stages mirror payments.VendorPayment for a clean hand-off.
    STAGE_CHOICES = [
        ('advance', 'Advance'),
        ('against_dispatch', 'Against Dispatch'),
        ('against_delivery', 'Against Delivery'),
        ('after_installation', 'After Installation'),
        ('retention', 'Retention'),
        ('final_payment', 'Final Payment'),
    ]

    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='billing_milestones')
    work_package = models.ForeignKey(ProjectWorkPackage, on_delete=models.CASCADE, related_name='billing_milestones')
    vendor = models.ForeignKey('core.Vendor', on_delete=models.SET_NULL, null=True, blank=True, related_name='billing_milestones')
    purchase_order = models.ForeignKey(
        'purchase_orders.PurchaseOrder', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='billing_milestones',
    )

    name = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_CHOICES, default=TRIGGER_WP_DONE)
    trigger_progress_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('100'))
    amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    retention_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    payment_stage = models.CharField(max_length=30, choices=STAGE_CHOICES, default='after_installation')

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    eligible_at = models.DateTimeField(null=True, blank=True)
    invoiced_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    vendor_payment = models.ForeignKey(
        'payments.VendorPayment', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solar_milestones',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_billing_milestone'
        ordering = ['build', 'order', 'id']

    def __str__(self):
        return f'{self.name} ({self.get_status_display()})'

    @property
    def retention_amount(self):
        return ((self.amount or Decimal('0')) * (self.retention_percent or Decimal('0')) / Decimal('100')).quantize(Decimal('0.01'))

    @property
    def net_payable(self):
        return (self.amount or Decimal('0')) - self.retention_amount

    def save(self, *args, **kwargs):
        if self.work_package_id and not self.vendor_id:
            self.vendor_id = self.work_package.assigned_vendor_id
        super().save(*args, **kwargs)


class HandoverCertificate(models.Model):
    PREFIX = 'HOC'
    STATUS_DRAFT = 'draft'
    STATUS_ISSUED = 'issued'
    STATUS_CHOICES = [(STATUS_DRAFT, 'Draft'), (STATUS_ISSUED, 'Issued')]

    build = models.ForeignKey(ProjectBuild, on_delete=models.CASCADE, related_name='handover_certificates')
    vendor = models.ForeignKey('core.Vendor', on_delete=models.SET_NULL, null=True, blank=True, related_name='handover_certificates')
    certificate_number = models.CharField(max_length=40, unique=True, blank=True)
    site_name = models.CharField(max_length=200, blank=True)
    scope_description = models.TextField(blank=True)
    issued_date = models.DateField(null=True, blank=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='issued_handover_certs')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    document = models.FileField(upload_to='handover_certificates/', null=True, blank=True)
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_handover_certificate'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.certificate_number or f'Handover #{self.pk}'

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating and not self.certificate_number:
            self.certificate_number = f'{self.PREFIX}{str(self.pk).zfill(4)}'
            super().save(update_fields=['certificate_number'])


# --- Quality Assurance & Testing (Phase 6) --------------------------------
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


# --- Budget vs Actual / Financial closeout (Phase 2 & 7) ------------------
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
