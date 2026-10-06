"""Milestone billing & compliance: auto-eligibility against work progress,
posting approved milestones to the Payments module, and handover certificate
PDF generation."""
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from .models import BillingMilestone, HandoverCertificate, SiteProgressEntry
from .services import can_lock_build, EngineError


# --- Work-package progress (from field reports) ---------------------------
def wp_progress_map(build):
    """work_package_id -> achieved % (max reported across sites)."""
    out = {}
    for e in SiteProgressEntry.objects.filter(build=build).exclude(work_package__isnull=True):
        pct = float(e.progress_percent or 0)
        if pct > out.get(e.work_package_id, 0):
            out[e.work_package_id] = pct
    return out


def _vendors_with_issued_certificate(build):
    return set(
        build.handover_certificates.filter(status=HandoverCertificate.STATUS_ISSUED)
        .exclude(vendor__isnull=True).values_list('vendor_id', flat=True)
    )


def refresh_milestones(build):
    """Advance pending milestones to 'eligible' when their trigger is met."""
    progress = wp_progress_map(build)
    cert_vendors = _vendors_with_issued_certificate(build)
    now = timezone.now()
    for ms in build.billing_milestones.select_related('work_package').all():
        if ms.status != BillingMilestone.STATUS_PENDING:
            continue
        eligible = False
        if ms.trigger_type == BillingMilestone.TRIGGER_PROGRESS:
            eligible = progress.get(ms.work_package_id, 0) >= float(ms.trigger_progress_percent or 0)
        elif ms.trigger_type == BillingMilestone.TRIGGER_WP_DONE:
            eligible = ms.work_package and ms.work_package.status == 'completed'
        elif ms.trigger_type == BillingMilestone.TRIGGER_HANDOVER:
            # retention-release lines free up once the client issues a handover
            # certificate to that vendor.
            eligible = ms.vendor_id in cert_vendors
        # manual stays pending until acted on
        if eligible:
            ms.status = BillingMilestone.STATUS_ELIGIBLE
            ms.eligible_at = now
            ms.save(update_fields=['status', 'eligible_at', 'updated_at'])
    return build


def release_retention_on_certificate(cert):
    """When a handover certificate is issued, free up the vendor's pending
    retention-release milestones (trigger = handover_certificate)."""
    if cert.status != HandoverCertificate.STATUS_ISSUED or not cert.vendor_id:
        return 0
    now = timezone.now()
    qs = cert.build.billing_milestones.filter(
        vendor_id=cert.vendor_id,
        trigger_type=BillingMilestone.TRIGGER_HANDOVER,
        status=BillingMilestone.STATUS_PENDING,
    )
    count = 0
    for ms in qs:
        ms.status = BillingMilestone.STATUS_ELIGIBLE
        ms.eligible_at = now
        ms.save(update_fields=['status', 'eligible_at', 'updated_at'])
        count += 1
    return count


# --- Vendor-wise billing summary ------------------------------------------
def _summ_init(name):
    z = Decimal('0')
    return {'vendor_name': name, 'milestones': 0, 'total': z, 'retention_held': z,
            'pending': z, 'approved': z, 'paid': z}


def vendor_billing_summary(milestones):
    """Aggregate a milestone queryset/list into per-vendor rows."""
    rows = {}
    APPROVED = (BillingMilestone.STATUS_APPROVED, BillingMilestone.STATUS_PAID)
    PENDINGISH = (BillingMilestone.STATUS_PENDING, BillingMilestone.STATUS_ELIGIBLE,
                  BillingMilestone.STATUS_INVOICED)
    for ms in milestones:
        key = ms.vendor_id or 0
        r = rows.get(key) or rows.setdefault(key, _summ_init(
            (ms.vendor.company_name or ms.vendor.vendor_name) if ms.vendor_id else 'Unassigned'))
        r['milestones'] += 1
        r['total'] += ms.amount or Decimal('0')
        if ms.status in APPROVED:
            r['approved'] += ms.net_payable
            r['retention_held'] += ms.retention_amount
        if ms.status == BillingMilestone.STATUS_PAID:
            r['paid'] += ms.net_payable
        if ms.status in PENDINGISH:
            r['pending'] += ms.net_payable
    out = []
    for key, r in rows.items():
        r = dict(r)
        r['vendor_id'] = key or None
        r['outstanding'] = r['approved'] - r['paid']
        for k in ('total', 'retention_held', 'pending', 'approved', 'paid', 'outstanding'):
            r[k] = str(r[k].quantize(Decimal('0.01')))
        out.append(r)
    return sorted(out, key=lambda x: x['vendor_name'])


