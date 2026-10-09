from decimal import Decimal

from django.conf import settings
from django.db import models

from .. import constants as C

from .build import ProjectBuild

class EngineeringDocument(models.Model):
    DISC_CIVIL = 'civil'
    DISC_STRUCT = 'structural'
    DISC_ELEC = 'electrical'
    DISC_LAYOUT = 'layout'
    DISC_GEN = 'general'
    DISCIPLINE_CHOICES = [
        (DISC_CIVIL, 'Civil'), (DISC_STRUCT, 'Structural'),
        (DISC_ELEC, 'Electrical'), (DISC_LAYOUT, 'Layout / PV'),
        (DISC_GEN, 'General'),
    ]

    CAT_CAD = 'cad_drawing'
    CAT_PVSYST = 'pvsyst_layout'
    CAT_SLD = 'sld'
    CAT_DATASHEET = 'datasheet'
    CAT_STATUTORY = 'statutory'
    CAT_OTHER = 'other'
    CATEGORY_CHOICES = [
        (CAT_CAD, 'CAD Drawing'), (CAT_PVSYST, 'PVsyst Layout'),
        (CAT_SLD, 'Single Line Diagram (SLD)'), (CAT_DATASHEET, 'Datasheet'),
        (CAT_STATUTORY, 'Statutory / Approval'), (CAT_OTHER, 'Other'),
    ]

    STATUS_DRAFT = 'draft'
    STATUS_IN_REVIEW = 'in_review'
    STATUS_APPROVED = 'approved'
    STATUS_FOR_DISCOM = 'for_discom'
    STATUS_SUPERSEDED = 'superseded'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'), (STATUS_IN_REVIEW, 'In Review'),
        (STATUS_APPROVED, 'Approved'), (STATUS_FOR_DISCOM, 'Submitted for DISCOM'),
        (STATUS_SUPERSEDED, 'Superseded'),
    ]

    project = models.ForeignKey('core.ProjectMaster', on_delete=models.CASCADE, related_name='engineering_documents')
    build = models.ForeignKey(ProjectBuild, on_delete=models.SET_NULL, null=True, blank=True, related_name='engineering_documents')
    doc_no = models.CharField(max_length=60, unique=True)
    title = models.CharField(max_length=255)
    discipline = models.CharField(max_length=20, choices=DISCIPLINE_CHOICES, default=DISC_GEN)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CAT_OTHER)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    current_revision = models.ForeignKey(
        'DocumentRevision', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+',
    )
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_documents')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'solar_engineering_document'
        ordering = ['project', 'discipline', 'doc_no']

    def __str__(self):
        return f'{self.doc_no} — {self.title}'

    @property
    def latest_rev_no(self):
        return self.current_revision.rev_no if self.current_revision_id else ''


class DocumentRevision(models.Model):
    """A single version of an engineering document. Revisions are immutable
    once approved; a new upload creates the next revision and supersedes the
    previous current one."""

    STATUS_DRAFT = 'draft'
    STATUS_SUBMITTED = 'submitted'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_SUPERSEDED = 'superseded'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'), (STATUS_SUBMITTED, 'Submitted for review'),
        (STATUS_APPROVED, 'Approved'), (STATUS_REJECTED, 'Rejected'),
        (STATUS_SUPERSEDED, 'Superseded'),
    ]

    document = models.ForeignKey(EngineeringDocument, on_delete=models.CASCADE, related_name='revisions')
    rev_no = models.CharField(max_length=10)  # R0, R1, R2 …
    sequence = models.PositiveIntegerField(default=0)
    file = models.FileField(upload_to='engineering_dms/', null=True, blank=True)
    change_note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    prepared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='prepared_revisions')
    prepared_by_name = models.CharField(max_length=150, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_revisions')
    approved_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_document_revision'
        ordering = ['document', 'sequence', 'id']
        unique_together = [('document', 'rev_no')]

    def __str__(self):
        return f'{self.document.doc_no} {self.rev_no} ({self.status})'


class StatutoryApproval(models.Model):
    """Statutory / DISCOM approval tracked against a project (and optionally a
    specific document), e.g. DISCOM feeder approval, CEIG energisation,
    Chief Electrical Inspector sign-off."""

    STATUS_PENDING = 'pending'
    STATUS_SUBMITTED = 'submitted'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_RESUBMIT = 'resubmit'
    STATUS_WAIVED = 'waived'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'), (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_APPROVED, 'Approved'), (STATUS_REJECTED, 'Rejected'),
        (STATUS_RESUBMIT, 'Resubmit required'), (STATUS_WAIVED, 'Waived / N/A'),
    ]
    # statuses that satisfy a mandatory NOC for the development gate
    SATISFIED_STATUSES = (STATUS_APPROVED, STATUS_WAIVED)

    project = models.ForeignKey('core.ProjectMaster', on_delete=models.CASCADE, related_name='statutory_approvals')
    # A NOC may be project-wide (site null) or specific to one site/location.
    site = models.ForeignKey('ProjectSite', on_delete=models.CASCADE, null=True, blank=True, related_name='statutory_approvals')
    document = models.ForeignKey(EngineeringDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name='statutory_approvals')
    authority = models.CharField(max_length=120)       # DISCOM / CEIG / CEA …
    approval_type = models.CharField(max_length=150)   # feeder approval, energisation …
    reference_no = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    # A mandatory NOC/certificate gates the start of development until it is
    # Approved (or Waived). Drives the project-readiness lock.
    is_mandatory = models.BooleanField(default=False)
    submitted_date = models.DateField(null=True, blank=True)
    approved_date = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    remark = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'solar_statutory_approval'
        ordering = ['project', '-created_at', '-id']

    def __str__(self):
        return f'{self.authority} — {self.approval_type} ({self.status})'

    @property
    def is_satisfied(self):
        return self.status in self.SATISFIED_STATUSES

