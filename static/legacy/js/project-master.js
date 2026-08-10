const projectMasterRows = JSON.parse(document.getElementById('project-master-data').textContent || '[]');

function projectGetCookie(name) {
    const value = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
    return value ? value.pop() : '';
}

function showProjectMasterAlert(message, level) {
    const alertEl = document.getElementById('projectMasterAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${level}`;
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
}

function appendProjectMasterRow(project) {
    const tbody = document.getElementById('projectMasterTableBody');
    if (!tbody) return;

    const emptyRow = tbody.querySelector('td[colspan="8"]');
    if (emptyRow) emptyRow.parentElement.remove();

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="fw-semibold">${project.project_code || ''}</td>
        <td>${project.project_name || '-'}</td>
        <td>${project.client_name || '-'}</td>
        <td>${project.procurement_source || '-'}</td>
        <td>${project.business_unit || '-'}</td>
        <td>${project.project_location || '-'}</td>
        <td>${project.total_mw || '-'}</td>
        <td>${project.status || '-'}</td>
        <td>${project.created_at || '-'}</td>
    `;
    tbody.prepend(row);
}

async function saveProjectMaster() {
    const payload = {
        projectName: document.getElementById('projectName')?.value || '',
        clientName: document.getElementById('clientName')?.value || '',
        procurementSource: document.getElementById('procurementSource')?.value || '',
        businessUnit: document.getElementById('businessUnit')?.value || '',
        projectLocation: document.getElementById('projectLocation')?.value || '',
        totalMw: document.getElementById('totalMw')?.value || '',
        status: document.getElementById('projectStatus')?.value || '',
        note: document.getElementById('projectNote')?.value || ''
    };

    try {
        const response = await fetch(PROJECT_MASTER_CREATE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': projectGetCookie('csrftoken')
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errorMessage = Array.isArray(result.error) ? result.error.join(', ') : (result.error || 'Could not save the project master.');
            showProjectMasterAlert(errorMessage, 'danger');
            return;
        }

        appendProjectMasterRow(result.project);
        const countEl = document.getElementById('projectMasterCount');
        if (countEl) countEl.textContent = (parseInt(countEl.textContent || '0', 10) + 1).toString();
        showProjectMasterAlert(result.message || 'Project master saved.', 'success');
        ['projectName', 'clientName', 'procurementSource', 'projectLocation', 'totalMw', 'projectStatus', 'projectNote', 'businessUnit'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'SELECT') el.value = '';
            else el.value = '';
        });
        document.getElementById('businessUnit').value = 'Path Found Biogas';
    } catch (error) {
        console.error(error);
        showProjectMasterAlert('Could not save the project master right now.', 'danger');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('saveProjectMasterBtn')?.addEventListener('click', saveProjectMaster);
});