# --- Status actions -------------------------------------------------------
@transaction.atomic
def milestone_action(milestone, action, user, purchase_order=None):
    now = timezone.now()
    if action == 'eligible':
        milestone.status = BillingMilestone.STATUS_ELIGIBLE
        milestone.eligible_at = milestone.eligible_at or now
    elif action == 'invoice':
        if milestone.status not in (BillingMilestone.STATUS_ELIGIBLE, BillingMilestone.STATUS_PENDING):
            raise EngineError('Only an eligible milestone can be invoiced.')
        milestone.status = BillingMilestone.STATUS_INVOICED
        milestone.invoiced_at = now
    elif action == 'approve':
        if not can_lock_build(user):
            raise PermissionDenied('Only an admin or project manager can approve a milestone.')
        if milestone.status not in (BillingMilestone.STATUS_ELIGIBLE, BillingMilestone.STATUS_INVOICED):
            raise EngineError('Milestone must be eligible or invoiced before approval.')
        po = purchase_order or milestone.purchase_order
        if not po:
            raise EngineError('Link a purchase order to post this payment.')
        milestone.purchase_order = po
        milestone.vendor_payment = _post_vendor_payment(milestone, po, user)
        milestone.status = BillingMilestone.STATUS_APPROVED
        milestone.approved_at = now
    elif action == 'mark_paid':
        milestone.status = BillingMilestone.STATUS_PAID
        milestone.paid_at = now
        if milestone.vendor_payment_id:
            vp = milestone.vendor_payment
            vp.payment_status = 'paid'
            vp.payment_paid_date = now.date()
            vp.save()
    elif action == 'hold':
        milestone.status = BillingMilestone.STATUS_HOLD
    elif action == 'reopen':
        milestone.status = BillingMilestone.STATUS_PENDING
        milestone.eligible_at = milestone.invoiced_at = milestone.approved_at = None
    else:
        raise EngineError('Unknown action.')
    milestone.save()
    return milestone


def _post_vendor_payment(milestone, po, user):
    """Create a VendorPayment in the Payments module for an approved milestone."""
    from payments.models import VendorPayment
    vp = VendorPayment(
        po=po,
        vendor=milestone.vendor or po.vendor,
        payment_reference_code=f'MS{milestone.id}',
        payment_stage=milestone.payment_stage,
        payment_amount=milestone.net_payable,
        gst_amount=Decimal('0'),
        tds_deduction=Decimal('0'),
        payment_status='approved',
        remarks=f'Milestone: {milestone.name} ({milestone.work_package.name if milestone.work_package_id else ""})',
    )
    try:
        vp.save()  # runs full_clean(): caps at PO value, vendor must match PO
    except ValidationError as exc:
        raise EngineError('; '.join(exc.messages) if hasattr(exc, 'messages') else str(exc))
    return vp


# --- Handover certificate PDF --------------------------------------------
def generate_certificate_pdf(cert):
    """Render a simple handover certificate PDF into cert.document."""
    import io
    from django.core.files.base import ContentFile
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except ImportError:
        return None

    project = cert.build.project
    vendor_name = (cert.vendor.company_name or cert.vendor.vendor_name) if cert.vendor_id else '—'
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 40 * mm
    c.setFont('Helvetica-Bold', 18)
    c.drawCentredString(w / 2, y, 'SITE HANDOVER CERTIFICATE')
    c.setFont('Helvetica', 10)
    c.drawCentredString(w / 2, y - 7 * mm, f'Certificate No: {cert.certificate_number}')
    y -= 24 * mm

    def row(label, value):
        nonlocal y
        c.setFont('Helvetica-Bold', 11); c.drawString(25 * mm, y, f'{label}:')
        c.setFont('Helvetica', 11); c.drawString(70 * mm, y, str(value or '—'))
        y -= 9 * mm

    row('Project', f'{getattr(project, "project_name", "")} ({getattr(project, "project_code", "")})')
    row('Client', getattr(project, 'client_name', '') or '—')
    row('Vendor / Subcontractor', vendor_name)
    row('Site', cert.site_name or '—')
    row('Issued date', cert.issued_date or '—')
    y -= 4 * mm
    c.setFont('Helvetica-Bold', 11); c.drawString(25 * mm, y, 'Scope of handover:'); y -= 8 * mm
    c.setFont('Helvetica', 10)
    for line in (cert.scope_description or '—').splitlines() or ['—']:
        c.drawString(25 * mm, y, line[:95]); y -= 6 * mm
    y -= 10 * mm
    c.setFont('Helvetica', 10)
    c.drawString(25 * mm, y, 'This certifies that the above scope has been handed over by the client to the vendor /')
    y -= 6 * mm
    c.drawString(25 * mm, y, 'subcontractor as per the agreed terms.')
    y -= 30 * mm
    c.drawString(25 * mm, y, '____________________________')
    c.drawString(120 * mm, y, '____________________________')
    y -= 6 * mm
    c.setFont('Helvetica', 9)
    c.drawString(25 * mm, y, 'Client (authorised signatory)')
    c.drawString(120 * mm, y, 'Vendor / Subcontractor')
    c.showPage(); c.save()
    buf.seek(0)
    cert.document.save(f'{cert.certificate_number}.pdf', ContentFile(buf.read()), save=True)
    return cert.document
