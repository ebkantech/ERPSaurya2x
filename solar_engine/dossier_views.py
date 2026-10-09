"""As-built dossier API — manifest (JSON) and downloadable zip."""
from django.http import JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404

from core.models import ProjectMaster
from permissions.utils import require_authenticated

from . import dossier as _dossier


def _auth(request):
    return require_authenticated(request)


def project_dossier_view(request, project_id):
    """GET → the as-built dossier manifest for the project."""
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)
    return JsonResponse(_dossier.build_manifest(project))


def project_dossier_download_view(request, project_id):
    """GET → the dossier as a downloadable .zip (DOSSIER.md + manifest.json
    + available document/certificate files)."""
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)
    name, data = _dossier.build_zip(project)
    resp = HttpResponse(data, content_type='application/zip')
    resp['Content-Disposition'] = f'attachment; filename="{name}"'
    return resp
