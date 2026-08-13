import json

from django.db.models import Count, Sum
from django.http import JsonResponse

from deliveries.models import Delivery, DeliveryInvoiceChallan
from payments.models import VendorPayment
from purchase_orders.models import PurchaseOrder, PurchaseOrderItem
from transport.models import VehicleMovement

from .forms import SavedReportForm
from .models import SavedReport


def _serialize_report_rows(report_type):
    if report_type == SavedReport.REPORT_PO_SUMMARY:
        return [
            {
                'po_number': po.po_number,
                'po_date': po.po_date.isoformat() if po.po_date else '',
                'vendor': po.vendor.company_name if po.vendor_id else '',
                'total_po_value': str(po.total_po_value or 0),
                'paid_amount': str(po.paid_amount or 0),
                'outstanding_amount': str(po.outstanding_amount or 0),
                'status': po.status,
            }
            for po in PurchaseOrder.objects.select_related('vendor').order_by('-created_at')[:50]
        ]
    if report_type == SavedReport.REPORT_VENDOR_PO:
        return [
            {
                'vendor_tracking_id': row['vendor_tracking_id'],
                'vendor_tracking_name': row['vendor_tracking_name'],
                'total_pos': row['total_pos'],
                'total_value': str(row['total_value'] or 0),
                'outstanding_amount': str(row['outstanding_amount'] or 0),
            }
            for row in PurchaseOrder.objects.values('vendor_tracking_id', 'vendor_tracking_name').annotate(
                total_pos=Count('id'),
                total_value=Sum('total_po_value'),
                outstanding_amount=Sum('outstanding_amount'),
            )
        ]
    if report_type == SavedReport.REPORT_MATERIAL_DELIVERY:
        return [
            {
                'material_name': row['material_name'],
                'material_category': row['material_category'],
                'ordered_quantity_total': str(row['ordered_quantity_total'] or 0),
                'delivered_quantity_total': str(row['delivered_quantity_total'] or 0),
                'pending_quantity_total': str(row['pending_quantity_total'] or 0),
            }
            for row in PurchaseOrderItem.objects.values('material_name', 'material_category').annotate(
                ordered_quantity_total=Sum('ordered_quantity'),
                delivered_quantity_total=Sum('delivered_quantity'),
                pending_quantity_total=Sum('pending_quantity'),
            )
        ]
    if report_type == SavedReport.REPORT_VEHICLE_TRACKING:
        return [
            {
                'vehicle_number': v.vehicle_number,
                'po_number': v.delivery.po.po_number if v.delivery_id else '',
                'dispatch_date': v.dispatch_date.isoformat() if v.dispatch_date else '',
                'expected_arrival_date': v.expected_arrival_date.isoformat() if v.expected_arrival_date else '',
                'vehicle_status': v.vehicle_status,
            }
            for v in VehicleMovement.objects.select_related('delivery', 'delivery__po').order_by('-dispatch_date')[:50]
        ]
    if report_type == SavedReport.REPORT_PENDING_DELIVERY:
        return [
            {
                'po_number': item.po.po_number,
                'material_name': item.material_name,
                'ordered_quantity': str(item.ordered_quantity or 0),
                'pending_quantity': str(item.pending_quantity or 0),
                'item_status': item.item_status,
            }
            for item in PurchaseOrderItem.objects.filter(pending_quantity__gt=0).select_related('po').order_by('-pending_quantity')[:50]
        ]
    if report_type == SavedReport.REPORT_PART_PAYMENT:
        return [
            {
                'po_number': p.po.po_number,
                'vendor': p.vendor.company_name if p.vendor_id else '',
                'payment_reference_code': p.payment_reference_code,
                'payment_stage': p.payment_stage,
                'net_payable': str(p.net_payable or 0),
                'payment_due_date': p.payment_due_date.isoformat() if p.payment_due_date else '',
                'payment_status': p.payment_status,
            }
            for p in VendorPayment.objects.select_related('po', 'vendor').order_by('payment_due_date')[:50]
        ]
    if report_type == SavedReport.REPORT_OUTSTANDING_PAYMENT:
        return [
            {
                'po_number': po.po_number,
                'vendor': po.vendor.company_name if po.vendor_id else '',
                'total_po_value': str(po.total_po_value or 0),
                'outstanding_amount': str(po.outstanding_amount or 0),
            }
            for po in PurchaseOrder.objects.filter(outstanding_amount__gt=0).select_related('vendor').order_by('-outstanding_amount')[:50]
        ]
    if report_type == SavedReport.REPORT_INVOICE_PAYMENT:
        return [
            {
                'po_number': inv.po.po_number,
                'invoice_number': inv.invoice_number,
                'challan_number': inv.challan_number,
                'invoice_date': inv.invoice_date.isoformat() if inv.invoice_date else '',
                'invoice_amount': str(inv.invoice_amount or 0),
                'verification_status': inv.verification_status,
            }
            for inv in DeliveryInvoiceChallan.objects.select_related('po', 'delivery').order_by('-invoice_date')[:50]
        ]
    return []


def _serialize_saved_report(report):
    return {
        'id': report.id,
        'name': report.name,
        'report_type': report.report_type,
        'filters_json': report.filters_json,
        'created_at': report.created_at.isoformat(),
    }


def report_center_api(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)

    report_type = request.GET.get('type') or SavedReport.REPORT_PO_SUMMARY
    return JsonResponse({
        'active_report_type': report_type,
        'report_types': SavedReport.REPORT_TYPE_CHOICES,
        'report_rows': _serialize_report_rows(report_type),
        'saved_reports': [_serialize_saved_report(r) for r in SavedReport.objects.order_by('name')],
    })


def saved_report_create_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    form = SavedReportForm(data=payload)
    if not form.is_valid():
        return JsonResponse({'error': 'Please correct the errors and try again.', 'field_errors': form.errors}, status=400)

    report = form.save(commit=False)
    report.created_by = request.user if request.user.is_authenticated else None
    report.save()
    return JsonResponse({'message': f'Report "{report.name}" saved.', 'report': _serialize_saved_report(report)}, status=201)
