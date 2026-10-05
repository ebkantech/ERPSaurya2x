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
