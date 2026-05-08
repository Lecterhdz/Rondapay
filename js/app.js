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
    newTandaDraft: null  // 👈 AGREGAR ESTA LÍNEA
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
      data: {
        labels: ['Pagado', 'Pendiente', 'Atrasado'],
        datasets: [{
          data: [12, 5, 3],
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
      data: {
        labels: weeks,
        datasets: [{
          label: 'Recaudado ($)',
          data: progressData,
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
      data: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        datasets: [{
          label: 'Ingresos Totales ($)',
          data: [1200, 1900, 2400, 3100, 2800, 4200],
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
      data: {
        labels: ['Grupo Alpha', 'Grupo Beta', 'Grupo Gamma'],
        datasets: [{
          data: [95, 78, 88], 
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
      // Dentro de renderParticipants(), modifica el HTML generado:
      return `
        <div class="list-item" data-id="${p.id}">
          <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
          <div class="info">
            <h4>${p.name}</h4>
            <p>📱 ${formatPhone(p.phone)} • Turno: #${p.nextTurn}</p>
            <p class="meta">💰 Pagadas: ${p.paidWeeks.length}/${tanda.totalWeeks}</p>
          </div>
          <div class="actions">
            <span class="status ${p.status}">${getStatusText(p.status)}</span>
            <button class="icon-btn mark-paid ${p.paidWeeks.includes(tanda.currentWeek) ? 'done' : ''}" 
                    data-id="${p.id}" title="Marcar pago">💵</button>
            <button class="icon-btn edit-participant" data-id="${p.id}" title="Editar">✏️</button>
            <button class="icon-btn delete-participant" data-id="${p.id}" title="Eliminar">🗑️</button>
          </div>
        </div>
      `;
      
      // Y agrega los event listeners al final de renderParticipants():
      list.querySelectorAll('.delete-participant').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteParticipant(parseInt(e.currentTarget.dataset.id));
        });
      });
      
      list.querySelectorAll('.edit-participant').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          editParticipant(parseInt(e.currentTarget.dataset.id));
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
        case 'new-tanda':  // 👈 AGREGAR ESTE CASO
          el.pageTitle.textContent = '➕ Nueva Tanda';
          // Resetear formulario al entrar
          if (newTandaForm.el) {
            newTandaForm.el.reset();
            newTandaForm.tempParticipants = [];
            newTandaForm.updatePreview();
          }          
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
  // 📅 HELPERS: FECHAS Y CÁLCULOS
  // ========================================
  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  
  function formatDate(date, options = {}) {
    return new Date(date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', ...options
    });
  }
  
  function calculateTandaPreview(amount, participants, frequency, startDate) {
    const freqDays = { weekly: 7, biweekly: 15, monthly: 30 };
    const totalWeeks = participants;
    const totalDays = freqDays[frequency] * totalWeeks;
    const endDate = addDays(startDate, totalDays);
    const nextDate = addDays(startDate, freqDays[frequency]);
    
    return {
      duration: `${totalWeeks} ${frequency === 'weekly' ? 'semanas' : frequency === 'biweekly' ? 'quincenas' : 'meses'}`,
      weekly: amount * participants,
      total: amount * participants * totalWeeks,
      endDate: formatDate(endDate),
      nextDate: formatDate(nextDate)
    };
  }
  
  function getCurrencySymbol(code) {
    return { MXN: '$', USD: '$', EUR: '€', COP: '$', PEN: 'S/' }[code] || '$';
  }
  
  function formatCurrency(amount, currency = 'MXN') {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency, minimumFractionDigits: 0
    }).format(amount);
  }
    
  // ========================================
  // 🚀 INICIALIZACIÓN PRINCIPAL
  // ========================================
  function init() {
    // 1️⃣ Inicializaciones base
    initTheme();
    initDefaultData();
    checkSession();
    checkAdminAccess();
    setupEventListeners();
    registerSW();
    initInstallPrompt();
    
    // 2️⃣ Inicializar componentes UI
    if (modal?.el) modal.init();              // Modal participante
    if (newTandaForm?.el) newTandaForm.init(); // Formulario nueva tanda
    
    // 3️⃣ Inyectar estilos dinámicos (solo si no existen)
    injectDynamicStyles();
    
    // 4️⃣ Logging de diagnóstico (solo desarrollo)
    if (window.location.hostname === 'localhost') {
      console.log('🚀 RondaPay initialized', {
        session: sessionStorage.getItem(CONFIG.SESSION_KEY) ? 'active' : 'guest',
        theme: localStorage.getItem(CONFIG.THEME_KEY) || 'light',
        tanda: Storage.get(CONFIG.DATA_KEY)?.name || 'none'
      });
    }
  }

  // ========================================
  // 🎨 INYECTOR DE ESTILOS DINÁMICOS
  // ========================================
  function injectDynamicStyles() {
    if (document.getElementById('rondapay-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'rondapay-styles';
    style.textContent = `
      /* === Animaciones Globales === */
      @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

      /* === Modales === */
      .modal-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000; padding: 16px;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        animation: fadeIn 0.2s ease;
      }
      .modal-overlay.hidden { display: none !important; }
      .modal-card {
        background: var(--surface); border-radius: 20px; padding: 24px;
        max-width: 420px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        animation: slideUp 0.3s ease;
      }
      .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .modal-header h3 { margin: 0; font-size: 1.1rem; }
      .modal-footer, .form-actions { display: flex; gap: 12px; margin-top: 20px; justify-content: flex-end; }
      
      /* Modal Confirmación */
      .modal-confirm { text-align: center; }
      .modal-icon { font-size: 3rem; margin-bottom: 8px; display: block; }
      .confirm-summary {
        background: var(--bg); border-radius: 12px; padding: 16px;
        text-align: left; margin: 16px 0;
      }
      .confirm-summary p { margin: 8px 0; display: flex; justify-content: space-between; font-size: 0.9rem; }
      .confirm-summary strong { color: var(--text); }
      .confirm-summary span { color: var(--text-secondary); }

      /* === Listas y Participantes === */
      .list-item {
        display: flex; align-items: center; gap: 12px; padding: 12px;
        background: var(--surface); border-radius: 12px; margin-bottom: 8px;
        transition: transform 0.1s, box-shadow 0.2s;
      }
      .list-item:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
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
      
      /* Estados */
      .status { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; }
      .status.active { background: rgba(16,185,129,0.15); color: var(--success); }
      .status.pending { background: rgba(245,158,11,0.15); color: var(--warning); }
      .status.late { background: rgba(239,68,68,0.15); color: var(--danger); }
      .status.paid { background: rgba(79,70,229,0.15); color: var(--primary); }

      /* Historial de pagos */
      .payment-history { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
      .week-badge {
        width: 28px; height: 28px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 0.75rem; font-weight: 500; background: var(--border); color: var(--text);
      }
      .week-badge.paid { background: var(--success); color: white; }
      .week-badge.received { box-shadow: 0 0 0 2px var(--primary); }

      /* Barras de progreso */
      .progress-bar { height: 6px; background: var(--border); border-radius: 3px; margin: 8px 0; overflow: hidden; }
      .progress-fill { height: 100%; background: var(--success); border-radius: 3px; transition: width 0.3s ease; }

      /* Botones de acción */
      .icon-btn {
        background: none; border: none; font-size: 1.1rem; cursor: pointer;
        padding: 6px; border-radius: 8px; transition: transform 0.1s, background 0.2s;
        color: var(--text);
      }
      .icon-btn:hover { background: var(--border); transform: scale(1.05); }
      .icon-btn.mark-paid.done { opacity: 0.6; cursor: default; }
      .icon-btn.mark-paid.done:hover { transform: none; background: none; }

      /* Botones principales */
      .btn-primary, .btn-secondary, .btn-outline {
        padding: 10px 16px; border-radius: 12px; font-weight: 500; cursor: pointer;
        border: none; font-size: 0.95rem; transition: transform 0.1s, filter 0.2s, background 0.2s;
      }
      .btn-primary { background: var(--primary); color: white; }
      .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
      .btn-secondary { background: var(--border); color: var(--text); }
      .btn-secondary:hover { filter: brightness(0.95); transform: translateY(-1px); }
      .btn-outline {
        background: transparent; border: 2px dashed var(--border);
        color: var(--text-secondary); width: 100%; text-align: center;
      }
      .btn-outline:hover { border-color: var(--primary); color: var(--primary); }
      .btn-lg { padding: 14px 28px; font-size: 1rem; }

      /* Estado vacío */
      .empty-state { text-align: center; padding: 32px 16px; color: var(--text-secondary); }

      /* === FORMULARIO: NUEVA TANDA === */
      .page-header { margin-bottom: 24px; }
      .page-header .subtitle { color: var(--text-secondary); margin: 4px 0 0; font-size: 0.95rem; }
      
      .tanda-form { display: flex; flex-direction: column; gap: 20px; }
      .form-section {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 16px; padding: 20px; margin: 0;
      }
      .form-section legend {
        font-weight: 600; padding: 0 8px; color: var(--primary);
        font-size: 1.05rem; width: auto; margin: 0;
      }
      .form-row { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; }
      .form-row.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .form-group { display: flex; flex-direction: column; gap: 6px; }
      .form-group label { font-weight: 500; font-size: 0.9rem; }
      .form-group small { color: var(--text-secondary); font-size: 0.75rem; margin-top: -4px; line-height: 1.3; }
      .form-group input, .form-group select {
        padding: 12px 14px; border: 2px solid var(--border); border-radius: 12px;
        background: var(--bg); color: var(--text); font-size: 1rem;
        transition: border-color 0.2s, box-shadow 0.2s;
        width: 100%;
      }
      .form-group input:focus, .form-group select:focus {
        outline: none; border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(79,70,229,0.15);
      }
      .form-group input:invalid:not(:placeholder-shown) { border-color: var(--danger); }

      /* Input con prefijo de moneda */
      .input-with-prefix { position: relative; display: flex; align-items: center; }
      .input-with-prefix .currency-prefix {
        position: absolute; left: 14px; color: var(--text-secondary);
        font-weight: 500; pointer-events: none; font-size: 1.1rem;
      }
      .input-with-prefix input { padding-left: 36px; }

      /* Preview Card */
      .preview-card {
        background: linear-gradient(135deg, rgba(79,70,229,0.08), rgba(16,185,129,0.08));
        border: 1px solid rgba(79,70,229,0.2); border-radius: 12px;
        padding: 16px; margin-top: 8px;
      }
      .preview-card h4 { margin: 0 0 12px; font-size: 0.95rem; color: var(--primary); }
      .preview-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .preview-item { display: flex; flex-direction: column; gap: 4px; }
      .preview-label { font-size: 0.75rem; color: var(--text-secondary); }
      .preview-value { font-weight: 600; font-size: 1.1rem; color: var(--text); }

      /* Participantes Preview */
      .participants-preview {
        background: var(--bg); border-radius: 12px; padding: 12px;
        min-height: 60px; display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;
      }
      .empty-preview {
        width: 100%; text-align: center; color: var(--text-secondary);
        font-size: 0.85rem; padding: 8px;
      }
      .participant-chip {
        display: inline-flex; align-items: center; gap: 6px;
        background: var(--surface); border: 1px solid var(--border);
        padding: 6px 12px; border-radius: 20px; font-size: 0.85rem;
      }
      .participant-chip .remove {
        background: none; border: none; color: var(--danger);
        cursor: pointer; font-size: 1rem; padding: 0; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        width: 18px; height: 18px; border-radius: 50%;
      }
      .participant-chip .remove:hover { background: rgba(239,68,68,0.1); }

      /* Help text */
      .help-text { color: var(--text-secondary); font-size: 0.85rem; margin: -8px 0 12px; }

      /* Templates bar */
      .templates-bar {
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        padding: 12px; background: var(--bg); border-radius: 12px; margin-bottom: 16px;
      }
      .templates-bar span { font-size: 0.85rem; color: var(--text-secondary); }
      .btn-chip {
        background: var(--surface); border: 1px solid var(--border);
        padding: 6px 12px; border-radius: 20px; font-size: 0.8rem;
        cursor: pointer; transition: all 0.2s;
      }
      .btn-chip:hover { border-color: var(--primary); color: var(--primary); }

      /* === RESPONSIVE === */
      @media (max-width: 600px) {
        .form-row.two-cols { grid-template-columns: 1fr; }
        .preview-grid { grid-template-columns: 1fr; }
        .form-actions, .modal-footer { flex-direction: column; }
        .form-actions .btn-primary, .form-actions .btn-secondary,
        .modal-footer .btn-primary, .modal-footer .btn-secondary { width: 100%; }
        .list-item { flex-wrap: wrap; }
        .actions { margin-left: 52px; margin-top: 8px; }
        .modal-card { padding: 20px 16px; }
      }

      @media (max-width: 480px) {
        .preview-grid { grid-template-columns: 1fr; }
        .participant-chip { font-size: 0.8rem; padding: 4px 10px; }
      }

      /* === TEMA OSCURO - AJUSTES === */
      .theme-dark .preview-card {
        background: linear-gradient(135deg, rgba(79,70,229,0.15), rgba(16,185,129,0.15));
        border-color: rgba(79,70,229,0.3);
      }
      .theme-dark .modal-card { box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
      .theme-dark .btn-chip:hover { background: rgba(79,70,229,0.2); }
    `;
    document.head.appendChild(style);
  }

  // ========================================
  // 🏁 ARRANQUE
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // ========================================
  // 🎯 MODAL: AGREGAR PARTICIPANTE
  // ========================================
  const modal = {
    el: document.getElementById('modal-participant'),
    form: document.getElementById('form-participant'),
    name: document.getElementById('p-name'),
    phone: document.getElementById('p-phone'),
    turn: document.getElementById('p-turn'),
    
    open() {
      this.el.classList.remove('hidden');
      this.name.focus();
      document.body.style.overflow = 'hidden'; // Prevenir scroll
    },
    
    close() {
      this.el.classList.add('hidden');
      document.body.style.overflow = '';
      this.form.reset();
    },
    
    init() {
      // Abrir modal desde botón
      document.getElementById('add-participant')?.addEventListener('click', () => this.open());
      
      // Cerrar modal
      this.el.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => this.close());
      });
      
      // Cerrar al hacer click fuera
      this.el.addEventListener('click', (e) => {
        if (e.target === this.el) this.close();
      });
      
      // Cerrar con tecla Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.el.classList.contains('hidden')) {
          this.close();
        }
      });
      
      // Submit del formulario
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    },
    
    handleSubmit() {
      const name = this.name.value.trim();
      const phone = this.phone.value.trim().replace(/\D/g, '');
      const turn = parseInt(this.turn.value);
      
      // Validaciones adicionales
      if (name.length < 2) {
        this.showError('El nombre debe tener al menos 2 caracteres');
        this.name.focus();
        return;
      }
      if (phone.length !== 10) {
        this.showError('El teléfono debe tener 10 dígitos');
        this.phone.focus();
        return;
      }
      
      // Agregar participante
      const success = addParticipant(name, phone, turn);
      if (success) {
        this.close();
        showToast('✅ Participante agregado exitosamente');
      }
    },
    
    showError(msg) {
      showToast(msg, 'error');
      // Efecto visual de error en el input
      const input = event?.target || this.name;
      input.style.borderColor = 'var(--danger)';
      setTimeout(() => input.style.borderColor = '', 2000);
    }
  };

  // ========================================
  // ➕ FUNCIÓN addParticipant ACTUALIZADA
  // ========================================
  function addParticipant(name, phone, turn = 1) {
    const tanda = getTanda();
    if (!tanda) return false;
    
    // Validar duplicados por teléfono
    if (tanda.participants.some(p => p.phone === phone)) {
      showToast('⚠️ Este teléfono ya está registrado', 'warning');
      return false;
    }
    
    const newId = Math.max(...tanda.participants.map(p => p.id), 0) + 1;
    const nextTurn = turn || Math.max(...tanda.participants.map(p => p.nextTurn || 0), 0) + 1;
    
    tanda.participants.push({
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      status: 'active',
      paidWeeks: [],
      nextTurn: nextTurn,
      received: false,
      createdAt: new Date().toISOString()
    });
    
    // Ordenar por número de turno
    tanda.participants.sort((a, b) => a.nextTurn - b.nextTurn);
    
    saveTanda(tanda);
    
    // Re-renderizar si estamos en vista participantes
    if (state.currentView === 'participants') {
      renderParticipants();
      initCharts();
    }
    
    return true;
  }

  // ========================================
  // 🗑️ ELIMINAR PARTICIPANTE
  // ========================================
  function deleteParticipant(id) {
    if (!confirm('¿Eliminar este participante? Esta acción no se puede deshacer.')) {
      return;
    }
    
    const tanda = getTanda();
    const index = tanda.participants.findIndex(p => p.id === id);
    
    if (index !== -1) {
      const removed = tanda.participants.splice(index, 1)[0];
      saveTanda(tanda);
      renderParticipants();
      initCharts();
      showToast(`🗑️ ${removed.name} eliminado`);
    }
  }
  // ========================================
  // 🆕 FORMULARIO: NUEVA TANDA
  // ========================================
  const newTandaForm = {
    el: document.getElementById('form-new-tanda'),
    fields: {},
    tempParticipants: [],
    
    init() {
      if (!this.el) return;
      
      // Cache de campos
      this.fields = {
        name: document.getElementById('t-name'),
        amount: document.getElementById('t-amount'),
        currency: document.getElementById('t-currency'),
        frequency: document.getElementById('t-frequency'),
        participants: document.getElementById('t-participants'),
        start: document.getElementById('t-start')
      };
      
      // Establecer fecha mínima = hoy
      const today = new Date().toISOString().split('T')[0];
      this.fields.start.min = today;
      this.fields.start.value = today;
      
      // Event listeners para preview en tiempo real
      Object.values(this.fields).forEach(field => {
        field?.addEventListener('input', () => this.updatePreview());
        field?.addEventListener('change', () => this.updatePreview());
      });
      
      // Preview inicial
      this.updatePreview();
      
      // Agregar participante rápido
      document.getElementById('btn-add-participant-inline')?.addEventListener('click', () => {
        this.addTempParticipant();
      });
      
      // Submit del formulario
      this.el.addEventListener('submit', (e) => this.handleSubmit(e));
      
      // Modal de confirmación
      this.initConfirmModal();
    },
    
    updatePreview() {
      const amount = parseFloat(this.fields.amount?.value) || 0;
      const participants = parseInt(this.fields.participants?.value) || 2;
      const frequency = this.fields.frequency?.value || 'weekly';
      const startDate = this.fields.start?.value || new Date().toISOString().split('T')[0];
      const currency = this.fields.currency?.value || 'MXN';
      
      const preview = calculateTandaPreview(amount, participants, frequency, new Date(startDate));
      const symbol = getCurrencySymbol(currency);
      
      // Actualizar DOM
      document.getElementById('preview-duration').textContent = preview.duration;
      document.getElementById('preview-weekly').textContent = `${symbol}${preview.weekly.toLocaleString()}`;
      document.getElementById('preview-total').textContent = `${symbol}${preview.total.toLocaleString()}`;
      document.getElementById('preview-end-date').textContent = preview.endDate;
      document.getElementById('preview-next-date').textContent = preview.nextDate;
      
      // Actualizar preview de participantes
      this.renderTempParticipants();
    },
    
    addTempParticipant(name = '', phone = '') {
      if (this.tempParticipants.length >= 50) {
        showToast('⚠️ Máximo 50 participantes', 'warning');
        return;
      }
      
      // Si no hay datos, mostrar prompt simple (mejorar con modal después)
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
          ${p.name}
          <button type="button" class="remove" data-id="${p.id}" title="Eliminar">✕</button>
        </span>
      `).join('');
      
      // Event delegation para eliminar
      container.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeTempParticipant(parseInt(e.currentTarget.dataset.id));
        });
      });
    },
    
    initConfirmModal() {
      const modal = document.getElementById('modal-confirm-tanda');
      const closeBtns = modal?.querySelectorAll('.modal-close');
      const confirmBtn = document.getElementById('btn-confirm-create');
      
      closeBtns?.forEach(btn => {
        btn.addEventListener('click', () => modal.classList.add('hidden'));
      });
      
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
      
      confirmBtn?.addEventListener('click', () => {
        this.createTanda();
        modal.classList.add('hidden');
      });
    },
    
    handleSubmit(e) {
      e.preventDefault();
      
      // Validación básica
      const name = this.fields.name?.value.trim();
      const amount = parseFloat(this.fields.amount?.value);
      
      if (!name || name.length < 3) {
        showToast('❌ El nombre debe tener al menos 3 caracteres', 'error');
        this.fields.name?.focus();
        return;
      }
      
      if (!amount || amount < 10) {
        showToast('❌ El monto mínimo es $10', 'error');
        this.fields.amount?.focus();
        return;
      }
      
      // Preparar resumen para confirmación
      const preview = calculateTandaPreview(
        amount,
        parseInt(this.fields.participants.value),
        this.fields.frequency.value,
        new Date(this.fields.start.value)
      );
      
      document.getElementById('confirm-name').textContent = name;
      document.getElementById('confirm-amount').textContent = formatCurrency(amount, this.fields.currency.value);
      document.getElementById('confirm-participants').textContent = this.fields.participants.value;
      document.getElementById('confirm-duration').textContent = preview.duration;
      
      // Mostrar modal de confirmación
      document.getElementById('modal-confirm-tanda')?.classList.remove('hidden');
    },
    
    createTanda() {
      const tanda = {
        id: crypto.randomUUID?.() || Date.now().toString(36),
        name: this.fields.name.value.trim(),
        amount: parseFloat(this.fields.amount.value),
        currency: this.fields.currency.value,
        frequency: this.fields.frequency.value,
        startDate: this.fields.start.value,
        totalWeeks: parseInt(this.fields.participants.value),
        currentWeek: 1,
        createdAt: new Date().toISOString(),
        participants: this.tempParticipants.length ? 
          this.tempParticipants.map((p, i) => ({
            id: i + 1,
            name: p.name,
            phone: p.phone,
            status: 'active',
            paidWeeks: [],
            nextTurn: p.turn,
            received: false
          })) :
          [] // Se pueden agregar después
      };
      
      // Guardar y limpiar
      Storage.set(CONFIG.DATA_KEY, tanda);
      this.tempParticipants = [];
      
      // Resetear formulario
      this.el?.reset();
      this.updatePreview();
      
      // Navegar al dashboard y actualizar UI
      showToast('🎉 ¡Tanda creada exitosamente!');
      renderView('dashboard');
      
      // Si no hay participantes, sugerir agregar
      if (!tanda.participants.length) {
        setTimeout(() => {
          showToast('💡 Tip: Agrega participantes desde el menú 👥', 'info');
        }, 2000);
      }
    }
  };
    
   function generateShareLink(tanda) {
    const config = btoa(JSON.stringify({
      n: tanda.name, a: tanda.amount, c: tanda.currency,
      f: tanda.frequency, p: tanda.totalWeeks
    }));
    return `${window.location.origin}${window.location.pathname}?template=${config}`;
  }   
  // ========================================
  // ✏️ EDITAR PARTICIPANTE (placeholder)
  // ========================================
  function editParticipant(id) {
    const tanda = getTanda();
    const p = tanda.participants.find(x => x.id === id);
    if (!p) return;
    
    // Abrir modal con datos prellenados (futuro)
    showToast('🔧 Edición próximamente', 'info');
  }
})(); // ← FIN DEL IIFE
