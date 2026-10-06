"""Plain-dict serializers (matches the app's existing JsonResponse style)."""


def serialize_sizing(sizing):
    if not sizing:
        return None
    return {
        'dc_capacity_mwp': str(sizing.dc_capacity_mwp),
        'module_count': sizing.module_count,
        'string_count': sizing.string_count,
        'inverter_count': sizing.inverter_count,
        'transformer_count': sizing.transformer_count,
        'acdb_count': sizing.acdb_count,
        'dc_ac_ratio': str(sizing.dc_ac_ratio),
    }


def serialize_work_package(wp):
    vendor = wp.assigned_vendor
    return {
        'id': wp.id,
        'name': wp.name,
        'discipline': wp.discipline,
        'status': wp.status,
        'allocation_id': wp.allocation_id,
        'assigned_vendor_id': wp.assigned_vendor_id,
        'assigned_vendor_name': (vendor.company_name or vendor.vendor_name) if vendor else '',
        'notes': wp.notes,
    }


def serialize_stage(stage):
    return {
        'id': stage.id,
        'order': stage.order,
        'code': stage.code,
        'name': stage.name,
        'description': stage.description,
        'is_parallel': stage.is_parallel,
        'status': stage.status,
        'planned_start': stage.planned_start.isoformat() if stage.planned_start else '',
        'planned_end': stage.planned_end.isoformat() if stage.planned_end else '',
        'actual_start': stage.actual_start.isoformat() if stage.actual_start else '',
        'actual_end': stage.actual_end.isoformat() if stage.actual_end else '',
        'work_packages': [serialize_work_package(wp) for wp in stage.work_packages.all()],
    }


def serialize_boq_item(item):
    return {
        'id': item.id,
        'section_name': item.section_name,
        'section_order': item.section_order,
        'order': item.order,
        'description': item.description,
        'specification': item.specification,
        'unit': item.unit,
        'quantity': str(item.quantity),
        'material_rate': str(item.material_rate),
        'labour_rate': str(item.labour_rate),
        'is_material': item.is_material,
        'material_amount': str(item.material_amount),
        'labour_amount': str(item.labour_amount),
        'total_amount': str(item.total_amount),
    }


def serialize_boq_grouped(build):
    """BOQ items grouped by section, with section + grand totals."""
    sections = {}
    for item in build.boq_items.all():
        sec = sections.setdefault(item.section_name, {
            'name': item.section_name, 'order': item.section_order,
            'items': [], 'material_amount': 0, 'labour_amount': 0, 'total_amount': 0,
        })
        sec['items'].append(serialize_boq_item(item))
        sec['material_amount'] += float(item.material_amount)
        sec['labour_amount'] += float(item.labour_amount)
        sec['total_amount'] += float(item.total_amount)
    ordered = sorted(sections.values(), key=lambda s: s['order'])
    for s in ordered:
        s['material_amount'] = f"{s['material_amount']:.2f}"
        s['labour_amount'] = f"{s['labour_amount']:.2f}"
        s['total_amount'] = f"{s['total_amount']:.2f}"
    return ordered


def serialize_build(build, detail=True):
    totals = build.boq_totals
    data = {
        'id': build.id,
        'project_id': build.project_id,
        'project_code': getattr(build.project, 'project_code', ''),
        'project_name': getattr(build.project, 'project_name', ''),
        'project_type': build.project_type,
        'project_type_display': build.get_project_type_display(),
        'ac_capacity_mw': str(build.ac_capacity_mw),
        'foundation_type': build.foundation_type,
        'status': build.status,
        'status_display': build.get_status_display(),
        'is_editable': build.is_editable,
        'progress_percent': build.progress_percent,
        'generated_quotation_id': build.generated_quotation_id,
        'spec_set': build.spec_set.name,
        'locked_at': build.locked_at.isoformat() if build.locked_at else '',
        'boq_totals': {
            'material_amount': str(totals['material_amount']),
            'labour_amount': str(totals['labour_amount']),
            'total_amount': str(totals['total_amount']),
        },
        'sizing': serialize_sizing(getattr(build, 'sizing', None)),
    }
    if detail:
        data['stages'] = [serialize_stage(s) for s in build.stages.all()]
        data['boq_sections'] = serialize_boq_grouped(build)
    return data


def serialize_progress(entry):
    return {
        'id': entry.id,
        'site_name': entry.site_name,
        'stage_id': entry.stage_id,
        'stage_name': entry.stage.name if entry.stage_id else '',
        'work_package_id': entry.work_package_id,
        'work_package_name': entry.work_package.name if entry.work_package_id else '',
        'vendor_id': entry.vendor_id,
        'vendor_name': (entry.vendor.company_name or entry.vendor.vendor_name) if entry.vendor_id else '',
        'progress_date': entry.progress_date.isoformat() if entry.progress_date else '',
        'progress_percent': str(entry.progress_percent),
        'quantity': str(entry.quantity) if entry.quantity is not None else '',
        'unit': entry.unit,
        'status': entry.status,
        'note': entry.note,
        'photo_url': entry.photo.url if entry.photo else '',
        'reporter_name': entry.reporter_name or (entry.reported_by.get_username() if entry.reported_by_id else ''),
        'source': entry.source,
        'created_at': entry.created_at.isoformat() if entry.created_at else '',
    }


def serialize_milestone(ms):
    return {
        'id': ms.id,
        'name': ms.name,
        'order': ms.order,
        'work_package_id': ms.work_package_id,
        'work_package_name': ms.work_package.name if ms.work_package_id else '',
        'vendor_id': ms.vendor_id,
        'vendor_name': (ms.vendor.company_name or ms.vendor.vendor_name) if ms.vendor_id else '',
        'purchase_order_id': ms.purchase_order_id,
        'po_number': ms.purchase_order.po_number if ms.purchase_order_id else '',
        'trigger_type': ms.trigger_type,
        'trigger_progress_percent': str(ms.trigger_progress_percent),
        'amount': str(ms.amount),
        'retention_percent': str(ms.retention_percent),
        'retention_amount': str(ms.retention_amount),
        'net_payable': str(ms.net_payable),
        'payment_stage': ms.payment_stage,
        'status': ms.status,
        'status_display': ms.get_status_display(),
        'eligible_at': ms.eligible_at.isoformat() if ms.eligible_at else '',
        'approved_at': ms.approved_at.isoformat() if ms.approved_at else '',
        'paid_at': ms.paid_at.isoformat() if ms.paid_at else '',
        'vendor_payment_id': ms.vendor_payment_id,
        'notes': ms.notes,
    }


def serialize_certificate(cert):
    return {
        'id': cert.id,
        'certificate_number': cert.certificate_number,
        'vendor_id': cert.vendor_id,
        'vendor_name': (cert.vendor.company_name or cert.vendor.vendor_name) if cert.vendor_id else '',
        'site_name': cert.site_name,
        'scope_description': cert.scope_description,
        'issued_date': cert.issued_date.isoformat() if cert.issued_date else '',
        'status': cert.status,
        'document_url': cert.document.url if cert.document else '',
        'remarks': cert.remarks,
    }
