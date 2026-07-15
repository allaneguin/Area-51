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

            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 1rem; margin-top: 1.5rem; font-size: 1rem;" id="auth-submit-btn">
              Acessar Painel
            </button>
          </form>

          <div class="auth-toggle">
            <span id="auth-toggle-text">Não tem uma conta?</span>
            <a href="#" onclick="AuthUI.toggleMode(event)" id="auth-toggle-link" style="color: var(--primary); font-weight: bold; margin-left: 5px;">Cadastre-se</a>
          </div>
        </div>
      </div>

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
    `;
    this.isRegisterMode = false;
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
      supabaseClient.auth.signUp({ email, password })
        .then(({ data, error }) => {
          if (error) throw error;
          console.log("Conta criada com sucesso:", data.user);
          
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
            
            // Limpar campo de senha
            document.getElementById('auth-password').value = '';
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
