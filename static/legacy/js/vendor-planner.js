const vendorOptions = JSON.parse(document.getElementById('planner-vendor-options').textContent || '[]');
const plannerMaterials = JSON.parse(document.getElementById('planner-material-data').textContent || '[]');
const workPackages = JSON.parse(document.getElementById('planner-work-package-data').textContent || '[]');

const materialRows = plannerMaterials.map((material, index) => ({
    code: material.material_code || `MAT-${index + 1}`,
    name: material.material_name || '',
    specification: material.specification || '',
    qty: material.qty || '',
    qtySpecification: material.qty_specification || '',
    mw: material.mw || '',
    issuedQty: '',
}));

function numberOrZero(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
    return numberOrZero(value).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: numberOrZero(value) % 1 === 0 ? 0 : 2
    });
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function getCapacityMw() {
    return Math.max(numberOrZero(document.getElementById('plantCapacityMw').value), 0);
}

function buildVendorOptions(selectedValue = '') {
    const options = ['<option value="">Select vendor</option>'];
    vendorOptions.forEach((vendor) => {
        const value = vendor.vendor_id || '';
        const label = `${vendor.vendor_id} - ${vendor.company_name}`;
        const selected = value === selectedValue ? ' selected' : '';
        options.push(`<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
}

function computeRequiredQty(row, capacity) {
    const baseQty = numberOrZero(row.qty);
    const baseMw = numberOrZero(row.mw);
    return baseMw > 0 ? (baseQty / baseMw) * capacity : baseQty;
}

function renderWorkPlan() {
    const tbody = document.getElementById('workPlanBody');
    const capacity = getCapacityMw();
    tbody.innerHTML = workPackages.map((pkg, index) => `
        <tr data-work-index="${index}">
            <td>
                <div class="fw-semibold">${escapeHtml(pkg)}</div>
                <div class="small text-muted">Scope linked to project MW</div>
            </td>
            <td>
                <select class="form-select form-select-sm work-vendor-select">
                    ${buildVendorOptions()}
                </select>
            </td>
            <td>
                <input class="form-control form-control-sm work-mw-input" type="number" min="0" step="0.01" value="${capacity.toFixed(2)}">
            </td>
            <td>
                <select class="form-select form-select-sm work-status-select">
                    <option value="planned">Planned</option>
                    <option value="issued">Issued</option>
                    <option value="in progress">In Progress</option>
                    <option value="completed">Completed</option>
                </select>
            </td>
        </tr>
    `).join('');
}

function renderMaterialPlan() {
    const tbody = document.getElementById('materialPlanBody');
    const capacity = getCapacityMw();
    document.getElementById('materialLineCount').textContent = materialRows.length;

    if (!materialRows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No material data available. Import the Excel material list in Material Master first.</td></tr>';
        return;
    }

    tbody.innerHTML = materialRows.map((row, index) => {
        const requiredQty = computeRequiredQty(row, capacity);
        const issuedQty = numberOrZero(row.issuedQty);
        const balanceQty = requiredQty - issuedQty;
        const balanceClass = balanceQty < 0 ? 'text-danger fw-semibold' : balanceQty > 0 ? 'text-warning-emphasis fw-semibold' : 'text-success fw-semibold';

        return `
            <tr data-material-index="${index}">
                <td class="text-muted fw-semibold">${escapeHtml(row.code)}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.specification)}</td>
                <td>${formatNumber(row.qty)}</td>
                <td>${escapeHtml(row.qtySpecification)}</td>
                <td>${formatNumber(row.mw)}</td>
                <td class="material-required-cell">${formatNumber(requiredQty)}</td>
                <td>
                    <input class="form-control form-control-sm material-issued-input" type="number" min="0" step="0.01" value="${row.issuedQty}">
                </td>
                <td class="material-balance-cell ${balanceClass}">${formatNumber(balanceQty)}</td>
            </tr>
        `;
    }).join('');
}

function readWorkPlan() {
    return Array.from(document.querySelectorAll('#workPlanBody tr')).map((row, index) => ({
        name: workPackages[index],
        vendor: row.querySelector('.work-vendor-select')?.value || '',
        allocatedMw: numberOrZero(row.querySelector('.work-mw-input')?.value),
        status: row.querySelector('.work-status-select')?.value || 'planned'
    }));
}

function refreshPrototypeSummary() {
    const projectSummaryRows = document.getElementById('projectSummaryRows');
    const workSummaryRows = document.getElementById('workSummaryRows');
    const capacity = getCapacityMw();
    const workPlan = readWorkPlan();
    const assignedPackages = workPlan.filter((item) => item.vendor);

    let totalRequired = 0;
    let totalIssued = 0;
    materialRows.forEach((row) => {
        totalRequired += computeRequiredQty(row, capacity);
        totalIssued += numberOrZero(row.issuedQty);
    });
    const balance = totalRequired - totalIssued;

    document.getElementById('mwSummaryValue').textContent = capacity.toFixed(2);
    document.getElementById('assignedPackageCount').textContent = assignedPackages.length;
    document.getElementById('requiredQuantityTotal').textContent = formatNumber(totalRequired);
    document.getElementById('issuedQuantityTotal').textContent = formatNumber(totalIssued);
    document.getElementById('balanceQuantityTotal').textContent = formatNumber(balance);

    const projectSummary = [
        ['Business Unit', document.getElementById('businessUnit').value || '-'],
        ['Project Name', document.getElementById('projectName').value || '-'],
        ['Client / Principal', document.getElementById('clientName').value || '-'],
        ['Order Source', document.getElementById('procurementSource').selectedOptions[0]?.textContent || '-'],
        ['Project Location', document.getElementById('projectLocation').value || '-'],
        ['Plant Capacity', `${capacity.toFixed(2)} MW`],
        ['Lead Vendor', document.getElementById('leadVendor').selectedOptions[0]?.textContent || '-'],
        ['Planner Note', document.getElementById('planningNote').value || '-']
    ];

    projectSummaryRows.innerHTML = projectSummary.map(([label, value]) => `
        <div class="prototype-report-row">
            <div class="prototype-report-label">${escapeHtml(label)}</div>
            <div class="prototype-report-value">${escapeHtml(value)}</div>
        </div>
    `).join('');

    workSummaryRows.innerHTML = workPlan.map((item) => `
        <div class="prototype-report-row">
            <div class="prototype-report-label">${escapeHtml(item.name)}</div>
            <div class="prototype-report-value">${item.vendor ? `${escapeHtml(item.vendor)} / ${formatNumber(item.allocatedMw)} MW / ${escapeHtml(item.status)}` : 'Not assigned'}</div>
        </div>
    `).join('');
}

function updateMaterialRowView(row, index) {
    const capacity = getCapacityMw();
    const requiredQty = computeRequiredQty(materialRows[index], capacity);
    const issuedQty = numberOrZero(materialRows[index].issuedQty);
    const balanceQty = requiredQty - issuedQty;
    const balanceCell = row.querySelector('.material-balance-cell');
    const requiredCell = row.querySelector('.material-required-cell');

    if (requiredCell) requiredCell.textContent = formatNumber(requiredQty);
    if (balanceCell) {
        balanceCell.textContent = formatNumber(balanceQty);
        balanceCell.classList.remove('text-danger', 'text-success', 'text-warning-emphasis', 'fw-semibold');
        balanceCell.classList.add(balanceQty < 0 ? 'text-danger' : balanceQty > 0 ? 'text-warning-emphasis' : 'text-success', 'fw-semibold');
    }
}

function resetIssuedQty() {
    materialRows.forEach((row) => {
        row.issuedQty = '';
    });
    renderMaterialPlan();
    attachPlannerHandlers();
    refreshPrototypeSummary();
}

function updateWorkMwFromCapacity() {
    const capacity = getCapacityMw().toFixed(2);
    document.querySelectorAll('.work-mw-input').forEach((input) => {
        if (!input.dataset.touched) input.value = capacity;
    });
}

function attachPlannerHandlers() {
    document.querySelectorAll('#materialPlanBody tr').forEach((row) => {
        const index = numberOrZero(row.dataset.materialIndex);
        row.querySelector('.material-issued-input')?.addEventListener('input', (event) => {
            materialRows[index].issuedQty = event.target.value;
            updateMaterialRowView(row, index);
            refreshPrototypeSummary();
        });
    });

    document.querySelectorAll('#workPlanBody .work-vendor-select, #workPlanBody .work-status-select').forEach((input) => {
        input.addEventListener('change', refreshPrototypeSummary);
    });

    document.querySelectorAll('#workPlanBody .work-mw-input').forEach((input) => {
        input.addEventListener('input', () => {
            input.dataset.touched = 'true';
            refreshPrototypeSummary();
        });
    });
}

function attachHeaderHandlers() {
    ['projectName', 'clientName', 'procurementSource', 'projectLocation', 'leadVendor', 'planningNote'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', refreshPrototypeSummary);
        document.getElementById(id)?.addEventListener('change', refreshPrototypeSummary);
    });

    document.getElementById('plantCapacityMw')?.addEventListener('input', () => {
        updateWorkMwFromCapacity();
        renderMaterialPlan();
        attachPlannerHandlers();
        refreshPrototypeSummary();
    });

    document.getElementById('resetIssuedBtn')?.addEventListener('click', resetIssuedQty);
}

document.addEventListener('DOMContentLoaded', () => {
    renderWorkPlan();
    renderMaterialPlan();
    attachPlannerHandlers();
    attachHeaderHandlers();
    refreshPrototypeSummary();
});
