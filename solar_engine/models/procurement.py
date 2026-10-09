from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

from .build import ProjectWorkPackage, ProjectBoqItem

class WorkPackageBom(models.Model):
    """A bill-of-material line for a (usually free-issue) work package — the
    budgeted quantity of a material the company will issue to the vendor.
    Can be seeded from the build's BOQ material rows, or entered by the PM."""

    work_package = models.ForeignKey(
        ProjectWorkPackage, on_delete=models.CASCADE, related_name='bom_lines',
    )
    order = models.PositiveIntegerField(default=0)
    material_code = models.CharField(max_length=60, blank=True)
    material_name = models.CharField(max_length=200)
    specification = models.TextField(blank=True)
    unit = models.CharField(max_length=40, default='Nos')
    bom_quantity = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    rate = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    source_boq_item = models.ForeignKey(
        ProjectBoqItem, on_delete=models.SET_NULL, null=True, blank=True,
    )

    class Meta:
        db_table = 'solar_wp_bom'
        ordering = ['work_package', 'order', 'id']

    def __str__(self):
        return f'{self.material_name} ({self.bom_quantity} {self.unit})'

    # ---- running balances across all requisitions / issues for this line ----
    @property
    def requested_quantity(self):
        agg = self.requisition_lines.aggregate(s=models.Sum('quantity_requested'))
        return agg['s'] or Decimal('0')

    @property
    def issued_quantity(self):
        agg = self.issue_lines.aggregate(s=models.Sum('quantity_issued'))
        return agg['s'] or Decimal('0')

    @property
    def available_quantity(self):
        """BOM quantity still available to issue without breaching the BOM."""
        return (self.bom_quantity or Decimal('0')) - self.issued_quantity


class MaterialRequisition(models.Model):
    """A task-linked request for free-issue material. Raised against a work
    package (the 'task'); the requested quantities are validated against the
    work package's BOM balance before the store issues an MIS."""

    STATUS_DRAFT = 'draft'
    STATUS_SUBMITTED = 'submitted'
    STATUS_APPROVED = 'approved'
    STATUS_ISSUED = 'issued'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_ISSUED, 'Issued'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    requisition_no = models.CharField(max_length=40, unique=True)
    work_package = models.ForeignKey(
        ProjectWorkPackage, on_delete=models.CASCADE, related_name='requisitions',
    )
    vendor = models.ForeignKey(
        'core.Vendor', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='material_requisitions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SUBMITTED)
    needed_by = models.DateField(null=True, blank=True)
    note = models.TextField(blank=True)
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='material_requisitions',
    )
    raised_by_name = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_material_requisition'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.requisition_no


class MaterialRequisitionLine(models.Model):
    requisition = models.ForeignKey(
        MaterialRequisition, on_delete=models.CASCADE, related_name='lines',
    )
    bom_line = models.ForeignKey(
        WorkPackageBom, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='requisition_lines',
    )
    material_code = models.CharField(max_length=60, blank=True)
    material_name = models.CharField(max_length=200)
    unit = models.CharField(max_length=40, default='Nos')
    quantity_requested = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))

    class Meta:
        db_table = 'solar_material_requisition_line'
        ordering = ['id']

    def __str__(self):
        return f'{self.material_name} x {self.quantity_requested}'


class MaterialIssueSlip(models.Model):
    """MIS — the store's record of material physically issued to the vendor
    for a free-issue work package. Issued quantities are validated against
    the BOM so cumulative issues never exceed the budgeted bill of material."""

    STATUS_ISSUED = 'issued'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_ISSUED, 'Issued'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged by vendor'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    mis_no = models.CharField(max_length=40, unique=True)
    work_package = models.ForeignKey(
        ProjectWorkPackage, on_delete=models.CASCADE, related_name='issue_slips',
    )
    requisition = models.ForeignKey(
        MaterialRequisition, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='issue_slips',
    )
    vendor = models.ForeignKey(
        'core.Vendor', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='material_issue_slips',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ISSUED)
    issued_on = models.DateField(null=True, blank=True)
    note = models.TextField(blank=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='material_issue_slips',
    )
    issued_by_name = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_material_issue_slip'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.mis_no


class MaterialIssueSlipLine(models.Model):
    issue_slip = models.ForeignKey(
        MaterialIssueSlip, on_delete=models.CASCADE, related_name='lines',
    )
    bom_line = models.ForeignKey(
        WorkPackageBom, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='issue_lines',
    )
    material_code = models.CharField(max_length=60, blank=True)
    material_name = models.CharField(max_length=200)
    unit = models.CharField(max_length=40, default='Nos')
    quantity_issued = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))

    class Meta:
        db_table = 'solar_material_issue_slip_line'
        ordering = ['id']

    def __str__(self):
        return f'{self.material_name} x {self.quantity_issued}'



# =========================================================================
# Goods Receipt Note (GRN) — inbound client-furnished material (FIM)
# The client supplies modules/inverters; a GRN records what arrived at the
# store/site (quantity, serial numbers, condition) before it can be
# free-issued to a vendor via an MIS. Serial numbers feed the as-built dossier.
# =========================================================================
class GoodsReceiptNote(models.Model):
    STATUS_RECEIVED = 'received'
    STATUS_VERIFIED = 'verified'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_RECEIVED, 'Received'), (STATUS_VERIFIED, 'Verified'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    grn_no = models.CharField(max_length=40, unique=True)
    project = models.ForeignKey('core.ProjectMaster', on_delete=models.CASCADE, related_name='goods_receipts')
    site = models.ForeignKey('ProjectSite', on_delete=models.SET_NULL, null=True, blank=True, related_name='goods_receipts')
    supplier = models.CharField(max_length=200, blank=True)        # client / OEM supplying the material
    consignment_ref = models.CharField(max_length=120, blank=True) # client challan / invoice no.
    received_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_RECEIVED)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='goods_receipts')
    received_by_name = models.CharField(max_length=150, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_goods_receipt_note'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.grn_no


class GoodsReceiptLine(models.Model):
    CONDITION_OK = 'ok'
    CONDITION_DAMAGED = 'damaged'
    CONDITION_SHORT = 'short'
    CONDITION_CHOICES = [
        (CONDITION_OK, 'OK'), (CONDITION_DAMAGED, 'Damaged'), (CONDITION_SHORT, 'Short supply'),
    ]

    grn = models.ForeignKey(GoodsReceiptNote, on_delete=models.CASCADE, related_name='lines')
    material_code = models.CharField(max_length=60, blank=True)
    material_name = models.CharField(max_length=200)
    unit = models.CharField(max_length=40, default='Nos')
    quantity_received = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    condition = models.CharField(max_length=20, choices=CONDITION_CHOICES, default=CONDITION_OK)
    serial_numbers = models.TextField(blank=True)   # one per line / comma-separated — for the as-built dossier
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'solar_goods_receipt_line'
        ordering = ['id']

    def __str__(self):
        return f'{self.material_name} x {self.quantity_received}'

    @property
    def serial_count(self):
        if not self.serial_numbers:
            return 0
        return len([s for s in self.serial_numbers.replace(',', '\n').splitlines() if s.strip()])
