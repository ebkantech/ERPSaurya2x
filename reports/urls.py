from django.urls import path

from . import views

urlpatterns = [
    path('api/', views.report_center_api, name='report-center-api'),
    path('api/saved/create/', views.saved_report_create_api, name='saved-report-create-api'),
]
