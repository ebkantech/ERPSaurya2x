import json
from collections import defaultdict
from pathlib import Path

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, logout, update_session_auth_hash
from django.contrib.auth.models import Group
from django.contrib.sessions.models import Session
from django.core.mail import send_mail
from django.db import connection
from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from accounts.forms import StaffProfileForm
from accounts.models import StaffProfile
from audit_logs.services import log_vendor_activity
from core.models import MaterialMaster, ProjectMaster, Vendor
from notifications.models import Notification
from permissions.constants import ROLE_CHOICES, ROLE_GROUP_MAP
from permissions.models import RolePermission
from permissions.utils import get_staff_profile, is_admin_like, require_admin_access, require_authenticated, role_label
from purchase_orders.models import PurchaseOrder
from tasks.models import VendorTask
from vendors.models import VendorAssignment

from .forms import (
    AccountSecurityProfileForm,
    AppearanceSettingForm,
    BackupRecordForm,
    ChangeEmailMobileForm,
    CompanySettingForm,
    DashboardSettingForm,
    EmailConfigurationForm,
    ERPConfigurationForm,
    HelpResourceForm,
    ManagedUserCreateForm,
    MasterDataEntryForm,
    PasswordSettingsForm,
    RolePermissionForm,
    SecuritySettingForm,
    SessionManagementForm,
    StaffProfileSettingsForm,
    SupportTicketForm,
    TestMessageForm,
    UserNotificationPreferenceForm,
    UserPreferenceForm,
    WhatsAppConfigurationForm,
)
from .models import (
    BackupRecord,
    HelpResource,
    LoginAttempt,
    MasterDataEntry,
    SupportTicket,
    SystemAuditLog,
    UserSessionRecord,
)
from .serializers import serialize_audit_log, serialize_master_data, serialize_session_record
from .services import (
    DEFAULT_NOTIFICATION_EVENTS,
    create_backup_snapshot,
    ensure_role_permissions,
    get_appearance_setting,
    get_company_setting,
    get_dashboard_setting,
    get_email_configuration,
    get_erp_configuration,
    get_notification_preference,
    get_security_setting,
    get_whatsapp_configuration,
    log_system_audit,
    parse_json_field,
    restore_backup_from_file,
    seed_master_data_defaults,
)


User = get_user_model()


def _base_context(request, page_title):
    profile = get_staff_profile(request.user) if getattr(request.user, 'is_authenticated', False) else None
    return {
        'page_title': page_title,
        'administration_nav': True,
        'is_assignment_admin': is_admin_like(request.user),
        'assignment_role_label': role_label(request.user),
        'staff_profile': profile,
        'current_help_resources': HelpResource.objects.filter(is_published=True).order_by('resource_type', 'display_order')[:6],
    }


def _admin_only(request):
    redirect_response = require_admin_access(request)
    if redirect_response:
        return redirect_response
    return None


def _profile_for_user(user):
    return get_staff_profile(user)


def _record_settings_change(request, module, description, metadata=None):
    log_system_audit(
        user=request.user,
        action=SystemAuditLog.ACTION_SETTINGS_CHANGE,
        module=module,
        description=description,
        ip_address=request.META.get('REMOTE_ADDR', ''),
        device_information=request.META.get('HTTP_USER_AGENT', ''),
        metadata=metadata or {},
    )


