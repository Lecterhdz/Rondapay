(() => {
  // Configuración
  const CONFIG = {
    VALID_LICENSE: 'RONDA2026', // Cambiar por validación backend en prod
    ADMIN_PASSWORD: 'admin123',
    THEME_KEY: 'rondapay-theme',
    SESSION_KEY: 'rondapay-session'
  };

  // Estado
  const state = {
    isAdmin: false,
    deferredPrompt: null
  };
  const charts = {};
  // DOM
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
    pageTitle: document.getElementById('page-title')
  };
  // ========================================
  // 📦 CAPA DE DATOS - PEGAR AQUÍ
  // ========================================
  const Storage = {
    get(key) { 
      try { 
        return JSON.parse(localStorage.getItem(key)) || null; 
      } catch { 
        return null; 
      } 
    },
    set(key, val) { 
      localStorage.setItem(key, JSON.stringify(val)); 
    },
    clear() { 
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('rondapay_')) localStorage.removeItem(k);
      }); 
    }
  };

  function initDefaultData() {
    if (!Storage.get('rondapay_tanda')) {
      Storage.set('rondapay_tanda', {
        name: 'Ronda #1',
        amount: 1000,
        frequency: 'semanal',
        startDate: new Date().toISOString().split('T')[0],
        participants: [
          { id: 1, name: 'Ana López', phone: '5551234567', status: 'active', paidWeeks: [1,2], nextTurn: 3 },
          { id: 2, name: 'Carlos Ruiz', phone: '5557654321', status: 'active', paidWeeks: [1], nextTurn: 4 },
          { id: 3, name: 'María Díaz', phone: '5559876543', status: 'pending', paidWeeks: [], nextTurn: 5 }
        ]
      });
    }
  }
  // ========================================
  // FIN CAPA DE DATOS
  // ========================================
  
  // Inicialización
  document.addEventListener('DOMContentLoaded', () => {
    initDefaultData(); 
    initTheme();
    checkSession();
    checkAdminAccess();
    setupEventListeners();
    registerSW();
    initInstallPrompt();
  });

  // Tema
  function initTheme() {
    const saved = localStorage.getItem(CONFIG.THEME_KEY) || 'light';
    document.documentElement.className = saved === 'dark' ? 'theme-dark' : '';
    el.themeToggle.textContent = saved === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('theme-dark');
    const theme = isDark ? 'dark' : 'light';
    localStorage.setItem(CONFIG.THEME_KEY, theme);
    el.themeToggle.textContent = isDark ? '☀️' : '🌙';
  }

  // Autenticación
  function checkSession() {
    const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
    if (token) showApp();
    else showLogin();
  }

  function login() {
    const key = el.licenseInput.value.trim();
    if (key === CONFIG.VALID_LICENSE) {
      sessionStorage.setItem(CONFIG.SESSION_KEY, 'active');
      showApp();
      initCharts();
    } else {
      el.loginError.classList.remove('hidden');
      el.licenseInput.value = '';
    }
  }

  function showLogin() {
    el.loginScreen.classList.add('active');
    el.mainApp.classList.remove('active');
    el.adminPanel.classList.remove('active');
  }

  function showApp() {
    el.loginScreen.classList.remove('active');
    el.mainApp.classList.add('active');
    el.appTitle.textContent = 'RondaPay';
    el.pageTitle.textContent = 'Mi Tanda';
  }

  function logout() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    showLogin();
  }

  // Admin por URL
  function checkAdminAccess() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      const pass = prompt('🔐 Clave de administrador:');
      if (pass === CONFIG.ADMIN_PASSWORD) {
        state.isAdmin = true;
        el.mainApp.classList.remove('active');
        el.adminPanel.classList.add('active');
        el.appTitle.textContent = 'Admin | RondaPay';
        setTimeout(initAdminCharts, 100);
      } else {
        alert('Acceso denegado');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }

  // UI
