// ==========================================
// ExpenseAI - Main JavaScript
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    loadCountries();
    initPasswordStrength();
    initSession();
    bootstrapPage();
});

var API_BASE = localStorage.getItem('expenseai-api-base') || 'http://localhost:5000/api';

var ROLE_HOME = {
    admin: 'admin.html',
    manager: 'manager.html',
    employee: 'employee.html',
    finance: 'finance.html',
    director: 'director.html'
};

var ROLE_ALLOWED_PAGES = {
    admin: ['admin.html', 'employee.html', 'manager.html', 'dashboard.html'],
    manager: ['manager.html', 'employee.html', 'dashboard.html'],
    employee: ['employee.html', 'dashboard.html'],
    finance: ['finance.html', 'dashboard.html'],
    director: ['director.html', 'dashboard.html']
};

function getAuthToken() {
    return localStorage.getItem('expenseai-token');
}

function getCurrentUser() {
    var raw = localStorage.getItem('expenseai-user');
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function saveSession(payload) {
    localStorage.setItem('expenseai-token', payload.token);
    localStorage.setItem('expenseai-user', JSON.stringify(payload.user));
    if (payload.user && payload.user.companyCode) {
        localStorage.setItem('expenseai-company-code', payload.user.companyCode);
    }
}

function clearSession() {
    localStorage.removeItem('expenseai-token');
    localStorage.removeItem('expenseai-user');
    localStorage.removeItem('expenseai-company-code');
}

function redirectByRole(role) {
    var destination = ROLE_HOME[String(role || '').toLowerCase()] || 'employee.html';
    window.location.href = destination;
}

function isPageAllowedForRole(page, role) {
    var normalizedRole = String(role || '').toLowerCase();
    var allowed = ROLE_ALLOWED_PAGES[normalizedRole] || [];
    return page === 'index.html' || allowed.indexOf(page) !== -1;
}

function applyRoleNavigationVisibility(role) {
    var normalizedRole = String(role || '').toLowerCase();
    var links = document.querySelectorAll('.sidebar-link[href]');
    links.forEach(function (link) {
        var href = link.getAttribute('href') || '';
        if (href === '#' || href === 'index.html') {
            return;
        }

        if (!isPageAllowedForRole(href, normalizedRole)) {
            link.classList.add('hidden');
        }
    });
}

function apiFetch(path, options) {
    var opts = options || {};
    var headers = opts.headers || {};
    headers['Content-Type'] = 'application/json';

    var token = getAuthToken();
    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }

    return fetch(API_BASE + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
                var message = data.message || 'Request failed';
                throw new Error(message);
            }
            return data;
        });
    });
}

function initSession() {
    var links = document.querySelectorAll('a[href="index.html"]');
    links.forEach(function (link) {
        if (String(link.textContent || '').toLowerCase().indexOf('logout') !== -1) {
            link.addEventListener('click', function () {
                clearSession();
            });
        }
    });
}

function bootstrapPage() {
    var page = window.location.pathname.split('/').pop() || 'index.html';
    var user = getCurrentUser();

    if (page !== 'index.html') {
        if (!getAuthToken() || !user) {
            window.location.href = 'index.html';
            return;
        }

        if (!isPageAllowedForRole(page, user.role)) {
            redirectByRole(user.role);
            return;
        }

        applyRoleNavigationVisibility(user.role);
    }

    if (page === 'employee.html') {
        loadEmployeeExpenses();
    }
    if (page === 'manager.html') {
        loadPendingApprovals();
    }
    if (page === 'admin.html') {
        loadWorkflows();
    }
    if (page === 'finance.html') {
        loadFinanceApprovals();
    }
    if (page === 'director.html') {
        loadDirectorExpenses();
    }
}

// ==========================================
// THEME MANAGEMENT
// ==========================================

function initTheme() {
    const saved = localStorage.getItem('expenseai-theme');
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        const toggle = document.getElementById('theme-toggle');
        if (toggle) toggle.classList.add('active');
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('expenseai-theme', isLight ? 'light' : 'dark');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.classList.toggle('active');
}

// ==========================================
// SIDEBAR
// ==========================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

// ==========================================
// AUTH TABS
// ==========================================

