// ═══════════════════════════════════════════════════════
// Modelos de contrato — o ponto de partida de todo contrato novo
// ═══════════════════════════════════════════════════════

const Templates = {
  // Quantos contratos já saíram de cada modelo. É um número real, tirado dos
  // contratos existentes — serve para o locador ver qual ele de fato usa.
  usos(templateId) {
    return Storage.getAll().filter(c => c.templateId === templateId).length;
  },

  render(container) {
    const templates = Object.values(Contracts);

    const icone = (nome) => nome === 'home'
      ? '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>'
      : '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Documentos</div>
          <h1 class="page-title">Modelos de contrato</h1>
          <p class="page-subtitle">Escolha um modelo pronto para começar. Todos os campos ficam editáveis depois.</p>
        </div>
      </div>

      <div class="modelos-grid animate-fade-in-up">
        ${templates.map(t => {
          const n = this.usos(t.id);
          return `
          <div class="card modelo-card" data-busca>
            <span class="modelo-icone ${Utils.esc(t.color || 'blue')}">${icone(t.icon)}</span>
            <div class="modelo-titulo">${Utils.esc(t.title)}</div>
            <p class="card-body">${Utils.esc(t.description)}</p>
            <div class="modelo-rodape">
              <span class="badge badge-${Utils.esc(t.color || 'blue')}">${Utils.esc(t.category)}</span>
              <span class="text-muted" style="font-size:12px;">${n ? `${n} contrato${n === 1 ? '' : 's'}` : 'ainda não usado'}</span>
            </div>
            <a class="btn btn-primary btn-block" href="#editor?template=${Utils.esc(t.id)}">Usar este modelo</a>
          </div>
        `;
        }).join('')}

        <!-- Cartão tracejado: a maquete oferece "criar modelo próprio". O editor
             de modelos não existe (os três modelos são dados fixos em
             data/contracts.js), então em vez de um botão morto o cartão diz o
             que dá para fazer hoje: partir da minuta simples e editar tudo. -->
        <div class="card-tracejado">
          <span class="modelo-icone blue">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          </span>
          <div class="modelo-titulo">Precisa de algo diferente?</div>
          <p class="card-body">A minuta simples abre praticamente em branco: dá para escrever as cláusulas do zero e ainda usar a assinatura e o link do inquilino.</p>
          <a class="btn btn-secondary" style="align-self:flex-start;" href="#editor?template=locacao_simples">Começar pela minuta</a>
        </div>
      </div>
    `;
  }
};
