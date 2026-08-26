// ═══════════════════════════════════════════════════════
// Vistorias de imóvel
//
// Registra o estado do imóvel na entrada e na saída, ambiente por ambiente.
// Depende da migration 004 (`supabase/migrations/004_vistorias.sql`). Enquanto
// ela não for aplicada, a tela NÃO quebra: `Storage.inspectionsDisponivel` fica
// falso e o que aparece é a instrução do que fazer — errar em silêncio aqui
// significaria o locador achar que salvou uma vistoria que nunca existiu.
//
// FOTOS ficaram de fora desta primeira versão, de propósito. A maquete mostra
// três por ambiente; guardar imagem exige um bucket no Supabase Storage com
// política de dono, teto de tamanho e limpeza — é uma superfície de segurança
// própria, não um campo a mais. Enfiar base64 no jsonb resolveria em uma linha
// e estouraria a cota do projeto na primeira vistoria de verdade.
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
    if (Storage.inspectionsDisponivel === false) return this.renderIndisponivel(container);
    if (this.abertaId) {
      const v = Storage.getInspection(this.abertaId);
      if (v) return this.renderDetalhe(container, v);
      this.abertaId = null;
    }
    return this.renderLista(container);
  },

  renderIndisponivel(container) {
    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Cadastros</div>
          <h1 class="page-title">Vistorias</h1>
          <p class="page-subtitle">Um passo de banco falta para esta tela funcionar.</p>
        </div>
      </div>
      <div class="card animate-fade-in-up">
        <div class="painel-secao-head"><h4>Migration 004 ainda não aplicada</h4></div>
        <p class="text-muted" style="font-size:14px; margin:0 0 14px;">
          A tabela <code>inspections</code> não respondeu neste projeto. Ela é criada por
          <code>supabase/migrations/004_vistorias.sql</code> — abra o SQL Editor do Supabase,
          cole o arquivo e execute. Depois rode <code>supabase/verificacao.sql</code>:
          as checagens 20 a 23 confirmam que a tabela, a RLS e o teto de tamanho ficaram de pé.
        </p>
        <p class="text-muted" style="font-size:13px; margin:0;">
          Nada mais no sistema depende dela: contratos, imóveis, clientes e financeiro
          seguem funcionando normalmente.
        </p>
      </div>
    `;
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
              bucket de arquivos com política de dono no Supabase — ainda não configurado.
            </p>
          </div>
        </aside>
      </div>
    `;
  },

  // ── Ações ────────────────────────────────────────────────────────────
  nova() {
    const imoveis = Storage.getProperties();
    if (!imoveis.length) return;

    const lista = imoveis.map((p, i) => `${i + 1}) ${p.name}`).join('\n');
    const escolha = prompt(`Vistoria de qual imóvel?\n\n${lista}\n\nDigite o número:`, '1');
    if (escolha === null) return;
    const imovel = imoveis[parseInt(escolha, 10) - 1];
    if (!imovel) {
      Utils.toast('Número fora da lista.', 'error');
      return;
    }

    // Inquilino sai do contrato ATIVO do imóvel, quando há um: digitar de novo
    // um nome que o sistema já sabe é erro de digitação esperando acontecer.
    const ativo = Storage.getContractsForProperty(imovel.id)
      .find(c => Utils.getContractStatus(c).label === 'Ativo');

    const v = Storage.saveInspection({
      property_id: imovel.id,
      contract_id: ativo ? ativo.id : null,
      tipo: 'Entrada',
      status: 'Rascunho',
      tenant_name: ativo ? (ativo.fields.nome_locatario || '') : '',
      inspected_on: new Date().toISOString().slice(0, 10),
      rooms: this.AMBIENTES_PADRAO.map(nome => ({ nome, estado: 'Bom', obs: '' }))
    });

    this.abertaId = v.id;
    Utils.toast(`Vistoria de ${imovel.name} criada.`);
    this.render(document.getElementById('main-content'));
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
