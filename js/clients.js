// ═══════════════════════════════════════════════════════
// Módulo de Gestão de Clientes — ClientsView
// ═══════════════════════════════════════════════════════

const ClientsView = {
  // Tipo do cliente -> badge do sistema (tokens do tema, sem cor fixa)
  badgeTipo(tipo) {
    const classe = tipo === 'Locador' ? 'badge-teal' : tipo === 'Inquilino' ? 'badge-blue' : 'badge-amber';
    return `<span class="badge ${classe}">${Utils.esc(tipo || '')}</span>`;
  },

  render(container) {
    const clients = Storage.getClients();

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Central de Clientes</h1>
          <p class="page-subtitle">Cadastre Locadores, Inquilinos e Fiadores de forma unificada.</p>
        </div>
        <button class="btn btn-primary" onclick="ClientsView.openModal()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Novo Cliente
        </button>
      </div>

      <div class="stats-grid animate-fade-in-up">
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Total de Cadastros</span></div>
          <div class="stat-value">${clients.length}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Inquilinos</span></div>
          <div class="stat-value" style="color: var(--primary);">${clients.filter(c => c.client_type === 'Inquilino').length}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Locadores</span></div>
          <div class="stat-value" style="color: var(--success);">${clients.filter(c => c.client_type === 'Locador').length}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Fiadores / Outros</span></div>
          <div class="stat-value" style="color: var(--warning);">${clients.filter(c => c.client_type !== 'Inquilino' && c.client_type !== 'Locador').length}</div>
        </div>
      </div>

      ${clients.length === 0 ? `
        <div class="empty-state glass animate-fade-in-up">
          <p>Nenhum cliente cadastrado.</p>
          <p style="color: var(--text-muted); font-weight: 400; font-size: 14px; margin-top: -10px; margin-bottom: 20px;">Cadastre locadores e inquilinos para agilizar o preenchimento dos contratos.</p>
          <button class="btn btn-primary" onclick="ClientsView.openModal()">Cadastrar Cliente</button>
        </div>
      ` : `
        <div class="data-table-wrap animate-fade-in-up">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Contato</th>
                <th>Profissão</th>
                <th class="td-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${clients.map(c => `
                <tr>
                  <td style="font-weight: 600;">
                    ${Utils.esc(c.name)}
                    <span class="td-sub">${Utils.esc(c.person_type || 'PF')}</span>
                  </td>
                  <td>${this.badgeTipo(c.client_type)}</td>
                  <td>${Utils.esc(c.document ? Utils.maskCPFCNPJ(c.document) : '—')}</td>
                  <td>
                    ${Utils.esc(c.phone || '—')}
                    <span class="td-sub">${Utils.esc(c.email || '—')}</span>
                  </td>
                  <td>${Utils.esc(c.profession || '—')}</td>
                  <td class="td-acoes">
                    <button class="btn btn-secondary" onclick="ClientsView.openModal('${c.id}')">Editar</button>
                    <button class="btn btn-danger" onclick="ClientsView.deleteClient('${c.id}')">Excluir</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}

      <!-- Modal de Cadastro/Edição de Cliente -->
      <div id="client-modal" class="modal-backdrop">
        <div class="modal-card">
          <h3 id="client-modal-title">Cadastrar Cliente</h3>
          <form id="client-form" onsubmit="ClientsView.saveClient(event)">
            <input type="hidden" id="client-id">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Tipo de Cliente *</label>
                <select id="client-type" class="form-input">
                  <option value="Inquilino">Inquilino</option>
                  <option value="Locador">Locador</option>
                  <option value="Fiador">Fiador</option>
                  <option value="Cônjuge">Cônjuge</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Pessoa</label>
                <select id="client-person-type" class="form-input" onchange="ClientsView.updateDocLabel()">
                  <option value="PF">Pessoa Física (PF)</option>
                  <option value="PJ">Pessoa Jurídica (PJ)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome Completo / Razão Social *</label>
              <input type="text" id="client-name" class="form-input" placeholder="Ex: João da Silva" required>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label id="doc-label" class="form-label">CPF *</label>
                <input type="text" id="client-doc" class="form-input" placeholder="000.000.000-00" required>
              </div>
              <div class="form-group">
                <label class="form-label">RG / IE</label>
                <input type="text" id="client-rg" class="form-input" placeholder="0000000 SSP/UF">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Telefone / WhatsApp</label>
                <input type="text" id="client-phone" class="form-input" placeholder="(00) 90000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">E-mail</label>
                <input type="email" id="client-email" class="form-input" placeholder="email@exemplo.com">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Profissão</label>
                <input type="text" id="client-profession" class="form-input" placeholder="Ex: Engenheiro">
              </div>
              <div class="form-group">
                <label class="form-label">Renda Declarada (R$)</label>
                <input type="number" step="0.01" id="client-income" class="form-input" placeholder="0.00">
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 1.25rem;">
              <label class="form-label">Endereço Residencial/Comercial</label>
              <input type="text" id="client-address" class="form-input" placeholder="Rua, Número, Bairro, Cidade - UF">
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" onclick="ClientsView.closeModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar Cliente</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // CPF/CNPJ com máscara, como em todo o resto do sistema
    const docInput = document.getElementById('client-doc');
    if (docInput) Utils.applyMask(docInput, 'cpfcnpj');
  },

  updateDocLabel() {
    const personType = document.getElementById('client-person-type').value;
    const label = document.getElementById('doc-label');
    const input = document.getElementById('client-doc');
    if (personType === 'PJ') {
      label.innerText = 'CNPJ *';
      input.placeholder = '00.000.000/0001-00';
    } else {
      label.innerText = 'CPF *';
      input.placeholder = '000.000.000-00';
    }
  },

  openModal(id = null) {
    const modal = document.getElementById('client-modal');
    const title = document.getElementById('client-modal-title');
    modal.style.display = 'flex';

    if (id) {
      const client = Storage.getClients().find(c => c.id === id);
      if (client) {
        title.innerText = 'Editar Cliente';
        document.getElementById('client-id').value = client.id;
        document.getElementById('client-type').value = client.client_type || 'Inquilino';
        document.getElementById('client-person-type').value = client.person_type || 'PF';
        document.getElementById('client-name').value = client.name || '';
        document.getElementById('client-doc').value = client.document || '';
        document.getElementById('client-rg').value = client.rg || '';
        document.getElementById('client-phone').value = client.phone || '';
        document.getElementById('client-email').value = client.email || '';
        document.getElementById('client-profession').value = client.profession || '';
        document.getElementById('client-income').value = client.income || '';
        document.getElementById('client-address').value = client.address || '';
        this.updateDocLabel();
        return;
      }
    }

    title.innerText = 'Cadastrar Cliente';
    document.getElementById('client-form').reset();
    document.getElementById('client-id').value = '';
    this.updateDocLabel();
  },

  closeModal() {
    document.getElementById('client-modal').style.display = 'none';
  },

  saveClient(e) {
    e.preventDefault();
    const id = document.getElementById('client-id').value;
    const clientData = {
      id: id || null,
      client_type: document.getElementById('client-type').value,
      person_type: document.getElementById('client-person-type').value,
      name: document.getElementById('client-name').value,
      document: document.getElementById('client-doc').value,
      rg: document.getElementById('client-rg').value,
      phone: document.getElementById('client-phone').value,
      email: document.getElementById('client-email').value,
      profession: document.getElementById('client-profession').value,
      income: parseFloat(document.getElementById('client-income').value) || 0,
      address: document.getElementById('client-address').value
    };

    Storage.saveClient(clientData);
    Utils.toast('Cliente salvo com sucesso!');
    this.closeModal();
    this.render(document.getElementById('main-content'));
  },

  deleteClient(id) {
    if (confirm('Deseja realmente excluir este cliente?')) {
      Storage.deleteClient(id);
      Utils.toast('Cliente excluído!');
      this.render(document.getElementById('main-content'));
    }
  }
};
