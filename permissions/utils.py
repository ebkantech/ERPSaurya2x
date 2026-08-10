from django.contrib.auth.views import redirect_to_login
from django.core.exceptions import PermissionDenied
from django.db.models import Q

from core.models import Vendor

from .constants import ADMIN_LIKE_ROLES, READ_ONLY_ROLES, ROLE_ADMIN, ROLE_GROUP_MAP, ROLE_SUPER_ADMIN


def get_staff_profile(user):
    if not getattr(user, 'is_authenticated', False):
        return None
    return getattr(user, 'staff_profile', None)


def get_user_role(user):
    if not getattr(user, 'is_authenticated', False):
        return None
    if user.is_superuser:
        return ROLE_SUPER_ADMIN

    profile = get_staff_profile(user)
    if profile and profile.is_active:
        return profile.role

    user_groups = set(user.groups.values_list('name', flat=True))
    for role_value, group_name in ROLE_GROUP_MAP.items():
        if group_name in user_groups:
            return role_value

    return None


def is_admin_like(user):
    return get_user_role(user) in ADMIN_LIKE_ROLES or getattr(user, 'is_superuser', False)


def is_view_only(user):
    return get_user_role(user) in READ_ONLY_ROLES


def can_create_vendors(user):
    """Whether ``user`` may create vendor records.

    Single source of truth for the vendor-create gate shared by the two
    creation paths (``core.views.register_vendor`` and
    ``vendors.views.vendor_master``): admin-like users always may; other roles
    need ``can_create`` on the ``vendors`` module. Anonymous users get ``False``
    because ``get_user_role`` returns ``None`` for them.
    """
    if is_admin_like(user):
        return True
    role = get_user_role(user)
    if not role:
        return False
    from .models import RolePermission
    perm = RolePermission.objects.filter(role=role, module_key='vendors').first()
    return bool(perm and perm.can_create)


def require_authenticated(request):
    if request.user.is_authenticated:
        return None
    return redirect_to_login(request.get_full_path(), login_url='/admin/login/')


def require_admin_access(request):
    redirect_response = require_authenticated(request)
    if redirect_response:
        return redirect_response
    if is_admin_like(request.user):
        return None
    raise PermissionDenied('Admin access required.')


def get_active_vendor_assignments(user):
    from vendors.models import VendorAssignment

    profile = get_staff_profile(user)
    if is_admin_like(user):
        return VendorAssignment.objects.filter(assignment_status=VendorAssignment.STATUS_ACTIVE)
    if not profile or not profile.is_active:
        return VendorAssignment.objects.none()
    return VendorAssignment.objects.filter(
        assigned_staff=profile,
        assignment_status=VendorAssignment.STATUS_ACTIVE,
    )


def get_accessible_vendor_queryset(user):
    if is_admin_like(user):
        return Vendor.objects.all()
    assignment_vendor_ids = get_active_vendor_assignments(user).values_list('vendor_id', flat=True)
    return Vendor.objects.filter(id__in=assignment_vendor_ids)


def get_accessible_task_queryset(user):
    from tasks.models import VendorTask

    if is_admin_like(user):
        return VendorTask.objects.all()
    profile = get_staff_profile(user)
    if not profile or not profile.is_active:
        return VendorTask.objects.none()
    vendor_ids = get_active_vendor_assignments(user).values_list('vendor_id', flat=True)
    return VendorTask.objects.filter(
        Q(assigned_staff=profile) | Q(vendor_id__in=vendor_ids)
    ).distinct()


def ensure_vendor_access(user, vendor):
    if is_admin_like(user):
        return
    if not get_accessible_vendor_queryset(user).filter(pk=vendor.pk).exists():
        raise PermissionDenied('You are not authorized to access this vendor.')


def ensure_task_access(user, task, write=False):
    if is_admin_like(user):
        return
    if write and is_view_only(user):
        raise PermissionDenied('Viewer role cannot update vendor tasks.')
    if not get_accessible_task_queryset(user).filter(pk=task.pk).exists():
        raise PermissionDenied('You are not authorized to access this task.')


def ensure_vendor_write_access(user, vendor):
    ensure_vendor_access(user, vendor)
    if is_view_only(user):
        raise PermissionDenied('Viewer role cannot modify vendor records.')


def role_label(user):
    role = get_user_role(user)
    if role == ROLE_SUPER_ADMIN:
        return 'Super Admin'
    if role == ROLE_ADMIN:
        return 'Admin'
    return ROLE_GROUP_MAP.get(role, role or 'Guest')
