// ═══════════════════════════════════════════════════════
// Storage — CRUD de contratos integrado com Supabase/localStorage
// ═══════════════════════════════════════════════════════

const Storage = {
  KEY: 'gerador_contratos_data',
  contractsCache: [],
  profileCache: {},

  // ── Métodos Auxiliares LocalStorage (Fallback Offline) ──
  _getData() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || { contracts: [] };
    } catch {
      return { contracts: [] };
    }
  },

  _saveData(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  // ── Sincronização e Carga com a Nuvem (Supabase) ──
  async loadCloudData() {
    if (!SupabaseActive || !supabaseClient) return;
    
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const user = session ? session.user : null;
      if (!user) return;
      
      const uid = user.id;

      // 1. Carregar Contratos do Supabase.
      // Filtro explícito por dono: para o usuário comum o RLS já garante isso,
      // mas o ADMIN enxerga todas as contas — sem o .eq() o painel normal dele
      // misturaria contratos de todo mundo. A visão global fica só no #superadmin.
      const { data: dbContracts, error: dbError } = await supabaseClient
        .from('contracts')
        .select('*')
        .eq('user_id', uid);
        
      if (dbError) throw dbError;
        
      this.contractsCache = dbContracts.map(item => ({
        id: item.id,
        name: item.name,
        templateId: item.template_id,
        fields: item.fields,
        isFinalized: item.is_finalized,
        cloudId: item.cloud_id,
        cloudKey: item.cloud_key,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));
      
      // Ordena por updatedAt decrescente
      this.contractsCache.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      // 2. Carregar Perfil do Supabase
      const { data: profileRecords, error: profileError } = await supabaseClient
        .from('profiles')
        .select('profile_data')
        .eq('id', uid)
        .maybeSingle();
        
      if (profileError) throw profileError;
      
      if (profileRecords && profileRecords.profile_data) {
        this.profileCache = profileRecords.profile_data;
      } else {
        this.profileCache = {};
      }
      
      console.log(`📦 Dados do Supabase carregados: ${this.contractsCache.length} contratos.`);
    } catch (e) {
      console.error("Erro ao carregar dados do Supabase:", e);
    }
  },

  async syncLocalDataToCloud() {
    if (!SupabaseActive || !supabaseClient) return;
    
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const user = session ? session.user : null;
      if (!user) return;
      
      const uid = user.id;
      const migratedKey = `migrated_local_data_supabase_${uid}`;

      if (localStorage.getItem(migratedKey)) {
        // Já migrado, apenas carrega dados do banco para o cache
        await this.loadCloudData();
        return;
      }

      // Importa contratos locais do localStorage
      const localData = this._getData();
      if (localData.contracts && localData.contracts.length > 0) {
        console.log(`Migrando ${localData.contracts.length} contratos locais para o Supabase...`);
        
        const contractsToInsert = localData.contracts.map(contract => ({
          id: contract.id,
          user_id: uid,
          name: contract.name,
          template_id: contract.templateId,
          fields: contract.fields,
          is_finalized: !!contract.isFinalized,
          cloud_id: contract.cloudId || null,
          cloud_key: contract.cloudKey || null,
          created_at: contract.createdAt || new Date().toISOString(),
          updated_at: contract.updatedAt || new Date().toISOString()
        }));

        const { error } = await supabaseClient
          .from('contracts')
          .upsert(contractsToInsert, { onConflict: 'id' });
          
        if (error) throw error;
      }

      // Importa perfil local do localStorage
      const localProfile = JSON.parse(localStorage.getItem('gerador_admin_profile')) || {};
      if (Object.keys(localProfile).length > 0) {
        const { error } = await supabaseClient
          .from('profiles')
          .upsert({ id: uid, profile_data: localProfile });
          
        if (error) throw error;
      }

      // Marca como migrado e LIMPA o que subiu do bucket local compartilhado.
      // Sem esta limpeza, outro usuário que logasse neste mesmo navegador
      // migraria (e absorveria na conta dele) os contratos e o perfil deste.
      // customTemplates fica: não é migrado para a nuvem.
      localStorage.setItem(migratedKey, 'true');
      const restante = this._getData();
      restante.contracts = [];
      this._saveData(restante);
      localStorage.removeItem('gerador_admin_profile');
      console.log("✅ Sincronização local -> Supabase concluída com sucesso.");
    } catch (e) {
      console.error("Erro ao sincronizar dados com o Supabase:", e);
    }

    // Carrega o cache atualizado
    await this.loadCloudData();
  },

  // ── Listar todos os contratos ──
  getAll() {
    if (SupabaseActive && App.user) {
      return this.contractsCache.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
    return this._getData().contracts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  // ── Buscar por ID ──
  getById(id) {
    if (SupabaseActive && App.user) {
      return this.contractsCache.find(c => c.id === id) || null;
    }
    return this._getData().contracts.find(c => c.id === id) || null;
  },

  // ── Criar novo contrato ──
  create(contract) {
    const now = new Date().toISOString();
    const newContract = {
      id: Utils.generateId(),
      ...contract,
      createdAt: now,
      updatedAt: now,
    };

    if (SupabaseActive && App.user) {
      newContract.userId = App.user.id;
      
      // Salva no cache local
      this.contractsCache.push(newContract);
      
      // Salva na nuvem no background
      supabaseClient
        .from('contracts')
        .insert({
          id: newContract.id,
          user_id: App.user.id,
          name: newContract.name,
          template_id: newContract.templateId,
          fields: newContract.fields,
          is_finalized: !!newContract.isFinalized,
          cloud_id: newContract.cloudId || null,
          cloud_key: newContract.cloudKey || null,
          created_at: newContract.createdAt,
          updated_at: newContract.updatedAt
        })
        .then(({ error }) => {
          if (error) {
            console.error("Erro ao salvar contrato no Supabase:", error);
            if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Salvo localmente, mas houve erro com a nuvem: " + error.message, "warning");
          }
        })
        .catch(err => {
          console.error("Falha de conexão com Supabase:", err);
          if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Sem conexão com a nuvem. Salvo em modo local.", "warning");
        });
        
      return newContract;
    }

    // Fallback Offline
    const data = this._getData();
    data.contracts.push(newContract);
    this._saveData(data);
    return newContract;
  },

  // ── Atualizar contrato ──
  update(id, updates) {
    const now = new Date().toISOString();
    
    if (SupabaseActive && App.user) {
      const idx = this.contractsCache.findIndex(c => c.id === id);
      if (idx === -1) return null;
      
      this.contractsCache[idx] = {
        ...this.contractsCache[idx],
        ...updates,
        updatedAt: now
      };

      // Salva na nuvem no background com feedback de erro
      const item = this.contractsCache[idx];
      supabaseClient
        .from('contracts')
        .update({
          name: item.name,
          template_id: item.templateId,
          fields: item.fields,
          is_finalized: !!item.isFinalized,
          cloud_id: item.cloudId || null,
          cloud_key: item.cloudKey || null,
          updated_at: item.updatedAt
        })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error("Erro ao atualizar contrato no Supabase:", error);
            if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Atualizado localmente, mas erro na nuvem: " + error.message, "warning");
          }
        })
        .catch(err => {
          console.error("Falha de conexão com Supabase:", err);
          if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Sem conexão com a nuvem. Salvo em modo local.", "warning");
        });

      return this.contractsCache[idx];
    }

    // Fallback Offline
    const data = this._getData();
    const idx = data.contracts.findIndex(c => c.id === id);
    if (idx === -1) return null;
    data.contracts[idx] = {
      ...data.contracts[idx],
      ...updates,
      updatedAt: now,
    };
    this._saveData(data);
    return data.contracts[idx];
  },

  // ── Excluir contrato ──
  delete(id) {
    if (SupabaseActive && App.user) {
      this.contractsCache = this.contractsCache.filter(c => c.id !== id);
      
      // Exclui na nuvem no background
      supabaseClient
        .from('contracts')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error("Erro ao excluir contrato no Supabase:", error);
            if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Erro ao excluir da nuvem: " + error.message, "warning");
          }
        })
        .catch(err => {
          console.error("Falha de rede Supabase:", err);
          if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Sem conexão para excluir da nuvem.", "warning");
        });
        
      return;
    }

    // Fallback Offline
    const data = this._getData();
    data.contracts = data.contracts.filter(c => c.id !== id);
    this._saveData(data);
  },

  // ── Estatísticas ──
  getStats() {
    const contracts = this.getAll();
    const now = new Date();
    const thisMonth = contracts.filter(c => {
      const d = new Date(c.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return {
      total: contracts.length,
      thisMonth: thisMonth.length,
    };
  },

  // ── Buscar contratos ──
  search(query) {
    if (!query) return this.getAll();
    const q = query.toLowerCase();
    return this.getAll().filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.templateId && c.templateId.toLowerCase().includes(q)) ||
      (c.fields && JSON.stringify(c.fields).toLowerCase().includes(q))
    );
  },

  // ── Perfil do Admin ──
  getAdminProfile() {
    if (SupabaseActive && App.user) {
      return this.profileCache;
    }
    try {
      return JSON.parse(localStorage.getItem('gerador_admin_profile')) || {};
    } catch {
      return {};
    }
  },

  saveAdminProfile(profile) {
    if (SupabaseActive && App.user) {
      this.profileCache = profile;
      
      // Salva na nuvem no background
      supabaseClient
        .from('profiles')
        .upsert({ id: App.user.id, profile_data: profile })
        .then(({ error }) => {
          if (error) console.error("Erro ao salvar perfil no Supabase:", error);
        });
        
      return;
    }
    
    // Fallback Offline
    localStorage.setItem('gerador_admin_profile', JSON.stringify(profile));
  }
};
