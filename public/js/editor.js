// ═══════════════════════════════════════════════════════
// Editor View
// ═══════════════════════════════════════════════════════

const Editor = {
  contract: null,
  template: null,
  
  render(container, param) {
    let isNew = false;

    // #editor sem parâmetro dava TypeError (tela branca) antes do else lá embaixo.
    if (!param) { window.location.hash = '#dashboard'; return; }

    if (param.startsWith('template=')) {
      isNew = true;
      const tId = param.split('=')[1];
      this.template = Contracts[tId];
      if (!this.template) { window.location.hash = '#templates'; return; }
      
      this.contract = {
        name: 'Novo Contrato - ' + this.template.title,
        templateId: tId,
        fields: {}
      };
      
      // Auto-preencher dados do Locador e Timbre se disponíveis
      const profile = Storage.getAdminProfile();
      if (profile) {
        Object.keys(profile).forEach(k => {
          this.contract.fields[k] = profile[k];
        });
      }
      
      // Auto-preencher Data da Assinatura com a data de hoje por extenso
      const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const hoje = new Date();
      const diaExtenso = String(hoje.getDate()).padStart(2, '0');
      const mesExtenso = meses[hoje.getMonth()];
      const anoExtenso = hoje.getFullYear();
      this.contract.fields['data_assinatura'] = `${diaExtenso} de ${mesExtenso} de ${anoExtenso}`;

      // Métodos de validação exigidos do inquilino — o locador escolhe (padrão: ambos).
      this.contract.fields['exigir_assinatura'] = true;
      this.contract.fields['exigir_selfie'] = true;

    } else if (param.startsWith('id=')) {
      const cId = param.split('=')[1];
      this.contract = Storage.getById(cId);
      if (!this.contract) { window.location.hash = '#dashboard'; return; }
      this.template = Contracts[this.contract.templateId];
    } else {
      window.location.hash = '#dashboard'; return;
    }

    const isReadOnly = this.contract.isFinalized;
    const status = Utils.getContractStatus(this.contract);

    container.innerHTML = `
      <div class="editor-toolbar animate-fade-in-down">
        <div class="editor-toolbar-main">
          <input type="text" id="contract-name" class="form-input editor-toolbar-title" value="${Utils.esc(this.contract.name)}" ${isReadOnly ? 'disabled' : ''}>
          <span id="editor-contract-status" class="badge-status ${status.class}">${status.label}</span>
        </div>
        <div class="editor-toolbar-actions">
          ${!isReadOnly ? `
          <button class="btn btn-secondary" onclick="Editor.save(true)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
            Salvar
          </button>
          <button class="btn btn-primary" onclick="Editor.generateTenantLink()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            Gerar Link p/ Inquilino
          </button>
          ` : ''}
          <button class="btn btn-primary" onclick="generatePDF()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            PDF
          </button>
        </div>
      </div>

      <div class="editor-layout">
        <div class="editor-form-panel" id="form-container"></div>
        <div class="editor-preview-panel" id="preview-panel">
          <div class="preview-header">
            <span>Visualização do Documento</span>
            <button class="btn-icon close-preview-btn" onclick="document.getElementById('preview-panel').classList.remove('active')" title="Fechar Visualização">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <!-- thead/tfoot vazios: o navegador os repete em cada página
               impressa, e eles viram a margem de cima e de baixo da folha -->
          <table class="print-wrap">
            <thead><tr><td><div class="print-spacer-inner"></div></td></tr></thead>
            <tbody><tr><td>
              <div class="preview-document" id="preview-content">
                ${this.template.template}
              </div>
            </td></tr></tbody>
            <tfoot><tr><td><div class="print-spacer-inner"></div></td></tr></tfoot>
          </table>
        </div>
      </div>

      <button class="fab-preview" onclick="document.getElementById('preview-panel').classList.add('active')">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
        Ver Contrato
      </button>
    `;

    this.renderForm();
    this.updatePreview();
    
    document.getElementById('contract-name').addEventListener('change', (e) => {
      this.contract.name = e.target.value;
    });

    // Sincronização automática em segundo plano com a nuvem (caso o inquilino tenha preenchido)
    if (this.contract && this.contract.cloudId && this.contract.cloudKey && !this.contract.isFinalized) {
      CloudDB.loadContract(this.contract.cloudId, this.contract.cloudKey).then(cloudPayload => {
        // Só a seção Locatário e a trilha do aceite entram: o resto do payload é
        // montado no navegador do inquilino e não manda no contrato do locador.
        const mesclado = Utils.mesclarCamposDoInquilino(
          this.contract.fields, cloudPayload.f, this.contract.templateId, cloudPayload.evidencia);
        // Comparar contra o MERGE, não contra cloudPayload.f: o payload traz
        // campos que o merge descarta, e comparar com ele deixaria "mudou"
        // sempre verdadeiro — render() reentra e vira laço de requisições.
        const mudou = JSON.stringify(mesclado) !== JSON.stringify(this.contract.fields);

        if (mudou || cloudPayload.isFinalized) {
          this.contract.fields = mesclado;
          if (cloudPayload.isFinalized) {
            this.contract.isFinalized = true;
          }
          
          Storage.update(this.contract.id, {
            fields: this.contract.fields,
            isFinalized: this.contract.isFinalized
          });
          
          // Se mudou ou finalizou, re-renderizamos a view
          this.render(container, param);
        }
      }).catch(err => console.warn("Erro ao sincronizar com a nuvem no background:", err));
    }
  },
  
  renderForm() {
    const container = document.getElementById('form-container');
    const sections = {};
    
    // Group fields by section
    this.template.fields.forEach(f => {
      if (!sections[f.section]) sections[f.section] = [];
      sections[f.section].push(f);
    });

    // O inquilino já preencheu? Então o locador precisa VER os dados dele nesta tela,
    // e não uma seção oculta. Enquanto não preencheu, segue escondida como antes.
    const temDadosLocatario = !!(this.contract.fields && this.contract.fields.nome_locatario);

    const properties = Storage.getProperties();
    const clients = Storage.getClients();
    const inquilinos = clients.filter(c => c.client_type === 'Inquilino');
    const locadores = clients.filter(c => c.client_type === 'Locador');

    let html = '';

    if (!this.contract.isFinalized && (properties.length > 0 || clients.length > 0)) {
      html += `
        <div style="margin-bottom: 1.5rem; padding: 1.25rem; background: var(--primary-light); border: 1px solid var(--border-focus); border-radius: var(--radius-lg);">
          <h4 style="margin-top: 0; margin-bottom: 0.75rem; font-size: 0.95rem; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 18px; height: 18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Preenchimento Rápido com Cadastros
          </h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
            ${properties.length > 0 ? `
              <div>
                <label class="form-label">Importar Imóvel</label>
                <select class="form-input" style="font-size: 0.85rem;" onchange="Editor.applyPropertySelection(this.value)">
                  <option value="">Selecionar...</option>
                  ${properties.map(p => `<option value="${Utils.esc(p.id)}">${Utils.esc(p.name)} (${Utils.formatCurrency(p.rent_value || 0)})</option>`).join('')}
                </select>
              </div>
            ` : ''}
            ${inquilinos.length > 0 ? `
              <div>
                <label class="form-label">Importar Inquilino</label>
                <select class="form-input" style="font-size: 0.85rem;" onchange="Editor.applyClientSelection(this.value, 'locatario')">
                  <option value="">Selecionar...</option>
                  ${inquilinos.map(c => `<option value="${Utils.esc(c.id)}">${Utils.esc(c.name)}</option>`).join('')}
                </select>
              </div>
            ` : ''}
            ${locadores.length > 0 ? `
              <div>
                <label class="form-label">Importar Locador</label>
                <select class="form-input" style="font-size: 0.85rem;" onchange="Editor.applyClientSelection(this.value, 'locador')">
                  <option value="">Selecionar...</option>
                  ${locadores.map(c => `<option value="${Utils.esc(c.id)}">${Utils.esc(c.name)}</option>`).join('')}
                </select>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    for (const [secName, fields] of Object.entries(sections)) {
      // Ocultar as seções que vêm do AdminProfile ou que vão para o Inquilino
      const hiddenSections = ['locador', 'conta p/ pagamento'];
      if (!temDadosLocatario) hiddenSections.push('locatário');
      const isHidden = hiddenSections.includes(secName.toLowerCase());
      
      html += `
        <div class="form-section" style="${isHidden ? 'display: none;' : ''}">
          <div class="form-section-header" onclick="this.classList.toggle('collapsed')">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            <h3>${secName}</h3>
          </div>
          <div class="form-section-body">
      `;
      
      fields.forEach(f => {
        if (f.hidden) return;
        
        const val = this.contract.fields[f.name] || '';
        
        let inputHtml = '';
        const disabledAttr = this.contract.isFinalized ? 'disabled' : '';
        const readOnlyAttr = f.readonly ? 'readonly style="background-color: var(--seg-bg);"' : '';
        
        if (f.type === 'textarea') {
          inputHtml = `<textarea class="form-textarea" data-field="${f.name}" ${disabledAttr} ${readOnlyAttr}>${Utils.esc(val)}</textarea>`;
        } else if (f.type === 'select') {
          inputHtml = `<select class="form-input" data-field="${f.name}" ${disabledAttr} ${readOnlyAttr}>`;
          f.options.forEach(opt => {
            const isSelected = val === opt.value ? 'selected' : '';
            inputHtml += `<option value="${Utils.esc(opt.value)}" ${isSelected}>${Utils.esc(opt.label)}</option>`;
          });
          inputHtml += `</select>`;
        } else {
          inputHtml = `<input type="${f.type}" class="form-input" data-field="${f.name}" value="${Utils.esc(val)}" ${f.mask ? `data-mask="${f.mask}"` : ''} ${disabledAttr} ${readOnlyAttr}>`;
        }
        
        html += `<div class="form-group" data-group="${f.name}">
          <label class="form-label">${f.label}</label>
          ${inputHtml}
        </div>`;
      });
      
      html += `</div></div>`;
    }
    
    // Métodos de validação que o inquilino terá que completar para enviar.
    // Só editável antes de finalizar; a escolha viaja no link (fields).
    if (!this.contract.isFinalized) {
      const exigeAss = this.contract.fields.exigir_assinatura !== false;
      const exigeSelfie = this.contract.fields.exigir_selfie !== false;
      const check = (marcado, campo, label) => `
        <label style="display:flex; align-items:center; gap:10px; padding:11px 13px; border:1px solid var(--border-light); border-radius:8px; margin-bottom:8px; cursor:pointer; font-size:14px; color:var(--text-main);">
          <input type="checkbox" style="width:18px; height:18px; accent-color:var(--primary); cursor:pointer; flex-shrink:0;" ${marcado ? 'checked' : ''} onchange="Editor.setMetodo('${campo}', this.checked)">
          ${label}
        </label>`;
      html += `
        <div class="form-section">
          <div class="form-section-header" onclick="this.classList.toggle('collapsed')">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            <h3>Validação do Inquilino</h3>
          </div>
          <div class="form-section-body">
            <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 12px;">Escolha o que o inquilino precisará fazer para enviar o contrato. A assinatura por escrito ("Declaro que li e concordo") é sempre exigida.</p>
            ${check(exigeAss, 'exigir_assinatura', 'Assinatura manuscrita (desenhada com o dedo/mouse)')}
            ${check(exigeSelfie, 'exigir_selfie', 'Validação facial (selfie com documento)')}
          </div>
        </div>
      `;
    }

    // Assinatura do locador: sempre disponível (assina quando quiser, antes ou
    // depois do inquilino) — diferente da validação acima, que é exigência dele.
    html += `
      <div class="form-section">
        <div class="form-section-header" onclick="this.classList.toggle('collapsed')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          <h3>Assinatura do Locador</h3>
        </div>
        <div class="form-section-body">
          <div style="position: relative; border: 2px dashed var(--border-light); border-radius: 10px; background: var(--card-bg); overflow: hidden; touch-action: none;">
            <canvas id="locador-signature-canvas" height="150" style="width: 100%; display: block; cursor: crosshair;"></canvas>
            <div id="locador-signature-placeholder" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--text-light); pointer-events: none; font-size: 0.9rem; font-weight: 500;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              Desenhe sua assinatura aqui
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
            <button type="button" class="btn btn-secondary" style="font-size: 0.8rem; padding: 4px 12px;" onclick="Editor.clearLocadorSignature()">Limpar Assinatura</button>
          </div>
        </div>
      </div>
    `;

    if (sections['Locatário'] && !this.contract.isFinalized && !temDadosLocatario) {
      html += `
        <div class="form-section">
          <div style="padding: 1rem; text-align: center; color: var(--success); border: 1px dashed var(--success); border-radius: 8px; margin-bottom: 1rem;">
            <p style="margin:0;"><strong>✓ Seus dados e da sua Conta Bancária foram carregados automaticamente.</strong></p>
          </div>
          <div style="padding: 1rem; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-light); border-radius: 8px;">
            <p>A seção <strong>Locatário</strong> está oculta.</p>
            <p style="font-size: 0.9em; margin-top: 5px;">Clique em "Gerar Link p/ Inquilino" para que ele mesmo preencha estes dados.</p>
          </div>
        </div>
      `;
    }

    if (this.contract.isFinalized) {
      html = `
        <div style="padding: 1.5rem; text-align: center; background: rgba(37, 211, 102, 0.1); color: #25D366; border: 1px solid #25D366; border-radius: 8px; margin-bottom: 2rem;">
          <h3 style="margin-bottom: 0.5rem; font-weight: 700; letter-spacing: -0.02em;">Contrato Finalizado</h3>
          <p style="margin: 0; font-size: 0.95rem;">Os dados foram preenchidos pelo inquilino e estão bloqueados para edição.<br>Você já pode exportar o PDF definitivo.</p>
        </div>
      ` + html;
    }

    // Resumo do cliente no topo: o locador abre o contrato e já vê com quem está lidando,
    // sem ter que caçar campo por campo no formulário.
    if (temDadosLocatario) {
      const st = Utils.getContractStatus(this.contract);
      html = `
        <div class="cliente-resumo">
          <div class="cliente-resumo-head">
            <span class="cliente-resumo-nome">${Utils.esc(this.contract.fields.nome_locatario)}</span>
            <span class="badge-status ${st.class}">${st.label}</span>
            ${this.contract.fields.valor_aluguel ? `<span class="cliente-resumo-valor">${Utils.esc(this.contract.fields.valor_aluguel)}<small>/mês</small></span>` : ''}
          </div>
          ${Utils.dadosClienteHTML(this.contract.fields)}
        </div>
      ` + html;
    }

    container.innerHTML = html;
    this.togglePrazoPersonalizado();
    this.toggleGarantiaFields();
    setTimeout(() => this.initLocadorSignaturePad(), 50);

    // Attach listeners
    container.querySelectorAll('input, textarea, select').forEach(el => {
      // Masks
      const mask = el.getAttribute('data-mask');
      if (mask) Utils.applyMask(el, mask);
      
      // Live Preview
      el.addEventListener('input', () => {
        const fieldName = el.getAttribute('data-field');
        this.contract.fields[fieldName] = el.value;
        
        // Auto-preencher valor por extenso se for campo monetário
        if (fieldName === 'valor_aluguel' || fieldName === 'valor_bonus' || fieldName === 'valor_caucao') {
          let targetExtensoField = 'valor_extenso';
          if (fieldName === 'valor_bonus') targetExtensoField = 'valor_bonus_extenso';
          if (fieldName === 'valor_caucao') targetExtensoField = 'valor_caucao_extenso';

          const extensoVal = Utils.writeBRLInWords(el.value);
          this.contract.fields[targetExtensoField] = extensoVal;
          
          // Atualiza o valor no input correspondente na tela se existir
          const extensoEl = container.querySelector(`[data-field="${targetExtensoField}"]`);
          if (extensoEl) extensoEl.value = extensoVal;
        }
        
        if (fieldName === 'prazo_extenso') this.togglePrazoPersonalizado();
        if (fieldName === 'tipo_garantia') this.toggleGarantiaFields();

        // CEP completo -> busca o endereço na ViaCEP
        if (fieldName && fieldName.includes('cep')) this.buscarCEP(el.value, fieldName);

        // Auto-calcular Data de Término
        if (fieldName === 'data_inicio' || fieldName === 'prazo_extenso' || fieldName === 'prazo_meses' || fieldName === 'prazo_unidade') {
          const termino = Utils.calcularDataTermino(this.contract.fields);
          if (termino) {
            this.contract.fields['data_termino'] = termino;
            const termEl = container.querySelector('[data-field="data_termino"]');
            if (termEl) termEl.value = termino;
          }
        }
        
        this.updatePreview();
        this.updateStatusBadge();
      });
    });
  },

  // CEP de qual parte → qual campo de endereço; o fluxo em si é o Utils.applyCEPToInput
  async buscarCEP(cep, fieldName = 'cep_imovel') {
    let targetFieldName = 'end_imovel';
    if (fieldName.includes('locador')) targetFieldName = 'end_locador';
    if (fieldName.includes('locatario')) targetFieldName = 'end_locatario';
    if (fieldName.includes('fiador')) targetFieldName = 'end_fiador';

    const endereco = await Utils.applyCEPToInput(cep, document.querySelector(`[data-field="${targetFieldName}"]`),
      'Endereço preenchido automaticamente pelo CEP — complete com o número.');
    if (!endereco) return;

    this.contract.fields[targetFieldName] = endereco;
    this.updatePreview();
  },

  // Liga/desliga um método de validação exigido do inquilino (guardado em fields).
  setMetodo(campo, valor) {
    this.contract.fields[campo] = valor;
  },

  initLocadorSignaturePad() {
    const canvas = document.getElementById('locador-signature-canvas');
    const placeholder = document.getElementById('locador-signature-placeholder');
    Utils.wireSignaturePad(canvas, placeholder, this.contract.fields.assinatura_locador, (dataUrl) => {
      this.contract.fields.assinatura_locador = dataUrl;
      this.updatePreview();
    });
  },

  clearLocadorSignature() {
    Utils.clearSignaturePad(document.getElementById('locador-signature-canvas'), document.getElementById('locador-signature-placeholder'));
    delete this.contract.fields.assinatura_locador;
    this.updatePreview();
  },

  togglePrazoPersonalizado() {
    if (!this.template.fields.some(f => f.name === 'prazo_extenso')) return;
    const mostrar = this.contract.fields['prazo_extenso'] === 'personalizado';
    ['prazo_meses', 'prazo_unidade'].forEach(nome => {
      const grupo = document.querySelector(`[data-group="${nome}"]`);
      if (grupo) grupo.style.display = mostrar ? '' : 'none';
    });
  },

  toggleGarantiaFields() {
    if (!this.template.fields.some(f => f.name === 'tipo_garantia')) return;
    const tipo = this.contract.fields['tipo_garantia'] || 'sem_garantia';
    const isFiador = tipo === 'fiador';
    const isCaucao = tipo === 'caucao';
    
    ['nome_fiador', 'rg_fiador', 'doc_fiador', 'end_fiador'].forEach(nome => {
      const grupo = document.querySelector(`[data-group="${nome}"]`);
      if (grupo) grupo.style.display = isFiador ? '' : 'none';
    });
    ['valor_caucao', 'valor_caucao_extenso'].forEach(nome => {
      const grupo = document.querySelector(`[data-group="${nome}"]`);
      if (grupo) grupo.style.display = isCaucao ? '' : 'none';
    });
  },

  updatePreview() {
    const prev = document.getElementById('preview-content');
    if (!prev) return;

    // Núcleo compartilhado com a tela do inquilino (Utils.updateContractPreview);
    // aqui só ficam o sinal de campo vazio ('borda') e o certificado, que é do locador.
    Utils.updateContractPreview(prev, this.contract.fields, this.template, 'borda');

    // Renderizar Certificado de Assinatura se houver trilha de auditoria
    let certArea = prev.querySelector('.cert-page-container');
    const certHTML = Utils.renderCertificadoHTML(this.contract.fields);
    if (certHTML) {
      if (certArea) {
        certArea.innerHTML = certHTML;
      } else {
        certArea = document.createElement('div');
        certArea.className = 'cert-page-container';
        certArea.innerHTML = certHTML;
        prev.appendChild(certArea);
      }
    } else if (certArea) {
      certArea.remove();
    }
  },

  save(showAlert = false) {
    if (this.contract.id) {
      Storage.update(this.contract.id, this.contract);
    } else {
      this.contract = Storage.create(this.contract);
      window.location.hash = `#editor?id=${this.contract.id}`;
    }
    if(showAlert) Utils.toast('Contrato salvo com sucesso!');
  },

  generateTenantLink() {
    // Não deixa gerar link com o contrato em branco: o aceite do inquilino só tem
    // valor jurídico se os termos essenciais já estiverem no documento que ele vai ler.
    const f = this.contract.fields || {};
    const faltando = [
      !f.valor_aluguel && 'Valor do aluguel',
      !f.end_imovel && 'Endereço do imóvel',
      !f.data_inicio && 'Data de início',
      !(Utils.mesesDoContrato(f) > 0) && 'Prazo do contrato',
      !f.dia_vencimento && 'Dia de vencimento'
    ].filter(Boolean);
    if (faltando.length) {
      Utils.toast('Antes de enviar ao inquilino, preencha: ' + faltando.join(', ') + '.', 'error');
      return;
    }

    this.save(false);

    // Mudar o botão para estado de carregamento
    const btn = document.querySelector('button[onclick="Editor.generateTenantLink()"]');
    let originalHTML = '';
    if (btn) {
      originalHTML = btn.innerHTML;
      btn.innerHTML = `<svg class="animate-spin" style="animation: spin 1s linear infinite; width:16px; height:16px; margin-right:5px; display:inline-block; vertical-align:middle;" fill="none" viewBox="0 0 24 24"><circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Gerando link seguro...`;
      btn.disabled = true;
    }
    
    const payload = {
      t: this.contract.templateId,
      f: this.contract.fields,
      localId: this.contract.id
    };
    
    const restoreBtn = () => {
      if (btn) {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }
    };

    const finalize = (serverId, key) => {
      const url = `${Utils.shareBaseUrl()}#tenant?id=${serverId}&key=${key}`;
      Utils.showShareModal(url);
      restoreBtn();
    };

    const createNewLink = () => {
      const key = CloudDB.generateKey();
      return CloudDB.saveContract(payload, key).then(serverId => {
        this.contract.cloudId = serverId;
        this.contract.cloudKey = key;
        // Salva as chaves de nuvem no localStorage do locador
        Storage.update(this.contract.id, { cloudId: serverId, cloudKey: key });
        finalize(serverId, key);
      });
    };

    if (this.contract.cloudId && this.contract.cloudKey) {
      // Relê a nuvem antes de sobrescrever: se o inquilino já finalizou, NÃO apaga os dados dele.
      CloudDB.loadContract(this.contract.cloudId, this.contract.cloudKey)
        .then(cloudPayload => {
          if (cloudPayload.isFinalized) {
            Utils.toast('O inquilino já preencheu este contrato — apenas copiei o link novamente.');
            finalize(this.contract.cloudId, this.contract.cloudKey);
            return;
          }
          return CloudDB.updateContract(this.contract.cloudId, payload, this.contract.cloudKey)
            .then(() => finalize(this.contract.cloudId, this.contract.cloudKey));
        })
        .catch(err => {
          // Conexão caiu: o link pode estar vivo e sendo preenchido agora.
          // Descartá-lo aqui deixaria o inquilino trabalhando num link que o
          // locador não consegue mais importar.
          if (err.transporte) {
            Utils.toast(err.message, 'error');
            restoreBtn();
            return;
          }
          // O servidor respondeu e o link não serve mais: expirado, removido, ou
          // payload adulterado por quem tinha a URL (só o id é preciso para
          // sobrescrever). Nos três casos o certo é descartar e gerar outro. O
          // filtro por mensagem que existia aqui não casava com "Chave do link
          // incorreta", e o contrato ficava preso a um link morto, para sempre.
          console.warn('Link antigo ilegível, gerando outro:', err.message);
          this.contract.cloudId = null;
          this.contract.cloudKey = null;
          Storage.update(this.contract.id, { cloudId: null, cloudKey: null });
          createNewLink().catch(e2 => {
            Utils.toast('Erro ao gerar novo link: ' + e2.message, 'error');
            restoreBtn();
          });
        });
    } else {
      createNewLink().catch(err => {
        Utils.toast('Erro ao salvar contrato seguro no servidor: ' + err.message, 'error');
        restoreBtn();
      });
    }
  },

  updateStatusBadge() {
    const badge = document.getElementById('editor-contract-status');
    if (badge) {
      const status = Utils.getContractStatus(this.contract);
      badge.className = `badge-status ${status.class}`;
      badge.textContent = status.label;
    }
  },

  applyPropertySelection(propId) {
    if (!propId) return;
    const prop = Storage.getProperties().find(p => p.id === propId);
    if (!prop) return;

    // O vínculo com o cadastro: é o que permite status automático do imóvel,
    // histórico de contratos e receita por imóvel. Vive em fields, então
    // persiste com o contrato e sobrevive ao round-trip do link do inquilino.
    this.contract.fields['property_id'] = prop.id;

    if (prop.address) this.contract.fields['end_imovel'] = prop.address;
    if (prop.cep) this.contract.fields['cep_imovel'] = prop.cep;

    // Descrição montada das características do cadastro — só se o locador
    // ainda não escreveu a dele (texto de contrato editado à mão tem prioridade).
    if (!this.contract.fields['desc_imovel']) {
      const partes = [
        prop.type && `Imóvel ${String(prop.type).toLowerCase()}`,
        prop.bedrooms > 0 && `${prop.bedrooms} quarto(s)`,
        prop.bathrooms > 0 && `${prop.bathrooms} banheiro(s)`,
        prop.parking > 0 && `${prop.parking} vaga(s) de garagem`,
        prop.area > 0 && `${prop.area} m²`
      ].filter(Boolean);
      if (partes.length) this.contract.fields['desc_imovel'] = partes.join(', ');
    }

    if (prop.rent_value) {
      // Mascara ANTES do extenso: writeBRLInWords espera valor em formato BRL
      const valorMascarado = Utils.formatCurrency(prop.rent_value);
      this.contract.fields['valor_aluguel'] = valorMascarado;
      this.contract.fields['valor_extenso'] = Utils.writeBRLInWords(valorMascarado);
    }
    if (prop.iptu_value) this.contract.fields['valor_iptu'] = Utils.formatCurrency(prop.iptu_value);
    if (prop.condo_value) this.contract.fields['valor_condominio'] = Utils.formatCurrency(prop.condo_value);

    Utils.toast(`Imóvel "${prop.name}" importado para o contrato!`);
    this.renderForm();
    this.updatePreview();
  },

  applyClientSelection(clientId, role) {
    if (!clientId) return;
    const client = Storage.getClients().find(c => c.id === clientId);
    if (!client) return;

    if (role === 'locatario') {
      if (client.name) this.contract.fields['nome_locatario'] = client.name;
      if (client.document) this.contract.fields['doc_locatario'] = client.document;
      if (client.rg) this.contract.fields['rg_locatario'] = client.rg;
      if (client.email) this.contract.fields['email_locatario'] = client.email;
      if (client.phone) this.contract.fields['tel_locatario'] = client.phone;
      if (client.address) this.contract.fields['end_locatario'] = client.address;
      if (client.profession) this.contract.fields['prof_locatario'] = client.profession;
      Utils.toast(`Inquilino "${client.name}" importado!`);
    } else if (role === 'locador') {
      if (client.name) this.contract.fields['nome_locador'] = client.name;
      if (client.document) this.contract.fields['doc_locador'] = client.document;
      if (client.rg) this.contract.fields['rg_locador'] = client.rg;
      if (client.email) this.contract.fields['email_locador'] = client.email;
      if (client.phone) this.contract.fields['tel_locador'] = client.phone;
      if (client.address) this.contract.fields['end_locador'] = client.address;
      Utils.toast(`Locador "${client.name}" importado!`);
    }

    this.renderForm();
    this.updatePreview();
  }
};
