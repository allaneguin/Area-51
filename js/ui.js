// ═══════════════════════════════════════════════════════
// UI — Sistema de feedback (toasts + modais) não-bloqueante
// Substitui alert()/confirm() nativos. Sem dependências.
// ═══════════════════════════════════════════════════════

const UI = {
  _toastContainer: null,
  _lastFocused: null,

  // Escape seguro (usa Utils se disponível; senão, fallback local)
  _esc(value) {
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) return Utils.escapeHtml(value);
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _icons: {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.86l-8.4 14.55A1.5 1.5 0 003.2 21h17.6a1.5 1.5 0 001.3-2.59L13.7 3.86a1.5 1.5 0 00-2.6 0z"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
  },

  // ── Toast (transitório, não-bloqueante) ──
  // type: 'info' | 'success' | 'error' | 'warning'
  toast(message, type = 'info', duration) {
    if (!this._toastContainer) {
      this._toastContainer = document.createElement('div');
      this._toastContainer.className = 'ui-toast-container';
      // Leitores de tela anunciam novos toasts
      this._toastContainer.setAttribute('aria-live', 'polite');
      this._toastContainer.setAttribute('aria-atomic', 'false');
      document.body.appendChild(this._toastContainer);
    }
    // Erros são mais assertivos e duram mais
    if (duration === undefined) duration = (type === 'error') ? 7000 : 4000;

    const el = document.createElement('div');
    el.className = `ui-toast ui-toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="ui-toast-icon">${this._icons[type] || this._icons.info}</span>
      <span class="ui-toast-msg">${this._esc(message)}</span>
      <button class="ui-toast-close" aria-label="Fechar notificação">&times;</button>
    `;

    const remove = () => {
      el.classList.add('ui-toast-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      // Fallback caso a animação não dispare
      setTimeout(() => el.remove(), 400);
    };

    el.querySelector('.ui-toast-close').addEventListener('click', remove);
    this._toastContainer.appendChild(el);

    if (duration > 0) setTimeout(remove, duration);
    return el;
  },

  // ── Modal de alerta (1 botão, aguarda OK) → Promise<void> ──
  alert(message, opts = {}) {
    return this._modal({
      message,
      title: opts.title || 'Aviso',
      okText: opts.okText || 'OK',
      cancelText: null
    }).then(() => undefined);
  },

  // ── Modal de confirmação (2 botões) → Promise<boolean> ──
  confirm(message, opts = {}) {
    return this._modal({
      message,
      title: opts.title || 'Confirmação',
      okText: opts.okText || 'Confirmar',
      cancelText: opts.cancelText || 'Cancelar',
      danger: opts.danger || false
    });
  },

  // ── Implementação interna do modal ──
  _modal({ message, title, okText, cancelText, danger }) {
    return new Promise((resolve) => {
      this._lastFocused = document.activeElement;

      const overlay = document.createElement('div');
      overlay.className = 'ui-modal-overlay';

      const hasCancel = cancelText !== null;
      overlay.innerHTML = `
        <div class="ui-modal" role="${hasCancel ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="ui-modal-title" aria-describedby="ui-modal-desc">
          <h3 class="ui-modal-title" id="ui-modal-title">${this._esc(title)}</h3>
          <p class="ui-modal-msg" id="ui-modal-desc">${this._esc(message)}</p>
          <div class="ui-modal-actions">
            ${hasCancel ? `<button class="btn btn-secondary ui-modal-cancel">${this._esc(cancelText)}</button>` : ''}
            <button class="btn ${danger ? 'ui-btn-danger' : 'btn-primary'} ui-modal-ok">${this._esc(okText)}</button>
          </div>
        </div>
      `;

      const close = (result) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.add('ui-modal-out');
        overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
        setTimeout(() => overlay.remove(), 400);
        // Restaura o foco para onde estava antes do modal
        if (this._lastFocused && this._lastFocused.focus) this._lastFocused.focus();
        resolve(result);
      };

      const okBtn = overlay.querySelector('.ui-modal-ok');
      const cancelBtn = overlay.querySelector('.ui-modal-cancel');

      okBtn.addEventListener('click', () => close(true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
      // Clicar no fundo cancela (em confirm) ou fecha (em alert)
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) close(hasCancel ? false : undefined);
      });

      // Teclado: ESC cancela, Enter confirma, Tab faz foco circular (trap)
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(hasCancel ? false : undefined); }
        else if (e.key === 'Enter') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') {
          const focusables = overlay.querySelectorAll('button');
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(overlay);
      okBtn.focus();
    });
  }
};
