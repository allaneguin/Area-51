// ═══════════════════════════════════════════════════════
// Cobranças e recibos
//
// A tela do financeiro voltou (saiu em 10/08). A tabela `financial_records`, o
// CRUD em `Storage` e o `generateMonthlyCharges` nunca saíram — só a view. Por
// isso aqui não há migration nem código de dados novo: é a mesma base, com a
// leitura que a maquete pedia.
//
// O que a maquete tinha e NÃO entrou: o cartão "Mensagem de cobrança", que
// descreve envio automático por WhatsApp e e-mail três dias antes do
// vencimento. Não existe serviço de envio no sistema. Em vez de um texto
// bonito prometendo algo que não acontece, o rodapé diz o que é manual.
// ═══════════════════════════════════════════════════════

const Financeiro = {
  // Mês em foco, "YYYY-MM". Começa no mês corrente.
  mes: new Date().toISOString().slice(0, 7),

  MESES: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],

  rotuloMes(ym) {
    const [a, m] = String(ym).split('-');
    return `${this.MESES[Number(m) - 1] || '?'} de ${a}`;
  },

  setMes(ym) {
    this.mes = ym;
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  },

  // Os meses que aparecem na régua: os que têm lançamento, mais o corrente —
  // senão um mês recém-aberto não teria como ser selecionado.
  mesesDisponiveis() {
    const set = new Set([new Date().toISOString().slice(0, 7)]);
    Storage.getFinancialRecords().forEach(r => {
      if (r.due_date) set.add(String(r.due_date).slice(0, 7));
    });
    return [...set].sort().slice(-6);
  },

  // Situação REAL: "Pendente" com vencimento no passado é atraso, mesmo que
  // ninguém tenha trocado o campo na mão. Mesma lógica do status de contrato.
  situacao(r) {
    if (r.status === 'Pago') return { label: 'Pago', classe: 'badge-teal' };
    const hoje = new Date().toISOString().slice(0, 10);
    if (r.due_date && String(r.due_date) < hoje) return { label: 'Atrasado', classe: 'badge-red' };
    return { label: 'Pendente', classe: 'badge-amber' };
  },

  doMes(ym) {
    return Storage.getFinancialRecords()
      .filter(r => r.due_date && String(r.due_date).slice(0, 7) === ym)
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  },

  render(container) {
    const meses = this.mesesDisponiveis();
    if (meses.indexOf(this.mes) === -1) this.mes = meses[meses.length - 1];
    const regs = this.doMes(this.mes);

    const soma = (f) => regs.filter(f).reduce((s, r) => s + Utils.toReais(r.rent_value), 0);
    const previsto = soma(() => true);
    const recebido = soma(r => r.status === 'Pago');
    const atrasado = soma(r => this.situacao(r).label === 'Atrasado');
    const aberto = previsto - recebido;

    const cards = [
      { rotulo: 'Previsto no mês', valor: previsto, nota: `${regs.length} cobrança${regs.length === 1 ? '' : 's'}`, ponto: '' },
      { rotulo: 'Recebido', valor: recebido, nota: previsto ? `${Math.round((recebido / previsto) * 100)}% do previsto` : 'nada lançado', ponto: 'ok' },
      { rotulo: 'Em aberto', valor: aberto, nota: aberto ? 'aguardando pagamento' : 'tudo recebido', ponto: aberto ? 'atencao' : 'ok' },
      { rotulo: 'Atrasado', valor: atrasado, nota: atrasado ? 'vencimento já passou' : 'nenhum atraso', ponto: atrasado ? 'risco' : 'ok' }
    ];

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Financeiro</div>
          <h1 class="page-title">Cobranças e recibos</h1>
          <p class="page-subtitle">Uma linha por aluguel do mês. Marque o recebimento e exporte quando precisar.</p>
        </div>
        <div class="seg-tabs" role="tablist" aria-label="Mês">
          ${meses.map(m => `<button type="button" class="seg-tab ${m === this.mes ? 'active' : ''}"
            role="tab" aria-selected="${m === this.mes}"
            onclick="Financeiro.setMes('${Utils.esc(m)}')">${Utils.esc(this.rotuloMes(m).split(' de ')[0])}</button>`).join('')}
        </div>
      </div>

      <div class="metric-grid animate-fade-in-up">
        ${cards.map(c => `
          <div class="card metric-card">
            <div class="metric-topo">
              <span class="card-kicker">${Utils.esc(c.rotulo)}</span>
              ${c.ponto ? `<span class="metric-ponto ${c.ponto}"></span>` : ''}
            </div>
            <div class="metric-valor" style="font-size:30px;">${Utils.esc(Utils.formatCurrency(c.valor))}</div>
            <div class="metric-nota">${Utils.esc(c.nota)}</div>
          </div>
        `).join('')}
      </div>

      <div class="card animate-fade-in-up" style="padding: 22px 26px;">
        <div class="painel-secao-head" style="flex-wrap:wrap;">
          <h4>Aluguéis de ${Utils.esc(this.rotuloMes(this.mes))}</h4>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="Financeiro.gerarCobrancas()">Gerar cobranças do mês</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="Financeiro.exportarCSV()" ${regs.length ? '' : 'disabled'}>Exportar CSV</button>
          </div>
        </div>

        ${regs.length ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Contrato</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th class="td-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${regs.map(r => {
                  const s = this.situacao(r);
                  const pago = r.status === 'Pago';
                  return `
                  <tr data-busca>
                    <td style="font-weight:600;">${Utils.esc(r.tenant_name || 'Inquilino')}</td>
                    <td class="text-muted">${Utils.esc(r.description || '—')}</td>
                    <td>${Utils.esc(Utils.formatDate(r.due_date))}</td>
                    <td style="font-weight:600;">${Utils.esc(Utils.formatCurrency(r.rent_value))}</td>
                    <td><span class="badge ${s.classe}">${Utils.esc(s.label)}</span></td>
                    <td class="td-acoes">
                      <button class="btn btn-${pago ? 'secondary' : 'primary'} btn-sm"
                        onclick="Financeiro.alternarPago('${Utils.esc(r.id)}')">${pago ? 'Reabrir' : 'Marcar pago'}</button>
                      <button class="btn btn-danger btn-sm" onclick="Financeiro.excluir('${Utils.esc(r.id)}')">Excluir</button>
                    </td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <p class="text-muted" style="margin: 8px 0 0;">
            Nenhuma cobrança lançada em ${Utils.esc(this.rotuloMes(this.mes))}.
            "Gerar cobranças do mês" cria uma linha para cada contrato ativo com valor de aluguel.
          </p>
        `}
      </div>

      <div class="card animate-fade-in-up" style="margin-top: 20px;">
        <div class="painel-secao-head"><h4>O que é manual aqui</h4></div>
        <p class="text-muted" style="font-size:13.5px; margin:0;">
          O sistema não envia cobrança por WhatsApp nem por e-mail — não há serviço de envio integrado.
          Esta tela controla o que foi recebido e gera o arquivo para a contabilidade; o aviso ao
          inquilino continua saindo por você, com os dados de contato do cadastro do cliente.
        </p>
      </div>
    `;
  },

  alternarPago(id) {
    const r = Storage.getFinancialRecords().find(x => x.id === id);
    if (!r) return;
    const pago = r.status === 'Pago';
    Storage.saveFinancialRecord({
      ...r,
      status: pago ? 'Pendente' : 'Pago',
      // paid_at só existe enquanto o lançamento está pago; reabrir limpa o
      // carimbo em vez de deixar uma data que não vale mais.
      paid_at: pago ? null : new Date().toISOString()
    });
    Utils.toast(pago ? 'Cobrança reaberta.' : 'Pagamento registrado.');
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  },

  excluir(id) {
    if (!confirm('Excluir este lançamento? A ação não pode ser desfeita.')) return;
    Storage.deleteFinancialRecord(id);
    Utils.toast('Lançamento excluído.');
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  },

  gerarCobrancas() {
    const n = Storage.generateMonthlyCharges();
    // O gerador trabalha sempre no mês corrente; sem trazer o foco para cá, o
    // usuário clicaria e não veria nada aparecer.
    this.mes = new Date().toISOString().slice(0, 7);
    Utils.toast(n
      ? `${n} cobrança${n === 1 ? '' : 's'} gerada${n === 1 ? '' : 's'} para ${this.rotuloMes(this.mes)}.`
      : 'Nenhuma cobrança nova: os contratos ativos deste mês já têm lançamento.');
    this.render(document.getElementById('main-content'));
  },

  // CSV do mês em foco. Ponto e vírgula e vírgula decimal porque é o que o
  // Excel em pt-BR abre sem pedir importação.
  exportarCSV() {
    const regs = this.doMes(this.mes);
    if (!regs.length) return;

    const campo = (v) => {
      const t = String(v == null ? '' : v);
      return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const linhas = [['Inquilino', 'Contrato', 'Vencimento', 'Valor', 'Situacao', 'Pago em']];
    regs.forEach(r => linhas.push([
      r.tenant_name || '',
      r.description || '',
      Utils.formatDate(r.due_date),
      Utils.toReais(r.rent_value).toFixed(2).replace('.', ','),
      this.situacao(r).label,
      r.paid_at ? Utils.formatDate(String(r.paid_at).slice(0, 10)) : ''
    ]));

    // BOM na frente: sem ele o Excel abre os acentos errados.
    const csv = '﻿' + linhas.map(l => l.map(campo).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobrancas-${this.mes}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoga depois do clique: revogar na mesma volta cancela o download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
