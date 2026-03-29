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
var VALID_EXPENSE_CATEGORIES = ['travel', 'food', 'accommodation', 'transport', 'supplies', 'other'];

function normalizeValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
    return normalizeValue(value).toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidCompanyCode(value) {
    return /^[A-Z0-9]{2,20}$/.test(value);
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var date = new Date(value + 'T00:00:00');
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isFutureDate(value) {
    var selected = new Date(value + 'T00:00:00');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected.getTime() > today.getTime();
}

function ensureRoleAccess(page, role) {
    var roleByPage = {
        'admin.html': 'admin',
        'manager.html': 'manager',
        'employee.html': 'employee'
    };

    if (!roleByPage[page]) return true;
    return role === roleByPage[page] || role === 'admin';
}

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
}

function redirectByRole(role) {
    if (role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }
    if (role === 'manager') {
        window.location.href = 'manager.html';
        return;
    }
    window.location.href = 'employee.html';
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
    }).catch(function () {
        throw new Error('Unable to reach the server. Please check your connection and try again.');
    }).then(function (res) {
        var contentType = res.headers.get('content-type') || '';
        var parser = contentType.indexOf('application/json') !== -1
            ? res.json().catch(function () { return {}; })
            : Promise.resolve({});

        return parser.then(function (data) {
            if (!res.ok) {
                var message = data.message || 'Request failed';
                if (res.status === 401) {
                    clearSession();
                }
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

        if (!ensureRoleAccess(page, user.role)) {
            showToast('You do not have access to that page', 'error');
            setTimeout(function () {
                redirectByRole(user.role);
            }, 500);
            return;
        }
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
    if (email && password) {
        var normalizedEmail = normalizeEmail(email.value);
        var rawPassword = password.value || '';
        var companyCode = normalizeValue(localStorage.getItem('expenseai-company-code') || window.prompt('Enter your company code'));

        if (!normalizedEmail || !rawPassword) {
            showToast('Please enter both email and password', 'error');
            return;
        }

        if (!isValidEmail(normalizedEmail)) {
            showToast('Please enter a valid email address', 'error');
            return;
        }

        if (!companyCode) {
            showToast('Company code is required', 'error');
            return;
        }

        companyCode = companyCode.toUpperCase();
        if (!isValidCompanyCode(companyCode)) {
            showToast('Company code must use only letters and numbers', 'error');
            return;
        }

        showToast('Signing in...', 'info');
        apiFetch('/auth/login', {
            method: 'POST',
            body: {
                companyCode: companyCode,
                email: normalizedEmail,
                password: rawPassword
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
    if (company && country && email && password) {
        var companyName = normalizeValue(company.value);
        var countryName = normalizeValue(country.value);
        var normalizedEmail = normalizeEmail(email.value);
        var rawPassword = password.value || '';

        if (!companyName || !countryName || !normalizedEmail || !rawPassword) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        if (companyName.length < 2) {
            showToast('Company name should be at least 2 characters', 'error');
            return;
        }

        if (!isValidEmail(normalizedEmail)) {
            showToast('Please enter a valid work email address', 'error');
            return;
        }

        if (rawPassword.length < 8) {
            showToast('Password must be at least 8 characters long', 'error');
            return;
        }

        var nameParts = normalizedEmail.split('@')[0].split(/[._-]/);
        var firstName = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'User';
        var lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : 'Admin';
        var companyCode = companyName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'COMPANY1';
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
                companyName: companyName,
                baseCurrency: detectedCurrency,
                countryCode: countryName.slice(0, 2).toUpperCase(),
                firstName: firstName,
                lastName: lastName,
                email: normalizedEmail,
                password: rawPassword,
                role: 'admin'
            }
        })
            .then(function (data) {
                saveSession(data);
                localStorage.setItem('expenseai-company', companyName);
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
        if (placeholder) placeholder.classList.add('hidden');
        if (preview) preview.classList.remove('hidden');
        if (img) img.src = e.target.result;

        // Simulate OCR
        simulateOCR();
    };
    reader.readAsDataURL(file);
}

function simulateOCR() {
    var ocr = document.getElementById('ocr-result');
    if (!ocr) return;

    ocr.classList.remove('hidden');

    // Simulate scanning delay
    setTimeout(function () {
        var vendors = ['Starbucks', 'Uber', 'Marriott Hotel', 'Delta Airlines', 'Amazon', 'Restaurant XYZ'];
        var categories = ['Food', 'Transportation', 'Accommodation', 'Travel', 'Supplies', 'Food'];
        var amounts = [560, 1200, 8500, 15000, 3200, 780];
        var idx = Math.floor(Math.random() * vendors.length);

        var amountEl = document.getElementById('ocr-amount');
        var vendorEl = document.getElementById('ocr-vendor');
        var dateEl = document.getElementById('ocr-date');
        var categoryEl = document.getElementById('ocr-category');

        if (amountEl) amountEl.textContent = '\u20B9' + amounts[idx].toLocaleString('en-IN');
        if (vendorEl) vendorEl.textContent = vendors[idx];
        if (dateEl) dateEl.textContent = '2026-03-27';
        if (categoryEl) categoryEl.textContent = categories[idx];

        // Auto-fill form
        var amountInput = document.getElementById('expense-amount');
        var vendorInput = document.getElementById('expense-vendor');
        var dateInput = document.getElementById('expense-date');
        if (amountInput) amountInput.value = amounts[idx];
        if (vendorInput) vendorInput.value = vendors[idx];
        if (dateInput) dateInput.value = '2026-03-27';

        showToast('AI detected: \u20B9' + amounts[idx].toLocaleString('en-IN') + ' at ' + vendors[idx], 'success');
    }, 1500);
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

    var title = normalizeValue(titleInput ? titleInput.value : '');
    var category = normalizeValue(categoryInput ? categoryInput.value : '').toLowerCase();
    var expenseDate = normalizeValue(dateInput ? dateInput.value : '');
    var amount = Number(amountInput ? amountInput.value : 0);
    var currency = normalizeValue(currencyInput ? currencyInput.value : '').toUpperCase();
    var description = normalizeValue(descriptionInput ? descriptionInput.value : '');

    if (!title) {
        showToast('Please enter a vendor or expense title', 'error');
        return;
    }

    if (title.length > 150) {
        showToast('Expense title is too long', 'error');
        return;
    }

    if (VALID_EXPENSE_CATEGORIES.indexOf(category) === -1) {
        showToast('Please choose a valid expense category', 'error');
        return;
    }

    if (!isValidDate(expenseDate)) {
        showToast('Please choose a valid expense date', 'error');
        return;
    }

    if (isFutureDate(expenseDate)) {
        showToast('Expense date cannot be in the future', 'error');
        return;
    }

    if (!isFinite(amount) || amount <= 0) {
        showToast('Expense amount must be greater than 0', 'error');
        return;
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
        showToast('Please choose a valid currency', 'error');
        return;
    }

    apiFetch('/expenses', {
        method: 'POST',
        body: {
            title: title,
            description: description,
            category: category,
            expenseDate: expenseDate,
            originalAmount: amount,
            originalCurrency: currency
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
    if (!id || !isFinite(Number(id))) {
        showToast('Invalid expense selected for approval', 'error');
        return;
    }

    apiFetch('/approvals/action', {
        method: 'POST',
        body: {
            expenseId: Number(id),
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
    if (!id || !isFinite(Number(id))) {
        showToast('Invalid expense selected for rejection', 'error');
        return;
    }

    var reason = window.prompt('Add rejection comment (optional):') || '';
    if (normalizeValue(reason).length > 500) {
        showToast('Rejection comment must be 500 characters or less', 'error');
        return;
    }

    apiFetch('/approvals/action', {
        method: 'POST',
        body: {
            expenseId: Number(id),
            action: 'rejected',
            comment: normalizeValue(reason)
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
    name = normalizeValue(name);
    if (!name) return;

    if (name.length > 120) {
        showToast('Workflow name is too long', 'error');
        return;
    }

    var approverId = window.prompt('Approver user ID for step 1 (manager/admin user id)');
    if (!approverId) {
        showToast('Approver user ID is required', 'error');
        return;
    }

    approverId = Number(approverId);
    if (!isFinite(approverId) || approverId <= 0 || Math.floor(approverId) !== approverId) {
        showToast('Approver user ID must be a positive whole number', 'error');
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
                    approverUserIds: [approverId]
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
