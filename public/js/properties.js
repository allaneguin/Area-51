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

    const ocupados = contarStatus('Alugado');
    const manutencao = contarStatus('Em Manutenção');
    const resumo = properties.length
      ? `${properties.length} imóve${properties.length === 1 ? 'l' : 'is'} · ${ocupados} alugado${ocupados === 1 ? '' : 's'}` +
        (manutencao ? ` · ${manutencao} em manutenção` : '')
      : 'Nenhum imóvel cadastrado ainda.';

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Cadastros</div>
          <h1 class="page-title">Imóveis</h1>
          <p class="page-subtitle">${Utils.esc(resumo)}</p>
        </div>
        <button class="btn btn-primary" onclick="PropertiesView.openModal()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Novo Imóvel
        </button>
      </div>

      ${properties.length === 0 ? `
        <div class="empty-state animate-fade-in-up">
          <p>Nenhum imóvel cadastrado.</p>
          <p style="color: var(--text-muted); font-weight: 400; font-size: 14px; margin-top: -10px; margin-bottom: 20px;">Cadastre seu primeiro imóvel para gerenciar locações e vincular aos contratos.</p>
          <button class="btn btn-primary" onclick="PropertiesView.openModal()">Cadastrar Imóvel</button>
        </div>
      ` : `
        <div class="imoveis-grid animate-fade-in-up">
          ${properties.map(p => {
            const info = infoPorImovel[p.id];
            const inquilino = info.contratoAtivo && info.contratoAtivo.fields.nome_locatario;
            const specs = [
              p.bedrooms && `${p.bedrooms} quarto${p.bedrooms == 1 ? '' : 's'}`,
              p.bathrooms && `${p.bathrooms} banheiro${p.bathrooms == 1 ? '' : 's'}`,
              p.parking && `${p.parking} vaga${p.parking == 1 ? '' : 's'}`,
              p.area && `${p.area} m²`
            ].filter(Boolean);

            return `
            <div class="card imovel-card" data-busca>
              <!-- A maquete traz foto do imóvel aqui. Não existe coluna nem
                   bucket para isso, então em vez de um espaço vazio (ou de uma
                   imagem falsa) a faixa mostra a inicial sobre a cor do tema:
                   identifica o cartão de relance e não finge um dado. -->
              <div class="imovel-capa" aria-hidden="true">
                <span>${Utils.esc(String(p.name || '?').trim().charAt(0))}</span>
              </div>
              <div class="imovel-corpo">
                <div class="imovel-topo">
                  <div style="min-width:0;">
                    <div class="imovel-nome">${Utils.esc(p.name)}</div>
                    <div class="lista-sub">${Utils.esc(p.address || 'Sem endereço')}</div>
                  </div>
                  ${this.badgeStatus(info.status)}
                </div>

                ${specs.length ? `<div class="imovel-specs">
                  ${specs.map(x => `<span>${Utils.esc(x)}</span>`).join('')}
                </div>` : ''}

                ${inquilino ? `<div class="imovel-vinculo">Alugado para <b>${Utils.esc(inquilino)}</b></div>`
                  : info.totalContratos ? `<div class="imovel-vinculo">${info.totalContratos} contrato${info.totalContratos === 1 ? '' : 's'} no histórico</div>`
                  : `<div class="imovel-vinculo text-muted">Sem contrato vinculado</div>`}

                <div class="imovel-rodape">
                  <div>
                    <div class="card-kicker">Aluguel</div>
                    <div class="imovel-valor">${Utils.esc(Utils.formatCurrency(p.rent_value || 0))}</div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-secondary btn-sm" onclick="PropertiesView.openModal('${Utils.esc(p.id)}')">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="PropertiesView.deleteProp('${Utils.esc(p.id)}')">Excluir</button>
                  </div>
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
    await Utils.applyCEPToInput(cep, document.getElementById('prop-address'));
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
