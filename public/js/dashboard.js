// ═══════════════════════════════════════════════════════
// Painel — duas leituras da mesma carteira
//
// "Foco do dia" responde "o que eu faço agora"; "Portfólio" responde "como
// está a carteira". São visões, não features separadas: os dois leem o mesmo
// Storage e nenhum guarda estado próprio além da aba escolhida.
//
// Nada aqui inventa número. Toda métrica sai de contrato, imóvel ou lançamento
// que existe — quando não há dado, a seção diz isso em vez de mostrar zero
// com cara de resultado.
// ═══════════════════════════════════════════════════════

const Dashboard = {
  // Aba atual. Sobrevive à troca de rota porque mora no módulo, e à recarga
  // porque é espelhada no localStorage (mesmo tratamento do tema).
  variante: (() => {
    try { return localStorage.getItem('painel_variante') === 'portfolio' ? 'portfolio' : 'foco'; }
    catch (e) { return 'foco'; }
  })(),

  setVariante(v) {
    this.variante = v === 'portfolio' ? 'portfolio' : 'foco';
    try { localStorage.setItem('painel_variante', this.variante); } catch (e) { /* bloqueado: só não persiste */ }
    this.render(document.getElementById('main-content'));
  },

  // "R$ 2.450,00" -> 2450.00 — delega para o parser único do sistema
  parseValor(v) {
    return Utils.parseMoneyBRL(v);
  },

  // Contratos cujo termino cai nos proximos 30 dias
  countAVencer(contracts) {
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    return contracts.filter(c => {
      const fim = c.fields && c.fields.data_termino;
      if (!fim) return false;
      const d = new Date(fim);
      return d >= hoje && d <= limite;
    }).length;
  },

  // Dias até o término. null quando o contrato não tem data — e "sem data" é
  // diferente de "zero dias", por isso não vira 0.
  diasAteFim(c) {
    const fim = c.fields && (c.fields.data_termino || Utils.calcularDataTermino(c.fields));
    if (!fim) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const d = new Date(fim + 'T00:00:00');
    if (isNaN(d)) return null;
    return Math.round((d - hoje) / 86400000);
  },

  // ── "Precisa de você" ────────────────────────────────────────────────
  // A fila de trabalho do dia, derivada do estado real de cada contrato.
  // Ordenada por urgência: o que já venceu vem antes do que vai vencer.
  acoesPendentes(contratos) {
    const acoes = [];
    contratos.forEach(c => {
      const nome = (c.fields && c.fields.nome_locatario) || c.name || 'Contrato sem nome';
      const dias = this.diasAteFim(c);
      const status = Utils.getContractStatus(c);

      if (status.label === 'Vencido') {
        acoes.push({ peso: 0, tag: 'Vencido', tagClasse: 'badge-red', quando: dias === null ? '' : `há ${Math.abs(dias)} dias`,
          titulo: nome, detalhe: 'O prazo terminou. Renove ou encerre o contrato.', cta: 'Abrir contrato', id: c.id });
      } else if (dias !== null && dias <= 30) {
        acoes.push({ peso: 1, tag: 'Vence em breve', tagClasse: 'badge-amber', quando: `em ${dias} dia${dias === 1 ? '' : 's'}`,
          titulo: nome, detalhe: 'Fale com o inquilino antes do fim do prazo.', cta: 'Abrir contrato', id: c.id });
      }

      // Link enviado e ainda não devolvido: o contrato está parado esperando
      // o inquilino, e é o caso que mais passa despercebido.
      if (c.cloudId && !c.isFinalized) {
        acoes.push({ peso: 2, tag: 'Aguardando inquilino', tagClasse: 'badge-blue', quando: '',
          titulo: nome, detalhe: 'O link foi gerado e os dados ainda não voltaram.', cta: 'Abrir contrato', id: c.id });
      }

      // Contrato sem valor não gera cobrança nem entra na receita.
      if (!(c.fields && c.fields.valor_aluguel)) {
        acoes.push({ peso: 3, tag: 'Incompleto', tagClasse: 'badge-neutral', quando: '',
          titulo: nome, detalhe: 'Falta o valor do aluguel para entrar nos números.', cta: 'Completar', id: c.id });
      }
    });
    return acoes.sort((a, b) => a.peso - b.peso).slice(0, 6);
  },

  // ── Recebido por mês ─────────────────────────────────────────────────
  // Últimos 6 meses a partir dos lançamentos. Devolve também o teto da série,
  // que é o que transforma valor em altura de barra sem number mágico no CSS.
  serieRecebida(meses = 6) {
    const regs = Storage.getFinancialRecords();
    const rotulos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const hoje = new Date();
    const serie = [];
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const chave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      let pago = 0, aberto = 0;
      regs.forEach(r => {
        if (!r.due_date || String(r.due_date).slice(0, 7) !== chave) return;
        const v = Utils.toReais(r.rent_value);
        if (r.status === 'Pago') pago += v; else aberto += v;
      });
      serie.push({ mes: rotulos[d.getMonth()], pago, aberto });
    }
    const teto = Math.max(1, ...serie.map(s => s.pago + s.aberto));
    return { serie, teto };
  },

  render(container) {
    const all = Storage.getAll();
    const perfil = Storage.getAdminProfile() || {};
    const primeiro = String(perfil.nome_locador || '').trim().split(/\s+/)[0] || '';

    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const mesesNome = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const hoje = new Date();
    const kicker = `${diasSemana[hoje.getDay()]}, ${hoje.getDate()} de ${mesesNome[hoje.getMonth()]}`;

    const ativos = all.filter(c => Utils.getContractStatus(c).label === 'Ativo');
    const aVencer = this.countAVencer(all);
    const acoes = this.acoesPendentes(all);

    const resumo = all.length === 0
      ? 'Nenhum contrato ainda — comece escolhendo um modelo.'
      : `${all.length} contrato${all.length === 1 ? '' : 's'} · ${ativos.length} ativo${ativos.length === 1 ? '' : 's'}` +
        (acoes.length ? ` · ${acoes.length} ${acoes.length === 1 ? 'item' : 'itens'} pedindo atenção` : ' · nada pendente');

    const seg = `
      <div class="seg-tabs" role="tablist" aria-label="Visão do painel">
        <button type="button" class="seg-tab ${this.variante === 'foco' ? 'active' : ''}"
          role="tab" aria-selected="${this.variante === 'foco'}"
          onclick="Dashboard.setVariante('foco')">Foco do dia</button>
        <button type="button" class="seg-tab ${this.variante === 'portfolio' ? 'active' : ''}"
          role="tab" aria-selected="${this.variante === 'portfolio'}"
          onclick="Dashboard.setVariante('portfolio')">Portfólio</button>
      </div>`;

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">${Utils.esc(kicker)}</div>
          <h1 class="page-title">${Utils.esc(saudacao + (primeiro ? ', ' + primeiro : ''))}</h1>
          <p class="page-subtitle">${Utils.esc(resumo)}</p>
        </div>
        ${seg}
      </div>
      ${this.variante === 'foco' ? this.renderFoco(all, ativos, aVencer, acoes) : this.renderPortfolio(all, ativos, aVencer)}
    `;
  },

  // ── Aba "Foco do dia" ────────────────────────────────────────────────
  renderFoco(all, ativos, aVencer, acoes) {
    const receita = ativos.reduce((s, c) => s + this.parseValor(c.fields && c.fields.valor_aluguel), 0);
    const { serie, teto } = this.serieRecebida(6);
    const recebidoMes = serie.length ? serie[serie.length - 1].pago : 0;
    const previstoMes = serie.length ? serie[serie.length - 1].pago + serie[serie.length - 1].aberto : 0;

    const painelAcoes = acoes.length ? `
      <section class="hero-panel animate-fade-in-up">
        <div class="hero-panel-head">
          <h3>Precisa de você</h3>
          <span class="hero-panel-nota">${acoes.length} ${acoes.length === 1 ? 'item' : 'itens'}</span>
        </div>
        <div class="hero-grid">
          ${acoes.map(a => `
            <div class="hero-card">
              <div class="hero-card-topo">
                <span class="badge ${a.tagClasse}">${Utils.esc(a.tag)}</span>
                ${a.quando ? `<span class="hero-card-quando">${Utils.esc(a.quando)}</span>` : ''}
              </div>
              <div class="hero-card-titulo">${Utils.esc(a.titulo)}</div>
              <div class="hero-card-detalhe">${Utils.esc(a.detalhe)}</div>
              <a class="btn btn-primary btn-sm" style="align-self:flex-start;" href="#editor?id=${Utils.esc(a.id)}">${Utils.esc(a.cta)}</a>
            </div>
          `).join('')}
        </div>
      </section>` : `
      <section class="hero-panel animate-fade-in-up">
        <div class="hero-panel-head">
          <h3>Nada pedindo atenção</h3>
          <span class="hero-panel-nota">nenhum vencimento, aceite ou pendência aberta</span>
        </div>
      </section>`;

    const metricas = [
      { rotulo: 'Contratos', valor: String(all.length), nota: all.length ? `${ativos.length} em vigência` : 'nenhum ainda', ponto: all.length ? 'ok' : '' },
      { rotulo: 'A vencer · 30 dias', valor: String(aVencer), nota: aVencer ? 'requer atenção' : 'nada no período', ponto: aVencer ? 'atencao' : 'ok' },
      { rotulo: 'Receita mensal', valor: Utils.formatCurrency(receita), nota: 'soma dos aluguéis ativos', ponto: receita ? 'ok' : '' },
      { rotulo: 'Recebido no mês', valor: Utils.formatCurrency(recebidoMes), nota: previstoMes ? `de ${Utils.formatCurrency(previstoMes)} previstos` : 'nenhum lançamento', ponto: recebidoMes >= previstoMes && previstoMes ? 'ok' : previstoMes ? 'atencao' : '' }
    ];

    const listaAtivos = ativos.slice(0, 5);

    return `
      <div class="metric-grid animate-fade-in-up">
        ${metricas.map(m => `
          <div class="card metric-card">
            <div class="metric-topo">
              <span class="card-kicker">${Utils.esc(m.rotulo)}</span>
              ${m.ponto ? `<span class="metric-ponto ${m.ponto}"></span>` : ''}
            </div>
            <div class="metric-valor">${Utils.esc(m.valor)}</div>
            <div class="metric-nota">${Utils.esc(m.nota)}</div>
          </div>
        `).join('')}
      </div>

      ${painelAcoes}

      <div class="duas-colunas animate-fade-in-up">
        <section class="card">
          <div class="painel-secao-head">
            <h4>Contratos ativos</h4>
            <a class="btn btn-ghost btn-sm" href="#contracts">Ver todos</a>
          </div>
          ${listaAtivos.length ? listaAtivos.map(c => {
            const nome = (c.fields && c.fields.nome_locatario) || c.name || 'Sem nome';
            const dia = c.fields && c.fields.dia_vencimento;
            return `
            <a class="lista-linha" href="#editor?id=${Utils.esc(c.id)}">
              <span class="avatar">${Utils.esc(nome.trim().charAt(0) || '?')}</span>
              <div class="lista-corpo">
                <div class="lista-nome">${Utils.esc(nome)}</div>
                <div class="lista-sub">${Utils.esc((c.fields && c.fields.end_imovel) || 'Imóvel não informado')}</div>
              </div>
              <div class="lista-valor">
                <strong>${Utils.esc(Utils.formatCurrency(this.parseValor(c.fields && c.fields.valor_aluguel)))}</strong>
                <span>${dia ? 'vence dia ' + Utils.esc(dia) : 'sem dia definido'}</span>
              </div>
            </a>`;
          }).join('') : '<p class="text-muted" style="margin:0;">Nenhum contrato em vigência agora.</p>'}
        </section>

        <section class="card">
          <div class="painel-secao-head">
            <h4>Recebido por mês</h4>
          </div>
          ${teto > 1 ? `
            <div class="barras">
              ${serie.map(s => `
                <div class="barra-col" title="${Utils.esc(s.mes)}: ${Utils.esc(Utils.formatCurrency(s.pago))} recebido">
                  ${s.aberto ? `<div class="barra aberta" style="--h:${Math.round((s.aberto / teto) * 100)}%"></div>` : ''}
                  <div class="barra" style="--h:${Math.round((s.pago / teto) * 100)}%"></div>
                  <span class="barra-mes">${Utils.esc(s.mes)}</span>
                </div>
              `).join('')}
            </div>
            <div class="legenda">
              <span><i></i>Recebido</span>
              <span><i class="aberta"></i>Em aberto</span>
            </div>
          ` : '<p class="text-muted" style="margin:0;">Ainda não há lançamentos para montar o histórico.</p>'}
        </section>
      </div>
    `;
  },

  // ── Aba "Portfólio" ──────────────────────────────────────────────────
  renderPortfolio(all, ativos, aVencer) {
    const imoveis = Storage.getProperties();
    const clientes = Storage.getClients();
    const receita = ativos.reduce((s, c) => s + this.parseValor(c.fields && c.fields.valor_aluguel), 0);

    // Imóvel conta como ocupado quando tem contrato ATIVO ligado a ele — não
    // pelo status digitado à mão, que envelhece.
    const ocupados = imoveis.filter(p =>
      Storage.getContractsForProperty(p.id).some(c => Utils.getContractStatus(c).label === 'Ativo')).length;
    const manutencao = imoveis.filter(p => p.status === 'Em Manutenção').length;
    const livres = Math.max(0, imoveis.length - ocupados - manutencao);
    const pctOcupado = imoveis.length ? Math.round((ocupados / imoveis.length) * 100) : 0;

    const ocupacao = [
      { rotulo: 'Alugados', qtd: ocupados },
      { rotulo: 'Disponíveis', qtd: livres },
      { rotulo: 'Em manutenção', qtd: manutencao }
    ];

    const metricas = [
      { rotulo: 'Imóveis', valor: String(imoveis.length), nota: imoveis.length ? `${ocupados} gerando receita` : 'nenhum cadastrado' },
      { rotulo: 'Clientes', valor: String(clientes.length), nota: 'locadores, inquilinos e fiadores' },
      { rotulo: 'Contratos ativos', valor: String(ativos.length), nota: `${all.length} no total` },
      { rotulo: 'A vencer · 30 dias', valor: String(aVencer), nota: aVencer ? 'requer atenção' : 'nada no período' }
    ];

    // Próximos vencimentos: os contratos com término mais perto, à frente.
    const vencimentos = all
      .map(c => ({ c, dias: this.diasAteFim(c) }))
      .filter(x => x.dias !== null && x.dias >= 0)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 5);

    const mesesCurto = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    // Atividade: o que foi mexido por último. Sai de updatedAt/createdAt, que
    // já existem — nenhum log novo foi inventado para esta tela.
    const atividade = all
      .filter(c => c.updatedAt || c.createdAt)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5)
      .map(c => ({
        texto: `${(c.fields && c.fields.nome_locatario) || c.name || 'Contrato'} — ${c.isFinalized ? 'assinado pelo inquilino' : 'editado'}`,
        quando: Utils.formatRelativeDate(c.updatedAt || c.createdAt)
      }));

    return `
      <div class="duas-colunas animate-fade-in-up" style="grid-template-columns:repeat(auto-fit,minmax(390px,1fr));">
        <section class="hero-panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:24px;">
          <div>
            <div class="card-kicker" style="color:var(--color-accent-400);">Receita contratada</div>
            <div style="font-weight:600;font-size:52px;line-height:1;color:var(--sidebar-title);margin-top:10px;letter-spacing:-0.03em;">${Utils.esc(Utils.formatCurrency(receita))}</div>
            <p class="hero-card-detalhe" style="margin:10px 0 0;max-width:44ch;">Soma dos aluguéis dos contratos em vigência hoje. Não inclui vencidos nem os que ainda vão começar.</p>
          </div>
          <div>
            <div class="hero-card-quando">${ativos.length} contrato${ativos.length === 1 ? '' : 's'} somado${ativos.length === 1 ? '' : 's'}</div>
          </div>
        </section>

        <section class="card">
          <div class="painel-secao-head" style="margin-bottom:8px;">
            <h4>Ocupação da carteira</h4>
          </div>
          <p class="text-muted" style="font-size:13px;margin:0 0 20px;">${imoveis.length} imóve${imoveis.length === 1 ? 'l cadastrado' : 'is cadastrados'}</p>
          ${imoveis.length ? `
            <div style="display:flex;flex-direction:column;gap:14px;">
              ${ocupacao.map(o => `
                <div>
                  <div class="mini-bar-head"><span>${Utils.esc(o.rotulo)}</span><b>${o.qtd}</b></div>
                  <div class="mini-bar"><i style="--w:${imoveis.length ? Math.round((o.qtd / imoveis.length) * 100) : 0}%"></i></div>
                </div>
              `).join('')}
            </div>
            <div class="legenda" style="gap:12px;">
              <span style="font-weight:600;font-size:26px;">${pctOcupado}%</span>
              <span class="text-muted">da carteira gerando receita hoje</span>
            </div>
          ` : '<p class="text-muted" style="margin:0;">Cadastre um imóvel para ver a ocupação.</p>'}
        </section>
      </div>

      <div class="metric-grid animate-fade-in-up">
        ${metricas.map(m => `
          <div class="card metric-card">
            <span class="card-kicker">${Utils.esc(m.rotulo)}</span>
            <div class="metric-valor" style="font-size:30px;">${Utils.esc(m.valor)}</div>
            <div class="metric-nota">${Utils.esc(m.nota)}</div>
          </div>
        `).join('')}
      </div>

      <div class="duas-colunas animate-fade-in-up" style="grid-template-columns:repeat(auto-fit,minmax(360px,1fr));">
        <section class="card">
          <div class="painel-secao-head"><h4>Próximos vencimentos</h4></div>
          ${vencimentos.length ? vencimentos.map(({ c, dias }) => {
            const fim = new Date((c.fields.data_termino || Utils.calcularDataTermino(c.fields)) + 'T00:00:00');
            const st = Utils.getContractStatus(c);
            return `
            <a class="lista-linha" href="#editor?id=${Utils.esc(c.id)}">
              <span class="data-badge">
                <strong>${String(fim.getDate()).padStart(2, '0')}</strong>
                <span>${mesesCurto[fim.getMonth()]}</span>
              </span>
              <div class="lista-corpo">
                <div class="lista-nome">${Utils.esc((c.fields && c.fields.nome_locatario) || c.name || 'Contrato')}</div>
                <div class="lista-sub">${dias === 0 ? 'termina hoje' : `em ${dias} dia${dias === 1 ? '' : 's'}`}</div>
              </div>
              <span class="badge-status ${st.class}">${Utils.esc(st.label)}</span>
            </a>`;
          }).join('') : '<p class="text-muted" style="margin:0;">Nenhum contrato com término à frente.</p>'}
        </section>

        <section class="card">
          <div class="painel-secao-head"><h4>Atividade recente</h4></div>
          ${atividade.length ? atividade.map((t, i) => `
            <div class="timeline-item">
              <div class="timeline-trilho">
                <span class="timeline-ponto"></span>
                ${i < atividade.length - 1 ? '<span class="timeline-linha"></span>' : ''}
              </div>
              <div>
                <div class="timeline-texto">${Utils.esc(t.texto)}</div>
                <div class="timeline-quando">${Utils.esc(t.quando || '')}</div>
              </div>
            </div>
          `).join('') : '<p class="text-muted" style="margin:0;">Nada editado ainda.</p>'}
        </section>
      </div>
    `;
  },

  deleteContract(id) {
    if (confirm('Tem certeza que deseja excluir este contrato permanentemente?')) {
      Storage.delete(id);
      // Re-renderizar o dashboard
      this.render(document.getElementById('main-content') || document.body);
      App.reaplicarBusca();
    }
  }
};
