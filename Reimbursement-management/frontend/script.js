// ==========================================
// ExpenseAI - Main JavaScript
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    loadCountries();
    initPasswordStrength();
    initSession();
    if (handleOAuthCallback()) {
        return;
    }
    bootstrapPage();
});

var API_BASE = localStorage.getItem('expenseai-api-base') || 'http://localhost:5000/api';
var VALID_EXPENSE_CATEGORIES = ['travel', 'food', 'accommodation', 'transport', 'supplies', 'other'];
var CURRENCY_SYMBOLS = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    AUD: 'A$',
    CAD: 'C$'
};

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

function getCurrencySymbol(currencyCode) {
    var code = normalizeValue(currencyCode).toUpperCase();
    if (!code) return '';
    return CURRENCY_SYMBOLS[code] || (code + ' ');
}

function getCompanyCurrencyCode() {
    var user = getCurrentUser();
    var userCurrency = normalizeValue(user && user.baseCurrency).toUpperCase();
    if (/^[A-Z]{3}$/.test(userCurrency)) {
        return userCurrency;
    }

    var stored = normalizeValue(localStorage.getItem('expenseai-company-currency')).toUpperCase();
    if (/^[A-Z]{3}$/.test(stored)) {
        return stored;
    }

    var dashCurrency = document.getElementById('dash-currency');
    if (dashCurrency && dashCurrency.textContent) {
        var dashCode = normalizeValue(dashCurrency.textContent.split(' ')[0]).toUpperCase();
        if (/^[A-Z]{3}$/.test(dashCode)) {
            return dashCode;
        }
    }

    var detectedCurrency = document.getElementById('detected-currency');
    if (detectedCurrency && detectedCurrency.textContent) {
        var detectedCode = normalizeValue(detectedCurrency.textContent.split(' ')[0]).toUpperCase();
        if (/^[A-Z]{3}$/.test(detectedCode)) {
            return detectedCode;
        }
    }

    return 'INR';
}

function formatCurrencyAmount(amount, currencyCode, decimals) {
    var n = Number(amount);
    var places = typeof decimals === 'number' ? decimals : 2;
    if (!isFinite(n)) {
        n = 0;
    }

    var symbol = getCurrencySymbol(currencyCode);
    var formatted = n.toLocaleString('en-IN', {
        minimumFractionDigits: places,
        maximumFractionDigits: places
    });

    return symbol + formatted;
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);

    var utcDate = new Date(Date.UTC(year, month - 1, day));
    return utcDate.getUTCFullYear() === year &&
        utcDate.getUTCMonth() === (month - 1) &&
        utcDate.getUTCDate() === day;
}

function normalizeExpenseDate(value) {
    var raw = normalizeValue(value);
    if (!raw) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }

    var ymdMatch = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (ymdMatch) {
        var y = ymdMatch[1];
        var m = ymdMatch[2].padStart(2, '0');
        var d = ymdMatch[3].padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    var dmyMatch = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if (dmyMatch) {
        var day = dmyMatch[1].padStart(2, '0');
        var month = dmyMatch[2].padStart(2, '0');
        var year = dmyMatch[3].length === 2 ? ('20' + dmyMatch[3]) : dmyMatch[3];
        return year + '-' + month + '-' + day;
    }

    return raw;
}

function isFutureDate(value) {
    var parts = value.split('-');
    var selectedUtc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

    var now = new Date();
    var todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return selectedUtc > todayUtc;
}

function ensureRoleAccess(page, role) {
    return isPageAllowedForRole(page, role);
}

var ROLE_HOME = {
    admin: 'admin.html',
    manager: 'manager.html',
    employee: 'employee.html',
    finance: 'finance.html',
    director: 'director.html'
};

var ROLE_ALLOWED_PAGES = {
    admin: ['admin.html', 'dashboard.html'],
    manager: ['manager.html', 'employee.html', 'dashboard.html'],
    employee: ['employee.html', 'dashboard.html'],
    finance: ['finance.html', 'dashboard.html'],
    director: ['director.html', 'dashboard.html']
};

var KNOWN_PAGES = ['index.html', 'dashboard.html', 'employee.html', 'manager.html', 'finance.html', 'director.html', 'admin.html'];
var approvalRefreshTimer = null;
var dashboardRefreshTimer = null;

function getCurrentPage(defaultPage) {
    var pathname = String(window.location.pathname || '');
    pathname = pathname.replace(/\/+$/, '');

    var parts = pathname.split('/').filter(Boolean);
    var last = parts.length ? String(parts[parts.length - 1]).toLowerCase() : '';

    if (!last || KNOWN_PAGES.indexOf(last) === -1) {
        return defaultPage;
    }

    return last;
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
    if (payload.user && payload.user.baseCurrency) {
        localStorage.setItem('expenseai-company-currency', String(payload.user.baseCurrency).toUpperCase());
    }
}

function clearSession() {
    localStorage.removeItem('expenseai-token');
    localStorage.removeItem('expenseai-user');
    localStorage.removeItem('expenseai-company-code');
    localStorage.removeItem('expenseai-company-currency');
}

function redirectByRole(role) {
    var destination = ROLE_HOME[String(role || '').toLowerCase()] || 'employee.html';
    var currentPage = getCurrentPage('index.html');
    if (currentPage === destination) {
        return;
    }

    var now = Date.now();
    var lastRedirectTs = Number(sessionStorage.getItem('expenseai-last-redirect-ts') || '0');
    var lastRedirectDest = sessionStorage.getItem('expenseai-last-redirect-dest') || '';
    if (lastRedirectDest === destination && (now - lastRedirectTs) < 1200) {
        return;
    }

    sessionStorage.setItem('expenseai-last-redirect-ts', String(now));
    sessionStorage.setItem('expenseai-last-redirect-dest', destination);
    window.location.assign(destination);
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
            link.style.display = 'none';
        } else {
            link.classList.remove('hidden');
            link.style.display = '';
        }
    });
}

