// ═══════════════════════════════════════════════════════
// Admin View - Configurações do Locador
// ═══════════════════════════════════════════════════════

const Admin = {
  render(container) {
    const profile = Storage.getAdminProfile();
    const isPJ = Utils.isPJLocador(profile);

    container.innerHTML = `
      <div class="admin-container animate-fade-in-up">
        
        <div class="page-header">
          <div>
            <h1 class="page-title">Meu Perfil</h1>
            <p class="page-subtitle">Estes dados serão preenchidos automaticamente em todos os novos contratos.</p>
          </div>
          <button class="btn btn-primary" onclick="Admin.save()" style="white-space: nowrap;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            Salvar
          </button>
        </div>

        <div class="card">
          <!-- Seção Pessoal -->
          <h3 class="section-title">Dados Pessoais (Locador)</h3>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">${isPJ ? 'Razão Social' : 'Nome Completo'}</label>
              <input type="text" class="form-input" id="admin_nome_locador" value="${Utils.esc(profile.nome_locador)}">
            </div>
            <div class="form-group pf-only" ${isPJ ? 'style="display:none;"' : ''}>
              <label class="form-label">Nacionalidade</label>
              <select class="form-input" id="admin_nac_locador">
                <option value="brasileiro(a)">Brasileiro(a)</option>
                <option value="estrangeiro(a)">Estrangeiro(a)</option>
              </select>
            </div>
            <div class="form-group pf-only" ${isPJ ? 'style="display:none;"' : ''}>
              <label class="form-label">Estado Civil</label>
              <select class="form-input" id="admin_est_civil_locador">
                <option value="">Selecione...</option>
                <option value="solteiro(a)">Solteiro(a)</option>
                <option value="casado(a)">Casado(a)</option>
                <option value="divorciado(a)">Divorciado(a)</option>
                <option value="viúvo(a)">Viúvo(a)</option>
                <option value="separado(a) judicialmente">Separado(a) judicialmente</option>
                <option value="em união estável">União Estável</option>
              </select>
            </div>
            <div class="form-group pf-only" ${isPJ ? 'style="display:none;"' : ''}>
              <label class="form-label">RG</label>
              <input type="text" class="form-input" id="admin_rg_locador" value="${Utils.esc(profile.rg_locador)}">
            </div>
            <div class="form-group">
              <label class="form-label">${isPJ ? 'CNPJ' : 'CPF'}</label>
              <input type="text" class="form-input" id="admin_doc_locador" data-mask="cpfcnpj" value="${Utils.esc(profile.doc_locador)}">
            </div>
          </div>

          <!-- Seção Banco -->
          <h3 class="section-title">Dados Bancários para Recebimento</h3>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Banco</label>
              <input type="text" class="form-input" id="admin_banco" value="${Utils.esc(profile.banco)}">
            </div>
            <div class="form-group">
              <label class="form-label">Agência</label>
              <input type="text" class="form-input" id="admin_agencia" value="${Utils.esc(profile.agencia)}">
            </div>
            <div class="form-group">
              <label class="form-label">Conta (com dígito)</label>
              <input type="text" class="form-input" id="admin_conta_banco" value="${Utils.esc(profile.conta_banco)}">
            </div>
            <div class="form-group">
              <label class="form-label">Tipo de Conta</label>
              <select class="form-input" id="admin_tipo_conta">
                <option value="">Selecione...</option>
                <option value="Conta Corrente">Conta Corrente</option>
                <option value="Conta Poupança">Conta Poupança</option>
                <option value="Conta Salário">Conta Salário</option>
                <option value="Conta Pagamento">Conta Pagamento</option>
              </select>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top: 24px; border-color: rgba(220,53,69,0.35);">
          <h3 class="section-title" style="color: #b3261e;">Excluir conta</h3>
          <p class="page-subtitle" style="margin: 0 0 14px;">
            Apaga permanentemente sua conta, seu perfil e todos os seus contratos (LGPD, art. 18).
            Esta ação não pode ser desfeita.
          </p>
          <button class="btn" style="background: #b3261e; color: #fff;" onclick="Admin.deleteAccount()">Excluir minha conta e todos os dados</button>
        </div>
      </div>
    `;

    // Seta os valores iniciais dos selects
    if (profile.nac_locador) container.querySelector('#admin_nac_locador').value = profile.nac_locador;
    if (profile.est_civil_locador) container.querySelector('#admin_est_civil_locador').value = profile.est_civil_locador;
    if (profile.tipo_conta) container.querySelector('#admin_tipo_conta').value = profile.tipo_conta;

    // Aplica as máscaras
    container.querySelectorAll('input[data-mask]').forEach(el => {
      Utils.applyMask(el, el.getAttribute('data-mask'));
    });
  },

  save() {
    // O tipo (PF/PJ) é definido no cadastro e não muda aqui — vem do perfil salvo.
    const atual = Storage.getAdminProfile() || {};
    const isPJ = Utils.isPJLocador(atual);

    const profile = {
      // Preserva o que esta tela não edita — em especial `termos_aceite`, a
      // evidência do aceite dos Termos gravada no cadastro.
      ...atual,
      tipo_locador: isPJ ? 'pj' : 'pf',
      nome_locador: document.getElementById('admin_nome_locador').value,
      nac_locador: isPJ ? '' : document.getElementById('admin_nac_locador').value,
      est_civil_locador: isPJ ? '' : document.getElementById('admin_est_civil_locador').value,
      rg_locador: isPJ ? '' : document.getElementById('admin_rg_locador').value,
      doc_locador: document.getElementById('admin_doc_locador').value,
      banco: document.getElementById('admin_banco').value,
      agencia: document.getElementById('admin_agencia').value,
      conta_banco: document.getElementById('admin_conta_banco').value,
      tipo_conta: document.getElementById('admin_tipo_conta').value
    };

    Storage.saveAdminProfile(profile);
    
    // Mostra um feedback visual no botão
    const btn = document.querySelector('button[onclick="Admin.save()"]');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Salvo com Sucesso!';
    btn.style.backgroundColor = 'var(--success)';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.backgroundColor = '';
    }, 2000);
  },

  // Exclusão da própria conta (LGPD, art. 18): apaga contratos, perfil e o usuário via RPC.
  deleteAccount() {
    if (!App.user) return;
    // Senha, não uma palavra digitada: a RPC apaga tudo de forma irreversível e
    // é chamável em uma linha de console. Digitar "EXCLUIR" prova intenção de
    // quem está na tela, não que a sessão é mesmo do dono — e uma sessão roubada
    // (ou um XSS) tem as duas coisas.
    const senha = prompt('Isso apaga sua conta, seu perfil e TODOS os seus contratos, sem volta.\n\nDigite sua SENHA para confirmar:');
    if (senha === null) return;
    if (!senha) {
      Utils.toast('Senha não informada. Nada foi apagado.', 'error');
      return;
    }

    supabaseClient.auth.signInWithPassword({ email: App.user.email, password: senha }).then(({ error }) => {
      if (error) throw new Error('Senha incorreta. Nada foi apagado.');
      return supabaseClient.rpc('delete_own_account');
    }).then(({ error }) => {
      if (error) throw error;
      localStorage.removeItem(Storage.PENDING_PROFILE_KEY);
      // signOut pode falhar (o usuário já não existe) — segue para o reload de qualquer forma.
      supabaseClient.auth.signOut().catch(() => {}).finally(() => {
        window.location.hash = '#';
        window.location.reload();
      });
    }).catch(err => {
      console.error(err);
      Utils.toast('Erro ao excluir a conta: ' + (err.message || err), 'error');
    });
  }
};
