// ═══════════════════════════════════════════════════════
// App Principal & Router
// ═══════════════════════════════════════════════════════

const App = {
  routes: {
    '': 'dashboard',
    '#': 'dashboard',
    '#dashboard': 'dashboard',
    '#properties': 'properties',
    '#clients': 'clients',
    '#templates': 'templates',
    '#contracts': 'contracts',
    '#financial': 'financial',
    '#renovacoes': 'renovacoes',
    '#vistorias': 'vistorias',
    '#editor': 'editor',
    '#admin': 'admin',
    '#superadmin': 'superadmin',
    '#tenant': 'tenant',
    '#import': 'import'
  },
  
  init() {
    this.container = document.getElementById('main-content');
    
    // O Api avisa quando a sessao muda. Diferenca de fundo em relacao ao
    // onAuthStateChange da Supabase: aquele reemitia sozinho (refresh de token
    // ~1x/h, refoco de aba) com o MESMO usuario, e era preciso filtrar para nao
    // destruir um formulario em edicao. Aqui so emite quando algo muda de
    // verdade, porque so emitimos nos. A guarda por _lastUid fica assim mesmo:
    // custa uma comparacao e protege de um ouvinte registrado duas vezes.
    Api.aoMudarSessao((user) => {
      this.user = user;
      this.updateAuthUI();

      const newUid = user ? user.id : null;
      if (newUid === this._lastUid) return;

      // Login de outro usuario ou logout: descarta caches em memoria do usuario
      // anterior (senao contratos/perfil de A poderiam renderizar para B no
      // mesmo navegador).
      Storage.clearAll();
      this._lastUid = newUid;

      if (user) {
        Storage.loadCloudData().then(() => this.handleRoute());
      } else {
        this.handleRoute();
      }
    });

    window.addEventListener('hashchange', () => this.handleRoute());

    // Pergunta ao servidor quem esta logado. Ate a resposta chegar, o Api
    // considera ninguem — fail-closed: o painel nao abre sem saber de quem e.
    Api.carregarSessao();
  },
  
  // Mostra os controles que dependem de sessão: "Sair" (barra lateral e header mobile)
  // e o acesso de administrador. Esconder é cortesia de UI — quem protege os
  // dados é o escopo por sessão no servidor (server/rotas/recursos.js).
  updateAuthUI() {
    document.querySelectorAll('.logout-action').forEach(el => {
      el.hidden = !this.user;
    });

    const isAdmin = !!(this.user && typeof SuperAdmin !== 'undefined' && SuperAdmin.isAdmin());
    document.querySelectorAll('.admin-action').forEach(el => {
      el.hidden = !isAdmin;
    });

    // Nome da conta sob a marca, na barra lateral. textContent (nunca
    // innerHTML): o e-mail vem do provedor de identidade, e escapar no sink
    // é a regra sem exceção (R5.4).
    const conta = document.getElementById('sidebar-account');
    if (conta) conta.textContent = this.user ? (this.user.email || '') : '';
  },

  handleRoute() {
    const hash = window.location.hash;
    const [path, param] = hash.split('?');
    
    const route = this.routes[path] || 'dashboard';

    // Fluxo de redefinição de senha (link do e-mail).
    // A rota do inquilino (#tenant) passa direto — ele não pode ser bloqueado pelo recovery do locador.
    if (false) {
      document.body.classList.add('tenant-mode');
      AuthUI.renderNewPassword(this.container);
      return;
    }

    // Interceptação de login
    if (!this.user && route !== 'tenant') {
      document.body.classList.add('tenant-mode'); // Esconde sidebar/navbar
      AuthUI.render(this.container);
      return;
    }
    
    // Esconder a navegação e a sidebar se for a tela do Tenant (Cliente)
    if (route === 'tenant') {
      document.body.classList.add('tenant-mode');
    } else {
      document.body.classList.remove('tenant-mode');
    }

    this.updateNav(route);

    if (route === 'dashboard') Dashboard.render(this.container);
    else if (route === 'properties') PropertiesView.render(this.container);
    else if (route === 'clients') ClientsView.render(this.container);
    else if (route === 'templates') Templates.render(this.container);
    else if (route === 'contracts') ContractsView.render(this.container);
    else if (route === 'financial') Financeiro.render(this.container);
    else if (route === 'renovacoes') Renovacoes.render(this.container);
    else if (route === 'vistorias') Vistorias.render(this.container);
    else if (route === 'editor') Editor.render(this.container, param);
    else if (route === 'admin') Admin.render(this.container);
    else if (route === 'superadmin') SuperAdmin.render(this.container);
    else if (route === 'tenant') Tenant.render(this.container, param);
    else if (route === 'import') this.handleImport(param);
  },

  // Importação do contrato preenchido pelo inquilino (#import?id=&key=):
  // baixa e decifra da nuvem, atualiza o contrato local (ou cria) e abre o editor.
  handleImport(param) {
      const urlParams = new URLSearchParams(param);
      const serverId = urlParams.get('id');
      const key = urlParams.get('key');

      if (serverId && key) {
        this.container.innerHTML = `
          <div style="text-align: center; padding: 5rem 0;">
            <div class="spinner" style="border: 4px solid var(--border-light); border-top: 4px solid var(--primary); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1.5rem;"></div>
            <h3>Buscando e importando contrato de forma segura da nuvem...</h3>
          </div>
          <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        `;
        
        CloudDB.loadContract(serverId, key).then(payload => {
          const localContracts = Storage.getAll();
          const existing = localContracts.find(c => c.cloudId === serverId);
          
          let localId;
          if (existing) {
            // Atualiza contrato existente — só o que o inquilino pode escrever.
            const updated = Storage.update(existing.id, {
              fields: Utils.mesclarCamposDoInquilino(existing.fields, payload.f, existing.templateId, payload.evidencia),
              isFinalized: true
            });
            localId = updated.id;
          } else {
            // Cria um novo contrato importado. Sem contrato local não há base do
            // locador para preservar: entram só os campos do inquilino, e os do
            // locador ficam vazios (visivelmente) em vez de virem preenchidos
            // por quem mandou o link.
            const newContract = Storage.create({
              name: 'Contrato Importado - ' + (payload.f.nome_locatario || 'Inquilino'),
              templateId: payload.t,
              fields: Utils.mesclarCamposDoInquilino({}, payload.f, payload.t, payload.evidencia),
              cloudId: serverId,
              cloudKey: key,
              isFinalized: true
            });
            localId = newContract.id;
          }
          
          Utils.toast('Contrato importado com sucesso e salvo no seu painel!');
          window.location.hash = `#editor?id=${localId}`;
        }).catch(err => {
          Utils.toast('Erro ao importar contrato seguro da nuvem: ' + err.message, 'error');
          window.location.hash = '#dashboard';
        });
        return;
      }

      // Formato legado base64 desativado: dados pessoais viajavam legíveis na URL.
      Utils.toast('Este link de importação usa um formato antigo e foi desativado. Peça ao inquilino para preencher por um novo link.', 'error');
      window.location.hash = '#dashboard';
  },

  updateNav(route) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
      // Botões de ação (Tema, Sair) são .nav-item sem href — nunca casam, nunca ficam ativos.
      if (el.getAttribute('href') === '#' + route || (route==='dashboard' && el.getAttribute('href')==='#')) {
        el.classList.add('active');
      }
    });

    // A barra de conteúdo só existe para as rotas que têm lista para filtrar.
    // Em editor/perfil/inquilino ela sairia como um campo de busca que não
    // busca nada — é esse tipo de controle inerte que faz um app parecer
    // maquete. A troca de rota também zera o termo: senão a lista nova já
    // nasceria filtrada por uma palavra que o usuário digitou em outra tela.
    const barra = document.getElementById('content-bar');
    if (barra) barra.hidden = !App.ROTAS_COM_LISTA.includes(route);
    const campo = document.getElementById('busca-global');
    if (campo && campo.value) {
      campo.value = '';
      this.filtrarLista('');
    }
  },

  // Rotas cuja view desenha uma lista marcada com data-busca.
  ROTAS_COM_LISTA: ['contracts', 'financial', 'renovacoes', 'vistorias', 'properties', 'clients', 'templates'],

  // Uma view que se redesenha no lugar (trocar filtro, excluir um item) monta
  // DOM novo, e o filtro de texto anterior morre junto — mas o termo continua
  // escrito no campo. Ficava a impressão de busca ativa sobre uma lista que
  // ignorava o termo. Quem redesenha chama isto no fim.
  reaplicarBusca() {
    const campo = document.getElementById('busca-global');
    if (campo && campo.value) this.filtrarLista(campo.value);
  },

  // Busca da barra de conteúdo: filtra o que JÁ está na tela, comparando o
  // texto visível de cada item marcado com data-busca. Sem rede e sem
  // re-render — a view não é avisada, e por isso nenhuma delas precisou mudar.
  filtrarLista(termo) {
    // Normaliza acento e caixa nos DOIS lados: quem busca "imovel" tem de
    // achar "Imóvel", e quem busca "Imóvel" tem de achar o mesmo item.
    const norm = (t) => (t || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();

    const alvo = norm(termo);
    const itens = document.querySelectorAll('#main-content [data-busca]');
    let visiveis = 0;

    itens.forEach(el => {
      const casa = !alvo || norm(el.textContent).includes(alvo);
      el.hidden = !casa;
      if (casa) visiveis++;
    });

    // Aviso de "nada encontrado" — só quando havia itens e o filtro zerou.
    let vazio = document.getElementById('busca-vazia');
    if (itens.length && !visiveis) {
      if (!vazio) {
        vazio = document.createElement('p');
        vazio.id = 'busca-vazia';
        vazio.className = 'empty-state';
        this.container.appendChild(vazio);
      }
      // textContent: o termo vem do usuário e nunca vira HTML (R5.4).
      vazio.textContent = 'Nenhum resultado para "' + termo + '".';
      vazio.hidden = false;
    } else if (vazio) {
      vazio.hidden = true;
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
