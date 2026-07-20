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
    let d = v.replace(/\D/g,'');
    if (!d) return '';
    d = (parseInt(d) / 100).toFixed(2);
    return 'R$ ' + d.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },

  // ── Formatação ──
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
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
  dateExtended(dateStr) {
    if (!dateStr) return '____________________';
    const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parts[2];
    return `${day} de ${months[month] || '___'} de ${year}`;
  },
  // ── Validação ──
  isCNPJ(v) {
    return (v || '').replace(/\D/g, '').length > 11;
  },
  // Locador é PJ? Vale a escolha explícita do perfil; sem ela, infere pelo documento
  isPJLocador(fields) {
    fields = fields || {};
    return fields.tipo_locador ? fields.tipo_locador === 'pj' : Utils.isCNPJ(fields.doc_locador);
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
  }
};
