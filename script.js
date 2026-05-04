// =============================================================
//  HCMUT Smart Parking System — script.js
//  Role-based SPA: Admin vs User
//  - Admin  : username="admin"  password="admin2026"
//  - Users  : created by admin, stored in localStorage
// =============================================================

// ── 1. CONSTANTS & STATE ──────────────────────────────────────

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin2026';
const DB_KEY     = 'hcmut_parking_users'; // localStorage key

const MAX_SLOTS  = 150;
let   freeSlots  = 150;         // shared live counter
const RING_CIRC  = 314;         // 2 * π * 50 (SVG ring)

let currentUser   = null;       // logged-in user object (null for admin)
let sessionPaid   = false;      // has the current user paid this session?
let autoSlotTimer = null;
let sessionTimer  = null;

// ── 2. SIMPLE "DATABASE" (localStorage) ──────────────────────

/**
 * Load the user array from localStorage.
 * Seeds one demo user on first run.
 * @returns {Array} array of user objects
 */
function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);

    // First run — seed a demo user so there is something to show
    const demo = [{
        username : '2210001',
        password : 'hcmut2026',
        name     : 'Tran Thanh Huy',
        role     : 'Student',
        plate    : '59-X1 123.45',
        bills    : [
            { date:'May 12, 2026', checkIn:'08:15 AM', checkOut:'11:30 AM', amount:'4,000', paid:true  },
            { date:'May 10, 2026', checkIn:'01:00 PM', checkOut:'05:00 PM', amount:'4,000', paid:true  },
            { date:'May 08, 2026', checkIn:'09:00 AM', checkOut:'12:00 PM', amount:'4,000', paid:false }
        ]
    }];
    saveDB(demo);
    return demo;
}

/**
 * Persist the user array to localStorage.
 * @param {Array} users
 */
function saveDB(users) {
    localStorage.setItem(DB_KEY, JSON.stringify(users));
}

/**
 * Find a user by username (case-insensitive).
 * @returns {Object|null}
 */
