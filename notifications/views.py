from django.http import JsonResponse

from permissions.utils import require_authenticated

from .models import Notification


def notifications_list_api(request):
    redirect = require_authenticated(request)
    if redirect:
        return redirect
    qs = Notification.objects.select_related('vendor').order_by('-created_at')[:100]
    rows = [{
        'id': n.id, 'title': n.title, 'message': n.message,
        'channel': n.channel, 'status': n.status,
        'vendor': (n.vendor.company_name or n.vendor.vendor_name) if n.vendor_id else '',
        'read': bool(n.read_at),
        'created_at': n.created_at.strftime('%d %b %Y, %I:%M %p') if n.created_at else '',
    } for n in qs]
    unread = sum(1 for r in rows if not r['read'])
    return JsonResponse({'notifications': rows, 'unread': unread, 'count': len(rows)})
