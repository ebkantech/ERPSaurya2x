const CONFIG = {
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    ALLOWED_FILE_TYPES: [
        'application/pdf',
        'image/jpeg',
        'image/png'
    ],
    PDF_WORKER_URL: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js',
    SPEECH_LANGUAGE: 'en-IN'
};

const state = {
    isSubmitting: false,
    ocrInProgress: false,
    voiceRecognition: null,
    voiceSupported: false,
    voiceListening: false,
    activeVoiceFieldId: ''
};

let currentStep = 1;
const TOTAL_STEPS = 5;

const VOICE_FIELD_CONFIG = [
    { id: 'companyName', label: 'Company Name', aliases: ['company name', 'company'] },
    { id: 'address', label: 'Address', aliases: ['address of firm', 'address line one', 'address'] },
    { id: 'address2', label: 'Address Line 2', aliases: ['address line two', 'address 2', 'second address'] },
    { id: 'city', label: 'City', aliases: ['city'] },
    { id: 'state', label: 'State', aliases: ['state'] },
    { id: 'pin', label: 'Pin', aliases: ['pin code', 'pin'] },
    { id: 'country', label: 'Country', aliases: ['country'] },
    { id: 'vendorType', label: 'Vendor Type', aliases: ['vendor type'] },
    { id: 'vendorCategory', label: 'Vendor Category', aliases: ['vendor category'] },
    { id: 'contactPerson', label: 'Contact Person', aliases: ['contact person'] },
    { id: 'emailId', label: 'Email Id', aliases: ['email id', 'email'] },
    { id: 'attendeeName', label: 'Attendee Name', aliases: ['attendee name', 'attendee'] },
    { id: 'bdeName', label: 'BDE Name', aliases: ['bde name', 'contacted by'] },
    { id: 'meetingWith', label: 'Meeting With', aliases: ['meeting with'] },
    { id: 'experienceDetails', label: 'Experience Details', aliases: ['experience details', 'experience'] },
    { id: 'msmeReg', label: 'MSME Reg', aliases: ['msme reg', 'msme registration'] },
    { id: 'panNo', label: 'PAN No', aliases: ['pan number', 'pan no', 'pan'] },
    { id: 'pfReg', label: 'PF Reg', aliases: ['pf reg', 'pf registration'] },
    { id: 'gstNo', label: 'GST No', aliases: ['gst number', 'gst no', 'gst'] },
    { id: 'gstType', label: 'GST Type', aliases: ['gst type'] },
    { id: 'gstStatus', label: 'GST Status', aliases: ['gst status'] },
    { id: 'lastGstr1', label: 'Last GSTR 1', aliases: ['last gstr one', 'last gstr 1'] },
    { id: 'gstPendingStatus', label: 'Status Pending', aliases: ['status pending', 'gst pending status'] },
    { id: 'aadhaarNo', label: 'Aadhaar No', aliases: ['aadhaar number', 'aadhar number', 'aadhaar no', 'aadhar no'] },
    { id: 'labourWelfareFund', label: 'Labour Welfare Fund', aliases: ['labour welfare fund'] },
    { id: 'professionalTax', label: 'Professional Tax', aliases: ['professional tax'] },
    { id: 'turnoverYear1', label: 'Turnover Last Financial Year', aliases: ['turnover last financial year', 'turnover year one', 'turnover first year'] },
    { id: 'turnoverYear2', label: 'Turnover Previous Financial Year', aliases: ['turnover previous financial year', 'turnover year two', 'turnover second year'] },
    { id: 'turnoverYear3', label: 'Turnover Third Financial Year', aliases: ['turnover third financial year', 'turnover year three'] },
    { id: 'bankAccountName', label: 'Bank Account Name', aliases: ['bank account name', 'name as per bank account'] },
    { id: 'bankNameAddress', label: 'Bank Name Address', aliases: ['bank name and address', 'bank name address'] },
    { id: 'accountType', label: 'Account Type', aliases: ['account type'] },
    { id: 'accountNumber', label: 'Account Number', aliases: ['account number', 'account no'] },
    { id: 'bankProofType', label: 'Bank Proof Type', aliases: ['bank proof type', 'proof type'] }
];

