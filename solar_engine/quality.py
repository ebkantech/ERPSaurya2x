"""QA/Testing helpers: predefined checkpoint templates per inspection type,
and creation helpers shared by the ERP and field-ingest endpoints."""
from .models import QualityCheckpoint, QualityInspection

# Each template: (parameter, spec/acceptance, unit)
CHECKPOINT_TEMPLATES = {
    QualityInspection.TYPE_TORQUE: [
        ('MMS purlin bolt torque', 'as per MMS datasheet', 'Nm'),
        ('Module clamp torque', '16-18', 'Nm'),
        ('Earthing bolt torque', 'as per spec', 'Nm'),
        ('Rafter-to-column bolt torque', 'as per spec', 'Nm'),
    ],
    QualityInspection.TYPE_MEGGER: [
        ('Insulation resistance DC+ to earth', '> 1', 'MΩ'),
        ('Insulation resistance DC- to earth', '> 1', 'MΩ'),
        ('Insulation resistance AC phase to earth', '> 1', 'MΩ'),
        ('Test voltage applied', '500/1000', 'V'),
    ],
    QualityInspection.TYPE_EARTHING: [
        ('Earth pit resistance', '< 1', 'Ω'),
        ('MMS earthing continuity', '< 1', 'Ω'),
        ('Inverter body continuity', '< 1', 'Ω'),
        ('LA / earthing grid continuity', '< 1', 'Ω'),
    ],
    QualityInspection.TYPE_IV: [
        ('String Isc', 'within ±5% of rated', 'A'),
        ('String Voc', 'within ±5% of rated', 'V'),
        ('Pmax deviation', '< 5', '%'),
        ('Fill factor', '> 0.70', ''),
    ],
    QualityInspection.TYPE_PRECOMM: [
        ('String polarity check', 'correct', ''),
        ('Open-circuit voltage per string', 'within range', 'V'),
        ('Inverter parameter configuration', 'as per design', ''),
        ('SCADA / monitoring communication', 'online', ''),
        ('Protection & relay settings', 'as per design', ''),
    ],
    QualityInspection.TYPE_GENERAL: [
        ('Visual inspection', 'no defect', ''),
    ],
}


def template_for(inspection_type):
    return CHECKPOINT_TEMPLATES.get(inspection_type, CHECKPOINT_TEMPLATES[QualityInspection.TYPE_GENERAL])


def apply_template(inspection):
    """Seed an inspection's checkpoints from its type template (if it has none)."""
    if inspection.checkpoints.exists():
        return
    rows = [
        QualityCheckpoint(inspection=inspection, order=i, parameter=p, spec=s, unit=u)
        for i, (p, s, u) in enumerate(template_for(inspection.inspection_type))
    ]
    QualityCheckpoint.objects.bulk_create(rows)


def set_checkpoints(inspection, items):
    """Replace an inspection's checkpoints from a list of dicts
    ({parameter, spec, measured, unit, result, remark})."""
    inspection.checkpoints.all().delete()
    rows = []
    for i, it in enumerate(items or []):
        param = (it.get('parameter') or '').strip()
        if not param:
            continue
        result = (it.get('result') or QualityCheckpoint.RESULT_NA).strip()
        if result not in dict(QualityCheckpoint.RESULT_CHOICES):
            result = QualityCheckpoint.RESULT_NA
        rows.append(QualityCheckpoint(
            inspection=inspection, order=i, parameter=param[:200],
            spec=(it.get('spec') or '')[:120], measured=(it.get('measured') or '')[:120],
            unit=(it.get('unit') or '')[:40], result=result,
            remark=(it.get('remark') or '')[:255],
        ))
    if rows:
        QualityCheckpoint.objects.bulk_create(rows)


def auto_status(inspection):
    """Derive pass/fail from checkpoints: any fail → failed; all decided → passed."""
    roll = inspection.result_rollup
    if roll['failed'] > 0:
        return QualityInspection.STATUS_FAILED
    if roll['total'] > 0 and roll['passed'] == roll['total']:
        return QualityInspection.STATUS_PASSED
    return QualityInspection.STATUS_PENDING
