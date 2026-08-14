import json
import zipfile
from decimal import Decimal
from xml.etree import ElementTree as ET

from django.db.models import Count, Q, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone

from administration.models import SystemAuditLog
from administration.services import log_system_audit
from core.import_utils import load_xlsx_rows, normalize_header
from deliveries.forms import DeliveryForm, DeliveryInvoiceChallanForm
from deliveries.models import Delivery, DeliveryInvoiceChallan
from documents.forms import BusinessDocumentForm, NotificationLogForm
from documents.models import NotificationLog
from audit_logs.models import VendorActivityLog
from audit_logs.services import log_vendor_activity
from payments.forms import VendorPaymentForm
from payments.models import VendorPayment
from transport.forms import VehicleMovementForm
from transport.models import VehicleMovement

from .bulk_po import BulkPOError, check_bulk_rows, generate_purchase_order, parse_pdf_text_to_rows
from .forms import (
    PurchaseOrderActivityLogForm,
    PurchaseOrderForm,
    PurchaseOrderItemForm,
    PurchaseOrderReferenceCodeForm,
)
from .models import PurchaseOrder, PurchaseOrderActivityLog, PurchaseOrderItem, PurchaseOrderReferenceCode
from .serializers import serialize_purchase_order

BULK_PO_REQUIRED_COLUMNS = ('material_name', 'unit', 'quantity')
BULK_PO_HEADER_ALIASES = {
    'materialname': 'material_name',
    'material': 'material_name',
    'productname': 'material_name',
    'product': 'material_name',
    'unit': 'unit',
    'qtyspecification': 'unit',
    'uom': 'unit',
    'quantity': 'quantity',
    'qty': 'quantity',
    'requiredqty': 'quantity',
    'requiredquantity': 'quantity',
}


def _log_activity(po, action, description, actor=None, metadata=None):
    PurchaseOrderActivityLog.objects.create(
        po=po,
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        action=action,
        description=description,
        metadata_json=json.dumps(metadata or {}, default=str),
    )


def _log_system_po_event(user, action, module, description, po, extra=None):
    log_system_audit(
        user=user,
        action=action,
        module=module,
        description=description,
        metadata={
            'po_number': po.po_number,
            'vendor_id': po.vendor_tracking_id,
            'vendor_name': po.vendor_tracking_name,
            **(extra or {}),
        },
    )


def purchase_order_list_api(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)

    po_queryset = PurchaseOrder.objects.select_related('vendor').order_by('-created_at')
    query = (request.GET.get('q') or '').strip()
    status_filter = (request.GET.get('status') or '').strip()

    if query:
        po_queryset = po_queryset.filter(
            Q(po_number__icontains=query)
            | Q(vendor_tracking_id__icontains=query)
            | Q(vendor_tracking_name__icontains=query)
            | Q(project_site_name__icontains=query)
            | Q(delivery_address__icontains=query)
            | Q(dispatch_origin__icontains=query)
            | Q(vendor__company_name__icontains=query)
        )
    if status_filter:
        po_queryset = po_queryset.filter(status=status_filter)

    po_queryset = po_queryset.annotate(item_count=Count('items', distinct=True))
    rows = []
    for po in po_queryset:
        row = serialize_purchase_order(po)
        row['item_count'] = po.item_count
        row['expected_delivery_date'] = po.expected_delivery_date.isoformat() if po.expected_delivery_date else ''
        rows.append(row)

    return JsonResponse({
        'results': rows,
        'status_choices': PurchaseOrder.STATUS_CHOICES,
    })


