from datetime import timedelta
import json

from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone

from accounts.models import StaffProfile
from administration.models import SystemAuditLog
from administration.services import log_system_audit
from audit_logs.models import VendorActivityLog
from audit_logs.services import log_vendor_activity
from notifications.services import create_notification
from permissions.utils import (
    ensure_task_access,
    ensure_vendor_write_access,
    get_accessible_task_queryset,
    get_accessible_vendor_queryset,
    get_staff_profile,
    is_admin_like,
    is_view_only,
    require_authenticated,
)

from .forms import VendorTaskForm, VendorTaskStatusForm
from .models import VendorTask
from .serializers import serialize_vendor_task


def _json_or_form_body(request):
    """React posts plain JSON for these endpoints, which Django never parses
    into `request.POST` (that only happens for form-encoded/multipart
    bodies) — fall back to parsing the raw body when POST is empty."""
    if request.POST:
        return request.POST
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return request.POST


def _sync_overdue_tasks(task_queryset):
    task_queryset.filter(
        due_date__lt=timezone.localdate(),
        task_status__in=[VendorTask.STATUS_PENDING, VendorTask.STATUS_IN_PROGRESS],
    ).update(task_status=VendorTask.STATUS_OVERDUE)


def _log_task_audit(user, task, description):
    log_system_audit(
        user=user,
        action=SystemAuditLog.ACTION_GENERIC,
        module='vendor_tasks',
        description=description,
        metadata={
            'task_id': task.pk,
            'task_title': task.task_title,
            'vendor_id': getattr(task.vendor, 'vendor_id', ''),
            'vendor_name': getattr(task.vendor, 'company_name', ''),
            'task_status': task.task_status,
        },
    )


