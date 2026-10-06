from django.urls import path

from . import views

app_name = 'deliveries'

urlpatterns = [
    path('list/', views.deliveries_list, name='deliveries-list'),
]
