from django.http import JsonResponse

from permissions.utils import require_authenticated

from .models import Delivery


def deliveries_list(request):
    """GET → all deliveries (real GRN records entered against POs)."""
    redirect = require_authenticated(request)
    if redirect:
        return redirect
    qs = (Delivery.objects.select_related('po', 'po_item', 'po__vendor')
          .prefetch_related('vehicles').order_by('-delivery_date', '-id'))
    status = request.GET.get('status')
    if status:
        qs = qs.filter(delivery_status=status)
    rows = []
    for d in qs:
        veh = d.vehicles.first()
        rows.append({
            'id': d.id,
            'reference': d.delivery_reference_code,
            'po_number': d.po.po_number if d.po_id else '',
            'vendor': (d.po.vendor.company_name or d.po.vendor.vendor_name) if d.po_id and d.po.vendor_id else '',
            'material': d.po_item.material_name if d.po_item_id else '',
            'delivered_quantity': str(d.delivered_quantity),
            'delivery_date': d.delivery_date.isoformat() if d.delivery_date else '',
            'location': d.delivery_location,
            'received_by': d.site_received_by,
            'status': d.delivery_status,
            'status_display': d.get_delivery_status_display(),
            'vehicle_number': veh.vehicle_number if veh else '',
            'driver': veh.driver_name if veh else '',
            'vehicle_status': veh.get_vehicle_status_display() if veh else '',
        })
    return JsonResponse({'deliveries': rows, 'count': qs.count()})
