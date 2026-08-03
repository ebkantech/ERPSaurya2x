from django.urls import path

from . import quotation_views, views

urlpatterns = [
    path('', views.procurement_dashboard, name='procurement-dashboard'),
    path('purchase-orders/', views.purchase_order_master, name='purchase-order-master'),
    path('purchase-orders/bulk-generate/', views.purchase_order_bulk_generator, name='purchase-order-bulk-generator'),
    # Also mounted at /api/purchase-orders/bulk-generate/check/ in omegaerp/urls.py
    # (same view, unchanged) — that's the stable path new frontend code should call.
    path('purchase-orders/bulk-generate/check/', views.purchase_order_bulk_check, name='purchase-order-bulk-check'),
    path('purchase-orders/<int:pk>/', views.purchase_order_detail, name='purchase-order-detail'),
    path('api/dashboard/', views.purchase_order_dashboard_api, name='purchase-order-dashboard-api'),
    path('api/purchase-orders/<int:pk>/', views.purchase_order_detail_api, name='purchase-order-detail-api'),
    path('api/vendors/', views.purchase_order_vendor_options_api, name='purchase-order-vendor-options-api'),
    path('api/bulk-generate/', views.purchase_order_bulk_generate_api, name='purchase-order-bulk-generate-api'),
    path('api/quotations/', quotation_views.quotation_list_api, name='quotation-list-api'),
    path('api/quotations/create/', quotation_views.quotation_create_api, name='quotation-create-api'),
    path('api/quotations/<int:pk>/', quotation_views.quotation_detail_api, name='quotation-detail-api'),
    path('api/quotations/<int:pk>/update/', quotation_views.quotation_update_api, name='quotation-update-api'),
    path('api/quotations/<int:pk>/verify/', quotation_views.quotation_verify_api, name='quotation-verify-api'),
    path(
        'api/quotations/<int:pk>/generate-po/',
        quotation_views.quotation_generate_po_api,
        name='quotation-generate-po-api',
    ),
    path('api/quotations/<int:pk>/pdf/', quotation_views.quotation_pdf_api, name='quotation-pdf-api'),
]