def purchase_order_create_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    form = PurchaseOrderForm(request.POST, request.FILES)
    if not form.is_valid():
        return _api_validation_error(form)

    po = form.save(commit=False)
    if request.user.is_authenticated:
        po.created_by = request.user
    po.save()
    _log_activity(po, 'po_created', 'Purchase order master created.', request.user, {'po_number': po.po_number})
    _log_system_po_event(
        request.user,
        SystemAuditLog.ACTION_PO_CHANGE,
        'purchase_orders',
        f'Created purchase order {po.po_number}.',
        po,
    )
    log_vendor_activity(
        po.vendor,
        VendorActivityLog.TYPE_PO_CREATED,
        f'Purchase order {po.po_number} created for {po.project_site_name}.',
        request.user,
    )
    po.refresh_progress()
    return JsonResponse({'message': f'Purchase order {po.po_number} created.', 'po': serialize_purchase_order(po)}, status=201)


def _parse_bulk_check_xlsx(uploaded_file):
    try:
        xlsx_rows = load_xlsx_rows(uploaded_file)
    except (KeyError, zipfile.BadZipFile, ET.ParseError):
        return None, JsonResponse({'error': 'Could not read the Excel file. Please upload a valid .xlsx file'}, status=400)
    if not xlsx_rows:
        return None, JsonResponse({'error': 'The uploaded Excel sheet is empty'}, status=400)

    headers = xlsx_rows[0]
    data_rows = [row for row in xlsx_rows[1:] if any(str(cell or '').strip() for cell in row)]

    header_keys = []
    for header in headers:
        key = BULK_PO_HEADER_ALIASES.get(normalize_header(header))
        if not key:
            return None, JsonResponse({'error': f'Unexpected column found: {header or "blank"}'}, status=400)
        header_keys.append(key)
    missing = [column for column in BULK_PO_REQUIRED_COLUMNS if column not in header_keys]
    if missing:
        return None, JsonResponse({'error': f'Missing required columns: {", ".join(missing)}'}, status=400)

    raw_rows = []
    for raw_row in data_rows:
        row_dict = {key: '' for key in BULK_PO_REQUIRED_COLUMNS}
        for index, key in enumerate(header_keys):
            value = raw_row[index] if index < len(raw_row) else ''
            row_dict[key] = '' if value is None else str(value).strip()
        if any(row_dict.values()):
            raw_rows.append(row_dict)
    if not raw_rows:
        return None, JsonResponse({'error': 'No product rows found in the uploaded file'}, status=400)
    return raw_rows, None


def _parse_bulk_check_pdf(uploaded_file):
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        return None, JsonResponse({'error': 'PDF import is not available in this environment.'}, status=400)

    uploaded_file.seek(0)
    try:
        reader = PdfReader(uploaded_file)
        text = '\n'.join((page.extract_text() or '') for page in reader.pages)
    except Exception:
        return None, JsonResponse({'error': 'Could not read the PDF file. Please upload a valid PDF.'}, status=400)

    raw_rows = parse_pdf_text_to_rows(text)
    if not raw_rows:
        return None, JsonResponse({
            'error': 'Could not find any product rows in the PDF. PDF parsing only works on text-based '
                     'PDFs with a clear table (Material Name / Unit / Quantity per line) — scanned or '
                     'photographed pages are not supported. Try an .xlsx file or enter products manually.',
        }, status=400)
    return raw_rows, None


def _parse_bulk_check_request(request):
    """Returns (raw_rows, error_response). raw_rows is a list of
    {material_name, unit, quantity} dicts pulled from either an uploaded
    file (field name 'materialFile', .xlsx or .pdf) or a JSON body
    {"rows": [...]}."""
    if 'materialFile' in request.FILES:
        uploaded_file = request.FILES['materialFile']
        filename = (uploaded_file.name or '').lower()
        if filename.endswith('.xlsx'):
            return _parse_bulk_check_xlsx(uploaded_file)
        if filename.endswith('.pdf'):
            return _parse_bulk_check_pdf(uploaded_file)
        if filename.endswith(('.png', '.jpg', '.jpeg')):
            return None, JsonResponse({
                'error': 'Image (PNG/JPG) import needs OCR (text recognition), which is not set up in this '
                         'deployment yet. Please use a PDF with selectable text, an Excel (.xlsx) file, or '
                         'enter products manually.',
            }, status=400)
        return None, JsonResponse({'error': 'Please upload the product list as .xlsx or .pdf'}, status=400)

    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return None, JsonResponse({'error': 'Invalid JSON payload'}, status=400)
    raw_rows = payload.get('rows') or []
    if not raw_rows:
        return None, JsonResponse({'error': 'Add at least one product row to check.'}, status=400)
    return raw_rows, None


