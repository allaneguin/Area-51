// ═══════════════════════════════════════════════════════
// AuthUI - Interface e controle de Autenticação Supabase
// Layout split-screen (design "Login Meus Imóveis")
// ═══════════════════════════════════════════════════════

const AuthUI = {
  registerType: 'pf', // 'pf' | 'pj' — tipo de locador escolhido no cadastro
  view: 'login',      // 'login' | 'type' | 'register'

  eyeIcon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOffIcon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,

  // Painel de marca (lateral esquerda) — reutilizado no login e na redefinição de senha
  brandPanel: `
    <div class="auth-brand">
      <div class="auth-brand-glow"></div>
      <canvas class="auth-brand-canvas"></canvas>
      <div class="auth-brand-grid"></div>
      <div class="auth-brand-logo">
        <svg viewBox="0 0 125 95" fill="none" aria-hidden="true"><path d="M124.149 94C124.149 94.5523 123.702 95 123.149 95H80.0088C80.0039 95 80 94.9961 80 94.9912C80 94.9864 80.0039 94.9824 80.0088 94.9824L88.0528 94.992C88.6051 94.9926 89.0533 94.5455 89.054 93.9932L89.0827 70.9988C89.0834 70.447 89.5309 70 90.0827 70H94.1494C96.9108 70 99.1494 67.7614 99.1494 65C99.1494 62.2386 96.9108 60 94.1494 60H90.0979C89.5452 60 89.0972 59.5515 89.098 58.9987L89.1081 50.9987C89.1088 50.4469 89.5563 50 90.1081 50H99.1494C101.911 50 104.149 47.7614 104.149 45C104.149 42.2386 101.911 40 99.1494 40H90.1224C89.5696 40 89.1217 39.5515 89.1224 38.9987L89.1279 34.7739C89.1279 34.7709 89.1256 34.7683 89.1226 34.7681C89.1195 34.7678 89.1172 34.7652 89.1172 34.7622L89.1203 34.4736C89.1214 34.3669 89.069 34.2667 88.9808 34.2067L85.4794 31.8271C84.6649 31.2735 85.0567 30 86.0415 30H104.149C106.911 30 109.149 27.7614 109.149 25C109.149 22.2386 106.911 20 104.149 20H68.1494C68.1043 20 68.0601 19.9874 68.0227 19.962L54.5873 10.8308C54.3134 10.6446 54.1494 10.3349 54.1494 10.0037V1C54.1494 0.447715 54.5971 0 55.1494 0H123.149C123.702 0 124.149 0.447715 124.149 1V94Z" fill="white"/><path d="M39.9453 14.3698C40.2812 14.1459 40.7188 14.1459 41.0547 14.3698L80.5547 40.7031C80.8329 40.8886 81 41.2008 81 41.5352V94C81 94.5523 80.5523 95 80 95H56.6875C56.1352 95 55.6875 94.5523 55.6875 94V64.5C55.6875 63.9477 55.2398 63.5 54.6875 63.5H26.3125C25.7602 63.5 25.3125 63.9477 25.3125 64.5V94C25.3125 94.5523 24.8648 95 24.3125 95H1C0.447716 95 0 94.5523 0 94V41.5352C0 41.2008 0.167101 40.8886 0.4453 40.7031L39.9453 14.3698Z" fill="white"/></svg> Meus Imóveis
      </div>
      <div class="auth-brand-headline">
        <h1>Seus contratos, organizados e <em>na nuvem</em></h1>
        <div class="auth-bullets">
          <div class="auth-bullet"><span class="tick">✓</span>Modelos residenciais e comerciais prontos</div>
          <div class="auth-bullet"><span class="tick">✓</span>Link seguro para o inquilino preencher</div>
          <div class="auth-bullet"><span class="tick">✓</span>PDF final gerado com um clique</div>
        </div>
      </div>
      <div class="auth-brand-foot">© 2026 Meus Imóveis</div>
    </div>`,

  // newPw=true → senha sendo criada (cadastro/redefinição): exige a política do Supabase.
  // No login (newPw falso) NÃO restringe, senão usuários antigos com senha curta travam.
  pwField(id, newPw) {
    const attrs = newPw ? 'required minlength="8" placeholder="Mín. 8 caracteres"' : 'required placeholder="Sua senha"';
    const hint = newPw ? '<small class="auth-pw-hint">8+ caracteres, com maiúscula, minúscula, número e símbolo.</small>' : '';
    return `
      <label class="auth-label">
        <span>SENHA</span>
        <div class="auth-pw-wrap">
          <input type="password" id="${id}" class="auth-input" ${attrs}>
          <span class="auth-pw-toggle" onclick="AuthUI.togglePw(this)">${this.eyeIcon}</span>
        </div>
        ${hint}
      </label>`;
  },

  render(container) {
    container.innerHTML = `
      <div class="auth-screen">
        ${this.brandPanel}
        <div class="auth-form-panel">
          <div class="auth-form-inner">
            <div id="auth-error-msg" class="auth-error" style="display: none;"></div>

            <!-- LOGIN -->
            <div id="view-login">
              <h2 class="auth-h2">Bem-vindo de volta</h2>
              <p class="auth-sub">Entre para gerenciar seus contratos.</p>
              <form onsubmit="AuthUI.handleLogin(event)">
                <div class="auth-fields">
                  <label class="auth-label">
                    <span>E-MAIL</span>
                    <input type="email" id="login-email" class="auth-input" required placeholder="voce@email.com">
                  </label>
                  ${this.pwField('login-password')}
                </div>
                <div class="auth-forgot">
                </div>
                <button type="submit" class="auth-btn" id="login-btn" style="margin-top: 20px;">Acessar Painel</button>
              </form>
            </div>

            <!-- CADASTRO · PASSO 1: tipo de locador -->
            <div id="view-type" style="display: none;">
              <h2 class="auth-h2">Criar nova conta</h2>
              <p class="auth-sub">Primeiro, informe o tipo de locador.</p>
              <div class="auth-type-grid">
                <div class="auth-type-card selected" id="type-card-pf" onclick="AuthUI.selectType('pf')">
                  <div class="tt">Pessoa Física</div>
                  <div class="st">CPF</div>
                </div>
                <div class="auth-type-card" id="type-card-pj" onclick="AuthUI.selectType('pj')">
                  <div class="tt">Pessoa Jurídica</div>
                  <div class="st">CNPJ</div>
                </div>
              </div>
              <button class="auth-btn" style="margin-top: 20px;" onclick="AuthUI.goToDados()">Continuar →</button>
            </div>

            <!-- CADASTRO · PASSO 2: dados (preenchido por goToDados) -->
            <div id="view-register" style="display: none;"></div>

            <!-- rodapé de troca de modo (persistente) -->
            <div class="auth-divider"><span class="line"></span><span class="or">ou</span><span class="line"></span></div>
            <div class="auth-switch" onclick="AuthUI.toggleModo()">
              <span id="auth-switch-q">Não tem uma conta?</span> <b id="auth-switch-a">Cadastre-se</b>
            </div>
          </div>
        </div>
      </div>
    `;
    this.view = 'login';
    this._initWater();
  },

  // Água fluida e contínua no painel de marca: massas de luz azul que fluem e se fundem
  // numa coisa só; o cursor puxa o campo inteiro com atraso suave (sem gotas/anéis discretos).
  // Canvas 2D, sem dependências, auto-encerra ao sair do DOM.
  _initWater() {
    const canvas = document.querySelector('.auth-brand-canvas');
    if (!canvas) return;
    // Respeita quem pediu menos movimento no SO
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    const brand = canvas.parentElement;
    // ex/ey = posição suavizada do cursor; influence = quanto o cursor está "puxando" a água (0→1)
    const pointer = { x: 0.5, y: 0.5, ex: 0.5, ey: 0.5, influence: 0, seen: false };
    let W = 0, H = 0;

    const resize = () => {
      const r = brand.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // guarda em fração (0..1) — sobrevive a resize sem recalcular
    brand.addEventListener('pointermove', (e) => {
      const r = brand.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / (r.width || 1);
      pointer.y = (e.clientY - r.top) / (r.height || 1);
      if (!pointer.seen) { pointer.ex = pointer.x; pointer.ey = pointer.y; pointer.seen = true; }
      pointer.act = true;
    });
    brand.addEventListener('pointerleave', () => { pointer.act = false; });

    // Correntes: blobs grandes e sobrepostos que derivam devagar → leem como um corpo único.
    // ox/oy centro-base (fração), ax/ay amplitude da deriva, fx/fy/px/py freq+fase, r raio,
    // rf/rp pulsação do raio, c cor rgb, a alpha.
    const CURRENTS = [
      { ox: 0.30, oy: 0.85, ax: 0.10, ay: 0.10, fx: 0.11, fy: 0.08, px: 0.0, py: 1.0, r: 0.62, rf: 0.13, rp: 0.0, c: '46,109,180', a: 0.20 },
      { ox: 0.72, oy: 0.20, ax: 0.12, ay: 0.09, fx: 0.09, fy: 0.12, px: 2.1, py: 0.5, r: 0.55, rf: 0.10, rp: 1.3, c: '28,78,137',  a: 0.20 },
      { ox: 0.52, oy: 0.55, ax: 0.13, ay: 0.12, fx: 0.13, fy: 0.10, px: 1.0, py: 2.2, r: 0.50, rf: 0.15, rp: 2.4, c: '46,109,180', a: 0.15 },
      { ox: 0.88, oy: 0.80, ax: 0.09, ay: 0.11, fx: 0.08, fy: 0.11, px: 3.0, py: 1.4, r: 0.46, rf: 0.09, rp: 0.6, c: '20,58,102',  a: 0.17 },
      { ox: 0.12, oy: 0.38, ax: 0.10, ay: 0.10, fx: 0.12, fy: 0.09, px: 0.7, py: 2.7, r: 0.48, rf: 0.12, rp: 1.8, c: '46,109,180', a: 0.14 },
    ];

    const frame = () => {
      // Encerra sozinho quando a tela de login sai do DOM (troca de rota)
      if (!document.body.contains(canvas)) {
        window.removeEventListener('resize', resize);
        return;
      }
      const t = performance.now() / 1000;
      const diag = Math.hypot(W, H) || 1;

      // Cursor e "puxão" suavizados — atraso longo = movimento fluido, uma coisa só
      pointer.ex += (pointer.x - pointer.ex) * 0.05;
      pointer.ey += (pointer.y - pointer.ey) * 0.05;
      pointer.influence += ((pointer.act ? 1 : 0) - pointer.influence) * 0.04;

      const px = pointer.ex * W, py = pointer.ey * H;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // Correntes ambientes — cada uma inclina levemente em direção ao cursor,
      // então o campo inteiro se curva para o ponteiro como um líquido só.
      for (const b of CURRENTS) {
        const baseX = (b.ox + Math.sin(t * b.fx * 6.283 + b.px) * b.ax) * W;
        const baseY = (b.oy + Math.cos(t * b.fy * 6.283 + b.py) * b.ay) * H;
        const cx = baseX + (px - baseX) * 0.14 * pointer.influence;
        const cy = baseY + (py - baseY) * 0.14 * pointer.influence;
        const rad = b.r * diag * (1 + Math.sin(t * b.rf * 6.283 + b.rp) * 0.10);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${b.c},${b.a})`);
        g.addColorStop(1, 'rgba(16,18,22,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Uma única ondulação suave que segue o cursor (funde-se com as correntes)
      if (pointer.influence > 0.01) {
        const swell = diag * 0.34 * (1 + Math.sin(t * 1.2) * 0.06);
        const g = ctx.createRadialGradient(px, py, 0, px, py, swell);
        g.addColorStop(0, `rgba(143,188,240,${0.14 * pointer.influence})`);
        g.addColorStop(0.5, `rgba(46,109,180,${0.06 * pointer.influence})`);
        g.addColorStop(1, 'rgba(16,18,22,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  // ── Navegação entre views ──
  showView(view) {
    this.view = view;
    ['login', 'type', 'register'].forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.style.display = v === view ? '' : 'none';
    });
    const errorDiv = document.getElementById('auth-error-msg');
    if (errorDiv) errorDiv.style.display = 'none';

    const q = document.getElementById('auth-switch-q');
    const a = document.getElementById('auth-switch-a');
    if (view === 'login') {
      q.textContent = 'Não tem uma conta?';
      a.textContent = 'Cadastre-se';
    } else {
      q.textContent = 'Já tem uma conta?';
      a.textContent = 'Voltar para o login';
    }
  },

  toggleModo() {
    this.showView(this.view === 'login' ? 'type' : 'login');
  },

  togglePw(el) {
    const input = el.parentElement.querySelector('input');
    if (input.type === 'password') {
      input.type = 'text';
      el.innerHTML = this.eyeOffIcon;
    } else {
      input.type = 'password';
      el.innerHTML = this.eyeIcon;
    }
  },

  selectType(type) {
    this.registerType = type;
    const pf = document.getElementById('type-card-pf');
    const pj = document.getElementById('type-card-pj');
    if (pf) pf.classList.toggle('selected', type === 'pf');
    if (pj) pj.classList.toggle('selected', type === 'pj');
  },

  goToDados() {
    const pf = this.registerType === 'pf';

    const pfFields = pf ? `
      <label class="auth-label">
        <span>NACIONALIDADE</span>
        <select class="auth-select" id="reg-nac">
          <option value="brasileiro(a)">Brasileiro(a)</option>
          <option value="estrangeiro(a)">Estrangeiro(a)</option>
        </select>
      </label>
      <label class="auth-label">
        <span>ESTADO CIVIL</span>
        <select class="auth-select" id="reg-est-civil">
          <option value="">Selecione...</option>
          <option value="solteiro(a)">Solteiro(a)</option>
          <option value="casado(a)">Casado(a)</option>
          <option value="divorciado(a)">Divorciado(a)</option>
          <option value="viúvo(a)">Viúvo(a)</option>
          <option value="separado(a) judicialmente">Separado(a) judicialmente</option>
          <option value="em união estável">União Estável</option>
        </select>
      </label>
      <label class="auth-label">
        <span>RG (OPCIONAL)</span>
        <input class="auth-input" id="reg-rg" placeholder="00.000.000-0">
      </label>` : '';

    document.getElementById('view-register').innerHTML = `
      <h2 class="auth-h2">Criar nova conta</h2>
      <p class="auth-sub">Preencha seus dados para finalizar o cadastro.</p>
      <form onsubmit="AuthUI.handleRegister(event)">
        <div class="auth-grid">
          <label class="auth-label full">
            <span>${pf ? 'NOME COMPLETO' : 'RAZÃO SOCIAL'}</span>
            <input class="auth-input" id="reg-nome" required placeholder="${pf ? 'Seu nome completo' : 'Nome da empresa'}">
          </label>
          <label class="auth-label">
            <span>E-MAIL</span>
            <input type="email" class="auth-input" id="reg-email" required placeholder="voce@email.com">
          </label>
          ${this.pwField('reg-password', true)}
          <label class="auth-label">
            <span>${pf ? 'CPF' : 'CNPJ'}</span>
            <input class="auth-input" id="reg-doc" data-mask="cpfcnpj" required placeholder="${pf ? '000.000.000-00' : '00.000.000/0000-00'}">
          </label>
          ${pfFields}
        </div>
        <label class="auth-accept">
          <input type="checkbox" id="reg-termos" required>
          <span>Li e aceito os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso e a Política de Privacidade</a>.</span>
        </label>
        <button type="submit" class="auth-btn" id="reg-btn" style="margin-top: 14px;">Criar Conta</button>
      </form>
      <button class="auth-back" onclick="AuthUI.showView('type')">← Trocar tipo de locador</button>
    `;

    this.showView('register');
    Utils.applyMask(document.getElementById('reg-doc'), 'cpfcnpj');
  },

  // ── Helper de mensagens ──
  _showError(msg, isSuccess) {
    const errorDiv = document.getElementById('auth-error-msg');
    if (isSuccess) {
      errorDiv.style.background = 'rgba(46,125,82,0.10)';
      errorDiv.style.color = '#1f6b43';
      errorDiv.style.borderColor = 'rgba(46,125,82,0.28)';
    } else {
      errorDiv.style.background = 'rgba(220,53,69,0.08)';
      errorDiv.style.color = '#b3261e';
      errorDiv.style.borderColor = 'rgba(220,53,69,0.25)';
    }
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
  },

  // ── Login ──
  handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');

    document.getElementById('auth-error-msg').style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Aguarde...';

    Api.entrar(email, password)
      .catch((error) => {
        console.error(error);
        this._showError(this.translateError(error.message));
        btn.disabled = false;
        btn.textContent = 'Acessar Painel';
      });
  },

  // ── Cadastro ──
  handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('reg-btn');
    const pj = this.registerType === 'pj';

    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const profile = {
      tipo_locador: pj ? 'pj' : 'pf',
      nome_locador: document.getElementById('reg-nome').value.trim(),
      nac_locador: pj ? '' : document.getElementById('reg-nac').value,
      est_civil_locador: pj ? '' : document.getElementById('reg-est-civil').value,
      rg_locador: pj ? '' : document.getElementById('reg-rg').value.trim(),
      doc_locador: document.getElementById('reg-doc').value.trim(),
      // Evidência do aceite dos Termos de Uso/Política de Privacidade no cadastro
      termos_aceite: { versao: '2026-07-21', em: new Date().toISOString() }
    };

    document.getElementById('auth-error-msg').style.display = 'none';

    if (!profile.nome_locador || !profile.doc_locador) {
      this._showError('Preencha o nome e o ' + (pj ? 'CNPJ' : 'CPF') + ' do locador.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Aguarde...';

    // Guarda o perfil ANTES de registrar. Neste instante ainda nao ha sessao,
    // entao saveAdminProfile o deixa no rascunho local, e o _flushPendingProfile
    // o sobe no comeco da carga que vem logo depois.
    //
    // Salvar depois seria a ordem intuitiva e estaria errado: o registrar abre a
    // sessao, o que dispara loadCloudData, que le o perfil do servidor (vazio,
    // conta nova) e sobrescreve o cache. O perfil recem-digitado sumiria numa
    // corrida que so aparece as vezes.
    Storage.saveAdminProfile(profile);

    Api.registrar(email, password)
      .catch((error) => {
        // O registro falhou, entao o rascunho acima nao pode sobrar: o proximo
        // login neste navegador — que pode ser de OUTRA conta — o adotaria como
        // perfil dela. Reenviar o formulario grava de novo.
        localStorage.removeItem(Storage.PENDING_PROFILE_KEY);
        console.error(error);
        this._showError(this.translateError(error.message));
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
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
    if (msg.includes('Password should') || /weak.?password/i.test(msg)) {
      return 'Senha fraca. Use no mínimo 8 caracteres, com letra maiúscula, minúscula, número e símbolo.';
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
      return 'Link inválido ou expirado.';
    }

    return msg; // Retorna mensagem nativa se não mapeada
  },

  logout() {
    // Sem reload: o Api.sair avisa os ouvintes e o App re-renderiza sozinho.
    // O reload existia porque era o jeito de zerar o estado do SDK da Supabase.
    Api.sair()
      .then(() => { window.location.hash = '#'; })
      .catch(err => console.error('Erro ao deslogar:', err));
  }
};
