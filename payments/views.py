import json
import traceback

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .gateway import (
    GatewayError,
    is_enabled,
    public_config,
    verify_webhook_signature,
)
from .models import VendorRegistrationPayment
from .services import create_registration_payment_link


def _can_register_vendors(user):
    """Mirror the gate used by core.register_vendor so the fee endpoints are
    only reachable by staff who could complete the registration anyway."""
    from permissions.utils import get_user_role, is_admin_like
    from permissions.models import RolePermission

    if not user.is_authenticated:
        return False
    if is_admin_like(user):
        return True
    role = get_user_role(user)
    if not role:
        return False
    perm = RolePermission.objects.filter(role=role, module_key='vendors').first()
    return bool(perm and perm.can_create)


def vendor_registration_payment_config(request):
    """GET → non-secret gateway config for the registration payment step."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)
    return JsonResponse(public_config())


@require_POST
def send_vendor_registration_link(request):
    """POST → create a Razorpay Payment Link for the onboarding fee and email
    it to the vendor. Persists a VendorRegistrationPayment(status=created) and
    returns the receipt + hosted URL so staff can also copy/resend it."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)
    if not _can_register_vendors(request.user):
        return JsonResponse({'error': 'You do not have permission to register vendors.'}, status=403)
    if not is_enabled():
        return JsonResponse({'error': 'Payment gateway is not configured.'}, status=503)

    try:
        body = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        body = {}

    company_name = (body.get('companyName') or '').strip()
    contact_name = (body.get('contactPerson') or '').strip()
    contact_email = (body.get('emailId') or '').strip()
    contact_phone = (body.get('mobileNumber') or '').strip()

    if not contact_email:
        return JsonResponse({'error': "The vendor's email is required to send a payment link."}, status=400)

    try:
        payment = create_registration_payment_link(
            company_name=company_name,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
        )
    except GatewayError as exc:
        return JsonResponse({'error': str(exc)}, status=502)

    return JsonResponse({
        'receipt': payment.receipt,
        'payment_link_url': payment.payment_link_url,
        'sent_to': contact_email,
    })


@csrf_exempt
@require_POST
def razorpay_webhook(request):
    """Razorpay server-to-server webhook. This is the source of truth for the
    onboarding fee: the vendor pays from the emailed link, so `payment_link.paid`
    (with `payment.captured` as a fallback) is what flips our record to paid."""
    signature = request.headers.get('X-Razorpay-Signature', '')
    if not verify_webhook_signature(request.body, signature):
        return JsonResponse({'error': 'Invalid signature.'}, status=400)

    try:
        event = json.loads(request.body or '{}')
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Invalid payload.'}, status=400)

    try:
        event_type = event.get('event')
        payload = event.get('payload', {})

        payment = None
        payment_id = ''

        if event_type == 'payment_link.paid':
            link_entity = payload.get('payment_link', {}).get('entity', {})
            reference_id = link_entity.get('reference_id', '')
            link_id = link_entity.get('id', '')
            payment_id = payload.get('payment', {}).get('entity', {}).get('id', '')
            payment = (
                VendorRegistrationPayment.objects.filter(receipt=reference_id).first()
                or VendorRegistrationPayment.objects.filter(razorpay_payment_link_id=link_id).first()
            )
        elif event_type == 'payment.captured':
            entity = payload.get('payment', {}).get('entity', {})
            payment_id = entity.get('id', '')
            link_id = entity.get('payment_link_id', '')
            if link_id:
                payment = VendorRegistrationPayment.objects.filter(razorpay_payment_link_id=link_id).first()

        # Idempotent: only advance a record that hasn't already been paid/linked.
        if payment and payment.status in (VendorRegistrationPayment.STATUS_CREATED,
                                          VendorRegistrationPayment.STATUS_FAILED):
            payment.razorpay_payment_id = payment_id or payment.razorpay_payment_id
            payment.status = (
                VendorRegistrationPayment.STATUS_LINKED
                if payment.vendor_id
                else VendorRegistrationPayment.STATUS_PAID
            )
            payment.paid_at = timezone.now()
            payment.save(update_fields=['razorpay_payment_id', 'status', 'paid_at', 'updated_at'])

            # The fee is what "finally registers" the vendor: promote the
            # pending vendor to active now that payment has cleared.
            if payment.vendor_id:
                from core.models import Vendor
                Vendor.objects.filter(pk=payment.vendor_id).update(status='active')
    except Exception:
        traceback.print_exc()
        # Always 200 so Razorpay doesn't hammer retries on our own bug.

    return JsonResponse({'status': 'ok'})


# --- Vendor payments list (real data for the Payments section) -------------
from permissions.utils import require_authenticated  # noqa: E402
from .models import VendorPayment  # noqa: E402


def vendor_payments_list(request):
    """GET → all vendor payments (includes milestone-posted work payments)."""
    redirect = require_authenticated(request)
    if redirect:
        return redirect
    qs = VendorPayment.objects.select_related('po', 'vendor').order_by('-created_at', '-id')
    status = request.GET.get('status')
    if status:
        qs = qs.filter(payment_status=status)
    rows = [{
        'id': p.id,
        'reference': p.payment_reference_code,
        'is_milestone': (p.payment_reference_code or '').startswith('MS'),
        'po_number': p.po.po_number if p.po_id else '',
        'vendor': (p.vendor.company_name or p.vendor.vendor_name) if p.vendor_id else '',
        'stage': p.get_payment_stage_display() if p.payment_stage else '',
        'amount': str(p.payment_amount),
        'tds': str(p.tds_deduction),
        'net': str(p.net_payable),
        'status': p.payment_status,
        'status_display': p.get_payment_status_display(),
        'paid_date': p.payment_paid_date.isoformat() if p.payment_paid_date else '',
        'due_date': p.payment_due_date.isoformat() if p.payment_due_date else '',
        'remarks': p.remarks,
    } for p in qs]
    totals = {
        'paid': str(sum((p.net_payable for p in qs if p.payment_status == 'paid'), __import__('decimal').Decimal('0'))),
        'count': qs.count(),
    }
    return JsonResponse({'payments': rows, 'totals': totals})
