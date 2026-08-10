function getCookie(name) {
    const value = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
    return value ? value.pop() : '';
}

function showBulkPoAlert(message, level) {
    const alertEl = document.getElementById('bulkPoAlert');
    if (!alertEl) return;
    alertEl.className = `alert alert-${level}`;
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
}

function addManualRow(values) {
    values = values || {};
    const tbody = document.getElementById('manualRowsBody');
    const tr = document.createElement('tr');

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'form-control form-control-sm manual-name';
    nameInput.placeholder = 'e.g. MC4 Connector';
    nameInput.value = values.material_name || '';

    const unitInput = document.createElement('input');
    unitInput.type = 'text';
    unitInput.className = 'form-control form-control-sm manual-unit';
    unitInput.placeholder = 'e.g. Nos';
    unitInput.value = values.unit || '';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.className = 'form-control form-control-sm manual-qty';
    qtyInput.placeholder = 'Qty';
    qtyInput.value = values.quantity || '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-outline-danger';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => tr.remove());

    const nameTd = document.createElement('td');
    nameTd.appendChild(nameInput);
    const unitTd = document.createElement('td');
    unitTd.appendChild(unitInput);
    const qtyTd = document.createElement('td');
    qtyTd.appendChild(qtyInput);
    const removeTd = document.createElement('td');
    removeTd.appendChild(removeBtn);

    tr.append(nameTd, unitTd, qtyTd, removeTd);
    tbody.appendChild(tr);
}

function collectManualRows() {
    const rows = [];
    document.querySelectorAll('#manualRowsBody tr').forEach((tr) => {
        const material_name = tr.querySelector('.manual-name').value.trim();
        const unit = tr.querySelector('.manual-unit').value.trim();
        const quantity = tr.querySelector('.manual-qty').value.trim();
        if (material_name || unit || quantity) {
            rows.push({ material_name, unit, quantity });
        }
    });
    return rows;
}

function renderResults(data) {
    const rows = data.rows || [];
    const tbody = document.getElementById('matchResultsBody');
    tbody.innerHTML = '';

    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'text-center py-4 text-muted';
        td.textContent = 'No products checked yet.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    } else {
        rows.forEach((row) => {
            const tr = document.createElement('tr');

            const nameTd = document.createElement('td');
            nameTd.textContent = row.material_name || '-';

            const unitTd = document.createElement('td');
            unitTd.textContent = row.unit || '-';

            const reqTd = document.createElement('td');
            reqTd.textContent = row.requested_qty ?? '-';

            const availTd = document.createElement('td');
            availTd.textContent = row.available_qty ?? '-';

            const statusTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = `badge ${row.matched ? 'bg-success' : 'bg-danger'}`;
            badge.textContent = row.matched ? 'Matched' : 'Not Matched';
            const reason = document.createElement('span');
            reason.className = 'small text-muted d-block';
            reason.textContent = row.reason || '';
            statusTd.append(badge, reason);

            tr.append(nameTd, unitTd, reqTd, availTd, statusTd);
            tbody.appendChild(tr);
        });
    }

    const matchedCount = rows.filter((row) => row.matched).length;
    const summaryEl = document.getElementById('matchSummaryText');
    if (!rows.length) {
        summaryEl.textContent = 'Run a check above to see which products are available in the Material Master inventory.';
        summaryEl.className = 'section-copy';
    } else if (data.all_matched) {
        summaryEl.textContent = `All ${rows.length} products matched inventory. You can generate the purchase order below.`;
        summaryEl.className = 'section-copy text-success fw-semibold';
    } else {
        summaryEl.textContent = `${matchedCount} of ${rows.length} products matched. Fix the unmatched rows before generating a purchase order.`;
        summaryEl.className = 'section-copy text-danger fw-semibold';
    }

    const payloadRows = rows.map((row) => ({
        material_name: row.material_name,
        unit: row.unit,
        quantity: row.requested_qty,
    }));
    document.getElementById('itemsPayloadInput').value = JSON.stringify(payloadRows);
    document.getElementById('generatePoBtn').disabled = !(data.all_matched && rows.length > 0);
}

async function runCheck(fetchBody, isFormData, triggerBtn) {
    const originalText = triggerBtn.textContent;
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Checking...';

    try {
        const options = {
            method: 'POST',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
        };
        if (isFormData) {
            options.body = fetchBody;
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(fetchBody);
        }

        const response = await fetch(BULK_PO_CHECK_URL, options);
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            showBulkPoAlert(result.error || 'Could not check the product list against inventory.', 'danger');
            return;
        }

        renderResults(result);
        const count = result.rows ? result.rows.length : 0;
        showBulkPoAlert(
            `Checked ${count} product${count === 1 ? '' : 's'} against inventory.`,
            result.all_matched ? 'success' : 'warning'
        );
    } catch (error) {
        console.error(error);
        showBulkPoAlert('Could not reach the server to check inventory.', 'danger');
    } finally {
        triggerBtn.disabled = false;
        triggerBtn.textContent = originalText;
    }
}

function checkFromFile() {
    const btn = document.getElementById('checkFromFileBtn');
    const fileInput = document.getElementById('bulkPoFile');
    const file = fileInput?.files?.[0];
    if (!file) {
        showBulkPoAlert('Choose an Excel file first.', 'warning');
        return;
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showBulkPoAlert('Please upload the product list in .xlsx format.', 'warning');
        return;
    }
    const formData = new FormData();
    formData.append('materialFile', file);
    runCheck(formData, true, btn);
}

function checkFromManual() {
    const btn = document.getElementById('checkFromManualBtn');
    const rows = collectManualRows();
    if (!rows.length) {
        showBulkPoAlert('Add at least one product row first.', 'warning');
        return;
    }
    runCheck({ rows }, false, btn);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('addManualRowBtn')?.addEventListener('click', () => addManualRow());
    document.getElementById('checkFromFileBtn')?.addEventListener('click', checkFromFile);
    document.getElementById('checkFromManualBtn')?.addEventListener('click', checkFromManual);

    const initialRowsEl = document.getElementById('initialBulkRows');
    let initialRows = [];
    try {
        initialRows = initialRowsEl ? JSON.parse(initialRowsEl.textContent || '[]') : [];
    } catch (error) {
        initialRows = [];
    }

    if (initialRows.length) {
        initialRows.forEach((row) => addManualRow({
            material_name: row.material_name,
            unit: row.unit,
            quantity: row.requested_qty,
        }));
        renderResults({ rows: initialRows, all_matched: INITIAL_ALL_MATCHED });
    } else {
        addManualRow();
        addManualRow();
        addManualRow();
    }
});
