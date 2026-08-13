from .models import PurchaseOrder


def serialize_purchase_order(po: PurchaseOrder):
    return {
        'id': po.id,
        'po_number': po.po_number,
        'po_date': po.po_date.isoformat() if po.po_date else '',
        'vendor': po.vendor.company_name if po.vendor_id else '',
        'vendor_id': po.vendor_id,
        'business_division': po.business_division,
        'vendor_tracking_id': po.vendor_tracking_id,
        'vendor_tracking_name': po.vendor_tracking_name,
        'project_site_name': po.project_site_name,
        'project_location': po.project_location,
        'delivery_address': po.delivery_address,
        'dispatch_origin': po.dispatch_origin,
        'department': po.department,
        'total_po_value': str(po.total_po_value or 0),
        'paid_amount': str(po.paid_amount or 0),
        'outstanding_amount': str(po.outstanding_amount or 0),
        'status': po.status,
        'delivery_status_summary': po.delivery_status_summary,
        'payment_status_summary': po.payment_status_summary,
    }
