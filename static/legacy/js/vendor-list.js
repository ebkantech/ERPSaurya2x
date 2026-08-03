const vendorDetailData = JSON.parse(document.getElementById('vendor-detail-data')?.textContent || '[]');

const drawerState = {
    activeVendorId: '',
    isSaving: false
};

const drawerFieldMap = {
    company_name: 'drawerCompanyName',
    address: 'drawerAddress',
    address2: 'drawerAddress2',
    city: 'drawerCity',
    state: 'drawerState',
    pin_code: 'drawerPin',
    country: 'drawerCountry',
    vendor_type: 'drawerVendorType',
    vendor_category: 'drawerVendorCategory',
    contact_person: 'drawerContactPerson',
    email_id: 'drawerEmailId',
    attendee_name: 'drawerAttendeeName',
    bde_name: 'drawerBdeName',
    meeting_with: 'drawerMeetingWith',
    experience_details: 'drawerExperienceDetails',
    msme_reg: 'drawerMsmeReg',
    pan_no: 'drawerPanNo',
    pf_reg: 'drawerPfReg',
    aadhaar_no: 'drawerAadhaarNo',
    gst_no: 'drawerGstNo',
    gst_type: 'drawerGstType',
    gst_status: 'drawerGstStatus',
    last_gstr1: 'drawerLastGstr1',
    gst_pending_status: 'drawerGstPendingStatus',
    labour_welfare_fund: 'drawerLabourWelfareFund',
    professional_tax: 'drawerProfessionalTax',
    turnover_year_1: 'drawerTurnoverYear1',
    turnover_year_2: 'drawerTurnoverYear2',
    turnover_year_3: 'drawerTurnoverYear3',
    bank_account_name: 'drawerBankAccountName',
    bank_name_address: 'drawerBankNameAddress',
    account_type: 'drawerAccountType',
    account_number: 'drawerAccountNumber',
    bank_proof_type: 'drawerBankProofType',
    qualification_status: 'drawerQualificationStatus'
};

function sanitizeText(value) {
    const node = document.createElement('div');
    node.textContent = value;
    return node.innerHTML;
}

function formatStatus(value) {
    const normalized = String(value || '').trim();
    return normalized
        ? normalized.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
        : 'Pending';
}

function statusClass(value) {
    return String(value || '').trim().toLowerCase() || 'unknown';
}

function getCookie(name) {
    const match = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
    return match ? match.pop() : '';
}

function getDrawerElements() {
    return {
        drawer: document.getElementById('vendorDetailDrawer'),
        backdrop: document.getElementById('vendorDetailBackdrop'),
        form: document.getElementById('vendorDetailForm'),
        banner: document.getElementById('vendorDetailBanner'),
        title: document.getElementById('vendorDetailTitle'),
        subtitle: document.getElementById('vendorDetailSubtitle'),
        status: document.getElementById('vendorDetailStatus'),
        created: document.getElementById('vendorDetailCreated'),
        vendorId: document.getElementById('drawerVendorId'),
        saveButtons: [
            document.getElementById('vendorDetailSaveBtn'),
            document.getElementById('vendorDetailFooterSaveBtn')
        ].filter(Boolean)
    };
}

function showDrawerBanner(message, tone) {
    const banner = document.getElementById('vendorDetailBanner');
    if (!banner) return;
    banner.className = `vendor-detail-banner alert alert-${tone || 'info'}`;
    banner.innerHTML = Array.isArray(message)
        ? message.map((item) => `<div>${sanitizeText(String(item))}</div>`).join('')
        : sanitizeText(String(message || ''));
}

function hideDrawerBanner() {
    const banner = document.getElementById('vendorDetailBanner');
    if (!banner) return;
    banner.className = 'vendor-detail-banner d-none';
    banner.textContent = '';
}

function setDrawerSavingState(isSaving) {
    drawerState.isSaving = isSaving;
    getDrawerElements().saveButtons.forEach((button) => {
        button.disabled = isSaving;
        button.textContent = isSaving ? 'Saving...' : 'Save Changes';
    });
}

function findVendor(vendorId) {
    return vendorDetailData.find((item) => item.vendor_id === vendorId) || null;
}

function setFieldValue(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.value = value || '';
}

function fillDrawerForm(vendor) {
    Object.entries(drawerFieldMap).forEach(([vendorKey, fieldId]) => {
        setFieldValue(fieldId, vendor[vendorKey]);
    });

    setFieldValue('drawerClientListData', (vendor.client_list || []).join(', '));
    setFieldValue('drawerVendorId', vendor.vendor_id);
    setFieldValue('drawerBankProofFile', '');

    const title = document.getElementById('vendorDetailTitle');
    const subtitle = document.getElementById('vendorDetailSubtitle');
    const status = document.getElementById('vendorDetailStatus');
    const created = document.getElementById('vendorDetailCreated');
    const proofName = document.getElementById('drawerBankProofName');
    const proofLink = document.getElementById('drawerBankProofLink');

    if (title) title.textContent = vendor.company_name || 'Vendor Details';
    if (subtitle) subtitle.textContent = `${vendor.vendor_id || '-'} | ${vendor.contact_person || 'Primary contact pending'}`;
    if (status) {
        status.className = `status-pill ${statusClass(vendor.qualification_status)}`;
        status.textContent = formatStatus(vendor.qualification_status);
    }
    if (created) created.textContent = vendor.created_at || '-';
    if (proofName) proofName.textContent = vendor.bank_proof_name || 'No document uploaded';
    if (proofLink) {
        if (vendor.bank_proof_url) {
            proofLink.href = vendor.bank_proof_url;
            proofLink.classList.remove('d-none');
        } else {
            proofLink.removeAttribute('href');
            proofLink.classList.add('d-none');
        }
    }
}

