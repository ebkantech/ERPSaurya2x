from django.contrib import admin

from .models import VendorPayment, VendorRegistrationPayment


@admin.register(VendorPayment)
class VendorPaymentAdmin(admin.ModelAdmin):
    list_display = ('payment_reference_code', 'po', 'vendor', 'payment_stage', 'net_payable', 'payment_status')
    list_filter = ('payment_stage', 'payment_status', 'payment_mode')
    search_fields = ('payment_reference_code', 'po__po_number', 'vendor__company_name', 'bank_transaction_id')


@admin.register(VendorRegistrationPayment)
class VendorRegistrationPaymentAdmin(admin.ModelAdmin):
    list_display = ('receipt', 'company_name', 'contact_email', 'amount', 'currency', 'status', 'vendor', 'created_at')
    list_filter = ('status', 'currency')
    search_fields = ('receipt', 'company_name', 'contact_email', 'razorpay_order_id', 'razorpay_payment_id')
    readonly_fields = ('created_at', 'updated_at', 'paid_at')
