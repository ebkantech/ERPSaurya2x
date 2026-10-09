from django.urls import path

from . import views
from . import quality_views as qv
from . import budget_views as bv
from . import dashboard_views as dv
from . import vendor_portal as vp
from . import free_issue_views as fiv
from . import dms_views as dms
from . import work_order_views as wov
from . import site_views as sv
from . import margin_views as mv
from . import grn_views as grnv
from . import dossier_views as dsv

urlpatterns = [
    # Vendor / subcontractor portal (token-auth, vendor-scoped, read-only)
    path('portal/auth/', vp.vendor_auth, name='vp-auth'),
    path('portal/profile/', vp.vendor_profile, name='vp-profile'),
    path('portal/dashboard/', vp.vendor_dashboard, name='vp-dashboard'),
    path('portal/work-scope/', vp.vendor_work_scope, name='vp-work-scope'),
    path('portal/free-issue/', vp.vendor_free_issue, name='vp-free-issue'),
    path('portal/issue-material/', vp.vendor_issue_material, name='vp-issue-material'),
    path('portal/po-history/', vp.vendor_po_history, name='vp-po-history'),
    path('portal/materials/', vp.vendor_materials, name='vp-materials'),
    path('portal/logistics/', vp.vendor_logistics, name='vp-logistics'),
    path('portal/sites/', vp.vendor_sites, name='vp-sites'),
    path('portal/billing/', vp.vendor_billing, name='vp-billing'),
    path('portal/quality/', vp.vendor_quality, name='vp-quality'),
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
    path('projects/<int:project_id>/site-readiness/', views.site_readiness_view, name='solar-site-readiness'),
    path('projects/<int:project_id>/build/', views.project_build_view, name='solar-project-build'),
    path('projects/<int:project_id>/progress/', views.project_progress_view, name='solar-project-progress'),
    path('dashboard/', dv.dashboard_view, name='solar-dashboard'),
    path('field/ingest/', views.field_ingest_view, name='solar-field-ingest'),
    # QA / Testing + Punch list
    path('field/inspection/', qv.field_inspection_ingest, name='solar-field-inspection'),
    path('field/punch/', qv.field_punch_ingest, name='solar-field-punch'),
    path('inspection-templates/', qv.inspection_templates_view, name='solar-inspection-templates'),
    path('builds/<int:build_id>/inspections/', qv.build_inspections_view, name='solar-inspections'),
    path('inspections/<int:inspection_id>/', qv.inspection_detail_view, name='solar-inspection'),
    path('builds/<int:build_id>/punch/', qv.build_punch_view, name='solar-punch-list'),
    path('builds/<int:build_id>/budget/', bv.build_budget_view, name='solar-budget'),
    path('builds/<int:build_id>/budget/status/', bv.budget_status_view, name='solar-budget-status'),
    path('builds/<int:build_id>/budget/sync/', bv.budget_sync_view, name='solar-budget-sync'),
    path('budget-lines/<int:line_id>/', bv.budget_line_view, name='solar-budget-line'),
    path('punch/<int:punch_id>/', qv.punch_detail_view, name='solar-punch'),
    path('builds/<int:build_id>/lock/', views.build_lock_view, name='solar-build-lock'),
    path('builds/<int:build_id>/unlock/', views.build_unlock_view, name='solar-build-unlock'),
    path('builds/<int:build_id>/sizing/', views.sizing_update_view, name='solar-build-sizing'),
    path('boq-items/<int:item_id>/', views.boq_item_update_view, name='solar-boq-item'),
    path('workpackages/<int:wp_id>/', views.workpackage_update_view, name='solar-workpackage'),
    # Free-issue material: BOM, task-linked requisitions, Material Issue Slips (MIS)
    path('workpackages/<int:wp_id>/free-issue/', fiv.work_package_free_issue_view, name='solar-wp-free-issue'),
    path('workpackages/<int:wp_id>/requisitions/', fiv.requisitions_view, name='solar-wp-requisitions'),
    path('workpackages/<int:wp_id>/issue-slips/', fiv.issue_slips_view, name='solar-wp-issue-slips'),
    # Engineering & Document Management (DMS): documents, revisions, approvals
    path('projects/<int:project_id>/documents/', dms.project_documents_view, name='solar-documents'),
    path('projects/<int:project_id>/approvals/', dms.project_approvals_view, name='solar-approvals'),
    path('documents/<int:doc_id>/revisions/', dms.document_revisions_view, name='solar-doc-revisions'),
    path('revisions/<int:rev_id>/', dms.revision_detail_view, name='solar-revision'),
    path('approvals/<int:approval_id>/', dms.approval_detail_view, name='solar-approval'),
    path('projects/<int:project_id>/readiness/', dms.project_readiness_view, name='solar-readiness'),
    # Sites / locations — per-location assessment & NOC compliance
    path('projects/<int:project_id>/sites/', sv.project_sites_view, name='solar-sites'),
    path('sites/<int:site_id>/', sv.site_detail_view, name='solar-site'),
    path('assessment-items/<int:item_id>/', sv.site_assessment_detail_view, name='solar-assessment-item'),
    path('projects/<int:project_id>/margin/', mv.project_margin_view, name='solar-margin'),
    path('projects/<int:project_id>/grn/', grnv.project_grn_view, name='solar-grn'),
    path('grn/<int:grn_id>/', grnv.grn_detail_view, name='solar-grn-detail'),
    path('projects/<int:project_id>/dossier/', dsv.project_dossier_view, name='solar-dossier'),
    path('projects/<int:project_id>/dossier/download/', dsv.project_dossier_download_view, name='solar-dossier-download'),
    # Subcontractor Work Orders
    path('projects/<int:project_id>/work-orders/', wov.project_work_orders_view, name='solar-work-orders'),
    path('work-orders/<int:wo_id>/', wov.work_order_detail_view, name='solar-work-order'),
]