function switchTab(tab) {
    const loginForm = document.getElementById('form-login');
    const signupForm = document.getElementById('form-signup');
    const loginTab = document.getElementById('tab-login');
    const signupTab = document.getElementById('tab-signup');

    if (!loginForm || !signupForm) return;

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        loginTab.className = 'flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg';
        signupTab.className = 'flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 text-gray-400 hover:text-white';
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        signupTab.className = 'flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg';
        loginTab.className = 'flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 text-gray-400 hover:text-white';
    }
}

// ==========================================
// LOGIN / SIGNUP
// ==========================================

function handleLogin() {
    const email = document.getElementById('login-email');
    const password = document.getElementById('login-password');
    const companyCodeInput = document.getElementById('login-company-code');
    if (email && password && email.value && password.value) {
        var companyCode = (companyCodeInput && companyCodeInput.value ? companyCodeInput.value : localStorage.getItem('expenseai-company-code') || '').trim();

        showToast('Signing in...', 'info');
        apiFetch('/auth/login', {
            method: 'POST',
            body: {
                companyCode: companyCode ? String(companyCode).toUpperCase() : undefined,
                email: email.value.trim(),
                password: password.value
            }
        })
            .then(function (data) {
                saveSession(data);
                showToast('Signed in successfully', 'success');
                setTimeout(function () {
                    redirectByRole(data.user.role);
                }, 500);
            })
            .catch(function (err) {
                showToast(err.message, 'error');
            });
    } else {
        showToast('Please fill in all fields', 'error');
    }
}

function handleSignup() {
    const company = document.getElementById('signup-company');
    const country = document.getElementById('signup-country');
    const email = document.getElementById('signup-email');
    const password = document.getElementById('signup-password');
    if (company && country && email && password && company.value && country.value && email.value && password.value) {
        var nameParts = email.value.split('@')[0].split(/[._-]/);
        var firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'User';
        var lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'Admin';
        var companyCode = company.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'COMPANY1';
        var detectedCurrency = 'USD';
        const currency = document.getElementById('detected-currency');
        if (currency && currency.textContent) {
            detectedCurrency = currency.textContent.split(' ')[0].trim();
        }

        showToast('Creating your account...', 'info');
        apiFetch('/auth/register', {
            method: 'POST',
            body: {
                companyCode: companyCode,
                companyName: company.value.trim(),
                baseCurrency: detectedCurrency,
                countryCode: country.value.slice(0, 2).toUpperCase(),
                firstName: firstName,
                lastName: lastName,
                email: email.value.trim(),
                password: password.value,
                role: 'admin'
            }
        })
            .then(function (data) {
                saveSession(data);
                var loginCompanyCodeInput = document.getElementById('login-company-code');
                if (loginCompanyCodeInput) {
                    loginCompanyCodeInput.value = companyCode;
                }
                localStorage.setItem('expenseai-company', company.value);
                showToast('Account created. Company code: ' + companyCode, 'success');
                setTimeout(function () {
                    redirectByRole(data.user.role);
                }, 800);
            })
            .catch(function (err) {
                showToast(err.message, 'error');
            });
    } else {
        showToast('Please fill in all fields', 'error');
    }
}

// ==========================================
// COUNTRY / CURRENCY API
// ==========================================

var countriesData = [];

function loadCountries() {
    var select = document.getElementById('signup-country');
    if (!select) return;

    fetch('https://restcountries.com/v3.1/all?fields=name,currencies')
        .then(function (res) { return res.json(); })
        .then(function (data) {
            countriesData = data.sort(function (a, b) {
                return a.name.common.localeCompare(b.name.common);
            });
            countriesData.forEach(function (c) {
                var opt = document.createElement('option');
                opt.value = c.name.common;
                opt.textContent = c.name.common;
                opt.dataset.currencies = JSON.stringify(c.currencies || {});
                select.appendChild(opt);
            });
        })
        .catch(function () {
            // Fallback countries
            var fallback = ['India', 'United States', 'United Kingdom', 'Germany', 'Japan', 'Australia', 'Canada'];
            fallback.forEach(function (name) {
                var opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });
        });
}

