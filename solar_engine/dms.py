"""Engineering & Document Management (DMS) — services.

Revision (version) control: a document's revisions are sequenced R0, R1, R2…
Adding a revision supersedes the previous current revision and repoints the
document at the new one. Approving a revision marks the document Approved.
"""
from django.db import transaction
from django.utils import timezone

from .services import EngineError
from .models import EngineeringDocument, DocumentRevision, StatutoryApproval


def _next_rev(document):
    last = document.revisions.order_by('-sequence').first()
    seq = (last.sequence + 1) if last else 0
    return seq, f'R{seq}'


@transaction.atomic
def add_revision(document, file=None, change_note='', user=None, prepared_by_name='',
                 status=DocumentRevision.STATUS_DRAFT):
    """Create the next revision of a document and make it current. The prior
    current revision is marked superseded."""
    seq, rev_no = _next_rev(document)
    rev = DocumentRevision.objects.create(
        document=document, rev_no=rev_no, sequence=seq, file=file or None,
        change_note=change_note or '', status=status,
        prepared_by=user if (user and getattr(user, 'is_authenticated', False)) else None,
        prepared_by_name=prepared_by_name or '',
    )
    prev = document.current_revision
    if prev and prev.id != rev.id and prev.status != DocumentRevision.STATUS_REJECTED:
        prev.status = DocumentRevision.STATUS_SUPERSEDED
        prev.save(update_fields=['status'])
    document.current_revision = rev
    if document.status == EngineeringDocument.STATUS_APPROVED:
        document.status = EngineeringDocument.STATUS_IN_REVIEW  # new rev needs re-approval
    document.save(update_fields=['current_revision', 'status', 'updated_at'])
    return rev


@transaction.atomic
def set_revision_status(rev, status, user=None):
    """Approve / reject / submit a revision and sync the parent document."""
    valid = dict(DocumentRevision.STATUS_CHOICES)
    if status not in valid:
        raise EngineError(f'Invalid revision status: {status}')
    rev.status = status
    if status == DocumentRevision.STATUS_APPROVED:
        rev.approved_on = timezone.now().date()
        if user and getattr(user, 'is_authenticated', False):
            rev.reviewed_by = user
    rev.save()

    doc = rev.document
    # Only the current revision drives the document status.
    if doc.current_revision_id == rev.id:
        if status == DocumentRevision.STATUS_APPROVED:
            doc.status = EngineeringDocument.STATUS_APPROVED
        elif status == DocumentRevision.STATUS_SUBMITTED:
            doc.status = EngineeringDocument.STATUS_IN_REVIEW
        elif status == DocumentRevision.STATUS_REJECTED:
            doc.status = EngineeringDocument.STATUS_DRAFT
        doc.save(update_fields=['status', 'updated_at'])
    return rev


def document_summary(doc):
    cur = doc.current_revision
    return {
        'id': doc.id, 'doc_no': doc.doc_no, 'title': doc.title,
        'discipline': doc.discipline, 'discipline_display': doc.get_discipline_display(),
        'category': doc.category, 'category_display': doc.get_category_display(),
        'status': doc.status, 'status_display': doc.get_status_display(),
        'project_id': doc.project_id, 'build_id': doc.build_id,
        'current_rev': cur.rev_no if cur else '',
        'current_rev_status': cur.status if cur else '',
        'revision_count': doc.revisions.count(),
        'updated_at': doc.updated_at.isoformat(),
        'revisions': [{
            'id': r.id, 'rev_no': r.rev_no, 'status': r.status,
            'status_display': r.get_status_display(),
            'change_note': r.change_note,
            'prepared_by': r.prepared_by_name or (r.prepared_by.get_username() if r.prepared_by_id else ''),
            'approved_on': r.approved_on.isoformat() if r.approved_on else '',
            'has_file': bool(r.file),
            'created_at': r.created_at.isoformat(),
        } for r in doc.revisions.all()],
    }
