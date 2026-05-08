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

  // Inicialización
  document.addEventListener('DOMContentLoaded', () => {
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
    el.menuToggle.addEventListener('click', () => el.menu.classList.add('open'));
    el.hideMenu.addEventListener('click', () => el.menu.classList.remove('open'));
    el.showMenu.addEventListener('click', () => {
      el.menu.classList.add('open');
      el.showMenu.classList.add('hidden');
    });
    el.menu.addEventListener('transitionend', () => {
      el.showMenu.classList.toggle('hidden', el.menu.classList.contains('open'));
    });

    // Navegación interna
    document.querySelectorAll('[data-view]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const view = e.target.dataset.view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${view}-view`)?.classList.add('active');
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
      navigator.serviceWorker.register('/sw.js').catch(console.error);
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
})();
