// ═══════════════════════════════════════════════════════
// Api — conversa com o backend em /api.
//
// Substitui o `supabaseClient`. NÃO imita a interface dele: não há
// `.from().select().eq()` aqui. Um shim com aquele formato daria o menor diff
// possível e seria a pior escolha — quem lesse o código depois iria procurar
// uma Supabase que não existe mais. O nome tem que dizer para onde a chamada
// vai.
//
// A sessão viaja em cookie httpOnly, então não há token para guardar nem para
// mandar: `credentials: 'same-origin'` faz o navegador cuidar disso. É também
// o motivo de um XSS não conseguir roubar a sessão — o JS não a alcança.
// ═══════════════════════════════════════════════════════

const Api = {
  // Usuário da sessão, ou null. Espelha o que era `session.user`.
  usuario: null,

  _ouvintes: [],

  // ── Transporte ────────────────────────────────────────────────────────
  async _req(metodo, caminho, corpo) {
    let r;
    try {
      r = await fetch('/api/' + caminho, {
        method: metodo,
        headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
      });
    } catch (e) {
      // Falha de rede é diferente de recusa do servidor, e quem chama precisa
      // distinguir: o editor descarta o link do inquilino quando o servidor o
      // recusa, e não pode descartar um link vivo só porque a conexão caiu.
      const erro = new Error('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.');
      erro.transporte = true;
      throw erro;
    }

    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }

    if (!r.ok) {
      const erro = new Error((dados && dados.erro) || ('Erro ' + r.status));
      erro.status = r.status;
      throw erro;
    }
    return dados;
  },

  // ── CRUD dos recursos ─────────────────────────────────────────────────
  list(recurso) { return this._req('GET', recurso); },
  save(recurso, item) { return this._req('PUT', recurso + '/' + encodeURIComponent(item.id), item); },
  remove(recurso, id) { return this._req('DELETE', recurso + '/' + encodeURIComponent(id)); },

  // ── Perfil ────────────────────────────────────────────────────────────
  lerPerfil() { return this._req('GET', 'perfil'); },
  gravarPerfil(dados) { return this._req('PUT', 'perfil', dados); },

  // ── Link do inquilino ─────────────────────────────────────────────────
  criarLink(id, payload, keyProof) {
    return this._req('POST', 'links', { id, payload, key_proof: keyProof });
  },
  lerLink(id) { return this._req('GET', 'links/' + encodeURIComponent(id)); },
  lerEvidencia(id) { return this._req('GET', 'links/' + encodeURIComponent(id) + '/evidencia'); },
  gravarLink(id, payload, keyProof, finalizar) {
    return this._req('PUT', 'links/' + encodeURIComponent(id),
      { payload, key_proof: keyProof, finalize: !!finalizar });
  },

  // ── Administração ─────────────────────────────────────────────────────
  adminContratos() { return this._req('GET', 'admin/contracts'); },
  adminPerfis() { return this._req('GET', 'admin/profiles'); },
  adminUsuarios() { return this._req('GET', 'admin/users'); },

  // ── Sessão ────────────────────────────────────────────────────────────
  //
  // `aoMudarSessao` ocupa o lugar de `auth.onAuthStateChange`. A diferença de
  // fundo: a Supabase reemitia sozinha (refresh de token ~1x/h, refoco de aba)
  // e o app.js tinha de filtrar repetição. Aqui só emite quando algo muda de
  // verdade, porque só emitimos nós.
  // Nao dispara na hora: quem dispara a primeira vez e o carregarSessao, depois
  // de perguntar ao servidor. Chamar aqui faria a tela de login aparecer por um
  // instante para quem ja esta logado, so porque a resposta ainda nao chegou.
  aoMudarSessao(fn) {
    this._ouvintes.push(fn);
  },

  _emitir() {
    this._ouvintes.forEach(fn => {
      try { fn(this.usuario); } catch (e) { console.error(e); }
    });
  },

  async carregarSessao() {
    try {
      const r = await this._req('GET', 'auth/sessao');
      this.usuario = (r && r.user) || null;
    } catch {
      // Servidor fora do ar no boot: trata como deslogado (fail-closed) em vez
      // de abrir o painel sem saber quem é.
      this.usuario = null;
    }
    this._emitir();
    return this.usuario;
  },

  async entrar(email, senha) {
    const r = await this._req('POST', 'auth/entrar', { email, senha });
    this.usuario = r.user;
    this._emitir();
    return r.user;
  },

  async registrar(email, senha) {
    const r = await this._req('POST', 'auth/registrar', { email, senha });
    this.usuario = r.user;
    this._emitir();
    return r.user;
  },

  async sair() {
    try { await this._req('POST', 'auth/sair'); } finally {
      this.usuario = null;
      this._emitir();
    }
  },

  trocarSenha(senha) { return this._req('PUT', 'auth/senha', { senha }); },
  excluirConta(senha) { return this._req('DELETE', 'auth/conta', { senha }); }
};