def vendor_tasks_api(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    task_queryset = get_accessible_task_queryset(request.user).select_related('vendor', 'assigned_staff')
    _sync_overdue_tasks(task_queryset)

    query = (request.GET.get('q') or '').strip()
    status_filter = (request.GET.get('status') or '').strip()
    priority_filter = (request.GET.get('priority') or '').strip()
    task_type_filter = (request.GET.get('type') or '').strip()
    due_filter = (request.GET.get('due') or '').strip()
    staff_filter = (request.GET.get('staff') or '').strip()

    if query:
        task_queryset = task_queryset.filter(
            Q(vendor__vendor_id__icontains=query)
            | Q(vendor__company_name__icontains=query)
            | Q(task_title__icontains=query)
            | Q(assigned_staff__staff_name__icontains=query)
        )
    if status_filter:
        task_queryset = task_queryset.filter(task_status=status_filter)
    if priority_filter:
        task_queryset = task_queryset.filter(priority=priority_filter)
    if task_type_filter:
        task_queryset = task_queryset.filter(task_type=task_type_filter)
    if due_filter:
        task_queryset = task_queryset.filter(due_date=due_filter)
    if staff_filter and is_admin_like(request.user):
        task_queryset = task_queryset.filter(assigned_staff_id=staff_filter)

    admin = is_admin_like(request.user)
    staff_options = (
        StaffProfile.objects.filter(is_active=True).order_by('staff_name')
        if admin else StaffProfile.objects.none()
    )
    current_profile = get_staff_profile(request.user)

    return JsonResponse({
        'results': [serialize_vendor_task(task) for task in task_queryset.order_by('due_date', '-created_at')[:200]],
        'status_choices': VendorTask.STATUS_CHOICES,
        'priority_choices': VendorTask.PRIORITY_CHOICES,
        'task_type_choices': VendorTask.TASK_TYPE_CHOICES,
        'staff_options': [{'id': s.id, 'staff_name': s.staff_name} for s in staff_options],
        'is_admin': admin,
        'my_staff_id': getattr(current_profile, 'id', None),
        'can_create_tasks': not is_view_only(request.user),
        'can_update_tasks': not is_view_only(request.user),
    })


def task_create_api(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    if is_view_only(request.user):
        return JsonResponse({'error': 'Viewer role cannot create tasks.'}, status=403)

    accessible_vendors = get_accessible_vendor_queryset(request.user).order_by('company_name')
    current_profile = get_staff_profile(request.user)
    staff_queryset = (
        StaffProfile.objects.filter(is_active=True).order_by('staff_name')
        if is_admin_like(request.user) else StaffProfile.objects.filter(pk=getattr(current_profile, 'pk', None))
    )

    form = VendorTaskForm(_json_or_form_body(request))
    form.fields['vendor'].queryset = accessible_vendors
    form.fields['assigned_staff'].queryset = staff_queryset
    if not form.is_valid():
        return JsonResponse({'error': 'Please correct the errors and try again.', 'field_errors': form.errors}, status=400)

    task = form.save(commit=False)
    try:
        ensure_vendor_write_access(request.user, task.vendor)
    except PermissionDenied as exc:
        return JsonResponse({'error': str(exc) or 'You are not authorized to modify this vendor.'}, status=403)
    if not is_admin_like(request.user) and current_profile:
        task.assigned_staff = current_profile
    task.created_by = request.user
    if task.task_status == VendorTask.STATUS_COMPLETED:
        task.completed_by = request.user
        task.completion_date = timezone.now()
    elif task.due_date < timezone.localdate() and task.task_status in [VendorTask.STATUS_PENDING, VendorTask.STATUS_IN_PROGRESS]:
        task.task_status = VendorTask.STATUS_OVERDUE
    task.save()

    log_vendor_activity(
        task.vendor,
        VendorActivityLog.TYPE_TASK_CREATED,
        f'Task created: {task.task_title} ({task.get_task_type_display()}).',
        request.user,
    )
    _log_task_audit(request.user, task, f'Created vendor task {task.task_title}.')
    create_notification(
        task.assigned_staff.user,
        'New vendor task assigned',
        f'{task.task_title} has been assigned for {task.vendor.company_name}.',
        vendor=task.vendor,
        task=task,
    )
    return JsonResponse({'message': 'Vendor task created successfully.', 'task': serialize_vendor_task(task)}, status=201)


def task_status_update_api(request, task_id):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    task = get_object_or_404(VendorTask.objects.select_related('vendor', 'assigned_staff'), pk=task_id)
    try:
        ensure_task_access(request.user, task, write=True)
    except PermissionDenied as exc:
        return JsonResponse({'error': str(exc) or 'You are not authorized to update this task.'}, status=403)

    form = VendorTaskStatusForm(_json_or_form_body(request), instance=task)
    if not form.is_valid():
        return JsonResponse({'error': 'Unable to update the task status.', 'field_errors': form.errors}, status=400)

    updated_task = form.save(commit=False)
    if updated_task.task_status == VendorTask.STATUS_COMPLETED:
        updated_task.completed_by = request.user
        updated_task.completion_date = timezone.now()
    else:
        updated_task.completed_by = None
        updated_task.completion_date = None
    updated_task.save()

    log_vendor_activity(
        updated_task.vendor,
        VendorActivityLog.TYPE_TASK_UPDATED,
        f'Task updated: {updated_task.task_title} marked as {updated_task.get_task_status_display()}.',
        request.user,
    )
    _log_task_audit(
        request.user,
        updated_task,
        f'Updated vendor task {updated_task.task_title} to {updated_task.get_task_status_display()}.',
    )
    create_notification(
        updated_task.created_by,
        'Vendor task updated',
        f'{updated_task.task_title} for {updated_task.vendor.company_name} is now {updated_task.get_task_status_display()}.',
        vendor=updated_task.vendor,
        task=updated_task,
    )
    return JsonResponse({'message': 'Task status updated.', 'task': serialize_vendor_task(updated_task)})


def my_followups_api(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    task_queryset = get_accessible_task_queryset(request.user).select_related('vendor', 'assigned_staff')
    _sync_overdue_tasks(task_queryset)
    today = timezone.localdate()
    next_week = today + timedelta(days=7)
    followup_rows = task_queryset.filter(
        due_date__lte=next_week,
        task_status__in=[VendorTask.STATUS_PENDING, VendorTask.STATUS_IN_PROGRESS, VendorTask.STATUS_OVERDUE],
    ).order_by('due_date', '-priority')

    return JsonResponse({'results': [serialize_vendor_task(task) for task in followup_rows]})


# --- Tasks list API (real data for the Tasks page) -----------------------
from django.http import JsonResponse as _JsonResponse  # noqa: E402
from permissions.utils import require_authenticated as _req_auth  # noqa: E402
from .models import VendorTask as _VendorTask  # noqa: E402


def tasks_list_api(request):
    redirect = _req_auth(request)
    if redirect:
        return redirect
    qs = _VendorTask.objects.select_related('vendor', 'assigned_staff').order_by('-created_at')
    status = request.GET.get('status')
    if status:
        qs = qs.filter(task_status=status)
    rows = [{
        'id': t.id, 'title': t.task_title, 'type': t.task_type,
        'vendor': (t.vendor.company_name or t.vendor.vendor_name) if t.vendor_id else '',
        'assignee': str(t.assigned_staff) if t.assigned_staff_id else '',
        'due': t.due_date.isoformat() if t.due_date else '',
        'status': t.task_status, 'priority': t.priority,
        'description': t.description,
    } for t in qs]
    return _JsonResponse({'tasks': rows, 'count': qs.count()})
