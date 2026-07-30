// ═══════════════════════════════════════════════════════
// Tenant View - Interface para o Inquilino (Mobile)
// ═══════════════════════════════════════════════════════

const Tenant = {
  contract: null,
  template: null,

  // Tela de erro/aviso, no visual da página
  renderErro(container, titulo, detalhe = '') {
    container.innerHTML = `
      <div class="tenant-state">
        <div class="tenant-state-icon error">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.46 0l-6.93 12A2 2 0 005.07 19z"></path></svg>
        </div>
        <h1>${titulo}</h1>
        ${detalhe ? `<p>${detalhe}</p>` : ''}
      </div>
    `;
  },

  render(container, param) {
    if (!param) {
      this.renderErro(container, 'Link inválido', 'Peça um novo link ao locador.');
      return;
    }

    if (param.startsWith('id=')) {
      // Novo link seguro na nuvem
      const urlParams = new URLSearchParams(param);
      const serverId = urlParams.get('id');
      const key = urlParams.get('key');

      if (!serverId || !key) {
        this.renderErro(container, 'Link incompleto', 'Copie o link inteiro que o locador enviou.');
        return;
      }

      container.innerHTML = `
        <div class="tenant-state">
          <div class="tenant-spinner"></div>
          <h1>Abrindo o contrato</h1>
          <p>Buscando seus dados com segurança no servidor...</p>
        </div>
      `;

      CloudDB.loadContract(serverId, key).then(payload => {
        this.contract = {
          templateId: payload.t,
          fields: payload.f,
          cloudId: serverId,
          cloudKey: key,
          localId: payload.localId,
          isFinalized: payload.isFinalized
        };

        this.template = Contracts[payload.t];
        if (!this.template) {
          this.renderErro(container, 'Modelo não encontrado', 'Este contrato usa um modelo que não existe mais.');
          return;
        }

        // Recupera o rascunho local: se o inquilino fechou a aba no meio do
        // preenchimento, os dados digitados voltam em vez de sumirem.
        if (!payload.isFinalized) this.restoreDraft();

        this.renderTenantUI(container);
        // Reabertura de um link já finalizado: mostra estado read-only, sem formulário editável
        // nem botão de reenvio (evita reenvio acidental sobrescrevendo a nuvem).
        if (payload.isFinalized) this.showAlreadyFinalized();
      }).catch(err => {
        console.error(err);
        this.renderErro(container, 'Não foi possível abrir', err.message);
      });
      return;
    }
    
    if (param.startsWith('data=')) {
      // Fluxo legado base64 desativado: os dados pessoais viajavam legíveis na URL.
      this.renderErro(container, 'Link antigo desativado', 'Este formato de link foi descontinuado por segurança. Peça um novo link ao locador.');
    }
  },

  // Estado read-only exibido ao reabrir um link cujo contrato já foi finalizado.
  // Reaproveita o padrão visual do "Dados enviados!", mantendo o #preview-content no DOM p/ o PDF.
  showAlreadyFinalized() {
    document.querySelectorAll('.tenant-header, .tenant-property, .tenant-doc-label, .tenant-doc, .tenant-footnote')
      .forEach(el => el.classList.add('tenant-hidden'));

    const card = document.querySelector('.tenant-form-card');
    if (!card) return;

    card.className = 'tenant-state';
    card.innerHTML = `
      <div class="tenant-state-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </div>
      <h1>Contrato já preenchido</h1>
      <p>Os dados deste contrato já foram enviados ao locador. Não é necessário preencher novamente.</p>
      <button class="btn btn-secondary" onclick="Tenant.downloadPDF()">Baixar PDF</button>
    `;
  },

  renderTenantUI(container) {
    // Métodos exigidos pelo locador. Link antigo (sem config) mostra ambos,
    // como antes; a obrigatoriedade só vale quando o locador marcou (=== true).
    const exigeAssinatura = this.contract.fields.exigir_assinatura !== false;
    const exigeSelfie = this.contract.fields.exigir_selfie !== false;

    container.innerHTML = `
      <div class="tenant-topbar">
        <div class="tenant-brand">
          <span class="tenant-brand-mark">
            <svg viewBox="0 0 125 95" fill="none" aria-hidden="true">
              <path d="M124.149 94C124.149 94.5523 123.702 95 123.149 95H80.0088C80.0039 95 80 94.9961 80 94.9912C80 94.9864 80.0039 94.9824 80.0088 94.9824L88.0528 94.992C88.6051 94.9926 89.0533 94.5455 89.054 93.9932L89.0827 70.9988C89.0834 70.447 89.5309 70 90.0827 70H94.1494C96.9108 70 99.1494 67.7614 99.1494 65C99.1494 62.2386 96.9108 60 94.1494 60H90.0979C89.5452 60 89.0972 59.5515 89.098 58.9987L89.1081 50.9987C89.1088 50.4469 89.5563 50 90.1081 50H99.1494C101.911 50 104.149 47.7614 104.149 45C104.149 42.2386 101.911 40 99.1494 40H90.1224C89.5696 40 89.1217 39.5515 89.1224 38.9987L89.1279 34.7739C89.1279 34.7709 89.1256 34.7683 89.1226 34.7681C89.1195 34.7678 89.1172 34.7652 89.1172 34.7622L89.1203 34.4736C89.1214 34.3669 89.069 34.2667 88.9808 34.2067L85.4794 31.8271C84.6649 31.2735 85.0567 30 86.0415 30H104.149C106.911 30 109.149 27.7614 109.149 25C109.149 22.2386 106.911 20 104.149 20H68.1494C68.1043 20 68.0601 19.9874 68.0227 19.962L54.5873 10.8308C54.3134 10.6446 54.1494 10.3349 54.1494 10.0037V1C54.1494 0.447715 54.5971 0 55.1494 0H123.149C123.702 0 124.149 0.447715 124.149 1V94Z" fill="currentColor" />
              <path d="M39.9453 14.3698C40.2812 14.1459 40.7188 14.1459 41.0547 14.3698L80.5547 40.7031C80.8329 40.8886 81 41.2008 81 41.5352V94C81 94.5523 80.5523 95 80 95H56.6875C56.1352 95 55.6875 94.5523 55.6875 94V64.5C55.6875 63.9477 55.2398 63.5 54.6875 63.5H26.3125C25.7602 63.5 25.3125 63.9477 25.3125 64.5V94C25.3125 94.5523 24.8648 95 24.3125 95H1C0.447716 95 0 94.5523 0 94V41.5352C0 41.2008 0.167101 40.8886 0.4453 40.7031L39.9453 14.3698Z" fill="currentColor" />
            </svg>
          </span>
          Meus Imóveis
        </div>
      </div>

      <div class="tenant-header animate-fade-in-up">
        <h1>Contrato de <em>Locação</em></h1>
        ${this.contract.fields.nome_locador ? `
        <p class="tenant-sender"><strong>${Utils.esc(this.contract.fields.nome_locador)}</strong> enviou este contrato para você.</p>
        ` : ''}
        <p>Preencha seus dados pessoais abaixo para finalizar o contrato.</p>
      </div>

      <div class="tenant-property animate-fade-in-up">
        <span class="tenant-property-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        </span>
        <div class="tenant-property-info">
          <div class="tenant-label">IMÓVEL</div>
          <div class="tenant-property-value">${Utils.esc(this.contract.fields.end_imovel) || 'Não informado'}</div>
        </div>
        <div class="tenant-property-rent">
          <div class="tenant-label">ALUGUEL</div>
          <div class="tenant-rent-value">${this.contract.fields.valor_aluguel ? Utils.esc(this.contract.fields.valor_aluguel) + '<span> /mês</span>' : 'Não informado'}</div>
        </div>
      </div>

      <div class="tenant-doc-label">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        LEIA O CONTRATO ABAIXO
      </div>
      <div class="tenant-doc">
        <!-- thead/tfoot vazios: o navegador os repete em cada página
             impressa, e eles viram a margem de cima e de baixo da folha -->
        <table class="print-wrap">
          <thead><tr><td><div class="print-spacer-inner"></div></td></tr></thead>
          <tbody><tr><td>
            <div id="preview-content" class="preview-document">
              ${this.template.template}
            </div>
          </td></tr></tbody>
          <tfoot><tr><td><div class="print-spacer-inner"></div></td></tr></tfoot>
        </table>
        <p class="tenant-doc-note">— Os campos destacados serão preenchidos com os seus dados —</p>
      </div>

      <div class="tenant-form-card">
        <div class="tenant-form-title">Seus Dados Pessoais</div>
        <div class="tenant-form-hint">Eles entram automaticamente nos campos destacados do contrato.</div>

        <div class="tenant-form-grid" id="tenant-form-container"></div>

        ${exigeAssinatura ? `
        <div class="tenant-signature-section" style="margin-top: 1.5rem; margin-bottom: 1rem;">
          <label class="form-label" style="font-weight: 700; color: var(--text-heading, #1E293B); margin-bottom: 6px; display: block;">Assinatura Manuscrita (Desenhe com o dedo ou mouse)</label>
          <div class="signature-pad-wrap" style="position: relative; border: 2px dashed #CBD5E1; border-radius: 12px; background: #FFFFFF; overflow: hidden; touch-action: none;">
            <canvas id="signature-canvas" height="150" style="width: 100%; display: block; cursor: crosshair;"></canvas>
            <div id="signature-placeholder" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; color: #94A3B8; pointer-events: none; font-size: 0.9rem; font-weight: 500;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              Desenhe sua assinatura aqui
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
            <button type="button" class="btn btn-secondary" style="font-size: 0.8rem; padding: 4px 12px;" onclick="Tenant.clearSignature()">Limpar Assinatura</button>
          </div>
        </div>
        ` : ''}

        ${exigeSelfie ? `
        <div class="tenant-selfie-section" style="margin-top: 1.5rem; margin-bottom: 1.5rem;">
          <label class="form-label" style="font-weight: 700; color: var(--text-heading, #1E293B); margin-bottom: 6px; display: block;">Validação Facial (Selfie com Documento)</label>
          <div class="selfie-card-wrap" style="border: 2px dashed #CBD5E1; border-radius: 12px; background: #FFFFFF; padding: 1.25rem; text-align: center;">
            <div id="selfie-preview-container" style="display: none; margin-bottom: 10px;">
              <img id="selfie-preview-img" style="max-height: 180px; max-width: 100%; border-radius: 8px; border: 1px solid #CBD5E1;" alt="Sua Selfie">
            </div>
            <div id="selfie-video-container" style="display: none; position: relative; margin-bottom: 10px; border-radius: 8px; overflow: hidden; background: #000;">
              <video id="selfie-video" autoplay playsinline style="width: 100%; max-height: 220px; object-fit: cover;"></video>
            </div>
            <p id="selfie-hint" style="font-size: 0.85rem; color: #64748B; margin-bottom: 12px; line-height: 1.4;">Tire uma foto sua segurando o seu documento para validar sua assinatura no contrato.</p>
            
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button type="button" id="btn-open-camera" class="btn btn-secondary" style="font-size: 0.85rem; padding: 6px 14px;" onclick="Tenant.startCamera()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Abrir Câmera
              </button>
              <button type="button" id="btn-take-selfie" class="btn btn-primary" style="display: none; font-size: 0.85rem; padding: 6px 14px;" onclick="Tenant.takeSelfie()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Capturar Foto
              </button>
              <button type="button" id="btn-retake-selfie" class="btn btn-secondary" style="display: none; font-size: 0.85rem; padding: 6px 14px;" onclick="Tenant.resetSelfie()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Tirar Outra Foto
              </button>
              <input type="file" id="selfie-file-input" accept="image/*" capture="user" style="display: none;" onchange="Tenant.handleSelfieFile(this)">
              <button type="button" class="btn btn-secondary" style="font-size: 0.85rem; padding: 6px 14px;" onclick="document.getElementById('selfie-file-input').click()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                Escolher Arquivo
              </button>
            </div>
          </div>
        </div>
        ` : ''}

        <input type="checkbox" id="aceito_contrato" class="tenant-check-input"
          onchange="document.getElementById('btn_salvar_inquilino').disabled = !this.checked">
        <label for="aceito_contrato" class="tenant-accept">
          Declaro que li e concordo com todos os termos descritos no contrato acima.
        </label>

        <button id="btn_salvar_inquilino" class="btn btn-primary tenant-submit" onclick="Tenant.finish()" disabled>
          Salvar e Enviar para o Locador
        </button>
      </div>

      <p class="tenant-footnote">Seus dados são enviados apenas ao locador responsável por este contrato e tratados conforme a <a href="termos.html" target="_blank" rel="noopener">Política de Privacidade</a>.</p>
    `;

    this.renderForm();
  },

  initSignaturePad() {
    const canvas = document.getElementById('signature-canvas');
    const placeholder = document.getElementById('signature-placeholder');
    Utils.wireSignaturePad(canvas, placeholder, this.contract.fields.assinatura_locatario, (dataUrl) => {
      this.contract.fields.assinatura_locatario = dataUrl;
      this.saveDraft();
      this.updatePreview();
    });
  },

  clearSignature() {
    Utils.clearSignaturePad(document.getElementById('signature-canvas'), document.getElementById('signature-placeholder'));
    delete this.contract.fields.assinatura_locatario;
    this.saveDraft();
    this.updatePreview();
  },

  selfieStream: null,

  async startCamera() {
    try {
      this.selfieStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      const video = document.getElementById('selfie-video');
      const vContainer = document.getElementById('selfie-video-container');
      const pContainer = document.getElementById('selfie-preview-container');
      const btnOpen = document.getElementById('btn-open-camera');
      const btnTake = document.getElementById('btn-take-selfie');

      if (video && vContainer) {
        video.srcObject = this.selfieStream;
        vContainer.style.display = 'block';
        if (pContainer) pContainer.style.display = 'none';
        if (btnOpen) btnOpen.style.display = 'none';
        if (btnTake) btnTake.style.display = 'inline-block';
      }
    } catch (e) {
      Utils.toast('Não foi possível acessar a câmera. Use o botão "Escolher Arquivo" para enviar uma foto.', 'error');
    }
  },

  takeSelfie() {
    const video = document.getElementById('selfie-video');
    const vContainer = document.getElementById('selfie-video-container');
    const pContainer = document.getElementById('selfie-preview-container');
    const pImg = document.getElementById('selfie-preview-img');
    const btnTake = document.getElementById('btn-take-selfie');
    const btnRetake = document.getElementById('btn-retake-selfie');

    if (!video) return;

    const maxDim = 600;
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    this.contract.fields.selfie_locatario = dataUrl;

    if (pImg && pContainer) {
      pImg.src = dataUrl;
      pContainer.style.display = 'block';
    }
    if (vContainer) vContainer.style.display = 'none';
    if (btnTake) btnTake.style.display = 'none';
    if (btnRetake) btnRetake.style.display = 'inline-block';

    this.stopCameraStream();
    this.saveDraft();
    this.updatePreview();
  },

  stopCameraStream() {
    if (this.selfieStream) {
      this.selfieStream.getTracks().forEach(track => track.stop());
      this.selfieStream = null;
    }
  },

  resetSelfie() {
    this.stopCameraStream();
    delete this.contract.fields.selfie_locatario;
    const pContainer = document.getElementById('selfie-preview-container');
    const vContainer = document.getElementById('selfie-video-container');
    const btnOpen = document.getElementById('btn-open-camera');
    const btnTake = document.getElementById('btn-take-selfie');
    const btnRetake = document.getElementById('btn-retake-selfie');

    if (pContainer) pContainer.style.display = 'none';
    if (vContainer) vContainer.style.display = 'none';
    if (btnOpen) btnOpen.style.display = 'inline-block';
    if (btnTake) btnTake.style.display = 'none';
    if (btnRetake) btnRetake.style.display = 'none';

    this.saveDraft();
    this.updatePreview();
  },

  handleSelfieFile(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        this.contract.fields.selfie_locatario = dataUrl;
        
        const pContainer = document.getElementById('selfie-preview-container');
        const pImg = document.getElementById('selfie-preview-img');
        const btnOpen = document.getElementById('btn-open-camera');
        const btnRetake = document.getElementById('btn-retake-selfie');

        if (pImg && pContainer) {
          pImg.src = dataUrl;
          pContainer.style.display = 'block';
        }
        if (btnOpen) btnOpen.style.display = 'none';
        if (btnRetake) btnRetake.style.display = 'inline-block';

        this.saveDraft();
        this.updatePreview();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },
  
  // ── Rascunho local: o inquilino não perde o que digitou se fechar a aba ──
  _draftKey() {
    return this.contract && this.contract.cloudId ? 'tenant_draft_' + this.contract.cloudId : null;
  },

  saveDraft() {
    const k = this._draftKey();
    if (!k) return; // link legado base64 não tem id estável — sem rascunho
    const draft = {};
    this.template.fields
      .filter(f => f.section.toLowerCase() === 'locatário')
      .forEach(f => { if (this.contract.fields[f.name]) draft[f.name] = this.contract.fields[f.name]; });
    // Assinatura e selfie com documento NÃO entram no rascunho: ficariam em claro
    // no localStorage de um aparelho possivelmente compartilhado, e o rascunho só
    // é apagado no envio bem-sucedido — quem desiste no meio deixaria a foto lá.
    // O custo é refazer os dois após um reload; os campos digitados seguem salvos.
    try { localStorage.setItem(k, JSON.stringify(draft)); } catch (e) { /* storage cheio/bloqueado: segue sem rascunho */ }
  },

  restoreDraft() {
    const k = this._draftKey();
    if (!k) return;
    try {
      const draft = JSON.parse(localStorage.getItem(k));
      if (draft) Object.assign(this.contract.fields, draft);
    } catch (e) { /* rascunho corrompido: ignora */ }
  },

  clearDraft() {
    const k = this._draftKey();
    if (k) try { localStorage.removeItem(k); } catch (e) {}
  },

  renderForm() {
    const container = document.getElementById('tenant-form-container');
    const tenantFields = this.template.fields.filter(f => f.section.toLowerCase() === 'locatário');

    let html = '';

    tenantFields.forEach(f => {
      if (f.hidden) return;

      let inputHtml = '';
      const val = this.contract.fields[f.name] || '';
      if (f.type === 'textarea') {
        inputHtml = `<textarea class="form-textarea" data-field="${f.name}">${Utils.esc(val)}</textarea>`;
      } else if (f.type === 'select') {
        inputHtml = `<select class="form-input" data-field="${f.name}">`;
        f.options.forEach(opt => {
          inputHtml += `<option value="${opt.value}" ${val === opt.value ? 'selected' : ''}>${opt.label}</option>`;
        });
        inputHtml += `</select>`;
      } else {
        inputHtml = `<input type="${f.type}" class="form-input" data-field="${f.name}" value="${Utils.esc(val)}" ${f.mask ? `data-mask="${f.mask}"` : ''}>`;
      }

      // Nome, endereço e textos longos ocupam a linha inteira do grid
      const full = f.type === 'textarea' || /nome|end_|endereco/i.test(f.name) ? ' full' : '';

      html += `<div class="form-group${full}">
        <label class="form-label">${f.label}</label>
        ${inputHtml}
      </div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('input, textarea, select').forEach(el => {
      const mask = el.getAttribute('data-mask');
      if (mask) {
        Utils.applyMask(el, mask);
        if (el.value) el.dispatchEvent(new Event('input'));
      }
      
      el.addEventListener('input', async () => {
        const fieldName = el.getAttribute('data-field');
        this.contract.fields[fieldName] = el.value;

        if (fieldName && fieldName.includes('cep') && el.value.replace(/\D/g, '').length === 8) {
          const data = await Utils.fetchCEP(el.value);
          if (data && data.enderecoCompleto) {
            const targetField = fieldName.includes('locatario') ? 'end_locatario' : 'end_imovel';
            const targetEl = container.querySelector(`[data-field="${targetField}"]`);
            if (targetEl && !targetEl.value.trim()) {
              targetEl.value = data.enderecoCompleto;
              this.contract.fields[targetField] = data.enderecoCompleto;
              Utils.toast('Endereço preenchido pelo CEP!', 'info');
            }
          }
        }

        this.saveDraft();
        this.updatePreview();
      });
    });
    
    // Inicializar o Pad de Assinatura Canvas
    setTimeout(() => this.initSignaturePad(), 50);

    // Atualizar preview logo no início com os dados já preenchidos pelo locador
    this.updatePreview();
  },

  updatePreview() {
    const prev = document.getElementById('preview-content');
    if (!prev) return;
    
    prev.querySelectorAll('.highlight').forEach(el => {
      const field = el.getAttribute('data-field');
      let val = this.contract.fields[field];

      // "personalizado" é estado do formulário, não texto de contrato:
      // o documento recebe a frase gerada a partir dos meses digitados.
      if (field === 'prazo_extenso' && val === 'personalizado') {
        val = Utils.prazoPorExtenso(this.contract.fields['prazo_meses'], this.contract.fields['prazo_unidade']);
      }

      // Formatar datas do padrão ISO (YYYY-MM-DD) para Brasileiro (DD/MM/YYYY)
      if (val && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
         const parts = val.split('-');
         val = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      
      // Aplicar máscara de formatação na preview caso o dado esteja sem máscara
      if (val) {
        const fieldDef = this.template.fields.find(f => f.name === field);
        if (fieldDef && fieldDef.mask) {
          const fnName = 'mask' + fieldDef.mask.charAt(0).toUpperCase() + fieldDef.mask.slice(1);
          if (Utils[fnName]) {
            val = Utils[fnName](val);
          }
        }
      }
      
      el.textContent = val ? val : '___';
      el.classList.toggle('filled', !!val); // preenchido = azul; vazio = ambar
    });

    // Locador PJ (CNPJ): oculta nacionalidade, estado civil e RG no texto,
    // e o rótulo do documento vira "CNPJ" (ou "CPF" p/ pessoa física) em vez de "CPF/CNPJ".
    const pjLocador = Utils.isPJLocador(this.contract.fields);
    prev.querySelectorAll('.pf-locador').forEach(el => el.style.display = pjLocador ? 'none' : '');
    prev.querySelectorAll('.doc-locador-label').forEach(el => el.textContent = pjLocador ? 'CNPJ' : 'CPF');

    // Garantia Locatícia no texto e assinaturas
    const tipoGarantia = this.contract.fields.tipo_garantia || 'sem_garantia';
    prev.querySelectorAll('.sec-fiador-row').forEach(el => el.style.display = tipoGarantia === 'fiador' ? '' : 'none');
    prev.querySelectorAll('.sec-fiador-sig').forEach(el => el.style.display = tipoGarantia === 'fiador' ? '' : 'none');

    const txtGarantia = prev.querySelector('.sec-garantia-texto');
    if (txtGarantia) {
      if (tipoGarantia === 'caucao') {
        const v = Utils.esc(this.contract.fields.valor_caucao || 'R$ ___');
        const ve = Utils.esc(this.contract.fields.valor_caucao_extenso || '___');
        txtGarantia.innerHTML = `Para garantia das obrigações assumidas neste contrato, o LOCATÁRIO presta garantia mediante <strong>Caução em Dinheiro</strong> no valor de <strong>${v} (${ve})</strong>, depositada em favor do LOCADOR.`;
      } else if (tipoGarantia === 'fiador') {
        const nf = Utils.esc(this.contract.fields.nome_fiador || '___');
        const df = Utils.esc(this.contract.fields.doc_fiador || '___');
        txtGarantia.innerHTML = `Para garantia das obrigações assumidas neste contrato, assina como <strong>FIADOR(A)</strong> e principal pagador(a) solidário(a) o(a) Sr(a). <strong>${nf}</strong>, CPF <strong>${df}</strong>.`;
      } else {
        txtGarantia.innerHTML = `O presente contrato é celebrado <strong>sem modalidade de garantia fidejussória ou real</strong>.`;
      }
    }

    // Renderizar Imagem de Assinatura se existir
    prev.querySelectorAll('.signature-img-container[data-signature="locatario"]').forEach(el => {
      if (this.contract.fields && this.contract.fields.assinatura_locatario) {
        el.innerHTML = Utils.imgSeguro(this.contract.fields.assinatura_locatario,
          'Assinatura Locatário', 'max-height: 55px; display: block; margin: 4px auto 0;');
      } else {
        el.innerHTML = '';
      }
    });

    // Assinatura do locador: só leitura aqui (ele assina no próprio painel,
    // não na tela pública do inquilino) — chega pronta se ele já assinou antes de gerar o link.
    prev.querySelectorAll('.signature-img-container[data-signature="locador"]').forEach(el => {
      if (this.contract.fields && this.contract.fields.assinatura_locador) {
        el.innerHTML = Utils.imgSeguro(this.contract.fields.assinatura_locador,
          'Assinatura Locador', 'max-height: 55px; display: block; margin: 4px auto 0;');
      } else {
        el.innerHTML = '';
      }
    });
  },

  finish() {
    // Nome e documento são o mínimo para o contrato valer alguma coisa —
    // sem eles não há parte identificada, então o envio é bloqueado (não é opcional).
    const marcar = (el, ruim) => { if (el) el.style.borderColor = ruim ? 'red' : ''; };
    const nomeEl = document.querySelector('#tenant-form-container [data-field="nome_locatario"]');
    if (nomeEl && !nomeEl.value.trim()) {
      marcar(nomeEl, true);
      Utils.toast('Informe seu nome completo para enviar o contrato.', 'error');
      return;
    }
    marcar(nomeEl, false);

    // Validação de CPF/CNPJ (checksum, não só formato)
    let isValid = true;
    let errorMsg = '';

    document.querySelectorAll('input[data-mask="cpfcnpj"]').forEach(el => {
      const val = el.value.replace(/\D/g, '');
      if (!val) {
        isValid = false;
        errorMsg = 'Informe seu CPF para enviar o contrato.';
        marcar(el, true);
      } else if (val.length <= 11 ? !Utils.isValidCPF(val) : !Utils.isValidCNPJ(val)) {
        isValid = false;
        errorMsg = 'O ' + (val.length <= 11 ? 'CPF' : 'CNPJ') + ' informado (' + el.value + ') é inválido. Por favor, corrija.';
        marcar(el, true);
      } else {
        marcar(el, false);
      }
    });

    if (!isValid) {
      Utils.toast(errorMsg, 'error');
      return;
    }

    // Métodos exigidos pelo locador (só bloqueia quando marcado === true;
    // link antigo sem config não trava, preservando o comportamento anterior).
    if (this.contract.fields.exigir_assinatura === true && !this.contract.fields.assinatura_locatario) {
      Utils.toast('Desenhe sua assinatura manuscrita para enviar o contrato.', 'error');
      return;
    }
    if (this.contract.fields.exigir_selfie === true && !this.contract.fields.selfie_locatario) {
      Utils.toast('Tire a selfie com o documento para enviar o contrato.', 'error');
      return;
    }

    // Demais campos (RG, profissão etc.): incompletos ainda podem seguir, com aviso
    const requiredEmpty = Array.from(document.querySelectorAll('#tenant-form-container input, #tenant-form-container select')).find(el => !el.value.trim());
    if (requiredEmpty) {
      if (!confirm('Ainda há campos vazios. Tem certeza que deseja enviar o contrato incompleto?')) {
        return;
      }
    }

    const saveFinishedUI = (waUrl) => {
      const primeiroNome = (this.contract.fields.nome_locatario || '').trim().split(' ')[0];

      // Esconde o formulário e o contrato da tela — mas o contrato segue no DOM,
      // porque o "Baixar PDF" imprime o #preview-content (ver @media print).
      document.querySelectorAll('.tenant-header, .tenant-property, .tenant-doc-label, .tenant-doc, .tenant-footnote')
        .forEach(el => el.classList.add('tenant-hidden'));

      const card = document.querySelector('.tenant-form-card');
      if (!card) return;

      card.className = 'tenant-state';
      card.innerHTML = `
        <div class="tenant-state-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <h1>Dados enviados!</h1>
        <p>${primeiroNome ? Utils.esc(primeiroNome) + ', recebemos' : 'Recebemos'} suas informações. Agora envie-as ao locador — ele vai revisar e gerar o contrato final para assinatura.</p>

        <a href="${waUrl}" target="_blank" rel="noopener" class="btn btn-whatsapp">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Enviar para o Locador
        </a>

        <button class="btn btn-secondary" onclick="Tenant.downloadPDF()">Baixar PDF (opcional)</button>
      `;
    };

    if (this.contract.cloudId && this.contract.cloudKey) {
      // Modo seguro na nuvem
      const saveBtn = document.getElementById('btn_salvar_inquilino');
      const originalHTML = saveBtn ? saveBtn.innerHTML : '';
      if (saveBtn) {
        saveBtn.innerHTML = `Salvando com segurança...`;
        saveBtn.disabled = true;
      }

      // Evidência do aceite: instante + SHA-256 do texto exato que o inquilino
      // leu (contrato já com os dados dele). Viaja dentro do payload cifrado e
      // chega ao painel do locador. Se o contrato mudar depois, o hash não bate.
      const registrarAceite = async () => {
        this.contract.fields.aceite_ts = new Date().toISOString();
        this.contract.fields.user_agent = navigator.userAgent;

        try {
          const [ip, gps] = await Promise.all([
            Utils.getIP(),
            Utils.getGPS()
          ]);
          this.contract.fields.ip_acesso = ip;
          if (gps) {
            this.contract.fields.geo_lat = gps.lat;
            this.contract.fields.geo_lng = gps.lng;
            this.contract.fields.geo_acc = gps.acc;
          }
        } catch (e) {
          console.warn("Falha ao capturar evidencias de IP/GPS:", e);
        }

        const prev = document.getElementById('preview-content');
        const texto = prev ? prev.innerText : '';
        try {
          const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
          this.contract.fields.aceite_hash = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {}
      };

      const payload = {
        t: this.contract.templateId,
        f: this.contract.fields,
        localId: this.contract.localId,
        isFinalized: true
      };

      registrarAceite().then(() =>
        CloudDB.updateContract(this.contract.cloudId, payload, this.contract.cloudKey, true)
      ).then(() => {
        this.clearDraft();
        const importUrl = Utils.shareBaseUrl() + '#import?id=' + this.contract.cloudId + '&key=' + this.contract.cloudKey;
        const waText = encodeURIComponent("Olá! Preenchi os meus dados no contrato com segurança. Segue o link para você visualizar/importar no seu painel:\n\n" + importUrl);
        const waUrl = "https://wa.me/?text=" + waText;
        
        saveFinishedUI(waUrl);
      }).catch(err => {
        Utils.toast("Erro ao salvar dados no servidor seguro: " + err.message, 'error');
        if (saveBtn) {
          saveBtn.innerHTML = originalHTML;
          saveBtn.disabled = false;
        }
      });

    } else {
      // Sem cloudId/cloudKey só acontecia em links legados base64, já desativados.
      Utils.toast('Este link antigo não é mais suportado. Peça um novo link ao locador.', 'error');
    }
  },

  downloadPDF() {
    this.updatePreview();
    generatePDF('Contrato - ' + (this.contract.fields.nome_locatario || 'Inquilino'));
  }
};