function setupEventListeners() {
  el.loginBtn.addEventListener('click', login);
  el.licenseInput.addEventListener('keypress', e => e.key === 'Enter' && login());
  el.themeToggle.addEventListener('click', toggleTheme);
  el.logoutBtn.addEventListener('click', logout);
  
  // Menú
  el.menuToggle.addEventListener('click', () => { el.menu.classList.add('open'); el.showMenu.classList.add('hidden'); });
  el.hideMenu.addEventListener('click', () => { el.menu.classList.remove('open'); setTimeout(() => el.showMenu.classList.remove('hidden'), 300); });
  el.showMenu.addEventListener('click', () => { el.menu.classList.add('open'); el.showMenu.classList.add('hidden'); });
  document.addEventListener('click', e => !el.menu.contains(e.target) && e.target !== el.menuToggle && el.menu.classList.remove('open'));

  // Navegación corregida
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const view = e.target.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('[data-view]').forEach(l => l.parentElement.classList.remove('active-link'));
      
      const target = document.getElementById(`${view}-view`);
      if (target) {
        target.classList.add('active');
        e.target.parentElement.classList.add('active-link');
        renderView(view); // 🔥 Render dinámico
      }
      el.menu.classList.remove('open');
    });
  });

  document.getElementById('admin-back').addEventListener('click', () => {
    window.history.replaceState({}, '', window.location.pathname);
    showLogin();
  });
}

  // Gráficos (Chart.js)
  function initCharts() {
    const ctx1 = document.getElementById('status-chart').getContext('2d');
    new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['Pagado', 'Pendiente', 'Atrasado'],
        datasets: [{ data: [12, 5, 3], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    const ctx2 = document.getElementById('progress-chart').getContext('2d');
    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'],
        datasets: [{ label: 'Aportación Recaudada ($)', data: [800, 1600, 2200, 3200, 4000], backgroundColor: '#4f46e5', borderRadius: 6 }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  function initAdminCharts() {
    const ctx1 = document.getElementById('admin-revenue-chart').getContext('2d');
    new Chart(ctx1, {
      type: 'line',
      data: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        datasets: [{ label: 'Ingresos Totales ($)', data: [1200, 1900, 2400, 3100, 2800, 4200], borderColor: '#4f46e5', tension: 0.3, fill: true, backgroundColor: 'rgba(79,70,229,0.1)' }]
      },
      options: { responsive: true }
    });

    const ctx2 = document.getElementById('admin-attendance-chart').getContext('2d');
    new Chart(ctx2, {
      type: 'polarArea',
      data: {
        labels: ['Grupo Alpha', 'Grupo Beta', 'Grupo Gamma'],
        datasets: [{ data: [95, 78, 88], backgroundColor: ['#10b981', '#f59e0b', '#4f46e5'] }]
      },
      options: { responsive: true }
    });
  }

  // PWA
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(console.error);
    }
  }

  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.deferredPrompt = e;
      el.installBtn.classList.remove('hidden');
    });

    el.installBtn.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      const result = await state.deferredPrompt.userChoice;
      if (result.outcome === 'accepted') el.installBtn.classList.add('hidden');
      state.deferredPrompt = null;
    });
  }

function renderView(view) {
  const tanda = Storage.get('rondapay_tanda');
  if (!tanda) return;

  if (view === 'participants') {
    const list = document.getElementById('participants-list');
    list.innerHTML = tanda.participants.length ? '' : '<div class="empty-state">No hay participantes aún</div>';
    
    tanda.participants.forEach(p => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="info"><h4>${p.name}</h4><p>📱 ${p.phone} • Semana turno: ${p.nextTurn}</p></div>
        <span class="status ${p.status}">${p.status === 'active' ? '✅ Activo' : '⏳ Pendiente'}</span>
      `;
      list.appendChild(div);
    });
  }

  if (view === 'payments') {
    const list = document.getElementById('payments-list');
    list.innerHTML = '<div class="list-item"><div class="info"><h4>Semana 1</h4><p>Recaudado: $2,000 / $3,000</p></div><span class="status paid">✅ Pagado</span></div>';
    list.innerHTML += '<div class="list-item"><div class="info"><h4>Semana 2</h4><p>Recaudado: $1,000 / $3,000</p></div><span class="status pending">⏳ Parcial</span></div>';
  }

  if (view === 'dashboard') initCharts();
}

// Inicializar datos al cargar
document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  initTheme();
  checkSession();
  checkAdminAccess();
  setupEventListeners();
  registerSW();
  initInstallPrompt();
});  
})();
