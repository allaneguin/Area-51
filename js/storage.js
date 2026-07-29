// ═══════════════════════════════════════════════════════
// Storage — contratos e perfil do locador (Supabase)
// ═══════════════════════════════════════════════════════

const Storage = {
  // O perfil digitado no cadastro fica aqui até existir sessão: com confirmação de
  // e-mail pendente não há auth.uid(), e o RLS barra a escrita em profiles.
  PENDING_PROFILE_KEY: 'perfil_pendente',

  contractsCache: [],
  propertiesCache: [],
  clientsCache: [],
  financialRecordsCache: [],
  profileCache: {},

  // ── Carga inicial (roda a cada login) ──
  async loadCloudData() {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const user = session ? session.user : null;
      if (!user) return;

      await this._flushPendingProfile(user.id);

      // Carregar Contratos
      const { data: dbContracts, error: dbError } = await supabaseClient
        .from('contracts')
        .select('*')
        .eq('user_id', user.id);
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

      // Carregar Imóveis
      const { data: dbProps } = await supabaseClient
        .from('properties')
        .select('*')
        .eq('user_id', user.id);
      this.propertiesCache = dbProps || [];

      // Carregar Clientes
      const { data: dbClients } = await supabaseClient
        .from('clients')
        .select('*')
        .eq('user_id', user.id);
      this.clientsCache = dbClients || [];

      // Carregar Lançamentos Financeiros
      const { data: dbFin } = await supabaseClient
        .from('financial_records')
        .select('*')
        .eq('user_id', user.id);
      this.financialRecordsCache = dbFin || [];

      const { data: profileRecord, error: profileError } = await supabaseClient
        .from('profiles')
        .select('profile_data')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      this.profileCache = (profileRecord && profileRecord.profile_data) || {};

      console.log(`📦 Dados do Supabase carregados: ${this.contractsCache.length} contratos, ${this.propertiesCache.length} imóveis, ${this.clientsCache.length} clientes.`);
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
      userId: App.user ? App.user.id : null,
      createdAt: now,
      updatedAt: now
    };

    this.contractsCache.push(newContract);

    if (supabaseClient && App.user) {
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
            if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("O contrato NÃO foi salvo na nuvem: " + error.message, "error");
          }
        })
        .catch(err => {
          console.error("Falha de conexão com Supabase:", err);
          if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Sem conexão com a nuvem: esta alteração NÃO foi salva. Recarregue e tente de novo.", "error");
        });
    }

    this.syncClientFromContract(newContract.fields);
    return newContract;
  },

  update(id, updates) {
    const now = new Date().toISOString();
    const idx = this.contractsCache.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const item = {
      ...this.contractsCache[idx],
      ...updates,
      updatedAt: now
    };
    this.contractsCache[idx] = item;

    if (supabaseClient && App.user) {
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
            if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("A alteração NÃO foi salva na nuvem: " + error.message, "error");
          }
        })
        .catch(err => {
          console.error("Falha de conexão com Supabase:", err);
          if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast("Sem conexão com a nuvem: esta alteração NÃO foi salva. Recarregue e tente de novo.", "error");
        });
    }

    this.syncClientFromContract(item.fields);
    return item;
  },

  delete(id) {
    this.contractsCache = this.contractsCache.filter(c => c.id !== id);

    if (supabaseClient && App.user) {
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
    }
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
  },

  // ── Imóveis ──
  getProperties() {
    return this.propertiesCache || [];
  },

  saveProperty(prop) {
    const id = prop.id || Utils.generateId();
    const idx = this.propertiesCache.findIndex(p => p.id === id);
    const existing = idx >= 0 ? this.propertiesCache[idx] : {};
    const item = { ...existing, ...prop, id, user_id: App.user ? App.user.id : null, updated_at: new Date().toISOString() };
    if (idx >= 0) this.propertiesCache[idx] = item;
    else this.propertiesCache.push(item);

    if (supabaseClient && App.user) {
      supabaseClient.from('properties').upsert(item).then(({ error }) => {
        if (error) console.error("Erro ao salvar imóvel:", error);
      });
    }
    return item;
  },

  deleteProperty(id) {
    this.propertiesCache = this.propertiesCache.filter(p => p.id !== id);
    if (supabaseClient && App.user) {
      supabaseClient.from('properties').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Erro ao deletar imóvel:", error);
      });
    }
  },

  // ── Clientes ──
  getClients() {
    return this.clientsCache || [];
  },

  saveClient(client) {
    const id = client.id || Utils.generateId();
    const idx = this.clientsCache.findIndex(c => c.id === id);
    const existing = idx >= 0 ? this.clientsCache[idx] : {};
    const item = { ...existing, ...client, id, user_id: App.user ? App.user.id : null, updated_at: new Date().toISOString() };
    if (idx >= 0) this.clientsCache[idx] = item;
    else this.clientsCache.push(item);

    if (supabaseClient && App.user) {
      supabaseClient.from('clients').upsert(item).then(({ error }) => {
        if (error) console.error("Erro ao salvar cliente:", error);
      });
    }
    return item;
  },

  deleteClient(id) {
    this.clientsCache = this.clientsCache.filter(c => c.id !== id);
    if (supabaseClient && App.user) {
      supabaseClient.from('clients').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Erro ao deletar cliente:", error);
      });
    }
  },

  // ── Inquilino do contrato vira cadastro na aba Clientes ──
  // Chamado a cada save de contrato (create/update), então é IDEMPOTENTE:
  // casa pelo CPF/CNPJ e só cria quem ainda não existe. Nunca sobrescreve um
  // cadastro existente — dado editado à mão pelo locador tem prioridade.
  // Exige documento de propósito: é a única chave confiável para não duplicar
  // (o inquilino é obrigado a informar CPF/CNPJ ao enviar pelo link).
  syncClientFromContract(fields) {
    fields = fields || {};
    const nome = (fields.nome_locatario || '').trim();
    const doc = (fields.doc_locatario || '').replace(/\D/g, '');
    if (!nome || !doc) return null;

    const jaExiste = this.getClients().some(c => (c.document || '').replace(/\D/g, '') === doc);
    if (jaExiste) return null;

    const cliente = this.saveClient({
      client_type: 'Inquilino',
      person_type: doc.length > 11 ? 'PJ' : 'PF',
      name: nome,
      document: fields.doc_locatario || '',
      rg: fields.rg_locatario || '',
      profession: fields.prof_locatario || ''
    });

    if (typeof Utils !== 'undefined' && Utils.toast) {
      Utils.toast(nome + ' foi cadastrado(a) em Clientes.', 'info');
    }
    return cliente;
  },

  // ── Gestão Financeira & Repasses ──
  getFinancialRecords() {
    return (this.financialRecordsCache || []).slice().sort((a, b) => new Date(b.due_date || 0) - new Date(a.due_date || 0));
  },

  saveFinancialRecord(rec) {
    const id = rec.id || Utils.generateId();
    const idx = this.financialRecordsCache.findIndex(r => r.id === id);
    const existing = idx >= 0 ? this.financialRecordsCache[idx] : {};
    const item = { ...existing, ...rec, id, user_id: App.user ? App.user.id : null, updated_at: new Date().toISOString() };
    if (idx >= 0) this.financialRecordsCache[idx] = item;
    else this.financialRecordsCache.push(item);

    if (supabaseClient && App.user) {
      supabaseClient.from('financial_records').upsert(item).then(({ error }) => {
        if (error) console.error("Erro ao salvar lançamento financeiro:", error);
      });
    }
    return item;
  },

  deleteFinancialRecord(id) {
    this.financialRecordsCache = this.financialRecordsCache.filter(r => r.id !== id);
    if (supabaseClient && App.user) {
      supabaseClient.from('financial_records').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Erro ao deletar lançamento financeiro:", error);
      });
    }
  },

  // Gerar cobranças do mês corrente para todos os contratos ativos
  generateMonthlyCharges(feePercentDefault = 10) {
    const activeContracts = this.getAll().filter(c => c.isFinalized || (c.fields && c.fields.nome_locatario));
    let countNew = 0;
    const today = new Date();
    const yearMonth = today.toISOString().slice(0, 7); // "YYYY-MM"

    activeContracts.forEach(c => {
      const tenantName = c.fields.nome_locatario || 'Inquilino';
      const landlordName = c.fields.nome_locador || 'Locador';
      const rawRent = c.fields.valor_aluguel ? String(c.fields.valor_aluguel).replace(/\D/g, '') : '0';
      const rentValue = parseFloat(rawRent) / 100 || 0;

      if (rentValue <= 0) return;

      const desc = `Aluguel ${yearMonth} - ${c.name}`;
      const exists = this.financialRecordsCache.some(r => r.contract_id === c.id && r.due_date && r.due_date.startsWith(yearMonth));

      if (!exists) {
        const feeValue = rentValue * (feePercentDefault / 100);
        const netPayout = rentValue - feeValue;

        // Vencimento padrão: dia 10 do mês
        const dueDate = `${yearMonth}-10`;

        this.saveFinancialRecord({
          contract_id: c.id,
          description: desc,
          tenant_name: tenantName,
          landlord_name: landlordName,
          due_date: dueDate,
          rent_value: rentValue,
          fee_percent: feePercentDefault,
          fee_value: feeValue,
          net_payout: netPayout,
          status: 'Pendente'
        });
        countNew++;
      }
    });

    return countNew;
  },

  // Aplicar Reajuste Anual por Índice (IPCA / IGP-M) em um contrato
  applyContractReajuste(contractId, ratePercent, indexName = 'IPCA') {
    const contract = this.getById(contractId);
    if (!contract || !contract.fields.valor_aluguel) return null;

    const rawRent = String(contract.fields.valor_aluguel).replace(/\D/g, '');
    const currentRent = parseFloat(rawRent) / 100 || 0;

    if (currentRent <= 0) return null;

    const newRent = currentRent * (1 + (ratePercent / 100));
    const newRentFormatted = Utils.formatCurrency(newRent);
    const newRentExtenso = Utils.writeBRLInWords(newRentFormatted);

    const updatedFields = {
      ...contract.fields,
      valor_aluguel: newRentFormatted,
      valor_extenso: newRentExtenso,
      ultimo_reajuste_data: new Date().toISOString().slice(0, 10),
      ultimo_reajuste_indice: indexName,
      ultimo_reajuste_taxa: ratePercent
    };

    const updatedContract = this.update(contractId, { fields: updatedFields });
    return { oldRent: currentRent, newRent, ratePercent, indexName, updatedContract };
  }
};
