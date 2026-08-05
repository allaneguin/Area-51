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
          receita += Utils.parseMoneyBRL(c.fields && c.fields.valor_aluguel);
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
      // Contratos vêm por RPC, não da tabela: a função devolve só as colunas de
      // supervisão e NUNCA cloud_key, que é a credencial dos links do inquilino
      // (ver supabase/migrations/002). Perfis seguem por política de admin.
      const [{ data: contracts, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
        supabaseClient.rpc('admin_list_contracts'),
        supabaseClient.from('profiles').select('id, profile_data')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      // E-mail/cadastro/último login vêm de uma RPC (auth.users não é legível direto).
      // Se a função ainda não foi criada no banco, seguimos sem esses campos.
      let users = [];
      const { data: usersData, error: e3 } = await supabaseClient.rpc('admin_list_users');
      if (e3) {
        console.warn('admin_list_users indisponível (aplique supabase/migrations/):', e3.message);
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
            Confirme que as migrations de <strong>supabase/migrations/</strong> foram
            aplicadas e que você deslogou e logou de novo depois de receber o papel de admin.
          </p>
        </div>
      `;
    }
  },

  // Só o botão de copiar (ícone), para embutir numa faixa.
  // O valor vai num atributo (escapado como HTML), nunca dentro do código do
  // onclick: o navegador decodifica entidades no atributo ANTES de compilar o JS,
  // então um apóstrofo no e-mail escaparia do literal de string.
  _copyBtn(valor) {
    if (!valor) return '';
    return `<button class="btn-icon" title="Copiar" data-copy="${Utils.esc(String(valor))}" onclick="event.stopPropagation(); SuperAdmin.copiar(this)"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>`;
  },

  copiar(btn) {
    const texto = (btn && btn.getAttribute('data-copy')) || '';
    navigator.clipboard.writeText(texto).then(() => {
      Utils.toast('Copiado: ' + texto);
    }).catch(() => {
      Utils.toast('Não foi possível copiar automaticamente.', 'error');
    });
  },

  // Locador em uma linha só (valores separados por ·), em vez de um grid de rótulos.
  locadorInline(profile) {
    profile = profile || {};
    const isPJ = Utils.isPJLocador(profile);
    const doc = profile.doc_locador && ((isPJ ? 'CNPJ ' : 'CPF ') + Utils.maskCPFCNPJ(profile.doc_locador));
    const banco = [profile.banco, profile.agencia && ('Ag ' + profile.agencia), profile.conta_banco, profile.tipo_conta]
      .filter(Boolean).join(' · ');
    const partes = [
      isPJ ? 'Pessoa Jurídica' : 'Pessoa Física',
      doc,
      !isPJ && profile.rg_locador && ('RG ' + profile.rg_locador),
      !isPJ && profile.est_civil_locador,
      banco
    ].filter(Boolean);
    if (partes.length <= 1) return '<span style="color: var(--text-light);">Perfil ainda não preenchido.</span>';
    return partes.map(p => Utils.esc(p)).join(' <span class="sa-sep">·</span> ');
  },

  renderContas(container) {
    const contas = this.contas;
    const totalContratos = contas.reduce((s, c) => s + c.total, 0);
    const receitaGlobal = contas.reduce((s, c) => s + c.receita, 0);
    const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    const chevron = '<svg class="sa-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';

    const linhas = contas.map((conta, i) => {
      // Contrato = uma linha compacta; o detalhe completo só abre quando clicado.
      const contratosHtml = conta.contratos.map((c, j) => {
        const status = Utils.getContractStatus({ fields: c.fields });
        const nomeLocatario = Utils.esc((c.fields && c.fields.nome_locatario) || 'Locatário não preenchido');
        const valor = Utils.esc((c.fields && c.fields.valor_aluguel) || 'R$ ---');
        const detalhe = Utils.dadosClienteHTML(c.fields, c.created_at) ||
          '<p style="color: var(--text-muted); font-size: 13px; margin: 0;">Contrato ainda sem dados preenchidos.</p>';
        return `
          <div class="sa-contrato-row" onclick="SuperAdmin.toggleContrato(${i}, ${j}, this)">
            ${chevron}
            <div class="sa-contrato-nome">${nomeLocatario}<span class="badge-status ${status.class}">${status.label}</span></div>
            <div class="sa-contrato-valor">${valor}</div>
          </div>
          <div class="sa-contrato-detalhe" id="sa-c-${i}-${j}" style="display: none;">
            <div class="contract-row-meta" style="margin: 0 0 8px;">${Utils.esc(c.name || 'Contrato sem nome')}</div>
            ${detalhe}
          </div>
        `;
      }).join('') || `<div style="padding: 14px 22px; color: var(--text-muted); font-size: 13.5px;">Nenhum contrato nesta conta.</div>`;

      const busca = [conta.nome, conta.email, conta.userId, conta.profile.doc_locador].filter(Boolean).join(' ').toLowerCase();
      const idCurto = conta.userId.slice(0, 8) + '…';

      return `
        <div class="recent-section sa-conta" data-busca="${Utils.esc(busca)}">
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
            <div class="sa-strip">
              ${conta.email ? `<span><strong>${Utils.esc(conta.email)}</strong></span>${this._copyBtn(conta.email)}` : ''}
              ${conta.criadoEm ? `<span class="sa-sep">·</span><span>Cadastro <strong>${Utils.formatDate(conta.criadoEm)}</strong></span>` : ''}
              ${conta.ultimoLogin ? `<span class="sa-sep">·</span><span>Último acesso <strong>${Utils.formatRelativeDate(conta.ultimoLogin)}</strong></span>` : ''}
              <span class="sa-sep">·</span><span>ID <span class="sa-id">${Utils.esc(idCurto)}</span></span>${this._copyBtn(conta.userId)}
            </div>
            <div class="sa-strip">${this.locadorInline(conta.profile)}</div>
            <div class="sa-secao">Contratos (${conta.total})</div>
            ${contratosHtml}
          </div>
        </div>
      `;
    }).join('');

    const aviso = this.semDadosDeConta ? `
      <div style="margin-bottom: 16px; padding: 12px 16px; border: 1px solid var(--warning); background: var(--warning-bg); color: var(--warning); border-radius: var(--radius-md); font-size: 13px;">
        E-mail e datas de acesso indisponíveis: aplique as migrations de <strong>supabase/migrations/</strong> para criar a função <strong>admin_list_users</strong>.
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

      <!-- Num div: input é inline-block e o "margin: auto" da coluna central
           de #main-content não centraliza inline-block — o campo escapava à esquerda. -->
      <div style="margin-bottom: 16px;">
        <input type="text" class="form-input" placeholder="Buscar por nome, e-mail, CPF/CNPJ ou ID..."
          oninput="SuperAdmin.filtrar(this.value)">
      </div>

      <div class="animate-fade-in-up" id="sa-lista">
        ${linhas || '<div class="empty-state glass"><p>Nenhuma conta encontrada.</p></div>'}
      </div>
    `;
  },

  toggle(i) {
    const el = document.getElementById('sa-conta-' + i);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  },

  toggleContrato(i, j, rowEl) {
    const el = document.getElementById(`sa-c-${i}-${j}`);
    if (!el) return;
    const aberto = el.style.display !== 'none';
    el.style.display = aberto ? 'none' : '';
    if (rowEl) rowEl.classList.toggle('aberto', !aberto);
  },

  filtrar(termo) {
    termo = (termo || '').trim().toLowerCase();
    document.querySelectorAll('#sa-lista .sa-conta').forEach(el => {
      const alvo = el.getAttribute('data-busca') || '';
      el.style.display = alvo.includes(termo) ? '' : 'none';
    });
  }
};
