// ═══════════════════════════════════════════════════════
// Contracts View (Gestão de Clientes)
// ═══════════════════════════════════════════════════════

const ContractsView = {
  render(container) {
    const allContracts = Storage.getAll();
    
    // Filtra contratos residenciais e comerciais
    const residenciais = allContracts.filter(c => c.templateId && c.templateId.toLowerCase().includes('residencial'));
    const comerciais = allContracts.filter(c => c.templateId && c.templateId.toLowerCase().includes('comercial'));
    
    // Função auxiliar para renderizar a lista de clientes
    const renderList = (contracts, emptyMessage) => {
      if (contracts.length === 0) {
        return `
          <div class="empty-state">
            <p>${emptyMessage}</p>
            <a href="#templates" class="btn btn-primary">Criar Novo Contrato</a>
          </div>
        `;
      }
      
      return contracts.map(c => {
        // Escape obrigatório: nome/valor/título vêm de dados preenchidos pelo INQUILINO
        // (anônimo) e são injetados via innerHTML na sessão autenticada do locador.
        const nomeCliente = Utils.esc(c.fields && c.fields.nome_locatario ? c.fields.nome_locatario : 'Locatário não preenchido');
        const valor = Utils.esc(c.fields && c.fields.valor_aluguel ? c.fields.valor_aluguel : 'R$ ---');
        const inicio = c.fields && c.fields.data_inicio ? Utils.formatDate(c.fields.data_inicio) : '---';
        const tituloContrato = Utils.esc(c.name || 'Contrato sem nome');

        return Utils.contractRow(c, {
          icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>',
          title: nomeCliente,
          meta: `<strong>${tituloContrato}</strong> • Início: ${inicio}`,
          aside: `<span class="contract-row-value">${valor}</span>`,
          onDelete: `ContractsView.deleteContract('${c.id}')`
        });
      }).join('');
    };

    let html = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Gestão de Contratos</h1>
          <p class="page-subtitle">Acompanhe seus locatários separados por categoria.</p>
        </div>
        <a href="#templates" class="btn btn-primary">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Novo Contrato
        </a>
      </div>

      <div class="seg-tabs animate-fade-in-up">
        <button class="seg-tab active" id="tab-residencial" onclick="ContractsView.switchTab('residencial')">
          Residenciais (${residenciais.length})
        </button>
        <button class="seg-tab" id="tab-comercial" onclick="ContractsView.switchTab('comercial')">
          Comerciais (${comerciais.length})
        </button>
      </div>

      <div class="recent-section animate-fade-in-up" id="list-residencial">
        <div class="recent-header">
          <h2 class="recent-title">Contratos Residenciais</h2>
        </div>
        <div class="contracts-list">
          ${renderList(residenciais, 'Você ainda não tem contratos residenciais cadastrados.')}
        </div>
      </div>

      <div class="recent-section animate-fade-in-up" id="list-comercial" style="display: none;">
        <div class="recent-header">
          <h2 class="recent-title">Contratos Comerciais</h2>
        </div>
        <div class="contracts-list">
          ${renderList(comerciais, 'Você ainda não tem contratos comerciais cadastrados.')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  },
  
  switchTab(tab) {
    const isRes = tab === 'residencial';
    document.getElementById('tab-residencial').classList.toggle('active', isRes);
    document.getElementById('tab-comercial').classList.toggle('active', !isRes);
    document.getElementById('list-residencial').style.display = isRes ? 'block' : 'none';
    document.getElementById('list-comercial').style.display = isRes ? 'none' : 'block';
  },
  
  deleteContract(id) {
    if (confirm('Tem certeza que deseja excluir este contrato permanentemente?')) {
      Storage.delete(id);
      // Re-renderizar a tela para atualizar a lista
      this.render(document.getElementById('main-content') || document.body);
    }
  }
};
