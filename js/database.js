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
    return JSON.parse(new TextDecoder().decode(decrypted));
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
    // Fallback (contexto não-seguro / Safari antigo): precisa ser um UUID válido —
    // create_tenant_link recebe `p_id uuid` e rejeita hex sem hífens.
    const b = window.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // versão 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  },

  // Save a new contract to the cloud server
  async saveContract(contractData, key) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    const encryptedPayload = await this.encrypt(contractData, key);

    const linkId = this._randomId();

    // Via RPC: o id é argumento obrigatório, então a operação toca uma linha só.
    const { error } = await supabaseClient
      .rpc('create_tenant_link', { p_id: linkId, p_payload: encryptedPayload });

    if (error) throw new Error("Falha ao salvar link seguro no Supabase: " + error.message);
    return linkId;
  },

  // Update an existing contract on the cloud server.
  // finalize=true (envio do inquilino) trava o link no servidor: depois disso
  // ninguém mais reescreve o payload, mesmo tendo a URL (ver supabase_finalize.sql).
  async updateContract(serverId, contractData, key, finalize = false) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    const encryptedPayload = await this.encrypt(contractData, key);

    let { data, error } = await supabaseClient
      .rpc('set_tenant_link', finalize
        ? { p_id: serverId, p_payload: encryptedPayload, p_finalize: true }
        : { p_id: serverId, p_payload: encryptedPayload });

    // Banco ainda sem a migração (função de 2 argumentos): reenvia no formato
    // antigo para o envio do inquilino nunca ficar bloqueado pela migração pendente.
    // PGRST202 = função não encontrada na assinatura pedida. O teste é restrito de
    // propósito: um regex largo (/function/) mascararia erros não relacionados.
    if (error && finalize && error.code === 'PGRST202') {
      // A trava NÃO foi aplicada: o link segue gravável por quem tiver a URL.
      // Quem opera precisa ver isso — é degradação silenciosa de segurança.
      console.warn(
        '⚠️ set_tenant_link sem p_finalize: o link do inquilino NÃO ficou travado. ' +
        'Rode supabase_finalize.sql no Supabase.'
      );
      this.finalizeIndisponivel = true;
      ({ data, error } = await supabaseClient
        .rpc('set_tenant_link', { p_id: serverId, p_payload: encryptedPayload }));
    }

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

    if (error || !data) throw new Error("Este link expirou ou não existe mais. Peça um novo link ao locador.");

    try {
      return await this.decrypt(data, key);
    } catch (e) {
      // decrypt AES-GCM com chave errada rejeita com mensagem vazia — traduz para algo acionável.
      throw new Error("Chave do link incorreta ou link incompleto. Copie o link inteiro que o locador enviou.");
    }
  }
};
