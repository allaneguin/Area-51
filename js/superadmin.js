// ═══════════════════════════════════════════════════════
// SuperAdmin — visão de todas as contas (todas as ilhas)
// Só funciona para usuários com app_metadata.role === 'admin'
// (concedido via supabase_admin.sql; o RLS bloqueia os demais).
// Somente leitura: supervisão, não edição.
// ═══════════════════════════════════════════════════════

const SuperAdmin = {

  isAdmin() {
    return !!(App.user && App.user.app_metadata && App.user.app_metadata.role === 'admin');
  },

  // Agrupa contratos por conta e calcula os números de cada ilha.
  // Puro (sem DOM/rede) de propósito: é o que o teste cobre.
  groupAccounts(contracts, profiles) {
    const porConta = {};
    (profiles || []).forEach(p => {
      porConta[p.id] = { userId: p.id, nome: (p.profile_data && p.profile_data.nome_locador) || '', contratos: [] };
    });
    (contracts || []).forEach(c => {
      if (!porConta[c.user_id]) porConta[c.user_id] = { userId: c.user_id, nome: '', contratos: [] };
      porConta[c.user_id].contratos.push(c);
    });

    return Object.values(porConta).map(conta => {
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
        nome: conta.nome,
        total: conta.contratos.length,
        ativos,
        receita,
        ultimaAtividade,
        contratos: conta.contratos
      };
    }).sort((a, b) => new Date(b.ultimaAtividade || 0) - new Date(a.ultimaAtividade || 0));
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
      // Sem filtro de dono: a política contracts_select_admin/profiles_select_admin
      // libera a leitura global só para o admin. cloud_key fica de fora de propósito
      // (é a chave dos links dos inquilinos das outras contas).
      const [{ data: contracts, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
        supabaseClient.from('contracts')
          .select('user_id, name, fields, is_finalized, created_at, updated_at'),
        supabaseClient.from('profiles').select('id, profile_data')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const contas = this.groupAccounts(contracts, profiles);
      this.renderContas(container, contas);
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

  renderContas(container, contas) {
    const totalContratos = contas.reduce((s, c) => s + c.total, 0);
    const receitaGlobal = contas.reduce((s, c) => s + c.receita, 0);
    const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    const linhas = contas.map((conta, i) => {
      const contratosHtml = conta.contratos.map(c => {
        const status = Utils.getContractStatus({ fields: c.fields });
        const nomeLocatario = Utils.esc((c.fields && c.fields.nome_locatario) || 'Locatário não preenchido');
        return `
          <div class="contract-row" style="cursor: default; padding: 10px 22px;">
            <div class="contract-row-info">
              <div class="contract-row-name" style="font-size: 13.5px; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                ${nomeLocatario}
                <span class="badge-status ${status.class}">${status.label}</span>
              </div>
              <div class="contract-row-meta">${Utils.esc(c.name || 'Contrato sem nome')}</div>
            </div>
            <div class="contract-row-date">${Utils.esc((c.fields && c.fields.valor_aluguel) || 'R$ ---')}</div>
          </div>
        `;
      }).join('') || `<div style="padding: 14px 22px; color: var(--text-muted); font-size: 13.5px;">Nenhum contrato nesta conta.</div>`;

      return `
        <div class="recent-section" style="margin-bottom: 14px;">
          <div class="recent-header" style="cursor: pointer;" onclick="document.getElementById('sa-conta-${i}').style.display = document.getElementById('sa-conta-${i}').style.display === 'none' ? '' : 'none'">
            <div style="min-width: 0;">
              <h2 class="recent-title">${Utils.esc(conta.nome || 'Conta sem perfil')}</h2>
              <div style="font-size: 11.5px; color: var(--text-light); font-family: monospace;">${Utils.esc(conta.userId)}</div>
            </div>
            <div style="display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--text-muted);">
              <span><strong style="color: var(--text-main);">${conta.total}</strong> contrato${conta.total === 1 ? '' : 's'}</span>
              <span><strong style="color: var(--success);">${conta.ativos}</strong> ativo${conta.ativos === 1 ? '' : 's'}</span>
              <span style="font-weight: 700; color: var(--primary);">${fmtBRL(conta.receita)}/mês</span>
              <span>${conta.ultimaAtividade ? Utils.formatRelativeDate(conta.ultimaAtividade) : '—'}</span>
            </div>
          </div>
          <div class="contracts-list" id="sa-conta-${i}" style="display: none;">
            ${contratosHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Todas as Contas</h1>
          <p class="page-subtitle">Visão de administrador — somente leitura. Clique numa conta para ver os contratos.</p>
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

      <div class="animate-fade-in-up">
        ${linhas || '<div class="empty-state glass"><p>Nenhuma conta encontrada.</p></div>'}
      </div>
    `;
  }
};
