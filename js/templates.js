// ═══════════════════════════════════════════════════════
// Templates View
// ═══════════════════════════════════════════════════════

const Templates = {
  render(container) {
    const templates = Object.values(Contracts);
    
    let html = `
      <div class="page-header animate-fade-in-down">
        <div>
          <h1 class="page-title">Modelos de Contrato</h1>
          <p class="page-subtitle">Escolha um modelo para começar.</p>
        </div>
      </div>
      <div class="templates-grid stagger-1 animate-fade-in-up">
    `;

    templates.forEach(t => {
      let svg = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
      if (t.icon === 'home') {
         svg = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>';
      }

      html += `
        <div class="card template-card" onclick="window.location.hash='#editor?template=${t.id}'">
          <div class="template-card-icon ${t.color}">
            ${svg}
          </div>
          <h3>${t.title}</h3>
          <p>${t.description}</p>
          <div class="template-card-footer">
            <span class="template-card-tag badge badge-${t.color}">${t.category}</span>
            <div class="template-card-arrow">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }
};
