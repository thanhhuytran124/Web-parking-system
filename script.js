// HCMUT Smart Parking System — script.js v5
const ADMIN_USER = 'admin', ADMIN_PASS = 'admin2026', DB_KEY = 'hcmut_parking_users';
const RATE = 2000, LATE_PENALTY = 10000, MAX_SLOTS = 150, RING_CIRC = 314;
let freeSlots = 130, occupiedSlots = new Set(), currentUser = null, autoSlotTimer = null;

// ── UTILS ──
function setEl(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function getYM(d){const dt=d||new Date();return`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;}
function monthLabel(k){const[y,m]=k.split('-');return`Tháng ${parseInt(m)}/${y}`;}
function curKey(){return getYM(new Date());}
function fmtVND(n){return(n||0).toLocaleString('vi-VN')+' VND';}
function isPastGrace(monthKey){
    // Grace period ends on day 7 of the NEXT month after monthKey
    // monthKey = "YYYY-MM", e.g. "2026-04" → grace ends 2026-05-07
    const[y,m]=monthKey.split('-').map(Number);
    // new Date(y, m, 7): JS months are 0-indexed, so m (1-12 from split) maps to correct next month
    const grace=new Date(y,m,7);
    return new Date()>grace;
}
function countOverdue(user){
    const ck=curKey();
    return user.bills.filter(b=>b.monthKey!==ck&&!b.paid&&isPastGrace(b.monthKey)).length;
}

// ── DB ──
function loadDB(){
    const raw=localStorage.getItem(DB_KEY);
    if(raw)return JSON.parse(raw);
    const now=new Date();
    const prev=n=>{const d=new Date(now.getFullYear(),now.getMonth()-n,1);return getYM(d);};
    const mkS=(y,m,n)=>Array.from({length:n},(_,i)=>({
        date:`${String(Math.min(28,(i+1)*2)).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`,
        checkIn:`${String(7+(i%4)).padStart(2,'0')}:00`,
        checkOut:`${String(9+(i%4)).padStart(2,'0')}:30`
    }));
    const mkB=(key,n,paid,paidAt=null)=>{
        const[y,m]=key.split('-').map(Number);
        const penalty=(!paid&&isPastGrace(key))?LATE_PENALTY:0;
        return{monthKey:key,sessions:mkS(y,m,n),sessionCount:n,
               amount:n*RATE,penalty,totalDue:n*RATE+penalty,paid,paidAt};
    };
    const users=[
        {username:'2352414',password:'hcmut2027',name:'Trần Thanh Huy',
         dob:'15/08/2002',role:'Student',plate:'59-X1 123.45',locked:false,bills:[
            mkB(prev(11),10,true,'05/06/2025'),mkB(prev(10),8,true,'07/07/2025'),
            mkB(prev(9),12,true,'04/08/2025'), mkB(prev(8),9,true,'06/09/2025'),
            mkB(prev(7),11,true,'08/10/2025'), mkB(prev(6),7,true,'05/11/2025'),
            mkB(prev(5),13,true,'09/12/2025'), mkB(prev(4),12,true,'05/01/2026'),
            mkB(prev(3),9,true,'03/02/2026'),  mkB(prev(2),14,true,'07/03/2026'),
            mkB(prev(1),8,true,'04/04/2026'),  mkB(curKey(),5,false)
        ]},
        {username:'2210002',password:'hcmut2026',name:'Lê Văn Bình',
         dob:'20/03/2003',role:'Student',plate:'51-B2 456.78',locked:false,bills:[
            mkB(prev(7),10,true,'09/10/2025'),  mkB(prev(6),8,true,'06/11/2025'),
            mkB(prev(5),7,true,'05/12/2025'),   mkB(prev(4),9,false), // Jan - unpaid, past grace
            mkB(prev(3),6,false),               // Feb - unpaid, past grace
            mkB(prev(2),5,false),               // Mar - unpaid, past grace
            mkB(prev(1),4,false),               // Apr - unpaid (grace ends May 7)
            mkB(curKey(),2,false)
        ]},
        {username:'NV001',password:'hcmut2026',name:'Nguyễn Thị Lan',
         dob:'10/05/1990',role:'Staff',plate:'59-C3 789.01',locked:false,bills:[
            mkB(prev(2),20,true,'05/03/2026'),mkB(prev(1),18,true,'07/04/2026'),
            mkB(curKey(),8,false)
        ]}
    ];
    // auto-lock if >=3 overdue AND not admin-unlocked
    users.forEach(u=>{
        if(countOverdue(u)>=3 && !u.adminUnlocked){
            u.locked=true;
        }
    });
    saveDB(users);return users;
}
function saveDB(u){localStorage.setItem(DB_KEY,JSON.stringify(u));}
function findUser(u){return loadDB().find(x=>x.username.toLowerCase()===u.trim().toLowerCase())||null;}

function applyPenalties(user){
    const ck=curKey(); let changed=false;
    user.bills.forEach(b=>{
        if(b.monthKey===ck||b.paid)return;
        if(!b.penalty&&isPastGrace(b.monthKey)){
            b.penalty=LATE_PENALTY; b.totalDue=b.amount+LATE_PENALTY; changed=true;
        }
    });
    return changed;
}

function getOrCreateMonthBill(user){
    const key=curKey();
    let bill=user.bills.find(b=>b.monthKey===key);
    if(!bill){
        bill={monthKey:key,sessions:[],sessionCount:0,amount:0,penalty:0,totalDue:0,paid:false,paidAt:null};
        user.bills.push(bill);
        saveDB(loadDB().map(u=>u.username===user.username?user:u));
    }
    return bill;
}

// ── SLOTS ──
function initOccupiedSlots(){
    occupiedSlots.clear();
    const all=Array.from({length:MAX_SLOTS},(_,i)=>i+1);
    for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
    all.slice(0,MAX_SLOTS-freeSlots).forEach(s=>occupiedSlots.add(s));
}

// ── VIEWS ──
const VIEWS=['landing-view','login-view','admin-view','dashboard-view'];
function showView(id){VIEWS.forEach(v=>document.getElementById(v).classList.add('hidden'));document.getElementById(id).classList.remove('hidden');}
function showLoginForm(){document.getElementById('login-view').classList.remove('hidden');document.getElementById('login-error').classList.add('hidden');document.getElementById('sso-username').value='';document.getElementById('sso-password').value='';}
function cancelLogin(){document.getElementById('login-view').classList.add('hidden');}

function handleLogin(e){
    e.preventDefault();
    const uname=document.getElementById('sso-username').value.trim();
    const pass=document.getElementById('sso-password').value;
    const err=document.getElementById('login-error');
    if(uname.toLowerCase()===ADMIN_USER&&pass===ADMIN_PASS){
        err.classList.add('hidden');document.getElementById('login-view').classList.add('hidden');
        currentUser=null;showView('admin-view');adminRenderUsers();initOccupiedSlots();startAutoSlotUpdate();syncAdminSlotDisplay();return;
    }
    const found=findUser(uname);
    if(found&&found.password===pass){
        if(found.locked){err.textContent='🔒 Tài khoản bị khóa do nợ quá hạn. Liên hệ admin để mở khóa.';err.classList.remove('hidden');return;}
        err.classList.add('hidden');document.getElementById('login-view').classList.add('hidden');
        // apply penalties & check auto-lock
        const users=loadDB();const dbU=users.find(u=>u.username===found.username);
        applyPenalties(dbU);
        if(countOverdue(dbU)>=3 && !dbU.adminUnlocked){
            dbU.locked=true;
            saveDB(users);
            err.textContent='🔒 Tài khoản vừa bị khóa do nợ từ 3 tháng trở lên. Liên hệ admin.';
            err.classList.remove('hidden');
            return;
        }
        saveDB(users);
        currentUser=dbU;showView('dashboard-view');populateUserDashboard(currentUser);initOccupiedSlots();updateSlotDisplay();startAutoSlotUpdate();return;
    }
    err.textContent='⚠ Tên đăng nhập hoặc mật khẩu không đúng.';err.classList.remove('hidden');
}
function handleLogout(){stopAutoSlotUpdate();currentUser=null;showView('landing-view');}

// ── SLOT DISPLAY ──
function updateSlotDisplay(){
    const occ=MAX_SLOTS-freeSlots,ring=document.getElementById('slot-ring');
    if(ring){ring.style.strokeDashoffset=RING_CIRC*(1-freeSlots/MAX_SLOTS);ring.style.stroke=freeSlots<=10?'#ef4444':freeSlots<=30?'#f59e0b':'#22c55e';}
    setEl('free-slots-count',freeSlots);setEl('free-count',freeSlots);setEl('occupied-count',occ);
    const big=document.getElementById('free-slots-count');
    if(big)big.style.color=freeSlots<=10?'#dc2626':freeSlots<=30?'#b45309':'#1e40af';
    const stEl=document.getElementById('slot-status'),stTx=document.getElementById('slot-status-text');
    if(stEl&&stTx){
        if(freeSlots===0)applyStatus(stEl,stTx,'danger','🚫 Bãi xe đầy!');
        else if(freeSlots<=10)applyStatus(stEl,stTx,'danger',`⚠️ Gần đầy — còn ${freeSlots} chỗ!`);
        else if(freeSlots<=30)applyStatus(stEl,stTx,'warning',`⚡ Còn ít chỗ — ${freeSlots} slot`);
        else applyStatus(stEl,stTx,'success',`✅ Còn nhiều chỗ — ${freeSlots} slot trống`);
    }
}
function applyStatus(el,txt,type,msg){
    const m={success:['rgba(22,163,74,.08)','rgba(22,163,74,.2)','#15803d'],warning:['rgba(245,158,11,.08)','rgba(245,158,11,.25)','#b45309'],danger:['rgba(220,38,38,.08)','rgba(220,38,38,.25)','#dc2626']};
    const[bg,bd,c]=m[type];el.style.background=bg;el.style.borderColor=bd;el.style.color=c;txt.textContent=msg;
}
function syncAdminSlotDisplay(){
    setEl('admin-free-display',freeSlots);
    const big=document.getElementById('admin-free-display');
    if(big)big.style.color=freeSlots<=10?'#dc2626':freeSlots<=30?'#b45309':'#2563eb';
    updateSlotDisplay();
}
function startAutoSlotUpdate(){
    stopAutoSlotUpdate();
    autoSlotTimer=setInterval(()=>{
        const d=Math.random()<.5?-1:1,nxt=freeSlots+d;
        if(nxt>=0&&nxt<=MAX_SLOTS){
            freeSlots=nxt;
            if(d===-1){let c;do{c=Math.floor(Math.random()*MAX_SLOTS)+1;}while(occupiedSlots.has(c));occupiedSlots.add(c);}
            else if(occupiedSlots.size>0){const a=[...occupiedSlots];occupiedSlots.delete(a[Math.floor(Math.random()*a.length)]);}
            updateSlotDisplay();syncAdminSlotDisplay();
            const bm=document.getElementById('slot-board-modal');
            if(bm&&!bm.classList.contains('hidden'))renderSlotBoard();
        }
    },5000);
}
function stopAutoSlotUpdate(){if(autoSlotTimer){clearInterval(autoSlotTimer);autoSlotTimer=null;}}

// ── SLOT BOARD ──
function openSlotBoard(){renderSlotBoard();document.getElementById('slot-board-modal').classList.remove('hidden');}
function closeSlotBoard(){document.getElementById('slot-board-modal').classList.add('hidden');}
function renderSlotBoard(){
    const grid=document.getElementById('slot-board-grid');if(!grid)return;
    setEl('board-free-count',freeSlots);setEl('board-occ-count',MAX_SLOTS-freeSlots);
    grid.innerHTML=Array.from({length:MAX_SLOTS},(_,i)=>i+1)
        .map(i=>`<div class="slot-cell ${occupiedSlots.has(i)?'slot-occ':'slot-free'}" title="Slot ${i}">${i}</div>`).join('');
}

// ── ADMIN ──
function adminSetSlots(){
    const val=parseInt(document.getElementById('admin-slot-input').value,10);
    if(isNaN(val)||val<0||val>MAX_SLOTS){alert(`Nhập 0–${MAX_SLOTS}.`);return;}
    freeSlots=val;occupiedSlots.clear();
    const all=Array.from({length:MAX_SLOTS},(_,i)=>i+1);
    for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
    all.slice(0,MAX_SLOTS-freeSlots).forEach(s=>occupiedSlots.add(s));syncAdminSlotDisplay();
}

function adminRenderUsers(){
    const users=loadDB(),tbody=document.getElementById('admin-users-tbody'),
          noMsg=document.getElementById('no-users-msg'),badge=document.getElementById('user-count-badge'),month=curKey();
    badge.textContent=`${users.length} user${users.length!==1?'s':''}`;
    const mlEl=document.getElementById('admin-month-label');if(mlEl)mlEl.textContent=monthLabel(month);
    if(!users.length){tbody.innerHTML='';noMsg.classList.remove('hidden');return;}
    noMsg.classList.add('hidden');
    tbody.innerHTML=users.map(u=>{
        const mb=u.bills.find(b=>b.monthKey===month);
        const od=countOverdue(u);
        const lockBadge=u.locked?`<span class="badge badge-locked">🔒 Bị khóa</span>`:od>0?`<span class="badge badge-warn">⚠ Nợ ${od} tháng</span>`:'';
        const billHtml=!mb?`<span class="badge badge-none">Chưa phát sinh</span>`:mb.paid
            ?`<span class="badge badge-paid">✔ Đã TT · ${mb.sessionCount} lần · ${fmtVND(mb.amount)}</span>`
            :`<span class="badge badge-unpaid">✖ Chưa TT · ${mb.sessionCount} lần · ${fmtVND(mb.amount)}</span>`;
        return`<tr class="bill-row-clickable" onclick="adminViewUser('${u.username}')">
          <td>${u.username} ${lockBadge}</td><td>${u.name}</td><td>${u.role}</td>
          <td><span class="plate-val">${u.plate}</span></td><td>${billHtml}</td>
          <td onclick="event.stopPropagation()">
            ${u.locked?`<button class="btn btn-success-sm" onclick="adminUnlock('${u.username}')">🔓 Mở khóa</button>`:''}
            <button class="btn btn-remove" onclick="adminRemoveUser('${u.username}')">Xoá</button>
          </td></tr>`;
    }).join('');
}

function adminUnlock(uname){
    if(!confirm(`Mở khóa tài khoản "${uname}"?\nXác nhận người dùng đã giải quyết nợ trực tiếp.`))return;
    const users=loadDB();
    const u=users.find(x=>x.username===uname);
    if(!u){alert('Không tìm thấy tài khoản.');return;}
    u.locked=false;
    u.adminUnlocked=true; // Flag to prevent auto-relock
    saveDB(users);
    adminRenderUsers();   // refresh table immediately
    showAdminToast(`✅ Đã mở khóa tài khoản "${uname}" thành công!`);
}
function showAdminToast(msg){
    // Reuse success-toast
    setEl('toast-title','Admin thông báo');
    setEl('toast-msg',msg);
    const t=document.getElementById('success-toast');
    t.classList.remove('hidden');
    setTimeout(()=>t.classList.add('hidden'),4000);
}

function adminViewUser(uname){
    const u=findUser(uname);if(!u)return;
    document.getElementById('aum-name').textContent=u.name;
    document.getElementById('aum-dob').textContent=u.dob||'—';
    document.getElementById('aum-role').textContent=u.role==='Student'?'Sinh viên':'Nhân viên';
    document.getElementById('aum-plate').textContent=u.plate;
    document.getElementById('aum-status').textContent=u.locked?'🔒 Bị khóa':'✅ Hoạt động';
    document.getElementById('aum-status').className=u.locked?'badge badge-locked':'badge badge-paid';
    const od=countOverdue(u);
    document.getElementById('aum-overdue').textContent=od>0?`${od} tháng chưa thanh toán`:'Không có nợ';
    document.getElementById('aum-overdue').style.color=od>0?'#dc2626':'#16a34a';
    // 12-month history
    const tbody=document.getElementById('aum-history-tbody');
    const now=new Date();
    const rows=Array.from({length:12},(_,i)=>{
        const d=new Date(now.getFullYear(),now.getMonth()-i,1);
        const key=getYM(d);
        const bill=u.bills.find(b=>b.monthKey===key);
        if(!bill)return`<tr><td>${monthLabel(key)}</td><td colspan="4" class="tc" style="color:#94a3b8">Không có dữ liệu</td></tr>`;
        const penHtml=bill.penalty>0?`<br><small style="color:#dc2626">+${fmtVND(bill.penalty)} phạt trễ</small>`:'';
        return`<tr>
            <td>${monthLabel(key)}</td>
            <td class="tc">${bill.sessionCount} lần</td>
            <td class="tc">${fmtVND(bill.amount)}${penHtml}</td>
            <td>${bill.paidAt||'—'}</td>
            <td>${bill.paid?'<span class="badge badge-paid">✔ Đã TT</span>':'<span class="badge badge-unpaid">✖ Chưa TT</span>'}</td>
        </tr>`;
    });
    tbody.innerHTML=rows.join('');
    document.getElementById('admin-user-modal').classList.remove('hidden');
}
function closeAdminUserModal(){document.getElementById('admin-user-modal').classList.add('hidden');}

function adminCreateUser(e){
    e.preventDefault();
    const msgEl=document.getElementById('create-user-msg');
    const username=document.getElementById('new-username').value.trim();
    const password=document.getElementById('new-password').value;
    const name=document.getElementById('new-name').value.trim();
    const dob=document.getElementById('new-dob').value;
    const role=document.getElementById('new-role').value;
    const plate=document.getElementById('new-plate').value.trim();
    if(username.toLowerCase()===ADMIN_USER){showCreateMsg(msgEl,'error','❌ Username "admin" là tên dành riêng.');return;}
    if(findUser(username)){showCreateMsg(msgEl,'error',`❌ Username "${username}" đã tồn tại.`);return;}
    const users=loadDB();users.push({username,password,name,dob,role,plate,locked:false,bills:[]});saveDB(users);
    showCreateMsg(msgEl,'success',`✅ Tài khoản "${username}" đã tạo thành công!`);
    document.getElementById('create-user-form').reset();adminRenderUsers();
}
function adminRemoveUser(uname){if(!confirm(`Xoá tài khoản "${uname}"?`))return;saveDB(loadDB().filter(u=>u.username!==uname));adminRenderUsers();}
function showCreateMsg(el,type,text){el.className=`create-msg ${type}`;el.textContent=text;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),4000);}

// ── USER DASHBOARD ──
function populateUserDashboard(user){
    const fresh=findUser(user.username);if(fresh)Object.assign(currentUser,fresh);
    setEl('dash-user-name',currentUser.name);setEl('dash-user-role',currentUser.role);
    const ini=currentUser.name.split(' ').slice(-2).map(w=>w[0]).join('').toUpperCase();
    setEl('user-avatar-initials',ini);
    setEl('info-name',currentUser.name);setEl('info-role',currentUser.role);
    setEl('info-id',currentUser.username);setEl('info-plate',currentUser.plate);
    renderCurrentMonthBill(currentUser);renderOverdueBills(currentUser);renderUserBillHistory(currentUser.bills);
}

function renderCurrentMonthBill(user){
    const bill=getOrCreateMonthBill(user),key=curKey();
    const mlEl=document.getElementById('bill-month-label');if(mlEl)mlEl.textContent=monthLabel(key);
    setEl('bill-session-count',`${bill.sessionCount} lần gửi`);setEl('bill-amount',fmtVND(bill.totalDue||bill.amount));
    const badge=document.getElementById('bill-status-badge'),btn=document.getElementById('btn-pay-now');
    if(bill.paid){
        if(badge){badge.className='badge badge-paid';badge.textContent='✔ Đã thanh toán';}
        if(btn){btn.disabled=true;btn.textContent='✔ Đã thanh toán';btn.classList.add('btn-paid-done');}
        setEl('bill-paid-at',bill.paidAt?`Thanh toán ngày: ${bill.paidAt}`:'');
    }else{
        if(badge){badge.className='badge badge-pending';badge.textContent='⏳ Chưa thanh toán';}
        if(btn){btn.disabled=false;btn.textContent='Thanh toán tháng này (BKPay)';btn.classList.remove('btn-paid-done');}
        setEl('bill-paid-at','');
    }
}

function renderOverdueBills(user){
    const ck=curKey();
    // Show ALL unpaid previous months so user can pay before or after penalty
    const overdue=user.bills.filter(b=>b.monthKey!==ck&&!b.paid)
        .sort((a,b)=>a.monthKey.localeCompare(b.monthKey));
    const section=document.getElementById('overdue-section');
    if(!section)return;
    if(!overdue.length){section.classList.add('hidden');return;}
    section.classList.remove('hidden');
    // Re-apply penalty amounts in case they changed
    applyPenalties(user);
    const tbody=document.getElementById('overdue-tbody');
    const totalOverdueMonths=overdue.filter(b=>isPastGrace(b.monthKey)).length;
    setEl('overdue-count',`${overdue.length} tháng chưa TT${totalOverdueMonths>0?' ('+totalOverdueMonths+' tháng nợ phạt)':''}`);
    tbody.innerHTML=overdue.map(b=>{
        const pastGrace=isPastGrace(b.monthKey);
        const penaltyNote=pastGrace
            ?`<span style="color:#dc2626;font-size:.75rem;display:block">⚠ Trễ hạn — +10.000đ</span>`
            :`<span style="color:#16a34a;font-size:.75rem;display:block">Còn trong hạn</span>`;
        return`<tr>
          <td>${monthLabel(b.monthKey)}${penaltyNote}</td>
          <td class="tc">${fmtVND(b.amount)}</td>
          <td class="tc" style="color:#dc2626;font-weight:700">${b.penalty?fmtVND(b.penalty):'—'}</td>
          <td class="tc" style="color:#1e40af;font-weight:800">${fmtVND(b.totalDue||b.amount)}</td>
          <td><button class="btn btn-warning-sm" onclick="payOverdue('${b.monthKey}')">Thanh toán</button></td>
        </tr>`;
    }).join('');
    const total=overdue.reduce((s,b)=>s+(b.totalDue||b.amount),0);
    setEl('overdue-total',fmtVND(total));
}

function payOverdue(monthKey){
    if(!currentUser)return;
    if(!confirm(`Thanh toán hoá đơn ${monthLabel(monthKey)}?`))return;
    const users=loadDB(),dbU=users.find(u=>u.username===currentUser.username);
    if(!dbU)return;
    const bill=dbU.bills.find(b=>b.monthKey===monthKey);
    if(!bill||bill.paid)return;
    bill.paid=true;bill.paidAt=new Date().toLocaleDateString('vi-VN');
    // re-check lock and clear adminUnlocked if debt is cleared
    if(countOverdue(dbU)<3) {
        dbU.locked=false;
        delete dbU.adminUnlocked;
    }
    saveDB(users);Object.assign(currentUser,dbU);
    renderCurrentMonthBill(currentUser);renderOverdueBills(currentUser);renderUserBillHistory(currentUser.bills);
    showToast('✅ Đã thanh toán!',`Hoá đơn ${monthLabel(monthKey)} đã được thanh toán.`);
}

function renderUserBillHistory(bills){
    const tbody=document.getElementById('history-tbody');
    if(!bills||!bills.length){tbody.innerHTML='<tr><td colspan="5" class="empty-td">Chưa có lịch sử.</td></tr>';return;}
    const sorted=bills.slice().sort((a,b)=>b.monthKey.localeCompare(a.monthKey));
    tbody.innerHTML=sorted.map(b=>`
        <tr class="bill-row-clickable" onclick="openBillDetail('${b.monthKey}')">
          <td>${monthLabel(b.monthKey)}</td>
          <td class="tc">${b.sessionCount} lần</td>
          <td class="tc">${fmtVND(b.amount)}${b.penalty?`<br><small style="color:#dc2626">+${fmtVND(b.penalty)} phạt</small>`:''}</td>
          <td>${b.paidAt||'—'}</td>
          <td>${b.paid?'<span class="badge badge-paid">✔ Đã TT</span>':'<span class="badge badge-unpaid">✖ Chưa TT</span>'}</td>
        </tr>`).join('');
}

// ── BILL DETAIL MODAL ──
function openBillDetail(monthKey){
    const user=findUser(currentUser.username);const bill=user.bills.find(b=>b.monthKey===monthKey);if(!bill)return;
    setEl('detail-month-title',monthLabel(monthKey));
    setEl('detail-session-count',bill.sessionCount);
    setEl('detail-total-amount',fmtVND(bill.totalDue||bill.amount));
    setEl('detail-status',bill.paid?'✔ Đã thanh toán':'✖ Chưa thanh toán');
    const se=document.getElementById('detail-status');if(se)se.className=bill.paid?'badge badge-paid':'badge badge-unpaid';
    const tbody=document.getElementById('detail-sessions-tbody');
    if(!bill.sessions||!bill.sessions.length){tbody.innerHTML='<tr><td colspan="3" class="empty-td">Chưa có phiên nào.</td></tr>';}
    else{tbody.innerHTML=bill.sessions.map((s,i)=>`<tr><td>${i+1}</td><td>${s.date}</td><td>${s.checkIn} → ${s.checkOut}</td></tr>`).join('');}
    document.getElementById('bill-detail-modal').classList.remove('hidden');
}
function closeBillDetail(){document.getElementById('bill-detail-modal').classList.add('hidden');}

// ── PAYMENT ──
function handlePayment(){
    if(!currentUser)return;
    const key=curKey(),users=loadDB(),dbU=users.find(u=>u.username===currentUser.username);
    if(!dbU)return;const bill=dbU.bills.find(b=>b.monthKey===key);if(!bill||bill.paid)return;
    bill.paid=true;bill.paidAt=new Date().toLocaleDateString('vi-VN');saveDB(users);
    Object.assign(currentUser,dbU);renderCurrentMonthBill(currentUser);renderOverdueBills(currentUser);renderUserBillHistory(currentUser.bills);
    showToast('✅ Thanh toán thành công!','Hoá đơn tháng này đã được thanh toán qua BKPay.');
}

function showToast(title,msg){
    setEl('toast-title',title);setEl('toast-msg',msg);
    const t=document.getElementById('success-toast');t.classList.remove('hidden');
    setTimeout(()=>t.classList.add('hidden'),4500);
}
