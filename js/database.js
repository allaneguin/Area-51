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
    
    // Convert to URL-safe base64
    return btoa(String.fromCharCode(...combined))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  // Decrypt URL-safe base64 string to JSON object
  async decrypt(cipherTextBase64, keyString) {
    let base64 = cipherTextBase64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const combined = new Uint8Array(atob(base64).split("").map(c => c.charCodeAt(0)));
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
    const b = window.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  },

  // Save a new contract to the cloud server
  async saveContract(contractData, key) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    const encryptedPayload = await this.encrypt(contractData, key);

    const linkId = this._randomId();
    
    const { error } = await supabaseClient
      .from('tenant_links')
      .insert([{ id: linkId, encrypted_payload: encryptedPayload }]);
      
    if (error) throw new Error("Falha ao salvar link seguro no Supabase: " + error.message);
    return linkId;
  },

  // Update an existing contract on the cloud server
  async updateContract(serverId, contractData, key) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    const encryptedPayload = await this.encrypt(contractData, key);
    
    const { data, error } = await supabaseClient
      .from('tenant_links')
      .update({ encrypted_payload: encryptedPayload })
      .eq('id', serverId)
      .select('id');

    if (error) throw new Error("Falha ao atualizar contrato no servidor: " + error.message);
    // UPDATE que não casa nenhuma linha (link expirado/removido) NÃO gera erro no Supabase.
    // Sem esta checagem, os dados digitados seriam descartados silenciosamente.
    if (!data || data.length === 0) {
      throw new Error("Este link expirou. Peça um novo link ao locador.");
    }
    return true;
  },

  // Fetch and decrypt a contract from the cloud server
  async loadContract(serverId, key) {
    if (typeof supabaseClient === 'undefined') throw new Error("Supabase não inicializado.");
    
    const { data, error } = await supabaseClient
      .from('tenant_links')
      .select('encrypted_payload')
      .eq('id', serverId)
      .single();

    if (error || !data) throw new Error("Este link expirou ou não existe mais. Peça um novo link ao locador.");

    try {
      return await this.decrypt(data.encrypted_payload, key);
    } catch (e) {
      // decrypt AES-GCM com chave errada rejeita com mensagem vazia — traduz para algo acionável.
      throw new Error("Chave do link incorreta ou link incompleto. Copie o link inteiro que o locador enviou.");
    }
  }
};