function openVendorDrawer(vendorId) {
    const vendor = findVendor(vendorId);
    if (!vendor) return;

    fillDrawerForm(vendor);
    hideDrawerBanner();
    drawerState.activeVendorId = vendorId;

    const { drawer, backdrop } = getDrawerElements();
    if (drawer) {
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.classList.add('is-visible');
    document.body.classList.add('overflow-hidden');
}

function closeVendorDrawer() {
    if (drawerState.isSaving) return;
    const { drawer, backdrop, form } = getDrawerElements();
    if (drawer) {
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.classList.remove('is-visible');
    if (form) form.reset();
    hideDrawerBanner();
    drawerState.activeVendorId = '';
    document.body.classList.remove('overflow-hidden');
}

function updateLocalVendor(updatedVendor) {
    const index = vendorDetailData.findIndex((item) => item.vendor_id === updatedVendor.vendor_id);
    if (index === -1) {
        vendorDetailData.unshift(updatedVendor);
    } else {
        vendorDetailData[index] = updatedVendor;
    }
}

function updateVendorTableRow(vendor) {
    const button = document.querySelector(`.vendor-view-btn[data-vendor-id="${CSS.escape(vendor.vendor_id)}"]`);
    const row = button ? button.closest('tr') : null;
    if (!row) return;

    const cells = row.querySelectorAll('td');
    if (cells[1]) {
        cells[1].innerHTML = `
            <div class="fw-semibold">${sanitizeText(vendor.company_name || '-')}</div>
            <div class="small text-muted">${sanitizeText(vendor.city || '-')}, ${sanitizeText(vendor.state || '-')}</div>
        `;
    }
    if (cells[2]) cells[2].textContent = vendor.vendor_type || '-';
    if (cells[3]) cells[3].textContent = vendor.vendor_category || '-';
    if (cells[4]) cells[4].textContent = vendor.contact_person || '-';
    if (cells[5]) cells[5].textContent = vendor.email_id || '-';
    if (cells[6]) {
        cells[6].innerHTML = `<span class="status-pill ${statusClass(vendor.qualification_status)}">${sanitizeText(vendor.qualification_status || 'pending')}</span>`;
    }
}

function buildUpdateUrl(vendorId) {
    return VENDOR_UPDATE_URL_TEMPLATE.replace('__VENDOR_ID__', encodeURIComponent(vendorId));
}

function collectVendorFormData() {
    const form = document.getElementById('vendorDetailForm');
    const formData = new FormData(form);
    const clientsField = document.getElementById('drawerClientListData');
    const clients = String(clientsField?.value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    formData.set('clientListData', JSON.stringify(clients));
    if (!document.getElementById('drawerBankProofFile')?.files?.length) {
        formData.delete('bankProofFile');
    }
    return formData;
}

async function submitVendorUpdate(event) {
    event.preventDefault();
    if (drawerState.isSaving || !drawerState.activeVendorId) return;

    const form = document.getElementById('vendorDetailForm');
    if (!form?.checkValidity()) {
        form.reportValidity();
        return;
    }

    setDrawerSavingState(true);
    hideDrawerBanner();

    try {
        const response = await fetch(buildUpdateUrl(drawerState.activeVendorId), {
            method: 'POST',
            body: collectVendorFormData(),
            headers: {
                'X-CSRFToken': getCookie('csrftoken')
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showDrawerBanner(data.error || 'Unable to update vendor details.', 'danger');
            return;
        }

        const updatedVendor = data.vendor || null;
        if (!updatedVendor) {
            showDrawerBanner('Vendor updated, but the refreshed data could not be loaded.', 'warning');
            return;
        }

        updateLocalVendor(updatedVendor);
        fillDrawerForm(updatedVendor);
        updateVendorTableRow(updatedVendor);
        showDrawerBanner(data.message || 'Vendor details updated successfully.', 'success');
    } catch (error) {
        console.error(error);
        showDrawerBanner('Network error while updating vendor details.', 'danger');
    } finally {
        setDrawerSavingState(false);
    }
}

function wireDrawerActions() {
    document.querySelectorAll('.vendor-view-btn').forEach((button) => {
        button.addEventListener('click', () => openVendorDrawer(button.dataset.vendorId || ''));
    });

    document.getElementById('vendorDetailCloseBtn')?.addEventListener('click', closeVendorDrawer);
    document.getElementById('vendorDetailCancelBtn')?.addEventListener('click', closeVendorDrawer);
    document.getElementById('vendorDetailBackdrop')?.addEventListener('click', closeVendorDrawer);
    document.getElementById('vendorDetailForm')?.addEventListener('submit', submitVendorUpdate);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeVendorDrawer();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    wireDrawerActions();
});