function getRolePanelLabel(role) {
    var normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole === 'manager') return 'Manager Panel';
    if (normalizedRole === 'employee') return 'Employee Panel';
    if (normalizedRole === 'finance') return 'Finance Panel';
    if (normalizedRole === 'director') return 'Director Panel';
    if (normalizedRole === 'admin') return 'Admin Panel';
    return 'User Panel';
}

function applyPanelIdentityBadge(role) {
    var topbar = document.querySelector('.topbar');
    if (!topbar) return;

    var leftSection = topbar.firstElementChild;
    if (!leftSection) return;

    var label = getRolePanelLabel(role);
    var badge = document.getElementById('current-panel-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'current-panel-badge';
        badge.className = 'inline-flex items-center px-2.5 py-1 mt-2 rounded-lg text-xs font-semibold bg-indigo-500/15 border border-indigo-500/25 text-indigo-400';

        var heading = leftSection.querySelector('h1');
        if (heading) {
            heading.insertAdjacentElement('afterend', badge);
        } else {
            leftSection.prepend(badge);
        }
    }

    badge.textContent = label;
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

function handleOAuthCallback() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('token');
    var userRaw = params.get('user');
    var oauthError = params.get('oauthError');

    if (oauthError) {
        var cleanErrorUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanErrorUrl);
        showToast('Google login failed. Please try again.', 'error');
        return false;
    }

    if (!token || !userRaw) {
        return false;
    }

    try {
        var user = JSON.parse(userRaw);
        saveSession({ token: token, user: user });
        var cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        showToast('Signed in with Google', 'success');
        setTimeout(function () {
            redirectByRole(user.role);
        }, 250);
        return true;
    } catch (_error) {
        showToast('Google login response was invalid', 'error');
        return false;
    }
}

function startGoogleLogin() {
    var companyCodeInput = document.getElementById('login-company-code');
    var companyCode = normalizeValue(companyCodeInput ? companyCodeInput.value : '').toUpperCase();
    var url = 'http://localhost:5000/api/auth/google';

    if (companyCode) {
        if (!isValidCompanyCode(companyCode)) {
            showToast('Company code must use only letters and numbers', 'error');
            return;
        }

        url += '?companyCode=' + encodeURIComponent(companyCode);
    }

    window.location.href = url;
}

function bootstrapPage() {
    var page = getCurrentPage('index.html');
    var user = getCurrentUser();

    if (page === 'index.html' && getAuthToken() && user && user.role) {
        redirectByRole(user.role);
        return;
    }

    if (page !== 'index.html') {
        if (!getAuthToken() || !user) {
            window.location.href = 'index.html';
            return;
        }

        if (!ensureRoleAccess(page, user.role)) {
            redirectByRole(user.role);
            return;
        }

        applyRoleNavigationVisibility(user.role);
        applyPanelIdentityBadge(user.role);
    }

    if (page === 'employee.html') {
        loadEmployeeExpenses();
    }
    if (page === 'manager.html') {
        loadPendingApprovals();
        initApprovalWorkspace();
    }
    if (page === 'admin.html') {
        loadAdminUsers();
        loadWorkflows();
    }
    if (page === 'finance.html') {
        loadFinanceApprovals();
        initApprovalWorkspace();
    }
    if (page === 'director.html') {
        loadDirectorExpenses();
        initApprovalWorkspace();
    }
    if (page === 'dashboard.html') {
        loadDashboardAnalytics();
        if (!dashboardRefreshTimer) {
            dashboardRefreshTimer = setInterval(loadDashboardAnalytics, 30000);
        }
    }
}

function refreshApprovalsForCurrentPage() {
    var page = getCurrentPage('dashboard.html');
    if (page === 'manager.html') {
        loadPendingApprovals();
        return;
    }
    if (page === 'finance.html') {
        loadFinanceApprovals();
        return;
    }
    if (page === 'director.html') {
        loadDirectorExpenses();
    }
}

function renderNotificationPanel(rows) {
    var panel = document.getElementById('approval-notification-panel');
    if (!panel) return;

    var total = Array.isArray(rows) ? rows.length : 0;
    var header = '<div class="notification-panel-header">' +
        '<p class="text-xs font-semibold" style="color: var(--text-primary);">Approval Notifications</p>' +
        '<span class="badge badge-info text-xs">' + total + '</span>' +
        '</div>';

    if (!rows || !rows.length) {
        panel.innerHTML = header + '<div class="notification-panel-body"><div class="notification-empty">No new approval notifications.</div></div>';
        return;
    }

    var items = rows.slice(0, 6).map(function (row) {
        var submittedBy = ((row.submitted_by_first_name || '') + ' ' + (row.submitted_by_last_name || '')).trim() || 'Employee';
        var title = row.title || 'Expense';
        var amount = formatCurrencyAmount(row.converted_amount || 0, getCompanyCurrencyCode(), 0);
        var submittedAt = row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A';
        return '<div class="notification-item">' +
            '<div class="flex items-start justify-between gap-2">' +
            '<p class="text-xs font-semibold" style="color: var(--text-primary);">' + submittedBy + '</p>' +
            '<span class="badge badge-pending text-xs">Step ' + (row.currentStepOrder || '-') + '</span>' +
            '</div>' +
            '<p class="text-xs mt-1" style="color: var(--text-secondary);">' + title + '</p>' +
            '<div class="flex items-center justify-between mt-2">' +
            '<p class="text-xs font-semibold text-indigo-400">' + amount + '</p>' +
            '<p class="text-xs" style="color: var(--text-muted);">' + submittedAt + '</p>' +
            '</div>' +
            '</div>';
    }).join('');

    panel.innerHTML = header + '<div class="notification-panel-body">' + items + '</div>';
}

