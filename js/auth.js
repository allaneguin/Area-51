// ═══════════════════════════════════════════════════════
// AuthUI - Interface e controle de Autenticação Supabase
// ═══════════════════════════════════════════════════════

const AuthUI = {
  isRegisterMode: false,

  render(container) {
    container.innerHTML = `
      <div class="auth-wrapper animate-fade-in">
        <div class="auth-card glass">
          <div class="auth-logo">
            <svg viewBox="0 0 100 100" width="80" height="80">
              <rect x="45" y="20" width="40" height="60" fill="#515151" />
              <rect x="40" y="32" width="35" height="8" rx="4" fill="#ffffff" />
              <rect x="55" y="47" width="20" height="8" rx="4" fill="#ffffff" />
              <rect x="55" y="62" width="20" height="8" rx="4" fill="#ffffff" />
              <path d="M35 25 L10 45 L10 80 L28 80 L28 59 L42 59 L42 80 L60 80 L60 45 Z" fill="var(--primary)" stroke="#ffffff" stroke-width="4" stroke-linejoin="round" />
            </svg>
          </div>
          <h2 class="auth-title" id="auth-title">Entrar no Meus Imóveis</h2>
          <p class="auth-subtitle" id="auth-subtitle">Conecte-se para salvar e gerenciar seus contratos na nuvem.</p>
          
          <div id="auth-error-msg" class="auth-error" style="display: none;"></div>

          <form id="auth-form" onsubmit="AuthUI.handleSubmit(event)">
            <div class="form-group">
              <label class="form-label">E-mail</label>
              <input type="email" id="auth-email" class="form-input" required placeholder="exemplo@email.com">
            </div>
            
            <div class="form-group">
              <label class="form-label">Senha</label>
              <input type="password" id="auth-password" class="form-input" required placeholder="Digite sua senha (mín. 6 caracteres)" minlength="6">
            </div>

            <div id="auth-register-fields" style="display: none; text-align: left;">
              <div class="form-group">
                <label class="form-label">Tipo de Locador</label>
                <select class="form-input" id="auth-tipo-locador" onchange="AuthUI.togglePFFields()">
                  <option value="pf">Pessoa Física (CPF)</option>
                  <option value="pj">Pessoa Jurídica (CNPJ)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">CPF / CNPJ</label>
                <input type="text" class="form-input" id="auth-doc-locador" data-mask="cpfcnpj">
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label class="form-label">Nome Completo / Razão Social</label>
                <input type="text" class="form-input" id="auth-nome-locador">
              </div>
              <div class="form-group auth-pf-only">
                <label class="form-label">Nacionalidade</label>
                <select class="form-input" id="auth-nac-locador">
                  <option value="brasileiro(a)">Brasileiro(a)</option>
                  <option value="estrangeiro(a)">Estrangeiro(a)</option>
                </select>
              </div>
              <div class="form-group auth-pf-only">
                <label class="form-label">Estado Civil</label>
                <select class="form-input" id="auth-est-civil-locador">
                  <option value="">Selecione...</option>
                  <option value="solteiro(a)">Solteiro(a)</option>
                  <option value="casado(a)">Casado(a)</option>
                  <option value="divorciado(a)">Divorciado(a)</option>
                  <option value="viúvo(a)">Viúvo(a)</option>
                  <option value="separado(a) judicialmente">Separado(a) judicialmente</option>
                  <option value="em união estável">União Estável</option>
                </select>
              </div>
              <div class="form-group auth-pf-only">
                <label class="form-label">RG (opcional)</label>
                <input type="text" class="form-input" id="auth-rg-locador">
              </div>
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 1rem; margin-top: 1.5rem; font-size: 1rem;" id="auth-submit-btn">
              Acessar Painel
            </button>
          </form>

          <div id="auth-forgot" style="margin-top: 1rem; font-size: 0.9rem;">
            <a href="#" onclick="AuthUI.forgotPassword(event)" style="color: var(--text-muted); text-decoration: underline;">Esqueci minha senha</a>
          </div>

          <div class="auth-toggle">
            <span id="auth-toggle-text">Não tem uma conta?</span>
            <a href="#" onclick="AuthUI.toggleMode(event)" id="auth-toggle-link" style="color: var(--primary); font-weight: bold; margin-left: 5px;">Cadastre-se</a>
          </div>
        </div>
      </div>

      ${this.styles}
    `;
    this.isRegisterMode = false;
    Utils.applyMask(document.getElementById('auth-doc-locador'), 'cpfcnpj');
  },

  styles: `
      <style>
        .auth-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 70vh;
          padding: 2rem;
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          padding: 2.5rem;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
          transition: max-width var(--transition);
        }
        .auth-card.register {
          max-width: 720px;
        }
        #auth-register-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 1.25rem;
        }
        @media (max-width: 640px) {
          .auth-card.register { max-width: 420px; }
          #auth-register-fields { grid-template-columns: 1fr; }
        }
        .auth-logo {
          margin-bottom: 1.5rem;
          display: inline-block;
        }
        .auth-title {
          font-family: var(--font-sans);
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-bottom: 0.5rem;
          color: var(--text-main);
        }
        .auth-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-bottom: 2rem;
          line-height: 1.4;
        }
        .auth-error {
          background: rgba(220, 53, 69, 0.1);
          color: #dc3545;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid rgba(220, 53, 69, 0.2);
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
          text-align: left;
        }
        .auth-toggle {
          margin-top: 1.5rem;
          font-size: 0.9rem;
          color: var(--text-muted);
        }
      </style>
  `,

  togglePFFields() {
    const isPJ = document.getElementById('auth-tipo-locador').value === 'pj';
    document.querySelectorAll('.auth-pf-only').forEach(el => el.style.display = isPJ ? 'none' : '');
  },

  toggleMode(e) {
    e.preventDefault();
    this.isRegisterMode = !this.isRegisterMode;

    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleLink = document.getElementById('auth-toggle-link');
    const errorDiv = document.getElementById('auth-error-msg');

    errorDiv.style.display = 'none';
    document.getElementById('auth-register-fields').style.display = this.isRegisterMode ? '' : 'none';
    document.getElementById('auth-forgot').style.display = this.isRegisterMode ? 'none' : '';
    document.querySelector('.auth-card').classList.toggle('register', this.isRegisterMode);

    if (this.isRegisterMode) {
      title.textContent = 'Criar Nova Conta';
      subtitle.textContent = 'Cadastre-se gratuitamente para manter seus contratos salvos e seguros na nuvem.';
      submitBtn.textContent = 'Criar Conta';
      toggleText.textContent = 'Já tem uma conta?';
      toggleLink.textContent = 'Entrar';
    } else {
      title.textContent = 'Entrar no Meus Imóveis';
      subtitle.textContent = 'Conecte-se para salvar e gerenciar seus contratos na nuvem.';
      submitBtn.textContent = 'Acessar Painel';
      toggleText.textContent = 'Não tem uma conta?';
      toggleLink.textContent = 'Cadastre-se';
    }
  },

  handleSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorDiv = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('auth-submit-btn');
    
    // Resetar estilos de erro para o padrão
    errorDiv.style.background = 'rgba(220, 53, 69, 0.1)';
    errorDiv.style.color = '#dc3545';
    errorDiv.style.borderColor = 'rgba(220, 53, 69, 0.2)';
    errorDiv.style.display = 'none';

    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Aguarde...';

    if (this.isRegisterMode) {
      const isPJ = document.getElementById('auth-tipo-locador').value === 'pj';
      const profile = {
        tipo_locador: isPJ ? 'pj' : 'pf',
        nome_locador: document.getElementById('auth-nome-locador').value.trim(),
        nac_locador: isPJ ? '' : document.getElementById('auth-nac-locador').value,
        est_civil_locador: isPJ ? '' : document.getElementById('auth-est-civil-locador').value,
        rg_locador: isPJ ? '' : document.getElementById('auth-rg-locador').value.trim(),
        doc_locador: document.getElementById('auth-doc-locador').value.trim()
      };

      if (!profile.nome_locador || !profile.doc_locador) {
        errorDiv.textContent = 'Preencha o nome e o ' + (isPJ ? 'CNPJ' : 'CPF') + ' do locador.';
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      supabaseClient.auth.signUp({ email, password })
        .then(({ data, error }) => {
          if (error) throw error;
          console.log("Conta criada com sucesso:", data.user);

          if (data.user && data.user.identities && data.user.identities.length === 0) {
            // Supabase retorna "sucesso" sem identities quando o e-mail já existe
            throw new Error('already registered');
          }

          // Guarda os dados do locador; sobem para a nuvem no primeiro login
          Storage.saveAdminProfile(profile);

          if (data.user && !data.session) {
            // Cadastro bem sucedido mas necessita confirmação de e-mail
            errorDiv.style.background = 'rgba(40, 167, 69, 0.1)';
            errorDiv.style.color = '#28a745';
            errorDiv.style.borderColor = 'rgba(40, 167, 69, 0.2)';
            errorDiv.textContent = 'Cadastro realizado com sucesso! Um e-mail de confirmação foi enviado. Por favor, confirme-o antes de fazer o login.';
            errorDiv.style.display = 'block';
            
            // Voltar para o modo de login
            this.isRegisterMode = true; // Força o toggle a mudar para login
            this.toggleMode({ preventDefault: () => {} });

            // Limpar campo de senha e reabilitar o botão para o login
            document.getElementById('auth-password').value = '';
            submitBtn.disabled = false;
          }
        })
        .catch((error) => {
          console.error(error);
          errorDiv.textContent = this.translateError(error.message);
          errorDiv.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
    } else {
      supabaseClient.auth.signInWithPassword({ email, password })
        .then(({ data, error }) => {
          if (error) throw error;
          console.log("Login realizado com sucesso:", data.user);
        })
        .catch((error) => {
          console.error(error);
          errorDiv.textContent = this.translateError(error.message);
          errorDiv.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
    }
  },

  forgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const errorDiv = document.getElementById('auth-error-msg');

    // Resetar estilos de erro para o padrão
    errorDiv.style.background = 'rgba(220, 53, 69, 0.1)';
    errorDiv.style.color = '#dc3545';
    errorDiv.style.borderColor = 'rgba(220, 53, 69, 0.2)';

    if (!email) {
      errorDiv.textContent = 'Digite seu e-mail no campo acima e clique novamente em "Esqueci minha senha".';
      errorDiv.style.display = 'block';
      return;
    }

    supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    }).then(({ error }) => {
      if (error) throw error;
      errorDiv.style.background = 'rgba(40, 167, 69, 0.1)';
      errorDiv.style.color = '#28a745';
      errorDiv.style.borderColor = 'rgba(40, 167, 69, 0.2)';
      errorDiv.textContent = 'Link de redefinição enviado para ' + email + '. Abra o e-mail e clique no link para criar uma nova senha.';
      errorDiv.style.display = 'block';
    }).catch((error) => {
      console.error(error);
      errorDiv.textContent = this.translateError(error.message);
      errorDiv.style.display = 'block';
    });
  },

  // Tela exibida quando o usuário volta pelo link de redefinição do e-mail
  renderNewPassword(container) {
    container.innerHTML = `
      <div class="auth-wrapper animate-fade-in">
        <div class="auth-card glass">
          <h2 class="auth-title">Criar Nova Senha</h2>
          <p class="auth-subtitle">Digite a nova senha de acesso da sua conta.</p>

          <div id="auth-error-msg" class="auth-error" style="display: none;"></div>

          <form onsubmit="AuthUI.submitNewPassword(event)">
            <div class="form-group">
              <label class="form-label">Nova Senha</label>
              <input type="password" id="new-password" class="form-input" required minlength="6" placeholder="Mínimo de 6 caracteres">
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 1rem; margin-top: 1.5rem; font-size: 1rem;" id="new-password-btn">
              Salvar Nova Senha
            </button>
          </form>
        </div>
      </div>
      ${this.styles}
    `;
  },

  submitNewPassword(e) {
    e.preventDefault();
    const pwd = document.getElementById('new-password').value;
    const errorDiv = document.getElementById('auth-error-msg');
    const btn = document.getElementById('new-password-btn');

    errorDiv.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Aguarde...';

    supabaseClient.auth.updateUser({ password: pwd })
      .then(({ error }) => {
        if (error) throw error;
        App.passwordRecovery = false;
        Utils.toast('Senha alterada com sucesso!');
        window.location.hash = '#dashboard';
        App.handleRoute();
      })
      .catch((error) => {
        console.error(error);
        errorDiv.textContent = this.translateError(error.message);
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Salvar Nova Senha';
      });
  },

  translateError(msg) {
    if (!msg) return 'Ocorreu um erro ao processar sua solicitação.';
    
    if (msg.includes('already registered')) {
      return 'Este endereço de e-mail já está cadastrado em outra conta.';
    }
    if (msg.includes('Invalid login credentials')) {
      return 'E-mail ou senha incorretos. Verifique e tente novamente.';
    }
    if (msg.includes('signup is disabled') || msg.includes('Signups not allowed')) {
      return 'O cadastro de novos usuários está desativado para este projeto.';
    }
    if (msg.includes('Password should be')) {
      return 'A senha é muito fraca. Digite pelo menos 6 caracteres.';
    }
    if (msg.includes('confirm your email') || msg.includes('Email not confirmed')) {
      return 'Por favor, confirme seu endereço de e-mail antes de fazer login.';
    }
    if (msg.includes('Email address') && msg.includes('invalid')) {
      return 'O endereço de e-mail inserido é inválido ou não é aceito.';
    }
    if (msg.includes('rate limit exceeded')) {
      return 'Limite de envios de e-mail excedido. Aguarde alguns minutos ou desative a "Confirmação de E-mail" no painel do Supabase.';
    }
    if (msg.includes('should be different')) {
      return 'A nova senha precisa ser diferente da senha atual.';
    }
    if (msg.includes('Auth session missing')) {
      return 'O link de redefinição expirou ou é inválido. Solicite um novo em "Esqueci minha senha".';
    }
    
    return msg; // Retorna mensagem nativa se não mapeada
  },

  logout() {
    if (SupabaseActive && supabaseClient) {
      supabaseClient.auth.signOut().then(() => {
        console.log("Desconectado com sucesso.");
        window.location.hash = '#';
        window.location.reload();
      }).catch(err => console.error("Erro ao deslogar:", err));
    }
  }
};
