// ═══════════════════════════════════════════════════════
// Contratos — a carteira inteira numa lista só
//
// A separação antiga era residencial x comercial em duas abas, o que escondia
// metade da carteira o tempo todo e não respondia a pergunta que se faz de
// verdade ("o que está vencido?"). Agora é uma lista com filtros por ESTADO,
// que é o eixo que muda o que o locador faz a seguir.
// ═══════════════════════════════════════════════════════

const ContractsView = {
  // Filtro atual. Mora no módulo, então sobrevive ao re-render (excluir um
  // item) e também à ida e volta para outra rota dentro da mesma sessão — o
  // que é proposital: quem está trabalhando a lista de vencidos volta para
  // ela. Não é persistido entre recargas, e a pílula ativa deixa o estado
  // visível, que é a parte que importa para não confundir com lista vazia.
  filtro: 'todos',

  FILTROS: [
    { id: 'todos', label: 'Todos' },
    { id: 'ativo', label: 'Ativos' },
    { id: 'avencer', label: 'A vencer' },
    { id: 'vencido', label: 'Vencidos' },
    { id: 'pendente', label: 'Aguardando inquilino' },
    { id: 'comercial', label: 'Comerciais' }
  ],

  setFiltro(id) {
    this.filtro = id;
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  },

  // Um contrato pertence a um filtro por estado derivado, nunca por campo
  // digitado — status na mão envelhece e passa a mentir.
  casaFiltro(c, filtro) {
    if (filtro === 'todos') return true;
    if (filtro === 'comercial') return !!(c.templateId && c.templateId.toLowerCase().includes('comercial'));
    const label = Utils.getContractStatus(c).label;
    if (filtro === 'ativo') return label === 'Ativo';
    if (filtro === 'vencido') return label === 'Vencido';
    if (filtro === 'pendente') return !!c.cloudId && !c.isFinalized;
    if (filtro === 'avencer') {
      if (label !== 'Ativo') return false;
      const dias = Dashboard.diasAteFim(c);
      return dias !== null && dias <= 30;
    }
    return true;
  },

  render(container) {
    const todos = Storage.getAll();
    const lista = todos.filter(c => this.casaFiltro(c, this.filtro));

    const ativos = todos.filter(c => Utils.getContractStatus(c).label === 'Ativo').length;
    const vencidos = todos.filter(c => Utils.getContractStatus(c).label === 'Vencido').length;
    const resumo = todos.length
      ? `${todos.length} contrato${todos.length === 1 ? '' : 's'} · ${ativos} ativo${ativos === 1 ? '' : 's'}` +
        (vencidos ? ` · ${vencidos} vencido${vencidos === 1 ? '' : 's'}` : '')
      : 'Nenhum contrato ainda.';

    const filtros = this.FILTROS.map(f => {
      const n = todos.filter(c => this.casaFiltro(c, f.id)).length;
      return `<button type="button" class="filtro-pill ${this.filtro === f.id ? 'active' : ''}"
        onclick="ContractsView.setFiltro('${f.id}')">${Utils.esc(f.label)} (${n})</button>`;
    }).join('');

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Carteira</div>
          <h1 class="page-title">Contratos</h1>
          <p class="page-subtitle">${Utils.esc(resumo)}</p>
        </div>
        <a href="#templates" class="btn btn-primary">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Novo Contrato
        </a>
      </div>

      <div class="filtros animate-fade-in-up">${filtros}</div>

      ${lista.length ? `<div class="card animate-fade-in-up" style="padding:8px 10px;">
        ${lista.map(c => this.linha(c)).join('')}
      </div>` : `
        <div class="empty-state animate-fade-in-up">
          <p>${Utils.esc(todos.length ? 'Nenhum contrato neste filtro.' : 'Você ainda não criou nenhum contrato.')}</p>
          <a href="#templates" class="btn btn-primary">Criar Novo Contrato</a>
        </div>`}
    `;
  },

  linha(c) {
    // Escape obrigatório: nome/valor/título vêm de dados preenchidos pelo INQUILINO
    // (anônimo) e são injetados via innerHTML na sessão autenticada do locador.
    const nome = (c.fields && c.fields.nome_locatario) || 'Locatário não preenchido';
    const status = Utils.getContractStatus(c);
    const dias = Dashboard.diasAteFim(c);
    const valor = this.valorFmt(c);

    // Metadados curtos: só o que ajuda a decidir sem abrir o contrato.
    const meta = [
      c.fields && c.fields.data_inicio && { rotulo: 'início', valor: Utils.formatDate(c.fields.data_inicio) },
      dias !== null && { rotulo: dias < 0 ? 'venceu há' : 'termina em', valor: `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}` },
      c.fields && c.fields.dia_vencimento && { rotulo: 'vence dia', valor: c.fields.dia_vencimento }
    ].filter(Boolean);

    return `
      <div class="contrato-linha" data-busca>
        <span class="avatar avatar-lg">${Utils.esc(String(nome).trim().charAt(0) || '?')}</span>
        <div class="contrato-linha-corpo">
          <div class="contrato-linha-topo">
            <span class="contrato-linha-nome">${Utils.esc(nome)}</span>
            <span class="badge-status ${status.class}">${Utils.esc(status.label)}</span>
            ${c.isFinalized ? `<span class="selo-assinado">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
              assinado</span>` : ''}
          </div>
          <div class="lista-sub">${Utils.esc((c.fields && c.fields.end_imovel) || c.name || 'Imóvel não informado')}</div>
          ${meta.length ? `<div class="chips-meta">
            ${meta.map(m => `<span class="chip-meta">${Utils.esc(m.rotulo)} <b>${Utils.esc(m.valor)}</b></span>`).join('')}
          </div>` : ''}
        </div>
        <div class="contrato-linha-valor">
          <strong>${Utils.esc(valor)}</strong>
          <span>por mês</span>
        </div>
        <div class="contrato-linha-acoes">
          <a class="btn btn-secondary btn-sm" href="#editor?id=${Utils.esc(c.id)}">Abrir</a>
          <button type="button" class="btn-icon" onclick="ContractsView.deleteContract('${Utils.esc(c.id)}')"
            title="Excluir contrato" aria-label="Excluir contrato de ${Utils.esc(nome)}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    `;
  },

  // O valor guardado no contrato já vem mascarado ("R$ 2.450,00"); quando
  // vier de outro caminho, passa pelo formatador único.
  valorFmt(c) {
    const v = c.fields && c.fields.valor_aluguel;
    if (!v) return 'R$ ---';
    return String(v).indexOf('R$') === 0 ? v : Utils.formatCurrency(v);
  },

  deleteContract(id) {
    if (confirm('Tem certeza que deseja excluir este contrato permanentemente?')) {
      Storage.delete(id);
      // Re-renderizar a tela para atualizar a lista
      this.render(document.getElementById('main-content') || document.body);
      App.reaplicarBusca();
    }
  }
};
