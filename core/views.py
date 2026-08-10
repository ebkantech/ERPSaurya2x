import datetime
import json
import traceback
import zipfile
from collections import defaultdict
from decimal import Decimal
from xml.etree import ElementTree as ET

from django.conf import settings
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from .import_utils import (
    load_xlsx_rows as _load_xlsx_rows,
    normalize_header as _normalize_material_header,
    to_decimal_or_none as _to_decimal_or_none,
    to_int_or_none as _to_int_or_none,
)
from .material_catalog import DEFAULT_BUSINESS_UNITS, DEFAULT_WORK_PACKAGES, MATERIAL_IMPORT_SCHEMA
from .models import (
    BusinessUnit,
    MaterialMaster,
    MaterialQuotation,
    ProjectMaster,
    ProjectPlanner,
    ProjectWorkAllocation,
    Vendor,
    WorkPackage,
)
from .storage_backends import build_blob_download_response

VENDOR_TYPE_OPTIONS = ['private limited', 'proprieter', 'partner', 'individual']
VENDOR_CATEGORY_OPTIONS = ['service-provider', 'sub-contractor']
ACCOUNT_TYPE_OPTIONS = ['savings', 'current', 'cash credit', 'other']
BANK_PROOF_TYPE_OPTIONS = ['passbook', 'cancelled-cheque']
QUALIFICATION_STATUS_OPTIONS = ['qualified', 'disqualified']
GST_PENDING_STATUS_OPTIONS = ['more than year', 'less than second year']

PROJECT_STATUS_RUNNING = 'running'
PROJECT_STATUS_COMPLETED = 'completed'
PROJECT_STATUS_ALIGNED = 'aligned'
PROJECT_STATUS_ORDER = [
    PROJECT_STATUS_RUNNING,
    PROJECT_STATUS_COMPLETED,
    PROJECT_STATUS_ALIGNED,
]
PROJECT_STATUS_LABELS = {
    PROJECT_STATUS_RUNNING: 'Running',
    PROJECT_STATUS_COMPLETED: 'Completed',
    PROJECT_STATUS_ALIGNED: 'Aligned',
}


def _material_import_header_map():
    aliases = {
        'materialcode': 'material_code',
        'materialname': 'material_name',
        'specification': 'specification',
        'qty': 'qty',
        'qtyspecification': 'qty_specification',
        'noofsite': 'no_of_site',
        'mw': 'mw',
        'ltpanel': 'lt_panel',
        'ltpanels': 'lt_panels',
        'pfrate': 'pf_rate',
        'amount': 'amount',
    }
    return aliases


def _build_material_import_rows(raw_rows):
    rows = []
    for raw_row in raw_rows:
        row_values = []
        for key, _label in MATERIAL_IMPORT_SCHEMA:
            row_values.append(raw_row.get(key, ''))
        rows.append(row_values)
    return rows


def _default_material_import_rows():
    return []


def _material_code_for_index(index):
    sequence = max(int(index), 1)
    width = max(2, len(str(sequence)))
    return f"MAT{sequence:0{width}d}"


def _serialize_material_rows(queryset):
    rows = []
    for index, item in enumerate(queryset, start=1):
        rows.append({
            'id': item.id,
            'material_code': item.material_code or _material_code_for_index(index),
            'work_package': item.work_package or '',
            'material_name': item.material_name or '',
            'specification': item.specification or '',
            'qty': '' if item.qty is None else str(item.qty),
            'qty_specification': item.qty_specification or '',
            'no_of_site': item.no_of_site or '',
            'mw': '' if item.mw is None else str(item.mw),
            'lt_panel': item.lt_panel or '',
            'lt_panels': item.lt_panels or '',
            'pf_rate': '' if item.pf_rate is None else str(item.pf_rate),
            'amount': '' if item.amount is None else str(item.amount),
            'hsn_code': item.hsn_code or '',
            'gst_percentage': '' if item.gst_percentage is None else str(item.gst_percentage),
        })
    return rows


def _group_material_rows(material_rows):
    grouped_rows = []
    grouped_lookup = {}

    for row in material_rows:
        material_name = (row.get('material_name') or '').strip() or 'Unspecified Material'
        group_key = material_name.lower()
        if group_key not in grouped_lookup:
            group = {
                'key': group_key,
                'material_name': material_name,
                'row_count': 0,
                'rows': [],
            }
            grouped_lookup[group_key] = group
            grouped_rows.append(group)

        grouped_lookup[group_key]['rows'].append(row)
        grouped_lookup[group_key]['row_count'] += 1

    return grouped_rows


def _get_work_package_names():
    work_packages = list(
        WorkPackage.objects.filter(is_active=True).order_by('display_order', 'id').values_list('name', flat=True)
    )
    return work_packages or list(DEFAULT_WORK_PACKAGES)


def _get_business_unit_names():
    business_units = list(
        BusinessUnit.objects.filter(is_active=True).order_by('display_order', 'id').values_list('name', flat=True)
    )
    return business_units or list(DEFAULT_BUSINESS_UNITS)


def _serialize_project_rows(queryset):
    rows = []
    for project in queryset:
        rows.append({
            'id': project.id,
            'project_code': project.project_code or '',
            'project_name': project.project_name or '',
            'client_name': project.client_name or '',
            'procurement_source': project.procurement_source or '',
            'business_unit': project.business_unit or '',
            'project_location': project.project_location or '',
            'total_mw': '' if project.total_mw is None else str(project.total_mw),
            'status': project.status or '',
            'note': project.note or '',
            'created_at': project.created_at.strftime('%d %b %Y') if project.created_at else '',
        })
    return rows