function toggleApprovalNotifications(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    var panel = document.getElementById('approval-notification-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
}

function loadApprovalNotifications() {
    var countNode = document.getElementById('approval-notification-count');
    var dotNode = document.getElementById('approval-notification-dot');

    if (!countNode && !dotNode) {
        return;
    }

    apiFetch('/approvals/pending')
        .then(function (rows) {
            var count = Array.isArray(rows) ? rows.length : 0;

            if (countNode) {
                countNode.textContent = String(count);
                countNode.classList.toggle('hidden', count === 0);
            }

            if (dotNode) {
                dotNode.classList.toggle('hidden', count === 0);
            }

            renderNotificationPanel(rows || []);
        })
        .catch(function () {
            if (countNode) {
                countNode.textContent = '0';
                countNode.classList.add('hidden');
            }
            if (dotNode) {
                dotNode.classList.add('hidden');
            }
            renderNotificationPanel([]);
        });
}

function initApprovalWorkspace() {
    loadApprovalNotifications();

    if (approvalRefreshTimer) {
        window.clearInterval(approvalRefreshTimer);
    }

    approvalRefreshTimer = window.setInterval(function () {
        loadApprovalNotifications();
        refreshApprovalsForCurrentPage();
    }, 20000);
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
    if (email && password) {
        var normalizedEmail = normalizeEmail(email.value);
        var rawPassword = password.value || '';
        var companyCode = normalizeValue((companyCodeInput ? companyCodeInput.value : '') || localStorage.getItem('expenseai-company-code'));

        if (!normalizedEmail || !rawPassword) {
            showToast('Please enter both email and password', 'error');
            return;
        }

        if (!isValidEmail(normalizedEmail)) {
            showToast('Please enter a valid email address', 'error');
            return;
        }

        if (companyCode) {
            companyCode = companyCode.toUpperCase();
            if (!isValidCompanyCode(companyCode)) {
                showToast('Company code must use only letters and numbers', 'error');
                return;
            }
        }

        showToast('Signing in...', 'info');
        apiFetch('/auth/login', {
            method: 'POST',
            body: {
                companyCode: companyCode || undefined,
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
                if (!data.user || !data.user.baseCurrency) {
                    localStorage.setItem('expenseai-company-currency', detectedCurrency);
                }
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
    currentReceiptUpload = null;
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
        currentReceiptUpload = {
            dataUrl: e.target.result,
            fileName: file.name || 'bill-image'
        };

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

    return normalizeExpenseDate(dateMatch[1]);
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
var currentReceiptUpload = null;

function convertCurrency() {
    var convDisplay = document.getElementById('conversion-display');
    if (!convDisplay) return;
    convDisplay.classList.add('hidden');
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

function submitExpense(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    var titleInput = document.getElementById('expense-vendor');
    var categoryInput = document.getElementById('expense-category');
    var dateInput = document.getElementById('expense-date');
    var amountInput = document.getElementById('expense-amount');
    var currencyInput = document.getElementById('expense-currency');
    var descriptionInput = document.getElementById('expense-desc');

    var title = normalizeValue(titleInput ? titleInput.value : '');
    var category = normalizeValue(categoryInput ? categoryInput.value : '').toLowerCase();
    var expenseDate = normalizeExpenseDate(dateInput ? dateInput.value : '');

    if (dateInput && expenseDate && dateInput.value !== expenseDate) {
        dateInput.value = expenseDate;
    }
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
            originalCurrency: currency,
            receiptDataUrl: currentReceiptUpload && currentReceiptUpload.dataUrl ? currentReceiptUpload.dataUrl : null,
            receiptFileName: currentReceiptUpload && currentReceiptUpload.fileName ? currentReceiptUpload.fileName : null
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

function approveExpense(id, event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

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
            refreshApprovalsForCurrentPage();
            loadApprovalNotifications();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function rejectExpense(id, event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

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
            refreshApprovalsForCurrentPage();
            loadApprovalNotifications();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function toggleComment(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
}

function viewExpenseBill(expenseId, event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }

    if (!expenseId || !isFinite(Number(expenseId))) {
        showToast('Invalid expense selected', 'error');
        return;
    }

    apiFetch('/expenses/' + Number(expenseId))
        .then(function (detail) {
            var receiptDataUrl = detail && detail.receipt_data_url ? detail.receipt_data_url : '';
            if (!receiptDataUrl) {
                showToast('No bill attachment available for this expense', 'info');
                return;
            }

            try {
                var blob = dataUrlToBlob(receiptDataUrl);
                var objectUrl = URL.createObjectURL(blob);
                var newTab = window.open(objectUrl, '_blank', 'noopener,noreferrer');
                if (!newTab) {
                    showToast('Pop-up blocked. Please allow pop-ups for this site.', 'error');
                    URL.revokeObjectURL(objectUrl);
                    return;
                }

                // Give the new tab time to load the object URL before cleanup.
                setTimeout(function () {
                    URL.revokeObjectURL(objectUrl);
                }, 60 * 1000);
            } catch (_error) {
                // Fallback to direct data URL if blob conversion fails.
                window.open(receiptDataUrl, '_blank', 'noopener,noreferrer');
            }
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    if (parts.length < 2) {
        throw new Error('Invalid data URL');
    }

    var meta = parts[0];
    var base64 = parts.slice(1).join(',');
    var mimeMatch = meta.match(/^data:([^;]+);base64$/i);
    if (!mimeMatch) {
        throw new Error('Unsupported data URL format');
    }

    var mimeType = mimeMatch[1] || 'application/octet-stream';
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
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

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toRoleBadge(role) {
    var normalized = String(role || '').toLowerCase();
    if (normalized === 'manager') return 'badge badge-approved';
    if (normalized === 'finance') return 'badge badge-pending';
    if (normalized === 'director') return 'badge badge-rejected';
    if (normalized === 'admin') return 'badge badge-info';
    return 'badge badge-info';
}

function initialsOf(firstName, lastName) {
    var a = (firstName || '').trim();
    var b = (lastName || '').trim();
    var out = '';
    if (a) out += a.charAt(0).toUpperCase();
    if (b) out += b.charAt(0).toUpperCase();
    return out || 'U';
}

function loadAdminUsers() {
    var container = document.getElementById('users-grid');
    if (!container) return;

    apiFetch('/users')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-6"><p style="color: var(--text-secondary);">No users found.</p></div>';
                return;
            }

            var byId = {};
            rows.forEach(function (u) {
                byId[u.id] = u;
            });

            var managerSelect = document.getElementById('new-user-manager');
            if (managerSelect) {
                var managerOptions = rows
                    .filter(function (u) {
                        return ['manager', 'director', 'admin'].indexOf(String(u.role || '').toLowerCase()) !== -1;
                    })
                    .map(function (u) {
                        var fullName = (u.firstName || '') + ' ' + (u.lastName || '');
                        return '<option value="' + u.id + '">' + escapeHtml(fullName.trim()) + '</option>';
                    })
                    .join('');
                managerSelect.innerHTML = '<option value="">Select Manager</option>' + managerOptions;
            }

            container.innerHTML = rows.map(function (u) {
                var fullName = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || 'Unnamed User';
                var manager = u.managerUserId ? byId[u.managerUserId] : null;
                var reportsTo = manager ? ((manager.firstName || '') + ' ' + (manager.lastName || '')).trim() : 'Not Assigned';
                return '<div class="glass-card p-5">' +
                    '<div class="flex items-start justify-between mb-4">' +
                    '<div class="flex items-center gap-3">' +
                    '<div class="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold">' + initialsOf(u.firstName, u.lastName) + '</div>' +
                    '<div><p class="text-sm font-bold" style="color: var(--text-primary);">' + escapeHtml(fullName) + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + escapeHtml(u.email || '') + '</p></div>' +
                    '</div>' +
                    '<span class="' + toRoleBadge(u.role) + '">' + escapeHtml(String(u.role || '').charAt(0).toUpperCase() + String(u.role || '').slice(1)) + '</span>' +
                    '</div>' +
                    '<div class="space-y-2 mb-4">' +
                    '<div class="flex justify-between text-sm"><span style="color: var(--text-muted);">Reports to:</span><span style="color: var(--text-primary);" class="font-medium">' + escapeHtml(reportsTo) + '</span></div>' +
                    '<div class="flex justify-between text-sm"><span style="color: var(--text-muted);">Status:</span><span style="color: var(--text-primary);" class="font-medium">' + (u.isActive ? 'Active' : 'Inactive') + '</span></div>' +
                    '</div>' +
                    '</div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function createUserFromModal() {
    var nameInput = document.getElementById('new-user-name');
    var emailInput = document.getElementById('new-user-email');
    var passwordInput = document.getElementById('new-user-password');
    var roleInput = document.getElementById('new-user-role');
    var managerInput = document.getElementById('new-user-manager');

    var fullName = normalizeValue(nameInput ? nameInput.value : '');
    var email = normalizeEmail(emailInput ? emailInput.value : '');
    var password = normalizeValue(passwordInput ? passwordInput.value : '');
    var role = normalizeValue(roleInput ? roleInput.value : '').toLowerCase();
    var managerUserId = managerInput && managerInput.value ? Number(managerInput.value) : null;

    if (!fullName || !email || !password || !role) {
        showToast('Please fill in name, email, password, and role', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters long', 'error');
        return;
    }

    var parts = fullName.split(/\s+/).filter(Boolean);
    var firstName = parts[0] || 'User';
    var lastName = parts.slice(1).join(' ') || 'Member';

    apiFetch('/users', {
        method: 'POST',
        body: {
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: password,
            role: role,
            managerUserId: managerUserId
        }
    })
        .then(function () {
            showToast('User created successfully', 'success');
            closeUserModal();
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (roleInput) roleInput.value = 'employee';
            if (managerInput) managerInput.value = '';
            loadAdminUsers();
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
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
                var convertedAmount = formatCurrencyAmount(row.converted_amount, getCompanyCurrencyCode(), 2);
                return '<div class="glass-card p-5 expense-card" data-status="' + row.status + '" data-category="' + row.category + '">' +
                    '<div class="flex items-start justify-between mb-4">' +
                    '<div><p class="text-sm font-bold" style="color: var(--text-primary);">' + row.title + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + row.expense_date + '</p></div>' +
                    '<span class="' + statusBadgeClass(row.status) + '">' + row.status + '</span></div>' +
                    '<p class="text-xs mb-3" style="color: var(--text-secondary);">' + (row.description || '') + '</p>' +
                    '<div class="flex items-end justify-between"><div>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Amount</p>' +
                    '<p class="text-xl font-bold text-indigo-400">' + convertedAmount + '</p>' +
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
                var submittedAt = row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A';
                var convertedAmount = formatCurrencyAmount(row.converted_amount, getCompanyCurrencyCode(), 2);
                var receiptLabel = row.has_receipt ? ('Bill attached: ' + escapeHtml(row.receipt_file_name || 'Receipt image')) : 'No bill attached';
                return '<div class="glass-card p-6">' +
                    '<div class="flex flex-col lg:flex-row lg:items-center gap-5">' +
                    '<div class="flex-1"><p class="text-sm font-bold" style="color: var(--text-primary);">' + row.submitted_by_first_name + ' ' + row.submitted_by_last_name + '</p>' +
                    '<p class="text-xs" style="color: var(--text-secondary);">' + row.title + ' | ' + row.category + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Workflow: ' + row.workflowName + ' | Step ' + (row.currentStepOrder || '-') + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Submitted: ' + submittedAt + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + receiptLabel + '</p></div>' +
                        '<div class="flex items-center gap-3"><div class="text-right"><p class="text-lg font-bold text-indigo-400">' + convertedAmount + '</p></div>' +
                    (row.has_receipt ? '<button type="button" onclick="viewExpenseBill(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-all border border-blue-500/20">View Bill</button>' : '') +
                    '<button type="button" onclick="approveExpense(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all border border-green-500/20">Approve</button>' +
                    '<button type="button" onclick="rejectExpense(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/20">Reject</button></div>' +
                    '</div></div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });

    loadManagerTimeline();
}

function loadManagerTimeline() {
    var container = document.getElementById('approval-timeline-list');
    if (!container) return;

    apiFetch('/expenses')
        .then(function (rows) {
            var recent = rows.slice(0, 6);
            if (!recent.length) {
                container.innerHTML = '<p class="text-sm" style="color: var(--text-secondary);">No timeline events yet.</p>';
                return;
            }

            return Promise.all(recent.map(function (row) {
                return apiFetch('/expenses/' + row.id);
            })).then(function (details) {
                var events = [];

                details.forEach(function (detail) {
                    events.push({
                        ts: detail.submitted_at,
                        text: detail.title + ' submitted',
                        amount: Number(detail.converted_amount || 0),
                        type: 'submitted'
                    });

                    var approvals = detail.approvalSummary && detail.approvalSummary.approvals
                        ? detail.approvalSummary.approvals
                        : [];
                    approvals.forEach(function (a) {
                        var name = ((a.approver_first_name || '') + ' ' + (a.approver_last_name || '')).trim() || 'Approver';
                        events.push({
                            ts: a.acted_at,
                            text: name + ' ' + String(a.action || '').toLowerCase() + ' ' + detail.title,
                            amount: Number(detail.converted_amount || 0),
                            type: String(a.action || '').toLowerCase()
                        });
                    });
                });

                events = events
                    .filter(function (e) { return e.ts; })
                    .sort(function (a, b) { return new Date(b.ts).getTime() - new Date(a.ts).getTime(); })
                    .slice(0, 8);

                container.innerHTML = '<div class="space-y-0">' + events.map(function (event) {
                    var amountText = formatCurrencyAmount(event.amount || 0, getCompanyCurrencyCode(), 0);
                    var textClass = event.type === 'approved' ? 'text-green-400' : (event.type === 'rejected' ? 'text-red-400' : '');
                    return '<div class="timeline-item">' +
                        '<div class="timeline-dot completed"></div>' +
                        '<div class="flex items-center gap-2 mb-1">' +
                        '<p class="text-sm font-medium ' + textClass + '" style="color: var(--text-primary);">' + event.text + '</p>' +
                        '<span class="badge badge-info text-xs">' + amountText + '</span>' +
                        '</div>' +
                        '<p class="text-xs" style="color: var(--text-muted);">' + new Date(event.ts).toLocaleString() + '</p>' +
                        '</div>';
                }).join('') + '</div>';
            });
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function renderApprovalDates(approvals) {
    if (!approvals || !approvals.length) {
        return '<p class="text-xs" style="color: var(--text-muted);">No approval actions recorded yet.</p>';
    }

    var ordered = approvals.slice().sort(function (a, b) {
        return new Date(a.acted_at).getTime() - new Date(b.acted_at).getTime();
    });

    return ordered.map(function (item) {
        var role = String(item.approver_role || '').toLowerCase();
        var name = ((item.approver_first_name || '') + ' ' + (item.approver_last_name || '')).trim() || 'Approver';
        var actedAt = item.acted_at ? new Date(item.acted_at).toLocaleString() : 'N/A';
        return '<p class="text-xs" style="color: var(--text-muted);">' +
            role.charAt(0).toUpperCase() + role.slice(1) +
            ' (' + name + '): ' + String(item.action || '').toUpperCase() + ' on ' + actedAt +
            '</p>';
    }).join('');
}

function loadFinanceApprovals() {
    var container = document.getElementById('finance-approvals-list');
    if (!container) return;

    apiFetch('/approvals/pending')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-5"><p style="color: var(--text-secondary);">No manager-approved items waiting for finance.</p></div>';
                return;
            }

            container.innerHTML = rows.map(function (row) {
                var convertedAmount = formatCurrencyAmount(row.converted_amount, getCompanyCurrencyCode(), 2);
                var receiptLabel = row.has_receipt ? ('Bill attached: ' + escapeHtml(row.receipt_file_name || 'Receipt image')) : 'No bill attached';
                return '<div class="glass-card p-6">' +
                    '<div class="flex flex-col lg:flex-row lg:items-center gap-4">' +
                    '<div class="flex-1">' +
                    '<p class="text-sm font-bold" style="color: var(--text-primary);">' + row.submitted_by_first_name + ' ' + row.submitted_by_last_name + '</p>' +
                    '<p class="text-xs" style="color: var(--text-secondary);">' + row.title + ' | ' + row.category + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Submitted: ' + (row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A') + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">Current Step: ' + (row.currentStepOrder || '-') + '</p>' +
                    '<p class="text-xs" style="color: var(--text-muted);">' + receiptLabel + '</p>' +
                    '</div>' +
                    '<div class="flex items-center gap-2">' +
                    '<p class="text-lg font-bold text-indigo-400">' + convertedAmount + '</p>' +
                    (row.has_receipt ? '<button type="button" onclick="viewExpenseBill(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-all border border-blue-500/20">View Bill</button>' : '') +
                    '<button type="button" onclick="approveExpense(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all border border-green-500/20">Approve</button>' +
                    '<button type="button" onclick="rejectExpense(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/20">Reject</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

function loadDirectorExpenses() {
    var container = document.getElementById('director-expenses-list');
    if (!container) return;

    apiFetch('/approvals/pending')
        .then(function (rows) {
            if (!rows.length) {
                container.innerHTML = '<div class="glass-card p-5"><p style="color: var(--text-secondary);">No pending expenses for director final approval.</p></div>';
                return;
            }

            return Promise.all(rows.map(function (row) {
                return apiFetch('/expenses/' + row.id).then(function (detail) {
                    return {
                        row: row,
                        detail: detail
                    };
                });
            })).then(function (items) {
                container.innerHTML = items.map(function (item) {
                    var row = item.row;
                    var approvals = item.detail && item.detail.approvalSummary ? item.detail.approvalSummary.approvals : [];
                    var convertedAmount = formatCurrencyAmount(row.converted_amount, getCompanyCurrencyCode(), 2);
                    var receiptLabel = row.has_receipt ? ('Bill attached: ' + escapeHtml(row.receipt_file_name || 'Receipt image')) : 'No bill attached';
                    return '<div class="glass-card p-6 mb-4">' +
                        '<div class="flex flex-col lg:flex-row lg:items-center gap-4 mb-3">' +
                        '<div class="flex-1">' +
                        '<p class="text-sm font-bold" style="color: var(--text-primary);">' + row.submitted_by_first_name + ' ' + row.submitted_by_last_name + '</p>' +
                        '<p class="text-xs" style="color: var(--text-secondary);">' + row.title + ' | ' + row.category + '</p>' +
                        '<p class="text-xs" style="color: var(--text-muted);">Submitted: ' + (row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A') + '</p>' +
                        '<p class="text-xs" style="color: var(--text-muted);">' + receiptLabel + '</p>' +
                        '</div>' +
                        '<div class="flex items-center gap-2">' +
                        '<p class="text-lg font-bold text-indigo-400">' + convertedAmount + '</p>' +
                        (row.has_receipt ? '<button type="button" onclick="viewExpenseBill(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-all border border-blue-500/20">View Bill</button>' : '') +
                        '<button type="button" onclick="approveExpense(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/30 transition-all border border-green-500/20">Final Approve</button>' +
                        '<button type="button" onclick="rejectExpense(' + row.id + ', event)" class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/20">Reject</button>' +
                        '</div>' +
                        '</div>' +
                        '<div class="pt-3 border-t" style="border-color: var(--glass-border);">' +
                        '<p class="text-xs font-semibold mb-2" style="color: var(--text-secondary);">Approval Timeline</p>' +
                        renderApprovalDates(approvals) +
                        '</div>' +
                        '</div>';
                }).join('');
            });
        })
        .catch(function (err) {
            showToast(err.message, 'error');
        });
}

var dashboardRange = 'monthly';

function setDashboardRange(range) {
    var normalized = String(range || '').toLowerCase();
    if (['monthly', 'weekly', 'yearly'].indexOf(normalized) === -1) {
        return;
    }

    dashboardRange = normalized;
    loadDashboardAnalytics();
}

function parseExpenseDateForDashboard(row) {
    if (row && row.expense_date) {
        return new Date(String(row.expense_date) + 'T00:00:00Z');
    }
    if (row && row.submitted_at) {
        return new Date(row.submitted_at);
    }
    return null;
}

function getWeekStartUtc(date) {
    var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    var day = d.getUTCDay();
    var offset = day === 0 ? -6 : (1 - day);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
}

function buildDashboardSeries(rows, range) {
    var labels = [];
    var values = [];
    var keyIndex = {};
    var now = new Date();

    if (range === 'weekly') {
        var weekStartNow = getWeekStartUtc(now);
        for (var wi = 11; wi >= 0; wi--) {
            var start = new Date(weekStartNow);
            start.setUTCDate(start.getUTCDate() - (wi * 7));
            var key = start.toISOString().slice(0, 10);
            labels.push(start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            values.push(0);
            keyIndex[key] = labels.length - 1;
        }

        rows.forEach(function (row) {
            var dt = parseExpenseDateForDashboard(row);
            if (!dt || Number.isNaN(dt.getTime())) return;
            var bucket = getWeekStartUtc(dt).toISOString().slice(0, 10);
            var idx = keyIndex[bucket];
            if (idx === undefined) return;
            values[idx] += Number(row.converted_amount) || 0;
        });

        return { labels: labels, values: values };
    }

    if (range === 'yearly') {
        var currentYear = now.getUTCFullYear();
        for (var yi = 11; yi >= 0; yi--) {
            var year = currentYear - yi;
            labels.push(String(year));
            values.push(0);
            keyIndex[String(year)] = labels.length - 1;
        }

        rows.forEach(function (row) {
            var dt = parseExpenseDateForDashboard(row);
            if (!dt || Number.isNaN(dt.getTime())) return;
            var y = String(dt.getUTCFullYear());
            var yIdx = keyIndex[y];
            if (yIdx === undefined) return;
            values[yIdx] += Number(row.converted_amount) || 0;
        });

        return { labels: labels, values: values };
    }

    for (var mi = 0; mi < 12; mi++) {
        labels.push(new Date(Date.UTC(now.getUTCFullYear(), mi, 1)).toLocaleDateString('en-US', { month: 'short' }));
        values.push(0);
    }

    var currentYearForMonths = now.getUTCFullYear();
    rows.forEach(function (row) {
        var dt = parseExpenseDateForDashboard(row);
        if (!dt || Number.isNaN(dt.getTime())) return;
        if (dt.getUTCFullYear() !== currentYearForMonths) return;
        var month = dt.getUTCMonth();
        if (month >= 0 && month < 12) {
            values[month] += Number(row.converted_amount) || 0;
        }
    });

    return { labels: labels, values: values };
}

function loadDashboardAnalytics() {
    var page = getCurrentPage('dashboard.html');
    if (page !== 'dashboard.html') return;

    Promise.all([
        apiFetch('/expenses'),
        apiFetch('/approvals/pending').catch(function () { return []; })
    ])
        .then(function (results) {
            var rows = Array.isArray(results[0]) ? results[0] : [];
            var pendingApprovals = Array.isArray(results[1]) ? results[1] : [];

            var totals = {
                total: 0,
                approved: 0,
                rejected: 0,
                pending: 0,
                approvedCount: 0,
                rejectedCount: 0,
                pendingCount: 0
            };

            var categoryTotals = {};
            rows.forEach(function (row) {
                var amount = Number(row.converted_amount) || 0;
                var status = String(row.status || '').toLowerCase();
                var category = String(row.category || 'other').toLowerCase();

                totals.total += amount;
                if (status === 'approved') {
                    totals.approved += amount;
                    totals.approvedCount += 1;
                } else if (status === 'rejected') {
                    totals.rejected += amount;
                    totals.rejectedCount += 1;
                } else {
                    totals.pending += amount;
                    totals.pendingCount += 1;
                }

                categoryTotals[category] = (categoryTotals[category] || 0) + amount;
            });

            var companyCurrency = getCompanyCurrencyCode();
            var dashCurrency = document.getElementById('dash-currency');
            if (dashCurrency) {
                dashCurrency.textContent = companyCurrency + ' (' + getCurrencySymbol(companyCurrency).trim() + ')';
            }

            var statCards = document.querySelectorAll('.stat-card');
            var totalCount = rows.length;
            var totalAmount = Math.max(totals.total, 0.0001);
            var cardData = [
                { amount: totals.total, countText: totalCount + ' items', ratio: 1 },
                { amount: totals.pending, countText: totals.pendingCount + ' items', ratio: totals.pending / totalAmount },
                { amount: totals.approved, countText: totals.approvedCount + ' items', ratio: totals.approved / totalAmount },
                { amount: totals.rejected, countText: totals.rejectedCount + ' items', ratio: totals.rejected / totalAmount }
            ];

            statCards.forEach(function (card, index) {
                if (!cardData[index]) return;
                var valueEl = card.querySelector('.text-2xl.font-bold');
                var badgeEl = card.querySelector('.badge');
                var progressEl = card.querySelector('.h-full');

                if (valueEl) {
                    valueEl.textContent = formatCurrencyAmount(cardData[index].amount, companyCurrency, 0);
                }
                if (badgeEl) {
                    badgeEl.textContent = cardData[index].countText;
                }
                if (progressEl) {
                    var width = index === 0 ? 100 : Math.max(4, Math.min(100, Math.round(cardData[index].ratio * 100)));
                    progressEl.style.width = width + '%';
                }
            });

            var rangeButtons = ['monthly', 'weekly', 'yearly'];
            rangeButtons.forEach(function (name) {
                var btn = document.getElementById('dashboard-range-' + name);
                if (!btn) return;
                if (name === dashboardRange) {
                    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20';
                    btn.style.color = '';
                } else {
                    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/5 transition-colors';
                    btn.style.color = 'var(--text-muted)';
                }
            });

            var series = buildDashboardSeries(rows, dashboardRange);
            var barGroups = document.querySelectorAll('.xl\\:col-span-2 .flex.items-end.gap-3.h-48 > div');
            var maxVal = Math.max.apply(null, series.values.concat([1]));
            barGroups.forEach(function (group, index) {
                if (index >= series.values.length) return;
                var bar = group.querySelector('div');
                var label = group.querySelector('span');
                var value = Number(series.values[index]) || 0;
                var percent = value <= 0 ? 4 : Math.max(8, Math.round((value / maxVal) * 100));
                if (bar) {
                    bar.style.height = percent + '%';
                    bar.title = formatCurrencyAmount(value, companyCurrency, 0);
                }
                if (label) {
                    label.textContent = series.labels[index] || '';
                }
            });

            var categoryMeta = {
                food: { label: 'Food & Dining', icon: '🍽️', text: 'text-indigo-400', gradient: 'from-indigo-500 to-violet-500' },
                travel: { label: 'Travel', icon: '✈️', text: 'text-violet-400', gradient: 'from-violet-500 to-purple-500' },
                accommodation: { label: 'Accommodation', icon: '🏨', text: 'text-purple-400', gradient: 'from-purple-500 to-pink-500' },
                transport: { label: 'Transportation', icon: '🚗', text: 'text-pink-400', gradient: 'from-pink-500 to-rose-500' },
                supplies: { label: 'Supplies', icon: '📦', text: 'text-cyan-400', gradient: 'from-cyan-500 to-blue-500' },
                other: { label: 'Other', icon: '🧾', text: 'text-blue-400', gradient: 'from-blue-500 to-indigo-500' }
            };

            var categoryList = document.getElementById('dashboard-category-list');
            if (categoryList) {
                var categoryEntries = Object.keys(categoryTotals)
                    .map(function (key) {
                        return { key: key, amount: Number(categoryTotals[key]) || 0 };
                    })
                    .sort(function (a, b) { return b.amount - a.amount; });

                if (!categoryEntries.length) {
                    categoryList.innerHTML = '<p class="text-sm" style="color: var(--text-secondary);">No category data yet.</p>';
                } else {
                    var maxCategory = categoryEntries[0].amount || 1;
                    categoryList.innerHTML = categoryEntries.map(function (entry) {
                        var meta = categoryMeta[entry.key] || categoryMeta.other;
                        var width = Math.max(8, Math.round((entry.amount / maxCategory) * 100));
                        return '<div>' +
                            '<div class="flex justify-between mb-1.5">' +
                            '<span class="text-sm font-medium" style="color: var(--text-primary);">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>' +
                            '<span class="text-sm font-bold ' + meta.text + '">' + formatCurrencyAmount(entry.amount, companyCurrency, 0) + '</span>' +
                            '</div>' +
                            '<div class="h-2 rounded-full bg-white/5 overflow-hidden">' +
                            '<div class="h-full rounded-full bg-gradient-to-r ' + meta.gradient + '" style="width: ' + width + '%;"></div>' +
                            '</div>' +
                            '</div>';
                    }).join('');
                }
            }

            var recentContainer = document.getElementById('dashboard-recent-expenses-list');
            if (recentContainer) {
                var recent = rows.slice().sort(function (a, b) {
                    return new Date(b.submitted_at || b.created_at || 0).getTime() - new Date(a.submitted_at || a.created_at || 0).getTime();
                }).slice(0, 6);

                if (!recent.length) {
                    recentContainer.innerHTML = '<p class="text-sm" style="color: var(--text-secondary);">No expenses yet.</p>';
                } else {
                    recentContainer.innerHTML = recent.map(function (row) {
                        var meta = categoryMeta[String(row.category || '').toLowerCase()] || categoryMeta.other;
                        var status = String(row.status || 'pending').toLowerCase();
                        var submittedDate = row.submitted_at
                            ? new Date(row.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'N/A';
                        var title = row.title || 'Expense';
                        return '<div class="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all">' +
                            '<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center text-lg flex-shrink-0">' + meta.icon + '</div>' +
                            '<div class="flex-1 min-w-0">' +
                            '<p class="text-sm font-semibold truncate" style="color: var(--text-primary);">' + escapeHtml(title) + '</p>' +
                            '<p class="text-xs" style="color: var(--text-muted);">' + submittedDate + ' • ' + escapeHtml(meta.label) + '</p>' +
                            '</div>' +
                            '<div class="text-right flex-shrink-0">' +
                            '<p class="text-sm font-bold" style="color: var(--text-primary);">' + formatCurrencyAmount(row.converted_amount || 0, companyCurrency, 0) + '</p>' +
                            '<span class="' + statusBadgeClass(status) + ' text-xs">' + escapeHtml(status.charAt(0).toUpperCase() + status.slice(1)) + '</span>' +
                            '</div>' +
                            '</div>';
                    }).join('');
                }
            }

            var pendingStepCounts = { 1: 0, 2: 0, 3: 0 };
            rows.forEach(function (row) {
                if (String(row.status || '').toLowerCase() !== 'pending') return;
                var step = Number(row.current_step_order) || 0;
                if (pendingStepCounts[step] !== undefined) {
                    pendingStepCounts[step] += 1;
                }
            });

            var doneCount = totals.approvedCount + totals.rejectedCount;
            var stepper = document.getElementById('dashboard-stepper');
            if (stepper) {
                var hasData = rows.length > 0;
                var activeStage = 0;
                if (!hasData) {
                    activeStage = 0;
                } else if (pendingStepCounts[1] > 0) {
                    activeStage = 1;
                } else if (pendingStepCounts[2] > 0) {
                    activeStage = 2;
                } else if (pendingStepCounts[3] > 0) {
                    activeStage = 3;
                } else {
                    activeStage = 4;
                }

                function stepClass(idx) {
                    if (!hasData) return 'pending';
                    if (idx < activeStage || activeStage === 4) return 'completed';
                    if (idx === activeStage) return 'active';
                    return 'pending';
                }

                function lineClass(idx) {
                    if (!hasData) return 'stepper-line';
                    if (idx < activeStage || activeStage === 4) return 'stepper-line completed';
                    return 'stepper-line';
                }

                stepper.innerHTML =
                    '<div class="stepper-step"><div class="stepper-circle ' + stepClass(0) + '"><span>' + rows.length + '</span></div><p class="stepper-label">Submitted</p></div>' +
                    '<div class="' + lineClass(0) + '"></div>' +
                    '<div class="stepper-step"><div class="stepper-circle ' + stepClass(1) + '"><span>' + pendingStepCounts[1] + '</span></div><p class="stepper-label">Manager</p></div>' +
                    '<div class="' + lineClass(1) + '"></div>' +
                    '<div class="stepper-step"><div class="stepper-circle ' + stepClass(2) + '"><span>' + pendingStepCounts[2] + '</span></div><p class="stepper-label">Finance</p></div>' +
                    '<div class="' + lineClass(2) + '"></div>' +
                    '<div class="stepper-step"><div class="stepper-circle ' + stepClass(3) + '"><span>' + pendingStepCounts[3] + '</span></div><p class="stepper-label">Director</p></div>' +
                    '<div class="' + lineClass(3) + '"></div>' +
                    '<div class="stepper-step"><div class="stepper-circle ' + stepClass(4) + '"><span>' + doneCount + '</span></div><p class="stepper-label">Done</p></div>';
            }

            var timeline = document.getElementById('dashboard-flow-timeline');
            if (timeline) {
                var timelineEvents = [];

                rows.forEach(function (row) {
                    if (row.submitted_at) {
                        timelineEvents.push({
                            ts: row.submitted_at,
                            text: (row.title || 'Expense') + ' submitted by ' + ((row.submitted_by_first_name || '') + ' ' + (row.submitted_by_last_name || '')).trim(),
                            completed: true
                        });
                    }

                    if (row.resolved_at && (row.status === 'approved' || row.status === 'rejected')) {
                        timelineEvents.push({
                            ts: row.resolved_at,
                            text: (row.title || 'Expense') + ' ' + String(row.status).toLowerCase(),
                            completed: true
                        });
                    }
                });

                pendingApprovals.slice(0, 3).forEach(function (row) {
                    timelineEvents.push({
                        ts: row.submitted_at,
                        text: 'Awaiting step ' + (row.currentStepOrder || '-') + ' review: ' + (row.title || 'Expense'),
                        completed: false
                    });
                });

                timelineEvents = timelineEvents
                    .filter(function (event) { return event.ts; })
                    .sort(function (a, b) { return new Date(b.ts).getTime() - new Date(a.ts).getTime(); })
                    .slice(0, 6);

                if (!timelineEvents.length) {
                    timeline.innerHTML = '<p class="text-sm" style="color: var(--text-secondary);">No approval flow events yet.</p>';
                } else {
                    timeline.innerHTML = timelineEvents.map(function (event) {
                        return '<div class="timeline-item">' +
                            '<div class="timeline-dot' + (event.completed ? ' completed' : '') + '"></div>' +
                            '<p class="text-sm font-medium" style="color: var(--text-primary);">' + escapeHtml(event.text) + '</p>' +
                            '<p class="text-xs" style="color: var(--text-muted);">' + new Date(event.ts).toLocaleString() + '</p>' +
                            '</div>';
                    }).join('');
                }
            }
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
