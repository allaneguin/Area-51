// ═══════════════════════════════════════════════════════
// Dashboard View
// ═══════════════════════════════════════════════════════

const Dashboard = {
  // "R$ 2.450,00" -> 2450.00 — delega para o parser único do sistema
  parseValor(v) {
    return Utils.parseMoneyBRL(v);
  },

  // Contratos cujo termino cai nos proximos 30 dias
  countAVencer(contracts) {
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    return contracts.filter(c => {
      const fim = c.fields && c.fields.data_termino;
      if (!fim) return false;
      const d = new Date(fim);
      return d >= hoje && d <= limite;
    }).length;
  },

  render(container) {
    const stats = Storage.getStats();
    const all = Storage.getAll();
    const recent = all.slice(0, 5);

    const aVencer = this.countAVencer(all);
    // Só contratos ATIVOS entram na receita — o card diz "aluguéis ativos",
    // e vencidos/futuros somados aqui inflavam o número.
    const receita = all
      .filter(c => Utils.getContractStatus(c).label === 'Ativo')
      .reduce((soma, c) => soma + this.parseValor(c.fields && c.fields.valor_aluguel), 0);
    const receitaFmt = receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    let recentHtml = recent.length ? recent.map(c => {
      const status = Utils.getContractStatus(c);
      return `
        <div class="contract-row" onclick="window.location.hash='#editor?id=${c.id}'">
          <div class="contract-row-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </div>
          <div class="contract-row-info">
            <div class="contract-row-name">
              ${Utils.esc(c.name || 'Contrato sem nome')}
              <span class="badge-status ${status.class}">${status.label}</span>
            </div>
            <div class="contract-row-meta">${Contracts[c.templateId]?.title || 'Modelo Desconhecido'}${c.createdAt ? ` · Iniciado em <strong>${Utils.formatDate(c.createdAt)}</strong>` : ''}</div>
          </div>
          <div class="contract-row-date">
            ${Utils.formatRelativeDate(c.updatedAt)}
            <button class="btn-icon contract-row-delete" onclick="event.stopPropagation(); Dashboard.deleteContract('${c.id}')" title="Excluir contrato" aria-label="Excluir contrato">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('') : `
      <div class="empty-state glass">
        <p>Você ainda não criou nenhum contrato.</p>
        <a href="#templates" class="btn btn-primary">Criar Novo</a>
      </div>
    `;

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Visão Geral</h1>
          <p class="page-subtitle">Acompanhe e gerencie seus contratos.</p>
        </div>
        <a href="#templates" class="btn btn-primary">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Novo Contrato
        </a>
      </div>

      <div class="stats-grid stagger-1 animate-fade-in-up">
        <div class="card stat-card">
          <div class="stat-head">
            <span class="stat-icon blue">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </span>
            <span class="stat-label">Total de Contratos</span>
          </div>
          <div class="stat-value">${stats.total}</div>
          <div class="stat-delta ${stats.thisMonth ? 'positive' : ''}">${stats.thisMonth ? `+${stats.thisMonth} este mês` : 'Nenhum ainda'}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head">
            <span class="stat-icon amber">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </span>
            <span class="stat-label">A vencer · 30 dias</span>
          </div>
          <div class="stat-value">${aVencer}</div>
          <div class="stat-delta ${aVencer ? 'warning' : ''}">${aVencer ? 'Requer atenção' : 'Nada a vencer'}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head">
            <span class="stat-icon green">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </span>
            <span class="stat-label">Receita mensal</span>
          </div>
          <div class="stat-value">${receitaFmt}</div>
          <div class="stat-delta">Somando os aluguéis ativos</div>
        </div>
      </div>

      <div class="recent-section stagger-2 animate-fade-in-up">
        <div class="recent-header">
          <h2 class="recent-title">Editados Recentemente</h2>
        </div>
        <div class="contracts-list">
          ${recentHtml}
        </div>
      </div>
    `;
  },

  deleteContract(id) {
    if (confirm('Tem certeza que deseja excluir este contrato permanentemente?')) {
      Storage.delete(id);
      // Re-renderizar o dashboard
      this.render(document.getElementById('main-content') || document.body);
    }
  }
};