def administration_dashboard(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    ensure_role_permissions()
    seed_master_data_defaults()

    profile = _profile_for_user(request.user)
    task_scope = VendorTask.objects.all() if is_admin_like(request.user) else VendorTask.objects.filter(assigned_staff=profile)
    vendor_scope = Vendor.objects.all() if is_admin_like(request.user) else Vendor.objects.filter(assignments__assigned_staff=profile, assignments__assignment_status='active').distinct()
    notification_scope = Notification.objects.filter(recipient=request.user).order_by('-created_at')[:8]
    context = {
        **_base_context(request, 'Settings & Administration'),
        'total_users': User.objects.count(),
        'active_users': StaffProfile.objects.filter(is_active=True).count(),
        'open_tickets': SupportTicket.objects.exclude(status=SupportTicket.STATUS_CLOSED).count(),
        'my_notifications': notification_scope,
        'my_vendor_count': vendor_scope.count(),
        'my_task_count': task_scope.filter(task_status__in=[VendorTask.STATUS_PENDING, VendorTask.STATUS_IN_PROGRESS, VendorTask.STATUS_OVERDUE]).count(),
        'login_history': UserSessionRecord.objects.filter(user=request.user).order_by('-logged_in_at')[:8],
        'company_setting': get_company_setting(),
        'erp_configuration': get_erp_configuration(),
    }
    return render(request, 'administration/dashboard.html', context)


def my_profile(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    profile = _profile_for_user(request.user)
    if not profile:
        messages.error(request, 'Staff profile is not configured for this user yet.')
        return redirect('administration-dashboard')

    if request.method == 'POST':
        form = StaffProfileSettingsForm(request.POST, request.FILES, instance=profile)
        if form.is_valid():
            form.save()
            _record_settings_change(request, 'profile', 'Updated profile settings.')
            messages.success(request, 'Profile settings updated.')
            return redirect('administration-my-profile')
    else:
        form = StaffProfileSettingsForm(instance=profile)

    assigned_vendors = VendorAssignment.objects.filter(assigned_staff=profile, assignment_status='active').select_related('vendor')
    assigned_projects = ProjectMaster.objects.filter(allocations__vendor__assignments__assigned_staff=profile).distinct()[:10]
    context = {
        **_base_context(request, 'My Profile'),
        'profile_form': form,
        'profile_record': profile,
        'login_history': UserSessionRecord.objects.filter(user=request.user).order_by('-logged_in_at')[:10],
        'assigned_vendors': assigned_vendors,
        'assigned_projects': assigned_projects,
    }
    return render(request, 'administration/my_profile.html', context)


def account_security(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    profile = _profile_for_user(request.user)
    password_form = PasswordSettingsForm(request.user)
    contact_form = ChangeEmailMobileForm(initial={
        'email': request.user.email,
        'mobile_number': profile.mobile_number if profile else '',
    })
    security_form = AccountSecurityProfileForm(instance=profile)
    session_form = SessionManagementForm()
    current_session_key = request.session.session_key or ''

    if request.method == 'POST':
        action = request.POST.get('action') or ''
        if action == 'change_password':
            password_form = PasswordSettingsForm(request.user, request.POST)
            if password_form.is_valid():
                user = password_form.save()
                update_session_auth_hash(request, user)
                _record_settings_change(request, 'security', 'Changed account password.')
                log_system_audit(user=request.user, action=SystemAuditLog.ACTION_PASSWORD_CHANGE, module='authentication', description='Password updated by user.')
                messages.success(request, 'Password changed successfully.')
                return redirect('administration-account-security')
        elif action == 'update_contact':
            contact_form = ChangeEmailMobileForm(request.POST)
            if contact_form.is_valid():
                request.user.email = contact_form.cleaned_data['email']
                request.user.save(update_fields=['email'])
                if profile:
                    profile.mobile_number = contact_form.cleaned_data['mobile_number']
                    profile.email = contact_form.cleaned_data['email']
                    profile.save(update_fields=['mobile_number', 'email', 'updated_at'])
                _record_settings_change(request, 'account', 'Updated email/mobile settings.')
                messages.success(request, 'Contact settings updated.')
                return redirect('administration-account-security')
        elif action == 'security_preferences' and profile:
            security_form = AccountSecurityProfileForm(request.POST, instance=profile)
            if security_form.is_valid():
                security_form.save()
                _record_settings_change(request, 'security', 'Updated security preferences.')
                messages.success(request, 'Security preferences updated.')
                return redirect('administration-account-security')
        elif action == 'logout_session':
            session_key = (request.POST.get('session_key') or '').strip()
            session_record = get_object_or_404(UserSessionRecord, user=request.user, session_key=session_key)
            session_record.is_active = False
            session_record.logged_out_at = timezone.now()
            session_record.save(update_fields=['is_active', 'logged_out_at'])
            if session_key:
                Session.objects.filter(session_key=session_key).delete()
            _record_settings_change(request, 'security', f'Closed session {session_key or session_record.id}.')
            if session_key == current_session_key:
                logout(request)
                messages.success(request, 'Current session signed out successfully.')
                return redirect('/admin/login/')
            messages.success(request, 'Selected session signed out successfully.')
            return redirect('administration-account-security')
        elif action == 'logout_all_devices':
            active_records = list(UserSessionRecord.objects.filter(user=request.user, is_active=True))
            session_keys = [row.session_key for row in active_records if row.session_key]
            UserSessionRecord.objects.filter(pk__in=[row.pk for row in active_records]).update(
                is_active=False,
                logged_out_at=timezone.now(),
            )
            if session_keys:
                Session.objects.filter(session_key__in=session_keys).delete()
            _record_settings_change(request, 'security', 'Requested logout from all devices.')
            logout(request)
            messages.success(request, 'All active sessions have been signed out.')
            return redirect('/admin/login/')

    context = {
        **_base_context(request, 'Account & Security'),
        'password_form': password_form,
        'contact_form': contact_form,
        'security_form': security_form,
        'session_form': session_form,
        'session_rows': UserSessionRecord.objects.filter(user=request.user).order_by('-last_activity_at')[:20],
        'current_session_key': current_session_key,
        'login_attempts': LoginAttempt.objects.filter(username=request.user.username).order_by('-attempted_at')[:20],
    }
    return render(request, 'administration/account_security.html', context)


def notification_settings_view(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    preference = get_notification_preference(request.user)
    event_state = parse_json_field(preference.event_preferences_json, DEFAULT_NOTIFICATION_EVENTS.copy())
    if request.method == 'POST':
        form = UserNotificationPreferenceForm(request.POST, instance=preference)
        if form.is_valid():
            pref = form.save(commit=False)
            event_state = {}
            for key in DEFAULT_NOTIFICATION_EVENTS:
                event_state[key] = bool(request.POST.get(f'event_{key}'))
            pref.event_preferences_json = json.dumps(event_state)
            pref.user = request.user
            pref.save()
            _record_settings_change(request, 'notifications', 'Updated notification settings.')
            messages.success(request, 'Notification settings updated.')
            return redirect('administration-notifications')
    else:
        form = UserNotificationPreferenceForm(instance=preference)

    context = {
        **_base_context(request, 'Notifications'),
        'notification_form': form,
        'event_rows': [
            {
                'key': key,
                'label': key.replace('_', ' ').title(),
                'enabled': bool(event_state.get(key)),
            }
            for key in DEFAULT_NOTIFICATION_EVENTS.keys()
        ],
        'recent_notifications': Notification.objects.filter(recipient=request.user).order_by('-created_at')[:25],
    }
    return render(request, 'administration/notifications.html', context)


def preference_settings(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    profile = _profile_for_user(request.user)
    if not profile:
        messages.error(request, 'Staff profile is not configured for this user yet.')
        return redirect('administration-dashboard')

    if request.method == 'POST':
        form = UserPreferenceForm(request.POST, instance=profile)
        if form.is_valid():
            form.save()
            _record_settings_change(request, 'preferences', 'Updated personal preferences.')
            messages.success(request, 'Preferences updated.')
            return redirect('administration-preferences')
    else:
        form = UserPreferenceForm(instance=profile)

    context = {
        **_base_context(request, 'Preferences'),
        'preference_form': form,
    }
    return render(request, 'administration/preferences.html', context)


def company_settings_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_company_setting()
    if request.method == 'POST':
        form = CompanySettingForm(request.POST, request.FILES, instance=record)
        if form.is_valid():
            company = form.save(commit=False)
            company.updated_by = request.user
            company.save()
            _record_settings_change(request, 'company', 'Updated company settings.')
            messages.success(request, 'Company settings saved.')
            return redirect('administration-company-settings')
    else:
        form = CompanySettingForm(instance=record)

    context = {
        **_base_context(request, 'Company Settings'),
        'company_form': form,
        'company_record': record,
    }
    return render(request, 'administration/company_settings.html', context)


def erp_configuration_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_erp_configuration()
    if request.method == 'POST':
        form = ERPConfigurationForm(request.POST, instance=record)
        if form.is_valid():
            config = form.save(commit=False)
            config.updated_by = request.user
            config.save()
            _record_settings_change(request, 'erp_configuration', 'Updated ERP configuration.')
            messages.success(request, 'ERP configuration saved.')
            return redirect('administration-erp-configuration')
    else:
        form = ERPConfigurationForm(instance=record)

    context = {
        **_base_context(request, 'ERP Configuration'),
        'erp_form': form,
        'configuration_record': record,
    }
    return render(request, 'administration/erp_configuration.html', context)


def users_roles_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    user_form = ManagedUserCreateForm()
    staff_form = StaffProfileForm()

    if request.method == 'POST':
        action = request.POST.get('action') or 'create_user'
        if action == 'create_user':
            user_form = ManagedUserCreateForm(request.POST)
            staff_form = StaffProfileForm(request.POST)
            if user_form.is_valid() and staff_form.is_valid():
                user = user_form.save()
                profile = staff_form.save(commit=False)
                profile.user = user
                if not profile.staff_name:
                    profile.staff_name = user.username
                if not profile.email:
                    profile.email = user.email
                profile.save()
                _record_settings_change(request, 'users', f'Created user {user.username}.')
                log_system_audit(user=request.user, action=SystemAuditLog.ACTION_USER_CREATE, module='users', description=f'Created user {user.username}.')
                messages.success(request, 'User and staff profile created.')
                return redirect('administration-users-roles')
        elif action == 'toggle_active':
            profile = get_object_or_404(StaffProfile, pk=request.POST.get('profile_id'))
            profile.is_active = not profile.is_active
            profile.save(update_fields=['is_active', 'updated_at'])
            messages.success(request, 'User status updated.')
            return redirect('administration-users-roles')
        elif action == 'reset_password':
            user = get_object_or_404(User, pk=request.POST.get('user_id'))
            new_password = request.POST.get('new_password') or 'ChangeMe123!'
            user.set_password(new_password)
            user.save()
            _record_settings_change(request, 'users', f'Reset password for {user.username}.')
            messages.success(request, f'Password reset for {user.username}.')
            return redirect('administration-users-roles')

    context = {
        **_base_context(request, 'Users & Roles'),
        'managed_user_form': user_form,
        'managed_staff_form': staff_form,
        'user_rows': StaffProfile.objects.select_related('user', 'reporting_manager').order_by('staff_name'),
        'role_choices': ROLE_CHOICES,
        'group_rows': Group.objects.order_by('name'),
    }
    return render(request, 'administration/users_roles.html', context)


def permission_matrix_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    ensure_role_permissions()
    if request.method == 'POST':
        for permission in RolePermission.objects.all():
            prefix = f'perm_{permission.id}_'
            permission.can_view = bool(request.POST.get(prefix + 'can_view'))
            permission.can_create = bool(request.POST.get(prefix + 'can_create'))
            permission.can_edit = bool(request.POST.get(prefix + 'can_edit'))
            permission.can_delete = bool(request.POST.get(prefix + 'can_delete'))
            permission.can_approve = bool(request.POST.get(prefix + 'can_approve'))
            permission.can_export = bool(request.POST.get(prefix + 'can_export'))
            permission.can_assign = bool(request.POST.get(prefix + 'can_assign'))
            permission.save()
        _record_settings_change(request, 'permissions', 'Updated role permission matrix.')
        messages.success(request, 'Permission matrix updated.')
        return redirect('administration-permissions')

    permission_rows = defaultdict(list)
    for row in RolePermission.objects.order_by('role', 'module_key'):
        permission_rows[row.get_role_display()].append(row)
    context = {
        **_base_context(request, 'Permissions'),
        'permission_rows': dict(permission_rows),
    }
    return render(request, 'administration/permissions.html', context)


def email_settings_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_email_configuration()
    test_form = TestMessageForm()
    if request.method == 'POST':
        action = request.POST.get('action') or 'save'
        if action == 'test':
            test_form = TestMessageForm(request.POST)
            form = EmailConfigurationForm(instance=record)
            if test_form.is_valid():
                recipient = test_form.cleaned_data['recipient'] or request.user.email
                if recipient:
                    send_mail(
                        subject='OmegaERP test email',
                        message=test_form.cleaned_data['message'] or 'This is a test email from OmegaERP.',
                        from_email=record.sender_email or settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[recipient],
                        fail_silently=False,
                    )
                    messages.success(request, f'Test email sent to {recipient}.')
                else:
                    messages.error(request, 'Recipient email is required for test email.')
        else:
            form = EmailConfigurationForm(request.POST, instance=record)
            if form.is_valid():
                email_config = form.save(commit=False)
                email_config.updated_by = request.user
                email_config.save()
                _record_settings_change(request, 'email', 'Updated email settings.')
                messages.success(request, 'Email settings saved.')
                return redirect('administration-email-settings')
    else:
        form = EmailConfigurationForm(instance=record)

    context = {
        **_base_context(request, 'Email Settings'),
        'email_form': form,
        'test_form': test_form,
    }
    return render(request, 'administration/email_settings.html', context)


def whatsapp_settings_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_whatsapp_configuration()
    test_form = TestMessageForm()
    if request.method == 'POST':
        action = request.POST.get('action') or 'save'
        if action == 'test':
            test_form = TestMessageForm(request.POST)
            form = WhatsAppConfigurationForm(instance=record)
            if test_form.is_valid():
                _record_settings_change(request, 'whatsapp', 'Triggered test WhatsApp message.')
                messages.success(request, 'Test WhatsApp message request logged. Provider delivery wiring is still connector-based.')
        else:
            form = WhatsAppConfigurationForm(request.POST, instance=record)
            if form.is_valid():
                whatsapp = form.save(commit=False)
                whatsapp.updated_by = request.user
                whatsapp.save()
                _record_settings_change(request, 'whatsapp', 'Updated WhatsApp API settings.')
                messages.success(request, 'WhatsApp settings saved.')
                return redirect('administration-whatsapp-settings')
    else:
        form = WhatsAppConfigurationForm(instance=record)

    context = {
        **_base_context(request, 'WhatsApp Settings'),
        'whatsapp_form': form,
        'test_form': test_form,
    }
    return render(request, 'administration/whatsapp_settings.html', context)


def audit_logs_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    query = (request.GET.get('q') or '').strip()
    logs = SystemAuditLog.objects.select_related('user').order_by('-created_at')
    if query:
        logs = logs.filter(Q(user__username__icontains=query) | Q(module__icontains=query) | Q(description__icontains=query))
    context = {
        **_base_context(request, 'Audit Logs'),
        'audit_rows': logs[:200],
        'session_rows': UserSessionRecord.objects.select_related('user').order_by('-last_activity_at')[:100],
        'query': query,
    }
    return render(request, 'administration/audit_logs.html', context)


def backup_restore_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    backup_form = BackupRecordForm()
    if request.method == 'POST':
        action = request.POST.get('action') or 'backup'
        backup_form = BackupRecordForm(request.POST, request.FILES)
        if backup_form.is_valid():
            if action == 'backup':
                create_backup_snapshot(user=request.user, note=backup_form.cleaned_data['note'] or 'Manual backup')
                _record_settings_change(request, 'backup', 'Created manual backup snapshot.')
                messages.success(request, 'Backup created successfully.')
                return redirect('administration-backup-restore')
            if action == 'restore' and request.FILES.get('restore_file'):
                restore_backup_from_file(request.FILES['restore_file'])
                BackupRecord.objects.create(
                    backup_type=BackupRecord.TYPE_MANUAL,
                    note='Restore file applied',
                    created_by=request.user,
                )
                _record_settings_change(request, 'backup', 'Applied restore file to database.')
                messages.success(request, 'Restore file applied successfully.')
                return redirect('administration-backup-restore')

    context = {
        **_base_context(request, 'Backup & Restore'),
        'backup_form': backup_form,
        'backup_rows': BackupRecord.objects.select_related('created_by').order_by('-created_at')[:50],
    }
    return render(request, 'administration/backup_restore.html', context)


def appearance_settings_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_appearance_setting()
    if request.method == 'POST':
        form = AppearanceSettingForm(request.POST, request.FILES, instance=record)
        if form.is_valid():
            appearance = form.save(commit=False)
            appearance.updated_by = request.user
            appearance.save()
            _record_settings_change(request, 'appearance', 'Updated appearance settings.')
            messages.success(request, 'Appearance settings saved.')
            return redirect('administration-appearance')
    else:
        form = AppearanceSettingForm(instance=record)

    context = {
        **_base_context(request, 'Appearance'),
        'appearance_form': form,
        'appearance_record': record,
    }
    return render(request, 'administration/appearance.html', context)


def system_health_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    media_root = Path(settings.MEDIA_ROOT)
    storage_bytes = 0
    if media_root.exists():
        for item in media_root.rglob('*'):
            if item.is_file():
                storage_bytes += item.stat().st_size

    db_status = 'Connected'
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        db_status = 'Unavailable'

    context = {
        **_base_context(request, 'System Health'),
        'server_status': 'Running',
        'database_status': db_status,
        'storage_usage_mb': round(storage_bytes / (1024 * 1024), 2),
        'active_users': UserSessionRecord.objects.filter(is_active=True).values('user').distinct().count(),
        'background_jobs': BackupRecord.objects.count(),
        'api_status': 'Operational',
    }
    return render(request, 'administration/system_health.html', context)


def master_data_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    seed_master_data_defaults()
    if request.method == 'POST':
        form = MasterDataEntryForm(request.POST)
        if form.is_valid():
            form.save()
            _record_settings_change(request, 'master_data', 'Added or updated master data entry.')
            messages.success(request, 'Master data entry saved.')
            return redirect('administration-master-data')
    else:
        form = MasterDataEntryForm()

    grouped_rows = defaultdict(list)
    for row in MasterDataEntry.objects.order_by('master_type', 'display_order', 'name'):
        grouped_rows[row.get_master_type_display()].append(row)
    context = {
        **_base_context(request, 'Master Data'),
        'master_form': form,
        'grouped_rows': dict(grouped_rows),
    }
    return render(request, 'administration/master_data.html', context)


def help_support_view(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response

    ticket_form = SupportTicketForm()
    resource_form = HelpResourceForm()
    if request.method == 'POST':
        action = request.POST.get('action') or 'ticket'
        if action == 'ticket':
            ticket_form = SupportTicketForm(request.POST)
            if ticket_form.is_valid():
                ticket = ticket_form.save(commit=False)
                ticket.created_by = request.user
                ticket.save()
                _record_settings_change(request, 'support', f'Raised support ticket #{ticket.id}.')
                messages.success(request, 'Support ticket raised.')
                return redirect('administration-help-support')
        elif action == 'resource' and is_admin_like(request.user):
            resource_form = HelpResourceForm(request.POST)
            if resource_form.is_valid():
                resource_form.save()
                messages.success(request, 'Help resource saved.')
                return redirect('administration-help-support')

    resources = HelpResource.objects.filter(is_published=True).order_by('resource_type', 'display_order')
    grouped = defaultdict(list)
    for resource in resources:
        grouped[resource.get_resource_type_display()].append(resource)
    context = {
        **_base_context(request, 'Help & Support'),
        'ticket_form': ticket_form,
        'resource_form': resource_form,
        'resource_groups': dict(grouped),
        'ticket_rows': SupportTicket.objects.filter(created_by=request.user).order_by('-updated_at')[:20],
        'can_manage_resources': is_admin_like(request.user),
    }
    return render(request, 'administration/help_support.html', context)


def dashboard_settings_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_dashboard_setting()
    if request.method == 'POST':
        form = DashboardSettingForm(request.POST, instance=record)
        if form.is_valid():
            dashboard = form.save(commit=False)
            dashboard.updated_by = request.user
            dashboard.save()
            _record_settings_change(request, 'dashboard', 'Updated dashboard settings.')
            messages.success(request, 'Dashboard settings saved.')
            return redirect('administration-dashboard-settings')
    else:
        form = DashboardSettingForm(instance=record)

    context = {
        **_base_context(request, 'Dashboard Settings'),
        'dashboard_form': form,
    }
    return render(request, 'administration/dashboard_settings.html', context)


def security_settings_view(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response

    record = get_security_setting()
    if request.method == 'POST':
        form = SecuritySettingForm(request.POST, instance=record)
        if form.is_valid():
            security = form.save(commit=False)
            security.updated_by = request.user
            security.save()
            _record_settings_change(request, 'security', 'Updated security policy settings.')
            messages.success(request, 'Security settings saved.')
            return redirect('administration-security-settings')
    else:
        form = SecuritySettingForm(instance=record)

    context = {
        **_base_context(request, 'Security Settings'),
        'security_form': form,
        'login_attempt_rows': LoginAttempt.objects.order_by('-attempted_at')[:50],
    }
    return render(request, 'administration/security_settings.html', context)


def sessions_api(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response
    rows = [serialize_session_record(row) for row in UserSessionRecord.objects.filter(user=request.user).order_by('-last_activity_at')[:50]]
    return JsonResponse({'results': rows})


def audit_api(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response
    rows = [serialize_audit_log(row) for row in SystemAuditLog.objects.order_by('-created_at')[:100]]
    return JsonResponse({'results': rows})


def master_data_api(request):
    redirect_response = _admin_only(request)
    if redirect_response:
        return redirect_response
    rows = [serialize_master_data(row) for row in MasterDataEntry.objects.order_by('master_type', 'display_order', 'name')]
    return JsonResponse({'results': rows})
