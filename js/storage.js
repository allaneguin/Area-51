// ═══════════════════════════════════════════════════════
// Storage — contratos e perfil do locador (Supabase)
// ═══════════════════════════════════════════════════════

const Storage = {
  // O perfil digitado no cadastro fica aqui até existir sessão: com confirmação de
  // e-mail pendente não há auth.uid(), e o RLS barra a escrita em profiles.
  PENDING_PROFILE_KEY: 'perfil_pendente',

  contractsCache: [],
  profileCache: {},

  // ── Carga inicial (roda a cada login) ──
  async loadCloudData() {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const user = session ? session.user : null;
      if (!user) return;

      await this._flushPendingProfile(user.id);

      const { data: dbContracts, error: dbError } = await supabaseClient
        .from('contracts')
        .select('*');
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

      const { data: profileRecord, error: profileError } = await supabaseClient
        .from('profiles')
        .select('profile_data')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      this.profileCache = (profileRecord && profileRecord.profile_data) || {};

      console.log(`📦 Dados do Supabase carregados: ${this.contractsCache.length} contratos.`);
    } catch (e) {
      console.error("Erro ao carregar dados do Supabase:", e);
    }
  },

  // Sobe o perfil guardado no cadastro, se houver, e descarta o rascunho local.
  async _flushPendingProfile(uid) {
    let pending = null;
    try {
      pending = JSON.parse(localStorage.getItem(this.PENDING_PROFILE_KEY));
    } catch {
      localStorage.removeItem(this.PENDING_PROFILE_KEY);
      return;
    }
    if (!pending) return;

    const { error } = await supabaseClient
      .from('profiles')
      .upsert({ id: uid, profile_data: pending });

    if (error) {
      console.error("Erro ao enviar o perfil do cadastro:", error);
      return; // mantém o rascunho para tentar de novo no próximo login
    }
    localStorage.removeItem(this.PENDING_PROFILE_KEY);
  },

  // ── Contratos ──
  getAll() {
    return this.contractsCache.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  getById(id) {
    return this.contractsCache.find(c => c.id === id) || null;
  },

  create(contract) {
    const now = new Date().toISOString();
    const newContract = {
      id: Utils.generateId(),
      ...contract,
      userId: App.user.id,
      createdAt: now,
      updatedAt: now
    };

    this.contractsCache.push(newContract);

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
        if (error) console.error("Erro ao salvar contrato no Supabase:", error);
      });

    return newContract;
  },

  update(id, updates) {
    const idx = this.contractsCache.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const item = {
      ...this.contractsCache[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.contractsCache[idx] = item;

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
        if (error) console.error("Erro ao atualizar contrato no Supabase:", error);
      });

    return item;
  },

  delete(id) {
    this.contractsCache = this.contractsCache.filter(c => c.id !== id);

    supabaseClient
      .from('contracts')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error("Erro ao excluir contrato no Supabase:", error);
      });
  },

  getStats() {
    const contracts = this.getAll();
    const now = new Date();
    const thisMonth = contracts.filter(c => {
      const d = new Date(c.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return { total: contracts.length, thisMonth: thisMonth.length };
  },

  // ── Perfil do locador ──
  getAdminProfile() {
    return this.profileCache;
  },

  saveAdminProfile(profile) {
    // Cadastro com confirmação de e-mail pendente: ainda não há sessão para gravar.
    if (!App.user) {
      localStorage.setItem(this.PENDING_PROFILE_KEY, JSON.stringify(profile));
      return;
    }

    this.profileCache = profile;

    supabaseClient
      .from('profiles')
      .upsert({ id: App.user.id, profile_data: profile })
      .then(({ error }) => {
        if (error) console.error("Erro ao salvar perfil no Supabase:", error);
      });
  }
};
