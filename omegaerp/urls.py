from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.static import serve as static_serve
from search.views import api_chat, api_search
from core.views import (
    material_list_api,
    material_options_api,
    material_create_api,
    import_material_master,
    clear_material_import,
    update_material_work_package,
    create_project_master,
    save_project_distribution,
    project_list_api,
    project_options_api,
    project_site_create_api,
    project_site_list_api,
    project_site_options_api,
    site_assessment_update_api,
    site_detail_api,
    register_vendor,
    resend_vendor_registration_link,
    update_vendor,
    vendor_list_api,
)
from purchase_orders.views import (
    po_activity_create_api,
    po_delivery_create_api,
    po_document_create_api,
    po_invoice_create_api,
    po_item_create_api,
    po_notification_create_api,
    po_payment_create_api,
    po_reference_create_api,
    po_vehicle_create_api,
    purchase_order_bulk_check,
    purchase_order_bulk_generate_api,
    purchase_order_create_api,
    purchase_order_dashboard_api,
    purchase_order_detail_api,
    purchase_order_list_api,
    purchase_order_update_api,
    purchase_order_vendor_options_api,
)
from reports.views import report_center_api, saved_report_create_api
from vendors.views import (
    accessible_vendors_api,
    assignment_history_api,
    assignments_api,
    available_users_api,
    my_vendors_api,
    staff_create_api,
    staff_list_api,
    staff_performance_api,
    vendor_assignment_create_api,
    vendor_assignment_remove_api,
    vendor_auto_distribute_api,
    vendor_bulk_assign_api,
    vendor_bulk_assign_upload_api,
    vendor_control_dashboard_api,
    vendor_control_detail_api,
    vendor_distribution_api,
    vendor_note_create_api,
)
from tasks.views import (
    my_followups_api,
    task_create_api,
    task_status_update_api,
    vendor_tasks_api as vendor_control_tasks_api,
)
import os

admin.site.site_header = 'OmegaERP Admin Panel'
admin.site.site_title = 'OmegaERP Admin Panel'
admin.site.index_title = 'OmegaERP Administration'

_REACT_DIST = os.path.join(settings.BASE_DIR, 'frontend', 'dist')


