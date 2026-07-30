// ═══════════════════════════════════════════════════════
// Módulo de Gestão de Imóveis — PropertiesView
// ═══════════════════════════════════════════════════════

const PropertiesView = {
  // Status do imóvel -> badge do sistema (tokens do tema, sem cor fixa)
  badgeStatus(status) {
    const classe = status === 'Disponível' ? 'badge-teal' : status === 'Alugado' ? 'badge-blue' : 'badge-amber';
    return `<span class="badge ${classe}">${Utils.esc(status || '')}</span>`;
  },

  // Status REAL do imóvel: contrato ativo vinculado manda ("Alugado" automático,
  // sem depender de trocar o dropdown na mão). Sem contrato ativo, vale o
  // status manual (que cobre Em Manutenção / Reservado / Disponível).
  statusReal(prop) {
    const ativo = Storage.getContractsForProperty(prop.id)
      .find(c => Utils.getContractStatus(c).label === 'Ativo');
    return {
      status: ativo ? 'Alugado' : (prop.status || 'Disponível'),
      contratoAtivo: ativo || null
    };
  },

  render(container) {
    const properties = Storage.getProperties();
    const infoPorImovel = {};
    properties.forEach(p => {
      const { status, contratoAtivo } = this.statusReal(p);
      const contratos = Storage.getContractsForProperty(p.id);
      const ids = new Set(contratos.map(c => c.id));
      const recebido = Storage.getFinancialRecords()
        .filter(r => ids.has(r.contract_id) && r.status === 'Pago')
        .reduce((s, r) => s + (parseFloat(r.rent_value) || 0), 0);
      infoPorImovel[p.id] = { status, contratoAtivo, totalContratos: contratos.length, recebido };
    });
    const contarStatus = (s) => properties.filter(p => infoPorImovel[p.id].status === s).length;

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Gestão de Imóveis</h1>
          <p class="page-subtitle">Cadastre e acompanhe o portfólio de imóveis da sua imobiliária.</p>
        </div>
        <button class="btn btn-primary" onclick="PropertiesView.openModal()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Novo Imóvel
        </button>
      </div>

      <div class="stats-grid animate-fade-in-up">
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Total de Imóveis</span></div>
          <div class="stat-value">${properties.length}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Disponíveis</span></div>
          <div class="stat-value" style="color: var(--success);">${contarStatus('Disponível')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Alugados</span></div>
          <div class="stat-value" style="color: var(--primary);">${contarStatus('Alugado')}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Em Manutenção</span></div>
          <div class="stat-value" style="color: var(--warning);">${contarStatus('Em Manutenção')}</div>
        </div>
      </div>

      ${properties.length === 0 ? `
        <div class="empty-state glass animate-fade-in-up">
          <p>Nenhum imóvel cadastrado.</p>
          <p style="color: var(--text-muted); font-weight: 400; font-size: 14px; margin-top: -10px; margin-bottom: 20px;">Cadastre seu primeiro imóvel para gerenciar locações e vincular aos contratos.</p>
          <button class="btn btn-primary" onclick="PropertiesView.openModal()">Cadastrar Imóvel</button>
        </div>
      ` : `
        <div class="animate-fade-in-up" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem;">
          ${properties.map(p => {
            const info = infoPorImovel[p.id];
            const inquilinoAtual = info.contratoAtivo && info.contratoAtivo.fields.nome_locatario;
            const vinculo = [
              inquilinoAtual && `Alugado para <strong>${Utils.esc(inquilinoAtual)}</strong>`,
              info.totalContratos > 0 && `${info.totalContratos} contrato${info.totalContratos === 1 ? '' : 's'}`,
              info.recebido > 0 && `${Utils.formatCurrency(info.recebido)} recebidos`
            ].filter(Boolean).join(' · ');
            return `
            <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${Utils.esc(p.name)}</h4>
                  ${this.badgeStatus(info.status)}
                </div>
                <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0 0 0.75rem;">${Utils.esc(p.address)}</p>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: ${vinculo ? '0.5rem' : '1rem'};">
                  ${p.bedrooms || 0} quarto${p.bedrooms == 1 ? '' : 's'} · ${p.bathrooms || 0} banheiro${p.bathrooms == 1 ? '' : 's'} · ${p.parking || 0} vaga${p.parking == 1 ? '' : 's'} · ${p.area || 0} m²
                </div>
                ${vinculo ? `<div style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 1rem;">${vinculo}</div>` : ''}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-light); padding-top: 0.75rem;">
                <div>
                  <span class="stat-label" style="display: block;">Aluguel Sugerido</span>
                  <strong style="font-size: 1.05rem; color: var(--primary);">${Utils.formatCurrency(p.rent_value || 0)}</strong>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.85rem;" onclick="PropertiesView.openModal('${p.id}')">Editar</button>
                  <button class="btn btn-danger" style="padding: 0.35rem 0.65rem; font-size: 0.85rem;" onclick="PropertiesView.deleteProp('${p.id}')">Excluir</button>
                </div>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      `}

      <!-- Modal de Cadastro/Edição de Imóvel -->
      <div id="prop-modal" class="modal-backdrop">
        <div class="modal-card">
          <h3 id="prop-modal-title">Cadastrar Imóvel</h3>
          <form id="prop-form" onsubmit="PropertiesView.saveProp(event)">
            <input type="hidden" id="prop-id">

            <div class="form-group">
              <label class="form-label">Identificação do Imóvel *</label>
              <input type="text" id="prop-name" class="form-input" placeholder="Ex: Apto 302 - Residencial Flores" required>
            </div>

            <div style="display: grid; grid-template-columns: 140px 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">CEP</label>
                <input type="text" id="prop-cep" class="form-input" placeholder="00000-000" maxlength="9"
                  oninput="PropertiesView.buscarCEP(this.value)">
              </div>
              <div class="form-group">
                <label class="form-label">Endereço Completo *</label>
                <input type="text" id="prop-address" class="form-input" placeholder="Rua, Número, Bairro, Cidade - UF" required>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Tipo de Imóvel</label>
                <select id="prop-type" class="form-input">
                  <option value="Residencial">Residencial</option>
                  <option value="Comercial">Comercial</option>
                  <option value="Terreno">Terreno</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select id="prop-status" class="form-input">
                  <option value="Disponível">Disponível</option>
                  <option value="Alugado">Alugado</option>
                  <option value="Em Manutenção">Em Manutenção</option>
                  <option value="Reservado">Reservado</option>
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;">
              <div class="form-group">
                <label class="form-label">Quartos</label>
                <input type="number" id="prop-bedrooms" class="form-input" value="1" min="0">
              </div>
              <div class="form-group">
                <label class="form-label">Banheiros</label>
                <input type="number" id="prop-bathrooms" class="form-input" value="1" min="0">
              </div>
              <div class="form-group">
                <label class="form-label">Vagas</label>
                <input type="number" id="prop-parking" class="form-input" value="0" min="0">
              </div>
              <div class="form-group">
                <label class="form-label">Área (m²)</label>
                <input type="number" id="prop-area" class="form-input" value="50" min="0">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
              <div class="form-group" style="margin-bottom: 1.25rem;">
                <label class="form-label">Valor Aluguel (R$)</label>
                <input type="number" step="0.01" id="prop-rent" class="form-input" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom: 1.25rem;">
                <label class="form-label">IPTU Mensal (R$)</label>
                <input type="number" step="0.01" id="prop-iptu" class="form-input" placeholder="0.00">
              </div>
              <div class="form-group" style="margin-bottom: 1.25rem;">
                <label class="form-label">Condomínio (R$)</label>
                <input type="number" step="0.01" id="prop-condo" class="form-input" placeholder="0.00">
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" onclick="PropertiesView.closeModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar Imóvel</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  // CEP completo -> preenche o endereço via ViaCEP, sem sobrescrever o que já foi digitado
  async buscarCEP(cep) {
    const clean = String(cep || '').replace(/\D/g, '');
    if (clean.length !== 8) return;
    const data = await Utils.fetchCEP(clean);
    if (!data || !data.enderecoCompleto) return;
    const el = document.getElementById('prop-address');
    if (!el || el.value.trim()) return;
    el.value = data.enderecoCompleto;
    Utils.toast('Endereço preenchido pelo CEP — complete com o número.', 'info');
  },

  openModal(id = null) {
    const modal = document.getElementById('prop-modal');
    const title = document.getElementById('prop-modal-title');
    modal.style.display = 'flex';

    if (id) {
      const prop = Storage.getProperties().find(p => p.id === id);
      if (prop) {
        title.innerText = 'Editar Imóvel';
        document.getElementById('prop-id').value = prop.id;
        document.getElementById('prop-name').value = prop.name || '';
        document.getElementById('prop-cep').value = prop.cep || '';
        document.getElementById('prop-address').value = prop.address || '';
        document.getElementById('prop-type').value = prop.type || 'Residencial';
        document.getElementById('prop-status').value = prop.status || 'Disponível';
        document.getElementById('prop-bedrooms').value = prop.bedrooms || 0;
        document.getElementById('prop-bathrooms').value = prop.bathrooms || 0;
        document.getElementById('prop-parking').value = prop.parking || 0;
        document.getElementById('prop-area').value = prop.area || 0;
        document.getElementById('prop-rent').value = prop.rent_value || '';
        document.getElementById('prop-iptu').value = prop.iptu_value || '';
        document.getElementById('prop-condo').value = prop.condo_value || '';
        return;
      }
    }

    title.innerText = 'Cadastrar Imóvel';
    document.getElementById('prop-form').reset();
    document.getElementById('prop-id').value = '';
  },

  closeModal() {
    document.getElementById('prop-modal').style.display = 'none';
  },

  saveProp(e) {
    e.preventDefault();
    const id = document.getElementById('prop-id').value;
    const propData = {
      id: id || null,
      name: document.getElementById('prop-name').value,
      cep: document.getElementById('prop-cep').value,
      address: document.getElementById('prop-address').value,
      type: document.getElementById('prop-type').value,
      status: document.getElementById('prop-status').value,
      bedrooms: parseInt(document.getElementById('prop-bedrooms').value) || 0,
      bathrooms: parseInt(document.getElementById('prop-bathrooms').value) || 0,
      parking: parseInt(document.getElementById('prop-parking').value) || 0,
      area: parseFloat(document.getElementById('prop-area').value) || 0,
      rent_value: parseFloat(document.getElementById('prop-rent').value) || 0,
      iptu_value: parseFloat(document.getElementById('prop-iptu').value) || 0,
      condo_value: parseFloat(document.getElementById('prop-condo').value) || 0
    };

    Storage.saveProperty(propData);
    Utils.toast('Imóvel salvo com sucesso!');
    this.closeModal();
    this.render(document.getElementById('main-content'));
  },

  deleteProp(id) {
    if (confirm('Deseja realmente excluir este imóvel?')) {
      Storage.deleteProperty(id);
      Utils.toast('Imóvel excluído!');
      this.render(document.getElementById('main-content'));
    }
  }
};
