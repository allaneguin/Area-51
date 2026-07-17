// ═══════════════════════════════════════════════════════
// Editor View
// ═══════════════════════════════════════════════════════

const Editor = {
  contract: null,
  template: null,
  
  render(container, param) {
    let isNew = false;
    
    if (param.startsWith('template=')) {
      isNew = true;
      const tId = param.split('=')[1];
      this.template = Contracts[tId] || (Storage._getData().customTemplates || []).find(t => t.id === tId);
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
      
    } else if (param.startsWith('id=')) {
      const cId = param.split('=')[1];
      this.contract = Storage.getById(cId);
      if (!this.contract) { window.location.hash = '#dashboard'; return; }
      this.template = Contracts[this.contract.templateId] || (Storage._getData().customTemplates || []).find(t => t.id === this.contract.templateId);
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
        <div class="editor-form-panel glass" id="form-container"></div>
        <div class="editor-preview-panel glass" id="preview-panel">
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
        const localFieldsStr = JSON.stringify(this.contract.fields);
        const cloudFieldsStr = JSON.stringify(cloudPayload.f);
        
        if (localFieldsStr !== cloudFieldsStr || cloudPayload.isFinalized) {
          this.contract.fields = cloudPayload.f;
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

    let html = '';
    for (const [secName, fields] of Object.entries(sections)) {
      // Ocultar as seções que vêm do AdminProfile ou que vão para o Inquilino
      const hiddenSections = ['locatário', 'locador', 'conta p/ pagamento'];
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
        const readOnlyAttr = f.readonly ? 'readonly style="background-color: var(--bg);"' : '';
        
        if (f.type === 'textarea') {
          inputHtml = `<textarea class="form-textarea" data-field="${f.name}" ${disabledAttr} ${readOnlyAttr}>${Utils.esc(val)}</textarea>`;
        } else if (f.type === 'select') {
          inputHtml = `<select class="form-input" data-field="${f.name}" ${disabledAttr} ${readOnlyAttr}>`;
          f.options.forEach(opt => {
            const isSelected = val === opt.value ? 'selected' : '';
            inputHtml += `<option value="${opt.value}" ${isSelected}>${opt.label}</option>`;
          });
          inputHtml += `</select>`;
        } else {
          inputHtml = `<input type="${f.type}" class="form-input" data-field="${f.name}" value="${Utils.esc(val)}" ${f.mask ? `data-mask="${f.mask}"` : ''} ${disabledAttr} ${readOnlyAttr}>`;
        }
        
        html += `<div class="form-group">
          <label class="form-label">${f.label}</label>
          ${inputHtml}
        </div>`;
      });
      
      html += `</div></div>`;
    }
    
    if (sections['Locatário'] && !this.contract.isFinalized) {
      html += `
        <div class="form-section">
          <div style="padding: 1rem; text-align: center; color: var(--success); border: 1px dashed var(--success); border-radius: 8px; margin-bottom: 1rem;">
            <p style="margin:0;"><strong>✓ Seus dados e da sua Conta Bancária foram carregados automaticamente.</strong></p>
          </div>
          <div style="padding: 1rem; text-align: center; color: var(--text-muted); border: 1px dashed var(--border); border-radius: 8px;">
            <p>A seção <strong>Locatário</strong> está oculta.</p>
            <p style="font-size: 0.9em; margin-top: 5px;">Clique em "Gerar Link p/ Inquilino" para que ele mesmo preencha estes dados.</p>
          </div>
        </div>
      `;
    }

    if (this.contract.isFinalized) {
      html = `
        <div style="padding: 1.5rem; text-align: center; background: rgba(37, 211, 102, 0.1); color: #25D366; border: 1px solid #25D366; border-radius: 8px; margin-bottom: 2rem;">
          <h3 style="margin-bottom: 0.5rem; font-weight: 800; letter-spacing: -0.02em;">Contrato Finalizado</h3>
          <p style="margin: 0; font-size: 0.95rem;">Os dados foram preenchidos pelo inquilino e estão bloqueados para edição.<br>Você já pode exportar o PDF definitivo.</p>
        </div>
      ` + html;
    }

    container.innerHTML = html;

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
        if (fieldName === 'valor_aluguel' || fieldName === 'valor_bonus') {
          const targetExtensoField = fieldName === 'valor_aluguel' ? 'valor_extenso' : 'valor_bonus_extenso';
          const extensoVal = Utils.writeBRLInWords(el.value);
          this.contract.fields[targetExtensoField] = extensoVal;
          
          // Atualiza o valor no input correspondente na tela se existir
          const extensoEl = container.querySelector(`[data-field="${targetExtensoField}"]`);
          if (extensoEl) extensoEl.value = extensoVal;
        }
        
        // Auto-calcular Data de Término
        if (fieldName === 'data_inicio' || fieldName === 'prazo_extenso' || fieldName === 'prazo_meses') {
          const inicio = this.contract.fields['data_inicio'];
          const prazoExtenso = this.contract.fields['prazo_extenso'];
          const prazoMeses = this.contract.fields['prazo_meses'];
          
          let meses = 0;
          if (prazoExtenso) {
            meses = parseInt(prazoExtenso.split(' ')[0], 10);
          } else if (prazoMeses) {
            meses = parseInt(prazoMeses, 10);
          }
          
          if (inicio && meses > 0) {
            const d = new Date(inicio + 'T12:00:00Z');
            d.setMonth(d.getMonth() + meses);
            d.setDate(d.getDate() - 1); // Ex: Começa 01/06/2020, termina 31/05/2021
            
            const ano = d.getUTCFullYear();
            const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dia = String(d.getUTCDate()).padStart(2, '0');
            const termino = `${ano}-${mes}-${dia}`;
            
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

  updatePreview() {
    const prev = document.getElementById('preview-content');
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
      if(val) el.style.borderBottom = 'none';
      else el.style.borderBottom = '2px dashed var(--primary)';
    });

    // Locador PJ (CNPJ): oculta nacionalidade, estado civil e RG no texto
    const pjLocador = Utils.isPJLocador(this.contract.fields);
    prev.querySelectorAll('.pf-locador').forEach(el => el.style.display = pjLocador ? 'none' : '');
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
      const baseUrl = window.location.href.split('#')[0];
      const url = `${baseUrl}#tenant?id=${serverId}&key=${key}`;

      navigator.clipboard.writeText(url).then(() => {
        Utils.toast('Link seguro copiado! Envie no WhatsApp do inquilino para ele preencher.');
      }).catch(() => {
        // ponytail: prompt nativo como fallback — deixa o usuário copiar a URL na mão
        prompt('Não foi possível copiar automaticamente. Copie o link abaixo:', url);
      });

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
          // Link expirou/sumiu: limpa a referência e gera um novo automaticamente
          if (/expir|não existe|inexistente/i.test(err.message)) {
            this.contract.cloudId = null;
            this.contract.cloudKey = null;
            Storage.update(this.contract.id, { cloudId: null, cloudKey: null });
            createNewLink().catch(e2 => {
              Utils.toast('Erro ao gerar novo link: ' + e2.message, 'error');
              restoreBtn();
            });
            return;
          }
          Utils.toast('Erro ao atualizar contrato no servidor: ' + err.message, 'error');
          restoreBtn();
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
  }
};
