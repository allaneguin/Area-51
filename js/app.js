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
    '#editor': 'editor',
    '#admin': 'admin',
    '#superadmin': 'superadmin',
    '#tenant': 'tenant',
    '#import': 'import'
  },
  
  init() {
    this.container = document.getElementById('main-content');
    
    if (supabaseClient) {
      // Registrar listener de mudanças no estado da sessão
      supabaseClient.auth.onAuthStateChange((event, session) => {
        const user = session ? session.user : null;
        this.user = user;

        // Usuário chegou pelo link de redefinição de senha do e-mail
        if (event === 'PASSWORD_RECOVERY') this.passwordRecovery = true;

        // Exibir/esconder as ações de "Sair" (topbar + header mobile)
        this.updateAuthUI();

        const newUid = user ? user.id : null;

        // TOKEN_REFRESHED (~1x/h) e SIGNED_IN de refoco reemitem com o MESMO usuário.
        // Re-sincronizar/re-renderizar aí destruiria um formulário em edição — então ignora.
        if (newUid === this._lastUid && event !== 'PASSWORD_RECOVERY') {
          return;
        }

        // Login de outro usuário ou logout: descarta caches em memória do usuário anterior
        // (senão contratos/perfil de A poderiam renderizar para B no mesmo navegador).
        if (newUid !== this._lastUid) {
          Storage.clearAll();
        }
        this._lastUid = newUid;

        // Carrega contratos e perfil da nuvem antes de renderizar
        if (user) {
          Storage.loadCloudData().then(() => this.handleRoute());
        } else {
          this.handleRoute();
        }
      });
      // Listener para cliques normais ou mudanças manuais de hash
      window.addEventListener('hashchange', () => this.handleRoute());
    } else {
      // SDK não carregou (CDN bloqueado ou fora do ar).
      // Fail-closed: mostra erro em vez de abrir o painel interno sem login.
      this.container.innerHTML = `
        <div style="max-width: 460px; margin: 6rem auto; text-align: center; padding: 2rem;">
          <h2 style="margin-bottom: 0.75rem;">Não foi possível carregar o serviço</h2>
          <p style="color: var(--text-muted); line-height: 1.5;">Verifique sua conexão com a internet e recarregue a página. Se o problema persistir, tente novamente em alguns minutos.</p>
          <button class="btn btn-primary" style="margin-top: 1.5rem;" onclick="window.location.reload()">Recarregar</button>
        </div>`;
    }
  },
  
  // Mostra os controles que dependem de sessão: "Sair" (topbar e header mobile)
  // e o acesso de administrador. Esconder é cortesia de UI — quem protege os
  // dados é o RLS.
  updateAuthUI() {
    document.querySelectorAll('.logout-action').forEach(el => {
      el.hidden = !this.user;
    });

    const isAdmin = !!(this.user && typeof SuperAdmin !== 'undefined' && SuperAdmin.isAdmin());
    document.querySelectorAll('.admin-action').forEach(el => {
      el.hidden = !isAdmin;
    });
  },

  handleRoute() {
    const hash = window.location.hash;
    const [path, param] = hash.split('?');
    
    const route = this.routes[path] || 'dashboard';

    // Fluxo de redefinição de senha (link do e-mail).
    // A rota do inquilino (#tenant) passa direto — ele não pode ser bloqueado pelo recovery do locador.
    if (this.passwordRecovery && route !== 'tenant') {
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
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
