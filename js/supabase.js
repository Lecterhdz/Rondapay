// js/supabase.js - Capa de datos para Supabase
(() => {
  // 🔑 CONFIGURACIÓN (reemplaza con tus valores reales)
  const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
  const SUPABASE_ANON_KEY = 'TU-ANON-KEY';
  
  // Inicializar cliente
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // ========================================
  // 🔄 SYNC LAYER: Reemplaza Storage/MultiTanda
  // ========================================
  const SyncDB = {
    // Cache local para offline-first
    _cache: new Map(),
    _offlineQueue: [],
    _isOnline: navigator.onLine,
    
    // Escuchar cambios de conexión
    init() {
      window.addEventListener('online', () => {
        this._isOnline = true;
        this._flushOfflineQueue();
        this._refreshActiveTanda();
      });
      window.addEventListener('offline', () => {
        this._isOnline = false;
        console.log('📴 Modo offline activado');
      });
    },
    
    // ========================================
    // AUTH
    // ========================================
    async signInWithLicense(licenseKey) {
      // En producción: validar license_key en tabla profiles
      // Para demo: usamos auth.signInWithPassword con email temporal
      const email = `license-${licenseKey}@rondapay.local`;
      const { user, session, error } = await supabase.auth.signInWithPassword({
        email,
        password: licenseKey // En prod, usar magic link o custom token
      });
      
      if (error) {
        // Si el usuario no existe, crearlo (solo para demo)
        const { data: newUser, error: signUpError } = await supabase.auth.signUp({
          email,
          password: licenseKey,
          options: { data: { license_key: licenseKey } }
        });
        return { user: newUser?.user, error: signUpError };
      }
      
      return { user, session, error: null };
    },
    
    async signOut() {
      await supabase.auth.signOut();
      this._cache.clear();
    },
    
    getCurrentUser() {
      return supabase.auth.getUser();
    },
    
    // ========================================
    // TANDAS
    // ========================================
    async getTandas() {
      if (!this._isOnline && this._cache.has('tandas')) {
        return this._cache.get('tandas');
      }
      
      const { user } = await supabase.auth.getUser();
      if (!user.data.user) return [];
      
      const { data, error } = await supabase
        .from('tandas')
        .select('*, participants(*)')
        .eq('owner_id', user.data.user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error cargando tandas:', error);
        return this._cache.get('tandas') || [];
      }
      
      this._cache.set('tandas', data);
      return data;
    },
    
    async saveTanda(tanda) {
      const { user } = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('No authenticated');
      
      const tandaData = {
        owner_id: user.data.user.id,
        name: tanda.name,
        amount: tanda.amount,
        currency: tanda.currency,
        frequency: tanda.frequency,
        start_date: tanda.startDate,
        total_weeks: tanda.totalWeeks,
        current_week: tanda.currentWeek
      };
      
      let result;
      if (tanda.id && !tanda.id.startsWith('temp_')) {
        // Update existente
        const { data, error } = await supabase
          .from('tandas')
          .update(tandaData)
          .eq('id', tanda.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Insert nuevo
        const { data, error } = await supabase
          .from('tandas')
          .insert(tandaData)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      
      // Guardar participantes
      if (tanda.participants?.length) {
        await this._syncParticipants(result.id, tanda.participants);
      }
      
      // Actualizar cache
      await this._refreshTandas();
      return result;
    },
    
    async _syncParticipants(tandaId, participants) {
      // Eliminar participantes que ya no existen
      const localIds = participants.map(p => p.id).filter(id => !id.startsWith('temp_'));
      await supabase.from('participants')
        .delete()
        .eq('tanda_id', tandaId)
        .not('id', 'in', `(${localIds.join(',')})`);
      
      // Insertar/actualizar participantes
      for (const p of participants) {
        const pData = {
          tanda_id: tandaId,
          name: p.name,
          phone: p.phone,
          status: p.status,
          next_turn: p.nextTurn,
          received: p.received,
          paid_weeks: p.paidWeeks || []
        };
        
        if (p.id && !p.id.startsWith('temp_')) {
          await supabase.from('participants')
            .update(pData)
            .eq('id', p.id);
        } else {
          await supabase.from('participants')
            .insert(pData);
        }
      }
    },
    
    async deleteTanda(tandaId) {
      const { error } = await supabase
        .from('tandas')
        .update({ is_archived: true })
        .eq('id', tandaId);
      if (error) throw error;
      await this._refreshTandas();
    },
    
    // ========================================
    // PAGOS EN TIEMPO REAL
    // ========================================
    subscribeToTanda(tandaId, callback) {
      return supabase
        .channel(`tanda:${tandaId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `tanda_id=eq.${tandaId}`
        }, (payload) => {
          callback({ type: 'participant_change', payload });
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `participant_id=in.(select id from participants where tanda_id=${tandaId})`
        }, (payload) => {
          callback({ type: 'payment_change', payload });
        })
        .subscribe();
    },
    
    async markPayment(participantId, weekNumber, amount) {
      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('payments')
        .select('id')
        .eq('participant_id', participantId)
        .eq('week_number', weekNumber)
        .maybeSingle();
      
      if (existing) {
        // Toggle: si ya está pagado, desmarcar
        await supabase.from('payments').delete().eq('id', existing.id);
        // Actualizar array en participante
        await this._updateParticipantPaidWeeks(participantId, weekNumber, 'remove');
      } else {
        // Marcar como pagado
        await supabase.from('payments').insert({
          participant_id: participantId,
          week_number: weekNumber,
          amount
        });
        await this._updateParticipantPaidWeeks(participantId, weekNumber, 'add');
      }
    },
    
    async _updateParticipantPaidWeeks(participantId, week, action) {
      const { data: p } = await supabase
        .from('participants')
        .select('paid_weeks')
        .eq('id', participantId)
        .single();
      
      let weeks = p?.paid_weeks || [];
      if (action === 'add' && !weeks.includes(week)) {
        weeks = [...weeks, week].sort((a,b) => a-b);
      } else if (action === 'remove') {
        weeks = weeks.filter(w => w !== week);
      }
      
      await supabase.from('participants')
        .update({ paid_weeks: weeks })
        .eq('id', participantId);
    },
    
    // ========================================
    // OFFLINE-FIRST: Cola de operaciones
    // ========================================
    _queueOperation(operation) {
      this._offlineQueue.push({
        ...operation,
        timestamp: Date.now()
      });
      // Guardar cola en localStorage para persistencia
      localStorage.setItem('rondapay_offline_queue', JSON.stringify(this._offlineQueue));
    },
    
    async _flushOfflineQueue() {
      const queue = JSON.parse(localStorage.getItem('rondapay_offline_queue') || '[]');
      if (!queue.length) return;
      
      console.log(`🔄 Sincronizando ${queue.length} operaciones pendientes...`);
      
      for (const op of queue) {
        try {
          if (op.type === 'saveTanda') {
            await this.saveTanda(op.data);
          } else if (op.type === 'markPayment') {
            await this.markPayment(op.data.participantId, op.data.week, op.data.amount);
          }
          // Eliminar operación exitosa de la cola
          const idx = this._offlineQueue.findIndex(o => o.timestamp === op.timestamp);
          if (idx !== -1) this._offlineQueue.splice(idx, 1);
        } catch (e) {
          console.warn('⚠️ Error sincronizando operación:', e);
        }
      }
      
      localStorage.setItem('rondapay_offline_queue', JSON.stringify(this._offlineQueue));
    },
    
    // ========================================
    // UTILIDADES
    // ========================================
    async _refreshTandas() {
      const tandas = await this.getTandas();
      this._cache.set('tandas', tandas);
      return tandas;
    },
    
    async _refreshActiveTanda() {
      const activeId = sessionStorage.getItem('rondapay_active_tanda');
      if (activeId) {
        await this._refreshTandas();
      }
    },
    
    // Compatibilidad con tu código actual
    getActiveTanda() {
      const activeId = sessionStorage.getItem('rondapay_active_tanda');
      const tandas = this._cache.get('tandas') || [];
      return tandas.find(t => t.id === activeId) || null;
    },
    
    setActiveTanda(id) {
      sessionStorage.setItem('rondapay_active_tanda', id);
    }
  };
  
  // Inicializar
  SyncDB.init();
  
  // Exportar globalmente para usar en app.js
  window.SyncDB = SyncDB;
  window.supabase = supabase;
  
})();