def purchase_order_bulk_check(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    raw_rows, error_response = _parse_bulk_check_request(request)
    if error_response:
        return error_response

    result_rows, all_matched = check_bulk_rows(raw_rows)
    return JsonResponse({'rows': result_rows, 'all_matched': all_matched})


def purchase_order_vendor_options_api(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    from core.models import Vendor
    vendors = Vendor.objects.order_by('company_name').values('id', 'vendor_id', 'company_name')
    return JsonResponse({'results': list(vendors)})


def purchase_order_bulk_generate_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    raw_rows = payload.get('items') or []
    form_data = {key: value for key, value in payload.items() if key != 'items'}
    form = PurchaseOrderForm(data=form_data)

    if not form.is_valid():
        return JsonResponse({'error': 'Fix the purchase order details.', 'field_errors': form.errors}, status=400)

    try:
        po, bulk_rows = generate_purchase_order(form, raw_rows, request.user)
    except BulkPOError as exc:
        return JsonResponse({'error': exc.message, 'rows': exc.rows}, status=400)

    _log_activity(
        po,
        'po_created',
        f'Purchase order generated from bulk inventory match ({len(bulk_rows)} items).',
        request.user,
        {'po_number': po.po_number, 'item_count': len(bulk_rows)},
    )
    _log_system_po_event(
        request.user,
        SystemAuditLog.ACTION_PO_CHANGE,
        'purchase_orders',
        f'Bulk-generated purchase order {po.po_number} from inventory match.',
        po,
    )
    log_vendor_activity(
        po.vendor,
        VendorActivityLog.TYPE_PO_CREATED,
        f'Purchase order {po.po_number} created for {po.project_site_name} via bulk inventory match.',
        request.user,
    )
    return JsonResponse({
        'message': f'Purchase order {po.po_number} generated with {len(bulk_rows)} matched items.',
        'po_id': po.pk,
        'po_number': po.po_number,
    })


def purchase_order_dashboard_api(request):
    po_queryset = PurchaseOrder.objects.select_related('vendor')
    payment_queryset = VendorPayment.objects.select_related('po', 'vendor')
    delivery_queryset = Delivery.objects.select_related('po', 'po_item')
    vehicle_queryset = VehicleMovement.objects.select_related('delivery', 'delivery__po')

    total_po_value = po_queryset.aggregate(total=Sum('total_po_value'))['total'] or Decimal('0.00')
    paid_amount = payment_queryset.exclude(payment_status='rejected').aggregate(total=Sum('net_payable'))['total'] or Decimal('0.00')
    pending_vendor_payments = payment_queryset.filter(payment_status__in=['pending', 'approved', 'hold']).count()
    pending_deliveries = delivery_queryset.filter(delivery_status__in=['pending', 'in_transit', 'partially_received']).count()
    in_transit_vehicles = vehicle_queryset.filter(vehicle_status__in=['dispatched', 'in_transit']).count()
    delayed_deliveries = vehicle_queryset.filter(
        expected_arrival_date__lt=timezone.localdate(),
    ).exclude(vehicle_status__in=['reached_site', 'unloaded']).count()

    delivered_quantity = po_queryset.aggregate(total=Sum('items__delivered_quantity'))['total'] or Decimal('0.00')
    pending_quantity = po_queryset.aggregate(total=Sum('items__pending_quantity'))['total'] or Decimal('0.00')

    vendor_outstanding = [
        {
            'vendor_tracking_id': row['vendor_tracking_id'],
            'vendor_tracking_name': row['vendor_tracking_name'],
            'total_outstanding': str(row['total_outstanding'] or Decimal('0.00')),
        }
        for row in po_queryset.values('vendor_tracking_id', 'vendor_tracking_name')
        .annotate(total_outstanding=Sum('outstanding_amount'))
        .order_by('-total_outstanding')[:8]
    ]

    po_status_rows = [
        {'status': row['status'], 'total': row['total']}
        for row in po_queryset.values('status').annotate(total=Count('id')).order_by('status')
    ]

    recent_pos = [serialize_purchase_order(po) for po in po_queryset.order_by('-created_at')[:6]]

    payload = {
        'total_pos': po_queryset.count(),
        'total_po_value': str(total_po_value),
        'total_paid_amount': str(paid_amount),
        'total_outstanding_amount': str(max(total_po_value - paid_amount, Decimal('0.00'))),
        'pending_deliveries': pending_deliveries,
        'in_transit_vehicles': in_transit_vehicles,
        'delayed_deliveries': delayed_deliveries,
        'delivered_quantity': str(delivered_quantity),
        'pending_quantity': str(pending_quantity),
        'pending_vendor_payments': pending_vendor_payments,
        'recent_pos': recent_pos,
        'vendor_outstanding': vendor_outstanding,
        'po_status_rows': po_status_rows,
    }
    return JsonResponse(payload)


def purchase_order_detail_api(request, pk):
    po = get_object_or_404(PurchaseOrder.objects.select_related('vendor'), pk=pk)
    payload = serialize_purchase_order(po)
    payload.update({
        'items': list(po.items.values(
            'id', 'material_category', 'material_name', 'specification', 'brand', 'model',
            'unit', 'ordered_quantity', 'unit_rate', 'gst_percentage', 'total_amount',
            'delivered_quantity', 'pending_quantity', 'item_status',
        )),
        'references': list(po.reference_codes.values('id', 'reference_code', 'reference_type', 'date')),
        'deliveries': list(po.deliveries.values(
            'id', 'delivery_reference_code', 'po_item_id', 'delivery_date',
            'delivered_quantity', 'delivery_status',
        )),
        'payments': list(po.payments.values(
            'id', 'payment_reference_code', 'payment_stage', 'payment_amount',
            'net_payable', 'payment_due_date', 'payment_status',
        )),
        'documents': list(po.documents.values('id', 'title', 'document_type', 'file', 'created_at')),
    })
    return JsonResponse(payload)


# ---------------------------------------------------------------------------
# Purchase-order detail write API
#
# These endpoints decompose the many POST action branches of the HTML
# ``purchase_order_detail`` view into granular JSON create/update endpoints.
# Each reuses the same Django form the HTML view used (so validation stays in
# one place) and fires the same activity/audit side-effects.
# ---------------------------------------------------------------------------

def _api_require_post(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    return None


def _api_validation_error(form):
    return JsonResponse(
        {'error': 'Please correct the errors and try again.', 'field_errors': form.errors},
        status=400,
    )


def _api_get_po(pk):
    return get_object_or_404(PurchaseOrder.objects.select_related('vendor'), pk=pk)


def _json_or_form_body(request):
    """React posts plain JSON for these sub-forms (no file fields) — Django
    never parses `application/json` into `request.POST`, so fall back to
    parsing the raw body when POST is empty (multipart/form-encoded callers,
    e.g. ones with file uploads, keep working unchanged)."""
    if request.POST:
        return request.POST
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return request.POST


def purchase_order_update_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = PurchaseOrderForm(request.POST, request.FILES, instance=po)
    if not form.is_valid():
        return _api_validation_error(form)
    form.save()
    _log_activity(po, 'po_updated', 'PO master details updated.', request.user)
    _log_system_po_event(
        request.user,
        SystemAuditLog.ACTION_PO_CHANGE,
        'purchase_orders',
        f'Updated purchase order {po.po_number}.',
        po,
    )
    po.refresh_progress()
    return JsonResponse({'message': 'Purchase order updated.', 'po': serialize_purchase_order(po)})


def po_item_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = PurchaseOrderItemForm(_json_or_form_body(request))
    if not form.is_valid():
        return _api_validation_error(form)
    item = form.save(commit=False)
    item.po = po
    item.save()
    _log_activity(po, 'item_added', f'Added PO item {item.material_name}.', request.user)
    return JsonResponse({
        'message': 'Item added.',
        'item': {
            'id': item.id,
            'material_category': item.material_category,
            'material_name': item.material_name,
            'ordered_quantity': item.ordered_quantity,
            'delivered_quantity': item.delivered_quantity,
            'pending_quantity': item.pending_quantity,
        },
    }, status=201)


def po_reference_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = PurchaseOrderReferenceCodeForm(_json_or_form_body(request), request.FILES)
    if not form.is_valid():
        return _api_validation_error(form)
    reference = form.save(commit=False)
    reference.po = po
    reference.save()
    _log_activity(po, 'reference_added', f'Added reference code {reference.reference_code}.', request.user)
    return JsonResponse({
        'message': 'Reference code added.',
        'reference': {
            'id': reference.id,
            'reference_code': reference.reference_code,
            'reference_type': reference.reference_type,
            'date': reference.date,
        },
    }, status=201)


def po_delivery_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = DeliveryForm(_json_or_form_body(request), request.FILES)
    form.fields['po_item'].queryset = po.items.all()
    if not form.is_valid():
        return _api_validation_error(form)
    delivery = form.save(commit=False)
    delivery.po = po
    delivery.save()
    _log_activity(po, 'delivery_added', f'Added delivery {delivery.delivery_reference_code}.', request.user)
    _log_system_po_event(
        request.user,
        SystemAuditLog.ACTION_PO_CHANGE,
        'deliveries',
        f'Added delivery {delivery.delivery_reference_code} against {po.po_number}.',
        po,
        {'delivery_reference_code': delivery.delivery_reference_code},
    )
    log_vendor_activity(
        po.vendor,
        VendorActivityLog.TYPE_DELIVERY_UPDATED,
        f'Delivery {delivery.delivery_reference_code} recorded for {delivery.po_item.material_name}.',
        request.user,
    )
    return JsonResponse({
        'message': 'Delivery recorded.',
        'delivery': {
            'id': delivery.id,
            'delivery_reference_code': delivery.delivery_reference_code,
            'delivery_date': delivery.delivery_date,
            'delivered_quantity': delivery.delivered_quantity,
            'delivery_status': delivery.delivery_status,
        },
    }, status=201)


def po_vehicle_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    body = _json_or_form_body(request)
    form = VehicleMovementForm(body)
    if 'delivery' in form.fields:
        form.fields['delivery'].queryset = po.deliveries.all()
    if not form.is_valid():
        return _api_validation_error(form)
    delivery_id = body.get('delivery')
    if not delivery_id:
        return JsonResponse({'error': 'A delivery is required for the vehicle movement.', 'field_errors': {'delivery': ['This field is required.']}}, status=400)
    delivery = get_object_or_404(po.deliveries, pk=delivery_id)
    vehicle = form.save(commit=False)
    vehicle.delivery = delivery
    vehicle.save()
    _log_activity(po, 'vehicle_added', f'Added vehicle {vehicle.vehicle_number}.', request.user)
    return JsonResponse({
        'message': 'Vehicle movement added.',
        'vehicle': {
            'id': vehicle.id,
            'vehicle_number': vehicle.vehicle_number,
            'vehicle_status': vehicle.vehicle_status,
            'delivery_id': delivery.id,
        },
    }, status=201)


def po_invoice_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = DeliveryInvoiceChallanForm(_json_or_form_body(request), request.FILES)
    form.fields['delivery'].queryset = po.deliveries.all()
    if not form.is_valid():
        return _api_validation_error(form)
    invoice = form.save(commit=False)
    invoice.po = po
    invoice.save()
    _log_activity(po, 'invoice_added', f'Recorded invoice/challan {invoice.invoice_number or invoice.challan_number}.', request.user)
    return JsonResponse({
        'message': 'Invoice/challan recorded.',
        'invoice': {
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'challan_number': invoice.challan_number,
        },
    }, status=201)


def po_payment_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = VendorPaymentForm(_json_or_form_body(request), request.FILES)
    form.fields['related_delivery'].queryset = po.deliveries.all()
    form.fields['related_invoice'].queryset = po.invoice_challans.all()
    if not form.is_valid():
        return _api_validation_error(form)
    payment = form.save(commit=False)
    payment.po = po
    payment.vendor = po.vendor
    payment.save()
    _log_activity(po, 'payment_added', f'Added payment reference {payment.payment_reference_code}.', request.user)
    _log_system_po_event(
        request.user,
        SystemAuditLog.ACTION_PAYMENT_UPDATE,
        'payments',
        f'Logged payment {payment.payment_reference_code} for {po.po_number}.',
        po,
        {'payment_reference_code': payment.payment_reference_code},
    )
    log_vendor_activity(
        po.vendor,
        VendorActivityLog.TYPE_PAYMENT_FOLLOWUP,
        f'Payment stage {payment.get_payment_stage_display()} logged with reference {payment.payment_reference_code}.',
        request.user,
    )
    return JsonResponse({
        'message': 'Payment logged.',
        'payment': {
            'id': payment.id,
            'payment_reference_code': payment.payment_reference_code,
            'payment_stage': payment.payment_stage,
            'net_payable': payment.net_payable,
            'payment_status': payment.payment_status,
        },
    }, status=201)


def po_document_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = BusinessDocumentForm(request.POST, request.FILES)
    form.fields['delivery'].queryset = po.deliveries.all()
    form.fields['vehicle'].queryset = VehicleMovement.objects.filter(delivery__po=po)
    form.fields['payment'].queryset = po.payments.all()
    form.fields['reference_code'].queryset = po.reference_codes.all()
    if not form.is_valid():
        return _api_validation_error(form)
    document = form.save(commit=False)
    document.po = po
    document.uploaded_by = request.user if request.user.is_authenticated else None
    document.save()
    _log_activity(po, 'document_added', f'Uploaded document {document.title}.', request.user)
    _log_system_po_event(
        request.user,
        SystemAuditLog.ACTION_PO_CHANGE,
        'documents',
        f'Uploaded document {document.title} for {po.po_number}.',
        po,
        {'document_title': document.title},
    )
    log_vendor_activity(
        po.vendor,
        VendorActivityLog.TYPE_DOCUMENT_UPLOADED,
        f'Document uploaded: {document.title}.',
        request.user,
    )
    return JsonResponse({
        'message': 'Document uploaded.',
        'document': {
            'id': document.id,
            'title': document.title,
        },
    }, status=201)


def po_activity_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = PurchaseOrderActivityLogForm(_json_or_form_body(request))
    if not form.is_valid():
        return _api_validation_error(form)
    entry = form.save(commit=False)
    entry.po = po
    entry.actor = request.user if request.user.is_authenticated else None
    entry.save()
    return JsonResponse({
        'message': 'Activity logged.',
        'activity': {
            'id': entry.id,
            'action': entry.action,
            'description': entry.description,
        },
    }, status=201)


def po_notification_create_api(request, pk):
    error = _api_require_post(request)
    if error:
        return error
    po = _api_get_po(pk)
    form = NotificationLogForm(_json_or_form_body(request))
    if 'delivery' in form.fields:
        form.fields['delivery'].queryset = po.deliveries.all()
    if 'payment' in form.fields:
        form.fields['payment'].queryset = po.payments.all()
    if not form.is_valid():
        return _api_validation_error(form)
    notification = form.save(commit=False)
    notification.po = po
    notification.save()
    _log_activity(po, 'notification_logged', f'Logged {notification.channel} notification.', request.user)
    return JsonResponse({
        'message': 'Notification logged.',
        'notification': {
            'id': notification.id,
            'channel': notification.channel,
        },
    }, status=201)
