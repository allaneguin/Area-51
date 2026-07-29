// ═══════════════════════════════════════════════════════
// Utilitários — Máscaras, formatação, validação, DOM helpers
// ═══════════════════════════════════════════════════════

const Utils = {
  // ── Máscaras de Input ──
  maskCPF(v) {
    return v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2')
      .replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2').slice(0,14);
  },
  maskCNPJ(v) {
    return v.replace(/\D/g,'').replace(/^(\d{2})(\d)/,'$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1/$2')
      .replace(/(\d{4})(\d)/,'$1-$2').slice(0,18);
  },
  maskCPFCNPJ(v) {
    const digits = v.replace(/\D/g,'');
    return digits.length <= 11 ? Utils.maskCPF(v) : Utils.maskCNPJ(v);
  },
  maskCurrency(v) {
    let d = String(v || '').replace(/\D/g,'');
    if (!d) return 'R$ 0,00';
    d = (parseInt(d) / 100).toFixed(2);
    return 'R$ ' + d.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },
  formatCurrency(val) {
    if (typeof val === 'number') {
      return 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Utils.maskCurrency(String(val || '0'));
  },

  // ── Formatação ──
  formatDate(date) {
    if (!date) return '';
    // "2026-05-28" (sem hora) é interpretado como UTC pelo Date e, em qualquer fuso
    // negativo — ou seja, no Brasil inteiro — voltava um dia ao formatar (27/05/2026).
    // Ancorar no fuso local resolve. Timestamps completos seguem o caminho normal.
    const isDateOnly = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
    const d = new Date(isDateOnly ? date + 'T00:00:00' : date);
    return d.toLocaleDateString('pt-BR');
  },
  formatRelativeDate(date) {
    const now = new Date();
    const d = new Date(date);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return Math.floor(diff/60) + ' min atrás';
    if (diff < 86400) return Math.floor(diff/3600) + 'h atrás';
    if (diff < 604800) return Math.floor(diff/86400) + 'd atrás';
    return Utils.formatDate(date);
  },

  // ── Validação ──
  // Locador é PJ? Vale a escolha explícita do perfil; sem ela, infere pelo
  // documento (mais de 11 dígitos = CNPJ).
  isPJLocador(fields) {
    fields = fields || {};
    if (fields.tipo_locador) return fields.tipo_locador === 'pj';
    return (fields.doc_locador || '').replace(/\D/g, '').length > 11;
  },
  isValidCPF(cpf) {
    cpf = cpf.replace(/\D/g,'');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    if (rest !== parseInt(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10) rest = 0;
    return rest === parseInt(cpf[10]);
  },

  isValidCNPJ(cnpj) {
    cnpj = (cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    const digito = (base) => {
      // pesos do CNPJ: 5..2,9..2 para o 1º dígito; 6,5..2,9..2 para o 2º
      let peso = base.length - 7;
      let sum = 0;
      for (let i = 0; i < base.length; i++) {
        sum += parseInt(base[i]) * peso--;
        if (peso < 2) peso = 9;
      }
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    if (digito(cnpj.slice(0, 12)) !== parseInt(cnpj[12])) return false;
    return digito(cnpj.slice(0, 13)) === parseInt(cnpj[13]);
  },

  // ── Aplicar Máscaras em Inputs ──
  applyMask(input, maskType) {
    input.addEventListener('input', () => {
      let fnName = 'mask' + maskType.charAt(0).toUpperCase() + maskType.slice(1);
      if (maskType.toLowerCase() === 'cpfcnpj') fnName = 'maskCPFCNPJ';

      const fn = Utils[fnName];
      if (fn) {
        const oldVal = input.value;
        const newVal = fn(oldVal);
        if (oldVal !== newVal) {
          input.value = newVal;
        }
      }
    });
  },

  // ── Pad de assinatura manuscrita (canvas) — usado pelo locador e pelo inquilino ──
  // onChange(dataUrl) roda a cada traço solto; quem chama decide onde salvar
  // (contract.fields.assinatura_locador ou .assinatura_locatario).
  wireSignaturePad(canvas, placeholder, initialDataUrl, onChange) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let hasDrawn = false;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && canvas.width !== rect.width) {
        canvas.width = rect.width;
        canvas.height = 150;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#143A66';
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        if (placeholder) placeholder.style.display = 'none';
        hasDrawn = true;
      };
      img.src = initialDataUrl;
    }

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDraw = (e) => {
      isDrawing = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      if (placeholder) placeholder.style.display = 'none';
    };

    const moveDraw = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      hasDrawn = true;
    };

    const stopDraw = () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (hasDrawn) onChange(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);
  },

  clearSignaturePad(canvas, placeholder) {
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (placeholder) placeholder.style.display = 'flex';
  },

  // ── Tema claro/escuro ──
  // O tema inicial é aplicado por um script inline no <head> (evita flash).
  // Aqui só alternamos e persistimos a escolha.
  toggleTheme() {
    const el = document.documentElement;
    const isDark = el.getAttribute('data-theme') === 'dark';
    if (isDark) {
      el.removeAttribute('data-theme');
    } else {
      el.setAttribute('data-theme', 'dark');
    }
    try {
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
    } catch (e) { /* localStorage bloqueado: tema vale só nesta sessão */ }
  },

  // ── Escape HTML (previne XSS em interpolação para innerHTML) ──
  esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  escapeHtml(v) {
    return Utils.esc(v);
  },

  // ── Toast (feedback não-bloqueante, substitui alert) ──
  toast(msg, type = 'success') {
    let box = document.getElementById('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('toast-out'), 4500);
    setTimeout(() => el.remove(), 4900);
  },

  // ── Número por extenso (1..99) ──
  // ponytail: 1..99 cobre o universo real de um prazo de locação.
  // Se um dia precisar de 100+, reaproveitar o convertGroup de writeBRLInWords.
  numeroPorExtenso(n) {
    n = parseInt(n, 10);
    if (!n || n < 1 || n > 99) return '';

    const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];

    const t = Math.floor(n / 10);
    const u = n % 10;

    if (t === 0) return units[u];
    if (t === 1) return teens[u];
    return u > 0 ? tens[t] + ' e ' + units[u] : tens[t];
  },

  // ── Prazo -> frase do contrato: (18,'meses') => "18 (dezoito) meses" ──
  prazoPorExtenso(qtd, unidade) {
    const n = parseInt(qtd, 10);
    const extenso = Utils.numeroPorExtenso(n);
    if (!extenso) return '';

    const emAnos = unidade === 'anos';
    const substantivo = emAnos ? (n === 1 ? 'ano' : 'anos') : (n === 1 ? 'mês' : 'meses');
    return `${String(n).padStart(2, '0')} (${extenso}) ${substantivo}`;
  },

  // ── Quantos meses dura o contrato ──
  // O select por extenso manda ("30 (trinta) meses..." -> 30). Em "personalizado"
  // o parse dá NaN de propósito e quem vale é a quantidade digitada + a unidade.
  mesesDoContrato(fields) {
    fields = fields || {};
    let meses = parseInt(fields.prazo_extenso, 10);
    if (!isNaN(meses) && meses > 0) return meses;

    const qtd = parseInt(fields.prazo_meses, 10);
    if (isNaN(qtd) || qtd <= 0) return 0;
    return fields.prazo_unidade === 'anos' ? qtd * 12 : qtd;
  },

  // ── Base dos links compartilháveis (inquilino/importação) ──
  // Em produção usa o atalho /c (rewrite no vercel.json): o link fica curto e
  // sem "app.html" no meio, o que lê melhor no WhatsApp. Rodando local
  // (file:// ou localhost, sem rewrite) mantém o caminho real.
  shareBaseUrl(loc) {
    loc = loc || window.location;
    const local = loc.protocol === 'file:' || /^(localhost|127\.)/.test(loc.hostname);
    return local ? loc.href.split('#')[0] : loc.origin + '/c';
  },

  // ── Modal de Compartilhamento do Link (Substitui prompt nativo no celular) ──
  showShareModal(url) {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => {
        copied = true;
        Utils.toast('Link seguro copiado para a área de transferência!', 'success');
      }).catch(() => {});
    }

    const oldModal = document.getElementById('app-share-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'app-share-modal';
    modal.className = 'share-modal-overlay';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;';

    modal.innerHTML = `
      <div style="background:var(--card-bg, #FFFFFF); border:1px solid var(--border-light, #CBD5E1); border-radius:16px; max-width:440px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); text-align:center; animation: fadeInScale 0.2s ease-out;">
        <div style="width:48px; height:48px; border-radius:12px; background:var(--primary-light, #EFF6FF); color:var(--primary, #1E40AF); display:grid; place-items:center; margin:0 auto 16px;">
          <svg style="width:24px; height:24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
        </div>
        <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main, #0F172A); margin:0 0 6px;">Link do Inquilino Gerado!</h3>
        <p style="font-size:0.875rem; color:var(--text-muted, #64748B); margin:0 0 16px; line-height:1.4;">
          ${copied ? 'O link foi copiado! Você também pode compartilhá-lo ou copiá-lo abaixo:' : 'Envie este link para o inquilino preencher os dados e assinar:'}
        </p>

        <div style="display:flex; gap:8px; margin-bottom:16px;">
          <input type="text" readonly id="share-modal-input" value="${Utils.esc(url)}"
            style="flex:1; font-size:0.85rem; padding:10px 12px; border:1px solid #CBD5E1; border-radius:8px; background:#F8FAFC; color:#1E293B; outline:none;"
            onclick="this.select()">
          <button type="button" class="btn btn-primary" style="padding:10px 16px; font-size:0.85rem; white-space:nowrap;"
            onclick="Utils.copyInput('share-modal-input')">
            📋 Copiar
          </button>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
          ${navigator.share ? `
            <button type="button" class="btn btn-whatsapp" style="width:100%; justify-content:center; padding:12px; font-size:0.9rem;"
              onclick="navigator.share({ title: 'Contrato de Locação', text: 'Olá! Por favor, preencha seus dados para o contrato de locação:', url: '${Utils.esc(url)}' }).catch(() => {})">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
              Compartilhar no WhatsApp / Apps
            </button>
          ` : ''}
          <button type="button" class="btn btn-secondary" style="width:100%; justify-content:center; padding:10px; font-size:0.85rem;"
            onclick="document.getElementById('app-share-modal').remove()">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const input = document.getElementById('share-modal-input');
    if (input) {
      input.focus();
      input.select();
    }
  },

  copyInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.focus();
    input.select();
    try {
      document.execCommand('copy');
      Utils.toast('Link copiado para a área de transferência!', 'success');
    } catch (e) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(input.value).then(() => {
          Utils.toast('Link copiado para a área de transferência!', 'success');
        });
      }
    }
  },

  // ── Dados do locatário exibidos na lista e no editor (uma fonte só) ──
  dadosClienteHTML(fields, createdAt) {
    fields = fields || {};
    const dataCriacao = createdAt ? Utils.formatDate(createdAt) : '';
    const inicio = fields.data_inicio ? Utils.formatDate(fields.data_inicio) : '';
    const termino = fields.data_termino ? Utils.formatDate(fields.data_termino) : '';
    const periodo = inicio && termino ? `${inicio} a ${termino}` : (inicio || '');

    const itens = [
      dataCriacao && ['Iniciado em', dataCriacao],
      fields.doc_locatario && ['CPF/CNPJ', Utils.maskCPFCNPJ(fields.doc_locatario)],
      fields.rg_locatario && ['RG', fields.rg_locatario],
      fields.prof_locatario && ['Profissão', fields.prof_locatario],
      fields.est_civil_locatario && ['Estado civil', fields.est_civil_locatario],
      inicio && ['Início Locação', inicio],
      periodo && ['Período Vigência', periodo],
      fields.dia_vencimento && ['Vencimento', `todo dia ${fields.dia_vencimento}`],
      fields.valor_aluguel && ['Aluguel', fields.valor_aluguel],
      fields.indice_reajuste && ['Reajuste', fields.indice_reajuste],
      fields.end_imovel && ['Imóvel', fields.end_imovel],
      // Evidência do aceite do inquilino (gravada no envio, junto com o hash do texto lido)
      fields.aceite_ts && ['Aceite do inquilino', new Date(fields.aceite_ts).toLocaleString('pt-BR') +
        (fields.aceite_hash ? ' · doc ' + fields.aceite_hash.slice(0, 12) + '…' : '')]
    ].filter(Boolean);

    if (!itens.length) return '';

    // Escape obrigatório: estes dados vêm do INQUILINO (anônimo) e vão para innerHTML.
    return `<div class="cliente-detalhes">` + itens.map(([rotulo, valor]) => `
      <div class="cliente-detalhe">
        <span class="cliente-detalhe-rotulo">${rotulo}</span>
        <span class="cliente-detalhe-valor">${Utils.esc(String(valor))}</span>
      </div>
    `).join('') + `</div>`;
  },

  // ── IDs ──
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  // ── Obter Status do Contrato ──
  getContractStatus(contract) {
    if (!contract || !contract.fields) {
      return { label: 'Pendente', class: 'badge-status-pending' };
    }
    
    const inicio = contract.fields.data_inicio;
    const termino = contract.fields.data_termino;
    
    if (!inicio || !termino) {
      return { label: 'Pendente', class: 'badge-status-pending' };
    }
    
    // Obter data atual no fuso local sem horas
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Converter datas ISO (YYYY-MM-DD) para objetos Date
    // Tratando no fuso local adicionando T00:00:00
    const dataInicio = new Date(inicio + 'T00:00:00');
    const dataTermino = new Date(termino + 'T23:59:59');
    
    if (hoje < dataInicio) {
      return { label: 'A Iniciar', class: 'badge-status-future' };
    } else if (hoje > dataTermino) {
      return { label: 'Vencido', class: 'badge-status-expired' };
    } else {
      return { label: 'Ativo', class: 'badge-status-active' };
    }
  },

  // ── Linha de contrato — mesma estrutura no dashboard e na gestão de contratos ──
  contractRow(c, { icon, title, meta, aside, onDelete }) {
    const status = Utils.getContractStatus(c);
    return `
      <div class="contract-row" onclick="window.location.hash='#editor?id=${c.id}'">
        <div class="contract-row-icon">${icon}</div>
        <div class="contract-row-info">
          <div class="contract-row-name">
            ${title}
            <span class="badge-status ${status.class}">${status.label}</span>
          </div>
          <div class="contract-row-meta">${meta}</div>
        </div>
        <div class="contract-row-date">
          ${aside}
          <button class="btn-icon contract-row-delete" title="Excluir contrato"
            onclick="event.stopPropagation(); ${onDelete}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>`;
  },

  // ── Escrever valor BRL por extenso ──
  writeBRLInWords(amountStr) {
    if (!amountStr) return '';
    const digits = amountStr.replace(/\D/g, '');
    if (!digits || parseInt(digits) === 0) return '';
    
    const value = parseInt(digits) / 100;
    const integerPart = Math.floor(value);
    const centsPart = Math.round((value - integerPart) * 100);

    const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const tens = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    function convertGroup(n) {
      if (n === 0) return '';
      if (n === 100) return 'cem';
      
      let out = [];
      const h = Math.floor(n / 100);
      const t = Math.floor((n % 100) / 10);
      const u = n % 10;
      
      if (h > 0) out.push(hundreds[h]);
      
      if (t === 1) {
        out.push(teens[u]);
      } else {
        if (t > 0) out.push(tens[t]);
        if (u > 0) out.push(units[u]);
      }
      
      return out.join(' e ');
    }

    let result = [];
    let tempInt = integerPart;
    const groups = [];
    while (tempInt > 0) {
      groups.push(tempInt % 1000);
      tempInt = Math.floor(tempInt / 1000);
    }
    
    const groupNamesSingular = ['real', 'mil', 'milhão', 'bilhão'];
    const groupNamesPlural = ['reais', 'mil', 'milhões', 'bilhões'];
    
    if (integerPart > 0) {
      for (let i = 0; i < groups.length; i++) {
        const val = groups[i];
        if (val === 0) continue;
        
        let text = convertGroup(val);
        if (i === 1 && val === 1) {
          text = 'mil';
        } else {
          const suffix = val === 1 ? groupNamesSingular[i] : groupNamesPlural[i];
          text = text + ' ' + suffix;
        }
        groups[i] = text;
      }
      
      const activeGroups = [];
      for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i]) {
          activeGroups.push({ val: Math.floor(integerPart / Math.pow(1000, i)) % 1000, text: groups[i], idx: i });
        }
      }
      
      let intText = '';
      for (let k = 0; k < activeGroups.length; k++) {
        if (k > 0) {
          const current = activeGroups[k];
          if (k === activeGroups.length - 1 && (current.val < 100 || current.val % 100 === 0)) {
            intText += ' e ';
          } else {
            intText += ' ';
          }
        }
        intText += activeGroups[k].text;
      }
      
      if (!groups[0]) {
        const lowestIdx = activeGroups[activeGroups.length - 1].idx;
        if (lowestIdx === 1) {
          intText += ' reais';
        } else if (lowestIdx > 1) {
          intText += ' de reais';
        }
      }
      result.push(intText);
    }
    
    if (centsPart > 0) {
      const centsText = convertGroup(centsPart) + (centsPart === 1 ? ' centavo' : ' centavos');
      if (result.length > 0) {
        result.push(' e ' + centsText);
      } else {
        result.push(centsText);
      }
    }
    
    return result.join('');
  },

  // ── Obter IP Público (com múltiplos provedores de fallback e timeout) ──
  async getIP() {
    const fetchWithTimeout = (url, parseFn, ms = 3000) => {
      return Promise.race([
        fetch(url).then(r => r.json()).then(parseFn),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
      ]);
    };

    try {
      return await fetchWithTimeout('https://api.ipify.org?format=json', d => d.ip, 3500);
    } catch (e1) {
      try {
        return await fetchWithTimeout('https://ipapi.co/json/', d => d.ip, 3500);
      } catch (e2) {
        return 'Não detectado (conexão/bloqueador)';
      }
    }
  },

  // ── Obter Coordenadas GPS (com permissão e timeout estendido) ──
  getGPS() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => {
          resolve({
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6),
            acc: Math.round(pos.coords.accuracy)
          });
        },
        (err) => {
          console.warn("GPS não obtido:", err.message);
          resolve(null);
        },
        { timeout: 8000, maximumAge: 300000, enableHighAccuracy: true }
      );
    });
  },

  // ── Consulta de Endereço por CEP (ViaCEP) ──
  async fetchCEP(cep) {
    if (!cep) return null;
    const clean = String(cep).replace(/\D/g, '');
    if (clean.length !== 8) return null;

    const fetchWithTimeout = (url, ms = 4000) => {
      return Promise.race([
        fetch(url).then(r => {
          if (!r.ok) throw new Error('Falha na consulta');
          return r.json();
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ViaCEP')), ms))
      ]);
    };

    try {
      const data = await fetchWithTimeout(`https://viacep.com.br/ws/${clean}/json/`);
      if (data && !data.erro) {
        return {
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || '',
          enderecoCompleto: [data.logradouro, data.bairro ? `Bairro ${data.bairro}` : '', data.localidade && data.uf ? `${data.localidade} - ${data.uf}` : ''].filter(Boolean).join(', ')
        };
      }
      return null;
    } catch (e) {
      console.warn("Erro ao buscar CEP no ViaCEP:", e);
      return null;
    }
  },

  // ── Renderizar Folha de Certificado de Assinatura Eletrônica ──
  renderCertificadoHTML(fields) {
    fields = fields || {};
    if (!fields.aceite_ts && !fields.assinatura_locatario && !fields.selfie_locatario) return '';

    const dataAceite = fields.aceite_ts ? new Date(fields.aceite_ts).toLocaleString('pt-BR') : 'Não informado';
    const ip = fields.ip_acesso || 'Não registrado';
    const gpsStr = fields.geo_lat && fields.geo_lng ? `${fields.geo_lat}, ${fields.geo_lng} (Precisão ±${fields.geo_acc || 0}m)` : 'Não fornecido pelo dispositivo';
    const hashDoc = fields.aceite_hash ? fields.aceite_hash.toUpperCase() : 'N/A';
    const userAgent = fields.user_agent || navigator.userAgent;

    return `
      <div class="cert-page" style="page-break-before: always; margin-top: 3rem; padding-top: 2rem; border-top: 3px double #1E3A8A; font-size: 9.5pt; color: #1E293B;">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <h2 style="font-size: 13pt; margin-bottom: 0.2rem; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em;">Certificado de Assinatura Eletrônica & Trilha de Auditoria</h2>
          <p style="font-size: 8.5pt; color: #64748B; margin: 0;">Documento assinado eletronicamente nos termos do Art. 10, § 2º da MP nº 2.200-2/2001 e da Lei nº 14.063/2020.</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; border: 1px solid #CBD5E1;">
          <tr style="background: #F8FAFC;">
            <th colspan="2" style="border: 1px solid #CBD5E1; padding: 6px 10px; text-align: left; font-size: 9pt; color: #0F172A;">1. DADOS DO ASSINANTE (LOCATÁRIO)</th>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px; width: 30%;"><strong>Nome Completo:</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;">${Utils.esc(fields.nome_locatario || '___')}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;"><strong>Documento (CPF):</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;">${Utils.esc(Utils.maskCPFCNPJ(fields.doc_locatario || ''))}</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; border: 1px solid #CBD5E1;">
          <tr style="background: #F8FAFC;">
            <th colspan="2" style="border: 1px solid #CBD5E1; padding: 6px 10px; text-align: left; font-size: 9pt; color: #0F172A;">2. EVIDÊNCIAS TÉCNICAS E TRILHA DE AUDITORIA</th>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px; width: 30%;"><strong>Data e Hora do Aceite:</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;">${dataAceite} (UTC)</td>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;"><strong>Endereço IP:</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;">${Utils.esc(ip)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;"><strong>Geolocalização (GPS):</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;">${Utils.esc(gpsStr)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;"><strong>Hash de Integridade (SHA-256):</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px; font-family: monospace; font-size: 8.5pt; word-break: break-all;">${hashDoc}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px;"><strong>Navegador / Dispositivo:</strong></td>
            <td style="border: 1px solid #CBD5E1; padding: 6px 10px; font-size: 8pt; color: #475569;">${Utils.esc(userAgent)}</td>
          </tr>
        </table>

        <div style="display: flex; gap: 1.5rem; justify-content: space-around; align-items: flex-start; margin-top: 1.5rem; border: 1px solid #CBD5E1; padding: 1rem; border-radius: 8px; background: #FAFAFA;">
          ${fields.assinatura_locatario ? `
            <div style="text-align: center; flex: 1;">
              <p style="font-weight: 700; font-size: 8.5pt; margin-bottom: 4px; color: #334155;">Rubrica Manuscrita Registrada:</p>
              <img src="${fields.assinatura_locatario}" alt="Rubrica Inquilino" style="max-height: 65px; max-width: 100%; border: 1px solid #E2E8F0; padding: 4px; background: #FFF; border-radius: 4px;">
            </div>
          ` : ''}

          ${fields.selfie_locatario ? `
            <div style="text-align: center; flex: 1;">
              <p style="font-weight: 700; font-size: 8.5pt; margin-bottom: 4px; color: #334155;">Selfie de Validação com Documento:</p>
              <img src="${fields.selfie_locatario}" alt="Selfie Inquilino" style="max-height: 100px; max-width: 100%; border: 1px solid #E2E8F0; padding: 4px; background: #FFF; border-radius: 6px; object-fit: contain;">
            </div>
          ` : ''}
        </div>

        <p style="text-align: center; font-size: 8pt; color: #94A3B8; margin-top: 1.5rem;">
          Este certificado é parte integrante e indissociável do contrato de locação correspondente.
        </p>
      </div>
    `;
  }
};

// ── Exportação em PDF (impressão nativa do navegador) ──
// nomeSugerido: o Chrome usa o title da página como nome do arquivo .pdf
function generatePDF(nomeSugerido) {
  const inputName = document.getElementById('contract-name');
  const nome = nomeSugerido || (inputName && inputName.value) || 'Contrato';

  const originalTitle = document.title;
  document.title = nome;
  window.print();
  document.title = originalTitle;
}
