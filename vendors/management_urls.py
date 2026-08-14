from django.urls import path

from tasks import views as task_views

from . import views

urlpatterns = [
    path('api/dashboard/', views.vendor_control_dashboard_api, name='vendor-auth-api-dashboard'),
    path('api/staff/', views.staff_list_api, name='vendor-auth-api-staff-list'),
    path('api/staff/create/', views.staff_create_api, name='vendor-auth-api-staff-create'),
    path('api/users/', views.available_users_api, name='vendor-auth-api-users'),
    path('api/vendors/', views.accessible_vendors_api, name='vendor-auth-api-vendors'),
    path('api/my-vendors/', views.my_vendors_api, name='vendor-auth-api-my-vendors'),
    path('api/vendors/<str:vendor_id>/', views.vendor_control_detail_api, name='vendor-auth-api-vendor-detail'),
    path('api/vendors/<str:vendor_id>/notes/', views.vendor_note_create_api, name='vendor-auth-api-vendor-notes'),
    path('api/assignments/', views.assignments_api, name='vendor-auth-api-assignments'),
    path('api/assignments/create/', views.vendor_assignment_create_api, name='vendor-auth-api-assignment-create'),
    path('api/assignments/<int:assignment_id>/remove/', views.vendor_assignment_remove_api, name='vendor-auth-api-assignment-remove'),
    path('api/assignments/bulk/', views.vendor_bulk_assign_api, name='vendor-auth-api-assignments-bulk'),
    path('api/assignments/bulk/upload/', views.vendor_bulk_assign_upload_api, name='vendor-auth-api-assignments-bulk-upload'),
    path('api/assignments/auto-distribute/', views.vendor_auto_distribute_api, name='vendor-auth-api-assignments-auto-distribute'),
    path('api/distribution/', views.vendor_distribution_api, name='vendor-auth-api-distribution'),
    path('api/history/', views.assignment_history_api, name='vendor-auth-api-history'),
    path('api/performance/', views.staff_performance_api, name='vendor-auth-api-performance'),
    path('api/tasks/', task_views.vendor_tasks_api, name='vendor-auth-api-tasks'),
    path('api/tasks/create/', task_views.task_create_api, name='vendor-auth-api-task-create'),
    path('api/tasks/<int:task_id>/status/', task_views.task_status_update_api, name='vendor-auth-api-task-status'),
    path('api/followups/', task_views.my_followups_api, name='vendor-auth-api-followups'),
]
