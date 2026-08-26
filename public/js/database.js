// ═══════════════════════════════════════════════════════
// Cloud Database & Encryption Module (AES-GCM client-side)
// ═══════════════════════════════════════════════════════

const CloudDB = {
  // Import raw 256-bit key (32 bytes) from key string
  async _importKey(keyString) {
    const enc = new TextEncoder();
    let rawKey = enc.encode(keyString);
    // Pad or truncate rawKey to 32 bytes
    if (rawKey.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(rawKey);
      rawKey = padded;
    } else if (rawKey.length > 32) {
      rawKey = rawKey.slice(0, 32);
    }
    return window.crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  },

  _uint8ToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  },

  _base64ToUint8(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  // ── Sanitização de fronteira ────────────────────────────────────────────
  // O payload do link é montado por quem tem a chave — inclusive o inquilino —
  // e volta para dentro da sessão logada do locador. Vários pontos de exibição
  // jogam esses campos em innerHTML (assinaturas, selfie), e a CSP não pode
  // servir de rede: o app depende de ~85 handlers inline, então 'unsafe-inline'
  // continua ligado. Por isso a validação acontece aqui, na única porta de
  // entrada, e não em cada tela — uma tela esquecida seria a brecha inteira.

  _sanitizeValue(v) {
    if (typeof v !== 'string') return v;
    // Só entra na peneira o que se apresenta como data: — texto comum passa livre.
    if (!/^\s*data:/i.test(v)) return v;
    // Regra única, definida em Utils e compartilhada com Utils.imgSeguro:
    // duas cópias do mesmo regex divergiriam na primeira manutenção.
    return Utils.IMG_DATA_URL_OK.test(v) ? v : '';
  },

  _sanitizeDeep(node, depth = 0, vistos = null) {
    if (node === null || typeof node !== 'object') return;
    if (depth > 12) return;
    vistos = vistos || new Set();
    if (vistos.has(node)) return; // payload com ciclo não pode travar o carregamento
    vistos.add(node);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') node[k] = this._sanitizeValue(v);
      else if (v !== null && typeof v === 'object') this._sanitizeDeep(v, depth + 1, vistos);
    }
  },

  // Encrypt JSON object to URL-safe base64 string
  async encrypt(data, keyString) {
    const text = JSON.stringify(data);
    const enc = new TextEncoder();
    const key = await this._importKey(keyString);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(text)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convert to URL-safe base64 sem estouro de pilha (chunking)
    return this._uint8ToBase64(combined)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  // Decrypt URL-safe base64 string to JSON object
  async decrypt(cipherTextBase64, keyString) {
    let base64 = cipherTextBase64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const combined = this._base64ToUint8(base64);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await this._importKey(keyString);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    // Passa a peneira antes de qualquer tela ver o dado.
    this._sanitizeDeep(payload);
    return payload;
  },

  // Generate a random 16 character alphanumeric secret key (CSPRNG)
  generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    let key = '';
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(bytes[i] % chars.length);
    }
    return key;
  },

  // ID aleatório (não-enumerável) para o link — sempre via CSPRNG (getRandomValues/randomUUID)
  _randomId() {
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    // Fallback (contexto não-seguro / Safari antigo): mantém o formato UUID.
    // A coluna tenant_links.id é TEXT, mas contracts.cloud_id é uuid — é o
    // cloud_id que exige o formato válido (ver supabase/migrations/001).
    const b = window.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // versão 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  },

  // Prova de posse da chave (migration 003). Mandamos SHA-256(chave) em hex; o
  // servidor guarda SHA-256 disso. Ele nunca aprende a chave — a propriedade
  // que sustenta o modelo (a tabela sozinha não decifra nada) continua de pé —
  // e quem só tem o id não escreve mais no link.
  async _keyProof(keyString) {
    const buf = await window.crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(String(keyString)));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  },

  // Cria o link do inquilino. O payload ja vai cifrado; a chave NUNCA sobe.
  async saveContract(contractData, key) {
    const encryptedPayload = await this.encrypt(contractData, key);
    const linkId = this._randomId();
    await Api.criarLink(linkId, encryptedPayload, await this._keyProof(key));
    return linkId;
  },

  // Atualiza o link existente.
  // finalize=true (envio do inquilino) trava o link no servidor: depois disso
  // ninguem mais reescreve o payload, mesmo tendo a URL inteira.
  //
  // O servidor responde { gravou: false } — e nao um erro HTTP — quando recusa
  // (link expirado, ja finalizado, ou prova de chave errada). Isso e de
  // proposito: recusa e falha de rede pedem reacoes opostas de quem chama, e
  // um 4xx generico as confundiria.
  async updateContract(serverId, contractData, key, finalize = false) {
    const encryptedPayload = await this.encrypt(contractData, key);
    const proof = await this._keyProof(key);

    const r = await Api.gravarLink(serverId, encryptedPayload, proof, finalize);

    // Sem esta checagem os dados digitados pelo inquilino sumiriam em silencio.
    if (!r || r.gravou !== true) {
      throw new Error("Este link expirou ou já foi enviado. Peça um novo link ao locador.");
    }
    return true;
  },

  // Le e decifra o contrato do link.
  async loadContract(serverId, key) {
    let resposta;
    try {
      resposta = await Api.lerLink(serverId);
    } catch (e) {
      // Falha de transporte e diferente de link inexistente, e quem chama
      // precisa distinguir: o editor descarta o link quando ele nao serve mais,
      // e nao pode descartar um link vivo (que o inquilino talvez esteja
      // preenchendo agora) so porque a conexao caiu por um instante.
      // Por isso: SO 404 conta como "acabou". Qualquer outra falha — rede,
      // 500, servidor reiniciando — vira erro de transporte.
      if (e.status !== 404) {
        const t = new Error("Não foi possível falar com o servidor. Verifique a conexão e tente de novo.");
        t.transporte = true;
        throw t;
      }
      throw new Error("Este link expirou ou não existe mais. Peça um novo link ao locador.");
    }

    const data = resposta && resposta.payload;
    if (!data) throw new Error("Este link expirou ou não existe mais. Peça um novo link ao locador.");

    let payload;
    try {
      payload = await this.decrypt(data, key);
    } catch (e) {
      // decrypt AES-GCM com chave errada rejeita com mensagem vazia — traduz
      // para algo acionavel.
      throw new Error("Chave do link incorreta ou link incompleto. Copie o link inteiro que o locador enviou.");
    }

    // Evidencia carimbada pelo servidor, fora do payload cifrado: e a unica
    // parte da trilha de aceite que quem assina nao redige.
    // Atribuicao incondicional: se o payload trouxer um "evidencia" forjado,
    // ele e substituido (por null, inclusive, quando a consulta falha).
    payload.evidencia = null;
    try {
      const ev = await Api.lerEvidencia(serverId);
      if (ev && ev.evidencia && ev.evidencia.finalizado_em) {
        payload.evidencia = { em: ev.evidencia.finalizado_em, ip: ev.evidencia.finalizado_ip || '' };
      }
    } catch (e) {
      // Complementar: link sem carimbo nao impede abrir.
      console.warn('Evidência do servidor indisponível:', e && e.message);
    }

    return payload;
  }
};
