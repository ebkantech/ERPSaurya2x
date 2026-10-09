"""As-built dossier packager (O&M handover, module 7).

Assembles the project close-out set into one manifest (and a downloadable
zip): approved engineering documents, statutory NOCs, QA inspections + punch
status, module/inverter serial mapping (from GRN), handover certificates and
the site/capacity summary.
"""
import io
import json
import zipfile

from .models import (
    ProjectBuild, EngineeringDocument, StatutoryApproval,
    QualityInspection, PunchItem, GoodsReceiptNote, GoodsReceiptLine,
    HandoverCertificate, ProjectSite,
)


def _build(project):
    try:
        return project.build
    except ProjectBuild.DoesNotExist:
        return None


def build_manifest(project):
    build = _build(project)

    docs = EngineeringDocument.objects.filter(
        project=project, status=EngineeringDocument.STATUS_APPROVED).select_related('current_revision')
    documents = [{
        'doc_no': d.doc_no, 'title': d.title, 'discipline': d.get_discipline_display(),
        'category': d.get_category_display(),
        'revision': d.current_revision.rev_no if d.current_revision_id else '',
        'approved_on': (d.current_revision.approved_on.isoformat()
                        if d.current_revision_id and d.current_revision.approved_on else ''),
    } for d in docs]

    approvals = [{
        'authority': a.authority, 'approval_type': a.approval_type,
        'reference_no': a.reference_no, 'status': a.get_status_display(),
        'site': a.site.site_name if a.site_id else '',
    } for a in StatutoryApproval.objects.filter(project=project).select_related('site')]
    approvals_approved = [a for a in approvals if a['status'] in ('Approved', 'Waived / N/A')]

    inspections, punch_open, punch_total = [], 0, 0
    if build:
        inspections = [{
            'type': i.inspection_type, 'date': i.inspection_date.isoformat() if i.inspection_date else '',
            'status': i.get_status_display(),
            'work_package': i.work_package.name if i.work_package_id else '',
        } for i in build.inspections.all()]
        punch_total = build.punch_items.count()
        punch_open = build.punch_items.filter(status=PunchItem.STATUS_OPEN).count()

    # module / inverter serial mapping from goods receipts
    serials = []
    for l in GoodsReceiptLine.objects.filter(grn__project=project).select_related('grn'):
        nums = [s.strip() for s in (l.serial_numbers or '').replace(',', '\n').splitlines() if s.strip()]
        if nums:
            serials.append({'material': l.material_name, 'grn_no': l.grn.grn_no,
                            'count': len(nums), 'serials': nums})
    serial_total = sum(s['count'] for s in serials)

    certificates = []
    if build:
        certificates = [{
            'certificate_number': c.certificate_number, 'vendor': c.vendor.company_name if c.vendor_id else '',
            'site_name': c.site_name, 'status': c.get_status_display(),
            'issued_date': c.issued_date.isoformat() if c.issued_date else '',
        } for c in build.handover_certificates.select_related('vendor')]

    sites = [{'site_name': s.site_name, 'location': s.location, 'capacity_mw': str(s.capacity_mw),
              'status': s.get_status_display()} for s in ProjectSite.objects.filter(project=project)]

    # readiness: dossier is "complete" when the key sections are present
    ready = bool(documents) and punch_open == 0 and bool(certificates)

    return {
        'project': {
            'name': project.project_name, 'code': project.project_code,
            'client': getattr(project, 'client_name', '') or '',
            'location': getattr(project, 'project_location', '') or '',
            'total_mw': str(project.total_mw or 0),
        },
        'ready': ready,
        'counts': {
            'documents_approved': len(documents),
            'nocs_approved': len(approvals_approved),
            'inspections': len(inspections),
            'punch_open': punch_open, 'punch_total': punch_total,
            'serials': serial_total,
            'certificates': len(certificates),
            'sites': len(sites),
        },
        'documents': documents,
        'approvals': approvals,
        'inspections': inspections,
        'serial_mapping': serials,
        'certificates': certificates,
        'sites': sites,
    }


def _markdown(m):
    p = m['project']
    L = [f"# As-Built Handover Dossier — {p['name']} ({p['code']})",
         f"Client: {p['client']}  ·  Location: {p['location']}  ·  Capacity: {p['total_mw']} MW",
         f"Status: {'COMPLETE' if m['ready'] else 'INCOMPLETE'}", ""]
    c = m['counts']
    L += ["## Summary",
          f"- Approved drawings/documents: {c['documents_approved']}",
          f"- Statutory NOCs approved: {c['nocs_approved']}",
          f"- QA inspections: {c['inspections']}  ·  Punch open/total: {c['punch_open']}/{c['punch_total']}",
          f"- Serial numbers mapped: {c['serials']}",
          f"- Handover certificates: {c['certificates']}  ·  Sites: {c['sites']}", ""]
    L.append("## As-built documents")
    for d in m['documents']:
        L.append(f"- {d['doc_no']} — {d['title']} [{d['discipline']}] rev {d['revision']} (approved {d['approved_on']})")
    L.append("\n## Statutory / NOC approvals")
    for a in m['approvals']:
        L.append(f"- {a['authority']} · {a['approval_type']} — {a['status']}{(' @ ' + a['site']) if a['site'] else ''}")
    L.append("\n## Module / inverter serial mapping")
    for s in m['serial_mapping']:
        L.append(f"- {s['material']} ({s['grn_no']}): {s['count']} serials")
        L.append(f"    {', '.join(s['serials'][:50])}{' …' if s['count'] > 50 else ''}")
    L.append("\n## Handover certificates")
    for cert in m['certificates']:
        L.append(f"- {cert['certificate_number']} — {cert['vendor']} @ {cert['site_name']} [{cert['status']}] {cert['issued_date']}")
    L.append("\n## Sites / locations")
    for s in m['sites']:
        L.append(f"- {s['site_name']} ({s['location']}) — {s['capacity_mw']} MW [{s['status']}]")
    return "\n".join(L) + "\n"


def build_zip(project):
    """Return (filename, bytes) for the dossier zip: a human-readable
    DOSSIER.md, the machine-readable manifest.json, and any available uploaded
    document files (best effort)."""
    m = build_manifest(project)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('DOSSIER.md', _markdown(m))
        z.writestr('manifest.json', json.dumps(m, indent=2))
        # best-effort: include approved document revision files that exist
        build = _build(project)
        for d in EngineeringDocument.objects.filter(project=project, status=EngineeringDocument.STATUS_APPROVED):
            rev = d.current_revision
            if rev and rev.file:
                try:
                    with rev.file.open('rb') as fh:
                        z.writestr(f"documents/{d.doc_no}_{rev.rev_no}_{rev.file.name.split('/')[-1]}", fh.read())
                except Exception:
                    pass
        if build:
            for c in build.handover_certificates.all():
                if c.document:
                    try:
                        with c.document.open('rb') as fh:
                            z.writestr(f"certificates/{c.certificate_number or c.id}_{c.document.name.split('/')[-1]}", fh.read())
                    except Exception:
                        pass
    code = project.project_code or f'project-{project.id}'
    return f'dossier_{code}.zip', buf.getvalue()
