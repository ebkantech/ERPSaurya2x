from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('signout/', views.sign_out, name='sign-out'),
    path('projects/', views.project_module, name='project-module'),
    path('projects/master/', views.project_master, name='project-master'),
    path('projects/distribution/', views.project_distribution, name='project-distribution'),
    path('projects/master/create/', views.create_project_master, name='project-master-create'),
    path('projects/distribution/save/', views.save_project_distribution, name='project-distribution-save'),
    path('vendors/', views.vendor_module, name='vendor-module'),
    path('vendors/list/', views.vendor_list, name='vendor-list'),
    path('vendors/registration/', views.vendor_registration, name='vendor-registration'),
    path('vendors/<str:vendor_id>/update/', views.update_vendor, name='vendor-update'),
    path('vendors/planner/', views.vendor_planner, name='vendor-planner'),
    path('materials/', views.material_module, name='material-module'),
    path('materials/master/', views.material_master, name='material-master'),
    path('materials/master/import/', views.import_material_master, name='material-master-import'),
    path('materials/master/clear/', views.clear_material_import, name='material-master-clear'),
    path('materials/master/work-package/', views.update_material_work_package, name='material-master-work-package'),
    path('materials/master/list/', views.material_list_api, name='material-master-list-api'),
    path('materials/master/options/', views.material_options_api, name='material-master-options-api'),
    path('materials/master/create/', views.material_create_api, name='material-master-create-api'),
    path('materials/quotation/', views.material_quotation, name='material-quotation'),
    path('vendors/register/', views.register_vendor, name='vendor-register'),
    path('media/files/<path:blob_path>/', views.media_blob_proxy, name='media-blob-proxy'),
]