function onCountryChange() {
    var select = document.getElementById('signup-country');
    var display = document.getElementById('currency-display');
    var currencySpan = document.getElementById('detected-currency');
    if (!select || !display || !currencySpan) return;

    var selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.currencies) {
        try {
            var currencies = JSON.parse(selectedOption.dataset.currencies);
            var keys = Object.keys(currencies);
            if (keys.length > 0) {
                var code = keys[0];
                var symbol = currencies[code].symbol || code;
                currencySpan.textContent = code + ' (' + symbol + ')';
                display.classList.remove('hidden');
                return;
            }
        } catch (e) { /* ignore */ }
    }
    display.classList.add('hidden');
}

// ==========================================
// PASSWORD STRENGTH
// ==========================================

function initPasswordStrength() {
    var pwInput = document.getElementById('signup-password');
    if (!pwInput) return;

    pwInput.addEventListener('input', function () {
        var val = pwInput.value;
        var strength = 0;
        if (val.length >= 6) strength++;
        if (val.length >= 10) strength++;
        if (/[A-Z]/.test(val) && /[a-z]/.test(val)) strength++;
        if (/[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val)) strength++;

        var colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
        var labels = ['Weak', 'Fair', 'Good', 'Strong'];

        for (var i = 1; i <= 4; i++) {
            var bar = document.getElementById('str-' + i);
            if (bar) {
                bar.className = 'h-1 flex-1 rounded-full transition-all duration-300';
                if (i <= strength) {
                    bar.classList.add(colors[strength - 1]);
                } else {
                    bar.classList.add('bg-white/10');
                }
            }
        }
        var text = document.getElementById('str-text');
        if (text) {
            text.textContent = strength > 0 ? labels[strength - 1] : 'Password strength';
            text.style.color = strength >= 3 ? '#22c55e' : strength >= 2 ? '#eab308' : 'var(--text-muted)';
        }
    });
}

// ==========================================
// EXPENSE MODAL
// ==========================================

function openExpenseModal() {
    var modal = document.getElementById('expense-modal');
    if (modal) modal.classList.add('active');
}

function closeExpenseModal() {
    var modal = document.getElementById('expense-modal');
    if (modal) modal.classList.remove('active');
    // Reset upload
    var placeholder = document.getElementById('upload-placeholder');
    var preview = document.getElementById('upload-preview');
    var ocr = document.getElementById('ocr-result');
    if (placeholder) placeholder.classList.remove('hidden');
    if (preview) preview.classList.add('hidden');
    if (ocr) ocr.classList.add('hidden');
}

// ==========================================
// DRAG & DROP / FILE UPLOAD
// ==========================================

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    var zone = document.getElementById('drop-zone');
    if (zone) zone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    var zone = document.getElementById('drop-zone');
    if (zone) zone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    var zone = document.getElementById('drop-zone');
    if (zone) zone.classList.remove('dragover');
    var files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
}

function handleFileSelect(e) {
    var files = e.target.files;
    if (files.length > 0) processFile(files[0]);
}

function processFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
        var placeholder = document.getElementById('upload-placeholder');
        var preview = document.getElementById('upload-preview');
        var img = document.getElementById('receipt-preview');
        var dateInput = document.getElementById('expense-date');
        if (placeholder) placeholder.classList.add('hidden');
        if (preview) preview.classList.remove('hidden');
        if (img) img.src = e.target.result;

        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().slice(0, 10);
        }

        extractReceiptWithOCR(e.target.result);
    };
    reader.readAsDataURL(file);
}

function parseAmount(text) {
    var amountMatch = text.match(/(?:total|amount|grand total|net amount)[^\d]{0,15}(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i);
    if (amountMatch && amountMatch[1]) {
        return Number(String(amountMatch[1]).replace(/[,\s]/g, ''));
    }

    var anyAmount = text.match(/(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})|\d{3,}(?:\.\d{1,2})?)/);
    if (anyAmount && anyAmount[1]) {
        return Number(String(anyAmount[1]).replace(/[,\s]/g, ''));
    }

    return null;
}

