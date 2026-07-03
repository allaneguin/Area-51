// ═══════════════════════════════════════════════════════
// App Principal & Router
// ═══════════════════════════════════════════════════════

const App = {
  routes: {
    '': 'dashboard',
    '#': 'dashboard',
    '#dashboard': 'dashboard',
    '#templates': 'templates',
    '#contracts': 'contracts',
    '#editor': 'editor',
    '#admin': 'admin',
    '#tenant': 'tenant'
  },
  
  init() {
    this.container = document.getElementById('main-content');
    
    if (SupabaseActive && supabaseClient) {
      // Registrar listener de mudanças no estado da sessão
      supabaseClient.auth.onAuthStateChange((event, session) => {
        const user = session ? session.user : null;
        this.user = user;
        
        // Exibir/esconder botão de Logout na sidebar
        this.updateAuthSidebarUI();
        
        // Sincronizar dados locais com a nuvem no primeiro login
        if (user && typeof Storage !== 'undefined' && Storage.syncLocalDataToCloud) {
          Storage.syncLocalDataToCloud().then(() => {
            this.handleRoute();
          });
        } else {
          this.handleRoute();
        }
      });
      // Listener para cliques normais ou mudanças manuais de hash
      window.addEventListener('hashchange', () => this.handleRoute());
    } else {
      window.addEventListener('hashchange', () => this.handleRoute());
      this.handleRoute();
    }
    
    this.setupSidebar();
  },
  
  updateAuthSidebarUI() {
    const existingLogout = document.getElementById('sidebar-nav-logout');
    if (existingLogout) existingLogout.remove();

    if (this.user) {
      const navSection = document.querySelector('.sidebar-nav');
      if (navSection) {
        const logoutItem = document.createElement('a');
        logoutItem.id = 'sidebar-nav-logout';
        logoutItem.href = '#';
        logoutItem.className = 'nav-item';
        logoutItem.style.color = '#dc3545';
        logoutItem.style.marginTop = '1rem';
        logoutItem.innerHTML = `
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:20px; height:20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          <span class="nav-label">Sair da Conta</span>
        `;
        logoutItem.addEventListener('click', (e) => {
          e.preventDefault();
          AuthUI.logout();
        });
        navSection.appendChild(logoutItem);
      }
    }
  },
  
  handleRoute() {
    const hash = window.location.hash;
    const [path, param] = hash.split('?');
    
    const route = this.routes[path] || 'dashboard';
    
    // Interceptação de login se Supabase estiver ativo
    if (SupabaseActive && !this.user && route !== 'tenant') {
      document.body.classList.add('tenant-mode'); // Esconde sidebar/navbar
      AuthUI.render(this.container);
      return;
    }
    
    // Rota Especial de Importação do Inquilino
    if (path === '#import') {
      const urlParams = new URLSearchParams(param);
      const serverId = urlParams.get('id');
      const key = urlParams.get('key');
      
      if (serverId && key) {
        this.container.innerHTML = `
          <div style="text-align: center; padding: 5rem 0;">
            <div class="spinner" style="border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1.5rem;"></div>
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
            // Atualiza contrato existente
            const updated = Storage.update(existing.id, {
              fields: payload.f,
              isFinalized: true
            });
            localId = updated.id;
          } else {
            // Cria um novo contrato importado
            const newContract = Storage.create({
              name: 'Contrato Importado - ' + (payload.f.nome_locatario || 'Inquilino'),
              templateId: payload.t,
              fields: payload.f,
              cloudId: serverId,
              cloudKey: key,
              isFinalized: true
            });
            localId = newContract.id;
          }
          
          alert('Contrato importado com sucesso e salvo no seu painel!');
          window.location.hash = `#editor?id=${localId}`;
        }).catch(err => {
          alert('Erro ao importar contrato seguro da nuvem: ' + err.message);
          window.location.hash = '#dashboard';
        });
        return; // Interrompe a execução normal de roteamento
      }
      
      // Fallback para o antigo formato base64 em URL
      try {
        const b64 = param.split('=')[1];
        const str = decodeURIComponent(Array.prototype.map.call(atob(b64), function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(str);
        
        const contract = {
          name: 'Contrato Importado - ' + (payload.f.nome_locatario || 'Inquilino'),
          templateId: payload.t,
          fields: payload.f,
          isFinalized: true
        };
        Storage.create(contract);
        alert('Contrato importado com sucesso e salvo no seu painel!');
        window.location.hash = '#dashboard';
      } catch(e) {
        alert('Erro ao importar contrato. O link pode estar quebrado.');
        window.location.hash = '#dashboard';
      }
      return; // Interrompe a execução normal de roteamento
    }
    
    // Esconder a navegação e a sidebar se for a tela do Tenant (Cliente)
    if (route === 'tenant') {
      document.body.classList.add('tenant-mode');
    } else {
      document.body.classList.remove('tenant-mode');
    }

    this.updateNav(route);
    
    // Close sidebar on mobile after navigation
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
    if (overlay && overlay.classList.contains('active')) {
      overlay.classList.remove('active');
    }
    
    if (route === 'dashboard') Dashboard.render(this.container);
    else if (route === 'templates') Templates.render(this.container);
    else if (route === 'contracts') ContractsView.render(this.container);
    else if (route === 'editor') Editor.render(this.container, param);
    else if (route === 'admin') Admin.render(this.container);
    else if (route === 'tenant') Tenant.render(this.container, param);
  },
  
  updateNav(route) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
      // O botão "Sair da Conta" também é um .nav-item com href="#", mas nunca deve
      // ficar ativo — ignora para não confundir com o item selecionado.
      if (el.id === 'sidebar-nav-logout') return;
      if (el.getAttribute('href') === '#' + route || (route==='dashboard' && el.getAttribute('href')==='#')) {
        el.classList.add('active');
      }
    });
  },
  
  setupSidebar() {
    // Mobile menu logic can go here later if needed
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
