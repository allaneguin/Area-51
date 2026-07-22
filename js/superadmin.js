// ═══════════════════════════════════════════════════════
// SuperAdmin — visão de todas as contas (todas as ilhas)
// Só funciona para usuários com app_metadata.role === 'admin'
// (concedido via supabase_admin.sql; o RLS bloqueia os demais).
// Somente leitura: ficha de suporte, não edição.
// ═══════════════════════════════════════════════════════

const SuperAdmin = {

  isAdmin() {
    return !!(App.user && App.user.app_metadata && App.user.app_metadata.role === 'admin');
  },

  // Junta contratos + perfis + dados de conta (auth) por user_id.
  // Puro (sem DOM/rede) de propósito: é o que o teste cobre.
  groupAccounts(contracts, profiles, users) {
    const porConta = {};
    const infoUser = {};
    (users || []).forEach(u => { infoUser[u.id] = u; });

    const garante = (id) => {
      if (!porConta[id]) porConta[id] = { userId: id, profile: {}, contratos: [] };
      return porConta[id];
    };

    (profiles || []).forEach(p => { garante(p.id).profile = p.profile_data || {}; });
    (contracts || []).forEach(c => { garante(c.user_id).contratos.push(c); });
    // Conta que existe no auth mas ainda não tem perfil nem contrato também aparece.
    (users || []).forEach(u => garante(u.id));

    return Object.values(porConta).map(conta => {
      const u = infoUser[conta.userId] || {};
      let ativos = 0, receita = 0, ultimaAtividade = null;
      conta.contratos.forEach(c => {
        const status = Utils.getContractStatus({ fields: c.fields });
        if (status.label === 'Ativo') {
          ativos++;
          receita += Dashboard.parseValor(c.fields && c.fields.valor_aluguel);
        }
        if (!ultimaAtividade || new Date(c.updated_at) > new Date(ultimaAtividade)) {
          ultimaAtividade = c.updated_at;
        }
      });
      return {
        userId: conta.userId,
        profile: conta.profile,
        nome: conta.profile.nome_locador || '',
        email: u.email || '',
        criadoEm: u.created_at || null,
        ultimoLogin: u.last_sign_in_at || null,
        total: conta.contratos.length,
        ativos,
        receita,
        ultimaAtividade,
        contratos: conta.contratos
      };
    }).sort((a, b) => {
      const ka = a.ultimaAtividade || a.ultimoLogin || a.criadoEm || 0;
      const kb = b.ultimaAtividade || b.ultimoLogin || b.criadoEm || 0;
      return new Date(kb) - new Date(ka);
    });
  },

  async render(container) {
    if (!this.isAdmin()) {
      window.location.hash = '#dashboard';
      return;
    }

    container.innerHTML = `
      <div style="text-align: center; padding: 5rem 0; color: var(--text-muted);">
        Carregando todas as contas...
      </div>
    `;

    try {
      // Sem filtro de dono: as políticas *_select_admin liberam a leitura global
      // só para o admin. cloud_key fica de fora (é a chave dos links dos inquilinos).
      const [{ data: contracts, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
        supabaseClient.from('contracts')
          .select('user_id, name, fields, is_finalized, created_at, updated_at'),
        supabaseClient.from('profiles').select('id, profile_data')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      // E-mail/cadastro/último login vêm de uma RPC (auth.users não é legível direto).
      // Se a função ainda não foi criada no banco, seguimos sem esses campos.
      let users = [];
      const { data: usersData, error: e3 } = await supabaseClient.rpc('admin_list_users');
      if (e3) {
        console.warn('admin_list_users indisponível (rode supabase_admin.sql):', e3.message);
      } else {
        users = usersData || [];
      }

      this.contas = this.groupAccounts(contracts, profiles, users);
      this.semDadosDeConta = !users.length;
      this.renderContas(container);
    } catch (err) {
      container.innerHTML = `
        <div class="empty-state glass">
          <p>Não foi possível carregar as contas: ${Utils.esc(err.message)}</p>
          <p style="font-size: 0.9rem; color: var(--text-muted); font-weight: 400;">
            Confirme que o script supabase_admin.sql foi executado e que você
            deslogou e logou de novo depois de receber o papel de admin.
          </p>
        </div>
      `;
    }
  },

  // Bloco de rótulo/valor reaproveitando o estilo .cliente-detalhes já existente.
  _detalhes(pares) {
    const itens = pares.filter(p => p && p[1]);
    if (!itens.length) return '<p style="color: var(--text-muted); font-size: 13px; margin: 0;">Não informado.</p>';
    return `<div class="cliente-detalhes">` + itens.map(([rotulo, valor]) => `
      <div class="cliente-detalhe">
        <span class="cliente-detalhe-rotulo">${rotulo}</span>
        <span class="cliente-detalhe-valor">${Utils.esc(String(valor))}</span>
      </div>
    `).join('') + `</div>`;
  },

  _copiavel(rotulo, valor) {
    if (!valor) return '';
    const seguro = Utils.esc(String(valor)).replace(/'/g, '&#39;');
    return `
      <div class="cliente-detalhe">
        <span class="cliente-detalhe-rotulo">${rotulo}</span>
        <span class="cliente-detalhe-valor" style="display: inline-flex; align-items: center; gap: 6px;">
          ${Utils.esc(String(valor))}
          <button class="btn-icon" style="padding: 2px;" title="Copiar" onclick="event.stopPropagation(); SuperAdmin.copiar('${seguro}', this)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:15px;height:15px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          </button>
        </span>
      </div>`;
  },

  copiar(texto, btn) {
    navigator.clipboard.writeText(texto).then(() => {
      Utils.toast('Copiado: ' + texto);
    }).catch(() => {
      Utils.toast('Não foi possível copiar automaticamente.', 'error');
    });
  },

  // Ficha do locador (dono da conta), a partir do profile_data.
  fichaLocadorHTML(profile) {
    const isPJ = Utils.isPJLocador(profile);
    const docLabel = isPJ ? 'CNPJ' : 'CPF';
    const conta = [profile.banco, profile.agencia && ('Ag ' + profile.agencia), profile.conta_banco]
      .filter(Boolean).join(' · ');
    return this._detalhes([
      ['Tipo', isPJ ? 'Pessoa Jurídica' : 'Pessoa Física'],
      [docLabel, profile.doc_locador && Utils.maskCPFCNPJ(profile.doc_locador)],
      !isPJ && ['RG', profile.rg_locador],
      !isPJ && ['Estado civil', profile.est_civil_locador],
      !isPJ && ['Nacionalidade', profile.nac_locador],
      ['Banco', conta],
      profile.tipo_conta && ['Tipo de conta', profile.tipo_conta]
    ]);
  },

  renderContas(container) {
    const contas = this.contas;
    const totalContratos = contas.reduce((s, c) => s + c.total, 0);
    const receitaGlobal = contas.reduce((s, c) => s + c.receita, 0);
    const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    const linhas = contas.map((conta, i) => {
      // Cada contrato: cabeçalho (locatário + status + valor) e a ficha completa dele.
      const contratosHtml = conta.contratos.map(c => {
        const status = Utils.getContractStatus({ fields: c.fields });
        const nomeLocatario = Utils.esc((c.fields && c.fields.nome_locatario) || 'Locatário não preenchido');
        return `
          <div style="padding: 12px 22px; border-top: 1px solid var(--border-light);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
              <div class="contract-row-name" style="font-size: 13.5px; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                ${nomeLocatario}
                <span class="badge-status ${status.class}">${status.label}</span>
              </div>
              <div style="font-weight: 600; color: var(--primary); font-size: 13px;">${Utils.esc((c.fields && c.fields.valor_aluguel) || 'R$ ---')}</div>
            </div>
            <div class="contract-row-meta" style="margin: 4px 0 8px;">${Utils.esc(c.name || 'Contrato sem nome')}</div>
            ${Utils.dadosClienteHTML(c.fields, c.created_at)}
          </div>
        `;
      }).join('') || `<div style="padding: 14px 22px; color: var(--text-muted); font-size: 13.5px; border-top: 1px solid var(--border-light);">Nenhum contrato nesta conta.</div>`;

      const busca = [conta.nome, conta.email, conta.userId, conta.profile.doc_locador].filter(Boolean).join(' ').toLowerCase();

      return `
        <div class="recent-section sa-conta" data-busca="${Utils.esc(busca)}" style="margin-bottom: 14px;">
          <div class="recent-header" style="cursor: pointer;" onclick="SuperAdmin.toggle(${i})">
            <div style="min-width: 0;">
              <h2 class="recent-title">${Utils.esc(conta.nome || conta.email || 'Conta sem perfil')}</h2>
              <div style="font-size: 12px; color: var(--text-light);">${conta.email ? Utils.esc(conta.email) : Utils.esc(conta.userId)}</div>
            </div>
            <div style="display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--text-muted);">
              <span><strong style="color: var(--text-main);">${conta.total}</strong> contrato${conta.total === 1 ? '' : 's'}</span>
              <span><strong style="color: var(--success);">${conta.ativos}</strong> ativo${conta.ativos === 1 ? '' : 's'}</span>
              <span style="font-weight: 700; color: var(--primary);">${fmtBRL(conta.receita)}/mês</span>
              <span>${conta.ultimaAtividade ? Utils.formatRelativeDate(conta.ultimaAtividade) : '—'}</span>
            </div>
          </div>
          <div id="sa-conta-${i}" style="display: none;">
            <div style="padding: 16px 22px; border-top: 1px solid var(--border-light);">
              <div class="cliente-detalhe-rotulo" style="margin-bottom: 8px;">Dados da conta</div>
              <div class="cliente-detalhes">
                ${this._copiavel('E-mail', conta.email)}
                ${conta.criadoEm ? `<div class="cliente-detalhe"><span class="cliente-detalhe-rotulo">Cadastro</span><span class="cliente-detalhe-valor">${Utils.formatDate(conta.criadoEm)}</span></div>` : ''}
                ${conta.ultimoLogin ? `<div class="cliente-detalhe"><span class="cliente-detalhe-rotulo">Último acesso</span><span class="cliente-detalhe-valor">${Utils.formatRelativeDate(conta.ultimoLogin)}</span></div>` : ''}
                ${this._copiavel('User ID', conta.userId)}
              </div>
            </div>
            <div style="padding: 16px 22px; border-top: 1px solid var(--border-light);">
              <div class="cliente-detalhe-rotulo" style="margin-bottom: 8px;">Locador (dono da conta)</div>
              ${this.fichaLocadorHTML(conta.profile)}
            </div>
            <div style="padding: 12px 22px 4px; border-top: 1px solid var(--border-light);">
              <div class="cliente-detalhe-rotulo">Contratos (${conta.total})</div>
            </div>
            ${contratosHtml}
          </div>
        </div>
      `;
    }).join('');

    const aviso = this.semDadosDeConta ? `
      <div style="margin-bottom: 16px; padding: 12px 16px; border: 1px solid var(--warning); background: var(--warning-bg); color: var(--warning); border-radius: var(--radius-md); font-size: 13px;">
        E-mail e datas de acesso indisponíveis: rode a versão mais recente de <strong>supabase_admin.sql</strong> no Supabase para criar a função <strong>admin_list_users</strong>.
      </div>` : '';

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Todas as Contas</h1>
          <p class="page-subtitle">Ficha de suporte — somente leitura. Clique numa conta para ver os dados completos.</p>
        </div>
      </div>

      <div class="stats-grid animate-fade-in-up" style="margin-bottom: 24px;">
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Contas</span></div>
          <div class="stat-value">${contas.length}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Contratos no sistema</span></div>
          <div class="stat-value">${totalContratos}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Receita ativa global</span></div>
          <div class="stat-value">${fmtBRL(receitaGlobal)}</div>
        </div>
      </div>

      ${aviso}

      <input type="text" class="form-input" placeholder="Buscar por nome, e-mail, CPF/CNPJ ou ID..."
        oninput="SuperAdmin.filtrar(this.value)" style="margin-bottom: 16px;">

      <div class="animate-fade-in-up" id="sa-lista">
        ${linhas || '<div class="empty-state glass"><p>Nenhuma conta encontrada.</p></div>'}
      </div>
    `;
  },

  toggle(i) {
    const el = document.getElementById('sa-conta-' + i);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  },

  filtrar(termo) {
    termo = (termo || '').trim().toLowerCase();
    document.querySelectorAll('#sa-lista .sa-conta').forEach(el => {
      const alvo = el.getAttribute('data-busca') || '';
      el.style.display = alvo.includes(termo) ? '' : 'none';
    });
  }
};
