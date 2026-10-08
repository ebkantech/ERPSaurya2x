from django.shortcuts import render

# Create your views here.


# --- Transport list API (real vehicle movements) -------------------------
from django.http import JsonResponse as _JsonResponse  # noqa: E402
from permissions.utils import require_authenticated as _req_auth  # noqa: E402
from .models import VehicleMovement as _VM  # noqa: E402


def transport_list_api(request):
    redirect = _req_auth(request)
    if redirect:
        return redirect
    qs = _VM.objects.select_related('delivery', 'delivery__po').order_by('-dispatch_date', '-id')
    status = request.GET.get('status')
    if status:
        qs = qs.filter(vehicle_status=status)
    rows = [{
        'id': v.id, 'vehicle': v.vehicle_number, 'driver': v.driver_name,
        'transporter': v.transporter_name, 'lr_number': v.lr_number,
        'from': v.loading_location, 'to': v.unloading_location,
        'delivery': v.delivery.delivery_reference_code if v.delivery_id else '',
        'po_number': v.delivery.po.po_number if v.delivery_id and v.delivery.po_id else '',
        'dispatch_date': v.dispatch_date.isoformat() if v.dispatch_date else '',
        'eta': v.expected_arrival_date.isoformat() if v.expected_arrival_date else '',
        'status': v.vehicle_status, 'status_display': v.get_vehicle_status_display(),
        'freight': str(v.freight_amount), 'gps_link': v.gps_tracking_link,
    } for v in qs]
    return _JsonResponse({'vehicles': rows, 'count': qs.count()})
