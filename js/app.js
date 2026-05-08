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
    currentView: 'dashboard'
  };

  // 📊 Registro de gráficos para evitar conflictos de Canvas
  const charts = {};

  // ========================================
  // 🎯 REFERENCIAS DOM
  // ========================================
  const el = {
    // Pantallas
    loginScreen: document.getElementById('login-screen'),
    mainApp: document.getElementById('main-app'),
    adminPanel: document.getElementById('admin-panel'),
    
    // Login
    licenseInput: document.getElementById('license-input'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    
    // UI Principal
    menu: document.getElementById('hamburger-menu'),
    menuToggle: document.getElementById('menu-toggle'),
    hideMenu: document.getElementById('hide-menu-btn'),
    showMenu: document.getElementById('show-menu-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    installBtn: document.getElementById('pwa-install'),
    logoutBtn: document.getElementById('logout-btn'),
    appTitle: document.getElementById('app-title'),
    pageTitle: document.getElementById('page-title'),
    
    // Contenido dinámico
    content: document.getElementById('content'),
    participantsList: document.getElementById('participants-list'),
    paymentsList: document.getElementById('payments-list'),
    
    // Controles
    searchParticipant: document.getElementById('search-participant'),
    addParticipantBtn: document.getElementById('add-participant'),
    paymentWeek: document.getElementById('payment-week'),
    markPaidBtn: document.getElementById('mark-paid')
  };

  // ========================================
  // 💾 CAPA DE DATOS - PERSISTENCIA LOCAL
  // ========================================
  const Storage = {
    get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (e) {
        console.error('❌ Error leyendo localStorage:', e);
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('❌ Error escribiendo en localStorage:', e);
        return false;
      }
    },
    remove(key) {
      localStorage.removeItem(key);
    },
    clearRondaPay() {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('rondapay_')) localStorage.removeItem(k);
      });
    }
  };

  // Datos por defecto para primera vez
  function initDefaultData() {
    const existing = Storage.get(CONFIG.DATA_KEY);
    if (!existing) {
      const defaultTanda = {
        id: crypto.randomUUID?.() || Date.now().toString(),
        name: 'Ronda #1',
        amount: 1000,
        currency: 'MXN',
        frequency: 'semanal',
        startDate: new Date().toISOString().split('T')[0],
        totalWeeks: 10,
        currentWeek: 1,
        participants: [
          { id: 1, name: 'Ana López', phone: '5551234567', status: 'active', paidWeeks: [1, 2], nextTurn: 3, received: false },
          { id: 2, name: 'Carlos Ruiz', phone: '5557654321', status: 'active', paidWeeks: [1], nextTurn: 4, received: false },
          { id: 3, name: 'María Díaz', phone: '5559876543', status: 'pending', paidWeeks: [], nextTurn: 5, received: false },
          { id: 4, name: 'Luis Gómez', phone: '5551112233', status: 'active', paidWeeks: [1, 2, 3], nextTurn: 6, received: true }
        ]
      };
      Storage.set(CONFIG.DATA_KEY, defaultTanda);
    }
  }

  // Getter/Setter para la tanda actual
  function getTanda() {
    return Storage.get(CONFIG.DATA_KEY);
  }

  function saveTanda(tanda) {
    Storage.set(CONFIG.DATA_KEY, tanda);
  }

  // ========================================
  // 🎨 GESTIÓN DE TEMA (CLARO/OSCURO)
  // ========================================
  function initTheme() {
    const saved = localStorage.getItem(CONFIG.THEME_KEY) || 'light';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem(CONFIG.THEME_KEY, theme);
    
    // Actualizar meta theme-color para barra de estado móvil
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0f172a' : '#4f46e5');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
  }

  // ========================================
  // 🔐 AUTENTICACIÓN Y SESIÓN
  // ========================================
  function checkSession() {
    const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
    if (token === 'active') {
      showApp();
      initDefaultData();
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
      initDefaultData();
      showApp();
      renderView('dashboard');
      showToast('✅ Bienvenido a RondaPay');
    } else {
      showLoginError('Clave inválida');
      el.licenseInput?.focus();
    }
  }

  function showLoginError(msg) {
    if (el.loginError) {
      el.loginError.textContent = msg;
      el.loginError.classList.remove('hidden');
      setTimeout(() => el.loginError.classList.add('hidden'), 3000);
    }
  }

  function showLogin() {
    hideAllScreens();
    el.loginScreen?.classList.add('active');
    el.licenseInput?.focus();
  }

  function showApp() {
    hideAllScreens();
    el.mainApp?.classList.add('active');
    el.appTitle.textContent = 'RondaPay';
  }

  function showAdmin() {
    hideAllScreens();
    el.adminPanel?.classList.add('active');
    el.appTitle.textContent = 'Admin | RondaPay';
  }

  function hideAllScreens() {
    [el.loginScreen, el.mainApp, el.adminPanel].forEach(screen => {
      screen?.classList.remove('active');
    });
  }

  function logout() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    showToast('👋 Sesión cerrada');
    setTimeout(showLogin, 500);
  }

  // Acceso admin vía URL ?admin=true
  function checkAdminAccess() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      const pass = prompt('🔐 Clave de administrador:');
      if (pass === CONFIG.ADMIN_PASSWORD) {
        state.isAdmin = true;
        showAdmin();
        initAdminCharts();
        // Limpiar parámetro de URL sin recargar
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (pass !== null) {
        alert('❌ Acceso denegado');
      }
    }
  }

  // ========================================
  // 📊 GESTIÓN DE GRÁFICOS (Chart.js Wrapper)
  // ========================================
  function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn(`⚠️ Canvas no encontrado: ${canvasId}`);
      return null;
    }
    
    // Destruir instancia previa si existe
    if (charts[canvasId]) {
      try {
        charts[canvasId].destroy();
      } catch (e) {
        console.warn('⚠️ Error destruyendo gráfico:', e);
      }
      delete charts[canvasId];
    }
    
    // Crear nueva instancia
    try {
      charts[canvasId] = new Chart(canvas, config);
      return charts[canvasId];
    } catch (e) {
      console.error(`❌ Error creando gráfico ${canvasId}:`, e);
      return null;
    }
  }

  function initCharts() {
    const tanda = getTanda();
    if (!tanda) return;
    
    // Calcular estadísticas reales
    const stats = calculateStats(tanda);
    
    // Gráfico 1: Estado de pagos (Doughnut)
    createChart('status-chart', {
      type: 'doughnut',
       {
        labels: ['Pagado', 'Pendiente', 'Atrasado'],
        datasets: [{
           [stats.paid, stats.pending, stats.late],
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

    // Gráfico 2: Progreso semanal (Bar)
    const weeks = Array.from({ length: Math.min(tanda.currentWeek, 6) }, (_, i) => `Sem ${i + 1}`);
    const progressData = weeks.map((_, i) => {
      const weekNum = i + 1;
      return tanda.participants.filter(p => p.paidWeeks.includes(weekNum)).length * tanda.amount;
    });

    createChart('progress-chart', {
      type: 'bar',
       {
        labels: weeks,
        datasets: [{
          label: 'Recaudado ($)',
           progressData,
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

  function initAdminCharts() {
    // Gráfico Admin 1: Ingresos mensuales (Line)
    createChart('admin-revenue-chart', {
      type: 'line',
       {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        datasets: [{
          label: 'Ingresos Totales ($)',
           [1200, 1900, 2400, 3100, 2800, 4200],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79,70,229,0.1)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#4f46e5',
          pointBorderWidth: 2,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });

    // Gráfico Admin 2: Asistencia por grupo (PolarArea)
    createChart('admin-attendance-chart', {
      type: 'polarArea',
       {
        labels: ['Grupo Alpha', 'Grupo Beta', 'Grupo Gamma'],
        datasets: [{
           [95, 78, 88],
          backgroundColor: ['rgba(16,185,129,0.7)', 'rgba(245,158,11,0.7)', 'rgba(79,70,229,0.7)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // Calcular estadísticas reales de la tanda
  function calculateStats(tanda) {
    const total = tanda.participants.length;
    const currentWeek = tanda.currentWeek;
    
    let paid = 0, pending = 0, late = 0;
    
    tanda.participants.forEach(p => {
      if (p.status === 'pending') {
        pending++;
      } else if (p.paidWeeks.includes(currentWeek)) {
        paid++;
      } else {
        late++;
      }
    });
    
    return { total, paid, pending, late };
  }

  // ========================================
  // 👥 GESTIÓN DE PARTICIPANTES
  // ========================================
  function renderParticipants(filter = '') {
    const tanda = getTanda();
    const list = el.participantsList;
    if (!list || !tanda) return;
    
    // Filtrar participantes
    const filtered = tanda.participants.filter(p => 
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.phone.includes(filter)
    );
    
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">🔍 No se encontraron participantes</div>';
      return;
    }
    
    list.innerHTML = filtered.map(p => {
      const isPaid = p.paidWeeks.includes(tanda.currentWeek);
      return `
        <div class="list-item" data-id="${p.id}">
          <div class="avatar">${p.name.charAt(0)}</div>
          <div class="info">
            <h4>${p.name}</h4>
            <p>📱 ${formatPhone(p.phone)} • Turno: #${p.nextTurn}</p>
            <p class="meta">💰 Pagadas: ${p.paidWeeks.length}/${tanda.totalWeeks} semanas</p>
          </div>
          <div class="actions">
            <span class="status ${p.status}">${getStatusText(p.status)}</span>
            <button class="icon-btn mark-paid ${isPaid ? 'done' : ''}" 
                    data-id="${p.id}" 
                    title="${isPaid ? 'Ya pagó' : 'Marcar como pagado'}">
              ${isPaid ? '✅' : '💵'}
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Event delegation para botones dinámicos
    list.querySelectorAll('.mark-paid').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(e.currentTarget.dataset.id);
        togglePayment(id);
      });
    });
    
    // Click en participante para ver detalles (futuro)
    list.querySelectorAll('.list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          const id = parseInt(item.dataset.id);
          showParticipantDetails(id);
        }
      });
    });
  }

  function togglePayment(participantId) {
    const tanda = getTanda();
    const p = tanda.participants.find(x => x.id === participantId);
    if (!p) return;
    
    const currentWeek = tanda.currentWeek;
    const weekIndex = p.paidWeeks.indexOf(currentWeek);
    
    if (weekIndex === -1) {
      // Marcar como pagado
      p.paidWeeks.push(currentWeek);
      p.paidWeeks.sort((a, b) => a - b);
      showToast(`✅ ${p.name} marcó pago - Semana ${currentWeek}`);
    } else {
      // Desmarcar pago
      p.paidWeeks.splice(weekIndex, 1);
      showToast(`⚠️ Pago desmarcado para ${p.name}`);
    }
    
    saveTanda(tanda);
    renderParticipants(el.searchParticipant?.value || '');
    initCharts(); // Actualizar gráficos con nuevos datos
  }

  function showParticipantDetails(id) {
    const tanda = getTanda();
    const p = tanda.participants.find(x => x.id === id);
    if (!p) return;
    
    // Modal simple (puedes mejorar con librería)
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>${p.name}</h3>
          <button class="icon-btn close-modal">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>📱 Teléfono:</strong> ${formatPhone(p.phone)}</p>
          <p><strong>📊 Estado:</strong> ${getStatusText(p.status)}</p>
          <p><strong>🔄 Próximo turno:</strong> Semana #${p.nextTurn}</p>
          <p><strong>💰 Historial de pagos:</strong></p>
          <div class="payment-history">
            ${Array.from({length: tanda.totalWeeks}, (_, i) => {
              const week = i + 1;
              const paid = p.paidWeeks.includes(week);
              const received = paid && p.received;
              return `<span class="week-badge ${paid ? 'paid' : ''} ${received ? 'received' : ''}" title="Semana ${week}">${week}</span>`;
            }).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.open('https://wa.me/52${p.phone}', '_blank')">💬 WhatsApp</button>
          <button class="btn-primary close-modal">Cerrar</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners del modal
    modal.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => modal.remove());
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  function addParticipant(name, phone) {
    if (!name || !phone) {
      showToast('❌ Nombre y teléfono son requeridos', 'error');
      return false;
    }
    
    const tanda = getTanda();
    const newId = Math.max(...tanda.participants.map(p => p.id), 0) + 1;
    
    tanda.participants.push({
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      status: 'active',
      paidWeeks: [],
      nextTurn: tanda.participants.length + 1,
      received: false
    });
    
    saveTanda(tanda);
    renderParticipants();
    initCharts();
    showToast(`✅ ${name} agregado a la ronda`);
    return true;
  }

  // ========================================
  // 💳 GESTIÓN DE PAGOS
  // ========================================
  function renderPayments(weekFilter = 'all') {
    const tanda = getTanda();
    const list = el.paymentsList;
    if (!list || !tanda) return;
    
    const weeks = Array.from({ length: tanda.totalWeeks }, (_, i) => i + 1);
    const filteredWeeks = weekFilter === 'all' ? weeks : [parseInt(weekFilter)];
    
    list.innerHTML = filteredWeeks.map(week => {
      const weekParticipants = tanda.participants.filter(p => p.status === 'active');
      const paidCount = weekParticipants.filter(p => p.paidWeeks.includes(week)).length;
      const totalExpected = weekParticipants.length * tanda.amount;
      const collected = paidCount * tanda.amount;
      const percent = Math.round((collected / totalExpected) * 100) || 0;
      
      return `
        <div class="list-item payment-week" data-week="${week}">
          <div class="info">
            <h4>📅 Semana ${week}</h4>
            <p>💰 Recaudado: $${collected.toLocaleString()} / $${totalExpected.toLocaleString()}</p>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percent}%"></div>
            </div>
            <p class="meta">${paidCount}/${weekParticipants.length} participantes pagaron</p>
          </div>
          <div class="actions">
            <span class="status ${percent === 100 ? 'paid' : percent > 0 ? 'pending' : 'late'}">
              ${percent === 100 ? '✅ Completo' : percent > 0 ? '⏳ Parcial' : '❌ Pendiente'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ========================================
  // 🔄 RENDERIZADO DINÁMICO DE VISTAS
  // ========================================
  function renderView(viewName) {
    state.currentView = viewName;
    
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Mostrar vista seleccionada
    const target = document.getElementById(`${viewName}-view`);
    if (target) {
      target.classList.add('active');
      
      // Renderizar contenido específico
      switch(viewName) {
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
      }
    }
    
    // Actualizar estado activo en menú
    document.querySelectorAll('[data-view]').forEach(link => {
      link.parentElement.classList.toggle('active-link', link.dataset.view === viewName);
    });
  }

  // ========================================
  // 🎛️ EVENT LISTENERS
  // ========================================
  function setupEventListeners() {
    // Login
    el.loginBtn?.addEventListener('click', login);
    el.licenseInput?.addEventListener('keypress', e => {
      if (e.key === 'Enter') login();
    });
    
    // Tema
    el.themeToggle?.addEventListener('click', toggleTheme);
    
    // Logout
    el.logoutBtn?.addEventListener('click', logout);
    
    // Menú hamburguesa
    const toggleMenu = (open) => {
      el.menu?.classList.toggle('open', open);
      el.showMenu?.classList.toggle('hidden', open);
    };
    
    el.menuToggle?.addEventListener('click', () => toggleMenu(true));
    el.hideMenu?.addEventListener('click', () => toggleMenu(false));
    el.showMenu?.addEventListener('click', () => toggleMenu(true));
    
    // Cerrar menú al hacer click fuera
    document.addEventListener('click', (e) => {
      if (el.menu?.classList.contains('open') && 
          !el.menu.contains(e.target) && 
          e.target !== el.menuToggle &&
          !el.menuToggle?.contains(e.target)) {
        toggleMenu(false);
      }
    });
    
    // Navegación entre vistas
    document.querySelectorAll('[data-view]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const view = e.currentTarget.dataset.view;
        renderView(view);
        toggleMenu(false);
      });
    });
    
    // Admin back button
    document.getElementById('admin-back')?.addEventListener('click', () => {
      window.history.replaceState({}, document.title, window.location.pathname);
      state.isAdmin = false;
      showApp();
      renderView('dashboard');
    });
    
    // Búsqueda de participantes
    el.searchParticipant?.addEventListener('input', (e) => {
      renderParticipants(e.target.value);
    });
    
    // Agregar participante (modal simple)
    el.addParticipantBtn?.addEventListener('click', () => {
      const name = prompt('👤 Nombre del participante:');
      if (name === null) return;
      const phone = prompt('📱 Teléfono (10 dígitos):');
      if (phone === null) return;
      addParticipant(name, phone);
    });
    
    // Filtro de pagos por semana
    el.paymentWeek?.addEventListener('change', (e) => {
      renderPayments(e.target.value);
    });
    
    // Marcar pago masivo (admin feature)
    el.markPaidBtn?.addEventListener('click', () => {
      const week = el.paymentWeek?.value || 'all';
      showToast(`🔧 Función "Marcar pagado" para semana ${week} - Próximamente`, 'info');
    });
    
    // PWA Install
    el.installBtn?.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      const { outcome } = await state.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        el.installBtn.classList.add('hidden');
        showToast('🎉 RondaPay instalada exitosamente');
      }
      state.deferredPrompt = null;
    });
  }

  // ========================================
  // 📱 PWA & SERVICE WORKER
  // ========================================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('✅ SW registrado:', reg.scope))
        .catch(err => console.error('❌ Error SW:', err));
    }
  }

  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      el.installBtn?.classList.remove('hidden');
    });
    
    window.addEventListener('appinstalled', () => {
      console.log('🎉 PWA instalada');
      el.installBtn?.classList.add('hidden');
      state.deferredPrompt = null;
    });
  }

  // ========================================
  // 🎨 UTILIDADES UI
  // ========================================
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const colors = {
      success: 'var(--success)',
      error: 'var(--danger)',
      info: 'var(--primary)',
      warning: 'var(--warning)'
    };
    
    toast.className = 'toast';
    toast.innerHTML = `
      <span style="margin-right: 8px;">
        ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
      </span>
      ${message}
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      left: 24px;
      max-width: 400px;
      margin: 0 auto;
      background: ${colors[type] || colors.success};
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 9999;
      font-size: 0.9rem;
      font-weight: 500;
      animation: slideUp 0.3s ease, fadeOut 0.3s ease 2.7s forwards;
      display: flex;
      align-items: center;
      pointer-events: none;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function formatPhone(phone) {
    const cleaned = ('' + phone).replace(/\D/g, '');
    if (cleaned.length === 10) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    }
    return phone;
  }

  function getStatusText(status) {
    return {
      'active': '✅ Activo',
      'pending': '⏳ Pendiente',
      'inactive': '❌ Inactivo'
    }[status] || status;
  }

  // ========================================
  // 📅 HELPERS DE FECHA
  // ========================================
  Date.prototype.getWeekNumber = function() {
    const d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  // ========================================
  // 🚀 INICIALIZACIÓN
  // ========================================
  function init() {
    initTheme();
    initDefaultData();
    checkSession();
    checkAdminAccess();
    setupEventListeners();
    registerSW();
    initInstallPrompt();
    
    // Agregar estilos para animaciones dinámicas
    if (!document.getElementById('rondapay-styles')) {
      const style = document.createElement('style');
      style.id = 'rondapay-styles';
      style.textContent = `
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
        }
        .modal-card {
          background: var(--surface); border-radius: 16px; padding: 20px;
          max-width: 400px; width: 100%; box-shadow: var(--shadow);
          animation: slideUp 0.3s ease;
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .modal-footer { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }
        .payment-history { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        .week-badge {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 500; background: var(--border); color: var(--text);
        }
        .week-badge.paid { background: var(--success); color: white; }
        .week-badge.received { box-shadow: 0 0 0 2px var(--primary); }
        
        .list-item { display: flex; align-items: center; gap: 12px; padding: 12px; }
        .avatar {
          width: 40px; height: 40px; border-radius: 50%;
          background: var(--primary); color: white;
          display: flex; align-items: center; justify-content: center;
          font-weight: 600; font-size: 1.1rem; flex-shrink: 0;
        }
        .info { flex: 1; min-width: 0; }
        .info h4 { margin: 0; font-size: 0.95rem; }
        .info p { margin: 2px 0; font-size: 0.8rem; color: var(--text-secondary); }
        .info .meta { font-size: 0.75rem; opacity: 0.8; }
        .actions { display: flex; align-items: center; gap: 8px; }
        .status { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; }
        .status.active { background: rgba(16,185,129,0.15); color: var(--success); }
        .status.pending { background: rgba(245,158,11,0.15); color: var(--warning); }
        .status.late { background: rgba(239,68,68,0.15); color: var(--danger); }
        .status.paid { background: rgba(79,70,229,0.15); color: var(--primary); }
        
        .progress-bar { height: 6px; background: var(--border); border-radius: 3px; margin: 8px 0; overflow: hidden; }
        .progress-fill { height: 100%; background: var(--success); border-radius: 3px; transition: width 0.3s ease; }
        
        .icon-btn.mark-paid { 
          background: none; border: none; font-size: 1.2rem; cursor: pointer; 
          padding: 4px; border-radius: 8px; transition: transform 0.1s;
        }
        .icon-btn.mark-paid:hover { transform: scale(1.1); background: var(--border); }
        .icon-btn.mark-paid.done { opacity: 0.6; cursor: default; }
        
        .btn-primary { background: var(--primary); color: white; border: none; padding: 10px 16px; border-radius: 10px; cursor: pointer; font-weight: 500; }
        .btn-secondary { background: var(--border); color: var(--text); border: none; padding: 10px 16px; border-radius: 10px; cursor: pointer; }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-secondary:hover { filter: brightness(0.95); }
        
        .empty-state { text-align: center; padding: 32px 16px; color: var(--text-secondary); }
        
        @media (max-width: 480px) {
          .list-item { flex-wrap: wrap; }
          .actions { margin-left: 52px; margin-top: 8px; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ========================================
  // 🏁 ARRANQUE
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(); // ← FIN DEL IIFE
