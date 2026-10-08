"""Engineering & Document Management (DMS) API — ERP-session authenticated.
Documents, revision (version) control, and statutory/DISCOM approvals."""
import json

from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from core.models import ProjectMaster
from permissions.utils import require_authenticated

from . import dms
from .services import EngineError
from .models import (
    ProjectBuild, EngineeringDocument, DocumentRevision, StatutoryApproval,
)


def _auth(request):
    return require_authenticated(request)


def _body(request):
    if request.content_type and 'application/json' in request.content_type:
        try:
            return json.loads(request.body or '{}')
        except (ValueError, TypeError):
            return {}
    return request.POST


def project_documents_view(request, project_id):
    """GET  → the project's engineering documents (with revisions).
    POST → create a document + its first (R0) revision.
           body: {doc_no, title, discipline?, category?, build_id?, change_note?}
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'GET':
        docs = EngineeringDocument.objects.filter(project=project).prefetch_related('revisions')
        return JsonResponse({'documents': [dms.document_summary(d) for d in docs]})

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    doc_no = (data.get('doc_no') or '').strip()
    title = (data.get('title') or '').strip()
    if not doc_no or not title:
        return JsonResponse({'error': 'doc_no and title are required.'}, status=400)
    if EngineeringDocument.objects.filter(doc_no=doc_no).exists():
        return JsonResponse({'error': f'Document {doc_no} already exists.'}, status=400)
    disc = data.get('discipline') or EngineeringDocument.DISC_GEN
    cat = data.get('category') or EngineeringDocument.CAT_OTHER
    if disc not in dict(EngineeringDocument.DISCIPLINE_CHOICES):
        return JsonResponse({'error': 'Invalid discipline.'}, status=400)
    if cat not in dict(EngineeringDocument.CATEGORY_CHOICES):
        return JsonResponse({'error': 'Invalid category.'}, status=400)
    build = None
    if data.get('build_id'):
        build = ProjectBuild.objects.filter(pk=data['build_id'], project=project).first()

    doc = EngineeringDocument.objects.create(
        project=project, build=build, doc_no=doc_no[:60], title=title[:255],
        discipline=disc, category=cat,
        owner=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
        note=data.get('note') or '',
    )
    # First revision R0.
    dms.add_revision(
        doc, file=request.FILES.get('file'), change_note=data.get('change_note') or 'Initial issue',
        user=getattr(request, 'user', None), prepared_by_name=data.get('prepared_by_name') or '',
        status=DocumentRevision.STATUS_DRAFT,
    )
    return JsonResponse({'message': f'Document {doc.doc_no} created.',
                         'document': dms.document_summary(doc)}, status=201)


def document_revisions_view(request, doc_id):
    """GET  → the document's revisions.
    POST → add the next revision (supersedes the previous, becomes current).
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    doc = get_object_or_404(EngineeringDocument, pk=doc_id)

    if request.method == 'GET':
        return JsonResponse(dms.document_summary(doc))

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    rev = dms.add_revision(
        doc, file=request.FILES.get('file'), change_note=data.get('change_note') or '',
        user=getattr(request, 'user', None), prepared_by_name=data.get('prepared_by_name') or '',
        status=data.get('status') or DocumentRevision.STATUS_DRAFT,
    )
    return JsonResponse({'message': f'Revision {rev.rev_no} added.',
                         'document': dms.document_summary(doc)}, status=201)


def revision_detail_view(request, rev_id):
    """POST {status} → set a revision's status (approve/reject/submit)."""
    redirect = _auth(request)
    if redirect:
        return redirect
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    rev = get_object_or_404(DocumentRevision, pk=rev_id)
    data = _body(request)
    try:
        dms.set_revision_status(rev, data.get('status') or '', user=getattr(request, 'user', None))
    except EngineError as e:
        return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'message': f'Revision {rev.rev_no} is now {rev.get_status_display()}.',
                         'document': dms.document_summary(rev.document)})


def project_approvals_view(request, project_id):
    """GET  → statutory / DISCOM approvals for the project.
    POST → create / update a statutory approval record.
    """
    redirect = _auth(request)
    if redirect:
        return redirect
    project = get_object_or_404(ProjectMaster, pk=project_id)

    if request.method == 'GET':
        rows = [{
            'id': a.id, 'authority': a.authority, 'approval_type': a.approval_type,
            'reference_no': a.reference_no, 'status': a.status, 'status_display': a.get_status_display(),
            'submitted_date': a.submitted_date.isoformat() if a.submitted_date else '',
            'approved_date': a.approved_date.isoformat() if a.approved_date else '',
            'valid_until': a.valid_until.isoformat() if a.valid_until else '',
            'document_id': a.document_id, 'remark': a.remark,
        } for a in project.statutory_approvals.all()]
        return JsonResponse({'approvals': rows})

    if request.method != 'POST':
        return JsonResponse({'error': 'GET/POST required'}, status=405)

    data = _body(request)
    authority = (data.get('authority') or '').strip()
    approval_type = (data.get('approval_type') or '').strip()
    if not authority or not approval_type:
        return JsonResponse({'error': 'authority and approval_type are required.'}, status=400)
    doc = None
    if data.get('document_id'):
        doc = EngineeringDocument.objects.filter(pk=data['document_id'], project=project).first()
    status = data.get('status') or StatutoryApproval.STATUS_PENDING
    if status not in dict(StatutoryApproval.STATUS_CHOICES):
        return JsonResponse({'error': 'Invalid status.'}, status=400)
    appr = StatutoryApproval.objects.create(
        project=project, document=doc, authority=authority[:120],
        approval_type=approval_type[:150], reference_no=(data.get('reference_no') or '')[:80],
        status=status, submitted_date=data.get('submitted_date') or None,
        approved_date=data.get('approved_date') or None, valid_until=data.get('valid_until') or None,
        remark=data.get('remark') or '',
    )
    return JsonResponse({'message': 'Approval recorded.', 'id': appr.id}, status=201)
