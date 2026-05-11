(() => {
  // 🔗 Backend: Supabase (fallback a localStorage si no está disponible)
  const useSupabase = typeof window.SyncDB !== 'undefined';
  const DataLayer = useSupabase ? window.SyncDB : {
    // Fallback compatible con tu código actual
    getActiveTanda: () => MultiTanda.getActive(),
    saveTanda: (t) => { MultiTanda.save(t.id, t); MultiTanda.setActive(t.id); },
    markPayment: async (pid, week, amount) => {
      // Fallback local
      const t = getTanda();
      const p = t.participants.find(x => x.id === pid);
      if (p) {
        const idx = p.paidWeeks.indexOf(week);
        if (idx === -1) p.paidWeeks.push(week);
        else p.paidWeeks.splice(idx, 1);
        MultiTanda.save(t.id, t);
      }
    },
    subscribeToTanda: () => ({ unsubscribe: () => {} }), // No-op fallback
    signInWithLicense: async (key) => ({ error: key !== 'RONDA2026' ? 'Invalid' : null }),
    signOut: () => {},
    getCurrentUser: async () => ({ data: { user: key === 'RONDA2026' ? { id: 'local' } : null } })
  };
  
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
    saveTimeout: null
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
    _cache: new Map(),
    
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

  // Después (compatibilidad total):
  function getTanda() { 
    return useSupabase ? DataLayer.getActiveTanda() : MultiTanda.getActive(); 
  }
  async function saveTanda(tanda) { 
    if (useSupabase) {
      try {
        await DataLayer.saveTanda(tanda);
      } catch (e) {
        // Fallback a localStorage si falla
        MultiTanda.save(t.id, tanda);
        console.warn('⚠️ Guardado en localStorage por error de red');
      }
    } else {
      MultiTanda.save(t.id, tanda);
    }
  }

  // ========================================
  // 🎨 UTILIDADES UI
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
  
  function calculateTandaPreview(amount, participants, frequency, startDate) {
    const freqDays = { weekly: 7, biweekly: 15, monthly: 30 };
    const totalWeeks = participants;
    const totalDays = freqDays[frequency] * totalWeeks;
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);
    
    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + freqDays[frequency]);
    
    return {
      duration: `${totalWeeks} ${frequency === 'weekly' ? 'semanas' : frequency === 'biweekly' ? 'quincenas' : 'meses'}`,
      weekly: amount * participants,
      total: amount * participants * totalWeeks,
      endDate: formatDate(endDate),
      nextDate: formatDate(nextDate)
    };
  }
  
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
  
  function initAdminCharts() {
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

  // ========================================
  // 📤 EXPORTAR PAGOS A PDF
  // ========================================
  function exportPaymentsPDF() {
    const t = getTanda();
    if (!t) {
      showToast('❌ No hay tanda para exportar', 'error');
      return;
    }
    
    if (typeof window.jspdf === 'undefined') {
      showToast('⏳ Cargando generador de PDF...', 'info');
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => {
        const script2 = document.createElement('script');
        script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
        script2.onload = () => setTimeout(() => exportPaymentsPDF(), 100);
        document.head.appendChild(script2);
      };
      document.head.appendChild(script);
      return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const colors = { primary: [79, 70, 229], success: [16, 185, 129], warning: [245, 158, 11], danger: [239, 68, 68] };
    
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('🤝 RondaPay - Reporte de Pagos', 14, 14);
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const startDate = new Date(t.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + ((t.totalWeeks || 5) * 7));
    
    const infoLines = [
      `📌 Tanda: ${t.name || 'Sin nombre'}`,
      `💰 Monto: ${formatCurrency(t.amount, t.currency)} • ${t.frequency === 'weekly' ? 'Semanal' : t.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}`,
      `📅 Período: ${formatDate(startDate)} → ${formatDate(endDate)}`,
      `👥 Participantes: ${t.participants?.length || 0} activos`,
      `📊 Semana actual: ${t.currentWeek || 1} / ${t.totalWeeks || 5}`,
      `🕒 Generado: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    ];
    
    infoLines.forEach((line, i) => {
      doc.text(line, 14, 28 + (i * 5));
    });
    
    const activeParticipants = (t.participants || []).filter(p => p.status !== 'inactive');
    const totalExpected = activeParticipants.length * (t.totalWeeks || 5) * (t.amount || 0);
    const totalCollected = activeParticipants.reduce((sum, p) => sum + ((p.paidWeeks?.length || 0) * (t.amount || 0)), 0);
    const percentage = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
    
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 58, 82, 22, 'F');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(`💰 Total recaudado: ${formatCurrency(totalCollected, t.currency)}`, 18, 66);
    doc.text(`🎯 Meta total: ${formatCurrency(totalExpected, t.currency)}`, 18, 73);
    doc.text(`📈 Cumplimiento: ${percentage}%`, 18, 80);
    
    const weeks = Array.from({ length: t.totalWeeks || 5 }, (_, i) => `S${i + 1}`);
    const body = activeParticipants.map(p => {
      const paidWeeks = Array.isArray(p.paidWeeks) ? p.paidWeeks : [];
      const cells = weeks.map((_, i) => {
        const weekNum = i + 1;
        const isPaid = paidWeeks.includes(weekNum);
        const isLate = weekNum < (t.currentWeek || 1) && !isPaid;
        return isPaid ? '✅' : (isLate ? '❌' : '⏳');
      });
      const totalPaid = paidWeeks.length * (t.amount || 0);
      return [`${p.name} (Turno #${p.nextTurn})`, ...cells, formatCurrency(totalPaid, t.currency)];
    });
    
    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: 90,
        head: [['Participante', ...weeks, 'Total']],
        body: body,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak', halign: 'center', valign: 'middle' },
        headStyles: { fillColor: colors.primary, textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'left', cellWidth: 40 },
          [weeks.length + 1]: { halign: 'right', cellWidth: 25 }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index > 0 && data.column.index < weeks.length + 1) {
            const value = data.cell.text[0];
            if (value === '✅') data.cell.styles.textColor = colors.success;
            else if (value === '❌') data.cell.styles.textColor = colors.danger;
            else if (value === '⏳') data.cell.styles.textColor = colors.warning;
          }
        }
      });
      
      const weeklySummary = weeks.map((_, i) => {
        const weekNum = i + 1;
        const paidCount = activeParticipants.filter(p => (p.paidWeeks || []).includes(weekNum)).length;
        const amountCollected = paidCount * (t.amount || 0);
        return [`Semana ${weekNum}`, `${paidCount}/${activeParticipants.length}`, formatCurrency(amountCollected, t.currency)];
      });
      
      const finalY = doc.lastAutoTable.finalY + 5;
      if (finalY < 200) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(colors.primary);
        doc.text('📊 Resumen por semana', 14, finalY);
        
        doc.autoTable({
          startY: finalY + 5,
          head: [['Semana', 'Pagos', 'Recaudado']],
          body: weeklySummary,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: colors.primary, textColor: 255, fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 40, halign: 'right' }
          }
        });
      }
    }
    
    const lastY = typeof doc.lastAutoTable !== 'undefined' && doc.lastAutoTable.finalY 
      ? doc.lastAutoTable.finalY + 12 
      : 120;
    
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'italic');
    doc.text('Reporte generado por RondaPay - Gestión de tandas', 14, lastY);
    doc.text('lecterhdz.github.io/Rondapay', 14, lastY + 5);
    
    const fileName = `RondaPay_${(t.name || 'reporte').replace(/[^a-z0-9ñáéíóú]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    showToast('📄 PDF exportado exitosamente', 'success');
  }

  // ========================================
  // 👥 PARTICIPANTES
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
  // 💳 PAGOS MATRIX
  // ========================================
  function renderPaymentsMatrix(weekFilter = 'all') {
    const t = getTanda();
    if (!t) return;
    
    // Suscribirse a cambios en tiempo real (solo si es backend)
    if (useSupabase && !window._tandaSubscription) {
      window._tandaSubscription = DataLayer.subscribeToTanda(t.id, (change) => {
        if (change.type === 'participant_change' || change.type === 'payment_change') {
          // Re-renderizar solo si estamos en esta vista
          if (state.currentView === 'payments') {
            renderPaymentsMatrix(weekFilter);
          }
          if (state.currentView === 'dashboard') {
            initCharts();
          }
        }
      });
    }
    
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
    
    const selectedWeek = weekFilter !== 'all' ? parseInt(weekFilter) : null;
    const weeksToShow = (selectedWeek && selectedWeek <= totalWeeks) 
      ? [selectedWeek] 
      : Array.from({ length: totalWeeks }, (_, i) => i + 1);
    
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
    
    weeksTotal.innerHTML = weeksToShow.map(w => {
      const count = activeParticipants.filter(p => 
        Array.isArray(p.paidWeeks) && p.paidWeeks.includes(w)
      ).length;
      return `<div class="week-total" style="text-align:center;padding-top:8px;">${formatCurrency(count * amount, currency)}</div>`;
    }).join('');
    
    const grand = activeParticipants.reduce((sum, p) => {
      const count = Array.isArray(p.paidWeeks) ? p.paidWeeks.length : 0;
      return sum + (count * amount);
    }, 0);
    grandTotal.textContent = formatCurrency(grand, currency);
  }
  
  function renderPayments(weekFilter = 'all') {
    const isMatrixView = document.body.classList.contains('payments-matrix-view');
    if (isMatrixView) {
      renderPaymentsMatrix(weekFilter);
      return;
    }
    
    const t = getTanda();
    const list = el.paymentsList;
    if (!list || !t) return;
    
    const weeks = Array.from({ length: t.totalWeeks }, (_, i) => i + 1);
    const filteredWeeks = weekFilter === 'all' ? weeks : [parseInt(weekFilter)];
    
    list.innerHTML = filteredWeeks.map(w => {
      const activeParticipants = t.participants.filter(p => p.status === 'active');
      const paidCount = activeParticipants.filter(p => p.paidWeeks.includes(w)).length;
      const totalExpected = activeParticipants.length * t.amount;
      const collected = paidCount * t.amount;
      const percentage = totalExpected > 0 ? Math.round((collected / totalExpected) * 100) : 0;
      
      return `
        <div class="list-item payment-week" data-week="${w}">
          <div class="info">
            <h4>📅 Semana ${w}</h4>
            <p>💰 ${formatCurrency(collected, t.currency)} / ${formatCurrency(totalExpected, t.currency)}</p>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <p class="meta">${paidCount} de ${activeParticipants.length} pagaron</p>
          </div>
          <span class="status ${percentage === 100 ? 'paid' : percentage > 0 ? 'pending' : 'late'}">
            ${percentage === 100 ? '✅' : percentage > 0 ? '⏳' : '❌'}
          </span>
        </div>
      `;
    }).join('');
    
    const filterSelect = document.getElementById('payment-week-filter');
    if (filterSelect && filterSelect.value !== weekFilter) {
      filterSelect.value = weekFilter;
    }
  }
  
  async function togglePaymentForWeek(pid, week) {
    const t = getTanda();
    const p = t.participants.find(x => x.id === pid);
    if (!p) return;
    
    const amount = t.amount;
    
    if (useSupabase) {
      // Backend: llamar a API
      await DataLayer.markPayment(pid, week, amount);
      // El cambio llegará por realtime subscription, pero actualizamos UI inmediatamente
      _optimisticUpdate(pid, week);
    } else {
      // Local: actualizar directamente
      const idx = p.paidWeeks.indexOf(week);
      if (idx === -1) {
        p.paidWeeks.push(week);
        p.paidWeeks.sort((a,b) => a-b);
      } else {
        p.paidWeeks.splice(idx, 1);
      }
      saveTanda(t);
      _optimisticUpdate(pid, week);
    }
    
    function _optimisticUpdate(pid, week) {
      // Actualizar UI sin esperar respuesta del servidor
      const cell = document.querySelector(`.payment-cell[data-participant="${pid}"][data-week="${week}"] .payment-status`);
      if (cell) {
        const isPaid = !cell.textContent.includes('✅');
        const isLate = week < t.currentWeek && !isPaid;
        cell.className = `payment-status ${isPaid ? 'paid' : isLate ? 'late' : 'pending'}`;
        cell.textContent = isPaid ? '✅' : isLate ? '❌' : '⏳';
      }
      showToast(isPaid ? `✅ Pago registrado - Semana ${week}` : `⚠️ Pago desmarcado`, isPaid ? 'success' : 'warning');
    }
  }
  
  function updateRowTotal(participantId, tanda) {
    const participant = tanda.participants.find(x => x.id === participantId);
    const row = document.querySelector(`.matrix-row[data-participant="${participantId}"] .summary-cell`);
    if (row && participant) {
      row.textContent = formatCurrency(participant.paidWeeks.length * tanda.amount, tanda.currency);
    }
  }
  
  function updateWeekTotal(week, tanda) {
    const activeParticipants = tanda.participants.filter(p => p.status === 'active');
    const paidCount = activeParticipants.filter(p => p.paidWeeks.includes(week)).length;
    const weekTotalElement = document.querySelectorAll('#weeks-total .week-total')[week - 1];
    if (weekTotalElement) {
      weekTotalElement.textContent = formatCurrency(paidCount * tanda.amount, tanda.currency);
    }
  }
  
  function updateGrandTotal(tanda) {
    const grandTotalElement = document.getElementById('grand-total');
    if (!grandTotalElement) return;
    
    const activeParticipants = tanda.participants.filter(p => p.status === 'active');
    const total = activeParticipants.reduce((sum, p) => sum + (p.paidWeeks.length * tanda.amount), 0);
    grandTotalElement.textContent = formatCurrency(total, tanda.currency);
  }

  // ========================================
  // 🎨 TEMPLATE HELPER
  // ========================================
  function applyTandaTemplate(templateName) {
    const templates = {
      office: { name: `Tanda Oficina ${new Date().getFullYear()}`, amount: 500, participants: 10, frequency: 'weekly', currency: 'MXN' },
      family: { name: 'Ahorro Familiar', amount: 1000, participants: 5, frequency: 'monthly', currency: 'MXN' },
      friends: { name: 'Ronda con Amigos', amount: 200, participants: 8, frequency: 'biweekly', currency: 'MXN' }
    };
    
    const template = templates[templateName];
    if (!template || !newTandaForm?.fields) {
      showToast('⚠️ Plantilla no disponible', 'warning');
      return;
    }
    
    if (newTandaForm.fields.name) newTandaForm.fields.name.value = template.name;
    if (newTandaForm.fields.amount) newTandaForm.fields.amount.value = template.amount;
    if (newTandaForm.fields.participants) newTandaForm.fields.participants.value = template.participants;
    if (newTandaForm.fields.frequency) newTandaForm.fields.frequency.value = template.frequency;
    if (newTandaForm.fields.currency) newTandaForm.fields.currency.value = template.currency;
    
    newTandaForm.updatePreview?.();
    showToast(`📋 Plantilla "${template.name}" aplicada`, 'success');
  }

  // ========================================
  // 🔄 VISTAS (Con gestión de subscriptions)
  // ========================================
  function renderView(viewName) {
    // 🧹 Limpieza: Si salimos de vista de pagos, desuscribir de realtime
    if (state.currentView === 'payments' && viewName !== 'payments') {
      if (window._tandaSubscription) {
        window._tandaSubscription.unsubscribe?.();
        window._tandaSubscription = null;
        console.log('🔌 Subscription de tanda limpiada');
      }
    }
    
    state.currentView = viewName;
    
    // Ocultar todas las vistas y aplicar inert para accesibilidad
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
      view.setAttribute('inert', '');
    });
    
    const target = document.getElementById(`${viewName}-view`);
    if (target) {
      target.classList.add('active');
      target.removeAttribute('inert');
      
      // Renderizar contenido específico de cada vista
      switch(viewName) {
        case 'dashboard':
          el.pageTitle.textContent = '📊 Dashboard';
          // Pequeño delay para asegurar que el canvas está en el DOM
          setTimeout(() => {
            if (typeof initCharts === 'function') initCharts();
          }, 50);
          break;
          
        case 'participants':
          el.pageTitle.textContent = '👥 Participantes';
          if (typeof renderParticipants === 'function') renderParticipants();
          break;
          
        case 'payments':
          el.pageTitle.textContent = '💳 Pagos';
          if (typeof renderPaymentsMatrix === 'function') renderPaymentsMatrix();
          
          // 🔄 Suscribirse a cambios en tiempo real (solo si hay backend)
          if (typeof useSupabase !== 'undefined' && useSupabase && typeof DataLayer !== 'undefined') {
            const tanda = getTanda?.();
            if (tanda?.id && !window._tandaSubscription) {
              console.log('📡 Suscribiendo a cambios en tanda:', tanda.id);
              window._tandaSubscription = DataLayer.subscribeToTanda(tanda.id, (change) => {
                // Re-renderizar solo si el cambio es relevante
                if (change?.type === 'participant_change' || change?.type === 'payment_change') {
                  if (state.currentView === 'payments') {
                    renderPaymentsMatrix();
                  }
                  if (state.currentView === 'dashboard') {
                    initCharts?.();
                  }
                  showToast('🔄 Datos actualizados', 'info');
                }
              });
            }
          }
          break;
          
        case 'new-tanda':
          el.pageTitle.textContent = '➕ Nueva Tanda';
          if (newTandaForm?.el) {
            newTandaForm.el.reset?.();
            newTandaForm.tempParticipants = [];
            newTandaForm.updatePreview?.();
          }
          break;
      }
    }
    
    // Actualizar estado activo en menú de navegación
    document.querySelectorAll('[data-view]').forEach(link => {
      const parent = link.parentElement;
      if (parent) {
        parent.classList.toggle('active-link', link.dataset.view === viewName);
      }
    });
    
    // 🎯 Focus management para accesibilidad
    if (target) {
      const firstInteractive = target.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled])');
      if (firstInteractive && viewName !== 'payments') {
        // No hacer focus automático en payments para no interferir con la matrix
        setTimeout(() => firstInteractive.focus?.(), 100);
      }
    }
  }

  // ========================================
  // 🔐 AUTENTICACIÓN
  // ========================================
  function initDefaultData() {
    const existingTandas = MultiTanda.getList();
    if (existingTandas.length === 0) {
      const defaultTanda = {
        id: crypto.randomUUID?.() || `default_${Date.now()}`,
        name: 'Ronda #1',
        amount: 1000,
        currency: 'MXN',
        frequency: 'weekly',
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
      MultiTanda.save(defaultTanda.id, defaultTanda);
      MultiTanda.setActive(defaultTanda.id);
      console.log('✅ Datos de ejemplo inicializados');
    }
  }
  
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
  
  async function login() {
    const key = el.licenseInput?.value.trim();
    if (!key) {
      showLoginError('Ingresa tu clave');
      return;
    }
    
    if (useSupabase) {
      // Backend: autenticar con Supabase
      showToast('🔐 Conectando...', 'info');
      const { user, error } = await DataLayer.signInWithLicense(key);
      
      if (error || !user) {
        showLoginError('Clave inválida o sin conexión');
        // Fallback: permitir login local si está offline
        if (!navigator.onLine && key === CONFIG.VALID_LICENSE) {
          _proceedWithLocalLogin(key);
        }
        return;
      }
      
      _proceedWithCloudLogin(user, key);
    } else {
      // Local: tu lógica actual
      if (key === CONFIG.VALID_LICENSE) {
        _proceedWithLocalLogin(key);
      } else {
        showLoginError('Clave inválida');
        el.licenseInput?.focus();
      }
    }
  }
  
  function _proceedWithLocalLogin(key) {
    sessionStorage.setItem(CONFIG.SESSION_KEY, 'active');
    showApp();
    renderView('dashboard');
    showToast('✅ Bienvenido a RondaPay (modo offline)');
  }
  
  async function _proceedWithCloudLogin(user, key) {
    sessionStorage.setItem(CONFIG.SESSION_KEY, 'active');
    sessionStorage.setItem('rondapay_user_id', user.id);
    
    // Cargar tandas del servidor
    showToast('📡 Sincronizando...', 'info');
    await DataLayer._refreshTandas();
    
    showApp();
    renderView('dashboard');
    showToast('✅ Bienvenido a RondaPay (sincronizado)');
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
        initAdminCharts();
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
    
    if (el.loginBtn) el.loginBtn.addEventListener('click', login);
    if (el.licenseInput) {
      el.licenseInput.addEventListener('keypress', e => { if (e.key === 'Enter') login(); });
    }
    
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);
    if (el.logoutBtn) el.logoutBtn.addEventListener('click', logout);
    
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
    
    document.addEventListener('click', e => {
      if (el.menu?.classList.contains('open') && 
          !el.menu.contains(e.target) && 
          e.target !== el.menuToggle && 
          !el.menuToggle?.contains(e.target)) {
        toggleMenu(false);
      }
    });
    
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.menu?.classList.contains('open')) {
        toggleMenu(false);
        if (el.menuToggle) el.menuToggle.focus();
      }
    });
    
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
    
    document.querySelectorAll('[data-template]').forEach(btn => {
      btn.addEventListener('click', () => applyTandaTemplate(btn.dataset.template));
    });
    
    const exportBtn = document.querySelector('#payments-view .btn-outline');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportPaymentsPDF);
    }
    
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
    
    let searchTimeout;
    if (el.searchParticipant) {
      el.searchParticipant.addEventListener('input', e => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderParticipants(e.target.value), 300);
      });
    }
    
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
    
    if (el.participantsList) {
      el.participantsList.addEventListener('click', e => {
        const addFirstBtn = e.target.closest('[data-action="add-first"]');
        if (addFirstBtn) {
          if (modal?.open) modal.open();
          else {
            const name = prompt('👤 Nombre del participante:');
            if (name) {
              const phone = prompt('📱 Teléfono (10 dígitos):') || '';
              addParticipant(name, phone);
            }
          }
          return;
        }
        
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
        
        const item = e.target.closest('.list-item');
        if (item) {
          const id = parseInt(item.dataset.id);
          if (!isNaN(id)) showParticipantDetails(id);
        }
      });
    }
    
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
        } else {
          renderPayments(val);
        }
      });
    }
    
    if (el.markPaidBtn) {
      el.markPaidBtn.addEventListener('click', () => {
        const w = el.paymentWeek?.value || 'all';
        showToast(`🔧 Función "Marcar pagado masivo" para ${w} - Próximamente`, 'info');
      });
    }
    
    document.getElementById('modal-confirm-tanda')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-confirm-tanda') {
        e.currentTarget.classList.add('hidden');
      }
    });
    
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
    
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (state.currentView === 'dashboard' || state.isAdmin) initCharts();
        if (state.isAdmin) initAdminCharts();
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
    
    updatePreview() {
      const amount = parseFloat(this.fields.amount?.value) || 0;
      const participants = parseInt(this.fields.participants?.value) || 2;
      const frequency = this.fields.frequency?.value || 'weekly';
      const startDate = this.fields.start?.value ? new Date(this.fields.start.value) : new Date();
      const currency = this.fields.currency?.value || 'MXN';
      
      const preview = calculateTandaPreview(amount, participants, frequency, startDate);
      const symbol = { MXN: '$', USD: '$', EUR: '€', COP: '$', PEN: 'S/' }[currency] || '$';
      
      const durationEl = document.getElementById('preview-duration');
      const weeklyEl = document.getElementById('preview-weekly');
      const totalEl = document.getElementById('preview-total');
      const endDateEl = document.getElementById('preview-end-date');
      const nextDateEl = document.getElementById('preview-next-date');
      const currencySymbolSpan = document.getElementById('currency-symbol-preview');
      
      if (currencySymbolSpan) currencySymbolSpan.textContent = symbol;
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
      const preview = calculateTandaPreview(amount, participants, frequency, startDate);
      
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
      
      renderTandaSelector();
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
      .input-with-prefix { position: relative; display: flex; align-items: center; }
      .input-with-prefix .currency-prefix { position: absolute; left: 14px; color: var(--text-secondary); font-weight: 500; pointer-events: none; font-size: 1.1rem; z-index: 1; }
      .input-with-prefix input { padding-left: 32px !important; padding-right: 14px; position: relative; z-index: 2; background: var(--bg); }
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
  // 🧹 CLEANUP GLOBAL (para evitar memory leaks)
  // ========================================
  function cleanupSubscriptions() {
    if (window._tandaSubscription) {
      window._tandaSubscription.unsubscribe?.();
      window._tandaSubscription = null;
      console.log('🔌 Subscriptions limpiadas');
    }
  }
  
  // Limpiar al cerrar pestaña o navegar fuera
  window.addEventListener('beforeunload', cleanupSubscriptions);
  window.addEventListener('pagehide', cleanupSubscriptions);  
  
  // ========================================
  // INICIALIZACIÓN
  // ========================================
  function init() {
    initTheme();
    initDefaultData();
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