def _serialize_project_allocations(project):
    rows = []
    for allocation in project.allocations.select_related('vendor', 'work_package').order_by('id'):
        rows.append({
            'id': allocation.id,
            'work_package': allocation.work_package.name if allocation.work_package else '',
            'work_package_id': allocation.work_package_id or '',
            'vendor_id': allocation.vendor.vendor_id if allocation.vendor else '',
            'vendor_name': allocation.vendor.company_name if allocation.vendor else '',
            'allocated_mw': '' if allocation.allocated_mw is None else str(allocation.allocated_mw),
            'completed_mw': '' if allocation.completed_mw is None else str(allocation.completed_mw),
            'timeline_start_date': allocation.timeline_start_date.isoformat() if allocation.timeline_start_date else '',
            'timeline_end_date': allocation.timeline_end_date.isoformat() if allocation.timeline_end_date else '',
            'actual_completion_date': allocation.actual_completion_date.isoformat() if allocation.actual_completion_date else '',
            'status': allocation.status or '',
            'scope_note': allocation.scope_note or '',
        })
    return rows


def _parse_client_list(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return [item.strip() for item in str(value).split(',') if item.strip()]


def _serialize_vendor_detail(vendor):
    return {
        'vendor_id': vendor.vendor_id or '',
        'company_name': vendor.company_name or '',
        'experience_details': vendor.experience_details or '',
        'address': vendor.address or '',
        'address2': vendor.address2 or '',
        'city': vendor.city or '',
        'state': vendor.state or '',
        'pin_code': vendor.pin_code or '',
        'country': vendor.country or '',
        'vendor_type': vendor.vendor_type or '',
        'vendor_category': vendor.vendor_category or '',
        'contact_person': vendor.contact_person or '',
        'email_id': vendor.email_id or '',
        'attendee_name': vendor.attendee_name or '',
        'bde_name': vendor.bde_name or '',
        'meeting_with': vendor.meeting_with or '',
        'qualification_status': vendor.qualification_status or '',
        'msme_reg': vendor.msme_reg or '',
        'pan_no': vendor.pan_no or '',
        'pf_reg': vendor.pf_reg or '',
        'gst_no': vendor.gst_no or '',
        'gst_type': vendor.gst_type or '',
        'gst_status': vendor.gst_status or '',
        'last_gstr1': vendor.last_gstr1 or '',
        'gst_pending_status': vendor.gst_pending_status or '',
        'aadhaar_no': vendor.aadhaar_no or '',
        'labour_welfare_fund': vendor.labour_welfare_fund or '',
        'professional_tax': vendor.professional_tax or '',
        'turnover_year_1': vendor.turnover_year_1 or '',
        'turnover_year_2': vendor.turnover_year_2 or '',
        'turnover_year_3': vendor.turnover_year_3 or '',
        'bank_account_name': vendor.bank_account_name or '',
        'bank_name_address': vendor.bank_name_address or '',
        'account_type': vendor.account_type or '',
        'account_number': vendor.account_number or '',
        'bank_proof_type': vendor.bank_proof_type or '',
        'client_list': _parse_client_list(vendor.client_list_data),
        'bank_proof_url': vendor.passbook_file.url if vendor.passbook_file else '',
        'bank_proof_name': vendor.passbook_file.name.split('/')[-1] if vendor.passbook_file else '',
        'created_at': vendor.created_at.strftime('%d %b %Y, %I:%M %p') if vendor.created_at else '',
    }


def _serialize_vendor_detail_rows(queryset):
    return [_serialize_vendor_detail(vendor) for vendor in queryset]


def _normalize_project_status(raw_status):
    normalized = (raw_status or '').strip().lower().replace('_', ' ').replace('-', ' ')
    if normalized in {'running', 'active', 'in progress', 'ongoing', 'execution'}:
        return PROJECT_STATUS_RUNNING
    if normalized in {'completed', 'complete', 'closed', 'finished', 'commissioned'}:
        return PROJECT_STATUS_COMPLETED
    if normalized in {'aligned', 'assigned', 'planned', 'awarded', 'pipeline', 'new'}:
        return PROJECT_STATUS_ALIGNED
    return PROJECT_STATUS_ALIGNED


def _parse_project_geography(location_text):
    parts = [part.strip() for part in str(location_text or '').split(',') if part.strip()]
    district = parts[-3] if len(parts) >= 3 else (parts[0] if len(parts) == 1 else 'Unspecified District')
    state = parts[-2] if len(parts) >= 2 else 'Unspecified State'
    country = parts[-1] if len(parts) >= 1 else 'Unspecified Country'
    return {
        'district': district or 'Unspecified District',
        'state': state or 'Unspecified State',
        'country': country or 'Unspecified Country',
    }


def _empty_status_totals():
    return {status: Decimal('0') for status in PROJECT_STATUS_ORDER}


def _build_dashboard_chart_payload(geo_totals):
    labels = []
    running_values = []
    completed_values = []
    aligned_values = []
    total_values = []
    vendor_counts = []

    for name, totals in geo_totals.items():
        labels.append(name)
        running_values.append(float(totals[PROJECT_STATUS_RUNNING]))
        completed_values.append(float(totals[PROJECT_STATUS_COMPLETED]))
        aligned_values.append(float(totals[PROJECT_STATUS_ALIGNED]))
        total_values.append(
            float(
                totals[PROJECT_STATUS_RUNNING]
                + totals[PROJECT_STATUS_COMPLETED]
                + totals[PROJECT_STATUS_ALIGNED]
            )
        )
        vendor_counts.append(len(totals.get('vendor_ids', set())))

    return {
        'labels': labels,
        'running': running_values,
        'completed': completed_values,
        'aligned': aligned_values,
        'total': total_values,
        'vendor_counts': vendor_counts,
    }


def _build_project_dashboard_metrics(projects):
    status_totals = _empty_status_totals()
    country_totals = defaultdict(lambda: {**_empty_status_totals(), 'vendor_ids': set()})
    state_totals = defaultdict(lambda: {**_empty_status_totals(), 'vendor_ids': set()})
    district_totals = defaultdict(lambda: {**_empty_status_totals(), 'vendor_ids': set()})

    for project in projects:
        project_mw = project.total_mw or Decimal('0')
        status_key = _normalize_project_status(project.status)
        geography = _parse_project_geography(project.project_location)
        vendor_ids = {
            allocation.vendor_id
            for allocation in project.allocations.all()
            if allocation.vendor_id
        }

        status_totals[status_key] += project_mw
        country_totals[geography['country']][status_key] += project_mw
        state_totals[geography['state']][status_key] += project_mw
        district_totals[geography['district']][status_key] += project_mw
        country_totals[geography['country']]['vendor_ids'].update(vendor_ids)
        state_totals[geography['state']]['vendor_ids'].update(vendor_ids)
        district_totals[geography['district']]['vendor_ids'].update(vendor_ids)

    def sorted_geo(source):
        return dict(
            sorted(
                source.items(),
                key=lambda item: (
                    item[1][PROJECT_STATUS_RUNNING]
                    + item[1][PROJECT_STATUS_COMPLETED]
                    + item[1][PROJECT_STATUS_ALIGNED]
                ),
                reverse=True,
            )
        )

    return {
        'status_totals': status_totals,
        'country_chart': _build_dashboard_chart_payload(sorted_geo(country_totals)),
        'state_chart': _build_dashboard_chart_payload(sorted_geo(state_totals)),
        'district_chart': _build_dashboard_chart_payload(sorted_geo(district_totals)),
    }


def _serialize_project_progress_rows(projects):
    rows = []
    for project in projects:
        geography = _parse_project_geography(project.project_location)
        for allocation in project.allocations.select_related('vendor', 'work_package').all():
            allocated_mw = allocation.allocated_mw or Decimal('0')
            completed_mw = allocation.completed_mw or Decimal('0')
            progress_percent = Decimal('0')
            if allocated_mw > 0:
                progress_percent = (completed_mw / allocated_mw) * Decimal('100')
            rows.append({
                'project_id': project.id,
                'project_code': project.project_code or '',
                'project_name': project.project_name or '',
                'district': geography['district'],
                'state': geography['state'],
                'country': geography['country'],
                'vendor_id': allocation.vendor.vendor_id if allocation.vendor else '',
                'vendor_name': allocation.vendor.company_name if allocation.vendor else '',
                'work_package': allocation.work_package.name if allocation.work_package else '',
                'allocated_mw': float(allocated_mw),
                'completed_mw': float(completed_mw),
                'pending_mw': float(max(allocated_mw - completed_mw, Decimal('0'))),
                'progress_percent': float(progress_percent.quantize(Decimal('0.01'))),
                'timeline_start_date': allocation.timeline_start_date.isoformat() if allocation.timeline_start_date else '',
                'timeline_end_date': allocation.timeline_end_date.isoformat() if allocation.timeline_end_date else '',
                'actual_completion_date': allocation.actual_completion_date.isoformat() if allocation.actual_completion_date else '',
                'status': allocation.status or '',
                'scope_note': allocation.scope_note or '',
            })
    return rows


def _clean_vendor_clients(value):
    if isinstance(value, list):
        raw_items = value
    else:
        try:
            raw_items = json.loads(value or '[]')
        except (TypeError, ValueError, json.JSONDecodeError):
            raw_items = str(value or '').split(',')

    if isinstance(raw_items, str):
        raw_items = [raw_items]

    cleaned = []
    for item in raw_items:
        normalized = str(item).strip().strip('[]"\'')
        if normalized:
            cleaned.append(normalized)
    return cleaned


def _validate_vendor_payload(payload, files, require_file):
    company_name = (payload.get('companyName') or '').strip()
    experience = (payload.get('experienceDetails') or '').strip()
    client_list_data = payload.get('clientListData', '[]')
    vendor_type = (payload.get('vendorType') or '').strip()
    vendor_category = (payload.get('vendorCategory') or '').strip()
    contact_person = (payload.get('contactPerson') or '').strip()
    email_id = (payload.get('emailId') or '').strip()
    attendee = (payload.get('attendeeName') or '').strip()
    bde = (payload.get('bdeName') or '').strip()
    meeting_with = (payload.get('meetingWith') or '').strip()
    msme_reg = (payload.get('msmeReg') or '').strip()
    pan_no = (payload.get('panNo') or '').strip().upper()
    pf_reg = (payload.get('pfReg') or '').strip()
    gst_no = (payload.get('gstNo') or '').strip().upper()
    gst_type = (payload.get('gstType') or '').strip()
    gst_status = (payload.get('gstStatus') or '').strip()
    last_gstr1 = (payload.get('lastGstr1') or '').strip()
    gst_pending_status = (payload.get('gstPendingStatus') or '').strip()
    aadhaar_no = (payload.get('aadhaarNo') or '').strip()
    labour_welfare_fund = (payload.get('labourWelfareFund') or '').strip()
    professional_tax = (payload.get('professionalTax') or '').strip()
    turnover_year_1 = (payload.get('turnoverYear1') or '').strip()
    turnover_year_2 = (payload.get('turnoverYear2') or '').strip()
    turnover_year_3 = (payload.get('turnoverYear3') or '').strip()
    bank_account_name = (payload.get('bankAccountName') or '').strip()
    bank_name_address = (payload.get('bankNameAddress') or '').strip()
    account_type = (payload.get('accountType') or '').strip()
    account_number = (payload.get('accountNumber') or '').strip()
    bank_proof_type = (payload.get('bankProofType') or '').strip()
    qualification = (payload.get('qualification_status') or '').strip()
    address = (payload.get('address') or '').strip()
    address2 = (payload.get('address2') or '').strip()
    city = (payload.get('city') or '').strip()
    state = (payload.get('state') or '').strip()
    pin = (payload.get('pin') or '').strip()
    country = (payload.get('country') or '').strip()
    cleaned_clients = _clean_vendor_clients(client_list_data)

    errors = []
    if not company_name:
        errors.append('companyName is required')
    if not address:
        errors.append('address is required')
    if not city:
        errors.append('city is required')
    if not state:
        errors.append('state is required')
    if not pin:
        errors.append('pin is required')
    if not country:
        errors.append('country is required')
    if not experience:
        errors.append('experienceDetails is required')
    if not cleaned_clients:
        errors.append('At least one client is required')
    if vendor_type not in VENDOR_TYPE_OPTIONS:
        errors.append('vendorType is invalid')
    if vendor_category not in VENDOR_CATEGORY_OPTIONS:
        errors.append('vendorCategory is invalid')
    if not contact_person:
        errors.append('contactPerson is required')
    if not email_id:
        errors.append('emailId is required')
    if not attendee:
        errors.append('attendeeName is required')
    if not bde:
        errors.append('bdeName is required')
    if not meeting_with:
        errors.append('meetingWith is required')
    if not msme_reg:
        errors.append('msmeReg is required')
    if not pan_no:
        errors.append('panNo is required')
    if not pf_reg:
        errors.append('pfReg is required')
    if not aadhaar_no:
        errors.append('aadhaarNo is required')
    if gst_no and not all([gst_type, gst_status, last_gstr1, gst_pending_status]):
        errors.append('Complete GST details are required when GST No is provided')
    if gst_pending_status and gst_pending_status not in GST_PENDING_STATUS_OPTIONS:
        errors.append('gstPendingStatus is invalid')
    if not turnover_year_1:
        errors.append('turnoverYear1 is required')
    if not turnover_year_2:
        errors.append('turnoverYear2 is required')
    if not turnover_year_3:
        errors.append('turnoverYear3 is required')
    if not bank_account_name:
        errors.append('bankAccountName is required')
    if not bank_name_address:
        errors.append('bankNameAddress is required')
    if account_type not in ACCOUNT_TYPE_OPTIONS:
        errors.append('accountType is invalid')
    if not account_number:
        errors.append('accountNumber is required')
    if bank_proof_type not in BANK_PROOF_TYPE_OPTIONS:
        errors.append('bankProofType is invalid')
    if qualification not in QUALIFICATION_STATUS_OPTIONS:
        errors.append('qualification_status is invalid')

    allowed_types = ['application/pdf', 'image/jpeg', 'image/png']
    max_size = 5 * 1024 * 1024
    upload_file = files.get('bankProofFile')
    if upload_file:
        if upload_file.size > max_size:
            errors.append('bankProofFile exceeds max size 5MB')
        if getattr(upload_file, 'content_type', '') not in allowed_types:
            errors.append('bankProofFile invalid file type')
    elif require_file:
        errors.append('bankProofFile is required')

    cleaned_data = {
        'company_name': company_name,
        'experience_details': experience,
        'address': address,
        'address2': address2,
        'city': city,
        'state': state,
        'pin_code': pin,
        'country': country,
        'vendor_type': vendor_type,
        'vendor_category': vendor_category,
        'contact_person': contact_person,
        'email_id': email_id,
        'attendee_name': attendee,
        'bde_name': bde,
        'meeting_with': meeting_with,
        'qualification_status': qualification,
        'msme_reg': msme_reg,
        'pan_no': pan_no,
        'pf_reg': pf_reg,
        'gst_no': gst_no,
        'gst_type': gst_type,
        'gst_status': gst_status,
        'last_gstr1': last_gstr1,
        'gst_pending_status': gst_pending_status,
        'aadhaar_no': aadhaar_no,
        'labour_welfare_fund': labour_welfare_fund,
        'professional_tax': professional_tax,
        'turnover_year_1': turnover_year_1,
        'turnover_year_2': turnover_year_2,
        'turnover_year_3': turnover_year_3,
        'bank_account_name': bank_account_name,
        'bank_name_address': bank_name_address,
        'account_type': account_type,
        'account_number': account_number,
        'bank_proof_type': bank_proof_type,
        'client_list_data': json.dumps(cleaned_clients),
    }
    return cleaned_data, errors


@login_required(login_url='/admin/login/')
def index(request):
    from permissions.utils import get_user_role, is_admin_like
    from permissions.constants import ROLE_VENDOR_MANAGER, ROLE_PURCHASE_MANAGER, ROLE_PURCHASE_STAFF

    role = get_user_role(request.user)
    admin = is_admin_like(request.user)
    vendor_focused = role in {ROLE_VENDOR_MANAGER, ROLE_PURCHASE_MANAGER, ROLE_PURCHASE_STAFF}

    show_project_panel = not vendor_focused or admin
    show_vendor_panel = vendor_focused or admin

    context = {
        'page_title': 'Dashboard',
        'show_project_panel': show_project_panel,
        'show_vendor_panel': show_vendor_panel,
    }

    if show_project_panel:
        projects = list(ProjectMaster.objects.prefetch_related('allocations').order_by('-created_at'))
        dashboard_metrics = _build_project_dashboard_metrics(projects)
        progress_rows = _serialize_project_progress_rows(projects)
        total_mw = sum((project.total_mw or Decimal('0') for project in projects), Decimal('0'))
        district_options = sorted({row['district'] for row in progress_rows if row['district']})
        context.update({
            'project_count': len(projects),
            'total_mw': total_mw,
            'running_mw': dashboard_metrics['status_totals'][PROJECT_STATUS_RUNNING],
            'completed_mw': dashboard_metrics['status_totals'][PROJECT_STATUS_COMPLETED],
            'aligned_mw': dashboard_metrics['status_totals'][PROJECT_STATUS_ALIGNED],
            'status_summary_chart_data': json.dumps(
                [
                    float(dashboard_metrics['status_totals'][PROJECT_STATUS_RUNNING]),
                    float(dashboard_metrics['status_totals'][PROJECT_STATUS_COMPLETED]),
                    float(dashboard_metrics['status_totals'][PROJECT_STATUS_ALIGNED]),
                ]
            ),
            'country_chart_data': json.dumps(dashboard_metrics['country_chart']),
            'state_chart_data': json.dumps(dashboard_metrics['state_chart']),
            'district_chart_data': json.dumps(dashboard_metrics['district_chart']),
            'progress_project_options': json.dumps([
                {
                    'id': project.id,
                    'project_code': project.project_code or '',
                    'project_name': project.project_name or '',
                }
                for project in projects
            ]),
            'progress_district_options': json.dumps(district_options),
            'project_progress_rows': json.dumps(progress_rows),
        })

    if show_vendor_panel:
        vendor_count = Vendor.objects.count()
        recent_vendors = list(
            Vendor.objects.order_by('-created_at')[:5].values('vendor_id', 'company_name', 'vendor_category')
        )
        context.update({
            'vendor_count': vendor_count,
            'recent_vendors': recent_vendors,
        })

    return render(request, 'dashboard.html', context)


@login_required(login_url='/admin/login/')
def vendor_module(request):
    vendor_count = Vendor.objects.count()
    recent_count = Vendor.objects.order_by('-created_at')[:5].count()
    context = {
        'page_title': 'Vendor Module',
        'vendor_module_nav': True,
        'vendor_count': vendor_count,
        'recent_count': recent_count,
    }
    return render(request, 'vendor_module.html', context)


@login_required(login_url='/admin/login/')
def project_module(request):
    project_count = ProjectMaster.objects.count()
    active_count = ProjectMaster.objects.filter(status='active').count()
    allocation_count = ProjectWorkAllocation.objects.count()
    total_capacity = sum(
        [project.total_mw or Decimal('0') for project in ProjectMaster.objects.all()],
        Decimal('0')
    )
    context = {
        'page_title': 'Project Module',
        'project_module_nav': True,
        'project_count': project_count,
        'active_count': active_count,
        'allocation_count': allocation_count,
        'total_capacity': total_capacity,
        'business_unit_count': BusinessUnit.objects.filter(is_active=True).count(),
    }
    return render(request, 'project_module.html', context)


@login_required(login_url='/admin/login/')
def project_master(request):
    projects = ProjectMaster.objects.order_by('-created_at')
    context = {
        'page_title': 'Project Master',
        'project_module_nav': True,
        'projects': _serialize_project_rows(projects),
        'project_count': projects.count(),
        'business_units': _get_business_unit_names(),
    }
    return render(request, 'project_master.html', context)


@login_required(login_url='/admin/login/')
def project_distribution(request):
    projects = ProjectMaster.objects.order_by('-created_at')
    selected_project = projects.first()
    vendors = list(
        Vendor.objects.order_by('company_name').values('vendor_id', 'company_name', 'vendor_category')
    )
    work_packages = list(
        WorkPackage.objects.filter(is_active=True).order_by('display_order', 'id').values('id', 'name')
    )
    allocation_map = {
        str(project.id): _serialize_project_allocations(project)
        for project in projects
    }
    context = {
        'page_title': 'Vendor Distribution',
        'project_module_nav': True,
        'projects': _serialize_project_rows(projects),
        'selected_project': selected_project,
        'selected_allocations': _serialize_project_allocations(selected_project) if selected_project else [],
        'allocation_map': allocation_map,
        'vendor_options': vendors,
        'work_packages': work_packages,
        'business_units': _get_business_unit_names(),
    }
    return render(request, 'project_distribution.html', context)


@login_required(login_url='/admin/login/')
def vendor_list(request):
    vendors = Vendor.objects.order_by('-created_at')
    context = {
        'page_title': 'Vendor List',
        'vendor_module_nav': True,
        'vendors': vendors,
        'vendor_detail_rows': _serialize_vendor_detail_rows(vendors),
    }
    return render(request, 'vendor_list.html', context)


@login_required(login_url='/admin/login/')
def vendor_registration(request):
    return render(request, 'vendor_registration.html', {'page_title': 'Vendor Registration', 'vendor_module_nav': True})


@login_required(login_url='/admin/login/')
def vendor_planner(request):
    vendors = list(
        Vendor.objects.order_by('company_name').values('vendor_id', 'company_name', 'vendor_category')
    )
    material_rows = _serialize_material_rows(MaterialMaster.objects.order_by('id'))
    work_packages = _get_work_package_names()
    context = {
        'page_title': 'Planner Prototype',
        'material_module_nav': True,
        'vendor_options': vendors,
        'materials': material_rows,
        'work_packages': work_packages,
        'planner_count': ProjectPlanner.objects.count(),
    }
    return render(request, 'vendor_planner.html', context)


@login_required(login_url='/admin/login/')
def material_module(request):
    material_count = MaterialMaster.objects.count()
    work_type_count = WorkPackage.objects.filter(is_active=True).count()
    unique_units = sorted({item.qty_specification for item in MaterialMaster.objects.exclude(qty_specification='')})
    context = {
        'page_title': 'Material Master',
        'material_module_nav': True,
        'material_count': material_count,
        'work_type_count': work_type_count,
        'unit_count': len(unique_units),
        'quotation_count': MaterialQuotation.objects.count(),
        'planner_count': ProjectPlanner.objects.count(),
    }
    return render(request, 'material_module.html', context)


@login_required(login_url='/admin/login/')
@ensure_csrf_cookie
def material_master(request):
    material_rows = _serialize_material_rows(MaterialMaster.objects.order_by('id'))
    work_packages = _get_work_package_names()
    context = {
        'page_title': 'Material Master',
        'material_module_nav': True,
        'material_import_columns': [label for _key, label in MATERIAL_IMPORT_SCHEMA],
        'work_types': work_packages,
        'material_rows': material_rows,
        'material_groups': _group_material_rows(material_rows),
        'imported_material_rows': _build_material_import_rows(material_rows),
        'imported_material_count': len(material_rows),
    }
    return render(request, 'material_master.html', context)


@login_required(login_url='/admin/login/')
def material_quotation(request):
    vendors = list(
        Vendor.objects.order_by('company_name').values('vendor_id', 'company_name', 'vendor_category')
    )
    materials = _serialize_material_rows(MaterialMaster.objects.order_by('id'))
    work_packages = _get_work_package_names()
    context = {
        'page_title': 'Material Quotation Generator',
        'material_module_nav': True,
        'materials': materials,
        'work_types': work_packages,
        'vendor_options': vendors,
        'business_units': _get_business_unit_names(),
    }
    return render(request, 'material_quotation.html', context)


@login_required(login_url='/admin/login/')
def import_material_master(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    headers = []
    rows = []

    if 'materialFile' in request.FILES:
        uploaded_file = request.FILES['materialFile']
        filename = (uploaded_file.name or '').lower()
        if not filename.endswith('.xlsx'):
            return JsonResponse({'error': 'Please upload the material list in .xlsx format'}, status=400)
        try:
            xlsx_rows = _load_xlsx_rows(uploaded_file)
        except (KeyError, zipfile.BadZipFile, ET.ParseError):
            return JsonResponse({'error': 'Could not read the Excel file. Please upload a valid .xlsx file'}, status=400)
        if not xlsx_rows:
            return JsonResponse({'error': 'The uploaded Excel sheet is empty'}, status=400)
        headers = xlsx_rows[0]
        rows = [row for row in xlsx_rows[1:] if any(str(cell or '').strip() for cell in row)]
    else:
        try:
            payload = json.loads(request.body.decode('utf-8') or '{}')
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON payload'}, status=400)
        headers = payload.get('headers') or []
        rows = payload.get('rows') or []

    if not headers:
        return JsonResponse({'error': 'Excel header row is required'}, status=400)
    if not rows:
        return JsonResponse({'error': 'Excel data rows are required'}, status=400)

    header_aliases = _material_import_header_map()
    normalized_headers = [_normalize_material_header(header) for header in headers]
    header_keys = []
    for header in normalized_headers:
        key = header_aliases.get(header)
        if not key:
            return JsonResponse({'error': f'Unexpected column found: {header or "blank"}'}, status=400)
        header_keys.append(key)

    required_keys = [key for key, _label in MATERIAL_IMPORT_SCHEMA]
    missing_keys = [label for key, label in MATERIAL_IMPORT_SCHEMA if key not in header_keys]
    if missing_keys:
        return JsonResponse({'error': f'Missing required columns: {", ".join(missing_keys)}'}, status=400)

    imported_rows = []
    for row_number, raw_row in enumerate(rows, start=2):
        row_dict = {key: '' for key in required_keys}
        for index, key in enumerate(header_keys):
            value = raw_row[index] if index < len(raw_row) else ''
            row_dict[key] = '' if value is None else str(value).strip()
        if any(str(value).strip() for value in row_dict.values()):
            if _to_int_or_none(row_dict['qty']) is None:
                return JsonResponse({'error': f'Qty must be an integer value in Excel row {row_number}'}, status=400)
            imported_rows.append(row_dict)

    if not imported_rows:
        return JsonResponse({'error': 'No non-empty material rows found in the uploaded file'}, status=400)

    MaterialMaster.objects.all().delete()
    MaterialMaster.objects.bulk_create([
        MaterialMaster(
            material_code=_material_code_for_index(index),
            work_package='',
            material_name=row['material_name'],
            specification=row['specification'],
            qty=_to_int_or_none(row['qty']),
            qty_specification=row['qty_specification'],
            no_of_site=row['no_of_site'],
            mw=_to_decimal_or_none(row['mw']),
            lt_panel=row['lt_panel'],
            lt_panels=row['lt_panels'],
            pf_rate=_to_decimal_or_none(row['pf_rate']),
            amount=_to_decimal_or_none(row['amount']),
        )
        for index, row in enumerate(imported_rows, start=1)
    ])
    return JsonResponse({'message': 'Material list imported successfully', 'row_count': len(imported_rows)})


@login_required(login_url='/admin/login/')
def clear_material_import(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    MaterialMaster.objects.all().delete()
    return JsonResponse({'message': 'Imported material list cleared'})


@login_required(login_url='/admin/login/')
def update_material_work_package(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    material_id = payload.get('materialId')
    work_package = (payload.get('workPackage') or '').strip()

    if not material_id:
        return JsonResponse({'error': 'materialId is required'}, status=400)
    if work_package and work_package not in _get_work_package_names():
        return JsonResponse({'error': 'Invalid work package selected'}, status=400)

    try:
        material = MaterialMaster.objects.get(id=material_id)
    except MaterialMaster.DoesNotExist:
        return JsonResponse({'error': 'Material record not found'}, status=404)

    material.work_package = work_package
    material.save(update_fields=['work_package'])
    return JsonResponse({'message': 'Work package updated successfully'})


@login_required(login_url='/admin/login/')
def material_list_api(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    material_rows = _serialize_material_rows(MaterialMaster.objects.order_by('id'))
    return JsonResponse({'rows': material_rows, 'count': len(material_rows)})


@login_required(login_url='/admin/login/')
def material_options_api(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET required'}, status=405)
    rows = (
        MaterialMaster.objects
        .exclude(material_name='')
        .exclude(qty_specification='')
        .values('material_name', 'qty_specification')
        .distinct()
        .order_by('material_name')
    )
    options = [{'material_name': row['material_name'], 'unit': row['qty_specification']} for row in rows]
    return JsonResponse({'results': options})


@login_required(login_url='/admin/login/')
def material_create_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    material_name = (payload.get('material_name') or '').strip()
    if not material_name:
        return JsonResponse({'error': 'Material name is required'}, status=400)

    qty = _to_int_or_none(payload.get('qty'))
    if payload.get('qty') not in (None, '') and qty is None:
        return JsonResponse({'error': 'Qty must be an integer value'}, status=400)

    gst_percentage = _to_decimal_or_none(payload.get('gst_percentage'))
    if payload.get('gst_percentage') not in (None, '') and gst_percentage is None:
        return JsonResponse({'error': 'GST percentage must be a numeric value'}, status=400)

    material = MaterialMaster.objects.create(
        material_code=(payload.get('material_code') or '').strip(),
        work_package=(payload.get('work_package') or '').strip(),
        material_name=material_name,
        specification=(payload.get('specification') or '').strip(),
        qty=qty,
        qty_specification=(payload.get('qty_specification') or '').strip(),
        hsn_code=(payload.get('hsn_code') or '').strip(),
        gst_percentage=gst_percentage,
        pf_rate=_to_decimal_or_none(payload.get('pf_rate')),
        amount=_to_decimal_or_none(payload.get('amount')),
    )
    material_rows = _serialize_material_rows(MaterialMaster.objects.filter(pk=material.pk))
    return JsonResponse({'message': 'Material added successfully', 'material': material_rows[0]})


@login_required(login_url='/admin/login/')
def create_project_master(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    project_name = (payload.get('projectName') or '').strip()
    client_name = (payload.get('clientName') or '').strip()
    procurement_source = (payload.get('procurementSource') or '').strip()
    business_unit = (payload.get('businessUnit') or '').strip()
    project_location = (payload.get('projectLocation') or '').strip()
    total_mw = _to_decimal_or_none(payload.get('totalMw'))
    status = (payload.get('status') or '').strip()
    note = (payload.get('note') or '').strip()

    errors = []
    if not project_name:
        errors.append('projectName is required')
    if not procurement_source:
        errors.append('procurementSource is required')
    if not business_unit:
        errors.append('businessUnit is required')
    elif business_unit not in _get_business_unit_names():
        errors.append('businessUnit is invalid')
    if total_mw is None or total_mw <= 0:
        errors.append('totalMw must be greater than zero')
    if not status:
        errors.append('status is required')
    if errors:
        return JsonResponse({'error': errors}, status=400)

    project = ProjectMaster.objects.create(
        project_name=project_name,
        client_name=client_name,
        procurement_source=procurement_source,
        business_unit=business_unit,
        project_location=project_location,
        total_mw=total_mw,
        status=status,
        note=note,
    )
    return JsonResponse({
        'message': 'Project master created successfully',
        'project': {
            'id': project.id,
            'project_code': project.project_code,
            'project_name': project.project_name,
            'client_name': project.client_name,
            'procurement_source': project.procurement_source,
            'business_unit': project.business_unit,
            'project_location': project.project_location,
            'total_mw': str(project.total_mw or ''),
            'status': project.status,
            'note': project.note,
            'created_at': project.created_at.strftime('%d %b %Y'),
        }
    })


@login_required(login_url='/admin/login/')
def save_project_distribution(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    project_id = payload.get('projectId')
    allocation_rows = payload.get('allocations') or []

    if not project_id:
        return JsonResponse({'error': 'projectId is required'}, status=400)
    try:
        project = ProjectMaster.objects.get(id=project_id)
    except ProjectMaster.DoesNotExist:
        return JsonResponse({'error': 'Project not found'}, status=404)

    work_package_ids = {str(item['id']): item['id'] for item in WorkPackage.objects.filter(is_active=True).values('id')}
    vendor_lookup = {
        vendor['vendor_id']: vendor['id']
        for vendor in Vendor.objects.values('id', 'vendor_id')
    }

    def parse_date_value(raw_value):
        value = str(raw_value or '').strip()
        if not value:
            return None
        try:
            return datetime.date.fromisoformat(value)
        except ValueError:
            return None

    cleaned_rows = []
    total_allocated = Decimal('0')
    for index, row in enumerate(allocation_rows, start=1):
        work_package_id = str(row.get('workPackageId') or '').strip()
        vendor_id = (row.get('vendorId') or '').strip()
        allocated_mw = _to_decimal_or_none(row.get('allocatedMw'))
        completed_mw = _to_decimal_or_none(row.get('completedMw'))
        status = (row.get('status') or '').strip()
        scope_note = (row.get('scopeNote') or '').strip()
        timeline_start_date = parse_date_value(row.get('timelineStartDate'))
        timeline_end_date = parse_date_value(row.get('timelineEndDate'))
        actual_completion_date = parse_date_value(row.get('actualCompletionDate'))

        if not work_package_id or work_package_id not in work_package_ids:
            return JsonResponse({'error': f'Valid work package is required in row {index}'}, status=400)
        if not vendor_id or vendor_id not in vendor_lookup:
            return JsonResponse({'error': f'Valid vendor is required in row {index}'}, status=400)
        if allocated_mw is None or allocated_mw <= 0:
            return JsonResponse({'error': f'Allocated MW must be greater than zero in row {index}'}, status=400)
        if completed_mw is None:
            completed_mw = Decimal('0')
        if completed_mw < 0:
            return JsonResponse({'error': f'Completed MW cannot be negative in row {index}'}, status=400)
        if completed_mw > allocated_mw:
            return JsonResponse({'error': f'Completed MW cannot exceed allocated MW in row {index}'}, status=400)
        if row.get('timelineStartDate') and not timeline_start_date:
            return JsonResponse({'error': f'Valid timeline start date is required in row {index}'}, status=400)
        if row.get('timelineEndDate') and not timeline_end_date:
            return JsonResponse({'error': f'Valid timeline end date is required in row {index}'}, status=400)
        if row.get('actualCompletionDate') and not actual_completion_date:
            return JsonResponse({'error': f'Valid actual completion date is required in row {index}'}, status=400)
        if timeline_start_date and timeline_end_date and timeline_end_date < timeline_start_date:
            return JsonResponse({'error': f'Timeline end date cannot be earlier than start date in row {index}'}, status=400)
        if actual_completion_date and timeline_start_date and actual_completion_date < timeline_start_date:
            return JsonResponse({'error': f'Actual completion date cannot be earlier than timeline start date in row {index}'}, status=400)

        total_allocated += allocated_mw
        cleaned_rows.append({
            'work_package_id': work_package_ids[work_package_id],
            'vendor_pk': vendor_lookup[vendor_id],
            'allocated_mw': allocated_mw,
            'completed_mw': completed_mw,
            'timeline_start_date': timeline_start_date,
            'timeline_end_date': timeline_end_date,
            'actual_completion_date': actual_completion_date,
            'status': status,
            'scope_note': scope_note,
        })

    if project.total_mw is not None and total_allocated > project.total_mw:
        return JsonResponse({'error': 'Total allocated MW exceeds the project capacity'}, status=400)

    project.allocations.all().delete()
    ProjectWorkAllocation.objects.bulk_create([
        ProjectWorkAllocation(
            project=project,
            work_package_id=row['work_package_id'],
            vendor_id=row['vendor_pk'],
            allocated_mw=row['allocated_mw'],
            completed_mw=row['completed_mw'],
            timeline_start_date=row['timeline_start_date'],
            timeline_end_date=row['timeline_end_date'],
            actual_completion_date=row['actual_completion_date'],
            status=row['status'],
            scope_note=row['scope_note'],
        )
        for row in cleaned_rows
    ])

    return JsonResponse({
        'message': 'Project work distribution saved successfully',
        'project_id': project.id,
        'allocated_mw_total': str(total_allocated),
    })


@login_required(login_url='/admin/login/')
def register_vendor(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    from permissions.utils import get_user_role, is_admin_like
    from permissions.models import RolePermission

    if not is_admin_like(request.user):
        role = get_user_role(request.user)
        if role:
            perm = RolePermission.objects.filter(role=role, module_key='vendors').first()
            if not perm or not perm.can_create:
                return JsonResponse({'error': 'You do not have permission to register vendors.'}, status=403)
        else:
            return JsonResponse({'error': 'Access denied.'}, status=403)

    try:
        cleaned_data, errors = _validate_vendor_payload(request.POST, request.FILES, require_file=True)
        if errors:
            return JsonResponse({'error': errors}, status=400)

        vendor = Vendor(**cleaned_data)
        vendor.save()

        if 'bankProofFile' in request.FILES:
            vendor.passbook_file = request.FILES['bankProofFile']
            vendor.save()

        return JsonResponse({'vendor_id': vendor.vendor_id})
    except Exception as e:
        traceback.print_exc()
        return JsonResponse({'error': 'server error'}, status=500)


@login_required(login_url='/admin/login/')
def update_vendor(request, vendor_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        try:
            vendor = Vendor.objects.get(vendor_id=vendor_id)
        except Vendor.DoesNotExist:
            return JsonResponse({'error': 'Vendor not found'}, status=404)

        cleaned_data, errors = _validate_vendor_payload(request.POST, request.FILES, require_file=False)
        if errors:
            return JsonResponse({'error': errors}, status=400)

        for field_name, value in cleaned_data.items():
            setattr(vendor, field_name, value)

        if 'bankProofFile' in request.FILES:
            vendor.passbook_file = request.FILES['bankProofFile']

        vendor.save()

        return JsonResponse({
            'message': 'Vendor details updated successfully',
            'vendor': _serialize_vendor_detail(vendor),
        })
    except Exception:
        traceback.print_exc()
        return JsonResponse({'error': 'server error'}, status=500)


def media_blob_proxy(request, blob_path):
    if not settings.BLOB_READ_WRITE_TOKEN:
        raise Http404('Blob storage is not configured.')
    try:
        return build_blob_download_response(blob_path)
    except Exception as exc:
        raise Http404('File not found.') from exc


def sign_out(request):
    logout(request)
    return redirect('/admin/login/')
