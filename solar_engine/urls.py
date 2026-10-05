from django.urls import path

from . import views

urlpatterns = [
    path('templates/', views.templates_list_view, name='solar-templates'),
    path('vendor-options/', views.vendor_options_view, name='solar-vendor-options'),
    path('wbs-library/', views.wbs_library_view, name='solar-wbs-library'),
    path('stages/<int:stage_id>/', views.stage_update_view, name='solar-stage'),
    path('stages/<int:stage_id>/workpackages/', views.workpackage_create_view, name='solar-stage-wp-create'),
    path('builds/<int:build_id>/stages/', views.stage_create_view, name='solar-stage-create'),
    path('builds/<int:build_id>/reorder/', views.wbs_reorder_view, name='solar-wbs-reorder'),
    path('projects/<int:project_id>/build/', views.project_build_view, name='solar-project-build'),
    path('projects/<int:project_id>/progress/', views.project_progress_view, name='solar-project-progress'),
    path('field/ingest/', views.field_ingest_view, name='solar-field-ingest'),
    path('builds/<int:build_id>/lock/', views.build_lock_view, name='solar-build-lock'),
    path('builds/<int:build_id>/unlock/', views.build_unlock_view, name='solar-build-unlock'),
    path('builds/<int:build_id>/sizing/', views.sizing_update_view, name='solar-build-sizing'),
    path('boq-items/<int:item_id>/', views.boq_item_update_view, name='solar-boq-item'),
    path('workpackages/<int:wp_id>/', views.workpackage_update_view, name='solar-workpackage'),
]