function parseDate(text) {
    var dateMatch = text.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
    if (!dateMatch) {
        return null;
    }

    var value = dateMatch[1];
    if (/^\d{4}/.test(value)) {
        return value.replace(/\//g, '-');
    }

    var parts = value.split(/[\/-]/);
    var day = parts[0].padStart(2, '0');
    var month = parts[1].padStart(2, '0');
    var year = parts[2].length === 2 ? ('20' + parts[2]) : parts[2];
    return year + '-' + month + '-' + day;
}

function parseVendor(text) {
    var lines = text
        .split(/\r?\n/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean);

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/invoice|receipt|total|amount|tax|date/i.test(line)) {
            continue;
        }
        if (line.length >= 3 && /[A-Za-z]/.test(line)) {
            return line.slice(0, 60);
        }
    }
    return null;
}

function ensureTesseract() {
    if (window.Tesseract) {
        return Promise.resolve(window.Tesseract);
    }

    return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = function () { resolve(window.Tesseract); };
        script.onerror = function () { reject(new Error('Failed to load OCR engine')); };
        document.head.appendChild(script);
    });
}

function extractReceiptWithOCR(imageDataUrl) {
    var ocr = document.getElementById('ocr-result');
    if (!ocr) return;

    ocr.classList.remove('hidden');

    var amountEl = document.getElementById('ocr-amount');
    var vendorEl = document.getElementById('ocr-vendor');
    var dateEl = document.getElementById('ocr-date');
    var categoryEl = document.getElementById('ocr-category');
    if (amountEl) amountEl.textContent = 'Scanning...';
    if (vendorEl) vendorEl.textContent = 'Scanning...';
    if (dateEl) dateEl.textContent = 'Scanning...';
    if (categoryEl) categoryEl.textContent = 'Auto';

    ensureTesseract()
        .then(function (Tesseract) {
            return Tesseract.recognize(imageDataUrl, 'eng');
        })
        .then(function (result) {
            var text = (result.data && result.data.text) ? result.data.text : '';
            var amount = parseAmount(text);
            var vendor = parseVendor(text);
            var date = parseDate(text) || new Date().toISOString().slice(0, 10);

            var amountInput = document.getElementById('expense-amount');
            var vendorInput = document.getElementById('expense-vendor');
            var dateInput = document.getElementById('expense-date');

            if (amountEl) amountEl.textContent = amount ? amount.toFixed(2) : 'Not found';
            if (vendorEl) vendorEl.textContent = vendor || 'Not found';
            if (dateEl) dateEl.textContent = date;

            if (amountInput && amount) amountInput.value = amount;
            if (vendorInput && vendor) vendorInput.value = vendor;
            if (dateInput) dateInput.value = date;

            showToast('OCR scan completed', 'success');
        })
        .catch(function () {
            showToast('OCR failed. Fill fields manually.', 'error');
            if (amountEl) amountEl.textContent = 'Not found';
            if (vendorEl) vendorEl.textContent = 'Not found';
            if (dateEl) dateEl.textContent = new Date().toISOString().slice(0, 10);
        });
}

// ==========================================
// CURRENCY CONVERSION
// ==========================================

var exchangeRates = null;
var showOriginalCurrency = false;

function convertCurrency() {
    var currencySelect = document.getElementById('expense-currency');
    var amountInput = document.getElementById('expense-amount');
    var convDisplay = document.getElementById('conversion-display');
    var convText = document.getElementById('conversion-text');
    var convAmount = document.getElementById('conversion-amount');

    if (!currencySelect || !amountInput || !convDisplay) return;

    var currency = currencySelect.value;
    var amount = parseFloat(amountInput.value) || 0;

    if (currency === 'INR' || amount === 0) {
        convDisplay.classList.add('hidden');
        return;
    }

    convDisplay.classList.remove('hidden');
    if (convText) convText.textContent = 'Loading rate...';

    // Fetch exchange rate
    fetch('https://api.exchangerate-api.com/v4/latest/' + currency)
        .then(function (res) { return res.json(); })
        .then(function (data) {
            var rate = data.rates.INR || 83;
            var converted = (amount * rate).toFixed(0);
            if (convText) convText.textContent = currency + ' ' + amount + ' \u2192';
            if (convAmount) convAmount.textContent = '\u20B9' + parseInt(converted).toLocaleString('en-IN') + ' (Company Currency)';
        })
        .catch(function () {
            // Fallback rates
            var fallbackRates = { USD: 83, EUR: 90, GBP: 105 };
            var rate = fallbackRates[currency] || 83;
            var converted = (amount * rate).toFixed(0);
            if (convText) convText.textContent = currency + ' ' + amount + ' \u2192';
            if (convAmount) convAmount.textContent = '\u20B9' + parseInt(converted).toLocaleString('en-IN') + ' (Company Currency)';
        });
}

