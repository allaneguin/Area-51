// ═══════════════════════════════════════════════════════
// Módulo Financeiro & Repasses — FinancialView
// ═══════════════════════════════════════════════════════

const FinancialView = {
  render(container) {
    const records = Storage.getFinancialRecords();
    const contracts = Storage.getAll();

    // Métricas financeiras
    let totalBruto = 0;
    let totalComissao = 0;
    let totalRepasse = 0;
    let totalPendente = 0;

    records.forEach(r => {
      const val = parseFloat(r.rent_value) || 0;
      const fee = parseFloat(r.fee_value) || 0;
      const net = parseFloat(r.net_payout) || 0;

      if (r.status === 'Pago') {
        totalBruto += val;
        totalComissao += fee;
        totalRepasse += net;
      } else {
        totalPendente += val;
      }
    });

    container.innerHTML = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Financeiro &amp; Repasses</h1>
          <p class="page-subtitle">Aluguéis recebidos, comissão da imobiliária, repasses aos locadores e reajuste (IPCA/IGP-M).</p>
        </div>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="FinancialView.openReajusteModal()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
            Reajuste (IPCA / IGP-M)
          </button>
          <button class="btn btn-primary" onclick="FinancialView.generateMonthly()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            Gerar Cobranças do Mês
          </button>
        </div>
      </div>

      <div class="stats-grid animate-fade-in-up">
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Aluguéis Recebidos</span></div>
          <div class="stat-value" style="color: var(--success);">${Utils.formatCurrency(totalBruto)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Comissão Imobiliária</span></div>
          <div class="stat-value" style="color: var(--primary);">${Utils.formatCurrency(totalComissao)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Repasse aos Locadores</span></div>
          <div class="stat-value" style="color: var(--accent);">${Utils.formatCurrency(totalRepasse)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-head"><span class="stat-label">Pendentes / Atrasados</span></div>
          <div class="stat-value" style="color: var(--warning);">${Utils.formatCurrency(totalPendente)}</div>
        </div>
      </div>

      ${records.length === 0 ? `
        <div class="empty-state glass animate-fade-in-up">
          <p>Nenhum lançamento financeiro neste mês.</p>
          <p style="color: var(--text-muted); font-weight: 400; font-size: 14px; margin-top: -10px; margin-bottom: 20px;">Gere automaticamente a folha de cobranças do mês corrente a partir dos seus contratos ativos.</p>
          <button class="btn btn-primary" onclick="FinancialView.generateMonthly()">Gerar Cobranças do Mês</button>
        </div>
      ` : `
        <div class="data-table-wrap animate-fade-in-up">
          <table class="data-table">
            <thead>
              <tr>
                <th>Lançamento / Imóvel</th>
                <th>Inquilino</th>
                <th>Vencimento</th>
                <th>Aluguel Bruto</th>
                <th>Comissão</th>
                <th>Repasse Líquido</th>
                <th>Status</th>
                <th class="td-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr>
                  <td style="font-weight: 600;">
                    ${Utils.esc(r.description)}
                    <span class="td-sub">Locador: ${Utils.esc(r.landlord_name || 'Locador')}</span>
                  </td>
                  <td>${Utils.esc(r.tenant_name || '—')}</td>
                  <td>${r.due_date ? Utils.formatDate(r.due_date) : '—'}</td>
                  <td style="font-weight: 600;">${Utils.formatCurrency(r.rent_value || 0)}</td>
                  <td style="color: var(--text-muted);">${r.fee_percent || 10}% (${Utils.formatCurrency(r.fee_value || 0)})</td>
                  <td style="font-weight: 700; color: var(--accent);">${Utils.formatCurrency(r.net_payout || 0)}</td>
                  <td><span class="badge ${r.status === 'Pago' ? 'badge-teal' : 'badge-amber'}">${Utils.esc(r.status)}</span></td>
                  <td class="td-acoes">
                    ${r.status !== 'Pago' ? `
                      <button class="btn btn-primary" onclick="FinancialView.markAsPaid('${r.id}')">Marcar Pago</button>
                    ` : `
                      <button class="btn btn-secondary" onclick="FinancialView.markAsPending('${r.id}')">Desfazer</button>
                    `}
                    <button class="btn btn-danger" onclick="FinancialView.deleteRec('${r.id}')">Excluir</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}

      <!-- Modal de Reajuste Anual por Índice (IPCA / IGP-M) -->
      <div id="reajuste-modal" class="modal-backdrop">
        <div class="modal-card" style="max-width: 500px;">
          <h3>Calculadora de Reajuste Anual</h3>
          <form onsubmit="FinancialView.applyReajuste(event)">
            <div class="form-group">
              <label class="form-label">Selecionar Contrato *</label>
              <select id="reajuste-contract-id" class="form-input" required onchange="FinancialView.updateReajustePreview()">
                <option value="">Selecione o contrato...</option>
                ${contracts.map(c => `
                  <option value="${c.id}">${Utils.esc(c.name)} (Atual: ${Utils.esc(c.fields.valor_aluguel || 'R$ 0,00')})</option>
                `).join('')}
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Índice Oficial</label>
                <select id="reajuste-index" class="form-input" onchange="FinancialView.updateReajustePreview()">
                  <option value="IPCA">IPCA (IBGE)</option>
                  <option value="IGP-M">IGP-M (FGV)</option>
                  <option value="IVAR">IVAR (Locação)</option>
                  <option value="FIPE-ZAP">FIPE-ZAP</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Taxa Acumulada (%) *</label>
                <input type="number" step="0.01" id="reajuste-rate" class="form-input" value="4.50" required oninput="FinancialView.updateReajustePreview()">
              </div>
            </div>

            <div id="reajuste-preview-box" style="background: var(--seg-bg); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-light); margin-bottom: 1.25rem;">
              <div class="stat-label">Simulação de Reajuste</div>
              <div style="font-size: 1.1rem; font-weight: 700; margin-top: 0.25rem; color: var(--text-main);" id="reajuste-result-text">Selecione um contrato...</div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" onclick="FinancialView.closeReajusteModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Aplicar Reajuste no Contrato</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  generateMonthly() {
    const count = Storage.generateMonthlyCharges(10);
    if (count > 0) {
      Utils.toast(`Gerados ${count} novos lançamentos de cobrança para este mês!`);
    } else {
      Utils.toast('As cobranças do mês corrente já foram geradas anteriormente.', 'info');
    }
    this.render(document.getElementById('main-content'));
  },

  markAsPaid(id) {
    Storage.saveFinancialRecord({
      id,
      status: 'Pago',
      paid_at: new Date().toISOString()
    });
    Utils.toast('Aluguel marcado como PAGO!');
    this.render(document.getElementById('main-content'));
  },

  markAsPending(id) {
    Storage.saveFinancialRecord({
      id,
      status: 'Pendente',
      paid_at: null
    });
    Utils.toast('Status desfeito para Pendente.');
    this.render(document.getElementById('main-content'));
  },

  deleteRec(id) {
    if (confirm('Deseja realmente excluir este lançamento financeiro?')) {
      Storage.deleteFinancialRecord(id);
      Utils.toast('Lançamento excluído!');
      this.render(document.getElementById('main-content'));
    }
  },

  openReajusteModal() {
    document.getElementById('reajuste-modal').style.display = 'flex';
    this.updateReajustePreview();
  },

  closeReajusteModal() {
    document.getElementById('reajuste-modal').style.display = 'none';
  },

  updateReajustePreview() {
    const cId = document.getElementById('reajuste-contract-id').value;
    const rate = parseFloat(document.getElementById('reajuste-rate').value) || 0;
    const idxName = document.getElementById('reajuste-index').value;
    const resultBox = document.getElementById('reajuste-result-text');

    if (!cId) {
      resultBox.innerText = 'Selecione um contrato para calcular o novo aluguel.';
      return;
    }

    const contract = Storage.getById(cId);
    if (!contract || !contract.fields.valor_aluguel) {
      resultBox.innerText = 'Este contrato não possui valor de aluguel preenchido.';
      return;
    }

    const rawRent = String(contract.fields.valor_aluguel).replace(/\D/g, '');
    const currentRent = parseFloat(rawRent) / 100 || 0;
    const newRent = currentRent * (1 + (rate / 100));

    resultBox.innerHTML = `
      <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.9rem;">${Utils.formatCurrency(currentRent)}</span>
      <span style="color: var(--success); font-weight: 700; margin-left: 0.5rem;">${Utils.formatCurrency(newRent)}</span>
      <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400; margin-top: 0.2rem;">Aumento de +${rate}% pelo ${idxName}</div>
    `;
  },

  applyReajuste(e) {
    e.preventDefault();
    const cId = document.getElementById('reajuste-contract-id').value;
    const rate = parseFloat(document.getElementById('reajuste-rate').value) || 0;
    const idxName = document.getElementById('reajuste-index').value;

    const res = Storage.applyContractReajuste(cId, rate, idxName);
    if (res) {
      Utils.toast(`Reajuste de ${rate}% pelo ${idxName} aplicado! Novo aluguel: ${Utils.formatCurrency(res.newRent)}`);
      this.closeReajusteModal();
      this.render(document.getElementById('main-content'));
    } else {
      Utils.toast('Não foi possível aplicar o reajuste.', 'error');
    }
  }
};
