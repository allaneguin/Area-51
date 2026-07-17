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
        <span class="mark">M</span> Meus Imóveis
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

  pwField(id) {
    return `
      <label class="auth-label">
        <span>SENHA</span>
        <div class="auth-pw-wrap">
          <input type="password" id="${id}" class="auth-input" required minlength="6" placeholder="Mín. 6 caracteres">
          <span class="auth-pw-toggle" onclick="AuthUI.togglePw(this)">${this.eyeIcon}</span>
        </div>
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
                  <a class="auth-link" onclick="AuthUI.forgotPassword(event)">Esqueci minha senha</a>
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
                  <span class="ico">👤</span>
                  <div class="tt">Pessoa Física</div>
                  <div class="st">CPF</div>
                </div>
                <div class="auth-type-card" id="type-card-pj" onclick="AuthUI.selectType('pj')">
                  <span class="ico">◫</span>
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
      ${this.styles}
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

  styles: `
    <style>
      .auth-screen {
        position: fixed; inset: 0; z-index: 40;
        display: flex; overflow-y: auto;
        background: #101216; color: #E9E7E2;
        font-family: 'Schibsted Grotesk', -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
        /* anula o max-width:720px + margin:auto herdados da regra tenant-mode do #main-content */
        max-width: none !important; margin: 0 !important;
      }
      .auth-screen * { box-sizing: border-box; }

      /* ── Painel de marca ── */
      .auth-brand {
        flex: 1; min-width: 0; position: relative; overflow: hidden;
        display: flex; flex-direction: column; justify-content: space-between;
        padding: 48px 56px;
      }
      .auth-brand-glow {
        position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(800px 500px at 20% 110%, rgba(46,109,180,0.22), transparent 65%),
                    radial-gradient(600px 400px at 90% -10%, rgba(46,109,180,0.10), transparent 60%);
      }
      .auth-brand-canvas {
        position: absolute; inset: 0; width: 100%; height: 100%;
        z-index: 0; pointer-events: none;
      }
      .auth-brand-grid {
        position: absolute; inset: 0; pointer-events: none; opacity: 0.3; z-index: 1;
        background-image: linear-gradient(rgba(233,231,226,0.045) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(233,231,226,0.045) 1px, transparent 1px);
        background-size: 56px 56px;
        -webkit-mask-image: radial-gradient(ellipse 90% 70% at 30% 100%, black, transparent);
        mask-image: radial-gradient(ellipse 90% 70% at 30% 100%, black, transparent);
      }
      .auth-brand-logo {
        position: relative; z-index: 2; display: flex; align-items: center; gap: 10px;
        color: #E9E7E2; font-weight: 700; font-size: 17px; letter-spacing: -0.02em; width: fit-content;
      }
      .auth-brand-logo .mark {
        width: 30px; height: 30px; border-radius: 8px;
        background: linear-gradient(135deg, #2E6DB4, #143A66);
        display: grid; place-items: center; color: #F0F6FF; font-size: 15px; font-weight: 800;
      }
      .auth-brand-headline { position: relative; z-index: 2; max-width: 440px; }
      .auth-brand-headline h1 {
        font-size: clamp(30px, 3.6vw, 46px); line-height: 1.08; letter-spacing: -0.03em;
        font-weight: 800; margin: 0; color: #F4F2EE;
      }
      .auth-brand-headline em {
        font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; color: #8FBCF0;
      }
      .auth-bullets { display: flex; flex-direction: column; gap: 14px; margin-top: 28px; }
      .auth-bullet { display: flex; align-items: center; gap: 12px; font-size: 15px; color: #A8AEB8; }
      .auth-bullet .tick {
        width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px;
        background: rgba(46,109,180,0.18); color: #8FBCF0; display: grid; place-items: center; font-size: 13px;
      }
      .auth-brand-foot { position: relative; z-index: 2; font-size: 13px; color: #6E7480; }

      /* ── Painel do formulário ── */
      .auth-form-panel {
        width: min(520px, 100%); flex-shrink: 0;
        background: #F5F7FA; color: #16181D;
        display: flex; align-items: center; justify-content: center; padding: 48px 40px;
      }
      .auth-form-inner { width: 100%; max-width: 360px; animation: authFade 0.4s both; }
      @keyframes authFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

      .auth-h2 { font-size: 28px; font-weight: 800; letter-spacing: -0.03em; margin: 0; color: #16181D; }
      .auth-sub { font-size: 14.5px; color: #5C6470; margin: 8px 0 0; }

      .auth-fields { display: flex; flex-direction: column; gap: 16px; margin-top: 28px; }
      .auth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 28px; }
      .auth-grid .full { grid-column: 1 / -1; }

      .auth-label { display: flex; flex-direction: column; gap: 6px; }
      .auth-label > span { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: #8A92A0; }
      .auth-label .hint { color: #2E7D52; font-weight: 600; letter-spacing: 0; }
      .auth-input, .auth-select {
        width: 100%; border: 1px solid #DDE3EC; border-radius: 10px; padding: 13px 14px;
        font-size: 14.5px; color: #16181D; background: #FFFFFF; font-family: inherit;
      }
      .auth-input:focus, .auth-select:focus { outline: 2px solid #2E6DB4; outline-offset: -1px; }
      .auth-pw-wrap { position: relative; }
      .auth-pw-wrap .auth-input { padding-right: 44px; }
      .auth-pw-toggle {
        cursor: pointer; position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        color: #8A92A0; display: grid; place-items: center;
      }
      .auth-pw-toggle:hover { color: #1C4E89; }

      .auth-btn {
        display: block; width: 100%; text-align: center; border: none; cursor: pointer;
        background: linear-gradient(180deg, #2F71BC, #1C4E89); color: #F0F6FF;
        font-size: 15px; font-weight: 700; padding: 14px; border-radius: 12px; font-family: inherit;
        box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 8px 20px rgba(28,78,137,0.25);
        transition: all 0.2s;
      }
      .auth-btn:hover { background: linear-gradient(180deg, #3A7DC9, #2560A3); color: #FFFFFF; transform: translateY(-1px); }
      .auth-btn:disabled { opacity: 0.65; cursor: default; transform: none; }

      .auth-forgot { display: flex; justify-content: flex-end; margin-top: 12px; }
      .auth-link { font-size: 13px; font-weight: 600; color: #1C4E89; cursor: pointer; }
      .auth-link:hover { color: #174173; }

      .auth-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 28px; }
      .auth-type-card {
        cursor: pointer; border: 2px solid #E3E8EF; background: #FFFFFF; border-radius: 14px;
        padding: 24px 16px; text-align: center; transition: all 0.15s;
      }
      .auth-type-card:hover { border-color: #2E6DB4; }
      .auth-type-card.selected { border-color: #2E6DB4; background: #F6F9FD; }
      .auth-type-card .ico {
        width: 46px; height: 46px; margin: 0 auto; border-radius: 13px;
        background: #EAF1F9; color: #1C4E89; display: grid; place-items: center; font-size: 21px;
      }
      .auth-type-card .tt { font-size: 15.5px; font-weight: 700; color: #16181D; margin-top: 12px; }
      .auth-type-card .st { font-size: 12.5px; font-weight: 600; color: #8A92A0; margin-top: 3px; }

      .auth-back {
        cursor: pointer; text-align: center; margin-top: 16px; width: 100%;
        font-size: 13.5px; font-weight: 600; color: #1C4E89; background: none; border: none; font-family: inherit;
      }
      .auth-back:hover { color: #174173; }

      .auth-divider { display: flex; align-items: center; gap: 14px; margin-top: 26px; }
      .auth-divider .line { flex: 1; height: 1px; background: #E3E8EF; }
      .auth-divider .or { font-size: 12px; font-weight: 600; color: #8A92A0; }
      .auth-switch { cursor: pointer; text-align: center; margin-top: 22px; font-size: 14px; color: #5C6470; }
      .auth-switch b { font-weight: 700; color: #1C4E89; }

      .auth-error {
        padding: 11px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.4;
        margin-bottom: 18px; border: 1px solid; text-align: left;
        background: rgba(220,53,69,0.08); color: #b3261e; border-color: rgba(220,53,69,0.25);
      }

      /* ── Responsivo: some com o painel de marca em telas estreitas ── */
      @media (max-width: 820px) {
        .auth-brand { display: none; }
        .auth-form-panel { width: 100%; }
      }
    </style>
  `,

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
          ${this.pwField('reg-password')}
          <label class="auth-label">
            <span>${pf ? 'CPF' : 'CNPJ'} <span class="hint">· máscara automática</span></span>
            <input class="auth-input" id="reg-doc" data-mask="cpfcnpj" required placeholder="${pf ? '000.000.000-00' : '00.000.000/0000-00'}">
          </label>
          ${pfFields}
        </div>
        <button type="submit" class="auth-btn" id="reg-btn" style="margin-top: 22px;">Criar Conta</button>
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

    supabaseClient.auth.signInWithPassword({ email, password })
      .then(({ error }) => {
        if (error) throw error;
      })
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
      doc_locador: document.getElementById('reg-doc').value.trim()
    };

    document.getElementById('auth-error-msg').style.display = 'none';

    if (!profile.nome_locador || !profile.doc_locador) {
      this._showError('Preencha o nome e o ' + (pj ? 'CNPJ' : 'CPF') + ' do locador.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Aguarde...';

    supabaseClient.auth.signUp({ email, password })
      .then(({ data, error }) => {
        if (error) throw error;

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          // Supabase retorna "sucesso" sem identities quando o e-mail já existe
          throw new Error('already registered');
        }

        // Guarda os dados do locador; sobem para a nuvem no primeiro login
        Storage.saveAdminProfile(profile);

        if (data.user && !data.session) {
          // Confirmação de e-mail ligada: mostra aviso e volta ao login
          this.showView('login');
          this._showError('Cadastro realizado! Um e-mail de confirmação foi enviado. Confirme-o antes de entrar.', true);
          document.getElementById('login-email').value = email;
        }
        // Com autoconfirmação, data.session existe → onAuthStateChange faz o login automático.
      })
      .catch((error) => {
        console.error(error);
        this._showError(this.translateError(error.message));
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
      });
  },

  forgotPassword(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value.trim();

    if (!email) {
      this._showError('Digite seu e-mail no campo acima e clique novamente em "Esqueci minha senha".');
      return;
    }

    supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    }).then(({ error }) => {
      if (error) throw error;
      this._showError('Link de redefinição enviado para ' + email + '. Abra o e-mail e clique no link para criar uma nova senha.', true);
    }).catch((error) => {
      console.error(error);
      this._showError(this.translateError(error.message));
    });
  },

  // Tela exibida quando o usuário volta pelo link de redefinição do e-mail
  renderNewPassword(container) {
    container.innerHTML = `
      <div class="auth-screen">
        ${this.brandPanel}
        <div class="auth-form-panel">
          <div class="auth-form-inner">
            <h2 class="auth-h2">Criar nova senha</h2>
            <p class="auth-sub">Digite a nova senha de acesso da sua conta.</p>

            <div id="auth-error-msg" class="auth-error" style="display: none;"></div>

            <form onsubmit="AuthUI.submitNewPassword(event)">
              <div class="auth-fields">
                ${this.pwField('new-password')}
              </div>
              <button type="submit" class="auth-btn" id="new-password-btn" style="margin-top: 20px;">Salvar Nova Senha</button>
            </form>
            <button class="auth-back" onclick="AuthUI.cancelRecovery(event)">Cancelar</button>
          </div>
        </div>
      </div>
      ${this.styles}
    `;
    this._initWater();
  },

  submitNewPassword(e) {
    e.preventDefault();
    const pwd = document.getElementById('new-password').value;
    const btn = document.getElementById('new-password-btn');

    document.getElementById('auth-error-msg').style.display = 'none';
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
        this._showError(this.translateError(error.message));
        btn.disabled = false;
        btn.textContent = 'Salvar Nova Senha';
      });
  },

  cancelRecovery(e) {
    if (e) e.preventDefault();
    App.passwordRecovery = false;
    window.location.hash = '#dashboard';
    App.handleRoute();
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