function findUser(username) {
    return loadDB().find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

// ── 3. VIEW HELPERS ───────────────────────────────────────────

const views = ['landing-view','login-view','admin-view','dashboard-view'];

/** Hide all views, then show the requested one. */
function showView(id) {
    views.forEach(v => document.getElementById(v).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// ── 4. NAVIGATION ─────────────────────────────────────────────

/** Open the login modal over the landing page. */
function showLoginForm() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('sso-username').value = '';
    document.getElementById('sso-password').value = '';
}

/** Close the login modal without logging in. */
function cancelLogin() {
    document.getElementById('login-view').classList.add('hidden');
}

/**
 * Handle login form submission.
 * - Checks admin credentials first.
 * - Then checks against the user database.
 * - Shows an error if neither match.
 */
function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('sso-username').value.trim();
    const password = document.getElementById('sso-password').value;
    const errEl    = document.getElementById('login-error');

    // ── Admin login
    if (username.toLowerCase() === ADMIN_USER && password === ADMIN_PASS) {
        errEl.classList.add('hidden');
        document.getElementById('login-view').classList.add('hidden');
        currentUser = null;
        sessionPaid = false;
        showView('admin-view');
        adminRenderUsers();
        startAutoSlotUpdate();    // admin also sees live updates
        syncAdminSlotDisplay();
        return;
    }

    // ── User login
    const user = findUser(username);
    if (user && user.password === password) {
        errEl.classList.add('hidden');
        document.getElementById('login-view').classList.add('hidden');
        currentUser = user;
        sessionPaid = false;
        showView('dashboard-view');
        populateUserDashboard(user);
        updateSlotDisplay();
        startAutoSlotUpdate();
        startSessionTimer();
        return;
    }

    // ── Invalid credentials
    errEl.classList.remove('hidden');
}

/** Log out — stop timers, return to landing. */
function handleLogout() {
    stopAutoSlotUpdate();
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
    currentUser = null;
    sessionPaid = false;
    showView('landing-view');
    document.getElementById('landing-view').classList.remove('hidden');
}

// ── 5. SLOT DISPLAY (shared between admin & user) ─────────────

/**
 * Update the user-view slot ring chart, counters, and status bar.
 */
function updateSlotDisplay() {
    const occupied = MAX_SLOTS - freeSlots;

    // Ring chart
    const offset = RING_CIRC * (1 - freeSlots / MAX_SLOTS);
    const ring   = document.getElementById('slot-ring');
    if (ring) {
        ring.style.strokeDashoffset = offset;
        ring.style.stroke = freeSlots <= 10 ? '#ef4444' : freeSlots <= 30 ? '#f59e0b' : '#22c55e';
    }

    // Counters
    setElText('free-slots-count', freeSlots);
    setElText('free-count',       freeSlots);
    setElText('occupied-count',   occupied);

    // Colour of big number
    const bigEl = document.getElementById('free-slots-count');
    if (bigEl) bigEl.style.color = freeSlots <= 10 ? '#ef4444' : freeSlots <= 30 ? '#f59e0b' : '#e8f0ff';

    // Status bar
    const statusEl  = document.getElementById('slot-status');
    const statusTxt = document.getElementById('slot-status-text');
    if (statusEl && statusTxt) {
        if (freeSlots === 0) {
            applySlotStatus(statusEl, statusTxt, 'danger', '🚫 Parking lot is FULL');
        } else if (freeSlots <= 10) {
            applySlotStatus(statusEl, statusTxt, 'danger', `⚠️ Almost full — only ${freeSlots} slot(s) left!`);
        } else if (freeSlots <= 30) {
            applySlotStatus(statusEl, statusTxt, 'warning', `⚡ Limited space — ${freeSlots} slots available`);
        } else {
            applySlotStatus(statusEl, statusTxt, 'success', `✅ Plenty of space — ${freeSlots} slots free`);
        }
    }
}

function applySlotStatus(el, txt, type, message) {
    const map = {
        success : ['rgba(34,197,94,0.07)','rgba(34,197,94,0.18)','#22c55e'],
        warning : ['rgba(245,158,11,0.07)','rgba(245,158,11,0.2)','#f59e0b'],
        danger  : ['rgba(239,68,68,0.08)','rgba(239,68,68,0.2)','#ef4444'],
    };
    const [bg, border, color] = map[type];
    el.style.background   = bg;
    el.style.borderColor  = border;
    el.style.color        = color;
    txt.textContent       = message;
}

/** Sync the admin slot control display with the current freeSlots value. */
function syncAdminSlotDisplay() {
    setElText('admin-free-display', freeSlots);
    const bigEl = document.getElementById('admin-free-display');
    if (bigEl) bigEl.style.color = freeSlots <= 10 ? '#ef4444' : freeSlots <= 30 ? '#f59e0b' : '#3b82f6';

    // Keep user view in sync too if it exists
    updateSlotDisplay();
}

// ── 6. AUTO LIVE UPDATE ───────────────────────────────────────

/**
 * Simulate real-time hardware sensor updates every 5 seconds.
 * Randomly increases or decreases free slots by 1.
 */
function startAutoSlotUpdate() {
    autoSlotTimer = setInterval(() => {
        const delta = Math.random() < 0.5 ? -1 : 1;
        const next  = freeSlots + delta;
        if (next >= 0 && next <= MAX_SLOTS) {
            freeSlots = next;
            updateSlotDisplay();
            syncAdminSlotDisplay();
        }
    }, 5000);
}

function stopAutoSlotUpdate() {
    if (autoSlotTimer) { clearInterval(autoSlotTimer); autoSlotTimer = null; }
}

// ── 7. ADMIN FUNCTIONS ────────────────────────────────────────

/**
 * Set freeSlots from the admin number input and update both views.
 * Validates that the value is within [0, MAX_SLOTS].
 */
function adminSetSlots() {
    const val = parseInt(document.getElementById('admin-slot-input').value, 10);
    if (isNaN(val) || val < 0 || val > MAX_SLOTS) {
        alert(`Please enter a value between 0 and ${MAX_SLOTS}.`);
        return;
    }
    freeSlots = val;
    syncAdminSlotDisplay();
}

/**
 * Render the registered users table in the admin view.
 * Shows name, role, plate, count of unpaid bills, and a remove button.
 */
function adminRenderUsers() {
    const users  = loadDB();
    const tbody  = document.getElementById('admin-users-tbody');
    const noMsg  = document.getElementById('no-users-msg');
    const badge  = document.getElementById('user-count-badge');

    badge.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

    if (users.length === 0) {
        tbody.innerHTML = '';
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    tbody.innerHTML = users.map(u => {
        const unpaid = u.bills.filter(b => !b.paid).length;
        const unpaidHtml = unpaid > 0
            ? `<span class="badge badge-unpaid">${unpaid} unpaid</span>`
            : `<span class="badge badge-paid">All clear</span>`;
        return `
        <tr>
          <td>${u.username}</td>
          <td>${u.name}</td>
          <td>${u.role}</td>
          <td><span class="plate-val">${u.plate}</span></td>
          <td>${unpaidHtml}</td>
          <td><button class="btn btn-remove" onclick="adminRemoveUser('${u.username}')">Remove</button></td>
        </tr>`;
    }).join('');
}

/**
 * Create a new user account from the admin form.
 * Prevents duplicate usernames and the "admin" username.
 */
function adminCreateUser(event) {
    event.preventDefault();
    const msgEl    = document.getElementById('create-user-msg');
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const name     = document.getElementById('new-name').value.trim();
    const role     = document.getElementById('new-role').value;
    const plate    = document.getElementById('new-plate').value.trim();

    // Guard: reserved username
    if (username.toLowerCase() === ADMIN_USER) {
        showCreateMsg(msgEl, 'error', '❌ Username "admin" is reserved.');
        return;
    }
    // Guard: duplicate username
    if (findUser(username)) {
        showCreateMsg(msgEl, 'error', `❌ Username "${username}" already exists.`);
        return;
    }

    const users = loadDB();
    users.push({ username, password, name, role, plate, bills: [] });
    saveDB(users);

    showCreateMsg(msgEl, 'success', `✅ Account "${username}" created successfully!`);
    document.getElementById('create-user-form').reset();
    adminRenderUsers();
}

/**
 * Remove a user account by username (admin action).
 */
function adminRemoveUser(username) {
    if (!confirm(`Remove account "${username}"? This cannot be undone.`)) return;
    const users = loadDB().filter(u => u.username !== username);
    saveDB(users);
    adminRenderUsers();
}

function showCreateMsg(el, type, text) {
    el.className   = `create-msg ${type}`;
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── 8. USER DASHBOARD ─────────────────────────────────────────

/**
 * Populate the user dashboard with data from the user's DB record.
 * @param {Object} user
 */
function populateUserDashboard(user) {
    // Navbar
    setElText('dash-user-name', user.name);
    setElText('dash-user-role', user.role);
    const initials = user.name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
    setElText('user-avatar-initials', initials);

    // Info card
    setElText('info-name',  user.name);
    setElText('info-role',  user.role);
    setElText('info-id',    user.username);
    setElText('info-plate', user.plate);

    // Bill date (today)
    const today = new Date().toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric' });
    setElText('bill-date', today);

    // Payment history
    renderUserBills(user.bills);
}

/**
 * Render the payment history table for the logged-in user.
 * @param {Array} bills
 */
function renderUserBills(bills) {
    const tbody = document.getElementById('history-tbody');
    if (!bills || bills.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#3d5070;padding:20px">No payment history yet.</td></tr>';
        return;
    }
    tbody.innerHTML = bills.slice().reverse().map(b => `
        <tr>
          <td>${b.date}</td>
          <td>${b.checkIn}</td>
          <td>${b.checkOut || '—'}</td>
          <td>${b.amount} VND</td>
          <td>${b.paid
              ? '<span class="badge badge-paid">&#x2714; Paid</span>'
              : '<span class="badge badge-unpaid">&#x2716; Not Paid</span>'}</td>
        </tr>`).join('');
}

// ── 9. SESSION DURATION TIMER ──────────────────────────────────

function startSessionTimer() {
    updateDurationDisplay();
    sessionTimer = setInterval(updateDurationDisplay, 60_000);
}

function updateDurationDisplay() {
    const now     = new Date();
    const checkIn = new Date(now);
    checkIn.setHours(7, 30, 0, 0);
    const diff    = Math.max(0, now - checkIn);
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    setElText('session-duration', h > 0 ? `${h}h ${m}m` : `${m} min`);
}

// ── 10. PAYMENT ───────────────────────────────────────────────

/**
 * Handle "Pay Now" button click:
 * 1. Marks session as paid
 * 2. Updates the badge & disables the button
 * 3. Persists a new bill record for this user in the DB
 * 4. Refreshes the history table
 * 5. Shows success toast
 */
function handlePayment() {
    if (sessionPaid) return;
    sessionPaid = true;

    // Update UI
    const btn = document.getElementById('btn-pay-now');
    btn.disabled        = true;
    btn.textContent     = '✔ Payment Complete';
    btn.style.background = 'rgba(34,197,94,0.15)';
    btn.style.color      = '#22c55e';
    btn.style.boxShadow  = 'none';
    btn.style.cursor     = 'default';

    const badge = document.getElementById('bill-status-badge');
    badge.className   = 'badge badge-paid';
    badge.textContent = '✔ Paid';

    // Persist the bill to the user's record
    if (currentUser) {
        const now      = new Date();
        const dateStr  = now.toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric' });
        const timeStr  = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });

        const newBill  = { date:dateStr, checkIn:'07:30 AM', checkOut:timeStr, amount:'4,000', paid:true };
        currentUser.bills.push(newBill);

        const users = loadDB().map(u => u.username === currentUser.username ? currentUser : u);
        saveDB(users);
        renderUserBills(currentUser.bills);
    }

    showPaymentSuccessToast();
}

function showPaymentSuccessToast() {
    const toast = document.getElementById('success-toast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4500);
}

// ── 11. UTILITY ───────────────────────────────────────────────

/** Safely set the textContent of an element by ID. */
function setElText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}