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
          <div class="empty-state glass">
            <p>${emptyMessage}</p>
            <a href="#templates" class="btn btn-primary">Criar Novo Contrato</a>
          </div>
        `;
      }
      
      return contracts.map(c => {
        const nomeCliente = c.fields && c.fields.nome_locatario ? c.fields.nome_locatario : 'Locatário não preenchido';
        const valor = c.fields && c.fields.valor_aluguel ? c.fields.valor_aluguel : 'R$ ---';
        const inicio = c.fields && c.fields.data_inicio ? Utils.formatDate(c.fields.data_inicio) : '---';
        const tituloContrato = c.name || 'Contrato sem nome';
        const status = Utils.getContractStatus(c);

        return `
          <div class="contract-row" onclick="window.location.hash='#editor?id=${c.id}'">
            <div class="contract-row-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </div>
            <div class="contract-row-info">
              <div class="contract-row-name" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                ${nomeCliente}
                <span class="badge-status ${status.class}">${status.label}</span>
              </div>
              <div class="contract-row-meta"><strong>${tituloContrato}</strong> • Início: ${inicio}</div>
            </div>
            <div class="contract-row-date" style="font-size: 0.95rem; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 1rem;">
              ${valor}
              <button class="btn-icon" style="color: var(--danger, #ef4444); padding: 0.25rem;" onclick="event.stopPropagation(); ContractsView.deleteContract('${c.id}')" title="Excluir Contrato">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>
        `;
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
