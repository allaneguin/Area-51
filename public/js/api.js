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

  // Detecta se esta rodando em ambiente puramente estatico (como GitHub Pages)
  _isStatic() {
    if (typeof window === 'undefined') return false;
    return !!(
      (window.location && window.location.hostname.endsWith('github.io')) ||
      (window.location && window.location.protocol === 'file:') ||
      (window.location && window.location.search && window.location.search.includes('demo=1')) ||
      window.__DEMO_MODE__ === true
    );
  },

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
  list(recurso) {
    if (this._isStatic()) {
      try {
        const d = localStorage.getItem('mi_recurso_' + recurso);
        if (d) return Promise.resolve(JSON.parse(d));
        if (recurso === 'contracts') {
          const mock = [{
            id: 'demo_c1',
            title: 'Contrato Residencial — Apto 101',
            template_id: 'residencial-padrao',
            status: 'Ativo',
            fields: {
              locador_nome: 'Theo Carvalho',
              locatario_nome: 'Carlos Eduardo Souza',
              imovel_endereco: 'Av. Paulista, 1000, Apto 101, Bela Vista - São Paulo/SP',
              valor_aluguel: 'R$ 3.500,00',
              prazo_meses: '30',
              data_inicio: new Date().toISOString().slice(0, 10)
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }];
          localStorage.setItem('mi_recurso_contracts', JSON.stringify(mock));
          return Promise.resolve(mock);
        }
        return Promise.resolve([]);
      } catch {
        return Promise.resolve([]);
      }
    }
    return this._req('GET', recurso);
  },

  save(recurso, item) {
    if (this._isStatic()) {
      try {
        const k = 'mi_recurso_' + recurso;
        const d = localStorage.getItem(k);
        let lista = d ? JSON.parse(d) : [];
        const idx = lista.findIndex(x => String(x.id) === String(item.id));
        if (idx >= 0) {
          lista[idx] = { ...lista[idx], ...item, updated_at: new Date().toISOString() };
        } else {
          lista.push({ ...item, id: item.id || ('id_' + Date.now()), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        localStorage.setItem(k, JSON.stringify(lista));
      } catch (e) {
        console.error(e);
      }
      return Promise.resolve(item);
    }
    return this._req('PUT', recurso + '/' + encodeURIComponent(item.id), item);
  },

  remove(recurso, id) {
    if (this._isStatic()) {
      try {
        const k = 'mi_recurso_' + recurso;
        const d = localStorage.getItem(k);
        let lista = d ? JSON.parse(d) : [];
        lista = lista.filter(x => String(x.id) !== String(id));
        localStorage.setItem(k, JSON.stringify(lista));
      } catch (e) {
        console.error(e);
      }
      return Promise.resolve({ ok: true });
    }
    return this._req('DELETE', recurso + '/' + encodeURIComponent(id));
  },

  // ── Perfil ────────────────────────────────────────────────────────────
  lerPerfil() {
    if (this._isStatic()) {
      try {
        const p = localStorage.getItem('mi_perfil');
        if (p) return Promise.resolve(JSON.parse(p));
        return Promise.resolve({
          nome_locador: 'Theo Carvalho',
          tipo_locador: 'pf',
          cpf_locador: '123.456.789-00',
          email_locador: 'contato@meusimoveis.com.br',
          cidade_locador: 'São Paulo',
          estado_locador: 'SP'
        });
      } catch {
        return Promise.resolve({ nome_locador: 'Theo Carvalho' });
      }
    }
    return this._req('GET', 'perfil');
  },

  gravarPerfil(dados) {
    if (this._isStatic()) {
      try { localStorage.setItem('mi_perfil', JSON.stringify(dados)); } catch {}
      return Promise.resolve(dados);
    }
    return this._req('PUT', 'perfil', dados);
  },

  // ── Link do inquilino ─────────────────────────────────────────────────
  criarLink(id, payload, keyProof) {
    if (this._isStatic()) {
      try {
        localStorage.setItem('mi_link_' + id, JSON.stringify({
          id,
          payload,
          key_proof: keyProof,
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
        }));
      } catch {}
      return Promise.resolve({ id, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    }
    return this._req('POST', 'links', { id, payload, key_proof: keyProof });
  },
  lerLink(id) {
    if (this._isStatic()) {
      try {
        const l = localStorage.getItem('mi_link_' + id);
        if (l) return Promise.resolve(JSON.parse(l));
      } catch {}
      return Promise.reject(new Error('Link não encontrado ou expirado.'));
    }
    return this._req('GET', 'links/' + encodeURIComponent(id));
  },
  lerEvidencia(id) {
    if (this._isStatic()) {
      return Promise.resolve({
        server_timestamp: new Date().toISOString(),
        server_ip: '127.0.0.1'
      });
    }
    return this._req('GET', 'links/' + encodeURIComponent(id) + '/evidencia');
  },
  gravarLink(id, payload, keyProof, finalizar) {
    if (this._isStatic()) {
      try {
        localStorage.setItem('mi_link_' + id, JSON.stringify({
          id,
          payload,
          key_proof: keyProof,
          finalized: !!finalizar
        }));
      } catch {}
      return Promise.resolve({ ok: true });
    }
    return this._req('PUT', 'links/' + encodeURIComponent(id),
      { payload, key_proof: keyProof, finalize: !!finalizar });
  },

  // ── Mídia da vistoria ─────────────────────────────────────────────────
  // O upload NÃO passa por `_req`: o corpo é o arquivo cru, não JSON, e o
  // Content-Type é o do próprio arquivo — é assim que a rota dispensa multipart.
  listarMidias(vistoriaId) {
    if (this._isStatic()) return Promise.resolve([]);
    return this._req('GET', 'midias?vistoria=' + encodeURIComponent(vistoriaId));
  },

  removerMidia(id) {
    if (this._isStatic()) return Promise.resolve({ ok: true });
    return this._req('DELETE', 'midias/' + encodeURIComponent(id));
  },

  reindexarMidias(vistoriaId, removido) {
    if (this._isStatic()) return Promise.resolve({ ok: true });
    return this._req('POST', 'midias/reindexar', { vistoria: vistoriaId, removido: removido });
  },

  // ── Foto do imóvel ────────────────────────────────────────────────────
  // Sem filtro por imóvel: a tela de imóveis desenha todos os cartões de uma
  // vez. `removerMidia` acima serve as duas — a rota de exclusão é a mesma.
  listarMidiasImovel() {
    if (this._isStatic()) return Promise.resolve([]);
    return this._req('GET', 'midias/imovel');
  },

  definirCapaImovel(midiaId) {
    if (this._isStatic()) return Promise.resolve({ ok: true });
    return this._req('POST', 'midias/imovel/' + encodeURIComponent(midiaId) + '/capa');
  },

  enviarMidiaImovel(imovelId, arquivo) {
    if (this._isStatic()) {
      return Promise.resolve({
        id: 'midia_' + Date.now(),
        imovel_id: imovelId,
        url: typeof URL !== 'undefined' ? URL.createObjectURL(arquivo) : '',
        tipo: 'foto'
      });
    }
    return this._upload('/api/midias/imovel?imovel=' + encodeURIComponent(imovelId), arquivo);
  },

  enviarMidia(vistoriaId, ambiente, tipo, arquivo) {
    if (this._isStatic()) {
      return Promise.resolve({
        id: 'midia_' + Date.now(),
        vistoria_id: vistoriaId,
        ambiente,
        tipo,
        url: typeof URL !== 'undefined' ? URL.createObjectURL(arquivo) : ''
      });
    }
    return this._upload(
      `/api/midias?vistoria=${encodeURIComponent(vistoriaId)}&ambiente=${ambiente}&tipo=${tipo}`,
      arquivo);
  },

  // O corpo é o arquivo cru e o Content-Type é o dele — vale para a vistoria e
  // para o imóvel, então mora num lugar só.
  async _upload(url, arquivo) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': arquivo.type },
        body: arquivo
      });
    } catch (e) {
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

  // ── Administração ─────────────────────────────────────────────────────
  adminContratos() {
    if (this._isStatic()) return Promise.resolve([]);
    return this._req('GET', 'admin/contracts');
  },
  adminPerfis() {
    if (this._isStatic()) return Promise.resolve([]);
    return this._req('GET', 'admin/profiles');
  },
  adminUsuarios() {
    if (this._isStatic()) return Promise.resolve([]);
    return this._req('GET', 'admin/users');
  },

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
    if (this._isStatic()) {
      try {
        const s = localStorage.getItem('mi_sessao_estatica');
        this.usuario = s ? JSON.parse(s) : {
          id: 'usr_demo_1',
          email: 'demo@meusimoveis.com.br',
          is_admin: true
        };
      } catch {
        this.usuario = { id: 'usr_demo_1', email: 'demo@meusimoveis.com.br', is_admin: true };
      }
      this._emitir();
      return this.usuario;
    }
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
    if (this._isStatic()) {
      const u = { id: 'usr_' + Date.now(), email: email || 'locador@exemplo.com', is_admin: true };
      try { localStorage.setItem('mi_sessao_estatica', JSON.stringify(u)); } catch {}
      this.usuario = u;
      this._emitir();
      return u;
    }
    const r = await this._req('POST', 'auth/entrar', { email, senha });
    this.usuario = r.user;
    this._emitir();
    return r.user;
  },

  async registrar(email, senha) {
    if (this._isStatic()) {
      const u = { id: 'usr_' + Date.now(), email: email || 'locador@exemplo.com', is_admin: true };
      try { localStorage.setItem('mi_sessao_estatica', JSON.stringify(u)); } catch {}
      this.usuario = u;
      this._emitir();
      return u;
    }
    const r = await this._req('POST', 'auth/registrar', { email, senha });
    this.usuario = r.user;
    this._emitir();
    return r.user;
  },

  async sair() {
    if (this._isStatic()) {
      try { localStorage.removeItem('mi_sessao_estatica'); } catch {}
      this.usuario = null;
      this._emitir();
      return;
    }
    try { await this._req('POST', 'auth/sair'); } finally {
      this.usuario = null;
      this._emitir();
    }
  },

  trocarSenha(senha) {
    if (this._isStatic()) return Promise.resolve({ ok: true });
    return this._req('PUT', 'auth/senha', { senha });
  },

  excluirConta(senha) {
    if (this._isStatic()) {
      try { localStorage.clear(); } catch {}
      this.usuario = null;
      this._emitir();
      return Promise.resolve({ ok: true });
    }
    return this._req('DELETE', 'auth/conta', { senha });
  }
};
