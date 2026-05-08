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
    newTandaDraft: null,
    saveTimeout: null  // Para debounce
  };

  // 📊 Registro de gráficos
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

  // ========================================
  // 💾 MULTI-TANDA (Optimizado)
  // ========================================
  const MultiTanda = {
    KEY_LIST: 'rondapay_list',
    KEY_PREFIX: 'rondapay_tanda_',
    _cache: new Map(), // Caché en memoria
    
    getList() {
      try {
        return JSON.parse(localStorage.getItem(this.KEY_LIST)) || [];
      } catch { return []; }
    },
    
    saveList(ids) {
      localStorage.setItem(this.KEY_LIST, JSON.stringify(ids));
    },
    
    save(id, tanda) {
      this._cache.set(id, tanda);
      localStorage.setItem(`${this.KEY_PREFIX}${id}`, JSON.stringify(tanda));
      const list = this.getList();
      if (!list.includes(id)) {
        list.push(id);
        this.saveList(list);
      }
    },
    
    get(id) {
      if (this._cache.has(id)) return this._cache.get(id);
      try {
        const raw = localStorage.getItem(`${this.KEY_PREFIX}${id}`);
        const data = raw ? JSON.parse(raw) : null;
        if (data) this._cache.set(id, data);
        return data;
      } catch { return null; }
    },
    
    getActive() {
      const activeId = sessionStorage.getItem('rondapay_active_tanda');
      return activeId ? this.get(activeId) : null;
    },
    
    setActive(id) {
      sessionStorage.setItem('rondapay_active_tanda', id);
    },
    
    delete(id) {
      this._cache.delete(id);
      localStorage.removeItem(`${this.KEY_PREFIX}${id}`);
      const list = this.getList().filter(x => x !== id);
      this.saveList(list);
      if (sessionStorage.getItem('rondapay_active_tanda') === id) {
        sessionStorage.removeItem('rondapay_active_tanda');
      }
    },
    
    migrateLegacy() {
      const legacy = localStorage.getItem('rondapay_tanda');
      if (legacy) {
        try {
          const data = JSON.parse(legacy);
          if (data && !data.id) {
            data.id = crypto.randomUUID?.() || `legacy_${Date.now()}`;
            this.save(data.id, data);
            this.setActive(data.id);
            localStorage.removeItem('rondapay_tanda');
            console.log('✅ Migrada tanda legacy');
            return data.id;
          }
        } catch(e) {}
      }
      return null;
    },
    
    clearCache() { this._cache.clear(); }
  };

  function getTanda() {
    MultiTanda.migrateLegacy();
    return MultiTanda.getActive();
  }
  
  function saveTanda(tanda) {
    if (!tanda.id) tanda.id = crypto.randomUUID?.() || Date.now().toString();
    MultiTanda.save(tanda.id, tanda);
  }

  // ========================================
  // 🎨 UTILIDADES UI (Performance optimizado)
  // ========================================
  const HTML_ESCAPE_MAP = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
  const escapeHtml = (t) => t ? t.replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]) : '';
  
  const formatPhone = (p) => {
    const c = (''+p).replace(/\D/g,'');
    return c.length === 10 ? c.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') : p;
  };
  
  const getStatusText = (s) => ({'active':'✅ Activo','pending':'⏳ Pendiente','inactive':'❌ Inactivo'}[s] || s);
  
  const formatCurrency = (amount, currency = 'MXN') => {
    try {
      const num = parseFloat(amount) || 0;
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: currency || 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(num);
    } catch {
      return `$${parseFloat(amount) || 0}`;
    }
  };
  
  const formatDate = (d, o = {}) => new Date(d).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', ...o
  });
  
  const addDays = (d, days) => {
    const r = new Date(d);
    r.setDate(r.getDate() + days);
    return r;
  };
  
  const getWeekDate = (startDate, weekNum, frequency) => {
    try {
      const w = parseInt(weekNum);
      if (!w || w < 1) return '---';
      const start = startDate instanceof Date ? startDate : new Date(startDate);
      if (isNaN(start.getTime())) return '---';
      const freqDays = { weekly: 7, biweekly: 15, monthly: 30 };
      const days = freqDays[frequency] || 7;
      const target = new Date(start.getTime() + (days * (w - 1) * 86400000));
      return target.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    } catch {
      return '---';
    }
  };
  
  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    const colors = { success: '#10b981', error: '#ef4444', info: '#4f46e5', warning: '#f59e0b' };
    toast.className = 'toast';
    toast.innerHTML = `<span style="margin-right:8px">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>${msg}`;
    toast.style.cssText = `position:fixed;bottom:24px;right:24px;left:24px;max-width:400px;margin:0 auto;background:${colors[type] || colors.success};color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:9999;font-size:.9rem;font-weight:500;animation:slideUp .3s ease,fadeOut .3s ease 2.7s forwards;display:flex;align-items:center;pointer-events:none`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ========================================
  // 📊 GRÁFICOS
  // ========================================
  function createChart(cid, cfg) {
    const c = document.getElementById(cid);
    if (!c) return null;
    if (charts[cid]) {
      try { charts[cid].destroy(); } catch(e) {}
      delete charts[cid];
    }
    try {
      charts[cid] = new Chart(c, cfg);
      return charts[cid];
    } catch(e) {
      console.error(`❌ Error gráfico ${cid}:`, e);
      return null;
    }
  }
  
  function calculateStats(t) {
    let paid = 0, pending = 0, late = 0;
    const cw = t.currentWeek;
    t.participants.forEach(p => {
      if (p.status === 'pending') pending++;
      else if (p.paidWeeks.includes(cw)) paid++;
      else late++;
    });
    return { total: t.participants.length, paid, pending, late };
  }
  
  function initCharts() {
    const t = getTanda();
    if (!t) return;
    const s = calculateStats(t);
    createChart('status-chart', {
      type: 'doughnut',
      data: {
        labels: ['Pagado', 'Pendiente', 'Atrasado'],
        datasets: [{
          data: [s.paid, s.pending, s.late],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          spacing: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8 }
        }
      }
    });
    
    const weeks = Array.from({ length: Math.min(t.currentWeek, 6) }, (_, i) => `Sem ${i+1}`);
    const pd = weeks.map((_, i) => t.participants.filter(p => p.paidWeeks.includes(i+1)).length * t.amount);
    
    // Poblar filtro
    const filter = document.getElementById('payment-week');
    if (filter) {
      const current = filter.value;
      filter.innerHTML = '<option value="all">📅 Todas las semanas</option>';
      for (let w = 1; w <= t.totalWeeks; w++) {
        filter.innerHTML += `<option value="${w}">Semana ${w}</option>`;
      }
      if (current !== 'all' && parseInt(current) <= t.totalWeeks) {
        filter.value = current;
      }
    }
    
    createChart('progress-chart', {
      type: 'bar',
      data: {
        labels: weeks,
        datasets: [{
          label: 'Recaudado ($)',
          data: pd,
          backgroundColor: 'rgba(79,70,229,0.8)',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // ========================================
  // 👥 PARTICIPANTES (CORREGIDO)
  // ========================================
  function renderParticipants(filter = '') {
    const t = getTanda();
    const list = el.participantsList;
    if (!list || !t) return;
    
    const filtered = filter 
      ? t.participants.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) || p.phone.includes(filter))
      : t.participants;
    
    if (!filtered.length) {
      list.innerHTML = `
        <div class="empty-state">
          🔍 No se encontraron participantes${filter ? ` para "${escapeHtml(filter)}"` : ''}
          ${!filter && !t.participants.length 
            ? '<br><button class="btn-primary" style="margin-top:12px" data-action="add-first">+ Agregar primero</button>' 
            : ''}
        </div>
      `;
      return;
    }
    
    // ✅ Usar array.map().join() para mejor rendimiento (evita string concatenation lenta)
    list.innerHTML = filtered.map(p => {
      const isPaidThisWeek = p.paidWeeks.includes(t.currentWeek);
      return `
        <div class="list-item" data-id="${p.id}" tabindex="0">
          <div class="avatar" aria-hidden="true">${p.name.charAt(0).toUpperCase()}</div>
          <div class="info">
            <h4>${escapeHtml(p.name)}</h4>
            <p>📱 ${formatPhone(p.phone)} • Turno: #${p.nextTurn}</p>
            <p class="meta">💰 Pagadas: ${p.paidWeeks.length}/${t.totalWeeks}</p>
          </div>
          <div class="actions" role="group">
            <span class="status ${p.status}">${getStatusText(p.status)}</span>
            <button class="icon-btn mark-paid ${isPaidThisWeek ? 'done' : ''}" data-id="${p.id}" title="${isPaidThisWeek ? 'Pago registrado' : 'Marcar como pagado'}">${isPaidThisWeek ? '✅' : '💵'}</button>
            <button class="icon-btn edit-participant" data-id="${p.id}" title="Editar">✏️</button>
            <button class="icon-btn delete-participant" data-id="${p.id}" title="Eliminar">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function togglePayment(pid) {
    const t = getTanda();
    const p = t.participants.find(x => x.id === pid);
    if (!p) return;
    
    const cw = t.currentWeek;
    const wi = p.paidWeeks.indexOf(cw);
    
    if (wi === -1) {
      p.paidWeeks.push(cw);
      p.paidWeeks.sort((a, b) => a - b);
      showToast(`✅ ${p.name} marcó pago - Semana ${cw}`);
    } else {
      p.paidWeeks.splice(wi, 1);
      showToast(`⚠️ Pago desmarcado para ${p.name}`);
    }
    
    saveTanda(t);
    renderParticipants(el.searchParticipant?.value || '');
    initCharts();
  }
  
  function addParticipant(name, phone, turn = 1) {
    if (!name || !phone) {
      showToast('❌ Nombre y teléfono son requeridos', 'error');
      return false;
    }
    
    const t = getTanda();
    if (t.participants.some(p => p.phone === phone)) {
      showToast('⚠️ Este teléfono ya está registrado', 'warning');
      return false;
    }
    
    const nid = Math.max(...t.participants.map(p => p.id), 0) + 1;
    const nt = turn || Math.max(...t.participants.map(p => p.nextTurn || 0), 0) + 1;
    
    t.participants.push({
      id: nid,
      name: name.trim(),
      phone: phone.trim(),
      status: 'active',
      paidWeeks: [],
      nextTurn: nt,
      received: false,
      createdAt: new Date().toISOString()
    });
    
    t.participants.sort((a, b) => a.nextTurn - b.nextTurn);
    saveTanda(t);
    
    if (state.currentView === 'participants') {
      renderParticipants();
      initCharts();
    }
    return true;
  }
  
  function deleteParticipant(id) {
    if (!confirm('¿Eliminar este participante? Esta acción no se puede deshacer.')) return;
    
    const t = getTanda();
    const idx = t.participants.findIndex(p => p.id === id);
    if (idx !== -1) {
      const removed = t.participants.splice(idx, 1)[0];
      saveTanda(t);
      renderParticipants();
      initCharts();
      showToast(`🗑️ ${removed.name} eliminado`);
    }
  }
  
  function editParticipant(id) {
    const t = getTanda();
    const p = t.participants.find(x => x.id === id);
    if (!p) return;
    if (editParticipantModal?.open) editParticipantModal.open(p);
    else showToast('🔧 Edición próximamente', 'info');
  }
  
  function showParticipantDetails(id) {
    const t = getTanda();
    const p = t.participants.find(x => x.id === id);
    if (!p) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>${escapeHtml(p.name)}</h3>
          <button class="icon-btn close-modal">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>📱 Teléfono:</strong> ${formatPhone(p.phone)}</p>
          <p><strong>📊 Estado:</strong> ${getStatusText(p.status)}</p>
          <p><strong>🔄 Próximo turno:</strong> Semana #${p.nextTurn}</p>
          <p><strong>💰 Historial:</strong></p>
          <div class="payment-history">
            ${Array.from({ length: t.totalWeeks }, (_, i) => {
              const w = i + 1;
              const isPaid = p.paidWeeks.includes(w);
              return `<span class="week-badge ${isPaid ? 'paid' : ''}">${w}</span>`;
            }).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.open('https://wa.me/52${p.phone}','_blank')">💬 WhatsApp</button>
          <button class="btn-primary close-modal">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelectorAll('.close-modal').forEach(btn => 
      btn.addEventListener('click', () => modal.remove())
    );
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  // ========================================
  // 💳 PAGOS MATRIX (Optimizado)
  // ========================================
  function renderPaymentsMatrix(weekFilter = 'all') {
    const t = getTanda();
    const container = document.getElementById('payments-matrix');
    const weeksHeader = document.getElementById('weeks-header');
    const matrixBody = document.getElementById('matrix-body');
    const weeksTotal = document.getElementById('weeks-total');
    const grandTotal = document.getElementById('grand-total');
    const badge = document.getElementById('current-week-badge');
    
    if (!container || !t) return;
    
    const amount = parseFloat(t.amount) || 0;
    const currency = t.currency || 'MXN';
    const currentWeek = parseInt(t.currentWeek) || 1;
    const totalWeeks = parseInt(t.totalWeeks) || 5;
    const participants = t.participants || [];
    const activeParticipants = participants.filter(p => p.status !== 'inactive');
    
    if (badge) badge.textContent = currentWeek;
    
    // Determinar semanas a mostrar
    const selectedWeek = weekFilter !== 'all' ? parseInt(weekFilter) : null;
    const weeksToShow = (selectedWeek && selectedWeek <= totalWeeks) 
      ? [selectedWeek] 
      : Array.from({ length: totalWeeks }, (_, i) => i + 1);
    
    // Renderizar encabezado
    weeksHeader.innerHTML = weeksToShow.map(w => {
      const receiver = activeParticipants.find(p => p.nextTurn === w);
      const isCurrent = w === currentWeek;
      const dateStr = getWeekDate(t.startDate, w, t.frequency);
      return `
        <div class="week-cell ${isCurrent ? 'current' : ''}" data-week="${w}">
          <span class="week-num">S${w}</span>
          <span class="week-date">${dateStr}</span>
          ${receiver ? `<small style="color:var(--success);font-size:0.65rem;display:block;overflow:hidden;text-overflow:ellipsis;">🎁 ${receiver.name.split(' ')[0]}</small>` : ''}
        </div>
      `;
    }).join('');
    
    // Renderizar cuerpo
    matrixBody.innerHTML = activeParticipants.map(p => {
      const paidWeeks = Array.isArray(p.paidWeeks) ? p.paidWeeks : [];
      const totalPaid = paidWeeks.length * amount;
      const isReceiverNow = p.nextTurn === currentWeek;
      
      const cells = weeksToShow.map(w => {
        const isPaid = paidWeeks.includes(w);
        const isLate = w < currentWeek && !isPaid;
        const status = isPaid ? 'paid' : (isLate ? 'late' : 'pending');
        const icon = isPaid ? '✅' : (isLate ? '❌' : '⏳');
        return `
          <div class="payment-cell" data-participant="${p.id}" data-week="${w}" tabindex="0">
            <span class="payment-status ${status}">${icon}</span>
          </div>
        `;
      }).join('');
      
      return `
        <div class="matrix-row" data-participant="${p.id}">
          <div class="participant-cell sticky-left ${isReceiverNow ? 'highlight-row' : ''}">
            <div class="participant-info">
              ${escapeHtml(p.name)}
              <small>Turno #${p.nextTurn}</small>
            </div>
          </div>
          <div class="weeks-grid">${cells}</div>
          <div class="summary-cell sticky-right">${formatCurrency(totalPaid, currency)}</div>
        </div>
      `;
    }).join('');
    
    // Renderizar totales por semana
    weeksTotal.innerHTML = weeksToShow.map(w => {
      const count = activeParticipants.filter(p => 
        Array.isArray(p.paidWeeks) && p.paidWeeks.includes(w)
      ).length;
      return `<div class="week-total" style="text-align:center;padding-top:8px;">${formatCurrency(count * amount, currency)}</div>`;
    }).join('');
    
    // Total general
    const grand = activeParticipants.reduce((sum, p) => {
      const count = Array.isArray(p.paidWeeks) ? p.paidWeeks.length : 0;
      return sum + (count * amount);
    }, 0);
    grandTotal.textContent = formatCurrency(grand, currency);
  }
  
  function togglePaymentForWeek(pid, week) {
    const t = getTanda();
    const p = t.participants.find(x => x.id === pid);
    if (!p) return;
    
    const idx = p.paidWeeks.indexOf(week);
    
    if (idx === -1) {
      p.paidWeeks.push(week);
      p.paidWeeks.sort((a, b) => a - b);
    } else {
      p.paidWeeks.splice(idx, 1);
    }
    
    // Guardado con debounce para mejor rendimiento
    clearTimeout(state.saveTimeout);
    state.saveTimeout = setTimeout(() => saveTanda(t), 500);
    
    // Actualizar UI sin re-render completo
    const cell = document.querySelector(`.payment-cell[data-participant="${pid}"][data-week="${week}"] .payment-status`);
    if (cell) {
      const isPaid = idx === -1;
      const isLate = week < t.currentWeek && !isPaid;
      cell.className = `payment-status ${isPaid ? 'paid' : isLate ? 'late' : 'pending'}`;
      cell.textContent = isPaid ? '✅' : isLate ? '❌' : '⏳';
    }
    
    showToast(idx === -1 ? `✅ Pago registrado - Semana ${week}` : `⚠️ Pago desmarcado`, idx === -1 ? 'success' : 'warning');
  }

  // ========================================
  // 🔄 VISTAS
  // ========================================
  function renderView(viewName) {
    state.currentView = viewName;
    
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
      view.setAttribute('inert', '');
    });
    
    // Mostrar vista seleccionada
    const target = document.getElementById(`${viewName}-view`);
    if (target) {
      target.classList.add('active');
      target.removeAttribute('inert');
      
      // Renderizar contenido específico
      switch(viewName) {
        case 'dashboard':
          el.pageTitle.textContent = '📊 Dashboard';
          setTimeout(() => initCharts(), 50);
          break;
        case 'participants':
          el.pageTitle.textContent = '👥 Participantes';
          renderParticipants();
          break;
        case 'payments':
          el.pageTitle.textContent = '💳 Pagos';
          renderPaymentsMatrix();
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
    
    // Actualizar menú activo
    document.querySelectorAll('[data-view]').forEach(link => {
      const parent = link.parentElement;
      if (parent) parent.classList.toggle('active-link', link.dataset.view === viewName);
    });
  }
  
  // ========================================
  // 🔐 AUTENTICACIÓN
  // ========================================
  function initTheme() {
    const saved = localStorage.getItem(CONFIG.THEME_KEY) || 'light';
    applyTheme(saved);
  }
  
  function applyTheme(theme) {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    if (el.themeToggle) el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem(CONFIG.THEME_KEY, theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0f172a' : '#4f46e5');
  }
  
  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
  }
  
  function checkSession() {
    if (sessionStorage.getItem(CONFIG.SESSION_KEY) === 'active') {
      showApp();
      renderView(state.currentView);
    } else {
      showLogin();
    }
  }
  
  function login() {
    const key = el.licenseInput?.value.trim();
    if (!key) {
      showLoginError('Ingresa tu clave');
      return;
    }
    if (key === CONFIG.VALID_LICENSE) {
      sessionStorage.setItem(CONFIG.SESSION_KEY, 'active');
      showApp();
      renderView('dashboard');
      showToast('✅ Bienvenido a RondaPay');
    } else {
      showLoginError('Clave inválida');
      if (el.licenseInput) el.licenseInput.focus();
    }
  }
  
  function showLoginError(message) {
    if (el.loginError) {
      el.loginError.textContent = message;
      el.loginError.classList.remove('hidden');
      setTimeout(() => el.loginError.classList.add('hidden'), 3000);
    }
  }
  
  function showLogin() {
    hideAllScreens();
    if (el.loginScreen) el.loginScreen.classList.add('active');
    if (el.licenseInput) el.licenseInput.focus();
  }
  
  function showApp() {
    hideAllScreens();
    if (el.mainApp) el.mainApp.classList.add('active');
    if (el.appTitle) el.appTitle.textContent = 'RondaPay';
  }
  
  function showAdmin() {
    hideAllScreens();
    if (el.adminPanel) el.adminPanel.classList.add('active');
    if (el.appTitle) el.appTitle.textContent = 'Admin | RondaPay';
  }
  
  function hideAllScreens() {
    if (el.loginScreen) el.loginScreen.classList.remove('active');
    if (el.mainApp) el.mainApp.classList.remove('active');
    if (el.adminPanel) el.adminPanel.classList.remove('active');
  }
  
  function logout() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    showToast('👋 Sesión cerrada');
    setTimeout(showLogin, 500);
  }
  
  function checkAdminAccess() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      const pass = prompt('🔐 Clave de administrador:');
      if (pass === CONFIG.ADMIN_PASSWORD) {
        state.isAdmin = true;
        showAdmin();
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (pass !== null) {
        alert('❌ Acceso denegado');
      }
    }
  }

  // ========================================
  // 🎛️ EVENT LISTENERS
  // ========================================
  function setupEventListeners() {
    if (window.__rondapay_listeners_attached) return;
    window.__rondapay_listeners_attached = true;
    
    // Login
    if (el.loginBtn) el.loginBtn.addEventListener('click', login);
    if (el.licenseInput) {
      el.licenseInput.addEventListener('keypress', e => { if (e.key === 'Enter') login(); });
    }
    
    // Theme & Logout
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);
    if (el.logoutBtn) el.logoutBtn.addEventListener('click', logout);
    
    // Menú hamburguesa
    const toggleMenu = (open) => {
      if (el.menu) el.menu.classList.toggle('open', open);
      if (el.showMenu) el.showMenu.classList.toggle('hidden', open);
      if (open && el.hideMenu) el.hideMenu.focus();
    };
    
    if (el.menuToggle) {
      el.menuToggle.addEventListener('click', e => {
        e.stopPropagation();
        toggleMenu(true);
      });
    }
    if (el.hideMenu) el.hideMenu.addEventListener('click', () => toggleMenu(false));
    if (el.showMenu) {
      el.showMenu.addEventListener('click', e => {
        e.stopPropagation();
        toggleMenu(true);
      });
    }
    
    // Cerrar menú al hacer click fuera
    document.addEventListener('click', e => {
      if (el.menu?.classList.contains('open') && 
          !el.menu.contains(e.target) && 
          e.target !== el.menuToggle && 
          !el.menuToggle?.contains(e.target)) {
        toggleMenu(false);
      }
    });
    
    // Escape para cerrar menú
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.menu?.classList.contains('open')) {
        toggleMenu(false);
        if (el.menuToggle) el.menuToggle.focus();
      }
    });
    
    // Navegación
    const handleNavigation = (view, e) => {
      if (e) e.preventDefault();
      if (state.currentView === 'new-tanda' && view !== 'new-tanda' && newTandaForm?.el) {
        newTandaForm.el.reset();
        newTandaForm.tempParticipants = [];
        newTandaForm.updatePreview?.();
      }
      renderView(view);
      toggleMenu(false);
      if (view !== 'dashboard') {
        window.history.pushState({ view }, '', `#${view}`);
      } else {
        window.history.pushState({ view }, '', window.location.pathname);
      }
    };
    
    document.addEventListener('click', e => {
      const link = e.target.closest('[data-view]');
      if (link) handleNavigation(link.dataset.view, e);
    });
    
    // Hash navigation
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      const validViews = ['dashboard', 'participants', 'payments', 'new-tanda'];
      if (validViews.includes(hash)) renderView(hash);
    });
    
    if (window.location.hash) {
      const hashView = window.location.hash.replace('#', '');
      if (['dashboard', 'participants', 'payments', 'new-tanda'].includes(hashView)) {
        setTimeout(() => renderView(hashView), 100);
      }
    }
    
    // Teclado shortcuts
    document.addEventListener('keydown', e => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (isInput) return;
      
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        renderView('new-tanda');
        setTimeout(() => document.getElementById('t-name')?.focus(), 100);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f' && state.currentView === 'participants') {
        e.preventDefault();
        if (el.searchParticipant) el.searchParticipant.focus();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTheme();
      }
      if (e.altKey && e.key >= '1' && e.key <= '4') {
        const views = ['dashboard', 'participants', 'payments', 'new-tanda'];
        const idx = parseInt(e.key) - 1;
        if (views[idx]) {
          e.preventDefault();
          renderView(views[idx]);
        }
      }
    });
    
    // Búsqueda con debounce
    let searchTimeout;
    if (el.searchParticipant) {
      el.searchParticipant.addEventListener('input', e => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderParticipants(e.target.value), 300);
      });
    }
    
    // Botones de participantes
    if (el.addParticipantBtn) {
      el.addParticipantBtn.addEventListener('click', () => {
        if (modal?.open) modal.open();
        else {
          const name = prompt('👤 Nombre del participante:');
          if (name === null) return;
          const phone = prompt('📱 Teléfono (10 dígitos):') || '';
          addParticipant(name, phone);
        }
      });
    }
    
    // Delegación de eventos para participantes
    if (el.participantsList) {
      el.participantsList.addEventListener('click', e => {
        const btn = e.target.closest('button.icon-btn');
        if (btn) {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          if (isNaN(id)) return;
          
          if (btn.classList.contains('mark-paid')) togglePayment(id);
          else if (btn.classList.contains('edit-participant')) editParticipant(id);
          else if (btn.classList.contains('delete-participant')) deleteParticipant(id);
          return;
        }
        
        // Ver detalles al click en la card
        const item = e.target.closest('.list-item');
        if (item) {
          const id = parseInt(item.dataset.id);
          if (!isNaN(id)) showParticipantDetails(id);
        }
      });
    }
    
    // Filtro de semanas
    if (el.paymentWeek) {
      el.paymentWeek.addEventListener('change', e => {
        const val = e.target.value;
        const isMatrixView = document.getElementById('payments-matrix')?.offsetParent !== null;
        if (isMatrixView) {
          renderPaymentsMatrix(val);
          if (val !== 'all') {
            const header = document.querySelector(`.week-cell[data-week="${val}"]`);
            header?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        }
      });
    }
    
    // PWA Installation
    if (el.installBtn) {
      el.installBtn.addEventListener('click', async () => {
        if (!state.deferredPrompt) {
          showToast('📲 Tu navegador no soporta instalación o ya está instalada', 'info');
          return;
        }
        try {
          state.deferredPrompt.prompt();
          const { outcome } = await state.deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            if (el.installBtn) el.installBtn.classList.add('hidden');
            showToast('🎉 RondaPay instalada exitosamente');
          }
        } catch (err) {
          console.error('❌ Error instalando PWA:', err);
          showToast('⚠️ Error al instalar. Intenta desde el menú del navegador', 'error');
        } finally {
          state.deferredPrompt = null;
        }
      });
    }
    
    // Resize handler with debounce
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (state.currentView === 'dashboard' || state.isAdmin) initCharts();
      }, 250);
    });
  }
  
  // ========================================
  // 👥 COMPONENT: MODAL PARTICIPANTE
  // ========================================
  const modal = {
    el: document.getElementById('modal-participant'),
    form: document.getElementById('form-participant'),
    name: document.getElementById('p-name'),
    phone: document.getElementById('p-phone'),
    turn: document.getElementById('p-turn'),
    
    open() {
      if (!this.el) return;
      this.el.classList.remove('hidden');
      if (this.name) this.name.focus();
      document.body.style.overflow = 'hidden';
    },
    
    close() {
      if (!this.el) return;
      this.el.classList.add('hidden');
      document.body.style.overflow = '';
      if (this.form) this.form.reset();
    },
    
    init() {
      if (!this.el) return;
      
      const addBtn = document.getElementById('add-participant');
      if (addBtn) addBtn.addEventListener('click', () => this.open());
      
      this.el.querySelectorAll('.modal-close').forEach(btn => 
        btn.addEventListener('click', () => this.close())
      );
      
      this.el.addEventListener('click', e => { if (e.target === this.el) this.close(); });
      
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this.close();
      });
      
      if (this.form) {
        this.form.addEventListener('submit', e => {
          e.preventDefault();
          this.handleSubmit();
        });
      }
    },
    
    handleSubmit() {
      const name = this.name?.value.trim();
      const phone = this.phone?.value.trim().replace(/\D/g, '');
      const turn = parseInt(this.turn?.value);
      
      if (!name || name.length < 2) {
        showToast('El nombre debe tener al menos 2 caracteres', 'error');
        if (this.name) this.name.focus();
        return;
      }
      if (!phone || phone.length !== 10) {
        showToast('El teléfono debe tener 10 dígitos', 'error');
        if (this.phone) this.phone.focus();
        return;
      }
      
      if (addParticipant(name, phone, turn)) {
        this.close();
        showToast('✅ Participante agregado exitosamente');
      }
    }
  };
  
  // ========================================
  // 🆕 COMPONENT: NUEVA TANDA
  // ========================================
  const newTandaForm = {
    el: document.getElementById('form-new-tanda'),
    fields: {},
    tempParticipants: [],
    
    init() {
      if (!this.el) return;
      
      this.fields = {
        name: document.getElementById('t-name'),
        amount: document.getElementById('t-amount'),
        currency: document.getElementById('t-currency'),
        frequency: document.getElementById('t-frequency'),
        participants: document.getElementById('t-participants'),
        start: document.getElementById('t-start')
      };
      
      const today = new Date().toISOString().split('T')[0];
      if (this.fields.start) {
        this.fields.start.min = today;
        this.fields.start.value = today;
      }
      
      Object.values(this.fields).forEach(field => {
        if (field) {
          field.addEventListener('input', () => this.updatePreview());
          field.addEventListener('change', () => this.updatePreview());
        }
      });
      
      this.updatePreview();
      
      const addInlineBtn = document.getElementById('btn-add-participant-inline');
      if (addInlineBtn) {
        addInlineBtn.addEventListener('click', () => this.addTempParticipant());
      }
      
      this.el.addEventListener('submit', e => this.handleSubmit(e));
      this.initConfirmModal();
    },
    
    calculatePreview(amount, participants, frequency, startDate) {
      const freqDays = { weekly: 7, biweekly: 15, monthly: 30 };
      const totalWeeks = participants;
      const totalDays = freqDays[frequency] * totalWeeks;
      return {
        duration: `${totalWeeks} ${frequency === 'weekly' ? 'semanas' : frequency === 'biweekly' ? 'quincenas' : 'meses'}`,
        weekly: amount * participants,
        total: amount * participants * totalWeeks,
        endDate: formatDate(addDays(startDate, totalDays)),
        nextDate: formatDate(addDays(startDate, freqDays[frequency]))
      };
    },
    
    updatePreview() {
      const amount = parseFloat(this.fields.amount?.value) || 0;
      const participants = parseInt(this.fields.participants?.value) || 2;
      const frequency = this.fields.frequency?.value || 'weekly';
      const startDate = this.fields.start?.value ? new Date(this.fields.start.value) : new Date();
      const currency = this.fields.currency?.value || 'MXN';
      
      const preview = this.calculatePreview(amount, participants, frequency, startDate);
      const symbol = { MXN: '$', USD: '$', EUR: '€', COP: '$', PEN: 'S/' }[currency] || '$';
      
      const durationEl = document.getElementById('preview-duration');
      const weeklyEl = document.getElementById('preview-weekly');
      const totalEl = document.getElementById('preview-total');
      const endDateEl = document.getElementById('preview-end-date');
      const nextDateEl = document.getElementById('preview-next-date');
      
      if (durationEl) durationEl.textContent = preview.duration;
      if (weeklyEl) weeklyEl.textContent = `${symbol}${preview.weekly.toLocaleString()}`;
      if (totalEl) totalEl.textContent = `${symbol}${preview.total.toLocaleString()}`;
      if (endDateEl) endDateEl.textContent = preview.endDate;
      if (nextDateEl) nextDateEl.textContent = preview.nextDate;
      
      this.renderTempParticipants();
    },
    
    addTempParticipant(name = '', phone = '') {
      if (this.tempParticipants.length >= 50) {
        showToast('⚠️ Máximo 50 participantes', 'warning');
        return;
      }
      
      if (!name) {
        name = prompt('👤 Nombre del participante:');
        if (!name) return;
      }
      if (!phone) {
        phone = prompt('📱 Teléfono (10 dígitos, opcional):') || '';
      }
      
      this.tempParticipants.push({
        id: Date.now() + Math.random(),
        name: name.trim(),
        phone: phone.trim(),
        turn: this.tempParticipants.length + 1
      });
      
      this.updatePreview();
      showToast(`✅ ${name} agregado temporalmente`);
    },
    
    removeTempParticipant(id) {
      this.tempParticipants = this.tempParticipants.filter(p => p.id !== id);
      this.updatePreview();
    },
    
    renderTempParticipants() {
      const container = document.getElementById('participants-preview');
      if (!container) return;
      
      if (!this.tempParticipants.length) {
        container.innerHTML = '<div class="empty-preview">Los participantes aparecerán aquí...</div>';
        return;
      }
      
      container.innerHTML = this.tempParticipants.map(p => `
        <span class="participant-chip">
          ${escapeHtml(p.name)}
          <button type="button" class="remove" data-id="${p.id}" title="Eliminar">✕</button>
        </span>
      `).join('');
      
      container.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.removeTempParticipant(parseInt(e.currentTarget.dataset.id));
        });
      });
    },
    
    initConfirmModal() {
      const modal = document.getElementById('modal-confirm-tanda');
      if (!modal) return;
      
      modal.querySelectorAll('.modal-close').forEach(btn => 
        btn.addEventListener('click', () => modal.classList.add('hidden'))
      );
      
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
      
      const confirmBtn = document.getElementById('btn-confirm-create');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          this.createTanda();
          modal.classList.add('hidden');
        });
      }
    },
    
    handleSubmit(e) {
      e.preventDefault();
      
      const name = this.fields.name?.value.trim();
      const amount = parseFloat(this.fields.amount?.value);
      
      if (!name || name.length < 3) {
        showToast('❌ El nombre debe tener al menos 3 caracteres', 'error');
        if (this.fields.name) this.fields.name.focus();
        return;
      }
      if (!amount || amount < 10) {
        showToast('❌ El monto mínimo es $10', 'error');
        if (this.fields.amount) this.fields.amount.focus();
        return;
      }
      
      const participants = parseInt(this.fields.participants?.value);
      const frequency = this.fields.frequency?.value;
      const startDate = new Date(this.fields.start?.value);
      const preview = this.calculatePreview(amount, participants, frequency, startDate);
      
      const confirmName = document.getElementById('confirm-name');
      const confirmAmount = document.getElementById('confirm-amount');
      const confirmParticipants = document.getElementById('confirm-participants');
      const confirmDuration = document.getElementById('confirm-duration');
      
      if (confirmName) confirmName.textContent = name;
      if (confirmAmount) confirmAmount.textContent = formatCurrency(amount, this.fields.currency?.value);
      if (confirmParticipants) confirmParticipants.textContent = participants;
      if (confirmDuration) confirmDuration.textContent = preview.duration;
      
      const modal = document.getElementById('modal-confirm-tanda');
      if (modal) modal.classList.remove('hidden');
    },
    
    createTanda() {
      const tanda = {
        id: crypto.randomUUID?.() || `tanda_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: this.fields.name.value.trim(),
        amount: parseFloat(this.fields.amount.value),
        currency: this.fields.currency.value,
        frequency: this.fields.frequency.value,
        startDate: this.fields.start.value,
        totalWeeks: parseInt(this.fields.participants.value),
        currentWeek: 1,
        createdAt: new Date().toISOString(),
        participants: this.tempParticipants.length 
          ? this.tempParticipants.map((p, i) => ({
              id: i + 1,
              name: p.name,
              phone: p.phone,
              status: 'active',
              paidWeeks: [],
              nextTurn: p.turn,
              received: false
            }))
          : []
      };
      
      MultiTanda.save(tanda.id, tanda);
      MultiTanda.setActive(tanda.id);
      
      this.tempParticipants = [];
      if (this.el) this.el.reset();
      this.updatePreview();
      
      const selector = document.getElementById('tanda-selector');
      if (selector && selector._updateList) selector._updateList();
      
      showToast('🎉 ¡Tanda creada exitosamente!', 'success');
      renderView('dashboard');
    }
  };
  
  // ========================================
  // ✏️ COMPONENT: EDITAR PARTICIPANTE
  // ========================================
  const editParticipantModal = {
    el: document.getElementById('modal-edit-participant'),
    form: document.getElementById('form-edit-participant'),
    idField: document.getElementById('edit-participant-id'),
    nameField: document.getElementById('edit-name'),
    phoneField: document.getElementById('edit-phone'),
    turnField: document.getElementById('edit-turn'),
    
    open(p) {
      if (!p || !this.el) return;
      if (this.idField) this.idField.value = p.id;
      if (this.nameField) this.nameField.value = p.name;
      if (this.phoneField) this.phoneField.value = p.phone;
      if (this.turnField) this.turnField.value = p.nextTurn;
      
      this.el.classList.remove('hidden');
      if (this.nameField) this.nameField.focus();
      document.body.style.overflow = 'hidden';
    },
    
    close() {
      if (!this.el) return;
      this.el.classList.add('hidden');
      document.body.style.overflow = '';
      if (this.form) this.form.reset();
    },
    
    init() {
      if (!this.el) return;
      
      this.el.querySelectorAll('.modal-close').forEach(btn => 
        btn.addEventListener('click', () => this.close())
      );
      
      this.el.addEventListener('click', e => { if (e.target === this.el) this.close(); });
      
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !this.el.classList.contains('hidden')) this.close();
      });
      
      if (this.form) {
        this.form.addEventListener('submit', e => {
          e.preventDefault();
          this.saveChanges();
        });
      }
    },
    
    saveChanges() {
      const id = parseInt(this.idField?.value);
      const name = this.nameField?.value.trim();
      const phone = this.phoneField?.value.trim().replace(/\D/g, '');
      const turn = parseInt(this.turnField?.value);
      
      if (!name || name.length < 2 || !phone || phone.length !== 10) {
        showToast('❌ Verifica nombre y teléfono', 'error');
        return;
      }
      
      const t = getTanda();
      const p = t.participants.find(x => x.id === id);
      if (!p) return;
      
      p.name = name;
      p.phone = phone;
      p.nextTurn = turn;
      t.participants.sort((a, b) => a.nextTurn - b.nextTurn);
      
      saveTanda(t);
      renderParticipants();
      initCharts();
      this.close();
      showToast(`✅ ${name} actualizado`);
    }
  };
  
  // ========================================
  // SELECTOR DE TANDA
  // ========================================
  function renderTandaSelector() {
    const select = document.getElementById('tanda-selector');
    if (!select) return;
    
    const list = MultiTanda.getList();
    if (!list.length) {
      select.innerHTML = '<option value="">Sin tandas</option>';
      return;
    }
    
    const activeId = sessionStorage.getItem('rondapay_active_tanda');
    select.innerHTML = list.map(id => {
      const t = MultiTanda.get(id);
      const name = t?.name || 'Sin nombre';
      const selected = id === activeId ? 'selected' : '';
      return `<option value="${id}" ${selected}>${escapeHtml(name)}</option>`;
    }).join('');
    
    // Guardar función de actualización
    select._updateList = () => renderTandaSelector();
  }
  
  function setupTandaSelector() {
    const select = document.getElementById('tanda-selector');
    if (!select) return;
    
    renderTandaSelector();
    
    select.addEventListener('change', e => {
      const id = e.target.value;
      if (id) {
        MultiTanda.setActive(id);
        showToast('🔄 Tanda cambiada', 'info');
        renderView(state.currentView);
      }
    });
  }
  
  // ========================================
  // PWA
  // ========================================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(r => console.log('✅ SW registrado:', r.scope))
        .catch(e => console.error('❌ Error SW:', e));
    }
  }
  
  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.deferredPrompt = e;
      if (el.installBtn) el.installBtn.classList.remove('hidden');
    });
    
    window.addEventListener('appinstalled', () => {
      console.log('🎉 PWA instalada');
      if (el.installBtn) el.installBtn.classList.add('hidden');
      state.deferredPrompt = null;
    });
  }
  
  // ========================================
  // ESTILOS DINÁMICOS
  // ========================================
  function injectDynamicStyles() {
    if (document.getElementById('rondapay-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'rondapay-styles';
    style.textContent = `
      @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      
      .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; backdrop-filter: blur(4px); animation: fadeIn .2s ease; }
      .modal-overlay.hidden { display: none !important; }
      .modal-card { background: var(--surface); border-radius: 20px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,.2); animation: slideUp .3s ease; }
      .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .modal-header h3 { margin: 0; font-size: 1.1rem; }
      .modal-footer, .form-actions { display: flex; gap: 12px; margin-top: 20px; justify-content: flex-end; }
      .list-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--surface); border-radius: 12px; margin-bottom: 8px; transition: transform .1s, box-shadow .2s; cursor: pointer; }
      .list-item:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
      .avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 1.1rem; flex-shrink: 0; }
      .info { flex: 1; min-width: 0; }
      .info h4 { margin: 0; font-size: .95rem; }
      .info p { margin: 2px 0; font-size: .8rem; color: var(--text-secondary); }
      .info .meta { font-size: .75rem; opacity: .8; }
      .actions { display: flex; align-items: center; gap: 8px; }
      .status { padding: 4px 10px; border-radius: 20px; font-size: .75rem; font-weight: 500; }
      .status.active { background: rgba(16,185,129,.15); color: #10b981; }
      .status.pending { background: rgba(245,158,11,.15); color: #f59e0b; }
      .status.late { background: rgba(239,68,68,.15); color: #ef4444; }
      .status.paid { background: rgba(79,70,229,.15); color: #4f46e5; }
      .payment-history { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
      .week-badge { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 500; background: var(--border); color: var(--text); }
      .week-badge.paid { background: #10b981; color: #fff; }
      .progress-bar { height: 6px; background: var(--border); border-radius: 3px; margin: 8px 0; overflow: hidden; }
      .progress-fill { height: 100%; background: #10b981; border-radius: 3px; transition: width .3s ease; }
      .icon-btn { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 6px; border-radius: 8px; transition: all .2s; color: var(--text); }
      .icon-btn:hover { background: var(--border); transform: scale(1.05); }
      .icon-btn.mark-paid.done { opacity: .6; cursor: default; }
      .icon-btn.mark-paid.done:hover { transform: none; background: none; }
      .btn-primary, .btn-secondary, .btn-outline { padding: 10px 16px; border-radius: 12px; font-weight: 500; cursor: pointer; border: none; font-size: .95rem; transition: all .2s; }
      .btn-primary { background: #4f46e5; color: #fff; }
      .btn-primary:hover { background: #4338ca; transform: translateY(-1px); }
      .btn-secondary { background: var(--border); color: var(--text); }
      .btn-secondary:hover { filter: brightness(.95); transform: translateY(-1px); }
      .btn-outline { background: transparent; border: 2px dashed var(--border); color: var(--text-secondary); width: 100%; text-align: center; }
      .btn-outline:hover { border-color: #4f46e5; color: #4f46e5; }
      .empty-state { text-align: center; padding: 32px 16px; color: var(--text-secondary); }
      .page-header { margin-bottom: 24px; }
      .page-header .subtitle { color: var(--text-secondary); margin: 4px 0 0; font-size: .95rem; }
      .tanda-form { display: flex; flex-direction: column; gap: 20px; }
      .form-section { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin: 0; }
      .form-row { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; }
      .form-row.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .form-group { display: flex; flex-direction: column; gap: 6px; }
      .form-group label { font-weight: 500; font-size: .9rem; }
      .form-group input, .form-group select { padding: 12px 14px; border: 2px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); font-size: 1rem; transition: all .2s; width: 100%; }
      .form-group input:focus, .form-group select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
      .preview-card { background: linear-gradient(135deg,rgba(79,70,229,.08),rgba(16,185,129,.08)); border: 1px solid rgba(79,70,229,.2); border-radius: 12px; padding: 16px; margin-top: 8px; }
      .preview-card h4 { margin: 0 0 12px; font-size: .95rem; color: #4f46e5; }
      .preview-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
      .preview-item { display: flex; flex-direction: column; gap: 4px; }
      .preview-label { font-size: .75rem; color: var(--text-secondary); }
      .preview-value { font-weight: 600; font-size: 1.1rem; color: var(--text); }
      .participants-preview { background: var(--bg); border-radius: 12px; padding: 12px; min-height: 60px; display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .empty-preview { width: 100%; text-align: center; color: var(--text-secondary); font-size: .85rem; padding: 8px; }
      .participant-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; font-size: .85rem; }
      .participant-chip .remove { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1rem; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; }
      .participant-chip .remove:hover { background: rgba(239,68,68,.1); }
      .templates-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px; background: var(--bg); border-radius: 12px; margin-bottom: 16px; }
      .templates-bar span { font-size: .85rem; color: var(--text-secondary); }
      .btn-chip { background: var(--surface); border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; font-size: .8rem; cursor: pointer; transition: all .2s; }
      .btn-chip:hover { border-color: #4f46e5; color: #4f46e5; }
          /* ✅ CORRECCIÓN: Input con prefijo de moneda */
    .input-with-prefix {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-with-prefix .currency-prefix {
      position: absolute;
      left: 14px;
      color: var(--text-secondary);
      font-weight: 500;
      pointer-events: none;
      font-size: 1.1rem;
      z-index: 1;
      background: transparent;
    }
    .input-with-prefix input {
      padding-left: 32px !important;  /* ✅ Espacio suficiente para el símbolo */
      padding-right: 14px;
      position: relative;
      z-index: 2;
      background: var(--bg);
    }
    /* Asegurar que el input tenga fondo sólido para cubrir el símbolo si es necesario */
    .input-with-prefix input:focus {
      background: var(--bg);
      z-index: 3;
    }
      @media (max-width: 600px) {
        .form-row.two-cols { grid-template-columns: 1fr; }
        .preview-grid { grid-template-columns: 1fr; }
        .form-actions, .modal-footer { flex-direction: column; }
        .form-actions .btn-primary, .form-actions .btn-secondary,
        .modal-footer .btn-primary, .modal-footer .btn-secondary { width: 100%; }
        .list-item { flex-wrap: wrap; }
        .actions { margin-left: 52px; margin-top: 8px; }
      }
      .theme-dark .preview-card { background: linear-gradient(135deg,rgba(79,70,229,.15),rgba(16,185,129,.15)); border-color: rgba(79,70,229,.3); }
    `;
    document.head.appendChild(style);
  }
  
  // ========================================
  // INICIALIZACIÓN
  // ========================================
  function init() {
    initTheme();
    MultiTanda.migrateLegacy();
    checkSession();
    checkAdminAccess();
    setupEventListeners();
    setupTandaSelector();
    registerSW();
    initInstallPrompt();
    
    setTimeout(() => {
      if (modal.init) modal.init();
      if (newTandaForm.init) newTandaForm.init();
      if (editParticipantModal.init) editParticipantModal.init();
    }, 50);
    
    injectDynamicStyles();
    
    if (window.location.hostname === 'localhost') {
      console.log('🚀 RondaPay initialized', {
        session: sessionStorage.getItem(CONFIG.SESSION_KEY) ? 'active' : 'guest',
        theme: localStorage.getItem(CONFIG.THEME_KEY) || 'light'
      });
    }
  }
  
  // Arranque
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
