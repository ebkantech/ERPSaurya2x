from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

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

