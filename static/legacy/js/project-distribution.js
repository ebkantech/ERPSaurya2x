const distributionProjects = JSON.parse(document.getElementById('project-distribution-projects').textContent || '[]');
const distributionVendors = JSON.parse(document.getElementById('project-distribution-vendors').textContent || '[]');
const distributionWorkPackages = JSON.parse(document.getElementById('project-distribution-work-packages').textContent || '[]');
const initialAllocations = JSON.parse(document.getElementById('project-distribution-allocations').textContent || '[]');
const allocationMap = JSON.parse(document.getElementById('project-distribution-allocation-map').textContent || '{}');

function distGetCookie(name) {
    const value = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
    return value ? value.pop() : '';
}

function distNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function distFormat(value) {
    return distNumber(value).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: distNumber(value) % 1 === 0 ? 0 : 2
    });
}

function distEscape(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function showDistributionAlert(message, level) {
    const alertEl = document.getElementById('projectDistributionAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${level}`;
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
}

function selectedProject() {
    const projectId = document.getElementById('distributionProject')?.value || '';
    return distributionProjects.find((project) => String(project.id) === String(projectId)) || null;
}

function buildWorkPackageOptions(selectedValue = '') {
    const options = ['<option value="">Select work package</option>'];
    distributionWorkPackages.forEach((workPackage) => {
        const value = String(workPackage.id);
        const selected = value === String(selectedValue) ? ' selected' : '';
        options.push(`<option value="${distEscape(value)}"${selected}>${distEscape(workPackage.name)}</option>`);
    });
    return options.join('');
}

function buildVendorOptions(selectedValue = '') {
    const options = ['<option value="">Select vendor</option>'];
    distributionVendors.forEach((vendor) => {
        const value = vendor.vendor_id || '';
        const selected = value === selectedValue ? ' selected' : '';
        options.push(`<option value="${distEscape(value)}"${selected}>${distEscape(`${vendor.vendor_id} - ${vendor.company_name}`)}</option>`);
    });
    return options.join('');
}

function distributionRowMarkup(row = {}) {
    return `
        <tr>
            <td><select class="form-select form-select-sm distribution-work-package">${buildWorkPackageOptions(row.work_package_id || '')}</select></td>
            <td><select class="form-select form-select-sm distribution-vendor">${buildVendorOptions(row.vendor_id || '')}</select></td>
            <td><input class="form-control form-control-sm distribution-mw" type="number" min="0.01" step="0.01" value="${row.allocated_mw || ''}"></td>
            <td><input class="form-control form-control-sm distribution-completed-mw" type="number" min="0" step="0.01" value="${row.completed_mw || ''}"></td>
            <td><input class="form-control form-control-sm distribution-start-date" type="date" value="${row.timeline_start_date || ''}"></td>
            <td><input class="form-control form-control-sm distribution-end-date" type="date" value="${row.timeline_end_date || ''}"></td>
            <td><input class="form-control form-control-sm distribution-actual-date" type="date" value="${row.actual_completion_date || ''}"></td>
            <td>
                <select class="form-select form-select-sm distribution-status">
                    <option value="planned"${row.status === 'planned' ? ' selected' : ''}>Planned</option>
                    <option value="issued"${row.status === 'issued' ? ' selected' : ''}>Issued</option>
                    <option value="in progress"${row.status === 'in progress' ? ' selected' : ''}>In Progress</option>
                    <option value="completed"${row.status === 'completed' ? ' selected' : ''}>Completed</option>
                </select>
            </td>
            <td><input class="form-control form-control-sm distribution-scope-note" type="text" value="${distEscape(row.scope_note || '')}" placeholder="Execution note"></td>
            <td class="text-end"><button class="btn btn-sm btn-outline-secondary distribution-remove-row" type="button">Remove</button></td>
        </tr>
    `;
}

function addDistributionRow(row = {}) {
    const tbody = document.getElementById('distributionTableBody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', distributionRowMarkup(row));
    attachDistributionHandlers();
    refreshDistributionSummary();
}

function attachDistributionHandlers() {
    document.querySelectorAll('.distribution-remove-row').forEach((button) => {
        button.onclick = () => {
            button.closest('tr')?.remove();
            refreshDistributionSummary();
        };
    });

    document.querySelectorAll('.distribution-mw').forEach((input) => {
        input.oninput = refreshDistributionSummary;
    });
}

function refreshDistributionSummary() {
    const project = selectedProject();
    const projectMw = distNumber(project?.total_mw);
    const allocatedMw = Array.from(document.querySelectorAll('.distribution-mw')).reduce((total, input) => total + distNumber(input.value), 0);
    const remainingMw = Math.max(projectMw - allocatedMw, 0);

    const projectMwEl = document.getElementById('distributionProjectMw');
    const businessUnitEl = document.getElementById('distributionBusinessUnit');
    const remainingMwEl = document.getElementById('distributionRemainingMw');
    if (businessUnitEl) businessUnitEl.value = project ? (project.business_unit || '') : '';
    if (projectMwEl) projectMwEl.value = project ? distFormat(project.total_mw) : '';
    if (remainingMwEl) remainingMwEl.value = project ? distFormat(remainingMw) : '';
}

function loadDistributionRows(projectId) {
    const tbody = document.getElementById('distributionTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const projectAllocations = projectId ? (allocationMap[String(projectId)] || []) : initialAllocations;
    if (projectAllocations.length) {
        projectAllocations.forEach((row) => {
            addDistributionRow({
                work_package_id: row.work_package_id ? String(row.work_package_id) : '',
                vendor_id: row.vendor_id || '',
                allocated_mw: row.allocated_mw || '',
                completed_mw: row.completed_mw || '',
                timeline_start_date: row.timeline_start_date || '',
                timeline_end_date: row.timeline_end_date || '',
                actual_completion_date: row.actual_completion_date || '',
                status: row.status || 'planned',
                scope_note: row.scope_note || ''
            });
        });
    } else {
        addDistributionRow();
    }
}

async function saveDistribution() {
    const project = selectedProject();
    if (!project) {
        showDistributionAlert('Please select a project master first.', 'warning');
        return;
    }

    const allocations = Array.from(document.querySelectorAll('#distributionTableBody tr')).map((row) => ({
        workPackageId: row.querySelector('.distribution-work-package')?.value || '',
        vendorId: row.querySelector('.distribution-vendor')?.value || '',
        allocatedMw: row.querySelector('.distribution-mw')?.value || '',
        completedMw: row.querySelector('.distribution-completed-mw')?.value || '',
        timelineStartDate: row.querySelector('.distribution-start-date')?.value || '',
        timelineEndDate: row.querySelector('.distribution-end-date')?.value || '',
        actualCompletionDate: row.querySelector('.distribution-actual-date')?.value || '',
        status: row.querySelector('.distribution-status')?.value || '',
        scopeNote: row.querySelector('.distribution-scope-note')?.value || ''
    })).filter((row) => (
        row.workPackageId || row.vendorId || row.allocatedMw || row.completedMw
        || row.timelineStartDate || row.timelineEndDate || row.actualCompletionDate || row.scopeNote
    ));

    try {
        const response = await fetch(PROJECT_DISTRIBUTION_SAVE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': distGetCookie('csrftoken')
            },
            body: JSON.stringify({
                projectId: project.id,
                allocations
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showDistributionAlert(result.error || 'Could not save the project distribution.', 'danger');
            return;
        }
        showDistributionAlert(`${result.message} Total allocated MW: ${result.allocated_mw_total}`, 'success');
        refreshDistributionSummary();
    } catch (error) {
        console.error(error);
        showDistributionAlert('Could not save the project distribution right now.', 'danger');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const projectSelect = document.getElementById('distributionProject');
    loadDistributionRows(projectSelect?.value || '');
    projectSelect?.addEventListener('change', () => {
        loadDistributionRows(projectSelect.value || '');
        refreshDistributionSummary();
    });
    document.getElementById('addDistributionRowBtn')?.addEventListener('click', () => addDistributionRow());
    document.getElementById('saveDistributionBtn')?.addEventListener('click', saveDistribution);
    refreshDistributionSummary();
});
