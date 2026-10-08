from django.urls import path
from . import views

# NOTE: material_list_api, material_options_api, material_create_api,
# import_material_master, clear_material_import, update_material_work_package,
# create_project_master, save_project_distribution, register_vendor, and
# update_vendor are also mounted under /api/... in omegaerp/urls.py — that is
# the stable path new frontend code should call. The paths below are kept
# working as thin aliases (same view function, unchanged) during migration.
urlpatterns = [
    path('signout/', views.sign_out, name='sign-out'),
    path('projects/master/create/', views.create_project_master, name='project-master-create'),
    path('projects/distribution/save/', views.save_project_distribution, name='project-distribution-save'),
    path('vendors/<str:vendor_id>/update/', views.update_vendor, name='vendor-update'),
    path('materials/master/import/', views.import_material_master, name='material-master-import'),
    path('materials/master/clear/', views.clear_material_import, name='material-master-clear'),
    path('materials/master/work-package/', views.update_material_work_package, name='material-master-work-package'),
    path('materials/master/list/', views.material_list_api, name='material-master-list-api'),
    path('materials/master/options/', views.material_options_api, name='material-master-options-api'),
    path('materials/master/create/', views.material_create_api, name='material-master-create-api'),
    path('vendors/register/', views.register_vendor, name='vendor-register'),
    path('media/files/<path:blob_path>/', views.media_blob_proxy, name='media-blob-proxy'),
]
