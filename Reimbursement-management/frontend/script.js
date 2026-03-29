// ==========================================
// ExpenseAI - Main JavaScript
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    loadCountries();
    initPasswordStrength();
});

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
    if (email && password && email.value && password.value) {
        showToast('Signing in...', 'info');
        setTimeout(function () {
            window.location.href = 'dashboard.html';
        }, 800);
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
        showToast('Creating your account...', 'info');
        const currency = document.getElementById('detected-currency');
        if (currency) {
            localStorage.setItem('expenseai-currency', currency.textContent);
        }
        localStorage.setItem('expenseai-company', company.value);
        setTimeout(function () {
            window.location.href = 'dashboard.html';
        }, 1200);
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
    showToast('Expense submitted successfully!', 'success');
    setTimeout(function () {
        closeExpenseModal();
    }, 500);
}

// ==========================================
// MANAGER ACTIONS
// ==========================================

function approveExpense(id) {
    var card = document.getElementById(id);
    if (!card) return;

    // Animate
    card.style.transition = 'all 0.5s ease';
    card.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    card.style.background = 'rgba(34, 197, 94, 0.05)';

    // Update badge
    var badge = card.querySelector('.badge-pending');
    if (badge) {
        badge.className = 'badge badge-approved';
        badge.textContent = 'Approved';
    }

    // Disable buttons
    var buttons = card.querySelectorAll('button');
    buttons.forEach(function (b) {
        if (b.textContent === 'Approve' || b.textContent === 'Reject') {
            b.disabled = true;
            b.style.opacity = '0.5';
            b.style.cursor = 'not-allowed';
        }
    });

    showToast('Expense approved! Forwarded to next approver.', 'success');
}

function rejectExpense(id) {
    var card = document.getElementById(id);
    if (!card) return;

    card.style.transition = 'all 0.5s ease';
    card.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    card.style.background = 'rgba(239, 68, 68, 0.05)';

    var badge = card.querySelector('.badge-pending');
    if (badge) {
        badge.className = 'badge badge-rejected';
        badge.textContent = 'Rejected';
    }

    var buttons = card.querySelectorAll('button');
    buttons.forEach(function (b) {
        if (b.textContent === 'Approve' || b.textContent === 'Reject') {
            b.disabled = true;
            b.style.opacity = '0.5';
            b.style.cursor = 'not-allowed';
        }
    });

    showToast('Expense rejected.', 'error');
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
    showToast('New rule template added!', 'success');
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