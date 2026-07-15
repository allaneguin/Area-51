// ═══════════════════════════════════════════════════════
// Exportação para PDF (Impressão Nativa)
// ═══════════════════════════════════════════════════════

// nomeSugerido: o Chrome usa o title da pagina como nome do arquivo .pdf
function generatePDF(nomeSugerido) {
  const inputName = document.getElementById('contract-name');
  const nome = nomeSugerido || (inputName && inputName.value) || 'Contrato';

  const originalTitle = document.title;
  document.title = nome;
  window.print();
  document.title = originalTitle;
}
