from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.utils import timezone


class PurchaseOrder(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_APPROVED = 'approved'
    STATUS_PARTIALLY_DELIVERED = 'partially_delivered'
    STATUS_FULLY_DELIVERED = 'fully_delivered'
    STATUS_PARTIALLY_PAID = 'partially_paid'
    STATUS_FULLY_PAID = 'fully_paid'
    STATUS_CLOSED = 'closed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_PARTIALLY_DELIVERED, 'Partially Delivered'),
        (STATUS_FULLY_DELIVERED, 'Fully Delivered'),
        (STATUS_PARTIALLY_PAID, 'Partially Paid'),
        (STATUS_FULLY_PAID, 'Fully Paid'),
        (STATUS_CLOSED, 'Closed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    DELIVERY_PENDING = 'pending'
    DELIVERY_PARTIAL = 'partially_delivered'
    DELIVERY_FULL = 'fully_delivered'
    DELIVERY_STATUS_CHOICES = [
        (DELIVERY_PENDING, 'Pending'),
        (DELIVERY_PARTIAL, 'Partially Delivered'),
        (DELIVERY_FULL, 'Fully Delivered'),
    ]

    PAYMENT_PENDING = 'pending'
    PAYMENT_PARTIAL = 'partially_paid'
    PAYMENT_FULL = 'fully_paid'
    PAYMENT_STATUS_CHOICES = [
        (PAYMENT_PENDING, 'Pending'),
        (PAYMENT_PARTIAL, 'Partially Paid'),
        (PAYMENT_FULL, 'Fully Paid'),
    ]

    DIVISION_CHOICES = [
        ('solar', 'Solar'),
        ('biogas', 'Biogas'),
        ('infrastructure', 'Infrastructure'),
        ('pharma', 'Pharma'),
        ('other', 'Other'),
    ]

    po_number = models.CharField(max_length=80, unique=True)
    po_date = models.DateField(default=timezone.now)
    vendor = models.ForeignKey('core.Vendor', on_delete=models.PROTECT, related_name='purchase_orders')
    project = models.ForeignKey('core.ProjectMaster', on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_orders')
    vendor_tracking_id = models.CharField(max_length=50, blank=True)
    vendor_tracking_name = models.CharField(max_length=200, blank=True)
    business_division = models.CharField(max_length=30, choices=DIVISION_CHOICES, default='solar')
    project_site_name = models.CharField(max_length=255)
    project_location = models.CharField(max_length=255, blank=True)
    delivery_address = models.TextField(blank=True)
    dispatch_origin = models.CharField(max_length=255, blank=True)
    department = models.CharField(max_length=120, blank=True)
    total_po_value = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0.00'))
    paid_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0.00'))
    outstanding_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0.00'))
    payment_terms = models.TextField(blank=True)
    delivery_terms = models.TextField(blank=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_purchase_orders',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_purchase_orders',
    )
    quotation_document = models.FileField(upload_to='po_documents/quotations/', blank=True, null=True)
    po_copy = models.FileField(upload_to='po_documents/po_copies/', blank=True, null=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    delivery_status_summary = models.CharField(
        max_length=30,
        choices=DELIVERY_STATUS_CHOICES,
        default=DELIVERY_PENDING,
    )
    payment_status_summary = models.CharField(
        max_length=30,
        choices=PAYMENT_STATUS_CHOICES,
        default=PAYMENT_PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-po_date', '-created_at']

    def __str__(self):
        return self.po_number

    def save(self, *args, **kwargs):
        if self.vendor_id:
            self.vendor_tracking_id = self.vendor.vendor_id or ''
            self.vendor_tracking_name = self.vendor.vendor_name or self.vendor.company_name or ''
        super().save(*args, **kwargs)

    def refresh_progress(self, save=True):
        item_totals = self.items.aggregate(
            ordered=Sum('ordered_quantity'),
            delivered=Sum('delivered_quantity'),
            item_total=Sum('total_amount'),
        )
        ordered_qty = item_totals['ordered'] or Decimal('0.00')
        delivered_qty = item_totals['delivered'] or Decimal('0.00')
        item_total = item_totals['item_total'] or Decimal('0.00')

        payment_totals = self.payments.exclude(payment_status='rejected').aggregate(
            paid=Sum('net_payable'),
        )
        paid_amount = payment_totals['paid'] or Decimal('0.00')

        self.total_po_value = item_total or self.total_po_value
        self.paid_amount = paid_amount
        self.outstanding_amount = max((self.total_po_value or Decimal('0.00')) - paid_amount, Decimal('0.00'))

        if ordered_qty <= 0 or delivered_qty <= 0:
            self.delivery_status_summary = self.DELIVERY_PENDING
        elif delivered_qty < ordered_qty:
            self.delivery_status_summary = self.DELIVERY_PARTIAL
        else:
            self.delivery_status_summary = self.DELIVERY_FULL

        if paid_amount <= 0:
            self.payment_status_summary = self.PAYMENT_PENDING
        elif self.total_po_value and paid_amount < self.total_po_value:
            self.payment_status_summary = self.PAYMENT_PARTIAL
        else:
            self.payment_status_summary = self.PAYMENT_FULL

        if self.status != self.STATUS_CANCELLED:
            if self.delivery_status_summary == self.DELIVERY_FULL and self.payment_status_summary == self.PAYMENT_FULL:
                self.status = self.STATUS_CLOSED
            elif self.delivery_status_summary == self.DELIVERY_FULL:
                self.status = self.STATUS_FULLY_DELIVERED
            elif self.delivery_status_summary == self.DELIVERY_PARTIAL:
                self.status = self.STATUS_PARTIALLY_DELIVERED
            elif self.payment_status_summary == self.PAYMENT_FULL:
                self.status = self.STATUS_FULLY_PAID
            elif self.payment_status_summary == self.PAYMENT_PARTIAL:
                self.status = self.STATUS_PARTIALLY_PAID
            elif self.approved_by or self.status == self.STATUS_APPROVED:
                self.status = self.STATUS_APPROVED
            else:
                self.status = self.STATUS_DRAFT

        if save:
            self.save(
                update_fields=[
                    'total_po_value',
                    'paid_amount',
                    'outstanding_amount',
                    'delivery_status_summary',
                    'payment_status_summary',
                    'status',
                    'updated_at',
                ]
            )


class PurchaseOrderItem(models.Model):
    ITEM_STATUS_PENDING = 'pending'
    ITEM_STATUS_PARTIAL = 'partially_delivered'
    ITEM_STATUS_FULL = 'fully_delivered'
    ITEM_STATUS_REJECTED = 'rejected'
    ITEM_STATUS_CHOICES = [
        (ITEM_STATUS_PENDING, 'Pending'),
        (ITEM_STATUS_PARTIAL, 'Partially Delivered'),
        (ITEM_STATUS_FULL, 'Fully Delivered'),
        (ITEM_STATUS_REJECTED, 'Rejected'),
    ]

    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    material = models.ForeignKey(
        'core.MaterialMaster',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='po_items',
    )
    material_category = models.CharField(max_length=120)
    material_name = models.CharField(max_length=255)
    specification = models.TextField(blank=True)
    brand = models.CharField(max_length=120, blank=True)
    model = models.CharField(max_length=120, blank=True)
    unit = models.CharField(max_length=50)
    ordered_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    unit_rate = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0.00'))
    delivered_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    pending_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    item_status = models.CharField(max_length=30, choices=ITEM_STATUS_CHOICES, default=ITEM_STATUS_PENDING)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.po.po_number} - {self.material_name}'

    def clean(self):
        if self.ordered_quantity < 0:
            raise ValidationError('Ordered quantity cannot be negative.')
        if self.delivered_quantity > self.ordered_quantity:
            raise ValidationError('Delivered quantity cannot exceed ordered quantity.')

    def save(self, *args, **kwargs):
        subtotal = (self.ordered_quantity or Decimal('0.00')) * (self.unit_rate or Decimal('0.00'))
        gst_multiplier = Decimal('1.00') + ((self.gst_percentage or Decimal('0.00')) / Decimal('100.00'))
        self.total_amount = (subtotal * gst_multiplier).quantize(Decimal('0.01'))
        self.pending_quantity = max((self.ordered_quantity or Decimal('0.00')) - (self.delivered_quantity or Decimal('0.00')), Decimal('0.00'))
        if self.delivered_quantity <= 0:
            self.item_status = self.ITEM_STATUS_PENDING
        elif self.pending_quantity > 0:
            self.item_status = self.ITEM_STATUS_PARTIAL
        else:
            self.item_status = self.ITEM_STATUS_FULL
        self.full_clean()
        super().save(*args, **kwargs)
        self.po.refresh_progress()

    def update_delivery_totals(self, save=True):
        delivered_total = self.deliveries.exclude(delivery_status='rejected').aggregate(
            total=Sum('delivered_quantity')
        )['total'] or Decimal('0.00')
        self.delivered_quantity = delivered_total
        self.pending_quantity = max((self.ordered_quantity or Decimal('0.00')) - delivered_total, Decimal('0.00'))
        if delivered_total <= 0:
            self.item_status = self.ITEM_STATUS_PENDING
        elif self.pending_quantity > 0:
            self.item_status = self.ITEM_STATUS_PARTIAL
        else:
            self.item_status = self.ITEM_STATUS_FULL
        if save:
            self.save(update_fields=['delivered_quantity', 'pending_quantity', 'item_status', 'total_amount'])


class PurchaseOrderReferenceCode(models.Model):
    REF_VENDOR = 'vendor_reference'
    REF_TRANSPORT = 'transport_reference'
    REF_INVOICE = 'invoice_reference'
    REF_PROJECT = 'project_reference'
    REF_PAYMENT = 'payment_reference'
    REF_DISPATCH = 'dispatch_reference'
    REFERENCE_TYPE_CHOICES = [
        (REF_VENDOR, 'Vendor Reference'),
        (REF_TRANSPORT, 'Transport Reference'),
        (REF_INVOICE, 'Invoice Reference'),
        (REF_PROJECT, 'Project Reference'),
        (REF_PAYMENT, 'Payment Reference'),
        (REF_DISPATCH, 'Dispatch Reference'),
    ]

    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='reference_codes')
    reference_code = models.CharField(max_length=120)
    reference_type = models.CharField(max_length=40, choices=REFERENCE_TYPE_CHOICES)
    description = models.TextField(blank=True)
    date = models.DateField(default=timezone.now)
    uploaded_document = models.FileField(upload_to='po_documents/reference_codes/', blank=True, null=True)

    class Meta:
        unique_together = ('po', 'reference_code')
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.po.po_number} - {self.reference_code}'


class PurchaseOrderActivityLog(models.Model):
    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='activity_logs')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_order_activity_logs',
    )
    action = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    metadata_json = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.po.po_number} - {self.action}'


