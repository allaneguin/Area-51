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

  // Save a new contract to the cloud server
  async saveContract(contractData, key) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    const encryptedPayload = await this.encrypt(contractData, key);

    const linkId = this._randomId();

    // Via RPC: o id é argumento obrigatório, então a operação toca uma linha só.
    const { error } = await supabaseClient
      .rpc('create_tenant_link', {
        p_id: linkId,
        p_payload: encryptedPayload,
        p_key_proof: await this._keyProof(key)
      });

    if (error) throw new Error("Falha ao salvar link seguro no Supabase: " + error.message);
    return linkId;
  },

  // Update an existing contract on the cloud server.
  // finalize=true (envio do inquilino) trava o link no servidor: depois disso
  // ninguém mais reescreve o payload, mesmo tendo a URL (ver supabase_seguranca.sql).
  async updateContract(serverId, contractData, key, finalize = false) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    const encryptedPayload = await this.encrypt(contractData, key);

    // Sem reenvio em formato antigo: havia um caminho que, se a função de três
    // argumentos não existisse, repetia a chamada sem p_finalize. O inquilino
    // via "enviado com sucesso" e o link continuava gravável por quem tivesse a
    // URL — falha disfarçada de sucesso. supabase_seguranca.sql garante a
    // assinatura única, então erro aqui volta a ser erro visível.
    // p_key_proof (003): sem ela, quem tivesse só o id sobrescrevia e finalizava
    // o link de fora. Link criado antes da 003 tem key_proof null no banco e
    // continua aceitando a escrita sem a prova, até expirar.
    const proof = await this._keyProof(key);
    const { data, error } = await supabaseClient
      .rpc('set_tenant_link', finalize
        ? { p_id: serverId, p_payload: encryptedPayload, p_finalize: true, p_key_proof: proof }
        : { p_id: serverId, p_payload: encryptedPayload, p_key_proof: proof });

    if (error) throw new Error("Falha ao atualizar contrato no servidor: " + error.message);
    // A função devolve false quando nenhuma linha casou (link expirado,
    // removido ou já finalizado). Sem esta checagem, os dados digitados
    // seriam descartados silenciosamente.
    if (data !== true) {
      throw new Error("Este link expirou ou já foi enviado. Peça um novo link ao locador.");
    }
    return true;
  },

  // Fetch and decrypt a contract from the cloud server
  async loadContract(serverId, key) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    
    const { data, error } = await supabaseClient
      .rpc('get_tenant_link', { p_id: serverId });

    // Falha de transporte é diferente de link inexistente, e quem chama precisa
    // distinguir: o editor descarta o link quando ele não serve mais, e não pode
    // descartar um link vivo (que o inquilino talvez esteja preenchendo agora)
    // só porque a conexão caiu por um instante.
    if (error) {
      const e = new Error("Não foi possível falar com o servidor. Verifique a conexão e tente de novo.");
      e.transporte = true;
      throw e;
    }
    if (!data) throw new Error("Este link expirou ou não existe mais. Peça um novo link ao locador.");

    let payload;
    try {
      payload = await this.decrypt(data, key);
    } catch (e) {
      // decrypt AES-GCM com chave errada rejeita com mensagem vazia — traduz para algo acionável.
      throw new Error("Chave do link incorreta ou link incompleto. Copie o link inteiro que o locador enviou.");
    }

    // Evidência carimbada pelo servidor (003), fora do payload cifrado: é a
    // única parte da trilha de aceite que quem assina não redige. Vem de uma
    // função separada de propósito — mudar o retorno de get_tenant_link
    // quebraria esta mesma linha no instante em que a migration rodasse.
    // Atribuição incondicional: se o payload trouxer um "evidencia" forjado,
    // ele é substituído (por null, inclusive, quando a consulta falha).
    payload.evidencia = null;
    try {
      const { data: ev } = await supabaseClient
        .rpc('get_tenant_link_evidencia', { p_id: serverId });
      const linha = Array.isArray(ev) ? ev[0] : ev;
      if (linha && linha.finalizado_em) {
        payload.evidencia = { em: linha.finalizado_em, ip: linha.finalizado_ip || '' };
      }
    } catch (e) {
      // Complementar: link antigo não tem carimbo, e isso não impede abrir.
      console.warn('Evidência do servidor indisponível:', e && e.message);
    }

    return payload;
  }
};
