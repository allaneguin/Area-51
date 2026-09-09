// ═══════════════════════════════════════════════════════
// Renovações e alertas
//
// A tela que a maquete pedia e o sistema não tinha. Ela NÃO trouxe tabela
// nova: tudo aqui é derivado dos contratos que já existem — término, data de
// início e a trilha de reajuste que o `Storage.applyContractReajuste` grava.
// Isso é de propósito. Um "módulo de alertas" com tabela própria precisaria de
// migration, RLS e um job de envio; o valor real (ver o que vence e agir) sai
// inteiro do dado que já está lá.
//
// O que NÃO existe e por isso não aparece: envio automático de aviso por
// e-mail/WhatsApp. Não há serviço de envio no sistema, e um botão "avisar" que
// não avisa ninguém é pior que a ausência dele.
// ═══════════════════════════════════════════════════════

const Renovacoes = {
  // Reajuste é anual: fica devido 12 meses depois do último (ou do início,
  // quando nunca houve). Devolve os meses passados desde essa marca.
  mesesDesdeReajuste(c) {
    const base = (c.fields && (c.fields.ultimo_reajuste_data || c.fields.data_inicio)) || null;
    if (!base) return null;
    const d = new Date(base + 'T00:00:00');
    if (isNaN(d)) return null;
    const hoje = new Date();
    return (hoje.getFullYear() - d.getFullYear()) * 12 + (hoje.getMonth() - d.getMonth());
  },

  // Uma linha por PENDÊNCIA, não por contrato: o mesmo contrato pode estar
  // vencendo e com reajuste devido ao mesmo tempo, e são duas decisões.
  itens() {
    const lista = [];
    Storage.getAll().forEach(c => {
      const status = Utils.getContractStatus(c);
      const dias = Dashboard.diasAteFim(c);
      const nome = (c.fields && c.fields.nome_locatario) || c.name || 'Contrato sem nome';
      const imovel = (c.fields && c.fields.end_imovel) || '';
      const valor = c.fields && c.fields.valor_aluguel;

      if (status.label === 'Vencido' && dias !== null) {
        lista.push({
          ordem: -Math.abs(dias), dias: Math.abs(dias), rotuloDias: 'dias atrás',
          tipo: 'Vencido', tagClasse: 'badge-red', urgente: true,
          titulo: nome, detalhe: imovel || 'O prazo terminou e o contrato segue aberto.',
          valor, c
        });
      } else if (dias !== null && dias <= 90 && status.label === 'Ativo') {
        lista.push({
          ordem: dias, dias, rotuloDias: 'dias',
          tipo: dias <= 30 ? 'Vence em breve' : 'No radar',
          tagClasse: dias <= 30 ? 'badge-amber' : 'badge-blue', urgente: dias <= 30,
          titulo: nome, detalhe: imovel || 'Combine a renovação antes do fim do prazo.',
          valor, c
        });
      }

      const meses = this.mesesDesdeReajuste(c);
      if (status.label === 'Ativo' && meses !== null && meses >= 12) {
        lista.push({
          ordem: 1000 - meses, dias: meses, rotuloDias: 'meses',
          tipo: 'Reajuste devido', tagClasse: 'badge-teal', urgente: false,
          titulo: nome,
          detalhe: c.fields.ultimo_reajuste_data
            ? `Último reajuste em ${Utils.formatDate(c.fields.ultimo_reajuste_data)}.`
            : 'Nunca reajustado desde o início da locação.',
          valor, reajuste: true, c
        });
      }
    });
    return lista.sort((a, b) => a.ordem - b.ordem);
  },

  render(container) {
    const itens = this.itens();
    const urgentes = itens.filter(i => i.urgente).length;

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <div class="page-kicker">Acompanhamento</div>
          <h1 class="page-title">Renovações e alertas</h1>
          <p class="page-subtitle">${Utils.esc(itens.length
            ? `${itens.length} pendência${itens.length === 1 ? '' : 's'}` + (urgentes ? ` · ${urgentes} urgente${urgentes === 1 ? '' : 's'}` : '')
            : 'O que vence, o que reajusta e o que já passou — em ordem de urgência.')}</p>
        </div>
      </div>

      ${itens.length ? `
        <div class="renov-lista animate-fade-in-up">
          ${itens.map(i => `
            <div class="renov-linha ${i.urgente ? 'urgente' : ''}" data-busca>
              <div class="renov-prazo">
                <strong>${i.dias}</strong>
                <span>${Utils.esc(i.rotuloDias)}</span>
              </div>
              <div class="renov-sep" aria-hidden="true"></div>
              <div class="renov-corpo">
                <div class="contrato-linha-topo">
                  <span class="contrato-linha-nome">${Utils.esc(i.titulo)}</span>
                  <span class="badge ${i.tagClasse}">${Utils.esc(i.tipo)}</span>
                </div>
                <div class="lista-sub">${Utils.esc(i.detalhe)}</div>
              </div>
              <div class="renov-valor">
                <span class="text-muted">aluguel hoje</span>
                <strong>${Utils.esc(i.valor || 'não informado')}</strong>
              </div>
              <div class="renov-acoes">
                <a class="btn btn-primary btn-sm" href="#editor?id=${Utils.esc(i.c.id)}">Abrir contrato</a>
                ${i.reajuste && i.valor ? `<button type="button" class="btn btn-secondary btn-sm"
                  onclick="Renovacoes.pedirReajuste('${Utils.esc(i.c.id)}')">Aplicar reajuste</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state animate-fade-in-up">
          <p>Nenhuma renovação ou reajuste pendente.</p>
          <p style="color: var(--text-muted); font-weight: 400; font-size: 14px; margin-top: -10px;">
            Contratos vencidos, terminando em até 90 dias ou sem reajuste há mais de um ano aparecem aqui.
          </p>
        </div>
      `}

      <div class="card animate-fade-in-up" style="margin-top: 24px;">
        <div class="painel-secao-head"><h4>Como esta lista é montada</h4></div>
        <ul class="renov-regras">
          <li><b>Vencido</b> — o término já passou e o contrato continua aberto.</li>
          <li><b>Vence em breve</b> — termina em até 30 dias. <b>No radar</b> — entre 31 e 90 dias.</li>
          <li><b>Reajuste devido</b> — passaram 12 meses ou mais desde o último reajuste (ou desde o início, se nunca houve).</li>
        </ul>
        <p class="text-muted" style="font-size:13px;margin:0;">
          O aviso ao inquilino ainda é manual: o sistema não envia e-mail nem WhatsApp.
          Abrir o contrato dá acesso ao link e aos dados de contato.
        </p>
      </div>
    `;
  },

  // Reajuste é dinheiro: pede a taxa, confirma o valor resultante e só então
  // grava. `applyContractReajuste` já cuida do extenso e da trilha.
  pedirReajuste(id) {
    const c = Storage.getById(id);
    if (!c) return;
    const entrada = prompt('Reajuste em % (ex.: 4,5 para 4,5%):', '');
    if (entrada === null) return;

    const taxa = parseFloat(String(entrada).replace(',', '.'));
    if (!isFinite(taxa) || taxa <= 0) {
      Utils.toast('Informe uma porcentagem maior que zero.', 'error');
      return;
    }

    const atual = Utils.parseMoneyBRL(c.fields && c.fields.valor_aluguel);
    const novo = atual * (1 + taxa / 100);
    if (!confirm(`Reajustar de ${Utils.formatCurrency(atual)} para ${Utils.formatCurrency(novo)}?`)) return;

    const r = Storage.applyContractReajuste(id, taxa);
    if (!r) {
      Utils.toast('Não foi possível reajustar: o contrato precisa ter um valor de aluguel.', 'error');
      return;
    }
    Utils.toast(`Aluguel reajustado para ${Utils.formatCurrency(r.newRent)}.`);
    this.render(document.getElementById('main-content'));
    App.reaplicarBusca();
  }
};
