// ═══════════════════════════════════════════════════════
// Mídia da vistoria — captura, envio e exclusão.
//
// O que dá para testar mora em cima (validar/reduzir/url, funções puras);
// embaixo fica a parte que é câmera e DOM, verificada por auditoria de runtime.
//
// A câmera na página é a captura principal, mas NUNCA a única: getUserMedia não
// existe em contexto não-seguro (http:// fora de localhost), a permissão pode
// ser negada e a máquina pode não ter câmera. Sem o seletor de arquivo ao lado,
// a funcionalidade simplesmente não existe nesses casos — é a mesma proteção
// que a selfie do inquilino já carrega.
// ═══════════════════════════════════════════════════════

const Midias = {
  // Estes números são os MESMOS de server/rotas/midias.js. Deixá-los divergir
  // faz o locador esperar o upload inteiro para o servidor dizer não — por isso
  // o midias.test.js confere os dois lados.
  LIMITES: {
    foto: {
      teto: 8 * 1024 * 1024,
      max: 8,
      mimes: ['image/jpeg', 'image/png', 'image/webp'],
      rotulo: '8 MB'
    },
    video: {
      teto: 25 * 1024 * 1024,
      max: 2,
      mimes: ['video/webm', 'video/mp4', 'video/quicktime'],
      rotulo: '25 MB',
      segundos: 30
    }
  },

  // Maior dimensão da foto depois da redução. 1600px imprime bem e cabe na tela
  // de qualquer aparelho; o original de celular tem 3000-4000px e 3-5 MB.
  MAX_PX: 1600,

  // Devolve a mensagem do problema, ou null quando pode subir. `onde` só muda a
  // frase da cota: na vistoria a conta é por ambiente, no imóvel é por imóvel.
  validar(tipo, arquivo, quantidadeAtual, onde = 'ambiente') {
    const lim = this.LIMITES[tipo];
    if (!lim) return 'Tipo de mídia desconhecido.';
    if (!arquivo) return 'Nenhum arquivo selecionado.';
    if (lim.mimes.indexOf(arquivo.type) === -1) {
      return tipo === 'foto'
        ? 'Formato de imagem não aceito. Use JPG, PNG ou WEBP.'
        : 'Formato de vídeo não aceito. Use MP4, WEBM ou MOV.';
    }
    if (arquivo.size > lim.teto) return `Arquivo acima do limite de ${lim.rotulo}.`;
    if (quantidadeAtual >= lim.max) {
      return `Limite de ${lim.max} ${tipo === 'foto' ? 'fotos' : 'vídeos'} por ${onde} atingido.`;
    }
    return null;
  },

  // Cabe no quadrado de `maximo`, mantendo a proporção. Nunca amplia.
  reduzir(largura, altura, maximo) {
    const maior = Math.max(largura, altura);
    if (maior <= maximo) return { largura, altura };
    const fator = maximo / maior;
    return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) };
  },

  // O arquivo servido pelo backend. Nunca é caminho de disco: a leitura passa
  // por sessão, e é isso que impede a foto do imóvel de vazar por URL.
  url(id) {
    return '/api/midias/' + encodeURIComponent(id) + '/arquivo';
  },

  // ── Daqui para baixo: DOM, câmera e rede ──────────────────────────────

  _stream: null,
  _gravador: null,
  _pedacos: [],
  _corte: null,

  // Encolhe a foto antes de subir. Recebe um File/Blob, devolve um Blob JPEG.
  async encolherFoto(arquivo) {
    const bitmap = await createImageBitmap(arquivo);
    const { largura, altura } = this.reduzir(bitmap.width, bitmap.height, this.MAX_PX);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  },

  // Valida, reduz e sobe. Só `subir` sabe o destino — vistoria e imóvel dividem
  // tudo o que vem antes dele.
  async _preparar(tipo, arquivo, quantidadeAtual, onde, subir) {
    const problema = this.validar(tipo, arquivo, quantidadeAtual, onde);
    if (problema) { Utils.toast(problema, 'error'); return null; }

    let bytes = arquivo;
    if (tipo === 'foto') {
      try {
        bytes = await this.encolherFoto(arquivo);
      } catch (e) {
        // Imagem que o navegador não decodifica: sobe o original, que já passou
        // pela lista branca e pelo teto. Melhor um upload grande que nenhum.
        console.warn('Não deu para reduzir a foto:', e && e.message);
      }
    }

    try {
      return await subir(bytes);
    } catch (e) {
      Utils.toast('Não foi possível enviar: ' + (e.message || ''), 'error');
      return null;
    }
  },

  // Sobe e devolve a linha criada. Quem chama só mostra a miniatura DEPOIS
  // disto: a tela nunca exibe mídia que o servidor não confirmou.
  enviar(vistoriaId, ambiente, tipo, arquivo, quantidadeAtual) {
    return this._preparar(tipo, arquivo, quantidadeAtual, 'ambiente',
      bytes => Api.enviarMidia(vistoriaId, ambiente, tipo, bytes));
  },

  // O imóvel só aceita foto, então `tipo` não é parâmetro aqui.
  enviarDoImovel(imovelId, arquivo, quantidadeAtual) {
    return this._preparar('foto', arquivo, quantidadeAtual, 'imóvel',
      bytes => Api.enviarMidiaImovel(imovelId, bytes));
  },

  // Abre a câmera num <video> já existente na página. Devolve false quando não
  // dá — e é aí que o seletor de arquivo assume.
  async abrirCamera(elementoVideo, comAudio) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      Utils.toast('Câmera indisponível aqui — use "Escolher arquivo".', 'error');
      return false;
    }
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: !!comAudio
      });
      if (elementoVideo) elementoVideo.srcObject = this._stream;
      return true;
    } catch (e) {
      console.warn('Câmera indisponível:', e && e.message);
      Utils.toast('Câmera indisponível — use "Escolher arquivo".', 'error');
      return false;
    }
  },

  fecharCamera() {
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    this._stream = null;
  },

  // Um quadro do stream vira Blob JPEG já no tamanho final.
  fotografar(elementoVideo) {
    const { largura, altura } = this.reduzir(
      elementoVideo.videoWidth, elementoVideo.videoHeight, this.MAX_PX);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(elementoVideo, 0, 0, largura, altura);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  },

  // Grava com corte automático: 30s bastam para mostrar uma infiltração, e é o
  // que mantém o arquivo abaixo do teto sem depender de boa vontade.
  gravar(aoTerminar) {
    const mime = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm'))
      ? 'video/webm' : 'video/mp4';
    this._pedacos = [];
    this._gravador = new MediaRecorder(this._stream, { mimeType: mime });
    this._gravador.ondataavailable = e => { if (e.data.size) this._pedacos.push(e.data); };
    this._gravador.onstop = () => aoTerminar(new Blob(this._pedacos, { type: mime }));
    this._gravador.start();
    this._corte = setTimeout(() => this.pararGravacao(), this.LIMITES.video.segundos * 1000);
  },

  pararGravacao() {
    clearTimeout(this._corte);
    if (this._gravador && this._gravador.state !== 'inactive') this._gravador.stop();
    this._gravador = null;
  },

  // Pergunta pública: a tela alterna o mesmo botão entre gravar e parar, e não
  // deve depender de espiar `_gravador` de fora.
  gravando() {
    return !!this._gravador;
  }
};
