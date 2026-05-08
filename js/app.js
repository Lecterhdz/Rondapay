(() => {
  // ========================================
  // ⚙️ CONFIGURACIÓN GLOBAL
  // ========================================
  const CONFIG = {
    VALID_LICENSE: 'RONDA2026',
    ADMIN_PASSWORD: 'admin123',
    THEME_KEY: 'rondapay-theme',
    SESSION_KEY: 'rondapay-session',
    DATA_KEY: 'rondapay_tanda'
  };

  // ========================================
  // 📊 ESTADO DE LA APP
  // ========================================
  const state = {
    isAdmin: false,
    deferredPrompt: null,
    currentView: 'dashboard',
    newTandaDraft: null
  };

  // 📊 Registro de gráficos para evitar conflictos de Canvas
  const charts = {};

  // ========================================
  // 🎯 REFERENCIAS DOM
  // ========================================
  const el = {
    loginScreen: document.getElementById('login-screen'),
    mainApp: document.getElementById('main-app'),
    adminPanel: document.getElementById('admin-panel'),
    licenseInput: document.getElementById('license-input'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    menu: document.getElementById('hamburger-menu'),
    menuToggle: document.getElementById('menu-toggle'),
    hideMenu: document.getElementById('hide-menu-btn'),
    showMenu: document.getElementById('show-menu-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    installBtn: document.getElementById('pwa-install'),
    logoutBtn: document.getElementById('logout-btn'),
    appTitle: document.getElementById('app-title'),
    pageTitle: document.getElementById('page-title'),
    content: document.getElementById('content'),
    participantsList: document.getElementById('participants-list'),
    paymentsList: document.getElementById('payments-list'),
    searchParticipant: document.getElementById('search-participant'),
    addParticipantBtn: document.getElementById('add-participant'),
    paymentWeek: document.getElementById('payment-week'),
    markPaidBtn: document.getElementById('mark-paid')
  };

  // 🔑 FORWARD DECLARATIONS - EVITA TDZ (CLAVE!)
  let modal = null;
  let newTandaForm = null;
  let editParticipantModal = null;

  // ========================================
  // 💾 CAPA DE DATOS - PERSISTENCIA LOCAL
  // ========================================
  const Storage = {
    get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (e) { console.error('❌ Error leyendo localStorage:', e); return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { console.error('❌ Error escribiendo:', e); return false; }
    },
    remove(key) { localStorage.removeItem(key); },
    clearRondaPay() {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('rondapay_')) localStorage.removeItem(k); });
    }
  };

  function initDefaultData() {
    if (!Storage.get(CONFIG.DATA_KEY)) {
      Storage.set(CONFIG.DATA_KEY, {
        id: crypto.randomUUID?.() || Date.now().toString(),
        name: 'Ronda #1', amount: 1000, currency: 'MXN', frequency: 'weekly',
        startDate: new Date().toISOString().split('T')[0], totalWeeks: 10, currentWeek: 1,
        participants: [
          { id: 1, name: 'Ana López', phone: '5551234567', status: 'active', paidWeeks: [1,2], nextTurn: 3, received: false },
          { id: 2, name: 'Carlos Ruiz', phone: '5557654321', status: 'active', paidWeeks: [1], nextTurn: 4, received: false },
          { id: 3, name: 'María Díaz', phone: '5559876543', status: 'pending', paidWeeks: [], nextTurn: 5, received: false },
          { id: 4, name: 'Luis Gómez', phone: '5551112233', status: 'active', paidWeeks: [1,2,3], nextTurn: 6, received: true }
        ]
      });
    }
  }
  function getTanda() { return Storage.get(CONFIG.DATA_KEY); }
  function saveTanda(t) { Storage.set(CONFIG.DATA_KEY, t); }

  // ========================================
  // 🎨 UTILIDADES UI (Helpers - AHORA PRIMERO)
  // ========================================
  function escapeHtml(t) {
    if (!t) return '';
    const m = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
    return t.replace(/[&<>"']/g, c => m[c]);
  }
  function formatPhone(p) {
    const c = (''+p).replace(/\D/g,'');
    return c.length===10 ? c.replace(/(\d{3})(\d{3})(\d{4})/,'$1 $2 $3') : p;
  }
  function getStatusText(s) {
    return {'active':'✅ Activo','pending':'⏳ Pendiente','inactive':'❌ Inactivo'}[s]||s;
  }
  function getCurrencySymbol(c) { return {MXN:'$',USD:'$',EUR:'€',COP:'$',PEN:'S/'}[c]||'$'; }
  function formatCurrency(a,c='MXN') {
    return new Intl.NumberFormat('es-MX',{style:'currency',currency:c,minFrac:0}).format(a);
  }
  function addDays(d,days) { const r=new Date(d); r.setDate(r.getDate()+days); return r; }
  function formatDate(d,o={}) { return new Date(d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric',...o}); }
  function getWeekDate(sd,wn,f) {
    const s=new Date(sd), fd={weekly:7,biweekly:15,monthly:30};
    return new Date(s.getTime()+fd[f]*(wn-1)*864e5).toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit'});
  }
  function calculateTandaPreview(amt,part,freq,start) {
    const fd={weekly:7,biweekly:15,monthly:30}, tw=part, td=fd[freq]*tw;
    return {
      duration:`${tw} ${freq==='weekly'?'semanas':freq==='biweekly'?'quincenas':'meses'}`,
      weekly:amt*part, total:amt*part*tw,
      endDate:formatDate(addDays(start,td)), nextDate:formatDate(addDays(start,fd[freq]))
    };
  }

  // ========================================
  // 🎨 UI: TOAST NOTIFICATIONS
  // ========================================
  function showToast(msg,type='success') {
    const toast=document.createElement('div'), colors={success:'var(--success)',error:'var(--danger)',info:'var(--primary)',warning:'var(--warning)'};
    toast.className='toast'; toast.innerHTML=`<span style="margin-right:8px">${type==='success'?'✅':type==='error'?'❌':type==='warning'?'⚠️':'ℹ️'}</span>${msg}`;
    toast.style.cssText=`position:fixed;bottom:24px;right:24px;left:24px;max-width:400px;margin:0 auto;background:${colors[type]||colors.success};color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:9999;font-size:.9rem;font-weight:500;animation:slideUp .3s ease,fadeOut .3s ease 2.7s forwards;display:flex;align-items:center;pointer-events:none`;
    document.body.appendChild(toast); setTimeout(()=>toast.remove(),3000);
  }

  // ========================================
  // 📊 GRÁFICOS (Chart.js Wrapper)
  // ========================================
  function createChart(cid,cfg) {
    const c=document.getElementById(cid); if(!c){console.warn(`⚠️ Canvas no encontrado: ${cid}`);return null;}
    if(charts[cid]){try{charts[cid].destroy()}catch(e){}delete charts[cid];}
    try{charts[cid]=new Chart(c,cfg);return charts[cid];}catch(e){console.error(`❌ Error gráfico ${cid}:`,e);return null;}
  }
  function calculateStats(t) {
    let paid=0,pending=0,late=0; const cw=t.currentWeek;
    t.participants.forEach(p=>{if(p.status==='pending')pending++;else if(p.paidWeeks.includes(cw))paid++;else late++;});
    return{total:t.participants.length,paid,pending,late};
  }
  function initCharts() {
    const t=getTanda(); if(!t)return; const s=calculateStats(t);
    createChart('status-chart',{type:'doughnut',data:{labels:['Pagado','Pendiente','Atrasado'],datasets:[{data:[s.paid,s.pending,s.late],backgroundColor:['#10b981','#f59e0b','#ef4444'],borderWidth:0,spacing:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:20}},tooltip:{backgroundColor:'rgba(15,23,42,0.9)',padding:12,cornerRadius:8}}}});
    const weeks=Array.from({length:Math.min(t.currentWeek,6)},(_,i)=>`Sem ${i+1}`), pd=weeks.map((_,i)=>t.participants.filter(p=>p.paidWeeks.includes(i+1)).length*t.amount);
    createChart('progress-chart',{type:'bar',data:{labels:weeks,datasets:[{label:'Recaudado ($)',data:pd,backgroundColor:'rgba(79,70,229,0.8)',borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.05)'}},x:{grid:{display:false}}}}});
  }
  function initAdminCharts() {
    createChart('admin-revenue-chart',{type:'line',data:{labels:['Ene','Feb','Mar','Abr','May','Jun'],datasets:[{label:'Ingresos Totales ($)',data:[1200,1900,2400,3100,2800,4200],borderColor:'#4f46e5',backgroundColor:'rgba(79,70,229,0.1)',tension:0.4,fill:true,pointBackgroundColor:'#fff',pointBorderColor:'#4f46e5',pointBorderWidth:2,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.05)'}},x:{grid:{display:false}}}}});
    createChart('admin-attendance-chart',{type:'polarArea',data:{labels:['Grupo Alpha','Grupo Beta','Grupo Gamma'],datasets:[{data:[95,78,88],backgroundColor:['rgba(16,185,129,0.7)','rgba(245,158,11,0.7)','rgba(79,70,229,0.7)'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});
  }
    // ========================================
  // 👥 PARTICIPANTES
  // ========================================
  function renderParticipants(filter='') {
    const t=getTanda(), list=el.participantsList; if(!list||!t)return;
    const f=t.participants.filter(p=>p.name.toLowerCase().includes(filter.toLowerCase())||p.phone.includes(filter));
    if(!f.length){list.innerHTML=`<div class="empty-state">🔍 No se encontraron participantes${filter?` para "${escapeHtml(filter)}"`:''}${!filter&&!t.participants.length?'<br><button class="btn-primary" style="margin-top:12px" onclick="modal?.open?.()">+ Agregar primero</button>':''}</div>`;return;}
    list.innerHTML=f.map(p=>{const ip=p.paidWeeks.includes(t.currentWeek);return`<div class="list-item" data-id="${p.id}" tabindex="0"><div class="avatar" aria-hidden="true">${p.name.charAt(0).toUpperCase()}</div><div class="info"><h4>${escapeHtml(p.name)}</h4><p>📱 ${formatPhone(p.phone)} • Turno: #${p.nextTurn}</p><p class="meta">💰 Pagadas: ${p.paidWeeks.length}/${t.totalWeeks}</p></div><div class="actions" role="group"><span class="status ${p.status}">${getStatusText(p.status)}</span><button class="icon-btn mark-paid ${ip?'done':''}" data-id="${p.id}" title="${ip?'Pago registrado':'Marcar como pagado'}">${ip?'✅':'💵'}</button><button class="icon-btn edit-participant" data-id="${p.id}" title="Editar">✏️</button><button class="icon-btn delete-participant" data-id="${p.id}" title="Eliminar">🗑️</button></div></div>`;}).join('');
  }
  function togglePayment(pid) {
    const t=getTanda(), p=t.participants.find(x=>x.id===pid); if(!p)return;
    const cw=t.currentWeek, wi=p.paidWeeks.indexOf(cw);
    if(wi===-1){p.paidWeeks.push(cw);p.paidWeeks.sort((a,b)=>a-b);showToast(`✅ ${p.name} marcó pago - Semana ${cw}`);}
    else{p.paidWeeks.splice(wi,1);showToast(`⚠️ Pago desmarcado para ${p.name}`);}
    saveTanda(t); renderParticipants(el.searchParticipant?.value||''); initCharts();
  }
  // ========================================
  // 💳 TOGGLE PAGO (ACTUALIZACIÓN PARCIAL + DEBOUNCE)
  // ========================================
  let saveTimeout = null;
  
  function togglePaymentForWeek(pid, week) {
    const t = getTanda();
    const p = t.participants.find(x => x.id === pid);
    if (!p) return;

    const idx = p.paidWeeks.indexOf(week);
    const isPaid = idx === -1;
    
    // ✅ Actualizar estado en memoria
    if (isPaid) {
      p.paidWeeks.push(week);
      p.paidWeeks.sort((a,b) => a-b);
    } else {
      p.paidWeeks.splice(idx, 1);
    }

    // ✅ Actualización SOLO de la celda (sin re-render completo)
    const cell = document.querySelector(`.payment-cell[data-participant="${pid}"][data-week="${week}"]`);
    if (cell) {
      const statusEl = cell.querySelector('.payment-status');
      if (statusEl) {
        const isLate = week < t.currentWeek && !isPaid;
        statusEl.className = `payment-status ${isPaid ? 'paid' : isLate ? 'late' : 'pending'}`;
        statusEl.textContent = isPaid ? '✅' : isLate ? '❌' : '⏳';
        if (isPaid) statusEl.classList.toggle('received', p.received);
      }
    }

    // ✅ Actualizar totales en tiempo real (solo elementos visibles)
    updateRowTotal(pid, t);
    updateWeekTotal(week, t);
    updateGrandTotal(t);

    // ✅ Guardado optimizado (evita thrashing de localStorage)
    scheduleSave();
    
    showToast(isPaid ? `✅ ${p.name} - Semana ${week}` : `⚠️ Pago desmarcado`, isPaid ? 'success' : 'warning');
  }

  function updateRowTotal(pid, tanda) {
    const p = tanda.participants.find(x => x.id === pid);
    const row = document.querySelector(`.matrix-row[data-participant="${pid}"] .summary-cell`);
    if (row && p) row.textContent = formatCurrency(p.paidWeeks.length * tanda.amount, tanda.currency);
  }

  function updateWeekTotal(week, tanda) {
    const active = tanda.participants.filter(p => p.status === 'active');
    const paidCount = active.filter(p => p.paidWeeks.includes(week)).length;
    const col = document.querySelectorAll('#weeks-total .week-total')[week - 1];
    if (col) col.textContent = formatCurrency(paidCount * tanda.amount, tanda.currency);
  }

  function updateGrandTotal(tanda) {
    const gt = document.getElementById('grand-total');
    const active = tanda.participants.filter(p => p.status === 'active');
    const total = active.reduce((sum, p) => sum + (p.paidWeeks.length * tanda.amount), 0);
    if (gt) gt.textContent = formatCurrency(total, tanda.currency);
  }

  function scheduleSave() {
    clearTimeout(saveTimeout);
    // Guardar en lote cada 1s o usar requestIdleCallback si está disponible
    saveTimeout = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => saveTanda(getTanda()), { timeout: 2000 });
      } else {
        saveTanda(getTanda());
      }
    }, 1000);
  }
  function addParticipant(name,phone,turn=1) {
    if(!name||!phone){showToast('❌ Nombre y teléfono son requeridos','error');return false;}
    const t=getTanda();
    if(t.participants.some(p=>p.phone===phone)){showToast('⚠️ Este teléfono ya está registrado','warning');return false;}
    const nid=Math.max(...t.participants.map(p=>p.id),0)+1, nt=turn||Math.max(...t.participants.map(p=>p.nextTurn||0),0)+1;
    t.participants.push({id:nid,name:name.trim(),phone:phone.trim(),status:'active',paidWeeks:[],nextTurn:nt,received:false,createdAt:new Date().toISOString()});
    t.participants.sort((a,b)=>a.nextTurn-b.nextTurn); saveTanda(t);
    if(state.currentView==='participants'){renderParticipants();initCharts();}
    return true;
  }
  function deleteParticipant(id) {
    if(!confirm('¿Eliminar este participante? Esta acción no se puede deshacer.'))return;
    const t=getTanda(), idx=t.participants.findIndex(p=>p.id===id);
    if(idx!==-1){const r=t.participants.splice(idx,1)[0];saveTanda(t);renderParticipants();initCharts();showToast(`🗑️ ${r.name} eliminado`);}
  }
  function editParticipant(id) {
    const t=getTanda(), p=t.participants.find(x=>x.id===id); if(!p)return;
    if(editParticipantModal?.open) editParticipantModal.open(p);
    else showToast('🔧 Edición próximamente','info');
  }
  function showParticipantDetails(id) {
    const t=getTanda(), p=t.participants.find(x=>x.id===id); if(!p)return;
    const m=document.createElement('div'); m.className='modal-overlay';
    m.innerHTML=`<div class="modal-card"><div class="modal-header"><h3>${escapeHtml(p.name)}</h3><button class="icon-btn close-modal">✕</button></div><div class="modal-body"><p><strong>📱 Teléfono:</strong> ${formatPhone(p.phone)}</p><p><strong>📊 Estado:</strong> ${getStatusText(p.status)}</p><p><strong>🔄 Próximo turno:</strong> Semana #${p.nextTurn}</p><p><strong>💰 Historial:</strong></p><div class="payment-history">${Array.from({length:t.totalWeeks},(_,i)=>{const w=i+1,pa=p.paidWeeks.includes(w),re=pa&&p.received;return`<span class="week-badge ${pa?'paid':''} ${re?'received':''}" title="Semana ${w}">${w}</span>`;}).join('')}</div></div><div class="modal-footer"><button class="btn-secondary" onclick="window.open('https://wa.me/52${p.phone}','_blank')">💬 WhatsApp</button><button class="btn-primary close-modal">Cerrar</button></div></div>`;
    document.body.appendChild(m);
    m.querySelectorAll('.close-modal').forEach(b=>b.addEventListener('click',()=>m.remove()));
    m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  }

  // ========================================
  // 💳 PAGOS
  // ========================================
  function renderPaymentsMatrix(wf = 'all') {
    const t = getTanda();
    const cont = document.getElementById('payments-matrix');
    const wh = document.getElementById('weeks-header');
    const mb = document.getElementById('matrix-body');
    const wt = document.getElementById('weeks-total');
    const gt = document.getElementById('grand-total');
    const badge = document.getElementById('current-week-badge');

    if (!cont || !t) return;

    // Actualizar badge de semana actual
    if (badge) badge.textContent = t.currentWeek;

    const weeks = Array.from({ length: t.totalWeeks }, (_, i) => i + 1);
    
    // 1. GENERAR ENCABEZADOS (Semanas + QUIÉN RECIBE)
    wh.innerHTML = weeks.map(w => {
      // Lógica: ¿Quién recibe en la semana 'w'? 
      // Usualmente quien tiene nextTurn == w, o la lógica de tu tanda.
      // Aquí asumimos que si el turno es 'w', recibe en la semana 'w'.
      const receiver = t.participants.find(p => p.nextTurn === w);
      const receiverName = receiver ? `🎁 ${receiver.name.split(' ')[0]}` : '';
      const isCurrent = w === t.currentWeek;
      
      return `
        <div class="week-cell ${isCurrent ? 'current' : ''}" data-week="${w}">
          <span class="week-num">S${w}</span>
          <span class="week-date">${getWeekDate(t.startDate, w, t.frequency)}</span>
          ${receiverName ? `<small style="font-size:0.65rem; color:var(--success); display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${receiverName}</small>` : ''}
        </div>
      `;
    }).join('');

    // 2. GENERAR CUERPO (Participantes y sus pagos)
    mb.innerHTML = t.participants
      .filter(p => p.status !== 'inactive') // Mostrar activos y pendientes
      .map(p => {
        const totalPaid = p.paidWeeks.length * t.amount;
        const isReceiverInCurrentWeek = p.nextTurn === t.currentWeek;

        return `
          <div class="matrix-row" data-participant="${p.id}">
            <div class="participant-cell sticky-left ${isReceiverInCurrentWeek ? 'highlight-row' : ''}">
              <div class="participant-info">
                ${escapeHtml(p.name)}
                <small>Turno #${p.nextTurn} ${p.status === 'pending' ? '(Pendiente)' : ''}</small>
              </div>
            </div>
            <div class="weeks-grid">
              ${weeks.map(w => {
                const isPaid = p.paidWeeks.includes(w);
                const isLate = w < t.currentWeek && !isPaid;
                let sc = 'pending', icn = '⏳';
                
                if (isPaid) { sc = 'paid'; icn = '✅'; } 
                else if (isLate) { sc = 'late'; icn = '❌'; }
                
                // Si recibió el dinero (lógica simple: si pasó su turno y todos pagaron esa semana - opcional)
                // Aquí marcamos 'received' si pagó esa semana
                if (isPaid && p.received) sc += ' received';

                return `
                  <div class="payment-cell" data-participant="${p.id}" data-week="${w}" tabindex="0">
                    <span class="payment-status ${sc}">${icn}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="summary-cell sticky-right">
              ${formatCurrency(totalPaid, t.currency)}
            </div>
          </div>
        `;
      }).join('');

    // 3. GENERAR FOOTER (Totales por semana)
    wt.innerHTML = weeks.map(w => {
      const count = t.participants.filter(p => p.status !== 'inactive' && p.paidWeeks.includes(w)).length;
      const total = count * t.amount;
      return `<div class="week-total" style="text-align:center; padding-top:10px;">${formatCurrency(total, t.currency)}</div>`;
    }).join('');

    // Total General Recaudado
    const grandTotal = t.participants
      .filter(p => p.status !== 'inactive')
      .reduce((sum, p) => sum + (p.paidWeeks.length * t.amount), 0);
    
    gt.textContent = formatCurrency(grandTotal, t.currency);
  }
  function renderPayments(wf='all') {
    const isM=document.body.classList.contains('payments-matrix-view');
    if(isM){renderPaymentsMatrix(wf);return;}
    const t=getTanda(), list=el.paymentsList; if(!list||!t)return;
    const weeks=Array.from({length:t.totalWeeks},(_,i)=>i+1), fw=wf==='all'?weeks:[parseInt(wf)];
    list.innerHTML=fw.map(w=>{const pc=t.participants.filter(p=>p.status==='active'&&p.paidWeeks.includes(w)).length,te=t.participants.filter(p=>p.status==='active').length*t.amount,co=pc*t.amount,pt=te>0?Math.round((co/te)*100):0;return`<div class="list-item payment-week" data-week="${w}"><div class="info"><h4>📅 Semana ${w}</h4><p>💰 $${co.toLocaleString()} / $${te.toLocaleString()}</p><div class="progress-bar"><div class="progress-fill" style="width:${pt}%"></div></div><p class="meta">${pc} de ${t.participants.filter(p=>p.status==='active').length} pagaron</p></div><span class="status ${pt===100?'paid':pt>0?'pending':'late'}">${pt===100?'✅':pt>0?'⏳':'❌'}</span></div>`;}).join('');
    const sel=document.getElementById('payment-week-filter'); if(sel&&sel.value!==wf)sel.value=wf;
  }

  // ========================================
  // 🔄 VISTAS
  // ========================================
  function renderView(vn) {
    state.currentView = vn;
    
    // Ocultar todas las vistas y aplicar inert
    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
      v.setAttribute('inert', '');  // 🔒 Bloquear interacción en vistas ocultas
    });
    
    // Mostrar vista seleccionada y quitar inert
    const target = document.getElementById(`${vn}-view`);
    if (target) {
      target.classList.add('active');
      target.removeAttribute('inert');  // 🔓 Desbloquear interacción en vista activa
      
      // Focus management para accesibilidad
      const firstInput = target.querySelector('input:not([type="hidden"]), select, textarea');
      if (firstInput && vn === 'new-tanda') {
        setTimeout(() => firstInput.focus(), 100);
      }
      
      // Renderizar contenido específico
      switch(vn) {
        case 'dashboard':
          el.pageTitle.textContent = '📊 Dashboard';
          initCharts();
          break;
        case 'participants':
          el.pageTitle.textContent = '👥 Participantes';
          renderParticipants();
          break;
        case 'payments':
          el.pageTitle.textContent = '💳 Pagos';
          renderPayments();
          break;
        case 'new-tanda':
          el.pageTitle.textContent = '➕ Nueva Tanda';
          if (newTandaForm?.el) {
            newTandaForm.el.reset();
            newTandaForm.tempParticipants = [];
            newTandaForm.updatePreview?.();
          }
          break;
      }
    }
    
    // Actualizar estado activo en menú
    document.querySelectorAll('[data-view]').forEach(link => {
      link.parentElement.classList.toggle('active-link', link.dataset.view === vn);
    });
  }
    // ========================================
  // 🎛️ EVENT LISTENERS
  // ========================================
  function setupEventListeners() {
    if(window.__rondapay_listeners_attached)return; window.__rondapay_listeners_attached=true;
    el.loginBtn?.addEventListener('click',login); el.licenseInput?.addEventListener('keypress',e=>{if(e.key==='Enter')login();});
    el.themeToggle?.addEventListener('click',toggleTheme); el.logoutBtn?.addEventListener('click',logout);
    const toggleMenu=(open)=>{el.menu?.classList.toggle('open',open);el.showMenu?.classList.toggle('hidden',open);if(open)el.hideMenu?.focus();};
    el.menuToggle?.addEventListener('click',e=>{e.stopPropagation();toggleMenu(true);}); el.hideMenu?.addEventListener('click',()=>toggleMenu(false)); el.showMenu?.addEventListener('click',e=>{e.stopPropagation();toggleMenu(true);});
    document.addEventListener('click',e=>{if(el.menu?.classList.contains('open')&&!el.menu.contains(e.target)&&e.target!==el.menuToggle&&!el.menuToggle?.contains(e.target))toggleMenu(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&el.menu?.classList.contains('open')){toggleMenu(false);el.menuToggle?.focus();}});
    function handleNavigation(vn,e){e?.preventDefault();if(state.currentView==='new-tanda'&&vn!=='new-tanda'&&newTandaForm?.el){newTandaForm.el.reset();newTandaForm.tempParticipants=[];newTandaForm.updatePreview?.();}renderView(vn);toggleMenu(false);if(vn!=='dashboard')window.history.pushState({view:vn},'',`#${vn}`);else window.history.pushState({view:vn},'',window.location.pathname);}
    document.addEventListener('click',e=>{const nl=e.target.closest('[data-view]');if(nl)handleNavigation(nl.dataset.view,e);});
    window.addEventListener('hashchange',()=>{const h=window.location.hash.replace('#',''),vv=['dashboard','participants','payments','new-tanda'];if(vv.includes(h))renderView(h);});
    if(window.location.hash){const iv=window.location.hash.replace('#','');if(['dashboard','participants','payments','new-tanda'].includes(iv))setTimeout(()=>renderView(iv),100);}
    document.addEventListener('keydown',e=>{const it=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(it)return;if(e.ctrlKey&&e.key.toLowerCase()==='n'){e.preventDefault();renderView('new-tanda');setTimeout(()=>document.getElementById('t-name')?.focus(),100);}if(e.ctrlKey&&e.key.toLowerCase()==='f'&&state.currentView==='participants'){e.preventDefault();el.searchParticipant?.focus();}if(e.ctrlKey&&e.key.toLowerCase()==='t'){e.preventDefault();toggleTheme();}if(e.altKey&&e.key>='1'&&e.key<='4'){const vs=['dashboard','participants','payments','new-tanda'],ix=parseInt(e.key)-1;if(vs[ix]){e.preventDefault();renderView(vs[ix]);}}});
    let st; el.searchParticipant?.addEventListener('input',e=>{clearTimeout(st);st=setTimeout(()=>renderParticipants(e.target.value),300);});
    el.addParticipantBtn?.addEventListener('click',()=>{if(modal?.open)modal.open();else{const n=prompt('👤 Nombre del participante:');if(n===null)return;const ph=prompt('📱 Teléfono (10 dígitos):')||'';addParticipant(n,ph);}});
    el.participantsList?.addEventListener('click',e=>{const b=e.target.closest('button.icon-btn');if(!b)return;e.stopPropagation();const id=parseInt(b.dataset.id);if(!id||isNaN(id))return;if(b.classList.contains('mark-paid'))togglePayment(id);else if(b.classList.contains('edit-participant')){const t=getTanda(),p=t.participants.find(x=>x.id===id);if(p)editParticipantModal?.open?.(p);}else if(b.classList.contains('delete-participant'))deleteParticipant(id);});
    el.participantsList?.addEventListener('click',e=>{const it=e.target.closest('.list-item');if(!it)return;if(e.target.closest('button'))return;const id=parseInt(it.dataset.id);if(id)showParticipantDetails(id);});
    el.paymentWeek?.addEventListener('change',e=>renderPayments(e.target.value));
    el.markPaidBtn?.addEventListener('click',()=>{const w=el.paymentWeek?.value||'all';showToast(`🔧 Función "Marcar pagado masivo" para ${w} - Próximamente`,'info');});
    document.getElementById('btn-confirm-create')?.addEventListener('click',()=>{if(newTandaForm?.createTanda)newTandaForm.createTanda();document.getElementById('modal-confirm-tanda')?.classList.add('hidden');});
    document.querySelectorAll('#modal-confirm-tanda .modal-close')?.forEach(b=>b.addEventListener('click',()=>document.getElementById('modal-confirm-tanda')?.classList.add('hidden')));
    document.getElementById('modal-confirm-tanda')?.addEventListener('click',e=>{if(e.target.id==='modal-confirm-tanda')e.currentTarget.classList.add('hidden');});
    document.querySelectorAll('[data-template]')?.forEach(b=>b.addEventListener('click',()=>applyTandaTemplate(b.dataset.template)));
    document.getElementById('admin-back')?.addEventListener('click',()=>{window.history.replaceState({},document.title,window.location.pathname);state.isAdmin=false;showApp();renderView('dashboard');});
    el.installBtn?.addEventListener('click',async()=>{if(!state.deferredPrompt){showToast('📲 Tu navegador no soporta instalación o ya está instalada','info');return;}try{state.deferredPrompt.prompt();const{outcome}=await state.deferredPrompt.userChoice;if(outcome==='accepted'){el.installBtn?.classList.add('hidden');showToast('🎉 RondaPay instalada exitosamente');}}catch(err){console.error('❌ Error instalando PWA:',err);showToast('⚠️ Error al instalar. Intenta desde el menú del navegador','error');}finally{state.deferredPrompt=null;}});
    let rt; window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(state.currentView==='dashboard'||state.isAdmin)initCharts();},250);});
    if(window.location.hostname==='localhost'){console.log('🎛️ Event listeners attached (optimized)');console.log('⚡ Delegación activa en: #participants-list');console.log('⌨️ Shortcuts: Ctrl+N (nueva), Ctrl+F (buscar), Ctrl+T (tema), Alt+1-4 (nav)');}
  }

  // ========================================
  // 🎨 TEMPLATE HELPER
  // ========================================
  function applyTandaTemplate(tn) {
    const templates={office:{name:`Tanda Oficina ${new Date().getFullYear()}`,amount:500,participants:10,frequency:'weekly',currency:'MXN'},family:{name:'Ahorro Familiar',amount:1000,participants:5,frequency:'monthly',currency:'MXN'},friends:{name:'Ronda con Amigos',amount:200,participants:8,frequency:'biweekly',currency:'MXN'}};
    const t=templates[tn]; if(!t||!newTandaForm?.fields){showToast('⚠️ Plantilla no disponible','warning');return;}
    if(newTandaForm.fields.name)newTandaForm.fields.name.value=t.name;if(newTandaForm.fields.amount)newTandaForm.fields.amount.value=t.amount;if(newTandaForm.fields.participants)newTandaForm.fields.participants.value=t.participants;if(newTandaForm.fields.frequency)newTandaForm.fields.frequency.value=t.frequency;if(newTandaForm.fields.currency)newTandaForm.fields.currency.value=t.currency;
    newTandaForm.updatePreview?.(); showToast(`📋 Plantilla "${t.name}" aplicada`,'success');
  }

  // ========================================
  // 👥 COMPONENT: MODAL PARTICIPANTE (AHORA SÍ ASIGNAMOS)
  // ========================================
  modal = {
    el:document.getElementById('modal-participant'),form:document.getElementById('form-participant'),name:document.getElementById('p-name'),phone:document.getElementById('p-phone'),turn:document.getElementById('p-turn'),
    open(){this.el.classList.remove('hidden');this.name.focus();document.body.style.overflow='hidden';},
    close(){this.el.classList.add('hidden');document.body.style.overflow='';this.form.reset();},
    init(){if(!this.el)return;document.getElementById('add-participant')?.addEventListener('click',()=>this.open());this.el.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click',()=>this.close()));this.el.addEventListener('click',e=>{if(e.target===this.el)this.close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!this.el.classList.contains('hidden'))this.close();});this.form.addEventListener('submit',e=>{e.preventDefault();this.handleSubmit();});},
    handleSubmit(){const n=this.name.value.trim(),ph=this.phone.value.trim().replace(/\D/g,''),tu=parseInt(this.turn.value);if(n.length<2){showToast('El nombre debe tener al menos 2 caracteres','error');this.name.focus();return;}if(ph.length!==10){showToast('El teléfono debe tener 10 dígitos','error');this.phone.focus();return;}const ok=addParticipant(n,ph,tu);if(ok){this.close();showToast('✅ Participante agregado exitosamente');}},
    showError(m){showToast(m,'error');const i=event?.target||this.name;i.style.borderColor='var(--danger)';setTimeout(()=>i.style.borderColor='',2000);}
  };

  // ========================================
  // 🆕 COMPONENT: NUEVA TANDA FORM
  // ========================================
  newTandaForm = {
    el:document.getElementById('form-new-tanda'),fields:{},tempParticipants:[],
    init(){if(!this.el)return;this.fields={name:document.getElementById('t-name'),amount:document.getElementById('t-amount'),currency:document.getElementById('t-currency'),frequency:document.getElementById('t-frequency'),participants:document.getElementById('t-participants'),start:document.getElementById('t-start')};const td=new Date().toISOString().split('T')[0];this.fields.start.min=td;this.fields.start.value=td;Object.values(this.fields).forEach(f=>{f?.addEventListener('input',()=>this.updatePreview());f?.addEventListener('change',()=>this.updatePreview());});this.updatePreview();document.getElementById('btn-add-participant-inline')?.addEventListener('click',()=>this.addTempParticipant());this.el.addEventListener('submit',e=>this.handleSubmit(e));this.initConfirmModal();},
    updatePreview(){const a=parseFloat(this.fields.amount?.value)||0,p=parseInt(this.fields.participants?.value)||2,f=this.fields.frequency?.value||'weekly',s=this.fields.start?.value||new Date().toISOString().split('T')[0],c=this.fields.currency?.value||'MXN',pv=calculateTandaPreview(a,p,f,new Date(s)),sy=getCurrencySymbol(c);document.getElementById('preview-duration').textContent=pv.duration;document.getElementById('preview-weekly').textContent=`${sy}${pv.weekly.toLocaleString()}`;document.getElementById('preview-total').textContent=`${sy}${pv.total.toLocaleString()}`;document.getElementById('preview-end-date').textContent=pv.endDate;document.getElementById('preview-next-date').textContent=pv.nextDate;this.renderTempParticipants();},
    addTempParticipant(n='',ph=''){if(this.tempParticipants.length>=50){showToast('⚠️ Máximo 50 participantes','warning');return;}if(!n){n=prompt('👤 Nombre del participante:');if(!n)return;}if(!ph){ph=prompt('📱 Teléfono (10 dígitos, opcional):')||'';}this.tempParticipants.push({id:Date.now()+Math.random(),name:n.trim(),phone:ph.trim(),turn:this.tempParticipants.length+1});this.updatePreview();showToast(`✅ ${n} agregado temporalmente`);},
    removeTempParticipant(id){this.tempParticipants=this.tempParticipants.filter(p=>p.id!==id);this.updatePreview();},
    renderTempParticipants(){const c=document.getElementById('participants-preview');if(!c)return;if(!this.tempParticipants.length){c.innerHTML='<div class="empty-preview">Los participantes aparecerán aquí...</div>';return;}c.innerHTML=this.tempParticipants.map(p=>`<span class="participant-chip">${escapeHtml(p.name)}<button type="button" class="remove" data-id="${p.id}" title="Eliminar">✕</button></span>`).join('');c.querySelectorAll('.remove').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();this.removeTempParticipant(parseInt(e.currentTarget.dataset.id));}));},
    initConfirmModal(){const m=document.getElementById('modal-confirm-tanda'),cb=m?.querySelectorAll('.modal-close'),cf=document.getElementById('btn-confirm-create');cb?.forEach(b=>b.addEventListener('click',()=>m.classList.add('hidden')));m?.addEventListener('click',e=>{if(e.target===m)m.classList.add('hidden');});cf?.addEventListener('click',()=>{this.createTanda();m.classList.add('hidden');});},
    handleSubmit(e){e.preventDefault();const n=this.fields.name?.value.trim(),a=parseFloat(this.fields.amount?.value);if(!n||n.length<3){showToast('❌ El nombre debe tener al menos 3 caracteres','error');this.fields.name?.focus();return;}if(!a||a<10){showToast('❌ El monto mínimo es $10','error');this.fields.amount?.focus();return;}const pv=calculateTandaPreview(a,parseInt(this.fields.participants.value),this.fields.frequency.value,new Date(this.fields.start.value));document.getElementById('confirm-name').textContent=n;document.getElementById('confirm-amount').textContent=formatCurrency(a,this.fields.currency.value);document.getElementById('confirm-participants').textContent=this.fields.participants.value;document.getElementById('confirm-duration').textContent=pv.duration;document.getElementById('modal-confirm-tanda')?.classList.remove('hidden');},
    createTanda(){const tanda={id:crypto.randomUUID?.()||Date.now().toString(36),name:this.fields.name.value.trim(),amount:parseFloat(this.fields.amount.value),currency:this.fields.currency.value,frequency:this.fields.frequency.value,startDate:this.fields.start.value,totalWeeks:parseInt(this.fields.participants.value),currentWeek:1,createdAt:new Date().toISOString(),participants:this.tempParticipants.length?this.tempParticipants.map((p,i)=>({id:i+1,name:p.name,phone:p.phone,status:'active',paidWeeks:[],nextTurn:p.turn,received:false})):[]};Storage.set(CONFIG.DATA_KEY,tanda);this.tempParticipants=[];this.el?.reset();this.updatePreview();showToast('🎉 ¡Tanda creada exitosamente!');renderView('dashboard');if(!tanda.participants.length)setTimeout(()=>showToast('💡 Tip: Agrega participantes desde el menú 👥','info'),2000);}
  };

  // ========================================
  // ✏️ COMPONENT: EDITAR PARTICIPANTE
  // ========================================
  editParticipantModal = {
    el:document.getElementById('modal-edit-participant'),form:document.getElementById('form-edit-participant'),idField:document.getElementById('edit-participant-id'),nameField:document.getElementById('edit-name'),phoneField:document.getElementById('edit-phone'),turnField:document.getElementById('edit-turn'),
    open(p){if(!p)return;this.idField.value=p.id;this.nameField.value=p.name;this.phoneField.value=p.phone;this.turnField.value=p.nextTurn;this.el.classList.remove('hidden');this.nameField.focus();document.body.style.overflow='hidden';},
    close(){this.el.classList.add('hidden');document.body.style.overflow='';this.form.reset();},
    init(){if(!this.el)return;this.el.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click',()=>this.close()));this.el.addEventListener('click',e=>{if(e.target===this.el)this.close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!this.el.classList.contains('hidden'))this.close();});this.form.addEventListener('submit',e=>{e.preventDefault();this.saveChanges();});},
    saveChanges(){const id=parseInt(this.idField.value),n=this.nameField.value.trim(),ph=this.phoneField.value.trim().replace(/\D/g,''),tu=parseInt(this.turnField.value);if(n.length<2||ph.length!==10){showToast('❌ Verifica nombre y teléfono','error');return;}const t=getTanda(),p=t.participants.find(x=>x.id===id);if(!p)return;p.name=n;p.phone=ph;p.nextTurn=tu;t.participants.sort((a,b)=>a.nextTurn-b.nextTurn);saveTanda(t);renderParticipants();initCharts();this.close();showToast(`✅ ${n} actualizado`);}
  };
    // ========================================
  // 🔐 AUTENTICACIÓN
  // ========================================
  function initTheme(){const s=localStorage.getItem(CONFIG.THEME_KEY)||'light';applyTheme(s);}
  function applyTheme(t){document.documentElement.classList.toggle('theme-dark',t==='dark');el.themeToggle.textContent=t==='dark'?'☀️':'🌙';localStorage.setItem(CONFIG.THEME_KEY,t);const mt=document.querySelector('meta[name="theme-color"]');if(mt)mt.setAttribute('content',t==='dark'?'#0f172a':'#4f46e5');}
  function toggleTheme(){const d=document.documentElement.classList.contains('theme-dark');applyTheme(d?'light':'dark');}
  function checkSession(){const tk=sessionStorage.getItem(CONFIG.SESSION_KEY);if(tk==='active'){showApp();initDefaultData();renderView(state.currentView);}else showLogin();}
  function login(){const k=el.licenseInput?.value.trim();if(!k){showLoginError('Ingresa tu clave');return;}if(k===CONFIG.VALID_LICENSE){sessionStorage.setItem(CONFIG.SESSION_KEY,'active');initDefaultData();showApp();renderView('dashboard');showToast('✅ Bienvenido a RondaPay');}else{showLoginError('Clave inválida');el.licenseInput?.focus();}}
  function showLoginError(m){if(el.loginError){el.loginError.textContent=m;el.loginError.classList.remove('hidden');setTimeout(()=>el.loginError.classList.add('hidden'),3000);}}
  function showLogin(){hideAllScreens();el.loginScreen?.classList.add('active');el.licenseInput?.focus();}
  function showApp(){hideAllScreens();el.mainApp?.classList.add('active');el.appTitle.textContent='RondaPay';}
  function showAdmin(){hideAllScreens();el.adminPanel?.classList.add('active');el.appTitle.textContent='Admin | RondaPay';}
  function hideAllScreens(){[el.loginScreen,el.mainApp,el.adminPanel].forEach(s=>s?.classList.remove('active'));}
  function logout(){sessionStorage.removeItem(CONFIG.SESSION_KEY);showToast('👋 Sesión cerrada');setTimeout(showLogin,500);}
  function checkAdminAccess(){const p=new URLSearchParams(window.location.search);if(p.get('admin')==='true'){const pass=prompt('🔐 Clave de administrador:');if(pass===CONFIG.ADMIN_PASSWORD){state.isAdmin=true;showAdmin();initAdminCharts();window.history.replaceState({},document.title,window.location.pathname);}else if(pass!==null)alert('❌ Acceso denegado');}}

  // ========================================
  // 📱 PWA
  // ========================================
  function registerSW(){if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(r=>console.log('✅ SW registrado:',r.scope)).catch(e=>console.error('❌ Error SW:',e));}}
  function initInstallPrompt(){window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e;el.installBtn?.classList.remove('hidden');});window.addEventListener('appinstalled',()=>{console.log('🎉 PWA instalada');el.installBtn?.classList.add('hidden');state.deferredPrompt=null;});}

  // ========================================
  // 🎨 ESTILOS DINÁMICOS
  // ========================================
  function injectDynamicStyles(){if(document.getElementById('rondapay-styles'))return;const s=document.createElement('style');s.id='rondapay-styles';s.textContent=`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes fadeOut{from{opacity:1}to{opacity:0}}@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .2s ease}.modal-overlay.hidden{display:none!important}.modal-card{background:var(--surface);border-radius:20px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 40px rgba(0,0,0,.2);animation:slideUp .3s ease}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.modal-header h3{margin:0;font-size:1.1rem}.modal-footer,.form-actions{display:flex;gap:12px;margin-top:20px;justify-content:flex-end}.modal-confirm{text-align:center}.modal-icon{font-size:3rem;margin-bottom:8px;display:block}.confirm-summary{background:var(--bg);border-radius:12px;padding:16px;text-align:left;margin:16px 0}.confirm-summary p{margin:8px 0;display:flex;justify-content:space-between;font-size:.9rem}.confirm-summary strong{color:var(--text)}.confirm-summary span{color:var(--text-secondary)}.list-item{display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface);border-radius:12px;margin-bottom:8px;transition:transform .1s,box-shadow .2s}.list-item:hover{transform:translateY(-2px);box-shadow:var(--shadow)}.avatar{width:40px;height:40px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:1.1rem;flex-shrink:0}.info{flex:1;min-width:0}.info h4{margin:0;font-size:.95rem}.info p{margin:2px 0;font-size:.8rem;color:var(--text-secondary)}.info .meta{font-size:.75rem;opacity:.8}.actions{display:flex;align-items:center;gap:8px}.status{padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:500}.status.active{background:rgba(16,185,129,.15);color:var(--success)}.status.pending{background:rgba(245,158,11,.15);color:var(--warning)}.status.late{background:rgba(239,68,68,.15);color:var(--danger)}.status.paid{background:rgba(79,70,229,.15);color:var(--primary)}.payment-history{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.week-badge{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:500;background:var(--border);color:var(--text)}.week-badge.paid{background:var(--success);color:#fff}.week-badge.received{box-shadow:0 0 0 2px var(--primary)}.progress-bar{height:6px;background:var(--border);border-radius:3px;margin:8px 0;overflow:hidden}.progress-fill{height:100%;background:var(--success);border-radius:3px;transition:width .3s ease}.icon-btn{background:none;border:none;font-size:1.1rem;cursor:pointer;padding:6px;border-radius:8px;transition:transform .1s,background .2s;color:var(--text)}.icon-btn:hover{background:var(--border);transform:scale(1.05)}.icon-btn.mark-paid.done{opacity:.6;cursor:default}.icon-btn.mark-paid.done:hover{transform:none;background:none}.btn-primary,.btn-secondary,.btn-outline{padding:10px 16px;border-radius:12px;font-weight:500;cursor:pointer;border:none;font-size:.95rem;transition:transform .1s,filter .2s,background .2s}.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{background:var(--primary-hover);transform:translateY(-1px)}.btn-secondary{background:var(--border);color:var(--text)}.btn-secondary:hover{filter:brightness(.95);transform:translateY(-1px)}.btn-outline{background:transparent;border:2px dashed var(--border);color:var(--text-secondary);width:100%;text-align:center}.btn-outline:hover{border-color:var(--primary);color:var(--primary)}.btn-lg{padding:14px 28px;font-size:1rem}.empty-state{text-align:center;padding:32px 16px;color:var(--text-secondary)}.page-header{margin-bottom:24px}.page-header .subtitle{color:var(--text-secondary);margin:4px 0 0;font-size:.95rem}.tanda-form{display:flex;flex-direction:column;gap:20px}.form-section{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin:0}.form-section legend{font-weight:600;padding:0 8px;color:var(--primary);font-size:1.05rem;width:auto;margin:0}.form-row{display:flex;flex-direction:column;gap:16px;margin-bottom:16px}.form-row.two-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}.form-group{display:flex;flex-direction:column;gap:6px}.form-group label{font-weight:500;font-size:.9rem}.form-group small{color:var(--text-secondary);font-size:.75rem;margin-top:-4px;line-height:1.3}.form-group input,.form-group select{padding:12px 14px;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text);font-size:1rem;transition:border-color .2s,box-shadow .2s;width:100%}.form-group input:focus,.form-group select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(79,70,229,.15)}.form-group input:invalid:not(:placeholder-shown){border-color:var(--danger)}.input-with-prefix{position:relative;display:flex;align-items:center}.input-with-prefix .currency-prefix{position:absolute;left:14px;color:var(--text-secondary);font-weight:500;pointer-events:none;font-size:1.1rem}.input-with-prefix input{padding-left:36px}.preview-card{background:linear-gradient(135deg,rgba(79,70,229,.08),rgba(16,185,129,.08));border:1px solid rgba(79,70,229,.2);border-radius:12px;padding:16px;margin-top:8px}.preview-card h4{margin:0 0 12px;font-size:.95rem;color:var(--primary)}.preview-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.preview-item{display:flex;flex-direction:column;gap:4px}.preview-label{font-size:.75rem;color:var(--text-secondary)}.preview-value{font-weight:600;font-size:1.1rem;color:var(--text)}.participants-preview{background:var(--bg);border-radius:12px;padding:12px;min-height:60px;display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.empty-preview{width:100%;text-align:center;color:var(--text-secondary);font-size:.85rem;padding:8px}.participant-chip{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:20px;font-size:.85rem}.participant-chip .remove{background:none;border:none;color:var(--danger);cursor:pointer;font-size:1rem;padding:0;line-height:1;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%}.participant-chip .remove:hover{background:rgba(239,68,68,.1)}.help-text{color:var(--text-secondary);font-size:.85rem;margin:-8px 0 12px}.templates-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px;background:var(--bg);border-radius:12px;margin-bottom:16px}.templates-bar span{font-size:.85rem;color:var(--text-secondary)}.btn-chip{background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:20px;font-size:.8rem;cursor:pointer;transition:all .2s}.btn-chip:hover{border-color:var(--primary);color:var(--primary)}@media(max-width:600px){.form-row.two-cols{grid-template-columns:1fr}.preview-grid{grid-template-columns:1fr}.form-actions,.modal-footer{flex-direction:column}.form-actions .btn-primary,.form-actions .btn-secondary,.modal-footer .btn-primary,.modal-footer .btn-secondary{width:100%}.list-item{flex-wrap:wrap}.actions{margin-left:52px;margin-top:8px}.modal-card{padding:20px 16px}}@media(max-width:480px){.preview-grid{grid-template-columns:1fr}.participant-chip{font-size:.8rem;padding:4px 10px}}.theme-dark .preview-card{background:linear-gradient(135deg,rgba(79,70,229,.15),rgba(16,185,129,.15));border-color:rgba(79,70,229,.3)}.theme-dark .modal-card{box-shadow:0 20px 40px rgba(0,0,0,.4)}.theme-dark .btn-chip:hover{background:rgba(79,70,229,.2)}`;document.head.appendChild(s);}

  // ========================================
  // 🚀 INICIALIZACIÓN
  // ========================================
  function init(){initTheme();initDefaultData();checkSession();checkAdminAccess();setupEventListeners();registerSW();initInstallPrompt();setTimeout(() => {if(modal?.init)modal.init();if(newTandaForm?.init)newTandaForm.init();if(editParticipantModal?.init)editParticipantModal.init();}, 50);injectDynamicStyles();if(window.location.hostname==='localhost')console.log('🚀 RondaPay initialized',{session:sessionStorage.getItem(CONFIG.SESSION_KEY)?'active':'guest',theme:localStorage.getItem(CONFIG.THEME_KEY)||'light',tanda:Storage.get(CONFIG.DATA_KEY)?.name||'none'});}

  // ========================================
  // 🏁 ARRANQUE
  // ========================================
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})(); // ← FIN DEL IIFE
