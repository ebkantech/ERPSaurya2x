from .models import VendorAssignment, VendorAssignmentHistory


def serialize_vendor_assignment(assignment: VendorAssignment):
    return {
        'id': assignment.id,
        'vendor_id': assignment.vendor.vendor_id,
        'vendor_name': assignment.vendor.company_name,
        'assigned_staff': assignment.assigned_staff.staff_name,
        'assigned_staff_id': assignment.assigned_staff_id,
        'assignment_role': assignment.assignment_role,
        'status': assignment.assignment_status,
        'start_date': assignment.start_date.isoformat() if assignment.start_date else '',
        'end_date': assignment.end_date.isoformat() if assignment.end_date else '',
        'assignment_reason': assignment.assignment_reason,
        'remarks': assignment.remarks,
    }


def serialize_assignment_history(row: VendorAssignmentHistory):
    return {
        'id': row.id,
        'vendor_id': row.vendor.vendor_id,
        'vendor_name': row.vendor.company_name,
        'previous_staff': row.previous_staff.staff_name if row.previous_staff else '',
        'new_staff': row.new_staff.staff_name if row.new_staff else '',
        'changed_by': row.changed_by.username if row.changed_by else '',
        'changed_date': row.changed_date.isoformat(),
        'reason': row.reason,
        'remarks': row.remarks,
    }


def serialize_staff_profile(staff):
    return {
        'id': staff.id,
        'user_id': staff.user_id,
        'username': staff.user.username if staff.user_id else '',
        'staff_name': staff.staff_name,
        'employee_id': staff.employee_id,
        'department': staff.department,
        'designation': staff.designation,
        'mobile_number': staff.mobile_number,
        'email': staff.email,
        'reporting_manager': staff.reporting_manager.staff_name if staff.reporting_manager_id else '',
        'reporting_manager_id': staff.reporting_manager_id,
        'role': staff.role,
        'is_active': staff.is_active,
        'created_at': staff.created_at.isoformat(),
    }
