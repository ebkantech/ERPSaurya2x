from django.urls import path

from . import views

app_name = 'payments'

urlpatterns = [
    path('vendor-payments/', views.vendor_payments_list, name='vendor-payments-list'),
    path(
        'vendor-registration/config/',
        views.vendor_registration_payment_config,
        name='vendor-registration-payment-config',
    ),
    path(
        'vendor-registration/send-link/',
        views.send_vendor_registration_link,
        name='vendor-registration-send-link',
    ),
    path(
        'vendor-registration/webhook/',
        views.razorpay_webhook,
        name='vendor-registration-webhook',
    ),
]