class Quotation(models.Model):
    QUOTATION_PREFIX = 'QTN'

    STATUS_DRAFT = 'draft'
    STATUS_VERIFIED = 'verified'
    STATUS_CONVERTED = 'converted'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_VERIFIED, 'Verified'),
        (STATUS_CONVERTED, 'Converted to PO'),
    ]

    quotation_number = models.CharField(max_length=50, unique=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)

    client_name = models.CharField(max_length=255, blank=True)
    client_address = models.TextField(blank=True)
    client_mobile = models.CharField(max_length=20, blank=True)

    sender_name = models.CharField(max_length=255, blank=True)
    sender_address = models.TextField(blank=True)
    sender_mobile = models.CharField(max_length=20, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quotations',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    purchase_order = models.OneToOneField(
        PurchaseOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_quotation',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return self.quotation_number or f'Quotation #{self.pk}'

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if creating and not self.quotation_number:
            self.quotation_number = f'{self.QUOTATION_PREFIX}{str(self.pk).zfill(4)}'
            super().save(update_fields=['quotation_number'])

    @property
    def is_locked(self):
        return self.status == self.STATUS_CONVERTED


class QuotationItem(models.Model):
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name='items')
    material_name = models.CharField(max_length=255)
    unit = models.CharField(max_length=100)
    quantity = models.PositiveIntegerField()

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.quotation.quotation_number} - {self.material_name}'
