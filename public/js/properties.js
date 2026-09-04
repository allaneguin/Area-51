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

  // ── Fotos do imóvel ────────────────────────────────────────────────────
  //
  // A lista chega da conta inteira numa requisição só (Storage.loadCloudData) e
  // é fatiada aqui por imóvel. Capa primeiro: é dela que a faixa tira a imagem,
  // e depender da ordem que o banco devolveu faria a capa trocar sozinha.
  fotosDe(id) {
    return Storage.propertyMediaCache
      .filter(m => m.property_id === id)
      .sort((a, b) => (b.capa ? 1 : 0) - (a.capa ? 1 : 0));
  },

  // Dois estados, sem meio-termo: a foto quando há capa, a inicial quando não
  // há. Uma imagem de exemplo faria o cartão mentir sobre um dado que o dono
  // nunca cadastrou.
  capa(prop) {
    const capa = this.fotosDe(prop.id).find(f => f.capa);
    if (capa) {
      return `<div class="imovel-capa">
        <img src="${Utils.esc(Midias.url(capa.id))}" alt="Foto de ${Utils.esc(prop.name || 'imóvel')}" loading="lazy">
      </div>`;
    }
    return `<div class="imovel-capa" aria-hidden="true">
      <span>${Utils.esc(String(prop.name || '?').trim().charAt(0))}</span>
    </div>`;
  },

  // ── Painel "Ver" ───────────────────────────────────────────────────────
  //
  // Existe porque o cartão mostra 5 coisas de 13, e até aqui o único jeito de
  // ler o resto era abrir "Editar" — ou seja, entrar no modo de mexer para
  // fazer uma coisa que é de olhar. Mostra também o que DEPENDE do imóvel, que
  // é a pergunta de quem está prestes a excluir um.
  detalhe(id) {
    const p = Storage.getProperties().find(x => x.id === id);
    if (!p) return '';

    const fotos = this.fotosDe(p.id);
    const contratos = Storage.getContractsForProperty(p.id);
    const vistorias = Storage.getInspectionsForProperty(p.id);
    const ids = new Set(contratos.map(c => c.id));
    const recebido = Storage.getFinancialRecords()
      .filter(r => ids.has(r.contract_id) && r.status === 'Pago')
      .reduce((s, r) => s + (parseFloat(r.rent_value) || 0), 0);

    const medidas = [
      p.bedrooms && `${p.bedrooms} quarto${p.bedrooms == 1 ? '' : 's'}`,
      p.bathrooms && `${p.bathrooms} banheiro${p.bathrooms == 1 ? '' : 's'}`,
      p.parking && `${p.parking} vaga${p.parking == 1 ? '' : 's'}`,
      p.area && `${p.area} m²`
    ].filter(Boolean).join(' · ');

    return `
      ${fotos.length ? `<div class="midia-faixa detalhe-fotos">
        ${fotos.map(f => `<figure class="midia-item">
          <img src="${Utils.esc(Midias.url(f.id))}" alt="Foto de ${Utils.esc(p.name)}" loading="lazy">
        </figure>`).join('')}
      </div>` : ''}

      <h4 class="detalhe-secao">Cadastro</h4>
      <dl class="detalhe-lista">
        ${Utils.linhaDetalhe('Tipo', p.type)}
        ${Utils.linhaDetalhe('Situação', this.statusReal(p).status)}
        ${Utils.linhaDetalhe('Endereço', p.address)}
        ${Utils.linhaDetalhe('CEP', p.cep)}
        ${Utils.linhaDetalhe('Medidas', medidas)}
        ${Utils.linhaDetalhe('Aluguel', Utils.formatCurrency(p.rent_value || 0))}
        ${Utils.linhaDetalhe('IPTU mensal', Utils.formatCurrency(p.iptu_value || 0))}
        ${Utils.linhaDetalhe('Condomínio', Utils.formatCurrency(p.condo_value || 0))}
        ${Utils.linhaDetalhe('Observações', p.notes)}
      </dl>

      <h4 class="detalhe-secao">Contratos ${contratos.length ? `(${contratos.length})` : ''}</h4>
      ${contratos.length ? `<ul class="detalhe-vinculos">
        ${contratos.map(c => {
          const st = Utils.getContractStatus(c);
          return `<li>
            <span>${Utils.esc(c.fields && c.fields.nome_locatario || c.name || 'Sem nome')}</span>
            <span class="badge ${st.label === 'Ativo' ? 'badge-teal' : 'badge-amber'}">${Utils.esc(st.label)}</span>
            <span class="td-sub">${Utils.esc(Utils.formatDate(c.fields && c.fields.data_termino) || '—')}</span>
          </li>`;
        }).join('')}
      </ul>` : `<p class="text-muted detalhe-vazio">Nenhum contrato vinculado a este imóvel.</p>`}

      <h4 class="detalhe-secao">Vistorias ${vistorias.length ? `(${vistorias.length})` : ''}</h4>
      ${vistorias.length ? `<ul class="detalhe-vinculos">
        ${vistorias.map(v => `<li>
          <span>${Utils.esc(v.tipo || 'Vistoria')}</span>
          <span class="badge badge-blue">${Utils.esc(v.status || '')}</span>
          <span class="td-sub">${Utils.esc(Utils.formatDate(v.inspected_on) || '—')}</span>
        </li>`).join('')}
      </ul>` : `<p class="text-muted detalhe-vazio">Nenhuma vistoria registrada.</p>`}

      <h4 class="detalhe-secao">Recebido</h4>
      <p class="detalhe-total">${Utils.esc(Utils.formatCurrency(recebido))}
        <span class="td-sub">soma das parcelas pagas dos contratos acima</span></p>
    `;
  },

  verDetalhe(id) {
    const p = Storage.getProperties().find(x => x.id === id);
    if (!p) return;
    document.getElementById('prop-detalhe-titulo').textContent = p.name || 'Imóvel';
    document.getElementById('prop-detalhe-corpo').innerHTML = this.detalhe(id);
    document.getElementById('prop-detalhe-editar').setAttribute('onclick',
      `PropertiesView.fecharDetalhe(); PropertiesView.openModal('${Utils.esc(id)}')`);
    document.getElementById('prop-detalhe').style.display = 'flex';
  },

  fecharDetalhe() {
    document.getElementById('prop-detalhe').style.display = 'none';
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
              ${this.capa(p)}
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

                ${(() => {
                  const fotos = this.fotosDe(p.id);
                  return `<div class="midia-faixa midia-faixa-mini">
                    ${fotos.map(f => `
                      <figure class="midia-item">
                        <img src="${Utils.esc(Midias.url(f.id))}" alt="Foto de ${Utils.esc(p.name)}" loading="lazy">
                        ${f.capa
                          ? `<span class="midia-capa-marca">Capa</span>`
                          : `<button type="button" class="midia-capa-btn" title="Usar como capa"
                              aria-label="Usar esta foto como capa do imóvel"
                              onclick="PropertiesView.definirCapa('${Utils.esc(f.id)}')">&#9733;</button>`}
                        <button type="button" class="midia-remover" title="Remover foto"
                          onclick="PropertiesView.removerFoto('${Utils.esc(f.id)}')">&times;</button>
                      </figure>`).join('')}
                    ${fotos.length < Midias.LIMITES.foto.max ? `
                      <button type="button" class="midia-add"
                        onclick="PropertiesView.escolherFoto('${Utils.esc(p.id)}')">+ Foto</button>` : ''}
                  </div>`;
                })()}

                ${inquilino ? `<div class="imovel-vinculo">Alugado para <b>${Utils.esc(inquilino)}</b></div>`
                  : info.totalContratos ? `<div class="imovel-vinculo">${info.totalContratos} contrato${info.totalContratos === 1 ? '' : 's'} no histórico</div>`
                  : `<div class="imovel-vinculo text-muted">Sem contrato vinculado</div>`}

                <div class="imovel-rodape">
                  <div>
                    <div class="card-kicker">Aluguel</div>
                    <div class="imovel-valor">${Utils.esc(Utils.formatCurrency(p.rent_value || 0))}</div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-primary btn-sm" onclick="PropertiesView.verDetalhe('${Utils.esc(p.id)}')">Ver</button>
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

      <!-- Um seletor de arquivo só na tela, reaproveitado por todos os cartões:
           um por imóvel seriam N nós escondidos fazendo a mesma coisa. -->
      <input type="file" id="prop-foto-arquivo" style="display:none" accept="image/jpeg,image/png,image/webp">

      <!-- Painel de leitura. O corpo é preenchido no clique, não aqui: montar o
           detalhe dos N imóveis a cada render seria trabalho para o que o
           usuário abre um de cada vez. -->
      <div id="prop-detalhe" class="modal-backdrop">
        <div class="modal-card modal-card-lg">
          <h3 id="prop-detalhe-titulo">Imóvel</h3>
          <div id="prop-detalhe-corpo"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="PropertiesView.fecharDetalhe()">Fechar</button>
            <button type="button" class="btn btn-primary" id="prop-detalhe-editar">Editar</button>
          </div>
        </div>
      </div>

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
      // O banco leva as fotos junto (cascata). O cache local precisa saber, ou
      // as miniaturas do imóvel excluído sobrevivem até a próxima carga.
      Storage.propertyMediaCache = Storage.propertyMediaCache.filter(m => m.property_id !== id);
      Utils.toast('Imóvel excluído!');
      this.render(document.getElementById('main-content'));
    }
  },

  // ── Envio, remoção e troca de capa ─────────────────────────────────────

  escolherFoto(imovelId) {
    const input = document.getElementById('prop-foto-arquivo');
    input.onchange = () => {
      const arquivo = input.files && input.files[0];
      input.value = '';   // sem isto, escolher o MESMO arquivo de novo não dispara
      if (arquivo) this.subirFoto(imovelId, arquivo);
    };
    input.click();
  },

  async subirFoto(imovelId, arquivo) {
    // `enviarDoImovel` valida, reduz para 1600px e avisa o usuário quando falha;
    // devolve null nesse caso. A miniatura só aparece com a linha confirmada.
    const criada = await Midias.enviarDoImovel(imovelId, arquivo, this.fotosDe(imovelId).length);
    if (!criada) return;
    Storage.propertyMediaCache.push(criada);
    Utils.toast('Foto anexada.');
    this.render(document.getElementById('main-content'));
  },

  async removerFoto(midiaId) {
    if (!confirm('Remover esta foto?')) return;
    try {
      await Api.removerMidia(midiaId);
      // Relê em vez de recalcular: quando a apagada era a capa, quem promove a
      // seguinte é o servidor. Refazer essa conta aqui daria duas fontes para a
      // mesma verdade, e elas divergiriam no primeiro caso de borda.
      Storage.propertyMediaCache = await Api.listarMidiasImovel();
    } catch (e) {
      return Utils.toast('Não foi possível remover a foto: ' + (e.message || ''), 'error');
    }
    this.render(document.getElementById('main-content'));
  },

  async definirCapa(midiaId) {
    try {
      await Api.definirCapaImovel(midiaId);
      Storage.propertyMediaCache = await Api.listarMidiasImovel();
    } catch (e) {
      return Utils.toast('Não foi possível trocar a capa: ' + (e.message || ''), 'error');
    }
    this.render(document.getElementById('main-content'));
  }
};