function toggleCurrencyView() {
    showOriginalCurrency = !showOriginalCurrency;
    var btn = document.getElementById('currency-toggle-btn');
    if (btn) {
        btn.textContent = showOriginalCurrency ? 'Original Currency' : 'Company Currency';
    }
    showToast('Showing ' + (showOriginalCurrency ? 'original' : 'company') + ' currency', 'info');
}

// ==========================================
// EXPENSE FILTERS
// ==========================================

function filterExpenses(status, btn) {
    var cards = document.querySelectorAll('.expense-card');
    cards.forEach(function (card) {
        if (status === 'all' || card.dataset.status === status) {
            card.style.display = '';
            card.style.opacity = '0';
            setTimeout(function () { card.style.opacity = '1'; }, 50);
        } else {
            card.style.display = 'none';
        }
    });

    // Update active button
    var buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(function (b) {
        b.className = 'filter-btn px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/5 transition-colors';
        b.style.color = 'var(--text-muted)';
    });
    if (btn) {
        btn.className = 'filter-btn px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-500/20 text-indigo-400';
        btn.style.color = '';
    }
}

function filterByCategory(category) {
    var cards = document.querySelectorAll('.expense-card');
    cards.forEach(function (card) {
        if (category === 'all' || card.dataset.category === category) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

// ==========================================
// SUBMIT EXPENSE
// ==========================================

function submitExpense() {
    var titleInput = document.getElementById('expense-vendor');
    var categoryInput = document.getElementById('expense-category');
    var dateInput = document.getElementById('expense-date');
    var amountInput = document.getElementById('expense-amount');
    var currencyInput = document.getElementById('expense-currency');
    var descriptionInput = document.getElementById('expense-desc');

    apiFetch('/expenses', {
        method: 'POST',
        body: {
            title: titleInput ? titleInput.value : 'Expense',
            description: descriptionInput ? descriptionInput.value : '',
            category: categoryInput ? categoryInput.value : 'other',
            expenseDate: dateInput ? dateInput.value : new Date().toISOString().slice(0, 10),
            originalAmount: amountInput ? Number(amountInput.value || 0) : 0,
            originalCurrency: currencyInput ? currencyInput.value : 'USD'
        }
    })
        .then(function () {
            showToast('Expense submitted successfully!', 'success');
            closeExpenseModal();
            loadEmployeeExpenses();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

// ==========================================
// MANAGER ACTIONS
// ==========================================

function approveExpense(id) {
    var expenseId = Number(String(id).replace(/[^0-9]/g, ''));
    if (!expenseId) {
        showToast('Invalid expense id', 'error');
        return;
    }

    apiFetch('/approvals/action', {
        method: 'POST',
        body: {
            expenseId: expenseId,
            action: 'approved'
        }
    })
        .then(function () {
            showToast('Expense approved', 'success');
            loadPendingApprovals();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function rejectExpense(id) {
    var expenseId = Number(String(id).replace(/[^0-9]/g, ''));
    if (!expenseId) {
        showToast('Invalid expense id', 'error');
        return;
    }

    var reason = window.prompt('Add rejection comment (optional):') || '';
    apiFetch('/approvals/action', {
        method: 'POST',
        body: {
            expenseId: expenseId,
            action: 'rejected',
            comment: reason
        }
    })
        .then(function () {
            showToast('Expense rejected', 'success');
            loadPendingApprovals();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function toggleComment(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
}

// ==========================================
// ADMIN TABS
// ==========================================

function switchAdminTab(tab) {
    var tabs = ['users', 'expenses', 'rules'];
    tabs.forEach(function (t) {
        var section = document.getElementById('section-' + t);
        var tabBtn = document.getElementById('admin-tab-' + t);
        if (section) section.classList.toggle('hidden', t !== tab);
        if (tabBtn) {
            if (t === tab) {
                tabBtn.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg';
            } else {
                tabBtn.className = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 hover:bg-white/5';
                tabBtn.style.color = 'var(--text-muted)';
            }
        }
    });
}

// ==========================================
// USER MODAL
// ==========================================

function openUserModal() {
    var modal = document.getElementById('user-modal');
    if (modal) modal.classList.add('active');
}

function closeUserModal() {
    var modal = document.getElementById('user-modal');
    if (modal) modal.classList.remove('active');
}

// ==========================================
// RULE BUILDER
// ==========================================

function addNewRule() {
    var name = window.prompt('Workflow name');
    if (!name) return;

    var approverId = window.prompt('Approver user ID for step 1 (manager/admin user id)');
    if (!approverId) {
        showToast('Approver user ID is required', 'error');
        return;
    }

    apiFetch('/workflows', {
        method: 'POST',
        body: {
            name: name,
            appliesToCategory: 'all',
            approvalMode: 'SEQUENTIAL',
            steps: [
                {
                    stepOrder: 1,
                    name: 'Manager Approval',
                    stepType: 'ANY_OF',
                    approverUserIds: [Number(approverId)]
                }
            ]
        }
    })
        .then(function () {
            showToast('Workflow created', 'success');
            loadWorkflows();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function statusBadgeClass(status) {
    if (status === 'approved') return 'badge badge-approved';
    if (status === 'rejected') return 'badge badge-rejected';
    return 'badge badge-pending';
}

function loadEmployeeExpenses() {
    var container = document.getElementById('expense-cards');
    if (!container) return;

    apiFetch('/expenses')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-6"><p style="color: var(--text-secondary);">No expenses yet.</p></div>';
                return;
            }

            container.innerHTML = rows.map(function (row) {
                return '<div class="glass-card p-5 expense-card" data-status="' + row.status + '" data-category="' + row.category + '">' +
                    '<div class="flex items-start justify-between mb-4">' +
                    '<div><p class="text-sm font-bold" style="color: var(--text-primary);">' + row.title + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + row.expense_date + '</p></div>' +
                    '<span class="' + statusBadgeClass(row.status) + '">' + row.status + '</span></div>' +
                    '<p class="text-xs mb-3" style="color: var(--text-secondary);">' + (row.description || '') + '</p>' +
                    '<div class="flex items-end justify-between"><div>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Converted Amount</p>' +
                    '<p class="text-xl font-bold text-indigo-400">' + Number(row.converted_amount).toFixed(2) + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + row.original_currency + ' ' + Number(row.original_amount).toFixed(2) + ' at rate ' + Number(row.exchange_rate).toFixed(4) + '</p>' +
                    '</div><div class="text-right"><p class="text-xs" style="color: var(--text-muted);">Category</p>' +
                    '<p class="text-sm font-medium" style="color: var(--text-secondary);">' + row.category + '</p></div></div></div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function loadPendingApprovals() {
    var container = document.getElementById('pending-approvals-list');
    if (!container) return;

    apiFetch('/approvals/pending')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-5"><p style="color: var(--text-secondary);">No pending approvals assigned.</p></div>';
                return;
            }

            container.innerHTML = rows.map(function (row) {
                return '<div class="glass-card p-6">' +
                    '<div class="flex flex-col lg:flex-row lg:items-center gap-5">' +
                    '<div class="flex-1"><p class="text-sm font-bold" style="color: var(--text-primary);">' + row.submitted_by_first_name + ' ' + row.submitted_by_last_name + '</p>' +
                    '<p class="text-xs" style="color: var(--text-secondary);">' + row.title + ' | ' + row.category + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Workflow: ' + row.workflowName + ' | Step ' + (row.currentStepOrder || '-') + '</p></div>' +
                    '<div class="flex items-center gap-3"><div class="text-right"><p class="text-lg font-bold text-indigo-400">' + Number(row.converted_amount).toFixed(2) + '</p></div>' +
                    '<button onclick="approveExpense(' + row.id + ')" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all border border-green-500/20">Approve</button>' +
                    '<button onclick="rejectExpense(' + row.id + ')" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/20">Reject</button></div>' +
                    '</div></div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function loadWorkflows() {
    var container = document.getElementById('workflow-list');
    if (!container) return;

    apiFetch('/workflows')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-4"><p style="color: var(--text-secondary);">No workflows configured yet.</p></div>';
                return;
            }

            container.innerHTML = rows.map(function (workflow) {
                var stepCount = workflow.steps ? workflow.steps.length : 0;
                return '<div class="glass-card p-4 mb-3">' +
                    '<div class="flex items-center justify-between"><div><p class="text-sm font-bold" style="color: var(--text-primary);">' + workflow.name + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Mode: ' + workflow.approval_mode + ' | Category: ' + workflow.applies_to_category + '</p></div>' +
                    '<span class="badge badge-info">' + stepCount + ' step(s)</span></div></div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function showToast(message, type) {
    // Remove existing toasts
    var existing = document.querySelectorAll('.toast-notification');
    existing.forEach(function (t) { t.remove(); });

    var toast = document.createElement('div');
    toast.className = 'toast-notification';

    var bgColor = 'rgba(99, 102, 241, 0.9)';
    var icon = '\u2139\uFE0F';
    if (type === 'success') { bgColor = 'rgba(34, 197, 94, 0.9)'; icon = '\u2705'; }
    if (type === 'error') { bgColor = 'rgba(239, 68, 68, 0.9)'; icon = '\u274C'; }

    toast.style.cssText = 'position:fixed;bottom:2rem;right:2rem;padding:0.875rem 1.25rem;border-radius:0.75rem;color:white;font-size:0.875rem;font-weight:500;z-index:9999;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.3);transform:translateY(20px);opacity:0;transition:all 0.3s ease;font-family:Inter,sans-serif;display:flex;align-items:center;gap:0.5rem;max-width:400px;background:' + bgColor;
    toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    });

    // Remove after 3s
    setTimeout(function () {
        toast.style.transform = 'translateY(20px)';
        toast.style.opacity = '0';
        setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
}

function loadFinanceApprovals() {
    var container = document.getElementById('finance-approvals-list');
    if (!container) return;

    apiFetch('/approvals/pending')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-5"><p style="color: var(--text-secondary);">No finance reviews pending.</p></div>';
                return;
            }

            container.innerHTML = rows.map(function (row) {
                return '<div class="glass-card p-5 mb-3">' +
                    '<div class="flex items-center justify-between gap-4">' +
                    '<div><p class="text-sm font-bold" style="color: var(--text-primary);">' + row.title + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + row.submitted_by_first_name + ' ' + row.submitted_by_last_name + ' | ' + row.category + '</p></div>' +
                    '<div class="text-right"><p class="text-lg font-bold text-indigo-400">' + Number(row.converted_amount).toFixed(2) + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Step ' + (row.currentStepOrder || '-') + '</p></div>' +
                    '</div>' +
                    '<div class="mt-4 flex gap-2">' +
                    '<button onclick="approveExpense(' + row.id + ')" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all border border-green-500/20">Approve</button>' +
                    '<button onclick="rejectExpense(' + row.id + ')" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/20">Reject</button>' +
                    '</div></div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function loadDirectorExpenses() {
    var container = document.getElementById('director-expenses-list');
    if (!container) return;

    apiFetch('/expenses')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-5"><p style="color: var(--text-secondary);">No expenses available.</p></div>';
                return;
            }

            container.innerHTML = rows.map(function (row) {
                return '<div class="glass-card p-5 mb-3">' +
                    '<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">' +
                    '<div><p class="text-sm font-bold" style="color: var(--text-primary);">' + row.title + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + row.submitted_by_first_name + ' ' + row.submitted_by_last_name + ' | ' + row.category + ' | ' + row.status + '</p></div>' +
                    '<div class="text-right"><p class="text-lg font-bold text-indigo-400">' + Number(row.converted_amount).toFixed(2) + '</p></div>' +
                    '</div>' +
                    '<div class="mt-4 flex gap-2">' +
                    '<button onclick="approveExpense(' + row.id + ')" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all border border-green-500/20">Override Approve</button>' +
                    '<button onclick="rejectExpense(' + row.id + ')" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/20">Override Reject</button>' +
                    '</div></div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}