const SELECT_SPEECH_VALUES = {
    vendorType: {
        'private limited': 'private limited',
        'proprietor': 'proprieter',
        'proprieter': 'proprieter',
        'partner': 'partner',
        'individual': 'individual'
    },
    vendorCategory: {
        'service provider': 'service-provider',
        'service-provider': 'service-provider',
        'sub contractor': 'sub-contractor',
        'sub-contractor': 'sub-contractor'
    },
    gstPendingStatus: {
        'more than year': 'more than year',
        'less than second year': 'less than second year'
    },
    accountType: {
        savings: 'savings',
        current: 'current',
        'cash credit': 'cash credit',
        other: 'other'
    },
    bankProofType: {
        passbook: 'passbook',
        'cancelled cheque': 'cancelled-cheque',
        'cancel cheque': 'cancelled-cheque',
        cheque: 'cancelled-cheque'
    }
};

function showStep(stepNumber) {
    currentStep = Math.max(1, Math.min(TOTAL_STEPS, stepNumber));
    document.querySelectorAll('.form-step').forEach((el) => {
        el.classList.add('d-none');
        if (parseInt(el.dataset.step, 10) === currentStep) el.classList.remove('d-none');
    });
    document.querySelectorAll('.step-label').forEach((el) => {
        const isActive = parseInt(el.dataset.step || '0', 10) === currentStep;
        el.classList.toggle('active', isActive);
        el.classList.toggle('text-muted', !isActive);
        el.setAttribute('aria-current', isActive ? 'step' : 'false');
    });

    const pct = (currentStep / TOTAL_STEPS) * 100;
    const bar = document.getElementById('formProgress');
    if (bar) bar.style.width = `${pct}%`;

    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    const submit = document.getElementById('submitBtn');
    if (prev) prev.style.display = currentStep === 1 ? 'none' : 'inline-block';
    if (next) next.style.display = currentStep === TOTAL_STEPS ? 'none' : 'inline-block';
    if (submit) submit.classList.toggle('d-none', currentStep !== TOTAL_STEPS);
    if (currentStep === TOTAL_STEPS) populateReview();

    const titles = {
        1: 'Vendor Registration - Company Information',
        2: 'Vendor Registration - Contact Information',
        3: 'Vendor Registration - KYC',
        4: 'Vendor Registration - Financial Details',
        5: 'Vendor Registration - Review'
    };
    document.title = titles[currentStep] || 'Vendor Registration';
}

function nextStep() {
    if (currentStep === 1 && !validateCompanyStep()) return;
    if (currentStep === 2 && !validateContactStep()) return;
    if (currentStep === 3 && !validateKycStep()) return;
    if (currentStep === 4 && !validateFinancialStep()) return;
    showStep(currentStep + 1);
}

function prevStep() {
    showStep(currentStep - 1);
}

function validateCompanyStep() {
    const requiredIds = ['companyName', 'address', 'city', 'state', 'pin', 'country'];
    for (const id of requiredIds) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            showError('Please complete company and address details before proceeding');
            return false;
        }
    }
    return true;
}

function validateContactStep() {
    const requiredIds = ['vendorType', 'vendorCategory', 'contactPerson', 'emailId', 'attendeeName', 'bdeName', 'meetingWith'];
    for (const id of requiredIds) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            showError('Please fill contact information and meeting details');
            return false;
        }
    }
    const email = document.getElementById('emailId');
    if (!email.checkValidity()) {
        showError('Please enter a valid Email-id');
        return false;
    }
    return true;
}

function getClientValues() {
    return Array.from(document.querySelectorAll('.client-name-input'))
        .map((input) => input.value.trim())
        .filter(Boolean);
}

function validateKycStep() {
    const requiredIds = ['experienceDetails', 'msmeReg', 'panNo', 'pfReg', 'aadhaarNo'];
    for (const id of requiredIds) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            showError('Please complete the required KYC details');
            return false;
        }
    }
    if (!getClientValues().length) {
        showError('Please add at least one client below the experience details');
        return false;
    }
    const gstNo = document.getElementById('gstNo').value.trim();
    if (gstNo) {
        const gstRequiredIds = ['gstType', 'gstStatus', 'lastGstr1', 'gstPendingStatus'];
        for (const id of gstRequiredIds) {
            const el = document.getElementById(id);
            if (!el || !el.value.trim()) {
                showError('Please complete GST details when GST No is provided');
                return false;
            }
        }
    }
    return true;
}