@ensure_csrf_cookie
def _react_index(request, **kwargs):
    index_path = os.path.join(_REACT_DIST, 'index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return HttpResponse(content, content_type='text/html')


urlpatterns = [
    path('admin/', admin.site.urls),

    # AI Assistant API
    path('api/chat/', api_chat, name='api_chat'),
    path('api/search/', api_search, name='api_search'),

    # Session auth API for the React app
    path('api/auth/', include('accounts.urls')),

    # --- Stable /api/ aliases for JSON endpoints historically only exposed
    # under template-serving prefixes (core.urls, purchase_orders.urls).
    # Each entry points at the exact same view function as the legacy path
    # below it (see core/urls.py, purchase_orders/urls.py) — same queryset,
    # same permission check, same business logic, just a second URL. The
    # legacy paths are kept working as thin aliases so nothing breaks
    # mid-migration; new frontend code should call these /api/ paths only.
    path('api/materials/master/list/', material_list_api, name='api-material-master-list'),
    path('api/materials/master/options/', material_options_api, name='api-material-master-options'),
    path('api/materials/master/create/', material_create_api, name='api-material-master-create'),
    path('api/materials/master/import/', import_material_master, name='api-material-master-import'),
    path('api/materials/master/clear/', clear_material_import, name='api-material-master-clear'),
    path('api/materials/master/work-package/', update_material_work_package, name='api-material-master-work-package'),
    path('api/projects/', project_list_api, name='api-project-list'),
    path('api/projects/options/', project_options_api, name='api-project-options'),
    path('api/projects/master/create/', create_project_master, name='api-project-master-create'),
    path('api/projects/distribution/save/', save_project_distribution, name='api-project-distribution-save'),
    # Project sites & pre-execution assessment
    path('api/projects/<int:project_id>/sites/', project_site_list_api, name='api-project-site-list'),
    path('api/projects/<int:project_id>/sites/options/', project_site_options_api, name='api-project-site-options'),
    path('api/projects/<int:project_id>/sites/create/', project_site_create_api, name='api-project-site-create'),
    path('api/sites/<int:site_id>/', site_detail_api, name='api-site-detail'),
    path('api/site-assessments/<int:assessment_id>/update/', site_assessment_update_api, name='api-site-assessment-update'),
    path('api/vendors/', vendor_list_api, name='api-vendor-list'),
    path('api/vendors/register/', register_vendor, name='api-vendor-register'),
    path('api/vendors/<str:vendor_id>/update/', update_vendor, name='api-vendor-update'),
    path('api/vendors/<str:vendor_id>/resend-link/', resend_vendor_registration_link, name='api-vendor-resend-link'),

    # Vendor onboarding-fee payment gateway (Razorpay)
    path('api/payments/', include('payments.urls')),
    path('api/deliveries/', include('deliveries.urls')),

    # Solar project work-structure & BOQ engine
    path('api/solar/', include('solar_engine.urls')),
    path('api/purchase-orders/bulk-generate/check/', purchase_order_bulk_check, name='api-po-bulk-check'),
    path('api/purchase-orders/bulk-generate/', purchase_order_bulk_generate_api, name='api-po-bulk-generate'),
    path('api/purchase-orders/dashboard/', purchase_order_dashboard_api, name='api-po-dashboard'),
    path('api/purchase-orders/vendor-options/', purchase_order_vendor_options_api, name='api-po-vendor-options'),
    path('api/purchase-orders/create/', purchase_order_create_api, name='api-po-create'),
    path('api/purchase-orders/', purchase_order_list_api, name='api-po-list'),
    path('api/purchase-orders/<int:pk>/', purchase_order_detail_api, name='api-po-detail'),
    path('api/purchase-orders/<int:pk>/update/', purchase_order_update_api, name='api-po-update'),
    path('api/purchase-orders/<int:pk>/items/', po_item_create_api, name='api-po-item-create'),
    path('api/purchase-orders/<int:pk>/references/', po_reference_create_api, name='api-po-reference-create'),
    path('api/purchase-orders/<int:pk>/deliveries/', po_delivery_create_api, name='api-po-delivery-create'),
    path('api/purchase-orders/<int:pk>/vehicles/', po_vehicle_create_api, name='api-po-vehicle-create'),
    path('api/purchase-orders/<int:pk>/invoices/', po_invoice_create_api, name='api-po-invoice-create'),
    path('api/purchase-orders/<int:pk>/payments/', po_payment_create_api, name='api-po-payment-create'),
    path('api/purchase-orders/<int:pk>/documents/', po_document_create_api, name='api-po-document-create'),
    path('api/purchase-orders/<int:pk>/activity/', po_activity_create_api, name='api-po-activity-create'),
    path('api/purchase-orders/<int:pk>/notifications/', po_notification_create_api, name='api-po-notification-create'),
    path('api/reports/', report_center_api, name='api-reports'),
    path('api/reports/saved/create/', saved_report_create_api, name='api-reports-saved-create'),

    # Vendor authorization / staff-assignment ("vendor allocation") APIs
    path('api/vendor-control/dashboard/', vendor_control_dashboard_api, name='api-vc-dashboard'),
    path('api/vendor-control/staff/', staff_list_api, name='api-vc-staff-list'),
    path('api/vendor-control/staff/create/', staff_create_api, name='api-vc-staff-create'),
    path('api/vendor-control/users/', available_users_api, name='api-vc-users'),
    path('api/vendor-control/vendors/', accessible_vendors_api, name='api-vc-vendor-options'),
    path('api/vendor-control/my-vendors/', my_vendors_api, name='api-vc-my-vendors'),
    path('api/vendor-control/vendors/<str:vendor_id>/', vendor_control_detail_api, name='api-vc-vendor-detail'),
    path('api/vendor-control/vendors/<str:vendor_id>/notes/', vendor_note_create_api, name='api-vc-vendor-notes'),
    path('api/vendor-control/assignments/', assignments_api, name='api-vc-assignments'),
    path('api/vendor-control/assignments/create/', vendor_assignment_create_api, name='api-vc-assignment-create'),
    path('api/vendor-control/assignments/<int:assignment_id>/remove/', vendor_assignment_remove_api, name='api-vc-assignment-remove'),
    path('api/vendor-control/assignments/bulk/', vendor_bulk_assign_api, name='api-vc-assignments-bulk'),
    path('api/vendor-control/assignments/bulk/upload/', vendor_bulk_assign_upload_api, name='api-vc-assignments-bulk-upload'),
    path('api/vendor-control/assignments/auto-distribute/', vendor_auto_distribute_api, name='api-vc-assignments-auto-distribute'),
    path('api/vendor-control/distribution/', vendor_distribution_api, name='api-vc-distribution'),
    path('api/vendor-control/history/', assignment_history_api, name='api-vc-history'),
    path('api/vendor-control/performance/', staff_performance_api, name='api-vc-performance'),
    path('api/vendor-control/tasks/', vendor_control_tasks_api, name='api-vc-tasks'),
    path('api/vendor-control/tasks/create/', task_create_api, name='api-vc-task-create'),
    path('api/vendor-control/tasks/<int:task_id>/status/', task_status_update_api, name='api-vc-task-status'),
    path('api/vendor-control/followups/', my_followups_api, name='api-vc-followups'),

    # Django backend modules (templates + JSON endpoints)
    path('administration/', include('administration.urls')),
    path('procurement/', include('purchase_orders.urls')),
    path('procurement/vendors/', include('vendors.urls')),
    path('procurement/reports/', include('reports.urls')),
    path('vendor-control/', include('vendors.management_urls')),

    # Root '/' → React app (must come before the core.urls include)
    path('', _react_index),

    # Core routes (vendors/list, projects, materials, vendor AJAX APIs)
    path('', include('core.urls')),

    # --- React-owned sub-paths under prefixes core.urls also uses ---
    # core.urls declares vendors/, projects/, materials/ as prefixes, and the
    # React router (frontend/src/App.jsx) independently owns other sub-paths
    # under those same prefixes (vendors/new, projects/solar-tracker, the
    # materials/quotations/* flow, etc). Everything core.urls actually
    # defines already matched above this point and never reaches these
    # entries. Listing the known React sub-paths explicitly lets the
    # tightened catch-all below safely 404 anything else under these
    # prefixes instead of silently serving the SPA for a broken/renamed
    # Django route. Keep this in sync with App.jsx.
    # DEAD until the matching core.urls entry below is removed (Step 2 of the
    # migration): include('core.urls') above already claims these exact
    # prefixes ('vendors/', 'projects/', 'materials/') and matches first, so
    # these three lines can never fire today. Left in place so the route
    # exists the moment core.urls stops claiming it — do not delete yet.
    re_path(r'^vendors/?$', _react_index),
    re_path(r'^vendors/[^/]+/?$', _react_index),                        # vendors/new, vendors/<id>
    # DEAD — see comment above; core.urls still claims 'projects/'.
    re_path(r'^projects/?$', _react_index),
    re_path(r'^projects/new/?$', _react_index),
    re_path(r'^projects/solar-tracker/?$', _react_index),
    # Site registry & assessment live under a project, so they need an explicit
    # allow here — the catch-all below excludes the whole 'projects/' prefix.
    re_path(r'^projects/[0-9]+/sites/?$', _react_index),
    re_path(r'^projects/[0-9]+/sites/(new|[0-9]+)/?$', _react_index),
    # DEAD — see comment above; core.urls still claims 'materials/'.
    re_path(r'^materials/?$', _react_index),
    re_path(r'^materials/quotations/?$', _react_index),
    re_path(r'^materials/quotations/new/?$', _react_index),
    re_path(r'^materials/quotations/[^/]+/?$', _react_index),           # quotations/<id>
    re_path(r'^materials/quotations/[^/]+/preview/?$', _react_index),   # quotations/<id>/preview

    # React build assets — served from frontend/dist/assets/
    re_path(r'^assets/(?P<path>.*)$', static_serve,
            {'document_root': os.path.join(_REACT_DIST, 'assets')}),

    # Catch-all: serves the React app for everything else React owns
    # (dashboard, purchase-orders, deliveries, payments, transport, tasks,
    # reports, notifications, assistant, administration, vendor-control,
    # login, and the client-side 404 page). Paths under prefixes Django
    # exclusively owns (admin/, api/, static/, administration/, procurement/,
    # signout/, media/) — plus anything under vendors/, projects/,
    # materials/ not explicitly allowed above — are excluded, so a broken
    # or renamed Django route now returns a real 404 instead of silently
    # rendering the SPA shell. `vendor-control/` is NOT excluded even though
    # Django still owns `vendor-control/api/...` JSON endpoints there —
    # that `include()` is matched earlier in this list, so those requests
    # never reach the catch-all regardless; excluding the whole prefix here
    # would just 404 the React pages that also live under `vendor-control/`.
    re_path(
        r'^(?!admin/|api/|static/|administration/|procurement/'
        r'|signout/|media/|vendors/|projects/|materials/).*$',
        _react_index,
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
