from django.urls import path

from . import views
from . import vendor_portal as vp

urlpatterns = [
    # Vendor / subcontractor portal (token-auth, vendor-scoped, read-only)
    path('portal/auth/', vp.vendor_auth, name='vp-auth'),
    path('portal/profile/', vp.vendor_profile, name='vp-profile'),
    path('portal/dashboard/', vp.vendor_dashboard, name='vp-dashboard'),
    path('portal/work-scope/', vp.vendor_work_scope, name='vp-work-scope'),
    path('portal/po-history/', vp.vendor_po_history, name='vp-po-history'),
    path('portal/materials/', vp.vendor_materials, name='vp-materials'),
    path('portal/logistics/', vp.vendor_logistics, name='vp-logistics'),
    path('portal/sites/', vp.vendor_sites, name='vp-sites'),
    path('portal/billing/', vp.vendor_billing, name='vp-billing'),
    path('templates/', views.templates_list_view, name='solar-templates'),
    path('vendor-options/', views.vendor_options_view, name='solar-vendor-options'),
    path('wbs-library/', views.wbs_library_view, name='solar-wbs-library'),
    path('stages/<int:stage_id>/', views.stage_update_view, name='solar-stage'),
    path('stages/<int:stage_id>/workpackages/', views.workpackage_create_view, name='solar-stage-wp-create'),
    path('builds/<int:build_id>/stages/', views.stage_create_view, name='solar-stage-create'),
    path('builds/<int:build_id>/reorder/', views.wbs_reorder_view, name='solar-wbs-reorder'),
    path('builds/<int:build_id>/milestones/', views.build_milestones_view, name='solar-milestones'),
    path('builds/<int:build_id>/billing-summary/', views.build_billing_summary_view, name='solar-billing-summary'),
    path('field/vendor-billing/', views.field_vendor_billing_view, name='solar-field-vendor-billing'),
    path('milestones/<int:milestone_id>/', views.milestone_detail_view, name='solar-milestone'),
    path('builds/<int:build_id>/handover-certificates/', views.build_certificates_view, name='solar-certificates'),
    path('handover-certificates/<int:cert_id>/pdf/', views.certificate_pdf_view, name='solar-certificate-pdf'),
    path('projects/<int:project_id>/build/', views.project_build_view, name='solar-project-build'),
    path('projects/<int:project_id>/progress/', views.project_progress_view, name='solar-project-progress'),
    path('field/ingest/', views.field_ingest_view, name='solar-field-ingest'),
    path('builds/<int:build_id>/lock/', views.build_lock_view, name='solar-build-lock'),
    path('builds/<int:build_id>/unlock/', views.build_unlock_view, name='solar-build-unlock'),
    path('builds/<int:build_id>/sizing/', views.sizing_update_view, name='solar-build-sizing'),
    path('boq-items/<int:item_id>/', views.boq_item_update_view, name='solar-boq-item'),
    path('workpackages/<int:wp_id>/', views.workpackage_update_view, name='solar-workpackage'),
]