function validateFinancialStep() {
    const requiredIds = ['turnoverYear1', 'turnoverYear2', 'turnoverYear3', 'bankAccountName', 'bankNameAddress', 'accountType', 'accountNumber', 'bankProofType'];
    for (const id of requiredIds) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            showError('Please complete the financial details section');
            return false;
        }
    }
    const bankProofFile = document.getElementById('bankProofFile');
    if (!bankProofFile.files || !bankProofFile.files[0]) {
        showError('Please upload the passbook or cancelled cheque file');
        return false;
    }
    if (state.ocrInProgress) {
        showError('Please wait for the bank proof reading process to finish');
        return false;
    }
    return true;
}

function populateReview() {
    const container = document.getElementById('reviewReportSections');
    if (!container) return;

    const statusValue = (document.querySelector('input[name="qualification_status"]:checked') || { value: '' }).value;
    const reviewTitle = document.getElementById('reviewReportTitle');
    const reviewDateValue = document.getElementById('reviewDateValue');
    const reviewStatusValue = document.getElementById('reviewStatusValue');
    const reviewBanner = document.getElementById('reviewBanner');
    const companyName = getValue('companyName') || 'Vendor Information Review';
    const bankProofFile = document.getElementById('bankProofFile');
    const bankProofFileName = bankProofFile && bankProofFile.files && bankProofFile.files[0]
        ? bankProofFile.files[0].name
        : 'Not uploaded';

    if (reviewTitle) reviewTitle.textContent = `${companyName} - Verification Summary`;
    if (reviewDateValue) reviewDateValue.textContent = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    if (reviewStatusValue) reviewStatusValue.textContent = formatStatus(statusValue || 'pending review');
    if (reviewBanner) {
        reviewBanner.textContent = statusValue
            ? `Vendor marked as ${formatStatus(statusValue)}. Please verify all sections below before submission.`
            : 'Confirm company details, KYC data, financial proof, and vendor status before submitting.';
    }

    const sections = [
        {
            title: 'Company Information',
            rows: [
                ['Company Name', getValue('companyName')],
                ['Address', joinParts([getValue('address'), getValue('address2')])],
                ['Location', joinParts([getValue('city'), getValue('state'), getValue('pin')])],
                ['Country', getValue('country')]
            ]
        },
        {
            title: 'Contact Information',
            rows: [
                ['Vendor Type', getValue('vendorType')],
                ['Vendor Category', getValue('vendorCategory')],
                ['Contact Person', getValue('contactPerson')],
                ['Email-id', getValue('emailId')],
                ['Attendee Name', getValue('attendeeName')],
                ['Contacted By (BDE)', getValue('bdeName')],
                ['Meeting With', getValue('meetingWith')]
            ]
        },
        {
            title: 'KYC Information',
            rows: [
                ['Experience Details', getValue('experienceDetails')],
                ['Client List', getClientValues().join(', ')],
                ['MSME Reg', getValue('msmeReg')],
                ['PAN No', getValue('panNo')],
                ['PF Reg', getValue('pfReg')],
                ['GST No', getValue('gstNo') || 'Not provided'],
                ['GST Type', getValue('gstType') || 'Not provided'],
                ['GST Status', getValue('gstStatus') || 'Not provided'],
                ['Last GSTR-1', getValue('lastGstr1') || 'Not provided'],
                ['Status Pending', getValue('gstPendingStatus') || 'Not provided'],
                ['Aadhar No', getValue('aadhaarNo')],
                ['Labour Welfare Fund', getValue('labourWelfareFund') || 'Not provided'],
                ['Professional Tax', getValue('professionalTax') || 'Not provided']
            ]
        },
        {
            title: 'Financial Details',
            rows: [
                ['Turnover Last Financial Year', getValue('turnoverYear1')],
                ['Turnover Previous Financial Year', getValue('turnoverYear2')],
                ['Turnover Third Financial Year', getValue('turnoverYear3')],
                ['Name as per Bank A/C', getValue('bankAccountName')],
                ['Bank Name & Address', getValue('bankNameAddress')],
                ['Account Type', getValue('accountType')],
                ['Account No', getValue('accountNumber')],
                ['Bank Proof Type', getValue('bankProofType')],
                ['Uploaded Proof File', bankProofFileName]
            ]
        },
        {
            title: 'Approval Check',
            rows: [
                ['Vendor Status', statusValue ? formatStatus(statusValue) : 'Pending review']
            ]
        }
    ];

    container.innerHTML = sections.map(renderReviewSection).join('');
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function joinParts(parts) {
    return parts.filter(Boolean).join(', ');
}

function formatStatus(value) {
    return String(value || '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDisplayValue(value) {
    const text = String(value || '').trim();
    return text ? sanitizeInput(text).replace(/\n/g, '<br>') : '<span class="review-empty">Not provided</span>';
}

function renderReviewSection(section) {
    const rows = section.rows.map(([label, value]) => `
        <div class="review-row">
            <div class="review-label">${sanitizeInput(label)}</div>
            <div class="review-value">${formatDisplayValue(value)}</div>
        </div>
    `).join('');

    return `
        <section class="review-section">
            <div class="review-section-heading">${sanitizeInput(section.title)}</div>
            <div class="review-section-body">${rows}</div>
        </section>
    `;
}

function getCookie(name) {
    const v = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
    return v ? v.pop() : '';
}

function normalizeVoiceText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^\w\s/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getVoiceFieldConfig(fieldId) {
    return VOICE_FIELD_CONFIG.find((item) => item.id === fieldId) || null;
}

function getLabelTextForField(el) {
    if (!el) return 'None';
    const config = getVoiceFieldConfig(el.id);
    if (config) return config.label;
    const label = document.querySelector(`label[for="${el.id}"]`);
    return label ? label.textContent.replace(/\*/g, '').trim() : 'None';
}

function updateVoiceFieldDisplay() {
    const fieldLabel = document.getElementById('voiceAssistantField');
    const target = getActiveVoiceField();
    if (fieldLabel) fieldLabel.textContent = `Selected Field: ${target ? getLabelTextForField(target) : 'None'}`;
}

function setVoiceStatus(message, tone = '') {
    const statusEl = document.getElementById('voiceAssistantStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('listening', 'error');
    if (tone) statusEl.classList.add(tone);
}

function updateVoiceButtons() {
    const startBtn = document.getElementById('voiceStartBtn');
    const stopBtn = document.getElementById('voiceStopBtn');
    if (startBtn) startBtn.disabled = !state.voiceSupported || state.voiceListening;
    if (stopBtn) stopBtn.disabled = !state.voiceSupported || !state.voiceListening;
}

function dispatchFieldEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function clearVoiceTargetHighlight() {
    document.querySelectorAll('.voice-active-target').forEach((el) => el.classList.remove('voice-active-target'));
}

function setActiveVoiceFieldByElement(el) {
    const target = el && el.id ? el : null;
    state.activeVoiceFieldId = target ? target.id : '';
    clearVoiceTargetHighlight();
    if (target) target.classList.add('voice-active-target');
    updateVoiceFieldDisplay();
}

function getActiveVoiceField() {
    if (!state.activeVoiceFieldId) return null;
    return document.getElementById(state.activeVoiceFieldId);
}

function normalizeEmailVoice(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+at\s+/g, '@')
        .replace(/\s+dot\s+/g, '.')
        .replace(/\s+/g, '');
}

function normalizeCompactVoice(value) {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeMonthVoice(value) {
    const text = String(value || '').trim();
    const parsed = new Date(`1 ${text}`);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function applySelectVoiceValue(el, transcript) {
    const optionMap = SELECT_SPEECH_VALUES[el.id] || {};
    const normalizedTranscript = normalizeVoiceText(transcript);
    const mappedEntry = Object.entries(optionMap).find(([spoken]) => normalizedTranscript.includes(normalizeVoiceText(spoken)));
    if (mappedEntry) {
        el.value = mappedEntry[1];
        dispatchFieldEvents(el);
        return true;
    }

    const options = Array.from(el.options);
    const matchedOption = options.find((option) => normalizeVoiceText(option.textContent) === normalizedTranscript)
        || options.find((option) => normalizedTranscript.includes(normalizeVoiceText(option.textContent)));
    if (matchedOption) {
        el.value = matchedOption.value;
        dispatchFieldEvents(el);
        return true;
    }
    return false;
}

function applyVoiceValueToField(el, transcript) {
    if (!el) return false;
    const raw = String(transcript || '').trim();
    if (!raw) return false;

    let value = raw;
    if (el.id === 'emailId') value = normalizeEmailVoice(raw);
    if (['panNo', 'gstNo', 'aadhaarNo', 'accountNumber', 'msmeReg', 'pfReg'].includes(el.id)) value = normalizeCompactVoice(raw);
    if (el.id === 'pin') value = raw.replace(/\s+/g, '');
    if (el.type === 'month') {
        const monthValue = normalizeMonthVoice(raw);
        if (!monthValue) return false;
        el.value = monthValue;
        dispatchFieldEvents(el);
        return true;
    }

    if (el.tagName === 'SELECT') return applySelectVoiceValue(el, raw);

    el.value = value;
    dispatchFieldEvents(el);
    return true;
}

function addVoiceClient(value) {
    const cleanedValue = String(value || '').trim();
    if (!cleanedValue) return false;
    const container = document.getElementById('clientListContainer');
    if (!container) return false;
    const rows = Array.from(container.querySelectorAll('.client-name-input'));
    const lastInput = rows[rows.length - 1];
    if (lastInput && !lastInput.value.trim()) {
        lastInput.value = cleanedValue;
    } else {
        container.appendChild(createClientEntry(cleanedValue));
        attachVoiceFieldTracking();
    }
    syncClientRemoveButtons();
    return true;
}

function setQualificationFromVoice(transcript) {
    const normalized = normalizeVoiceText(transcript);
    if (normalized.includes('disqualified')) {
        const disqualified = document.getElementById('disqualified');
        if (disqualified) {
            disqualified.checked = true;
            dispatchFieldEvents(disqualified);
            return 'Disqualified';
        }
    }
    if (normalized.includes('qualified')) {
        const qualified = document.getElementById('qualified');
        if (qualified) {
            qualified.checked = true;
            dispatchFieldEvents(qualified);
            return 'Qualified';
        }
    }
    return '';
}

function extractVoiceCommandValue(transcript, aliases) {
    const normalizedTranscript = normalizeVoiceText(transcript);
    for (const alias of aliases) {
        const normalizedAlias = normalizeVoiceText(alias);
        const patterns = [
            `${normalizedAlias} is `,
            `${normalizedAlias} `,
            `${normalizedAlias}:`
        ];
        for (const pattern of patterns) {
            if (normalizedTranscript.startsWith(pattern)) return transcript.slice(pattern.length).trim();
        }
    }
    return '';
}

function applyVoiceCommandTranscript(transcript) {
    const qualification = setQualificationFromVoice(transcript);
    if (qualification) {
        setVoiceStatus(`Updated vendor status: ${qualification}`);
        return true;
    }

    const clientValue = extractVoiceCommandValue(transcript, ['add client', 'client name', 'client']);
    if (clientValue) {
        addVoiceClient(clientValue);
        setVoiceStatus(`Added client: ${clientValue}`);
        return true;
    }

    for (const field of VOICE_FIELD_CONFIG) {
        const value = extractVoiceCommandValue(transcript, field.aliases);
        if (!value) continue;
        const el = document.getElementById(field.id);
        if (!el) continue;
        setActiveVoiceFieldByElement(el);
        if (applyVoiceValueToField(el, value)) {
            setVoiceStatus(`Updated ${field.label}`);
            return true;
        }
    }
    return false;
}

function applyVoiceNavigation(transcript) {
    const normalized = normalizeVoiceText(transcript);
    if (normalized === 'next' || normalized === 'next step') {
        nextStep();
        setVoiceStatus('Moved to next step');
        return true;
    }
    if (normalized === 'previous' || normalized === 'previous step' || normalized === 'back') {
        prevStep();
        setVoiceStatus('Moved to previous step');
        return true;
    }
    if (normalized === 'submit' || normalized === 'submit form') {
        const form = document.getElementById('vendorForm');
        if (form) form.requestSubmit();
        setVoiceStatus('Submitting form');
        return true;
    }
    return false;
}

function handleVoiceTranscript(transcript) {
    const cleanedTranscript = String(transcript || '').trim();
    if (!cleanedTranscript) {
        setVoiceStatus('No speech detected', 'error');
        return;
    }
    if (applyVoiceNavigation(cleanedTranscript)) return;

    const activeField = getActiveVoiceField();
    if (activeField && applyVoiceValueToField(activeField, cleanedTranscript)) {
        setVoiceStatus(`Updated ${getLabelTextForField(activeField)}`);
        return;
    }

    if (applyVoiceCommandTranscript(cleanedTranscript)) return;

    setVoiceStatus('Voice input could not match a field', 'error');
}

function stopVoiceAssistant() {
    if (!state.voiceRecognition || !state.voiceListening) {
        updateVoiceButtons();
        return;
    }
    state.voiceRecognition.stop();
}

function startVoiceAssistant() {
    if (!state.voiceSupported || !state.voiceRecognition || state.voiceListening) {
        updateVoiceButtons();
        return;
    }
    state.voiceRecognition.start();
}

function attachVoiceFieldTracking() {
    const fieldSelector = '#vendorForm input:not([type="file"]):not([type="radio"]), #vendorForm textarea, #vendorForm select, #clientListContainer .client-name-input';
    document.querySelectorAll(fieldSelector).forEach((el) => {
        if (el.dataset.voiceBound === 'true') return;
        el.dataset.voiceBound = 'true';
        el.addEventListener('focus', () => setActiveVoiceFieldByElement(el));
        el.addEventListener('click', () => setActiveVoiceFieldByElement(el));
    });
}

function initializeVoiceAssistant() {
    const startBtn = document.getElementById('voiceStartBtn');
    const stopBtn = document.getElementById('voiceStopBtn');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    attachVoiceFieldTracking();
    updateVoiceFieldDisplay();

    if (!SpeechRecognition) {
        state.voiceSupported = false;
        setVoiceStatus('Voice input is not supported in this browser', 'error');
        updateVoiceButtons();
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = CONFIG.SPEECH_LANGUAGE;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        state.voiceListening = true;
        setVoiceStatus('Listening...', 'listening');
        updateVoiceButtons();
    };

    recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        handleVoiceTranscript(transcript);
    };

    recognition.onerror = (event) => {
        const message = event.error === 'not-allowed'
            ? 'Microphone permission was denied'
            : 'Voice input failed';
        setVoiceStatus(message, 'error');
    };

    recognition.onend = () => {
        state.voiceListening = false;
        updateVoiceButtons();
        if (!document.getElementById('voiceAssistantStatus')?.classList.contains('error')) {
            setVoiceStatus('Voice input ready');
        }
    };

    state.voiceRecognition = recognition;
    state.voiceSupported = true;
    updateVoiceButtons();

    if (startBtn) startBtn.addEventListener('click', startVoiceAssistant);
    if (stopBtn) stopBtn.addEventListener('click', stopVoiceAssistant);
}

function attachStepLabelHandlers() {
    document.querySelectorAll('.step-label').forEach((el) => {
        const step = parseInt(el.dataset.step || '0', 10);
        el.addEventListener('mouseenter', (e) => {
            e.preventDefault();
            if (step) showStep(step);
        });
        el.addEventListener('click', (e) => {
            e.preventDefault();
            if (step) showStep(step);
        });
    });
}

function sanitizeInput(input) {
    const temp = document.createElement('div');
    temp.textContent = input;
    return temp.innerHTML;
}

function validateFile(file) {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showError('File size exceeds 5MB');
        return false;
    }
    if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
        showError('Invalid file type');
        return false;
    }
    return true;
}

function showError(message) {
    const errorContainer = document.getElementById('errorContainer');
    if (!errorContainer) return;
    errorContainer.innerHTML = Array.isArray(message)
        ? message.map((item) => `<div>${sanitizeInput(String(item))}</div>`).join('')
        : sanitizeInput(String(message));
    errorContainer.classList.remove('d-none');
    setTimeout(() => errorContainer.classList.add('d-none'), 6000);
}

function showBankProofStatus(message, level) {
    const statusEl = document.getElementById('bankProofStatus');
    if (!statusEl) return;
    statusEl.className = `file-upload-status mt-2 alert p-2 show alert-${level}`;
    statusEl.textContent = message;
}

function clearBankProofStatus() {
    const statusEl = document.getElementById('bankProofStatus');
    if (!statusEl) return;
    statusEl.className = 'file-upload-status mt-2 alert p-2';
    statusEl.textContent = '';
}

function updateGstDetailsVisibility() {
    const gstNo = document.getElementById('gstNo').value.trim();
    const section = document.getElementById('gstDetailsSection');
    if (!section) return;
    section.classList.toggle('d-none', !gstNo);
    if (!gstNo) {
        ['gstType', 'gstStatus', 'lastGstr1', 'gstPendingStatus'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
}

function createClientEntry(value = '') {
    const row = document.createElement('div');
    row.className = 'client-entry-row';
    row.innerHTML = `
        <input class="form-control client-name-input" type="text" maxlength="120" placeholder="Enter client name" value="${sanitizeInput(value)}" required>
        <button type="button" class="btn btn-outline-danger client-remove-btn" aria-label="Remove client">-</button>
    `;
    const removeBtn = row.querySelector('.client-remove-btn');
    removeBtn.addEventListener('click', () => {
        row.remove();
        syncClientRemoveButtons();
    });
    return row;
}

function resetClientEntries() {
    const container = document.getElementById('clientListContainer');
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(createClientEntry(''));
    attachVoiceFieldTracking();
    syncClientRemoveButtons();
}

function resetVendorForm() {
    const form = document.getElementById('vendorForm');
    if (!form) return;

    form.reset();
    resetClientEntries();
    clearBankProofStatus();
    state.ocrInProgress = false;
    state.isSubmitting = false;

    const errorContainer = document.getElementById('errorContainer');
    if (errorContainer) errorContainer.classList.add('d-none');

    const vendorId = document.getElementById('vendorId');
    if (vendorId) vendorId.textContent = '';

    setActiveVoiceFieldByElement(document.getElementById('companyName'));
    setVoiceStatus(state.voiceSupported ? 'Voice input ready' : 'Voice input is not supported in this browser');
    updateGstDetailsVisibility();
    showStep(1);
}

function syncClientRemoveButtons() {
    const rows = Array.from(document.querySelectorAll('.client-entry-row'));
    rows.forEach((row, index) => {
        const removeBtn = row.querySelector('.client-remove-btn');
        if (removeBtn) removeBtn.classList.toggle('d-none', rows.length === 1 && index === 0);
    });
}

function attachClientHandlers() {
    const addClientBtn = document.getElementById('addClientBtn');
    const container = document.getElementById('clientListContainer');
    if (!addClientBtn || !container) return;

    addClientBtn.addEventListener('click', () => {
        container.appendChild(createClientEntry());
        attachVoiceFieldTracking();
        syncClientRemoveButtons();
    });

    container.querySelectorAll('.client-entry-row').forEach((row) => {
        const removeBtn = row.querySelector('.client-remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
                syncClientRemoveButtons();
            });
        }
    });
    syncClientRemoveButtons();
}

function parseAccountNumber(text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const directPatterns = [
        /account\s*(?:number|no|#)?\s*[:\-]?\s*([0-9]{9,18})/i,
        /a\/c\s*(?:number|no|#)?\s*[:\-]?\s*([0-9]{9,18})/i
    ];
    for (const pattern of directPatterns) {
        const match = normalized.match(pattern);
        if (match) return match[1];
    }

    const candidates = normalized.match(/[0-9]{9,18}/g) || [];
    if (!candidates.length) return '';
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
}

function parseBankNameAndAddress(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    let bankLineIndex = lines.findIndex((line) => /\bbank\b/i.test(line) && !/account|ifsc|micr|statement/i.test(line));
    if (bankLineIndex === -1) bankLineIndex = lines.findIndex((line) => /branch/i.test(line));

    let bankName = '';
    let addressLines = [];

    if (bankLineIndex !== -1) {
        bankName = lines[bankLineIndex];
        for (let i = bankLineIndex + 1; i < lines.length && addressLines.length < 3; i++) {
            const line = lines[i];
            if (/account|a\/c|ifsc|micr|customer|date|phone|email/i.test(line)) break;
            if (/road|rd|street|st|nagar|colony|branch|floor|building|lane|city|state|pin|pincode|\d{6}|,|\-/i.test(line)) {
                addressLines.push(line);
            }
        }
    }

    return {
        bankName,
        bankAddress: addressLines.join(', ')
    };
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function ensureOcrLibs() {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
}

async function ensurePdfLib() {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js');
}

async function extractTextFromImage(file) {
    await ensureOcrLibs();
    const result = await Tesseract.recognize(file, 'eng', { logger: () => {} });
    return result.data.text || '';
}

async function extractTextFromPdf(file) {
    await ensurePdfLib();
    await ensureOcrLibs();
    if (!window.pdfjsLib) throw new Error('PDF reader not available');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.PDF_WORKER_URL;

    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;

    const result = await Tesseract.recognize(canvas, 'eng', { logger: () => {} });
    return result.data.text || '';
}

async function readBankProofDetails(file) {
    if (!validateFile(file)) {
        document.getElementById('bankProofFile').value = '';
        return;
    }

    const accountNumberField = document.getElementById('accountNumber');
    const bankNameAddressField = document.getElementById('bankNameAddress');
    state.ocrInProgress = true;
    showBankProofStatus('Reading bank proof details. Please wait...', 'info');

    try {
        let extractedText = '';
        if (file.type === 'application/pdf') {
            extractedText = await extractTextFromPdf(file);
        } else {
            extractedText = await extractTextFromImage(file);
        }

        const accountNumber = parseAccountNumber(extractedText);
        const bankDetails = parseBankNameAndAddress(extractedText);

        if (accountNumber) accountNumberField.value = accountNumber;
        if (bankDetails.bankName || bankDetails.bankAddress) {
            bankNameAddressField.value = [bankDetails.bankName, bankDetails.bankAddress].filter(Boolean).join('\n');
        }

        if (accountNumber || bankDetails.bankName || bankDetails.bankAddress) {
            showBankProofStatus('Bank proof processed. Bank details and account number were filled where detected.', 'success');
        } else {
            showBankProofStatus('Bank proof uploaded, but auto-reading could not find enough details. Please complete the fields manually.', 'warning');
        }
    } catch (error) {
        console.error(error);
        showBankProofStatus('Bank proof uploaded, but automatic reading failed. Please enter the bank details manually.', 'warning');
    } finally {
        state.ocrInProgress = false;
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const requiredInputs = document.querySelectorAll('#vendorForm input[required]:not([type="radio"]):not([type="file"]), #vendorForm select[required], #vendorForm textarea[required]');
    for (const input of requiredInputs) {
        if (!input.value.trim()) {
            showError('Please fill required fields');
            return;
        }
    }

    const bankProofFile = document.getElementById('bankProofFile');
    if (!bankProofFile.files || !bankProofFile.files[0]) {
        showError('Please upload the passbook or cancelled cheque file');
        return;
    }

    const email = document.getElementById('emailId');
    if (!email.checkValidity()) {
        showError('Please enter a valid Email-id');
        return;
    }

    if (!validateKycStep() || !validateFinancialStep()) return;

    const qual = document.querySelector('input[name="qualification_status"]:checked');
    if (!qual) {
        showError('Please select vendor status');
        return;
    }

    state.isSubmitting = true;
    document.getElementById('submitBtn').disabled = true;

    try {
        const formData = new FormData();
        const fieldIds = [
            'companyName', 'address', 'address2', 'city', 'state', 'pin', 'country',
            'experienceDetails', 'vendorType', 'vendorCategory', 'contactPerson', 'emailId',
            'attendeeName', 'bdeName', 'meetingWith', 'msmeReg', 'panNo', 'pfReg',
            'gstNo', 'gstType', 'gstStatus', 'lastGstr1', 'gstPendingStatus', 'aadhaarNo',
            'labourWelfareFund', 'professionalTax', 'turnoverYear1', 'turnoverYear2',
            'turnoverYear3', 'bankAccountName', 'bankNameAddress', 'accountType', 'accountNumber',
            'bankProofType'
        ];
        fieldIds.forEach((id) => formData.append(id, getValue(id)));
        formData.append('clientListData', JSON.stringify(getClientValues()));
        formData.append('qualification_status', qual.value);
        if (bankProofFile.files[0]) formData.append('bankProofFile', bankProofFile.files[0]);

        const csrftoken = getCookie('csrftoken');
        const resp = await fetch(REGISTER_URL, {
            method: 'POST',
            body: formData,
            headers: { 'X-CSRFToken': csrftoken }
        });

        // If the response is HTML (login page redirect), session expired
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            showError('Your session has expired. Please refresh the page and log in again before submitting.');
            return;
        }

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            showError(data.error || 'Failed to submit');
            return;
        }

        const vendorId = data.vendor_id || '';
        if (vendorId) showSuccessModal(vendorId);
        else showError('No vendor ID returned');
    } catch (err) {
        console.error(err);
        showError('Network error');
    } finally {
        state.isSubmitting = false;
        document.getElementById('submitBtn').disabled = false;
    }
}

function showSuccessModal(vendorId) {
    const idEl = document.getElementById('vendorId');
    if (idEl) idEl.textContent = vendorId;
    const modalEl = document.getElementById('successModal');
    if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modalEl.addEventListener('hidden.bs.modal', resetVendorForm, { once: true });
        modal.show();
    }
}

function copyVendorId() {
    const code = document.getElementById('vendorId').textContent;
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {}).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('vendorForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const gstNo = document.getElementById('gstNo');
    if (gstNo) gstNo.addEventListener('input', updateGstDetailsVisibility);

    const bankProofFile = document.getElementById('bankProofFile');
    if (bankProofFile) {
        bankProofFile.addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) await readBankProofDetails(file);
        });
    }

    attachStepLabelHandlers();
    attachClientHandlers();
    initializeVoiceAssistant();
    updateGstDetailsVisibility();
    showStep(1);
    setActiveVoiceFieldByElement(document.getElementById('companyName'));
});
