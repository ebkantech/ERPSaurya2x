function filterMaterialMaster() {
    const searchValue = (document.getElementById('materialSearch')?.value || '').trim().toLowerCase();
    let visibleCount = 0;

    document.querySelectorAll('#materialMasterBody .material-detail-row').forEach((row) => {
        const searchHaystack = row.dataset.search || '';
        const matchesSearch = !searchValue || searchHaystack.includes(searchValue);
        const visible = matchesSearch;
        row.classList.toggle('d-none', !visible);
        if (visible) visibleCount += 1;
    });

    document.querySelectorAll('#materialMasterBody .material-group-row').forEach((groupRow) => {
        const groupKey = groupRow.dataset.groupKey || '';
        const visibleChildren = Array.from(document.querySelectorAll('#materialMasterBody .material-detail-row'))
            .filter((row) => row.dataset.groupKey === groupKey && !row.classList.contains('d-none')).length;
        groupRow.classList.toggle('d-none', visibleChildren === 0);
    });

    const countEl = document.getElementById('visibleMaterialCount');
    if (countEl) countEl.textContent = visibleCount;
}

function getCookie(name) {
    const value = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
    return value ? value.pop() : '';
}

function showMaterialImportAlert(message, level) {
    const alertEl = document.getElementById('materialImportAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${level}`;
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
}

function normalizeHeader(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/['"`]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

async function importMaterialExcel() {
    const fileInput = document.getElementById('materialImportFile');
    const file = fileInput?.files?.[0];
    if (!file) {
        showMaterialImportAlert('Please choose an Excel file first.', 'warning');
        return;
    }

    try {
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            showMaterialImportAlert('Please upload the material list in .xlsx format.', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('materialFile', file);
        const response = await fetch(MATERIAL_IMPORT_URL, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: formData
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showMaterialImportAlert(result.error || 'Failed to import material Excel file.', 'danger');
            return;
        }

        showMaterialImportAlert(`${result.message} (${result.row_count} rows imported)`, 'success');
        window.location.reload();
    } catch (error) {
        console.error(error);
        showMaterialImportAlert('Could not read the Excel file. Please use a valid .xlsx or .xls file.', 'danger');
    }
}

async function clearImportedMaterialList() {
    try {
        const response = await fetch(MATERIAL_CLEAR_URL, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken')
            }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showMaterialImportAlert(result.error || 'Could not clear the imported material list.', 'danger');
            return;
        }
        showMaterialImportAlert(result.message || 'Imported material list cleared.', 'success');
        window.location.reload();
    } catch (error) {
        console.error(error);
        showMaterialImportAlert('Could not clear the imported material list right now.', 'danger');
    }
}

async function updateMaterialWorkPackage(selectEl) {
    const row = selectEl.closest('tr');
    const materialId = row?.dataset.materialId;
    if (!materialId) {
        showMaterialImportAlert('Could not identify the selected material row.', 'danger');
        return;
    }

    try {
        const response = await fetch(MATERIAL_WORK_PACKAGE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                materialId,
                workPackage: selectEl.value || ''
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            showMaterialImportAlert(result.error || 'Could not update the work package.', 'danger');
            return;
        }

        row.dataset.search = [
            row.querySelector('td:nth-child(1)')?.textContent || '',
            selectEl.value || '',
            row.querySelector('td:nth-child(3)')?.textContent || '',
            row.querySelector('td:nth-child(4)')?.textContent || '',
            row.querySelector('td:nth-child(6)')?.textContent || '',
            row.querySelector('td:nth-child(9)')?.textContent || '',
            row.querySelector('td:nth-child(10)')?.textContent || ''
        ].join(' ').toLowerCase();

        showMaterialImportAlert(result.message || 'Work package updated.', 'success');
    } catch (error) {
        console.error(error);
        showMaterialImportAlert('Could not update the work package right now.', 'danger');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('materialSearch')?.addEventListener('input', filterMaterialMaster);
    document.getElementById('importMaterialBtn')?.addEventListener('click', importMaterialExcel);
    document.getElementById('clearImportBtn')?.addEventListener('click', clearImportedMaterialList);
    document.querySelectorAll('.material-work-package-select').forEach((selectEl) => {
        selectEl.addEventListener('change', () => updateMaterialWorkPackage(selectEl));
    });
});
