const quotationMaterials = JSON.parse(document.getElementById('quotation-material-data').textContent || '[]');

function qNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function qFormat(value) {
    return qNumber(value).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: qNumber(value) % 1 === 0 ? 0 : 2
    });
}

function qEscape(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

function selectedCapacity() {
    return Math.max(qNumber(document.getElementById('quotationMw')?.value), 0);
}

function getVisibleQuotationRows() {
    return Array.from(document.querySelectorAll('#quotationLineBody tr')).filter((row) => !row.classList.contains('d-none'));
}

function selectedWorkPackage() {
    return document.getElementById('quotationWorkType')?.value || 'all';
}

function computeRequiredQty(material, capacity) {
    const baseQty = qNumber(material.qty);
    const baseMw = qNumber(material.mw);
    return baseMw > 0 ? (baseQty / baseMw) * capacity : baseQty;
}

function renderQuotationLines() {
    const tbody = document.getElementById('quotationLineBody');
    const capacity = selectedCapacity();
    const selectedWork = selectedWorkPackage();

    tbody.innerHTML = quotationMaterials.map((material, index) => {
        const requiredQty = computeRequiredQty(material, capacity);
        const materialWorkPackage = material.work_package || '';
        const hiddenClass = selectedWork === 'all' || materialWorkPackage === selectedWork ? '' : ' d-none';
        return `
            <tr data-index="${index}" class="${hiddenClass.trim()}">
                <td class="fw-semibold">${qEscape(material.material_code || '')}</td>
                <td>${qEscape(material.material_name || '')}</td>
                <td>${qEscape(material.specification || '')}</td>
                <td>${qFormat(material.qty)}</td>
                <td>${qEscape(material.qty_specification || '')}</td>
                <td>${qFormat(material.mw)}</td>
                <td class="quotation-required-cell">${qFormat(requiredQty)}</td>
                <td><input class="form-control form-control-sm quotation-rate-input" type="number" min="0" step="0.01" value="${material.pf_rate || ''}"></td>
                <td class="quotation-amount-cell">${qFormat(material.amount)}</td>
                <td>${qEscape(material.lt_panel || '')}</td>
                <td>${qEscape(material.lt_panels || '')}</td>
                <td><input class="form-control form-control-sm quotation-remark-input" type="text" placeholder="${qEscape(materialWorkPackage || 'Optional')}"></td>
            </tr>
        `;
    }).join('');
}

function refreshQuotationAmounts() {
    const capacity = selectedCapacity();
    let totalQty = 0;
    let totalAmount = 0;

    getVisibleQuotationRows().forEach((row) => {
        const material = quotationMaterials[qNumber(row.dataset.index)];
        const requiredQty = computeRequiredQty(material, capacity);
        const rate = qNumber(row.querySelector('.quotation-rate-input')?.value);
        const amount = requiredQty * rate;
        totalQty += requiredQty;
        totalAmount += amount;
        row.querySelector('.quotation-required-cell').textContent = qFormat(requiredQty);
        row.querySelector('.quotation-amount-cell').textContent = qFormat(amount);
    });

    document.getElementById('quotationLineCount').textContent = getVisibleQuotationRows().length;
    document.getElementById('quotationQtyTotal').textContent = qFormat(totalQty);
    document.getElementById('quotationAmountTotal').textContent = qFormat(totalAmount);
    refreshQuotationSummary();
}

function refreshQuotationSummary() {
    const rows = [
        ['Project Name', document.getElementById('quotationProjectName')?.value || '-'],
        ['Client / Principal', document.getElementById('quotationClientName')?.value || '-'],
        ['Business Unit', document.getElementById('quotationBusinessUnit')?.selectedOptions[0]?.textContent || '-'],
        ['Vendor', document.getElementById('quotationVendor')?.selectedOptions[0]?.textContent || '-'],
        ['Work Package', document.getElementById('quotationWorkType')?.selectedOptions[0]?.textContent || '-'],
        ['Capacity', `${selectedCapacity().toFixed(2)} MW`],
        ['Quotation Reference', document.getElementById('quotationReference')?.value || '-'],
        ['File Type', document.getElementById('quotationFileType')?.selectedOptions[0]?.textContent || '-'],
        ['Note', document.getElementById('quotationNote')?.value || '-']
    ];

    document.getElementById('quotationSummaryRows').innerHTML = rows.map(([label, value]) => `
        <div class="prototype-report-row">
            <div class="prototype-report-label">${qEscape(label)}</div>
            <div class="prototype-report-value">${qEscape(value)}</div>
        </div>
    `).join('');
}

function attachQuotationLineHandlers() {
    document.querySelectorAll('.quotation-rate-input').forEach((input) => {
        input.addEventListener('input', refreshQuotationAmounts);
    });
}

function renderQuotationView() {
    renderQuotationLines();
    attachQuotationLineHandlers();
    refreshQuotationAmounts();
}

function attachQuotationHeaderHandlers() {
    ['quotationProjectName', 'quotationClientName', 'quotationBusinessUnit', 'quotationVendor', 'quotationReference', 'quotationNote', 'quotationFileType'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', refreshQuotationSummary);
        document.getElementById(id)?.addEventListener('change', refreshQuotationSummary);
    });

    ['quotationWorkType', 'quotationMw'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', renderQuotationView);
        document.getElementById(id)?.addEventListener('change', renderQuotationView);
    });
}

