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

        this.template = Contracts[payload.t] || (Storage._getData().customTemplates || []).find(t => t.id === payload.t);
        if (!this.template) {
          this.renderErro(container, 'Modelo não encontrado', 'Este contrato usa um modelo que não existe mais.');
          return;
        }

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
        <p>Preencha seus dados pessoais abaixo para finalizar o contrato.</p>
      </div>

      <div class="tenant-property animate-fade-in-up">
        <span class="tenant-property-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        </span>
        <div class="tenant-property-info">
          <div class="tenant-label">IMÓVEL</div>
          <div class="tenant-property-value">${this.contract.fields.end_imovel || 'Imóvel Residencial'}</div>
        </div>
        <div class="tenant-property-rent">
          <div class="tenant-label">ALUGUEL</div>
          <div class="tenant-rent-value">${this.contract.fields.valor_aluguel || 'A combinar'}<span> /mês</span></div>
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
      
      el.addEventListener('input', () => {
        const fieldName = el.getAttribute('data-field');
        this.contract.fields[fieldName] = el.value;
        this.updatePreview();
      });
    });
    
    // Atualizar preview logo no início com os dados já preenchidos pelo locador
    this.updatePreview();
  },

  updatePreview() {
    const prev = document.getElementById('preview-content');
    if (!prev) return;
    
    prev.querySelectorAll('.highlight').forEach(el => {
      const field = el.getAttribute('data-field');
      let val = this.contract.fields[field];
      
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
  },

  finish() {
    // Validação de CPF
    let isValid = true;
    let errorMsg = '';
    
    document.querySelectorAll('input[data-mask="cpfcnpj"]').forEach(el => {
      const val = el.value.replace(/\D/g, '');
      if (val.length > 0 && val.length <= 11) {
        if (!Utils.isValidCPF(val)) {
          isValid = false;
          errorMsg = 'O CPF informado (' + el.value + ') é inválido. Por favor, corrija.';
          el.style.borderColor = 'red';
        } else {
          el.style.borderColor = '';
        }
      }
    });

    if (!isValid) {
      Utils.toast(errorMsg, 'error');
      return;
    }

    // Validação de campos vazios (opcional, mas recomendado)
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

      const payload = {
        t: this.contract.templateId,
        f: this.contract.fields,
        localId: this.contract.localId,
        isFinalized: true
      };

      CloudDB.updateContract(this.contract.cloudId, payload, this.contract.cloudKey).then(() => {
        const importUrl = window.location.origin + window.location.pathname + '#import?id=' + this.contract.cloudId + '&key=' + this.contract.cloudKey;
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
