// ═══════════════════════════════════════════════════════
// Supabase Configuration & Initialization Module
// ═══════════════════════════════════════════════════════

// Desliga o login/nuvem e faz o app rodar 100% no localStorage.
// Util quando o projeto Supabase esta pausado ou fora do ar.
const SUPABASE_ENABLED = true;

const supabaseUrl = 'https://hbmqmzsssccrsyqdyixd.supabase.co';
const supabaseKey = 'sb_publishable_zKudHzqDlkkSHp4Q5n7KrQ_wBW7mHFb';

let supabaseClient = null;
let SupabaseActive = false;

(function() {
  if (!SUPABASE_ENABLED) {
    console.warn("⚠️ Supabase desativado (SUPABASE_ENABLED = false). Rodando offline no localStorage.");
    localStorage.removeItem('sb-' + supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
    return;
  }
  if (typeof supabase !== 'undefined') {
    try {
      const { createClient } = supabase;
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      SupabaseActive = true;
      console.log("⚡ Supabase inicializado com sucesso usando as credenciais fornecidas.");
    } catch (e) {
      console.error("❌ Erro ao inicializar Supabase:", e);
    }
  } else {
    console.error("❌ SDK do Supabase não encontrado. Verifique a importação no app.html.");
  }
})();
