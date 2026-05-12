// HCMUT Smart Parking System — script.js v5
const ADMIN_USER = 'admin', ADMIN_PASS = '123456', DB_KEY = 'hcmut_parking_users_v8';
const FLAT_RATE = 100000, GUEST_RATE = 7000, LATE_PENALTY = 10000, MAX_SLOTS = 150, RING_CIRC = 314;
let freeSlots = 50, occupiedSlots = new Set(), currentUser = null, autoSlotTimer = null;

// ── UTILS ──
function setEl(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function getYM(d) { const dt = d || new Date(); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(k) { const [y, m] = k.split('-'); return `Tháng ${parseInt(m)}/${y}`; }
function curKey() { return getYM(new Date()); }
function fmtVND(n) { return (n || 0).toLocaleString('vi-VN') + ' VND'; }
function isPastGrace(monthKey) {
    // Grace period ends on day 7 of the NEXT month after monthKey
    // monthKey = "YYYY-MM", e.g. "2026-04" → grace ends 2026-05-07
    const [y, m] = monthKey.split('-').map(Number);
    // new Date(y, m, 7): JS months are 0-indexed, so m (1-12 from split) maps to correct next month
    const grace = new Date(y, m, 7);
    return new Date() > grace;
}
function countOverdue(user) {
    const ck = curKey();
    return user.bills.filter(b => b.monthKey !== ck && !b.paid && isPastGrace(b.monthKey)).length;
}

// ── DB ──
function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
    const now = new Date();
    const prev = n => { const d = new Date(now.getFullYear(), now.getMonth() - n, 1); return getYM(d); };
    const mkS = (y, m, n) => Array.from({ length: n }, (_, i) => ({
        date: `${String(Math.min(28, (i + 1) * 2)).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
        checkIn: `${String(7 + (i % 4)).padStart(2, '0')}:00`,
        checkOut: `${String(9 + (i % 4)).padStart(2, '0')}:30`
    }));
    const mkB = (key, n, paid, paidAt = null) => {
        const [y, m] = key.split('-').map(Number);
        const penalty = (!paid && isPastGrace(key)) ? LATE_PENALTY : 0;
        return {
            monthKey: key, sessions: mkS(y, m, n), sessionCount: n,
            amount: FLAT_RATE, penalty, totalDue: FLAT_RATE + penalty, paid, paidAt
        };
    };
    const users = [
        {
            username: '2252723', password: '123456', name: 'Nguyễn Trương Đức Tài',
            dob: '12/10/2004', role: 'Student', plate: '60-F1 999.99', email: 'ductai@hcmut.edu.vn', phone: '0123456789', locked: false, bills: [
                mkB(prev(3), 5, true, '05/02/2026'),
                mkB(prev(2), 8, true, '06/03/2026'),
                mkB(prev(1), 12, true, '04/04/2026'),
                mkB(curKey(), 4, true, '02/05/2026')
            ]
        },

        {
            username: '2352414', password: '123456', name: 'Trần Thanh Huy',
            dob: '20/03/2003', role: 'Student', plate: '51-B2 456.78', locked: false, bills: [
                mkB(prev(7), 10, true, '09/10/2025'), mkB(prev(6), 8, true, '06/11/2025'),
                mkB(prev(5), 7, true, '05/12/2025'), mkB(prev(4), 9, false), // Jan - unpaid, past grace
                mkB(prev(3), 6, false),               // Feb - unpaid, past grace
                mkB(prev(2), 5, false),               // Mar - unpaid, past grace
                mkB(prev(1), 4, false),               // Apr - unpaid (grace ends May 7)
                mkB(curKey(), 2, false)
            ]
        },
        {
            username: 'NV001', password: '123456', name: 'Nguyễn Đình Khoa',
            dob: '10/05/1990', role: 'Staff', plate: '59-C3 789.01', locked: false, bills: [
                mkB(prev(4), 15, false), mkB(prev(3), 12, false),
                mkB(prev(2), 20, false), mkB(prev(1), 18, false),
                mkB(curKey(), 8, false)
            ]
        }
    ];
    // auto-lock if >=3 overdue AND not admin-unlocked
    users.forEach(u => {
        if (countOverdue(u) >= 3 && !u.adminUnlocked) {
            u.locked = true;
        }
    });
    saveDB(users); return users;
}
function saveDB(u) { localStorage.setItem(DB_KEY, JSON.stringify(u)); }
function findUser(u) { return loadDB().find(x => x.username.toLowerCase() === u.trim().toLowerCase()) || null; }

function applyPenalties(user) {
    const ck = curKey(); let changed = false;
    user.bills.forEach(b => {
        if (b.monthKey === ck || b.paid) return;
        if (!b.penalty && isPastGrace(b.monthKey)) {
            b.penalty = LATE_PENALTY; b.totalDue = b.amount + LATE_PENALTY; changed = true;
        }
    });
    return changed;
}

function getOrCreateMonthBill(user) {
    const key = curKey();
    let bill = user.bills.find(b => b.monthKey === key);
    if (!bill) {
        bill = { monthKey: key, sessions: [], sessionCount: 0, amount: FLAT_RATE, penalty: 0, totalDue: FLAT_RATE, paid: false, paidAt: null };
        user.bills.push(bill);
        saveDB(loadDB().map(u => u.username === user.username ? user : u));
    }
    return bill;
}

// ── SLOTS ──
function initOccupiedSlots() {
    occupiedSlots.clear();
    const all = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[all[i], all[j]] = [all[j], all[i]]; }
    all.slice(0, MAX_SLOTS - freeSlots).forEach(s => occupiedSlots.add(s));
}

// ── VIEWS ──
const VIEWS = ['landing-view', 'login-view', 'admin-view', 'dashboard-view'];
function showView(id) { VIEWS.forEach(v => document.getElementById(v).classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function showLoginForm() { document.getElementById('login-view').classList.remove('hidden'); document.getElementById('login-error').classList.add('hidden'); document.getElementById('sso-username').value = ''; document.getElementById('sso-password').value = ''; }
function cancelLogin() { document.getElementById('login-view').classList.add('hidden'); }
function printTempTicket() {
    cancelLogin();
    const modal = document.getElementById('qr-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const code = 'GUEST-' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('qr-code-text').textContent = code;
    document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${code}`;
}
function closeQrModal() {
    document.getElementById('qr-modal').classList.add('hidden');
}
async function downloadQrCode() {
    const imgUrl = document.getElementById('qr-image').src;
    const ticketCode = document.getElementById('qr-code-text').textContent;
    try {
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `SPS_${ticketCode}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (e) {
        alert(currentLang === 'en' ? 'Cannot download image' : 'Không thể tải ảnh xuống');
    }
}

// ── REPORT MODAL ──
let selectedReportCat = '';
function openReportModal() {
    document.getElementById('report-step1').classList.remove('hidden');
    document.getElementById('report-step2').classList.add('hidden');
    document.getElementById('report-step3').classList.add('hidden');
    document.querySelectorAll('.report-cat-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('report-modal').classList.remove('hidden');
}
function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
    const desc = document.getElementById('report-desc');
    if (desc) desc.value = '';
}
function selectReportCategory(btn, catNum) {
    document.querySelectorAll('.report-cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedReportCat = btn.textContent.trim();
    document.getElementById('report-selected-cat').textContent = selectedReportCat;
    document.getElementById('report-step1').classList.add('hidden');
    document.getElementById('report-step2').classList.remove('hidden');
}
function reportGoBack() {
    document.getElementById('report-step2').classList.add('hidden');
    document.getElementById('report-step1').classList.remove('hidden');
}
function submitReport() {
    const desc = document.getElementById('report-desc').value.trim();
    if (!desc) {
        alert(currentLang === 'en' ? 'Please describe the issue.' : 'Vui lòng mô tả vấn đề.');
        return;
    }
    document.getElementById('report-step2').classList.add('hidden');
    document.getElementById('report-step3').classList.remove('hidden');
}

// ── CHAT SYSTEM ──
const CHAT_KEY = 'sps_chat_messages';
function loadChatMessages() {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; }
    catch { return []; }
}
function saveChatMessages(msgs) { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs)); }

let activePanelContext = null; // 'admin' or 'user'

function renderChatMessages(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const msgs = loadChatMessages();
    if (!msgs.length) {
        container.innerHTML = '<div class="fp-empty">💬 ' +
            (currentLang === 'en' ? 'No messages yet. Start a conversation!' : 'Chưa có tin nhắn. Bắt đầu trò chuyện!') + '</div>';
        return;
    }
    const isAdmin = activePanelContext === 'admin';
    container.innerHTML = msgs.map(m => {
        const isMine = (isAdmin && m.sender === 'admin') || (!isAdmin && currentUser && m.sender === currentUser.username);
        return `<div style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};">
            <div style="font-size:.7rem;color:var(--text-2);margin-bottom:2px;">${m.senderName} · ${m.time}</div>
            <div style="max-width:80%;padding:9px 14px;border-radius:${isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};background:${isMine ? 'var(--accent)' : 'var(--bg-card)'};color:${isMine ? '#fff' : 'var(--text)'};font-size:.85rem;border:${isMine ? 'none' : '1px solid var(--border)'};">${m.text}</div>
        </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

function sendFloatingChat() {
    const input = document.getElementById('fp-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const msgs = loadChatMessages();
    const isAdmin = activePanelContext === 'admin';
    msgs.push({
        sender: isAdmin ? 'admin' : (currentUser ? currentUser.username : 'unknown'),
        senderName: isAdmin ? 'Admin' : (currentUser ? currentUser.name : '—'),
        text,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    });
    saveChatMessages(msgs);
    input.value = '';
    renderChatMessages('chat-panel-messages');
}

// Legacy functions (keep for backward compat)
function sendChatMessage() { sendFloatingChat(); }
function sendAdminChatMessage() { sendFloatingChat(); }

// ── FLOATING PANELS ──
function closeAllPanels() {
    document.getElementById('notif-panel').classList.add('hidden');
    document.getElementById('chat-panel').classList.add('hidden');
    document.getElementById('panel-overlay').classList.add('hidden');
}

function toggleNotifPanel(context) {
    activePanelContext = context;
    const panel = document.getElementById('notif-panel');
    const chatPanel = document.getElementById('chat-panel');
    chatPanel.classList.add('hidden');
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) { closeAllPanels(); return; }
    panel.classList.remove('hidden');
    document.getElementById('panel-overlay').classList.remove('hidden');
    renderNotifPanel(context);
}

function toggleChatPanel(context) {
    activePanelContext = context;
    const panel = document.getElementById('chat-panel');
    const notifPanel = document.getElementById('notif-panel');
    notifPanel.classList.add('hidden');
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) { closeAllPanels(); return; }
    panel.classList.remove('hidden');
    document.getElementById('panel-overlay').classList.remove('hidden');
    const titleEl = document.getElementById('chat-panel-title');
    if (titleEl) titleEl.textContent = context === 'admin'
        ? (currentLang === 'en' ? 'Chat with Users' : 'Chat với Users')
        : (currentLang === 'en' ? 'Chat with Admin' : 'Chat với Admin');
    renderChatMessages('chat-panel-messages');
}

// ── NOTIFICATIONS ──
function renderNotifPanel(context) {
    const listEl = document.getElementById('notif-panel-list');
    if (!listEl) return;
    let notifications = [];

    if (context === 'admin') {
        // Admin sees all overdue users
        const users = loadDB();
        users.forEach(u => {
            const overdueCount = countOverdue(u);
            if (overdueCount > 0) {
                notifications.push({
                    icon: '⚠️',
                    text: `${u.name} (${u.username}) — ${overdueCount} ` + (currentLang === 'en' ? 'overdue bill(s)' : 'hóa đơn quá hạn')
                });
            }
        });
    } else if (currentUser) {
        // User sees their own payment due
        currentUser.bills.forEach(b => {
            if (!b.paid) {
                notifications.push({
                    icon: '⚠️',
                    text: (currentLang === 'en' ? 'Payment due: ' : 'Đến hạn thanh toán: ') + monthLabel(b.monthKey)
                });
            }
        });
    }

    // Update badge
    const badgeId = context === 'admin' ? 'admin-notif-badge' : 'user-notif-badge';
    const badge = document.getElementById(badgeId);
    if (badge) {
        badge.textContent = notifications.length;
        badge.classList.toggle('hidden', notifications.length === 0);
    }

    if (!notifications.length) {
        listEl.innerHTML = '<div class="fp-empty">' + (currentLang === 'en' ? 'No new notifications' : 'Không có thông báo mới') + '</div>';
        return;
    }
    listEl.innerHTML = notifications.map(n =>
        `<div class="notif-item"><span style="flex-shrink:0;">${n.icon}</span><span>${n.text}</span></div>`
    ).join('');
}

function renderNotifications() { /* legacy - now handled by renderNotifPanel */ }


function handleLogin(e) {
    e.preventDefault();
    const uname = document.getElementById('sso-username').value.trim();
    const pass = document.getElementById('sso-password').value;
    const err = document.getElementById('login-error');
    if (uname.toLowerCase() === ADMIN_USER && pass === ADMIN_PASS) {
        err.classList.add('hidden'); document.getElementById('login-view').classList.add('hidden');
        currentUser = null; showView('admin-view'); adminRenderUsers(); initOccupiedSlots(); startAutoSlotUpdate(); syncAdminSlotDisplay(); adminInitSidebar(); return;
    }
    const found = findUser(uname);
    if (found && found.password === pass) {
        if (found.locked) {
            err.innerHTML = currentLang === 'en'
                ? '🔒 Account locked due to overdue debt. Please pay at <a href="https://bkpay.hcmut.edu.vn" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:bold;">BKPay</a>.'
                : '🔒 Tài khoản bị khoá do nợ quá hạn. Vui lòng thanh toán tại <a href="https://bkpay.hcmut.edu.vn" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:bold;">BKPay</a>.';
            err.classList.remove('hidden');
            return;
        }
        err.classList.add('hidden'); document.getElementById('login-view').classList.add('hidden');
        // apply penalties & check auto-lock
        const users = loadDB(); const dbU = users.find(u => u.username === found.username);
        applyPenalties(dbU);
        if (countOverdue(dbU) >= 3 && !dbU.adminUnlocked) {
            dbU.locked = true;
            saveDB(users);
            err.innerHTML = currentLang === 'en'
                ? '🔒 Account locked (3+ overdue months). Please pay at <a href="https://bkpay.hcmut.edu.vn" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:bold;">BKPay</a>.'
                : '🔒 Tài khoản vừa bị khoá do nợ từ 3 tháng trở lên. Vui lòng thanh toán tại <a href="https://bkpay.hcmut.edu.vn" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:bold;">BKPay</a>.';
            err.classList.remove('hidden');
            return;
        }
        saveDB(users);
        currentUser = dbU; showView('dashboard-view'); populateUserDashboard(currentUser); initOccupiedSlots(); updateSlotDisplay(); startAutoSlotUpdate(); return;
    }
    err.innerHTML = currentLang === 'en' ? '⚠ Invalid username or password.' : '⚠ Tên đăng nhập hoặc mật khẩu không đúng.';
    err.classList.remove('hidden');
}
function handleLogout() { stopAutoSlotUpdate(); currentUser = null; showView('landing-view'); }

// ── SLOT DISPLAY ──
function updateSlotDisplay() {
    const occ = MAX_SLOTS - freeSlots, ring = document.getElementById('slot-ring');
    if (ring) { ring.style.strokeDashoffset = RING_CIRC * (1 - freeSlots / MAX_SLOTS); ring.style.stroke = freeSlots <= 10 ? '#ef4444' : freeSlots <= 30 ? '#f59e0b' : '#22c55e'; }
    setEl('free-slots-count', freeSlots); setEl('free-count', freeSlots); setEl('occupied-count', occ);
    setEl('landing-free-slots', freeSlots);
    const big = document.getElementById('free-slots-count');
    if (big) big.style.color = freeSlots <= 10 ? '#dc2626' : freeSlots <= 30 ? '#b45309' : '#1e40af';
    const stEl = document.getElementById('slot-status'), stTx = document.getElementById('slot-status-text');
    if (stEl && stTx) {
        if (freeSlots === 0) applyStatus(stEl, stTx, 'danger', '🚫 Bãi xe đầy!');
        else if (freeSlots <= 10) applyStatus(stEl, stTx, 'danger', `⚠️ Gần đầy — còn ${freeSlots} chỗ!`);
        else if (freeSlots <= 30) applyStatus(stEl, stTx, 'warning', `⚡ Còn ít chỗ — ${freeSlots} slot`);
        else applyStatus(stEl, stTx, 'success', `✅ Còn nhiều chỗ — ${freeSlots} slot trống`);
    }

    // Update available slots visual grid
    const availContainer = document.getElementById('available-slots-container');
    if (availContainer) {
        const allSlots = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
        const availSlots = allSlots.filter(s => !occupiedSlots.has(s));
        availContainer.innerHTML = availSlots.map(s =>
            `<div style="font-size:0.75rem;font-weight:700;color:#16a34a;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);padding:4px 8px;border-radius:6px;min-width:40px;text-align:center;">P-${s}</div>`
        ).join('');
    }
}
function applyStatus(el, txt, type, msg) {
    const m = { success: ['rgba(22,163,74,.08)', 'rgba(22,163,74,.2)', '#15803d'], warning: ['rgba(245,158,11,.08)', 'rgba(245,158,11,.25)', '#b45309'], danger: ['rgba(220,38,38,.08)', 'rgba(220,38,38,.25)', '#dc2626'] };
    const [bg, bd, c] = m[type]; el.style.background = bg; el.style.borderColor = bd; el.style.color = c; txt.textContent = msg;
}
function syncAdminSlotDisplay() {
    setEl('admin-free-display', freeSlots);
    const big = document.getElementById('admin-free-display');
    if (big) big.style.color = freeSlots <= 10 ? '#dc2626' : freeSlots <= 30 ? '#b45309' : '#2563eb';
    updateSlotDisplay();
    // Update dashboard & monitoring stat cards live
    setEl('sc-free', freeSlots); setEl('sc-occ', MAX_SLOTS - freeSlots);
    setEl('mon-free', freeSlots); setEl('mon-occ', MAX_SLOTS - freeSlots);
    setEl('mon-pct', Math.round(freeSlots / MAX_SLOTS * 100) + '%');
    // Refresh monitoring grid if visible
    const monTab = document.getElementById('tab-monitoring');
    if (monTab && monTab.classList.contains('active')) {
        const grid = document.getElementById('monitoring-slot-grid');
        if (grid) {
            setEl('mon-board-free', freeSlots); setEl('mon-board-occ', MAX_SLOTS - freeSlots);
            grid.innerHTML = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1)
                .map(i => `<div class="slot-cell ${occupiedSlots.has(i) ? 'slot-occ' : 'slot-free'}" title="Slot ${i}">${i}</div>`).join('');
        }
    }
}
function startAutoSlotUpdate() {
    stopAutoSlotUpdate();
    autoSlotTimer = setInterval(() => {
        const d = Math.random() < .5 ? -1 : 1, nxt = freeSlots + d;
        if (nxt >= 0 && nxt <= MAX_SLOTS) {
            freeSlots = nxt;
            if (d === -1) { let c; do { c = Math.floor(Math.random() * MAX_SLOTS) + 1; } while (occupiedSlots.has(c)); occupiedSlots.add(c); }
            else if (occupiedSlots.size > 0) { const a = [...occupiedSlots]; occupiedSlots.delete(a[Math.floor(Math.random() * a.length)]); }
            updateSlotDisplay(); syncAdminSlotDisplay();
            const bm = document.getElementById('inline-slot-board');
            if (bm && bm.style.display !== 'none') renderSlotBoard();
        }
    }, 5000);
}
function stopAutoSlotUpdate() { if (autoSlotTimer) { clearInterval(autoSlotTimer); autoSlotTimer = null; } }

// ── SLOT BOARD ──
function toggleSlotBoard() {
    const board = document.getElementById('inline-slot-board');
    if (!board) return;
    if (board.style.display === 'none') {
        renderSlotBoard();
        board.style.display = 'block';
    } else {
        board.style.display = 'none';
    }
}
function renderSlotBoard() {
    const grid = document.getElementById('slot-board-grid'); if (!grid) return;
    setEl('board-free-count', freeSlots); setEl('board-occ-count', MAX_SLOTS - freeSlots);

    grid.style.display = 'block'; // Override default grid

    const leftSlots = Array.from({ length: 75 }, (_, i) => i + 1)
        .map(i => `<div class="slot-cell ${occupiedSlots.has(i) ? 'slot-occ' : 'slot-free'}" title="Slot ${i}">${i}</div>`).join('');

    const rightSlots = Array.from({ length: 75 }, (_, i) => i + 76)
        .map(i => `<div class="slot-cell ${occupiedSlots.has(i) ? 'slot-occ' : 'slot-free'}" title="Slot ${i}">${i}</div>`).join('');

    grid.innerHTML = `
    <div style="background: #e2e8f0; padding: 25px 20px 20px 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 15px; position: relative; margin-top: 15px;">
        
        <div style="position: absolute; top: -12px; left: 30px; background: #3b82f6; color: white; padding: 4px 12px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; box-shadow: 0 2px 5px rgba(59,130,246,0.3);">
            ⬇ CỔNG VÀO / ENTRANCE
        </div>

        <div style="display: flex; gap: 15px;">
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; flex: 1; background: #fff; padding: 12px; border-radius: 8px;">
                ${leftSlots}
            </div>

            <div style="width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 50px; color: #94a3b8; font-size: 1.2rem; font-weight: bold;">
               <span>⬇</span><span>⬇</span><span>⬇</span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; flex: 1; background: #fff; padding: 12px; border-radius: 8px;">
                ${rightSlots}
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; color: #64748b; font-weight: bold; font-size: 0.85rem; padding: 0 10px;">
            <span style="background: #ef4444; color: white; padding: 4px 12px; border-radius: 6px;">⬅ LỐI RA / EXIT</span>
            <span>⬅ ĐƯỜNG XE CHẠY VÒNG / DRIVEWAY ⬅</span>
        </div>
    </div>
    `;
}

// ── ADMIN ──
function adminSetSlots() {
    const val = parseInt(document.getElementById('admin-slot-input').value, 10);
    if (isNaN(val) || val < 0 || val > MAX_SLOTS) { alert(`Nhập 0–${MAX_SLOTS}.`); return; }
    freeSlots = val; occupiedSlots.clear();
    const all = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[all[i], all[j]] = [all[j], all[i]]; }
    all.slice(0, MAX_SLOTS - freeSlots).forEach(s => occupiedSlots.add(s)); syncAdminSlotDisplay();
}

function adminRenderUsers() {
    const users = loadDB(), tbody = document.getElementById('admin-users-tbody'),
        noMsg = document.getElementById('no-users-msg'), badge = document.getElementById('user-count-badge'), month = curKey();
    badge.textContent = currentLang === 'en' ? `${users.length} user${users.length !== 1 ? 's' : ''}` : `${users.length} người dùng`;
    const mlEl = document.getElementById('admin-month-label'); if (mlEl) mlEl.textContent = monthLabel(month);
    if (!users.length) { tbody.innerHTML = ''; noMsg.classList.remove('hidden'); return; }
    noMsg.classList.add('hidden');
    tbody.innerHTML = users.map(u => {
        const mb = u.bills.find(b => b.monthKey === month);
        const od = countOverdue(u);
        const locLocked = currentLang === 'en' ? 'Locked' : 'Bị khóa';
        const locDebt = currentLang === 'en' ? 'Debt' : 'Nợ';
        const locMonths = currentLang === 'en' ? 'months' : 'tháng';
        const locNoTx = currentLang === 'en' ? 'No transactions' : 'Chưa phát sinh';
        const locPaid = currentLang === 'en' ? 'Paid' : 'Đã TT';
        const locUnpaid = currentLang === 'en' ? 'Unpaid' : 'Chưa TT';
        const locTimes = currentLang === 'en' ? 'times' : 'lần';

        const lockBadge = u.locked ? `<span class="badge badge-locked">🔒 ${locLocked}</span>` : od > 0 ? `<span class="badge badge-warn">⚠ ${locDebt} ${od} ${locMonths}</span>` : '';
        const billHtml = !mb ? `<span class="badge badge-none">${locNoTx}</span>` : mb.paid
            ? `<span class="badge badge-paid">✔ ${locPaid} · ${mb.sessionCount} ${locTimes} · ${fmtVND(mb.amount)}</span>`
            : `<span class="badge badge-unpaid">✖ ${locUnpaid} · ${mb.sessionCount} ${locTimes} · ${fmtVND(mb.amount)}</span>`;
        return `<tr class="bill-row-clickable" onclick="adminViewUser('${u.username}')">
          <td>${u.username} ${lockBadge}</td><td>${u.name}</td><td>${translateRole(u.role)}</td>
          <td><span class="plate-val">${u.plate}</span></td><td>${billHtml}</td>
          <td onclick="event.stopPropagation()">
            ${u.locked ? `<button class="btn btn-success-sm" onclick="adminUnlock('${u.username}')">🔓 ${currentLang === 'en' ? 'Unlock' : 'Mở khóa'}</button>` : `<button class="btn btn-danger-outline" style="padding:4px 8px;font-size:0.75rem;" onclick="adminLock('${u.username}')">🔒 ${currentLang === 'en' ? 'Lock' : 'Khóa'}</button>`}
            <button class="btn btn-remove" onclick="adminRemoveUser('${u.username}')">${currentLang === 'en' ? 'Delete' : 'Xoá'}</button>
          </td></tr>`;
    }).join('');
}

function adminUnlock(uname) {
    const msgConfirm = currentLang === 'en' ? `Unlock account "${uname}"?\nConfirm that the user has resolved their debt.` : `Mở khóa tài khoản "${uname}"?\nXác nhận người dùng đã giải quyết nợ trực tiếp.`;
    if (!confirm(msgConfirm)) return;
    const users = loadDB();
    const u = users.find(x => x.username === uname);
    if (!u) { alert(currentLang === 'en' ? 'Account not found.' : 'Không tìm thấy tài khoản.'); return; }
    u.locked = false;
    u.adminUnlocked = true; // Flag to prevent auto-relock
    saveDB(users);
    adminRenderUsers();   // refresh table immediately
    showAdminToast(currentLang === 'en' ? `✅ Unlocked account "${uname}" successfully!` : `✅ Đã mở khóa tài khoản "${uname}" thành công!`);
}

function adminLock(uname) {
    const msgConfirm = currentLang === 'en' ? `Lock account "${uname}"?\nUser will not be able to use the parking until unlocked.` : `Khóa tài khoản "${uname}"?\nNgười dùng sẽ không thể sử dụng bãi xe cho đến khi được mở khóa.`;
    if (!confirm(msgConfirm)) return;
    const users = loadDB();
    const u = users.find(x => x.username === uname);
    if (!u) { alert(currentLang === 'en' ? 'Account not found.' : 'Không tìm thấy tài khoản.'); return; }
    u.locked = true;
    u.adminUnlocked = false; // Reset the manual unlock flag
    saveDB(users);
    adminRenderUsers();
    showAdminToast(currentLang === 'en' ? `🔒 Locked account "${uname}" successfully!` : `🔒 Đã khóa tài khoản "${uname}" thành công!`);
}
function showAdminToast(msg) {
    // Reuse success-toast
    setEl('toast-title', 'Admin thông báo');
    setEl('toast-msg', msg);
    const t = document.getElementById('success-toast');
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 4000);
}

function adminViewUser(uname) {
    const u = findUser(uname); if (!u) return;
    document.getElementById('aum-name').textContent = u.name;
    document.getElementById('aum-dob').textContent = u.dob || '—';
    document.getElementById('aum-role').textContent = u.role === 'Student' ? 'Sinh viên' : 'Nhân viên';
    document.getElementById('aum-plate').textContent = u.plate;
    document.getElementById('aum-status').textContent = u.locked ? '🔒 Bị khóa' : '✅ Hoạt động';
    document.getElementById('aum-status').className = u.locked ? 'badge badge-locked' : 'badge badge-paid';
    const od = countOverdue(u);
    document.getElementById('aum-overdue').textContent = od > 0 ? `${od} tháng chưa thanh toán` : 'Không có nợ';
    document.getElementById('aum-overdue').style.color = od > 0 ? '#dc2626' : '#16a34a';
    // 12-month history
    const tbody = document.getElementById('aum-history-tbody');
    const now = new Date();
    const rows = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = getYM(d);
        const bill = u.bills.find(b => b.monthKey === key);
        if (!bill) return `<tr><td>${monthLabel(key)}</td><td colspan="4" class="tc" style="color:#94a3b8">Không có dữ liệu</td></tr>`;
        const penHtml = bill.penalty > 0 ? `<br><small style="color:#dc2626">+${fmtVND(bill.penalty)} phạt trễ</small>` : '';
        return `<tr>
            <td>${monthLabel(key)}</td>
            <td class="tc">${bill.sessionCount} lần</td>
            <td class="tc">${fmtVND(bill.amount)}${penHtml}</td>
            <td>${bill.paidAt || '—'}</td>
            <td>${bill.paid ? '<span class="badge badge-paid">✔ Đã TT</span>' : '<span class="badge badge-unpaid">✖ Chưa TT</span>'}</td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
    document.getElementById('admin-user-modal').classList.remove('hidden');
}
function closeAdminUserModal() { document.getElementById('admin-user-modal').classList.add('hidden'); }

function adminCreateUser(e) {
    e.preventDefault();
    const msgEl = document.getElementById('create-user-msg');
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const name = document.getElementById('new-name').value.trim();
    const dob = document.getElementById('new-dob').value;
    const role = document.getElementById('new-role').value;
    const plate = document.getElementById('new-plate').value.trim();
    if (username.toLowerCase() === ADMIN_USER) { showCreateMsg(msgEl, 'error', '❌ Username "admin" là tên dành riêng.'); return; }
    if (findUser(username)) { showCreateMsg(msgEl, 'error', `❌ Username "${username}" đã tồn tại.`); return; }
    const users = loadDB(); users.push({ username, password, name, dob, role, plate, locked: false, bills: [] }); saveDB(users);
    showCreateMsg(msgEl, 'success', `✅ Tài khoản "${username}" đã tạo thành công!`);
    document.getElementById('create-user-form').reset(); adminRenderUsers();
}
function adminRemoveUser(uname) { if (!confirm(`Xoá tài khoản "${uname}"?`)) return; saveDB(loadDB().filter(u => u.username !== uname)); adminRenderUsers(); }
function showCreateMsg(el, type, text) { el.className = `create-msg ${type}`; el.textContent = text; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 4000); }

// ── STUDENT TAB SWITCHING ──
function studentSwitchTab(tab) {
    // Toggle sidebar active
    document.querySelectorAll('#dashboard-view .sidebar-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    // Toggle tab content
    document.querySelectorAll('#dashboard-view .admin-tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === 'tab-' + tab);
    });
    // Update topbar title
    const titles = {
        'stu-dashboard': currentLang === 'en' ? 'Dashboard' : 'Bảng điều khiển',
        'stu-profile': currentLang === 'en' ? 'Personal Profile' : 'Profile cá nhân',
        'stu-parking-history': currentLang === 'en' ? 'Parking History' : 'Lịch sử đỗ xe',
        'stu-payment': currentLang === 'en' ? 'Payment History' : 'Lịch sử thanh toán'
    };
    setEl('stu-topbar-title', titles[tab] || tab);
    // Tab-specific renders
    if (tab === 'stu-parking-history' && currentUser) renderStuParkingHistory();
    if (tab === 'stu-profile' && currentUser) {
        renderNotifications();
        renderChatMessages('chat-messages');
    }
    if (tab === 'stu-payment' && currentUser) {
        renderCurrentMonthBill(currentUser);
        renderOverdueBills(currentUser);
        renderUserBillHistory(currentUser.bills);
    }
}

// ── USER DASHBOARD ──
function populateUserDashboard(user) {
    const fresh = findUser(user.username); if (fresh) Object.assign(currentUser, fresh);
    setEl('dash-user-name', currentUser.name); setEl('dash-user-role', translateRole(currentUser.role));
    const ini = currentUser.name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
    setEl('user-avatar-initials', ini);
    setEl('info-name', currentUser.name); setEl('info-role', translateRole(currentUser.role));
    setEl('info-id', currentUser.username); setEl('info-plate', currentUser.plate);

    // Profile tab
    setEl('stu-profile-avatar', ini);
    setEl('stu-profile-name', currentUser.name);
    setEl('stu-profile-role', translateRole(currentUser.role));
    setEl('profile-student-id', currentUser.username);
    setEl('profile-email', currentUser.email || (currentUser.username + '@hcmut.edu.vn'));
    setEl('profile-phone', currentUser.phone || '0123456789');
    // Parking info
    setEl('profile-reg-cert', '66 - 000' + currentUser.username.slice(-3));
    setEl('profile-reg-bike', currentUser.plate);
    const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + 1);
    setEl('profile-account-due', `${String(dueDate.getDate()).padStart(2, '0')}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${dueDate.getFullYear()}`);
    // Stats
    const allSessions = currentUser.bills.flatMap(b => b.sessions || []);
    const totalUse = allSessions.length;
    setEl('profile-total-use', totalUse);
    const totalMinutes = totalUse * (3 * 60 + Math.floor(Math.random() * 40));
    const totalH = Math.floor(totalMinutes / 60);
    const totalM = totalMinutes % 60;
    setEl('profile-total-time', `${totalH}h ${totalM}m`);
    const avgMin = totalUse ? Math.floor(totalMinutes / totalUse) : 0;
    setEl('profile-avg-duration', totalUse ? `${Math.floor(avgMin / 60)}h ${avgMin % 60}m` : '—');
    if (allSessions.length) {
        const last = allSessions.sort((a, b) => b.date.localeCompare(a.date))[0];
        setEl('profile-last-parking', `${last.checkIn} — ${last.date}`);
    }

    // Topbar
    setEl('stu-topbar-avatar', ini);
    setEl('stu-topbar-name', currentUser.name);
    setEl('stu-topbar-role', translateRole(currentUser.role));
    const firstName = currentUser.name.split(' ').pop();
    setEl('stu-topbar-greeting', (currentLang === 'en' ? 'Hello, ' : 'Xin chào, ') + firstName + ' 👋');

    // Dashboard tab: plate, entry time, date
    setEl('stu-plate-display', currentUser.plate);
    const now = new Date();
    const entryH = 7 + Math.floor(Math.random() * 3);
    const entryM = Math.floor(Math.random() * 60);
    setEl('stu-entry-time', `${String(entryH).padStart(2, '0')}:${String(entryM).padStart(2, '0')}`);
    const locale = currentLang === 'en' ? 'en-US' : 'vi-VN';
    setEl('stu-date-display', now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    // Open/Closed check
    const hour = now.getHours();
    const isOpen = hour >= 6 && hour < 22;
    const statusEl = document.getElementById('stu-open-status');
    if (statusEl) {
        statusEl.className = isOpen ? 'stu-status-open' : 'stu-status-closed';
        statusEl.textContent = isOpen
            ? (currentLang === 'en' ? 'Currently: Open \u2705' : 'Hi\u1EC7n t\u1EA1i: \u0110ang m\u1EDF c\u1EEDa \u2705')
            : (currentLang === 'en' ? 'Currently: Closed \u274C' : 'Hi\u1EC7n t\u1EA1i: \u0110\u00E3 \u0111\u00F3ng c\u1EEDa \u274C');
    }

    renderCurrentMonthBill(currentUser); renderOverdueBills(currentUser); renderUserBillHistory(currentUser.bills);
    // Update notification badge
    const unpaidCount = currentUser.bills.filter(b => !b.paid).length;
    const badge = document.getElementById('user-notif-badge');
    if (badge) { badge.textContent = unpaidCount; badge.classList.toggle('hidden', unpaidCount === 0); }
    // Reset to dashboard tab
    studentSwitchTab('stu-dashboard');
}

function renderStuParkingHistory() {
    if (!currentUser) return;
    const tbody = document.getElementById('stu-parking-history-tbody');
    if (!tbody) return;
    // Flatten all sessions from all bills
    const sessions = [];
    currentUser.bills.forEach(b => {
        if (b.sessions) {
            b.sessions.forEach(s => sessions.push(s));
        }
    });
    // Sort newest first
    sessions.sort((a, b) => b.date.localeCompare(a.date));
    if (!sessions.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-td">Kh\u00F4ng c\u00F3 d\u1EEF li\u1EC7u.</td></tr>';
        return;
    }
    tbody.innerHTML = sessions.map((s, i) => `
        <tr>
            <td class="tc">${i + 1}</td>
            <td>${s.date}</td>
            <td>${s.checkIn}</td>
            <td>${s.checkOut}</td>
        </tr>
    `).join('');
}

function renderCurrentMonthBill(user) {
    const bill = getOrCreateMonthBill(user), key = curKey();
    const mlEl = document.getElementById('bill-month-label'); if (mlEl) mlEl.textContent = monthLabel(key);
    setEl('bill-session-count', `${bill.sessionCount} lần gửi`); setEl('bill-amount', fmtVND(bill.totalDue || bill.amount));
    const badge = document.getElementById('bill-status-badge'), btn = document.getElementById('btn-pay-now');
    if (bill.paid) {
        if (badge) { badge.className = 'badge badge-paid'; badge.textContent = '✔ Đã thanh toán'; }
        if (btn) { btn.disabled = true; btn.textContent = '✔ Đã thanh toán'; btn.classList.add('btn-paid-done'); }
        setEl('bill-paid-at', bill.paidAt ? `Thanh toán ngày: ${bill.paidAt}` : '');
    } else {
        if (badge) { badge.className = 'badge badge-pending'; badge.textContent = '⏳ Chưa thanh toán'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Thanh toán tháng này (BKPay)'; btn.classList.remove('btn-paid-done'); }
        setEl('bill-paid-at', '');
    }
}

function renderOverdueBills(user) {
    const ck = curKey();
    // Show ALL unpaid previous months so user can pay before or after penalty
    const overdue = user.bills.filter(b => b.monthKey !== ck && !b.paid)
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const section = document.getElementById('overdue-section');
    if (!section) return;
    if (!overdue.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    // Re-apply penalty amounts in case they changed
    applyPenalties(user);
    const tbody = document.getElementById('overdue-tbody');
    const totalOverdueMonths = overdue.filter(b => isPastGrace(b.monthKey)).length;
    setEl('overdue-count', `${overdue.length} tháng chưa TT${totalOverdueMonths > 0 ? ' (' + totalOverdueMonths + ' tháng nợ phạt)' : ''}`);
    tbody.innerHTML = overdue.map(b => {
        const pastGrace = isPastGrace(b.monthKey);
        const penaltyNote = pastGrace
            ? `<span style="color:#dc2626;font-size:.75rem;display:block">⚠ Trễ hạn — +10.000đ</span>`
            : `<span style="color:#16a34a;font-size:.75rem;display:block">Còn trong hạn</span>`;
        return `<tr>
          <td>${monthLabel(b.monthKey)}${penaltyNote}</td>
          <td class="tc">${fmtVND(b.amount)}</td>
          <td class="tc" style="color:#dc2626;font-weight:700">${b.penalty ? fmtVND(b.penalty) : '—'}</td>
          <td class="tc" style="color:#1e40af;font-weight:800">${fmtVND(b.totalDue || b.amount)}</td>
          <td><button class="btn btn-warning-sm" onclick="payOverdue('${b.monthKey}')">Thanh toán</button></td>
        </tr>`;
    }).join('');
    const total = overdue.reduce((s, b) => s + (b.totalDue || b.amount), 0);
    setEl('overdue-total', fmtVND(total));
}

function payOverdue(monthKey) {
    if (!currentUser) return;
    if (!confirm(`Thanh toán hoá đơn ${monthLabel(monthKey)}?`)) return;
    const users = loadDB(), dbU = users.find(u => u.username === currentUser.username);
    if (!dbU) return;
    const bill = dbU.bills.find(b => b.monthKey === monthKey);
    if (!bill || bill.paid) return;
    bill.paid = true; bill.paidAt = new Date().toLocaleDateString('vi-VN');
    // re-check lock and clear adminUnlocked if debt is cleared
    if (countOverdue(dbU) < 3) {
        dbU.locked = false;
        delete dbU.adminUnlocked;
    }
    saveDB(users); Object.assign(currentUser, dbU);
    renderCurrentMonthBill(currentUser); renderOverdueBills(currentUser); renderUserBillHistory(currentUser.bills);
    showToast('✅ Đã thanh toán!', `Hoá đơn ${monthLabel(monthKey)} đã được thanh toán.`);
}

function renderUserBillHistory(bills) {
    const tbody = document.getElementById('history-tbody');
    if (!bills || !bills.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-td">Chưa có lịch sử.</td></tr>'; return; }
    const sorted = bills.slice().sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    tbody.innerHTML = sorted.map(b => `
        <tr class="bill-row-clickable" onclick="openBillDetail('${b.monthKey}')">
          <td>${monthLabel(b.monthKey)}</td>
          <td class="tc">${b.sessionCount} lần</td>
          <td class="tc">${fmtVND(b.amount)}${b.penalty ? `<br><small style="color:#dc2626">+${fmtVND(b.penalty)} phạt</small>` : ''}</td>
          <td>${b.paidAt || '—'}</td>
          <td>${b.paid ? '<span class="badge badge-paid">✔ Đã TT</span>' : '<span class="badge badge-unpaid">✖ Chưa TT</span>'}</td>
        </tr>`).join('');
}

// ── BILL DETAIL MODAL ──
function openBillDetail(monthKey) {
    const user = findUser(currentUser.username); const bill = user.bills.find(b => b.monthKey === monthKey); if (!bill) return;
    setEl('detail-month-title', monthLabel(monthKey));
    setEl('detail-session-count', bill.sessionCount);
    setEl('detail-total-amount', fmtVND(bill.totalDue || bill.amount));
    setEl('detail-status', bill.paid ? '✔ Đã thanh toán' : '✖ Chưa thanh toán');
    const se = document.getElementById('detail-status'); if (se) se.className = bill.paid ? 'badge badge-paid' : 'badge badge-unpaid';
    const tbody = document.getElementById('detail-sessions-tbody');
    if (!bill.sessions || !bill.sessions.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-td">Chưa có phiên nào.</td></tr>'; }
    else { tbody.innerHTML = bill.sessions.map((s, i) => `<tr><td>${i + 1}</td><td>${s.date}</td><td>${s.checkIn} → ${s.checkOut}</td></tr>`).join(''); }
    document.getElementById('bill-detail-modal').classList.remove('hidden');
}
function closeBillDetail() { document.getElementById('bill-detail-modal').classList.add('hidden'); }

// ── PAYMENT ──
function handlePayment() {
    if (!currentUser) return;
    const key = curKey(), users = loadDB(), dbU = users.find(u => u.username === currentUser.username);
    if (!dbU) return; const bill = dbU.bills.find(b => b.monthKey === key); if (!bill || bill.paid) return;
    bill.paid = true; bill.paidAt = new Date().toLocaleDateString('vi-VN'); saveDB(users);
    Object.assign(currentUser, dbU); renderCurrentMonthBill(currentUser); renderOverdueBills(currentUser); renderUserBillHistory(currentUser.bills);
    showToast('✅ Thanh toán thành công!', 'Hoá đơn tháng này đã được thanh toán qua BKPay.');
}

function showToast(title, msg) {
    setEl('toast-title', title); setEl('toast-msg', msg);
    const t = document.getElementById('success-toast'); t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 4500);
}

// ══════════════════════════════════════
// ADMIN SIDEBAR & TAB NAVIGATION
// ══════════════════════════════════════

function getTabTitles() {
    if (currentLang === 'en') return { dashboard: 'Dashboard', realtime: 'Real-time Management', monitoring: 'Monitoring', history: 'Parking History', 'admin-chat': 'Chat with Users' };
    return { dashboard: 'Bảng điều khiển', realtime: 'Quản lý thời gian thực', monitoring: 'Giám sát', history: 'Lịch sử đỗ xe', 'admin-chat': 'Chat với Users' };
}
function translateRole(role) {
    if (currentLang === 'en') return role;
    return role === 'Student' ? 'Sinh viên' : role === 'Staff' ? 'Nhân viên' : role === 'Guest' ? 'Khách vãng lai' : role;
}

function adminSwitchTab(tab) {
    // Hide all tabs
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    // Show selected
    const tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.classList.add('active');
    const btnEl = document.querySelector(`.sidebar-item[data-tab="${tab}"]`);
    if (btnEl) btnEl.classList.add('active');
    // Update topbar title
    const titles = getTabTitles();
    setEl('topbar-page-title', titles[tab] || tab);
    // Tab-specific init
    if (tab === 'monitoring') renderMonitoringTab();
    if (tab === 'history') renderParkingHistory();
    if (tab === 'dashboard') renderDashboardCharts();
    if (tab === 'realtime') adminRenderUsers();
    if (tab === 'admin-chat') renderChatMessages('admin-chat-messages');
}

function refreshAdminData() {
    const activeBtn = document.querySelector('.sidebar-item.active');
    const tab = activeBtn ? activeBtn.getAttribute('data-tab') : 'dashboard';
    adminSwitchTab(tab);
    updateDashboardStats();
    showAdminToast(currentLang === 'en' ? '🔄 Data synced successfully!' : '🔄 Đã đồng bộ dữ liệu mới nhất!');
}

// ── DASHBOARD stat cards update ──
function updateDashboardStats() {
    const users = loadDB();
    const totalOverdue = users.filter(u => countOverdue(u) > 0).length;
    setEl('sc-free', freeSlots);
    setEl('sc-occ', MAX_SLOTS - freeSlots);
    setEl('sc-users', users.length);
    setEl('sc-overdue', totalOverdue);
    // Set date
    const now = new Date();
    const locale = currentLang === 'en' ? 'en-US' : 'vi-VN';
    setEl('sc-date-now', now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    // Update admin notification badge
    const badge = document.getElementById('admin-notif-badge');
    if (badge) { badge.textContent = totalOverdue; badge.classList.toggle('hidden', totalOverdue === 0); }
}

// ── CHARTS (Chart.js via CDN) ──
let chartTemp = null, chartHumi = null, chartHourly = null;

function makeTimeLabels() {
    const labels = [];
    for (let h = 14; h <= 17; h++) {
        for (let m = 0; m < 60; m += 20) {
            labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    }
    return labels.slice(0, 10);
}

function randArr(len, base, range) {
    return Array.from({ length: len }, () => +(base + (Math.random() - 0.5) * range).toFixed(1));
}

function renderDashboardCharts() {
    if (typeof Chart === 'undefined') return;
    const labels = makeTimeLabels();
    const tempData = randArr(labels.length, 31, 8);
    const humiData = randArr(labels.length, 65, 20);
    const chartStyle = {
        borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.08)',
        tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#2563eb'
    };
    // Temp chart
    const ctxT = document.getElementById('chart-temp');
    if (ctxT) {
        if (chartTemp) chartTemp.destroy();
        chartTemp = new Chart(ctxT, {
            type: 'line',
            data: { labels, datasets: [{ ...chartStyle, label: '°C', data: tempData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.07)', pointBackgroundColor: '#ef4444' }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 24, max: 38, grid: { color: 'rgba(0,0,0,.05)' } }, x: { grid: { display: false } } } }
        });
    }
    // Humi chart
    const ctxH = document.getElementById('chart-humi');
    if (ctxH) {
        if (chartHumi) chartHumi.destroy();
        chartHumi = new Chart(ctxH, {
            type: 'line',
            data: { labels, datasets: [{ ...chartStyle, label: '%', data: humiData }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 45, max: 80, grid: { color: 'rgba(0,0,0,.05)' } }, x: { grid: { display: false } } } }
        });
    }
}

// ── MONITORING TAB — DEVICE CONTROL ──
const LIGHTS = [
    { id: 'light-1', name: 'Light A1', active: true, note: 'Không' },
    { id: 'light-2', name: 'Light A2', active: true, note: 'Không' },
    { id: 'light-3', name: 'Light A3', active: true, note: 'Không' },
    { id: 'light-4', name: 'Light A4', active: true, note: 'Không' },
    { id: 'light-5', name: 'Light A5', active: true, note: 'Không' },
    { id: 'light-6', name: 'Light B1', active: true, note: 'Không' },
    { id: 'light-7', name: 'Light B2', active: true, note: 'Không' },
    { id: 'light-8', name: 'Light B3', active: true, note: 'Không' },
    { id: 'light-9', name: 'Light B4', active: true, note: 'Không' },
    { id: 'light-10', name: 'Light B5', active: true, note: 'Không' }
];
const VENTS = [
    { id: 'vent-1', name: 'Ven 1', active: true, note: 'Không' },
    { id: 'vent-2', name: 'Ven 2', active: true, note: 'Không' },
    { id: 'vent-3', name: 'Ven 3', active: true, note: 'Không' },
    { id: 'vent-4', name: 'Ven 4', active: true, note: 'Không' },
    { id: 'vent-5', name: 'Ven 5', active: true, note: 'Không' }
];

function renderDeviceCard(device, type) {
    const icon = type === 'light'
        ? `<svg class="device-icon" viewBox="0 0 64 64" fill="none"><path d="M32 6a18 18 0 0 1 10 33v5a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4v-5A18 18 0 0 1 32 6z" fill="${device.active ? '#222' : '#bbb'}" /><rect x="24" y="50" width="16" height="4" rx="2" fill="${device.active ? '#222' : '#ccc'}"/><line x1="32" y1="50" x2="32" y2="58" stroke="${device.active ? '#222' : '#ccc'}" stroke-width="2"/><path d="M28 39h8" stroke="#fff" stroke-width="1.5"/></svg>`
        : `<svg class="device-icon" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="26" stroke="${device.active ? '#222' : '#bbb'}" stroke-width="2" fill="none"/><path d="M32 8 L36 28 L32 32 L28 28 Z" fill="${device.active ? '#222' : '#ccc'}"/><path d="M32 56 L28 36 L32 32 L36 36 Z" fill="${device.active ? '#222' : '#ccc'}"/><path d="M8 32 L28 28 L32 32 L28 36 Z" fill="${device.active ? '#222' : '#ccc'}"/><path d="M56 32 L36 36 L32 32 L36 28 Z" fill="${device.active ? '#222' : '#ccc'}"/></svg>`;

    const statusText = device.active
        ? (currentLang === 'en' ? 'Active' : 'Hoạt động')
        : (currentLang === 'en' ? 'Stopped' : 'Đã tắt');
    const btnText = device.active
        ? (currentLang === 'en' ? 'Stop' : 'Tắt')
        : (currentLang === 'en' ? 'Start' : 'Bật');
    const nameLabel = currentLang === 'en' ? 'Name:' : 'Tên:';
    const statusLabel = currentLang === 'en' ? 'Status:' : 'Trạng thái:';
    const noteLabel = currentLang === 'en' ? 'Note:' : 'Ghi chú:';
    const noteVal = currentLang === 'en' ? (device.note === 'Không' ? 'None' : device.note) : device.note;

    return `<div class="device-card ${device.active ? '' : 'device-off'}" id="${device.id}">
        ${icon}
        <div class="device-info">
            <div class="device-row"><span class="device-label">${nameLabel}</span><span class="device-val">${device.name}</span></div>
            <div class="device-row"><span class="device-label">${statusLabel}</span><span class="device-status ${device.active ? 'status-active' : 'status-off'}">${statusText}</span></div>
            <div class="device-row"><span class="device-label">${noteLabel}</span><span class="device-val">${noteVal}</span></div>
        </div>
        <button class="btn-device ${device.active ? 'btn-device-stop' : 'btn-device-start'}" onclick="toggleDevice('${type}','${device.id}')">${btnText}</button>
    </div>`;
}

function renderMonitoringTab() {
    const lightGrid = document.getElementById('light-grid');
    const ventGrid = document.getElementById('vent-grid');
    if (lightGrid) lightGrid.innerHTML = LIGHTS.map(d => renderDeviceCard(d, 'light')).join('');
    if (ventGrid) ventGrid.innerHTML = VENTS.map(d => renderDeviceCard(d, 'vent')).join('');
    updateDashboardDeviceStatus();
}

function toggleDevice(type, id) {
    const list = type === 'light' ? LIGHTS : VENTS;
    const device = list.find(d => d.id === id);
    if (device) {
        device.active = !device.active;
        renderMonitoringTab();
        setLang(currentLang); // re-apply translations
    }
}

function toggleAllDevices(type) {
    const list = type === 'light' ? LIGHTS : VENTS;
    const anyOn = list.some(d => d.active);
    const newState = !anyOn; // If any is on, turn all off. Else turn all on.
    list.forEach(d => d.active = newState);
    renderMonitoringTab();
    setLang(currentLang);
}

function updateDashboardDeviceStatus() {
    const allLightsOK = LIGHTS.every(d => d.active);
    const el = document.getElementById('sc-light-status');
    if (el) el.textContent = allLightsOK ? 'OK' : (currentLang === 'en' ? 'Warning' : 'Cảnh báo');
}

// ── PARKING HISTORY TAB ──
let currentHistoryPage = 1;
const HISTORY_PER_PAGE = 10;

function changeHistoryPage(dir) {
    currentHistoryPage += dir;
    renderParkingHistory(false);
}
function renderParkingHistory() {
    const users = loadDB();
    const filter = document.getElementById('hist-filter')?.value || 'all';
    const curMon = curKey();
    const mlEl = document.getElementById('hist-month-label');
    if (mlEl) mlEl.textContent = monthLabel(curMon);
    // Flatten all bills across all users
    const rows = [];
    users.forEach(u => {
        u.bills.forEach(b => {
            rows.push({ user: u, bill: b });
        });
    });

    // Add Guests (Khách vãng lai)
    const guests = [
        { name: 'Nguyễn Văn A', username: 'K1', sessions: 1 },
        { name: 'Nguyễn Văn B', username: 'K2', sessions: 3 },
        { name: 'Nguyễn Văn C', username: 'K3', sessions: 2 },
        { name: 'Nguyễn Văn D', username: 'K4', sessions: 5 },
        { name: 'Nguyễn Văn E', username: 'K5', sessions: 4 }
    ];
    guests.forEach((g, i) => {
        rows.push({
            user: { username: g.username, name: g.name, role: 'Guest' },
            bill: { monthKey: curMon, sessionCount: g.sessions, amount: g.sessions * GUEST_RATE, paid: true }
        });
    });

    // Shuffle rows first to scatter same-month data
    for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    // Sort: newest first
    rows.sort((a, b) => b.bill.monthKey.localeCompare(a.bill.monthKey));
    // Filter
    const filtered = rows.filter(r => {
        if (filter === 'paid') return r.bill.paid;
        if (filter === 'unpaid') return !r.bill.paid;
        return true;
    });
    if (arguments[0] === true) currentHistoryPage = 1; // reset page when filter changes

    const tbody = document.getElementById('hist-tbody');
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-td">Không có dữ liệu.</td></tr>';
        setEl('hist-page-info', 'Trang 1 / 1');
        const pBtn = document.getElementById('hist-btn-prev'), nBtn = document.getElementById('hist-btn-next');
        if (pBtn) pBtn.disabled = true;
        if (nBtn) nBtn.disabled = true;
    } else {
        const totalPages = Math.ceil(filtered.length / HISTORY_PER_PAGE) || 1;
        if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
        const startIdx = (currentHistoryPage - 1) * HISTORY_PER_PAGE;
        const paginated = filtered.slice(startIdx, startIdx + HISTORY_PER_PAGE);

        tbody.innerHTML = paginated.map(({ user: u, bill: b }, idx) => `
      <tr>
        <td class="tc">${startIdx + idx + 1}</td>
        <td>${u.username}</td>
        <td>${u.name}</td>
        <td>${monthLabel(b.monthKey)}</td>
        <td class="tc">${b.sessionCount} ${currentLang === 'en' ? 'times' : 'lần'}</td>
        <td class="tc">${fmtVND(b.amount)}${b.penalty ? `<br><small style="color:#dc2626">+${fmtVND(b.penalty)} ${currentLang === 'en' ? 'penalty' : 'phạt'}</small>` : ''}</td>
        <td>${b.paid ? `<span class="badge badge-paid">✔ ${currentLang === 'en' ? 'Paid' : 'Đã TT'}</span>` : `<span class="badge badge-unpaid">✖ ${currentLang === 'en' ? 'Unpaid' : 'Chưa TT'}</span>`}</td>
      </tr>`).join('');

        setEl('hist-page-info', `${currentLang === 'en' ? 'Page' : 'Trang'} ${currentHistoryPage} / ${totalPages}`);
        const pBtn = document.getElementById('hist-btn-prev'), nBtn = document.getElementById('hist-btn-next');
        if (pBtn) pBtn.disabled = currentHistoryPage === 1;
        if (nBtn) nBtn.disabled = currentHistoryPage === totalPages;
    }
    // Summary stats
    const totalSessions = rows.reduce((s, r) => s + r.bill.sessionCount, 0);
    const totalPaid = rows.filter(r => r.bill.paid).reduce((s, r) => s + r.bill.amount, 0);
    const totalUnpaid = rows.filter(r => !r.bill.paid).reduce((s, r) => s + (r.bill.totalDue || r.bill.amount), 0);
    setEl('hist-total-sessions', totalSessions + ' lần');
    setEl('hist-total-paid', fmtVND(totalPaid));
    setEl('hist-total-unpaid', fmtVND(totalUnpaid));
}

// ── LOAD CHART.JS AND INIT ADMIN ──
function loadChartJS(callback) {
    if (typeof Chart !== 'undefined') { callback(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    s.onload = callback;
    document.head.appendChild(s);
}

// Override the original showView for admin to init sidebar
const _origHandleLogin = handleLogin;
// Patch admin init into the existing handleLogin flow via adminInitSidebar
function adminInitSidebar() {
    adminSwitchTab('dashboard');
    updateDashboardStats();
    loadChartJS(() => {
        renderDashboardCharts();
    });
}

// ══════════════════════════════════════
// LANGUAGE SWITCHER (i18n)
// ══════════════════════════════════════

let currentLang = localStorage.getItem('sps_lang') || 'vi';

const I18N = {
    vi: {
        loginBtn: 'Đăng nhập',
        logoText: 'Bãi Đỗ Xe Thông Minh',
        heroTitle: 'Hệ thống Bãi Đỗ Xe Thông Minh HCMUT',
        heroDesc: 'Quản lý bãi xe tự động với nhận diện biển số AI, giám sát slot thời gian thực và thanh toán không dùng tiền mặt qua BKPay.',
        heroStart: 'Bắt đầu →',
        statSlots: 'Tổng slot',
        statMonitor: 'Giám sát',
        statAI: 'Nhận diện',
        loginSubtitle: 'Đăng nhập bằng tài khoản trường',
        labelUsername: 'Tên đăng nhập / MSSV',
        labelPassword: 'Mật khẩu',
        placeholderUsername: 'vd. 2210001 hoặc admin',
        placeholderPassword: 'Nhập mật khẩu',
        loginError: 'Lỗi đăng nhập.',
        loginSubmit: 'Đăng nhập',
        loginCancel: 'Huỷ',
        // Admin sidebar
        sidebarDashboard: 'Bảng điều khiển',
        sidebarRealtime: 'Quản lý thời gian thực',
        sidebarMonitoring: 'Giám sát',
        sidebarHistory: 'Lịch sử đỗ xe',
        logout: 'Đăng xuất',
        // Admin topbar
        topbarGreeting: 'Xin chào, Admin 👋',
        adminRole: 'Quản trị viên',
        // Stat cards
        freeSlots: 'Slot trống',
        occupied: 'Đang chiếm',
        users: 'Người dùng',
        unpaidDebt: 'Nợ chưa TT',
        // Dashboard charts
        tempLog: 'Nhật ký nhiệt độ',
        humiLog: 'Nhật ký độ ẩm',
        // Status cards
        currentShift: 'Ca trực hiện tại',
        weather: 'Thời tiết',
        humidity: 'Độ ẩm',
        lighting: 'Đèn chiếu sáng',
        // User dashboard
        parkingStatus: 'Tình trạng chỗ đỗ xe',
        available: 'Còn trống',
        total: 'Tổng cộng',
        ownerInfo: 'Thông tin chủ xe',
        fullName: 'Họ tên',
        role: 'Vai trò',
        username: 'Tên đăng nhập',
        plate: 'Biển số xe',
        billing: 'Thanh toán & Hoá đơn',
        monthBill: 'Hoá đơn tháng này',
        // Devices
        ventToggle: 'Bật/tắt thông gió',
        lightToggle: 'Bật/tắt đèn',
        lightSystem: 'Hệ thống đèn chiếu sáng',
        ventSystem: 'Hệ thống thông gió',
        toggleAll: 'Bật/tắt tất cả',
        syncData: 'Đồng bộ',
        historyTabTitle: 'Lịch sử đỗ xe',
        prevPage: 'Trang trước',
        nextPage: 'Trang sau',
        action: 'Hành động',
        createAccountMsg: 'Tạo tài khoản mới',
        initPassword: 'Mật khẩu ban đầu',
        dob: 'Ngày sinh',
        createAccountBtn: 'Tạo tài khoản',
        student: 'Sinh viên',
        staff: 'Nhân viên',
        guest: 'Khách vãng lai',
        clickRowHint: '(nhấn dòng để xem chi tiết)',
        slotControl: 'Điều khiển Slot',
        freeSlotsTotal: 'slot trống / tổng 150',
        setFreeSlots: 'Đặt số slot trống (0–150)',
        updateBtn: 'Cập nhật',
        viewBoardBtn: 'Xem bảng',
        empty: 'Trống',
        occupiedLabel: 'Đang chiếm',
        printTempTicket: 'In vé tạm thời',
        stuProfile: 'Profile cá nhân',
        stuParkingHistory: 'Lịch sử đỗ xe',
        stuPayment: 'Lịch sử thanh toán',
        stuWeather: 'Thời tiết',
        stuHours: 'Giờ hoạt động',
        stuOpenTime: 'Mở cửa',
        stuCloseTime: 'Đóng cửa',
        stuCurrentlyOpen: 'Hiện tại: Đang mở cửa ✅',
        stuMyParking: 'Trạng thái xe của tôi',
        stuEntryTime: 'Giờ vào bãi',
        stuCurrentlyParked: '🏍 Xe đang trong bãi',
        stuDate: 'Ngày',
        stuCheckIn: 'Giờ vào',
        stuCheckOut: 'Giờ ra',
        stuStudentId: 'Mã số sinh viên',
        stuPhone: 'Số điện thoại',
        stuParkingInfo: 'Thông tin gửi xe',
        stuRegCert: 'Giấy đăng ký xe',
        stuRegBike: 'Biển số xe đã đăng ký',
        stuAccountDue: 'Hạn tài khoản',
        stuTotalTime: 'Tổng thời gian gửi xe (30 ngày)',
        stuTotalUse: 'Số lần gửi (30 ngày)',
        stuAvgDuration: 'Thời gian TB mỗi lần',
        stuLastParking: 'Lần gửi gần nhất',
        stuReporting: 'Báo cáo',
        stuReportDesc: 'Báo cáo sự cố hoặc lỗi hệ thống và theo dõi trạng thái báo cáo.',
        stuNewReport: 'Báo cáo mới',
        stuNoReport: 'Chưa có báo cáo nào',
        reportSelectCategory: 'Chọn loại vấn đề:',
        reportCat1: 'Vấn đề thanh toán',
        reportCat2: 'Vấn đề an ninh / Cơ sở vật chất',
        reportCat3: 'Vấn đề kỹ thuật / Thiết bị',
        reportCat4: 'Vấn đề thẻ / Tài khoản',
        reportCat5: 'Khác',
        reportDescLabel: 'Mô tả chi tiết vấn đề:',
        reportSubmit: 'Gửi báo cáo',
        reportSuccess: 'Đã gửi báo cáo thành công!',
        reportSuccessDesc: 'Chúng tôi sẽ phản hồi trong 24h.',
        stuNotifications: 'Thông báo',
        stuNoNotif: 'Không có thông báo mới',
        stuChat: 'Chat với Admin',
        stuSend: 'Gửi',
        sidebarChat: 'Chat',
        adminChatTitle: 'Chat với Users',
        qrModalTitle: 'Vé điện tử tạm thời',
        qrModalDesc: 'Sử dụng mã QR này để quét tại trạm kiểm soát khi ra vào bãi đỗ xe.',
        closeBtn: 'Đóng',
        downloadBtn: 'Tải xuống',
        // Misc
        sunny: 'Nắng',
        tempChartSub: 'Nhiệt độ ghi nhận (Đơn vị: °C)',
        humiChartSub: 'Độ ẩm ghi nhận (Đơn vị: %)'
    },
    en: {
        loginBtn: 'Login',
        logoText: 'Smart Parking',
        heroTitle: 'HCMUT Smart Parking System',
        heroDesc: 'Automated parking management with AI license plate recognition, real-time slot monitoring, and cashless payment via BKPay.',
        heroStart: 'Get Started →',
        statSlots: 'Total Slots',
        statMonitor: 'Monitoring',
        statAI: 'Recognition',
        loginSubtitle: 'Sign in with your university account',
        labelUsername: 'Username / Student ID',
        labelPassword: 'Password',
        placeholderUsername: 'e.g. 2210001 or admin',
        placeholderPassword: 'Enter password',
        loginError: 'Login failed.',
        loginSubmit: 'Sign In',
        loginCancel: 'Cancel',
        // Admin sidebar
        sidebarDashboard: 'Dashboard',
        sidebarRealtime: 'Real-time Management',
        sidebarMonitoring: 'Monitoring',
        sidebarHistory: 'Parking History',
        logout: 'Logout',
        // Admin topbar
        topbarGreeting: 'Hello, Admin 👋',
        adminRole: 'Administrator',
        // Stat cards
        freeSlots: 'Free Slots',
        occupied: 'Occupied',
        users: 'Users',
        unpaidDebt: 'Unpaid',
        // Dashboard charts
        tempLog: 'Temperature Log',
        humiLog: 'Humidity Log',
        // Status cards
        currentShift: 'Current Shift',
        weather: 'Weather',
        humidity: 'Humidity',
        lighting: 'Lighting',
        // User dashboard
        parkingStatus: 'Parking Slot Status',
        available: 'Available',
        total: 'Total',
        ownerInfo: 'Vehicle Owner Info',
        fullName: 'Full Name',
        role: 'Role',
        username: 'Username',
        plate: 'License Plate',
        billing: 'Billing & Invoices',
        monthBill: 'This Month\'s Invoice',
        // Devices
        ventToggle: 'Toggle Ventilation',
        lightToggle: 'Toggle Lights',
        lightSystem: 'Light System',
        ventSystem: 'Ventilation System',
        toggleAll: 'Toggle All',
        syncData: 'Sync Data',
        historyTabTitle: 'Parking History',
        prevPage: 'Previous',
        nextPage: 'Next',
        action: 'Action',
        createAccountMsg: 'Create New Account',
        initPassword: 'Initial Password',
        dob: 'Date of Birth',
        createAccountBtn: 'Create Account',
        student: 'Student',
        staff: 'Staff',
        guest: 'Guest',
        clickRowHint: '(click row to view details)',
        slotControl: 'Slot Control',
        freeSlotsTotal: 'free slots / total 150',
        setFreeSlots: 'Set free slots (0–150)',
        updateBtn: 'Update',
        viewBoardBtn: 'View Board',
        empty: 'Empty',
        occupiedLabel: 'Occupied',
        printTempTicket: 'Print temporary ticket',
        stuProfile: 'Personal Profile',
        stuParkingHistory: 'Parking History',
        stuPayment: 'Payment History',
        stuWeather: 'Weather',
        stuHours: 'Operating Hours',
        stuOpenTime: 'Opening',
        stuCloseTime: 'Closing',
        stuCurrentlyOpen: 'Currently: Open ✅',
        stuMyParking: 'My Vehicle Status',
        stuEntryTime: 'Entry Time',
        stuCurrentlyParked: '🏍 Currently Parked',
        stuDate: 'Date',
        stuCheckIn: 'Check In',
        stuCheckOut: 'Check Out',
        stuStudentId: 'Student ID',
        stuPhone: 'Phone number',
        stuParkingInfo: 'Parking information',
        stuRegCert: 'Registration Certificate',
        stuRegBike: 'Registered Bike',
        stuAccountDue: 'Account Due',
        stuTotalTime: 'Total parking time (30 days)',
        stuTotalUse: 'Total use (30 days)',
        stuAvgDuration: 'Average duration per time',
        stuLastParking: 'Last Parking',
        stuReporting: 'Reporting',
        stuReportDesc: 'Report lost items or system errors and track your report status.',
        stuNewReport: 'New Report',
        stuNoReport: 'No reports made yet',
        reportSelectCategory: 'Select issue type:',
        reportCat1: 'Payment issue',
        reportCat2: 'Security / Facility issue',
        reportCat3: 'Technical / Equipment issue',
        reportCat4: 'Card / Account issue',
        reportCat5: 'Other',
        reportDescLabel: 'Describe the issue in detail:',
        reportSubmit: 'Submit Report',
        reportSuccess: 'Report submitted successfully!',
        reportSuccessDesc: 'We will respond within 24 hours.',
        stuNotifications: 'Notifications',
        stuNoNotif: 'No new notifications',
        stuChat: 'Chat with Admin',
        stuSend: 'Send',
        sidebarChat: 'Chat',
        adminChatTitle: 'Chat with Users',
        qrModalTitle: 'Temporary E-Ticket',
        qrModalDesc: 'Use this QR code to scan at the gate when entering and exiting the parking lot.',
        closeBtn: 'Close',
        downloadBtn: 'Download',
        // Misc
        sunny: 'Sunny',
        tempChartSub: 'Recorded Temperature (Unit: °C)',
        humiChartSub: 'Recorded Humidity (Unit: %)'
    }
};

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('sps_lang', lang);
    document.documentElement.lang = lang;

    // Update button active state
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('lang-' + lang);
    if (activeBtn) activeBtn.classList.add('active');

    // Apply text translations
    const dict = I18N[lang] || I18N.vi;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = dict[key];
            } else {
                el.textContent = dict[key];
            }
        }
    });

    // Apply placeholder translations
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key] !== undefined) {
            el.placeholder = dict[key];
        }
    });

    // Refresh dynamic admin text if logged in as admin
    if (currentUser && currentUser.role === 'Admin') {
        updateDashboardStats();
    }
}

// ── POPUP USERS LIST ──
function showUserPopup(type) {
    const users = loadDB();
    const modal = document.getElementById('admin-users-list-modal');
    const tbody = document.getElementById('popup-users-tbody');
    const title = document.getElementById('popup-users-title');
    const thead3 = document.getElementById('popup-col-3');

    let list = [];
    if (type === 'overdue') {
        list = users.filter(u => countOverdue(u) > 0);
        title.textContent = currentLang === 'en' ? 'Users with Unpaid Debt' : 'Danh sách nợ chưa thanh toán';
        thead3.textContent = currentLang === 'en' ? 'Unpaid Debt' : 'Nợ chưa thanh toán';
    } else {
        list = users;
        title.textContent = currentLang === 'en' ? 'Total Users' : 'Danh sách tất cả người dùng';
        thead3.textContent = currentLang === 'en' ? 'License Plate' : 'Biển số xe';
    }

    tbody.innerHTML = list.map(u => {
        let col3Html = '';
        if (type === 'overdue') {
            const od = countOverdue(u);
            col3Html = od > 0 ? `<span style="color:#dc2626; font-weight: 500;">${od} ${currentLang === 'en' ? 'months unpaid' : 'tháng chưa thanh toán'}</span>` : '<span style="color:#16a34a">Không có nợ</span>';
        } else {
            col3Html = `<span class="plate-val" style="display:inline-block; padding:2px 6px; background:var(--bg-2); border:1px solid var(--border); border-radius:4px; font-family:monospace;">${u.plate}</span>`;
        }
        return `<tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.name}</td>
            <td>${col3Html}</td>
        </tr>`;
    }).join('');

    modal.classList.remove('hidden');
}

function closeUserPopup() {
    document.getElementById('admin-users-list-modal').classList.add('hidden');
}

// Apply saved language on page load
document.addEventListener('DOMContentLoaded', () => {
    setLang(currentLang);
    initOccupiedSlots();
    updateSlotDisplay();
    startAutoSlotUpdate();
    syncAdminSlotDisplay();
});