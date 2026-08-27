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
  inspectionsCache: [],
  profileCache: {},

  // Troca/saída de conta: descarta TODOS os caches do usuário anterior.
  // Zerar só parte deles deixava imóveis/clientes/financeiro de A visíveis
  // para B se a recarga da nuvem falhasse.
  clearAll() {
    this.contractsCache = [];
    this.propertiesCache = [];
    this.clientsCache = [];
    this.financialRecordsCache = [];
    this.inspectionsCache = [];
    this.profileCache = {};
  },

  // Falha de escrita nunca é silenciosa (ARQUITETURA.md R3.1): o cache local
  // já mudou, então o usuário precisa saber que a nuvem divergiu.
  _cloudWrite(promise, msgErro) {
    promise.catch(err => {
      console.error(msgErro, err);
      if (typeof Utils !== 'undefined' && Utils.toast) {
        // Falha de rede e recusa do servidor pedem frases diferentes: uma se
        // resolve recarregando, a outra nao.
        const detalhe = err && err.transporte
          ? 'Sem conexão — recarregue e tente de novo.'
          : (err && err.message) || '';
        Utils.toast(msgErro + ' ' + detalhe, 'error');
      }
    });
  },

  // ── Carga inicial (roda a cada login) ──
  async loadCloudData() {
    try {
      const user = Api.usuario;
      if (!user) return;

      await this._flushPendingProfile(user.id);

      // Sem `select('*').eq('user_id', ...)`: o escopo por usuario agora e do
      // servidor, que so devolve o que e da sessao. O cliente nao pede filtro
      // nem poderia — pedir seria sugerir que existe como nao pedir.
      const dbContracts = await Api.list('contracts');

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

      const [props, clients, fin, insp] = await Promise.all([
        Api.list('properties'),
        Api.list('clients'),
        Api.list('financial_records'),
        Api.list('inspections')
      ]);

      this.propertiesCache = props || [];
      this.clientsCache = clients || [];
      this.financialRecordsCache = fin || [];
      this.inspectionsCache = insp || [];
      // A tabela nasce com o banco agora, entao nunca falta. A bandeira fica
      // porque `vistorias.js` a le — e este trabalho nao toca as telas.
      this.inspectionsDisponivel = true;

      this.profileCache = (await Api.lerPerfil()) || {};
    } catch (e) {
      console.error('Erro ao carregar dados do servidor:', e);
      if (typeof Utils !== 'undefined' && Utils.toast) {
        Utils.toast('Não foi possível carregar seus dados: ' + (e.message || ''), 'error');
      }
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

    try {
      await Api.gravarPerfil(pending);
    } catch (e) {
      console.error('Erro ao enviar o perfil do cadastro:', e);
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

    if (App.user) {
      this._cloudWrite(Api.save('contracts', {
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
      }), 'O contrato NÃO foi salvo na nuvem:');
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

    if (App.user) {
      this._cloudWrite(Api.save('contracts', {
        id: id,
        name: item.name,
        template_id: item.templateId,
        fields: item.fields,
        is_finalized: !!item.isFinalized,
        cloud_id: item.cloudId || null,
        cloud_key: item.cloudKey || null,
        updated_at: item.updatedAt
      }), 'A alteração NÃO foi salva na nuvem:');
    }

    this.syncClientFromContract(item.fields);
    return item;
  },

  delete(id) {
    this.contractsCache = this.contractsCache.filter(c => c.id !== id);

    if (App.user) {
      this._cloudWrite(Api.remove('contracts', id), 'O contrato NÃO foi excluído da nuvem:');
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

    this._cloudWrite(Api.gravarPerfil(profile), 'O perfil NÃO foi salvo na nuvem:');
  },

  // ── Imóveis ──
  getProperties() {
    return this.propertiesCache || [];
  },

  // Contratos vinculados a um imóvel (fields.property_id, gravado no
  // "Importar Imóvel" do editor). É a ponte para status automático,
  // histórico e receita por imóvel.
  getContractsForProperty(propId) {
    if (!propId) return [];
    return this.getAll().filter(c => c.fields && c.fields.property_id === propId);
  },

  saveProperty(prop) {
    const id = prop.id || Utils.generateId();
    const idx = this.propertiesCache.findIndex(p => p.id === id);
    const existing = idx >= 0 ? this.propertiesCache[idx] : {};
    const item = { ...existing, ...prop, id, user_id: App.user ? App.user.id : null, updated_at: new Date().toISOString() };
    if (idx >= 0) this.propertiesCache[idx] = item;
    else this.propertiesCache.push(item);

    if (App.user) {
      this._cloudWrite(Api.save('properties', item), 'O imóvel NÃO foi salvo na nuvem:');
    }
    return item;
  },

  deleteProperty(id) {
    this.propertiesCache = this.propertiesCache.filter(p => p.id !== id);
    if (App.user) {
      this._cloudWrite(Api.remove('properties', id), 'O imóvel NÃO foi excluído da nuvem:');
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

    if (App.user) {
      this._cloudWrite(Api.save('clients', item), 'O cliente NÃO foi salvo na nuvem:');
    }
    return item;
  },

  deleteClient(id) {
    this.clientsCache = this.clientsCache.filter(c => c.id !== id);
    if (App.user) {
      this._cloudWrite(Api.remove('clients', id), 'O cliente NÃO foi excluído da nuvem:');
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

    if (App.user) {
      this._cloudWrite(Api.save('financial_records', item), 'O lançamento NÃO foi salvo na nuvem:');
    }
    return item;
  },

  deleteFinancialRecord(id) {
    this.financialRecordsCache = this.financialRecordsCache.filter(r => r.id !== id);
    if (App.user) {
      this._cloudWrite(Api.remove('financial_records', id), 'O lançamento NÃO foi excluído da nuvem:');
    }
  },

  // ── Vistorias (migration 004) ────────────────────────────────────────
  getInspections() {
    return (this.inspectionsCache || []).slice()
      .sort((a, b) => String(b.inspected_on || '').localeCompare(String(a.inspected_on || '')));
  },

  getInspection(id) {
    return (this.inspectionsCache || []).find(v => v.id === id) || null;
  },

  getInspectionsForProperty(propId) {
    return (this.inspectionsCache || []).filter(v => v.property_id === propId);
  },

  saveInspection(v) {
    const id = v.id || Utils.generateId();
    const idx = this.inspectionsCache.findIndex(x => x.id === id);
    const existing = idx >= 0 ? this.inspectionsCache[idx] : {};
    const item = { ...existing, ...v, id, user_id: App.user ? App.user.id : null, updated_at: new Date().toISOString() };
    if (idx >= 0) this.inspectionsCache[idx] = item;
    else this.inspectionsCache.push(item);

    if (App.user) {
      this._cloudWrite(Api.save('inspections', item), 'A vistoria NÃO foi salva na nuvem:');
    }
    return item;
  },

  deleteInspection(id) {
    this.inspectionsCache = this.inspectionsCache.filter(v => v.id !== id);
    if (App.user) {
      this._cloudWrite(Api.remove('inspections', id), 'A vistoria NÃO foi excluída da nuvem:');
    }
  },

  // Gerar cobranças do mês corrente para todos os contratos ativos.
  // "Ativo" é a MESMA regra dos badges (Utils.getContractStatus, por datas) —
  // a definição própria daqui gerava cobrança até de contrato vencido.
  generateMonthlyCharges(feePercentDefault = 10) {
    const activeContracts = this.getAll().filter(c => Utils.getContractStatus(c).label === 'Ativo');
    let countNew = 0;
    const today = new Date();
    const yearMonth = today.toISOString().slice(0, 7); // "YYYY-MM"

    activeContracts.forEach(c => {
      const tenantName = c.fields.nome_locatario || 'Inquilino';
      const landlordName = c.fields.nome_locador || 'Locador';
      const rentValue = Utils.parseMoneyBRL(c.fields.valor_aluguel);

      if (rentValue <= 0) return;

      const desc = `Aluguel ${yearMonth} - ${c.name}`;
      const exists = this.financialRecordsCache.some(r => r.contract_id === c.id && r.due_date && r.due_date.startsWith(yearMonth));

      if (!exists) {
        const feeValue = rentValue * (feePercentDefault / 100);
        const netPayout = rentValue - feeValue;

        const dueDate = Utils.vencimentoDoMes(c.fields, yearMonth);

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

    const currentRent = Utils.parseMoneyBRL(contract.fields.valor_aluguel);

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
