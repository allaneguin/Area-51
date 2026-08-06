// ═══════════════════════════════════════════════════════
// Supabase Configuration & Initialization Module
// ═══════════════════════════════════════════════════════

const supabaseUrl = 'https://hbmqmzsssccrsyqdyixd.supabase.co';
const supabaseKey = 'sb_publishable_zKudHzqDlkkSHp4Q5n7KrQ_wBW7mHFb';

// Fica null se o SDK não carregar; o app.js trata isso mostrando erro (fail-closed).
let supabaseClient = null;

(function () {
  if (typeof supabase === 'undefined') {
    console.error("SDK do Supabase não encontrado. Verifique a importação no app.html.");
    return;
  }
  try {
    supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.error("Erro ao inicializar Supabase:", e);
  }
})();
