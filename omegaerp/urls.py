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
    register_vendor,
    update_vendor,
)
from purchase_orders.views import purchase_order_bulk_check
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
    path('api/projects/master/create/', create_project_master, name='api-project-master-create'),
    path('api/projects/distribution/save/', save_project_distribution, name='api-project-distribution-save'),
    path('api/vendors/register/', register_vendor, name='api-vendor-register'),
    path('api/vendors/<str:vendor_id>/update/', update_vendor, name='api-vendor-update'),
    path('api/purchase-orders/bulk-generate/check/', purchase_order_bulk_check, name='api-po-bulk-check'),

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
    re_path(r'^vendors/?$', _react_index),
    re_path(r'^vendors/[^/]+/?$', _react_index),                        # vendors/new, vendors/<id>
    re_path(r'^projects/?$', _react_index),
    re_path(r'^projects/new/?$', _react_index),
    re_path(r'^projects/solar-tracker/?$', _react_index),
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
    # reports, notifications, assistant, administration, login, and the
    # client-side 404 page). Paths under prefixes Django exclusively owns
    # (admin/, api/, static/, administration/, procurement/, vendor-control/,
    # signout/, media/) — plus anything under vendors/, projects/,
    # materials/ not explicitly allowed above — are excluded, so a broken
    # or renamed Django route now returns a real 404 instead of silently
    # rendering the SPA shell.
    re_path(
        r'^(?!admin/|api/|static/|administration/|procurement/|vendor-control/'
        r'|signout/|media/|vendors/|projects/|materials/).*$',
        _react_index,
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
