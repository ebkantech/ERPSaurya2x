"""Shared helpers for the vendor onboarding fee, used by both the
`send-link` API endpoint and `core.register_vendor` so link creation lives in
one place."""
from django.utils import timezone

from . import gateway
from .models import VendorRegistrationPayment


def create_registration_payment_link(*, company_name, contact_name,
                                     contact_email, contact_phone='', vendor=None):
    """Create a VendorRegistrationPayment row + a Razorpay Payment Link and let
    Razorpay email it to the vendor. Returns the saved payment. Raises
    gateway.GatewayError if the gateway call fails."""
    payment = VendorRegistrationPayment(
        receipt=VendorRegistrationPayment.generate_receipt(),
        company_name=(company_name or '')[:200],
        contact_name=(contact_name or '')[:100],
        contact_email=(contact_email or '')[:254],
        amount=gateway.registration_fee(),
        currency=gateway.registration_currency(),
        vendor=vendor,
    )

    customer = {'name': (contact_name or company_name or ''), 'email': contact_email}
    if contact_phone:
        customer['contact'] = contact_phone

    link = gateway.create_payment_link(
        receipt=payment.receipt,
        amount_in_paise=payment.amount_in_paise,
        currency=payment.currency,
        customer=customer,
        description=f'Vendor registration fee — {company_name}'.strip(' —'),
        notes={'company_name': company_name, 'contact_email': contact_email},
        notify_email=True,
    )

    payment.razorpay_payment_link_id = link.get('id', '')
    payment.payment_link_url = link.get('short_url', '')
    payment.link_sent_at = timezone.now()
    payment.save()
    return payment
