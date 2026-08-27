// ═══════════════════════════════════════════════════════
// Vistorias de imóvel
//
// Registra o estado do imóvel na entrada e na saída, ambiente por ambiente.
// A comparação entre as duas é o que sustenta reter ou devolver a caução — por
// isso a vistoria de SAÍDA nasce com os ambientes da entrada já fechada do
// mesmo imóvel: comparar exige a mesma lista dos dois lados, e redigitar é
// onde o ambiente que interessava some.
//
// FOTOS ficaram de fora de propósito. Guardar imagem exige um lugar para o
// arquivo (com dono, teto de tamanho e limpeza) — é uma superfície própria,
// não um campo a mais. Base64 dentro do registro resolveria em uma linha e
// inchava o banco na primeira vistoria de verdade.
// ═══════════════════════════════════════════════════════

const Vistorias = {
  // Ambientes sugeridos ao abrir uma vistoria nova. É ponto de partida
  // editável, não uma lista fechada.
  AMBIENTES_PADRAO: ['Sala', 'Cozinha', 'Quarto', 'Banheiro', 'Área de serviço'],

  ESTADOS: ['Bom', 'Regular', 'Ruim'],

  classeEstado(e) {
    return e === 'Bom' ? 'badge-teal' : e === 'Ruim' ? 'badge-red' : 'badge-amber';
  },

  // Vistoria aberta no momento (id) ou null para a lista.
  abertaId: null,

  render(container) {
    if (this.abertaId) {
      const v = Storage.getInspection(this.abertaId);
      if (v) return this.renderDetalhe(container, v);
      this.abertaId = null;
    }
    return this.renderLista(container);
  },

  renderLista(container) {
    const vistorias = Storage.getInspections();
    const imoveis = Storage.getProperties();
    const abertas = vistorias.filter(v => v.status !== 'Fechada').length;

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Cadastros</div>
          <h1 class="page-title">Vistorias</h1>
          <p class="page-subtitle">${Utils.esc(vistorias.length
            ? `${vistorias.length} vistoria${vistorias.length === 1 ? '' : 's'}` + (abertas ? ` · ${abertas} em aberto` : ' · todas fechadas')
            : 'Registre o estado do imóvel na entrada e na saída da locação.')}</p>
        </div>
        <button class="btn btn-primary" onclick="Vistorias.nova()" ${imoveis.length ? '' : 'disabled title="Cadastre um imóvel primeiro"'}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Nova vistoria
        </button>
      </div>

      ${vistorias.length ? `
        <div class="renov-lista animate-fade-in-up">
          ${vistorias.map(v => {
            const imovel = imoveis.find(p => p.id === v.property_id);
            const rooms = Array.isArray(v.rooms) ? v.rooms : [];
            const ruins = rooms.filter(r => r.estado === 'Ruim').length;
            return `
            <div class="renov-linha ${v.status === 'Fechada' ? '' : 'urgente'}" data-busca>
              <div class="renov-prazo">
                <strong>${rooms.length}</strong>
                <span>ambiente${rooms.length === 1 ? '' : 's'}</span>
              </div>
              <div class="renov-sep" aria-hidden="true"></div>
              <div class="renov-corpo">
                <div class="contrato-linha-topo">
                  <span class="contrato-linha-nome">${Utils.esc(imovel ? imovel.name : 'Imóvel removido')}</span>
                  <span class="badge ${v.tipo === 'Saída' ? 'badge-neutral' : 'badge-blue'}">${Utils.esc(v.tipo || 'Entrada')}</span>
                  <span class="badge ${v.status === 'Fechada' ? 'badge-teal' : 'badge-amber'}">${Utils.esc(v.status || 'Rascunho')}</span>
                </div>
                <div class="lista-sub">
                  ${Utils.esc(v.tenant_name || 'Sem inquilino informado')}
                  ${v.inspected_on ? ' · ' + Utils.esc(Utils.formatDate(v.inspected_on)) : ''}
                  ${ruins ? ` · <b>${ruins}</b> em estado ruim` : ''}
                </div>
              </div>
              <div class="renov-acoes">
                <button class="btn btn-primary btn-sm" onclick="Vistorias.abrir('${Utils.esc(v.id)}')">Abrir</button>
                <button class="btn btn-danger btn-sm" onclick="Vistorias.excluir('${Utils.esc(v.id)}')">Excluir</button>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state animate-fade-in-up">
          <p>${Utils.esc(imoveis.length ? 'Nenhuma vistoria registrada.' : 'Cadastre um imóvel antes da primeira vistoria.')}</p>
          <p style="color: var(--text-muted); font-weight: 400; font-size: 14px; margin-top: -10px; margin-bottom: 20px;">
            A vistoria guarda o estado de cada ambiente na entrada e serve de comparação na saída.
          </p>
          ${imoveis.length
            ? '<button class="btn btn-primary" onclick="Vistorias.nova()">Nova vistoria</button>'
            : '<a class="btn btn-primary" href="#properties">Cadastrar imóvel</a>'}
        </div>
      `}

      <div id="vistoria-modal" class="modal-backdrop">
        <div class="modal-card">
          <h3>Nova vistoria</h3>
          <form onsubmit="Vistorias.criarDoForm(event)">
            <div class="form-group">
              <label class="form-label" for="vist-imovel">Imóvel</label>
              <select class="form-input" id="vist-imovel" required>
                ${imoveis.map(p => `<option value="${Utils.esc(p.id)}">${Utils.esc(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="vist-tipo">Momento</label>
              <select class="form-input" id="vist-tipo">
                <option value="Entrada">Entrada — o inquilino está recebendo as chaves</option>
                <option value="Saída">Saída — o inquilino está devolvendo o imóvel</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="vist-data">Data da vistoria</label>
              <input class="form-input" type="date" id="vist-data" required
                value="${Utils.esc(new Date().toISOString().slice(0, 10))}">
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" onclick="Vistorias.fecharModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Criar vistoria</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  renderDetalhe(container, v) {
    const imoveis = Storage.getProperties();
    const imovel = imoveis.find(p => p.id === v.property_id);
    const rooms = Array.isArray(v.rooms) ? v.rooms : [];
    const fechada = v.status === 'Fechada';
    const contagem = this.ESTADOS.map(e => ({ e, n: rooms.filter(r => r.estado === e).length }));

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Vistoria de ${Utils.esc((v.tipo || 'Entrada').toLowerCase())}</div>
          <h1 class="page-title">${Utils.esc(imovel ? imovel.name : 'Imóvel removido')}</h1>
          <p class="page-subtitle">${Utils.esc([
            v.tenant_name || 'Sem inquilino informado',
            v.inspected_on ? Utils.formatDate(v.inspected_on) : '',
            fechada ? 'Fechada' : 'Rascunho'
          ].filter(Boolean).join(' · '))}</p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="Vistorias.voltar()">Voltar</button>
          ${fechada
            ? `<button class="btn btn-secondary" onclick="Vistorias.reabrir('${Utils.esc(v.id)}')">Reabrir</button>`
            : `<button class="btn btn-primary" onclick="Vistorias.fechar('${Utils.esc(v.id)}')">Fechar vistoria</button>`}
        </div>
      </div>

      <div class="vistoria-layout animate-fade-in-up">
        <div style="display:flex; flex-direction:column; gap:18px;">
          ${rooms.length ? rooms.map((r, i) => `
            <section class="card" data-busca>
              <div class="painel-secao-head" style="margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <h4>${Utils.esc(r.nome || 'Ambiente')}</h4>
                  <span class="badge ${this.classeEstado(r.estado)}">${Utils.esc(r.estado || 'Regular')}</span>
                </div>
                ${fechada ? '' : `<button class="btn-icon" onclick="Vistorias.removerAmbiente('${Utils.esc(v.id)}', ${i})"
                  title="Remover ambiente" aria-label="Remover ${Utils.esc(r.nome || 'ambiente')}">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>`}
              </div>
              <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label">Estado</label>
                <select class="form-input" ${fechada ? 'disabled' : ''}
                  onchange="Vistorias.setEstado('${Utils.esc(v.id)}', ${i}, this.value)">
                  ${this.ESTADOS.map(e => `<option value="${Utils.esc(e)}" ${r.estado === e ? 'selected' : ''}>${Utils.esc(e)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Observações</label>
                <textarea class="form-textarea" rows="3" ${fechada ? 'disabled' : ''}
                  placeholder="Ex.: pintura descascando atrás da porta"
                  onchange="Vistorias.setObs('${Utils.esc(v.id)}', ${i}, this.value)">${Utils.esc(r.obs || '')}</textarea>
              </div>
            </section>
          `).join('') : '<div class="card"><p class="text-muted" style="margin:0;">Nenhum ambiente nesta vistoria.</p></div>'}

          ${fechada ? '' : `
            <button class="btn btn-secondary" style="align-self:flex-start;" onclick="Vistorias.addAmbiente('${Utils.esc(v.id)}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              Adicionar ambiente
            </button>`}
        </div>

        <aside class="vistoria-aside">
          <div class="card">
            <div class="painel-secao-head" style="margin-bottom:12px;"><h4>Resumo</h4></div>
            <div style="display:flex; flex-direction:column; gap:11px;">
              ${fechada ? `
              <div class="mini-bar-head" style="margin:0;"><span class="text-muted">Momento</span><b>${Utils.esc(v.tipo || 'Entrada')}</b></div>
              <div class="mini-bar-head" style="margin:0;"><span class="text-muted">Data</span><b>${Utils.esc(Utils.formatDate(v.inspected_on))}</b></div>
            ` : `
              <div class="form-group" style="margin:0;">
                <label class="form-label">Momento</label>
                <select class="form-input" onchange="Vistorias.setCampo('${Utils.esc(v.id)}', 'tipo', this.value)">
                  <option value="Entrada" ${v.tipo === 'Saída' ? '' : 'selected'}>Entrada</option>
                  <option value="Saída" ${v.tipo === 'Saída' ? 'selected' : ''}>Saída</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Data da vistoria</label>
                <input class="form-input" type="date" value="${Utils.esc(v.inspected_on || '')}"
                  onchange="Vistorias.setCampo('${Utils.esc(v.id)}', 'inspected_on', this.value)">
              </div>
            `}
            <div class="mini-bar-head" style="margin:0;"><span>Ambientes</span><b>${rooms.length}</b></div>
              ${contagem.map(c => `
                <div class="mini-bar-head" style="margin:0;">
                  <span class="text-muted">${Utils.esc(c.e)}</span><b>${c.n}</b>
                </div>
              `).join('')}
              <div class="mini-bar-head" style="margin:0;"><span class="text-muted">Situação</span><b>${Utils.esc(v.status || 'Rascunho')}</b></div>
            </div>
          </div>

          <div class="card">
            <div class="painel-secao-head" style="margin-bottom:8px;"><h4>Fotos</h4></div>
            <p class="text-muted" style="font-size:13px; margin:0;">
              Esta versão registra estado e observações por escrito. Anexar fotos exige um
              lugar para guardar arquivo, com dono e teto de tamanho — ainda não existe.
            </p>
          </div>
        </aside>
      </div>
    `;
  },

  // ── Ações ────────────────────────────────────────────────────────────
  nova() {
    if (!Storage.getProperties().length) {
      Utils.toast('Cadastre um imóvel antes da primeira vistoria.', 'error');
      return;
    }
    document.getElementById('vistoria-modal').style.display = 'flex';
  },

  fecharModal() {
    document.getElementById('vistoria-modal').style.display = 'none';
  },

  criarDoForm(e) {
    e.preventDefault();
    const v = this.criar(
      document.getElementById('vist-imovel').value,
      document.getElementById('vist-tipo').value,
      document.getElementById('vist-data').value
    );
    this.fecharModal();
    if (!v) return;
    this.abertaId = v.id;
    Utils.toast(`Vistoria de ${v.tipo.toLowerCase()} criada.`);
    this.render(document.getElementById('main-content'));
  },

  // Monta a vistoria. Sem DOM aqui de propósito: é a regra, e é o que o teste
  // alcança — `nova()` só abre o formulário.
  criar(imovelId, tipo, data) {
    const imovel = Storage.getProperties().find(p => p.id === imovelId);
    if (!imovel) {
      Utils.toast('Imóvel não encontrado.', 'error');
      return null;
    }

    // Inquilino sai do contrato ATIVO do imóvel, quando há um: digitar de novo
    // um nome que o sistema já sabe é erro de digitação esperando acontecer.
    const ativo = Storage.getContractsForProperty(imovel.id)
      .find(c => Utils.getContractStatus(c).label === 'Ativo');

    return Storage.saveInspection({
      property_id: imovel.id,
      contract_id: ativo ? ativo.id : null,
      tipo: tipo === 'Saída' ? 'Saída' : 'Entrada',
      status: 'Rascunho',
      tenant_name: ativo ? (ativo.fields.nome_locatario || '') : '',
      inspected_on: data || new Date().toISOString().slice(0, 10),
      rooms: this.ambientesIniciais(imovel.id, tipo)
    });
  },

  // A saída herda os ambientes da última entrada FECHADA do mesmo imóvel: a
  // vistoria de saída só vale pela comparação, e comparar exige os dois lados
  // com a mesma lista. Sem entrada fechada — ou numa vistoria de entrada — cai
  // nos ambientes sugeridos, que são ponto de partida editável.
  ambientesIniciais(imovelId, tipo) {
    if (tipo === 'Saída') {
      const entrada = Storage.getInspectionsForProperty(imovelId)
        .filter(v => v.tipo === 'Entrada' && v.status === 'Fechada')
        .sort((a, b) => String(b.inspected_on || '').localeCompare(String(a.inspected_on || '')))[0];
      if (entrada && Array.isArray(entrada.rooms) && entrada.rooms.length) {
        // Estado e observação NÃO vêm junto: são o que a saída vai constatar.
        return entrada.rooms.map(r => ({ nome: r.nome, estado: 'Bom', obs: '' }));
      }
    }
    return this.AMBIENTES_PADRAO.map(nome => ({ nome, estado: 'Bom', obs: '' }));
  },

  abrir(id) {
    this.abertaId = id;
    this.render(document.getElementById('main-content'));
  },

  voltar() {
    this.abertaId = null;
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  },

  // Altera um ambiente sem redesenhar a tela: o usuário está com o cursor
  // dentro do campo, e re-render tiraria o foco a cada tecla.
  _patchRoom(id, i, patch) {
    const v = Storage.getInspection(id);
    if (!v || v.status === 'Fechada') return null;
    const rooms = (Array.isArray(v.rooms) ? v.rooms : []).slice();
    if (!rooms[i]) return null;
    rooms[i] = { ...rooms[i], ...patch };
    return Storage.saveInspection({ ...v, rooms });
  },

  // Corrige o cabecalho da vistoria (momento, data) enquanto ela e rascunho.
  // Vistoria fechada nao muda: e ela que sustenta a conversa da caucao, e o
  // valor de prova vem justamente de nao dar para reescrever depois.
  setCampo(id, campo, valor) {
    const v = Storage.getInspection(id);
    if (!v || v.status === 'Fechada') return;
    Storage.saveInspection({ ...v, [campo]: valor });
    this.render(document.getElementById('main-content'));
  },

  setEstado(id, i, valor) {
    if (this._patchRoom(id, i, { estado: valor })) {
      // A etiqueta do cabeçalho tem de acompanhar o select, então aqui vale
      // redesenhar: o foco estava no próprio select, que some junto.
      this.render(document.getElementById('main-content'));
    }
  },

  setObs(id, i, texto) {
    this._patchRoom(id, i, { obs: texto });
  },

  addAmbiente(id) {
    const nome = prompt('Nome do ambiente:', '');
    if (!nome || !nome.trim()) return;
    const v = Storage.getInspection(id);
    if (!v || v.status === 'Fechada') return;
    const rooms = (Array.isArray(v.rooms) ? v.rooms : []).concat([{ nome: nome.trim(), estado: 'Bom', obs: '' }]);
    Storage.saveInspection({ ...v, rooms });
    this.render(document.getElementById('main-content'));
  },

  removerAmbiente(id, i) {
    const v = Storage.getInspection(id);
    if (!v || v.status === 'Fechada') return;
    const rooms = (Array.isArray(v.rooms) ? v.rooms : []).slice();
    if (!rooms[i]) return;
    if (!confirm(`Remover "${rooms[i].nome || 'ambiente'}" da vistoria?`)) return;
    rooms.splice(i, 1);
    Storage.saveInspection({ ...v, rooms });
    this.render(document.getElementById('main-content'));
  },

  fechar(id) {
    const v = Storage.getInspection(id);
    if (!v) return;
    if (!confirm('Fechar a vistoria? Depois disso ela fica somente leitura (dá para reabrir).')) return;
    Storage.saveInspection({ ...v, status: 'Fechada', closed_at: new Date().toISOString() });
    Utils.toast('Vistoria fechada.');
    this.render(document.getElementById('main-content'));
  },

  reabrir(id) {
    const v = Storage.getInspection(id);
    if (!v) return;
    Storage.saveInspection({ ...v, status: 'Rascunho', closed_at: null });
    Utils.toast('Vistoria reaberta para edição.');
    this.render(document.getElementById('main-content'));
  },

  excluir(id) {
    if (!confirm('Excluir esta vistoria? A ação não pode ser desfeita.')) return;
    Storage.deleteInspection(id);
    if (this.abertaId === id) this.abertaId = null;
    Utils.toast('Vistoria excluída.');
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  }
};
