"""Razorpay gateway helpers for the vendor onboarding fee.

Every entry point here degrades gracefully: if the `razorpay` package is not
installed, or the keys are not configured, or the fee is zero, the gateway is
simply reported as *disabled* and callers fall back to the pre-gateway
behaviour instead of raising. This keeps local dev and CI (which have no keys)
working exactly as before.
"""
from decimal import Decimal

from django.conf import settings


class GatewayError(Exception):
    """Raised for recoverable gateway failures we want surfaced as 4xx/5xx
    JSON rather than a 500 traceback."""


def is_enabled():
    """True only when the fee is on AND both keys are present AND the SDK is
    importable. When False, register_vendor must not require a payment."""
    if registration_fee() <= Decimal('0'):
        return False
    if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        return False
    try:
        import razorpay  # noqa: F401
    except ImportError:
        return False
    return True


def registration_fee():
    return Decimal(str(settings.VENDOR_REGISTRATION_FEE or 0))


def registration_currency():
    return settings.VENDOR_REGISTRATION_FEE_CURRENCY or 'INR'


def _client():
    import razorpay

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    client.set_app_details({'title': 'OmegaERP', 'version': '1.0'})
    return client


def public_config():
    """Non-secret config the frontend needs to render the payment step and
    open Razorpay Checkout. Never leak the key secret here."""
    fee = registration_fee()
    return {
        'enabled': is_enabled(),
        'key_id': settings.RAZORPAY_KEY_ID if is_enabled() else '',
        'amount': str(fee),
        'amount_display': f'{fee:,.2f}',
        'currency': registration_currency(),
    }


def create_payment_link(receipt, amount_in_paise, currency, customer=None,
                        description=None, notes=None, notify_email=True,
                        notify_sms=False, callback_url=None):
    """Create a Razorpay Payment Link the vendor can pay from. When
    notify_email is True Razorpay emails the hosted link to the customer for
    us. Returns the raw payment-link dict (contains `id`, `short_url`,
    `status`)."""
    payload = {
        'amount': amount_in_paise,
        'currency': currency,
        'accept_partial': False,
        'reference_id': receipt,
        'description': description or 'Vendor registration fee',
        'customer': customer or {},
        'notify': {'email': bool(notify_email), 'sms': bool(notify_sms)},
        'reminder_enable': True,
        'notes': notes or {},
    }
    if callback_url:
        payload['callback_url'] = callback_url
        payload['callback_method'] = 'get'
    try:
        client = _client()
        return client.payment_link.create(payload)
    except GatewayError:
        raise
    except Exception as exc:  # razorpay.errors.* and network failures
        raise GatewayError(f'Could not create payment link: {exc}') from exc


def verify_webhook_signature(body_bytes, signature):
    """Verify an inbound webhook using the configured webhook secret."""
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        return False
    try:
        client = _client()
        # razorpay expects the raw request body as a str.
        payload = body_bytes.decode('utf-8') if isinstance(body_bytes, (bytes, bytearray)) else body_bytes
        client.utility.verify_webhook_signature(payload, signature, secret)
        return True
    except Exception:
        return False