function collectQuotationData() {
    const capacity = selectedCapacity();
    return getVisibleQuotationRows().map((row) => {
        const material = quotationMaterials[qNumber(row.dataset.index)];
        const requiredQty = computeRequiredQty(material, capacity);
        const rate = qNumber(row.querySelector('.quotation-rate-input')?.value);
        const amount = requiredQty * rate;
        const remark = row.querySelector('.quotation-remark-input')?.value || '';
        return {
            Code: material.material_code,
            Material: material.material_name,
            Specification: material.specification,
            Qty: material.qty,
            'Qty Specification': material.qty_specification,
            'Base MW': material.mw,
            'Required Qty': requiredQty,
            Rate: rate,
            Amount: amount,
            'LT Panel': material.lt_panel,
            'LT Panels': material.lt_panels,
            Remark: remark
        };
    });
}

function exportQuotationExcel() {
    const rows = collectQuotationData();
    const sheetRows = [
        ['Project Name', document.getElementById('quotationProjectName')?.value || '-'],
        ['Client / Principal', document.getElementById('quotationClientName')?.value || '-'],
        ['Business Unit', document.getElementById('quotationBusinessUnit')?.selectedOptions[0]?.textContent || '-'],
        ['Vendor', document.getElementById('quotationVendor')?.selectedOptions[0]?.textContent || '-'],
        ['Work Package', document.getElementById('quotationWorkType')?.selectedOptions[0]?.textContent || '-'],
        ['Capacity (MW)', selectedCapacity().toFixed(2)],
        ['Quotation Reference', document.getElementById('quotationReference')?.value || '-'],
        [],
        ['Code', 'Material', 'Specification', 'Qty', 'Qty Specification', 'Base MW', 'Required Qty', 'Rate', 'Amount', 'LT Panel', 'LT Panels', 'Remark'],
        ...rows.map((item) => [item.Code, item.Material, item.Specification, item.Qty, item['Qty Specification'], item['Base MW'], item['Required Qty'], item.Rate, item.Amount, item['LT Panel'], item['LT Panels'], item.Remark])
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
    const filename = `${(document.getElementById('quotationReference')?.value || 'material-quotation').replace(/\s+/g, '-').toLowerCase()}.xlsx`;
    XLSX.writeFile(wb, filename);
}

function exportQuotationPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const rows = collectQuotationData().map((item) => [
        item.Code,
        item.Material,
        item.Specification,
        qFormat(item.Qty),
        item['Qty Specification'] || '-',
        qFormat(item['Base MW']),
        qFormat(item['Required Qty']),
        qFormat(item.Rate),
        qFormat(item.Amount),
        item['LT Panel'] || '-',
        item['LT Panels'] || '-',
        item.Remark || '-'
    ]);

    doc.setFontSize(16);
    doc.text('Material Quotation', 14, 18);
    doc.setFontSize(10);
    doc.text(`Project: ${document.getElementById('quotationProjectName')?.value || '-'}`, 14, 26);
    doc.text(`Business Unit: ${document.getElementById('quotationBusinessUnit')?.selectedOptions[0]?.textContent || '-'}`, 14, 32);
    doc.text(`Vendor: ${document.getElementById('quotationVendor')?.selectedOptions[0]?.textContent || '-'}`, 14, 38);
    doc.text(`Work Package: ${document.getElementById('quotationWorkType')?.selectedOptions[0]?.textContent || '-'}`, 14, 44);
    doc.text(`Capacity: ${selectedCapacity().toFixed(2)} MW`, 14, 50);

    doc.autoTable({
        startY: 56,
        head: [['Code', 'Material', 'Specification', 'Qty', 'Qty Specification', 'Base MW', 'Required Qty', 'Rate', 'Amount', 'LT Panel', 'LT Panels', 'Remark']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [18, 63, 113] }
    });

    const filename = `${(document.getElementById('quotationReference')?.value || 'material-quotation').replace(/\s+/g, '-').toLowerCase()}.pdf`;
    doc.save(filename);
}

function fillSampleRates() {
    document.querySelectorAll('#quotationLineBody tr').forEach((row, index) => {
        const rateInput = row.querySelector('.quotation-rate-input');
        if (rateInput) rateInput.value = (index + 1) * 12;
    });
    refreshQuotationAmounts();
}

document.addEventListener('DOMContentLoaded', () => {
    renderQuotationView();
    attachQuotationHeaderHandlers();
    document.getElementById('fillSampleRatesBtn')?.addEventListener('click', fillSampleRates);
    document.getElementById('generateQuotationBtn')?.addEventListener('click', () => {
        if ((document.getElementById('quotationFileType')?.value || 'excel') === 'pdf') exportQuotationPdf();
        else exportQuotationExcel();
    });
});
