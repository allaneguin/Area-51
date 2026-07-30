const Contracts = {
  locacao_residencial: {
    id: 'locacao_residencial',
    title: 'Locação de Imóvel Residencial',
    description: 'Contrato residencial completo com cláusulas de vistoria, manutenção e garantias.',
    icon: 'home',
    color: 'teal',
    category: 'Residencial',
    fields: [
      { section: 'Locador', name: 'nome_locador', label: 'Nome do Locador', type: 'text' },
      {
        section: 'Locador', name: 'nac_locador', label: 'Nacionalidade', type: 'select', options: [
          { value: 'brasileiro(a)', label: 'Brasileiro(a)' },
          { value: 'estrangeiro(a)', label: 'Estrangeiro(a)' }
        ]
      },
      {
        section: 'Locador', name: 'est_civil_locador', label: 'Estado Civil', type: 'select', options: [
          { value: '', label: 'Selecione...' },
          { value: 'solteiro(a)', label: 'Solteiro(a)' },
          { value: 'casado(a)', label: 'Casado(a)' },
          { value: 'divorciado(a)', label: 'Divorciado(a)' },
          { value: 'viúvo(a)', label: 'Viúvo(a)' },
          { value: 'separado(a) judicialmente', label: 'Separado(a) judicialmente' },
          { value: 'em união estável', label: 'União Estável' }
        ]
      },
      { section: 'Locador', name: 'rg_locador', label: 'RG (com Órgão Emissor)', type: 'text' },
      { section: 'Locador', name: 'doc_locador', label: 'CPF/CNPJ', type: 'text', mask: 'cpfcnpj' },

      { section: 'Locatário', name: 'nome_locatario', label: 'Nome do Locatário', type: 'text' },
      {
        section: 'Locatário', name: 'nac_locatario', label: 'Nacionalidade', type: 'select', options: [
          { value: 'brasileiro(a)', label: 'Brasileiro(a)' },
          { value: 'estrangeiro(a)', label: 'Estrangeiro(a)' }
        ]
      },
      {
        section: 'Locatário', name: 'est_civil_locatario', label: 'Estado Civil', type: 'select', options: [
          { value: '', label: 'Selecione...' },
          { value: 'solteiro(a)', label: 'Solteiro(a)' },
          { value: 'casado(a)', label: 'Casado(a)' },
          { value: 'divorciado(a)', label: 'Divorciado(a)' },
          { value: 'viúvo(a)', label: 'Viúvo(a)' },
          { value: 'separado(a) judicialmente', label: 'Separado(a) judicialmente' },
          { value: 'em união estável', label: 'União Estável' }
        ]
      },
      { section: 'Locatário', name: 'prof_locatario', label: 'Profissão', type: 'text' },
      { section: 'Locatário', name: 'rg_locatario', label: 'RG (com Órgão Emissor)', type: 'text' },
      { section: 'Locatário', name: 'doc_locatario', label: 'CPF', type: 'text', mask: 'cpfcnpj' },

      { section: 'Imóvel', name: 'desc_imovel', label: 'Descrição (Ex: Urbano de uso...)', type: 'textarea' },
      { section: 'Imóvel', name: 'cep_imovel', label: 'CEP', type: 'text' },
      { section: 'Imóvel', name: 'end_imovel', label: 'Endereço Completo do Imóvel', type: 'textarea' },
      { section: 'Imóvel', name: 'mat_agua', label: 'Matrícula de Água', type: 'text' },
      { section: 'Imóvel', name: 'uc_energia', label: 'Unidade Consumidora (Energia)', type: 'text' },

      {
        section: 'Condições', name: 'prazo_extenso', label: 'Prazo do Contrato', type: 'select', options: [
          { value: '', label: 'Selecione o prazo...' },
          { value: '06 (seis) meses', label: '06 (seis) meses' },
          { value: '12 (doze) meses (1 ano)', label: '12 (doze) meses (1 ano)' },
          { value: '24 (vinte e quatro) meses (2 anos)', label: '24 (vinte e quatro) meses (2 anos)' },
          { value: '30 (trinta) meses (2 anos e meio)', label: '30 (trinta) meses (2 anos e meio)' },
          { value: '36 (trinta e seis) meses (3 anos)', label: '36 (trinta e seis) meses (3 anos)' },
          { value: 'personalizado', label: 'Outro (personalizar)...' }
        ]
      },
      { section: 'Condições', name: 'prazo_meses', label: 'Prazo personalizado (quantidade)', type: 'number' },
      {
        section: 'Condições', name: 'prazo_unidade', label: 'Unidade do prazo', type: 'select', options: [
          { value: 'meses', label: 'Meses' },
          { value: 'anos', label: 'Anos' }
        ]
      },
      { section: 'Condições', name: 'data_inicio', label: 'Data de Início', type: 'date' },
      { section: 'Condições', name: 'data_termino', label: 'Data de Término (Automático)', type: 'date', readonly: true },
      { section: 'Condições', name: 'dia_vencimento', label: 'Dia de Vencimento', type: 'number' },

      { section: 'Valores', name: 'valor_aluguel', label: 'Valor Mensal (Ex: R$ 940,45)', type: 'text', mask: 'currency' },
      { section: 'Valores', name: 'valor_extenso', label: 'Valor por Extenso', type: 'text' },
      { section: 'Valores', name: 'valor_bonus', label: 'Bônus Adimplência (Ex: R$ 40,45)', type: 'text', mask: 'currency' },
      { section: 'Valores', name: 'valor_bonus_extenso', label: 'Bônus por Extenso', type: 'text' },
      { section: 'Valores', name: 'indice_reajuste', label: 'Índice de Reajuste (Ex: IGP-M/FGV)', type: 'text' },

      {
        section: 'Garantia', name: 'tipo_garantia', label: 'Modalidade de Garantia', type: 'select', options: [
          { value: 'sem_garantia', label: 'Sem Garantia' },
          { value: 'caucao', label: 'Caução em Dinheiro' },
          { value: 'fiador', label: 'Fiador' }
        ]
      },
      { section: 'Garantia', name: 'valor_caucao', label: 'Valor da Caução (R$)', type: 'text', mask: 'currency' },
      { section: 'Garantia', name: 'valor_caucao_extenso', label: 'Valor da Caução por Extenso', type: 'text' },
      { section: 'Garantia', name: 'nome_fiador', label: 'Nome do Fiador', type: 'text' },
      { section: 'Garantia', name: 'rg_fiador', label: 'RG do Fiador', type: 'text' },
      { section: 'Garantia', name: 'doc_fiador', label: 'CPF do Fiador', type: 'text', mask: 'cpfcnpj' },
      { section: 'Garantia', name: 'end_fiador', label: 'Endereço do Fiador', type: 'textarea' },

      { section: 'Conta p/ Pagamento', name: 'banco', label: 'Banco (Ex: Banco do Brasil)', type: 'text' },
      { section: 'Conta p/ Pagamento', name: 'agencia', label: 'Agência', type: 'text' },
      { section: 'Conta p/ Pagamento', name: 'conta_banco', label: 'Conta (com dígito)', type: 'text' },
      {
        section: 'Conta p/ Pagamento', name: 'tipo_conta', label: 'Tipo de Conta', type: 'select', options: [
          { value: '', label: 'Selecione...' },
          { value: 'Conta Corrente', label: 'Conta Corrente' },
          { value: 'Conta Poupança', label: 'Conta Poupança' },
          { value: 'Conta Salário', label: 'Conta Salário' },
          { value: 'Conta Pagamento', label: 'Conta Pagamento' }
        ]
      },

      { section: 'Data e Local', name: 'foro_cidade', label: 'Cidade do Foro / Data', type: 'text' },
      { section: 'Data e Local', name: 'data_assinatura', label: 'Data da Assinatura', type: 'text', readonly: true, hidden: true }
    ],
    template: `
      <h1 style="font-size: 14pt; margin-bottom: 2rem; text-align: center;">CONTRATO DE LOCAÇÃO DE IMÓVEL RESIDENCIAL</h1>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem;">
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>LOCADOR:</strong> <span class="highlight" data-field="nome_locador">___</span>,<span class="pf-locador"> <span class="highlight" data-field="nac_locador">___</span>, <span class="highlight" data-field="est_civil_locador">___</span>, RG <span class="highlight" data-field="rg_locador">___</span> e</span> <span class="doc-locador-label">CPF/CNPJ</span> <span class="highlight" data-field="doc_locador">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>LOCATÁRIO:</strong> <span class="highlight" data-field="nome_locatario">___</span>, <span class="highlight" data-field="nac_locatario">___</span>, <span class="highlight" data-field="est_civil_locatario">___</span>, <span class="highlight" data-field="prof_locatario">___</span>, RG <span class="highlight" data-field="rg_locatario">___</span> e CPF <span class="highlight" data-field="doc_locatario">___</span>.</td>
        </tr>
        <tr class="sec-fiador-row">
          <td style="border: 1px solid black; padding: 8px;"><strong>FIADOR:</strong> <span class="highlight" data-field="nome_fiador">___</span>, RG <span class="highlight" data-field="rg_fiador">___</span>, CPF <span class="highlight" data-field="doc_fiador">___</span>, residente em <span class="highlight" data-field="end_fiador">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>IMÓVEL:</strong> <span class="highlight" data-field="desc_imovel">___</span>, situado na <span class="highlight" data-field="end_imovel">___</span>, CEP <span class="highlight" data-field="cep_imovel">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;">
            <strong>PRAZO:</strong> <span class="highlight" data-field="prazo_extenso">___</span> &nbsp;&nbsp;&nbsp; 
            <strong>INÍCIO:</strong> <span class="highlight" data-field="data_inicio">___</span> &nbsp;&nbsp;&nbsp; 
            <strong>TÉRMINO:</strong> <span class="highlight" data-field="data_termino">___</span>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>VENCIMENTO:</strong> PAGAMENTO ANTECIPADO até o dia <span class="highlight" data-field="dia_vencimento">___</span> de cada mês.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>VALOR:</strong> <span class="highlight" data-field="valor_aluguel">___</span> (<span class="highlight" data-field="valor_extenso">___</span>).</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>BÔNUS ADIMPLÊNCIA/PONTUALIDADE:</strong> <span class="highlight" data-field="valor_bonus">___</span> (<span class="highlight" data-field="valor_bonus_extenso">___</span>).</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>REAJUSTE:</strong> Anual, conforme a variação acumulada do <span class="highlight" data-field="indice_reajuste">___</span>.</td>
        </tr>
      </table>
      
      <p style="text-align: justify; margin-bottom: 1rem;">O LOCADOR e a LOCATÁRIA resolvem ajustar a locação do imóvel retro descrito, que ora contratam, sob as cláusulas e condições seguintes:</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>1.</strong> O imóvel objeto do presente contrato será para uso exclusivamente residencial, sendo que destinação diversa, sem a autorização expressa do LOCADOR, facultará a este rescindir o contrato de plano, sem gerar direito a indenização ou qualquer ônus por parte deste último.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>2.</strong> A LOCATÁRIA se obriga a restituir o imóvel livre e desocupado, independente de quaisquer notificações, em condições idênticas à que recebeu.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>3.</strong> Findo o prazo estipulado, operar-se-á o término da avença somente através de notificação por escrito do locador, sendo que, na falta de tal notificação, ocorrerá a renovação automática do contrato por igual período e nas mesmas condições do presente pacto, conforme dispõe a lei do inquilinato.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>4.</strong> Ultrapassando o contrato a data prevista, tornando-se contrato por tempo indeterminado, poderá o LOCADOR rescindi-lo a qualquer tempo, desde que ocorra notificação por escrito à LOCATÁRIA com antecedência de 30 (trinta) dias.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>5.</strong> Os contratantes declaram que vistoriaram o imóvel registrando suas reais condições por meio de laudo/fotografias. Vistoria inicial essa que servirá como base comparativa na entrega do imóvel.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>6. GARANTIA LOCATÍCIA:</strong> <span class="sec-garantia-texto">Para garantia das obrigações assumidas neste contrato, fica ajustado o seguinte: <span class="highlight" data-field="tipo_garantia">___</span>.</span></p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>7.</strong> O aluguel mensal deverá ser pago mediante transferência bancária ao <strong><span class="highlight" data-field="banco">___</span></strong>, Agência <strong><span class="highlight" data-field="agencia">___</span></strong>, <strong><span class="highlight" data-field="tipo_conta">___</span></strong> <strong><span class="highlight" data-field="conta_banco">___</span></strong>, de titularidade do LOCADOR. Sobre o aluguel pago após o vencimento, incidirá multa moratória de 5% (cinco por cento) ao mês.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>8.</strong> Além do aluguel mensal, incumbirá à LOCATÁRIA o pagamento de todas as despesas de manutenção (energia elétrica UC <span class="highlight" data-field="uc_energia">___</span>, água Mat. <span class="highlight" data-field="mat_agua">___</span>) e IPTU.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>9.</strong> Os contratantes elegem o foro de <strong><span class="highlight" data-field="foro_cidade">___</span></strong> para dirimir quaisquer avenças decorrentes deste contrato.</p>

      <p style="text-align: justify; margin-bottom: 2rem;">E por estarem assim justas e contratadas, as partes assinam o presente instrumento.</p>

      <div class="signature-area">
        <p style="text-align: right; margin-bottom: 3rem;">
          <span class="highlight" data-field="foro_cidade">___</span>, <span class="highlight" data-field="data_assinatura">___</span>.
        </p>

        <div class="signatures" style="margin-bottom: 2rem;">
          <div class="signature-block">
            <div class="signature-line">
              <div class="signature-img-container" data-signature="locador"></div>
              Locador: <span class="highlight" data-field="nome_locador">___</span>
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-line">
              <div class="signature-img-container" data-signature="locatario"></div>
              Locatário: <span class="highlight" data-field="nome_locatario">___</span>
            </div>
          </div>
        </div>
        <div class="signatures sec-fiador-sig" style="display:none; margin-bottom: 2rem;">
          <div class="signature-block">
            <div class="signature-line">
              Fiador: <span class="highlight" data-field="nome_fiador">___</span>
            </div>
          </div>
        </div>
      </div>
    `
  },

  locacao_comercial: {
    id: 'locacao_comercial',
    title: 'Locação de Imóvel Comercial',
    description: 'Contrato para lojas, salas comerciais, galpões e escritórios com regramento de benfeitorias e alvará.',
    icon: 'home',
    color: 'purple',
    category: 'Comercial',
    fields: [
      { section: 'Locador', name: 'nome_locador', label: 'Nome do Locador / Razão Social', type: 'text' },
      { section: 'Locador', name: 'rg_locador', label: 'RG do Locador (se PF)', type: 'text' },
      { section: 'Locador', name: 'doc_locador', label: 'CPF/CNPJ do Locador', type: 'text', mask: 'cpfcnpj' },

      { section: 'Locatário', name: 'nome_locatario', label: 'Nome do Locatário / Razão Social', type: 'text' },
      { section: 'Locatário', name: 'ramo_atividade', label: 'Ramo de Atividade Comercial', type: 'text' },
      { section: 'Locatário', name: 'rg_locatario', label: 'RG do Representante Legal / Inquilino', type: 'text' },
      { section: 'Locatário', name: 'doc_locatario', label: 'CPF/CNPJ do Locatário', type: 'text', mask: 'cpfcnpj' },

      { section: 'Imóvel', name: 'desc_imovel', label: 'Descrição do Imóvel Comercial', type: 'textarea' },
      { section: 'Imóvel', name: 'cep_imovel', label: 'CEP', type: 'text' },
      { section: 'Imóvel', name: 'end_imovel', label: 'Endereço Completo do Imóvel', type: 'textarea' },

      { section: 'Condições', name: 'prazo_extenso', label: 'Prazo do Contrato', type: 'select', options: [
          { value: '', label: 'Selecione o prazo...' },
          { value: '12 (doze) meses (1 ano)', label: '12 (doze) meses (1 ano)' },
          { value: '24 (vinte e quatro) meses (2 anos)', label: '24 (vinte e quatro) meses (2 anos)' },
          { value: '36 (trinta e seis) meses (3 anos)', label: '36 (trinta e seis) meses (3 anos)' },
          { value: '60 (sessenta) meses (5 anos)', label: '60 (sessenta) meses (5 anos)' },
          { value: 'personalizado', label: 'Outro...' }
        ]
      },
      { section: 'Condições', name: 'prazo_meses', label: 'Prazo personalizado (quantidade)', type: 'number' },
      { section: 'Condições', name: 'prazo_unidade', label: 'Unidade do prazo', type: 'select', options: [
          { value: 'meses', label: 'Meses' },
          { value: 'anos', label: 'Anos' }
        ]
      },
      { section: 'Condições', name: 'data_inicio', label: 'Data de Início', type: 'date' },
      { section: 'Condições', name: 'data_termino', label: 'Data de Término', type: 'date', readonly: true },
      { section: 'Condições', name: 'dia_vencimento', label: 'Dia de Vencimento', type: 'number' },

      { section: 'Valores', name: 'valor_aluguel', label: 'Valor Mensal (R$)', type: 'text', mask: 'currency' },
      { section: 'Valores', name: 'valor_extenso', label: 'Valor por Extenso', type: 'text' },
      { section: 'Valores', name: 'indice_reajuste', label: 'Índice de Reajuste (ex: IGP-M / IPCA)', type: 'text' },

      {
        section: 'Garantia', name: 'tipo_garantia', label: 'Modalidade de Garantia', type: 'select', options: [
          { value: 'sem_garantia', label: 'Sem Garantia' },
          { value: 'caucao', label: 'Caução em Dinheiro' },
          { value: 'fiador', label: 'Fiador' }
        ]
      },
      { section: 'Garantia', name: 'valor_caucao', label: 'Valor da Caução (R$)', type: 'text', mask: 'currency' },
      { section: 'Garantia', name: 'valor_caucao_extenso', label: 'Valor da Caução por Extenso', type: 'text' },
      { section: 'Garantia', name: 'nome_fiador', label: 'Nome do Fiador', type: 'text' },
      { section: 'Garantia', name: 'rg_fiador', label: 'RG do Fiador', type: 'text' },
      { section: 'Garantia', name: 'doc_fiador', label: 'CPF do Fiador', type: 'text', mask: 'cpfcnpj' },
      { section: 'Garantia', name: 'end_fiador', label: 'Endereço do Fiador', type: 'textarea' },

      { section: 'Conta p/ Pagamento', name: 'banco', label: 'Banco', type: 'text' },
      { section: 'Conta p/ Pagamento', name: 'agencia', label: 'Agência', type: 'text' },
      { section: 'Conta p/ Pagamento', name: 'conta_banco', label: 'Conta (com dígito)', type: 'text' },
      { section: 'Conta p/ Pagamento', name: 'tipo_conta', label: 'Tipo de Conta', type: 'select', options: [
          { value: 'Conta Corrente', label: 'Conta Corrente' },
          { value: 'Conta Poupança', label: 'Conta Poupança' }
        ]
      },

      { section: 'Data e Local', name: 'foro_cidade', label: 'Cidade do Foro', type: 'text' },
      { section: 'Data e Local', name: 'data_assinatura', label: 'Data da Assinatura', type: 'text', readonly: true, hidden: true }
    ],
    template: `
      <h1 style="font-size: 14pt; margin-bottom: 2rem; text-align: center;">CONTRATO DE LOCAÇÃO DE IMÓVEL COMERCIAL</h1>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem;">
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>LOCADOR:</strong> <span class="highlight" data-field="nome_locador">___</span>, CPF/CNPJ nº <span class="highlight" data-field="doc_locador">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>LOCATÁRIO:</strong> <span class="highlight" data-field="nome_locatario">___</span>, CPF/CNPJ nº <span class="highlight" data-field="doc_locatario">___</span>, Ramo de Atividade: <span class="highlight" data-field="ramo_atividade">___</span>.</td>
        </tr>
        <tr class="sec-fiador-row">
          <td style="border: 1px solid black; padding: 8px;"><strong>FIADOR:</strong> <span class="highlight" data-field="nome_fiador">___</span>, RG <span class="highlight" data-field="rg_fiador">___</span>, CPF <span class="highlight" data-field="doc_fiador">___</span>, residente em <span class="highlight" data-field="end_fiador">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>IMÓVEL COMERCIAL:</strong> <span class="highlight" data-field="desc_imovel">___</span>, localizado na <span class="highlight" data-field="end_imovel">___</span>, CEP <span class="highlight" data-field="cep_imovel">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;">
            <strong>PRAZO:</strong> <span class="highlight" data-field="prazo_extenso">___</span> &nbsp;&nbsp;&nbsp; 
            <strong>INÍCIO:</strong> <span class="highlight" data-field="data_inicio">___</span> &nbsp;&nbsp;&nbsp; 
            <strong>TÉRMINO:</strong> <span class="highlight" data-field="data_termino">___</span>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>VALOR MENSAL:</strong> <span class="highlight" data-field="valor_aluguel">___</span> (<span class="highlight" data-field="valor_extenso">___</span>), com vencimento todo dia <span class="highlight" data-field="dia_vencimento">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>REAJUSTE:</strong> Anual pelo índice <span class="highlight" data-field="indice_reajuste">___</span>.</td>
        </tr>
      </table>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>1. DESTINAÇÃO E ALVARÁS:</strong> O imóvel destina-se exclusivamente para a atividade comercial de <strong><span class="highlight" data-field="ramo_atividade">___</span></strong>. É de responsabilidade exclusiva da LOCATÁRIA a obtenção de alvarás de funcionamento, licenças sanitárias e ambientais perante os órgãos públicos.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>2. BENFEITORIAS E REFORMAS:</strong> Quaisquer alterações estruturais ou reformas no imóvel dependem de prévia e expressa autorização por escrito do LOCADOR. As benfeitorias úteis ou necessárias incorporar-se-ão ao imóvel sem direito a indenização ou retenção.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>3. CONSERVAÇÃO E DEVOLUÇÃO:</strong> A LOCATÁRIA obriga-se a manter o imóvel comercial em perfeitas condições de uso, higiene e conservação, devolvendo-o pintar e reparado ao final da locação.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>4. GARANTIA LOCATÍCIA:</strong> <span class="sec-garantia-texto">Fica estipulada a seguinte garantia das obrigações deste contrato: <span class="highlight" data-field="tipo_garantia">___</span>.</span></p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>5. PAGAMENTO:</strong> O pagamento será realizado via PIX/transferência ao <strong><span class="highlight" data-field="banco">___</span></strong>, Agência <strong><span class="highlight" data-field="agencia">___</span></strong>, <strong><span class="highlight" data-field="tipo_conta">___</span></strong> <strong><span class="highlight" data-field="conta_banco">___</span></strong> de titularidade do LOCADOR.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>6. FORO:</strong> As partes elegem a comarca de <strong><span class="highlight" data-field="foro_cidade">___</span></strong> para sanar quaisquer divergências relativas a este contrato.</p>

      <div class="signature-area">
        <p style="text-align: right; margin-bottom: 3rem;">
          <span class="highlight" data-field="foro_cidade">___</span>, <span class="highlight" data-field="data_assinatura">___</span>.
        </p>

        <div class="signatures" style="margin-bottom: 2rem;">
          <div class="signature-block">
            <div class="signature-line">
              <div class="signature-img-container" data-signature="locador"></div>
              Locador: <span class="highlight" data-field="nome_locador">___</span>
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-line">
              <div class="signature-img-container" data-signature="locatario"></div>
              Locatário: <span class="highlight" data-field="nome_locatario">___</span>
            </div>
          </div>
        </div>
      </div>
    `
  },

  locacao_simples: {
    id: 'locacao_simples',
    title: 'Minuta de Locação Residencial (Simples)',
    description: 'Modelo de contrato simplificado com objeto, prazo, valor e condições.',
    icon: 'home',
    color: 'blue',
    category: 'Residencial',
    fields: [
      { section: 'Locador', name: 'nome_locador', label: 'Nome do Locador', type: 'text' },
      { section: 'Locador', name: 'rg_locador', label: 'RG do Locador', type: 'text' },
      { section: 'Locador', name: 'doc_locador', label: 'CPF/CNPJ do Locador', type: 'text', mask: 'cpfcnpj' },
      { section: 'Locatário', name: 'nome_locatario', label: 'Nome do Locatário', type: 'text' },
      { section: 'Locatário', name: 'rg_locatario', label: 'RG do Locatário', type: 'text' },
      { section: 'Locatário', name: 'doc_locatario', label: 'CPF do Locatário', type: 'text', mask: 'cpfcnpj' },
      { section: 'Imóvel', name: 'desc_imovel', label: 'Descrição do Imóvel', type: 'textarea' },
      { section: 'Imóvel', name: 'end_imovel', label: 'Localização Completa', type: 'textarea' },
      { section: 'Condições', name: 'prazo_meses', label: 'Prazo em Meses (ex: 12)', type: 'number' },
      { section: 'Condições', name: 'data_inicio', label: 'Data de Início', type: 'date' },
      { section: 'Condições', name: 'data_termino', label: 'Data de Término', type: 'date' },
      { section: 'Valores', name: 'valor_aluguel', label: 'Valor Mensal (R$)', type: 'text', mask: 'currency' },
      { section: 'Data e Local', name: 'foro_cidade', label: 'Cidade do Foro / Data', type: 'text' },
      { section: 'Data e Local', name: 'data_assinatura', label: 'Data da Assinatura', type: 'text', readonly: true, hidden: true }
    ],
    template: `
      <h1 style="font-size: 14pt; margin-bottom: 2rem; text-align: center;">INSTRUMENTO PARTICULAR DE CONTRATO DE LOCAÇÃO DE IMÓVEL RESIDENCIAL</h1>
      
      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">1. Identificação das Partes Contratantes</h2>
      <p style="text-align: justify; margin-bottom: 1rem;">
        <strong>LOCADOR:</strong> <span class="highlight" data-field="nome_locador">___</span>,<span class="pf-locador"> portador do RG nº <span class="highlight" data-field="rg_locador">___</span> e</span> <span class="doc-locador-label">CPF/CNPJ</span> nº <span class="highlight" data-field="doc_locador">___</span>.
      </p>
      <p style="text-align: justify; margin-bottom: 1rem;">
        <strong>LOCATÁRIO:</strong> <span class="highlight" data-field="nome_locatario">___</span>, portador do RG nº <span class="highlight" data-field="rg_locatario">___</span> e CPF nº <span class="highlight" data-field="doc_locatario">___</span>.
      </p>

      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">2. Objeto do Contrato</h2>
      <p style="text-align: justify; margin-bottom: 1rem;">
        Imóvel situado na <span class="highlight" data-field="end_imovel">___</span> (<span class="highlight" data-field="desc_imovel">___</span>), para fins estritamente residenciais.
      </p>

      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">3. Prazo do Contrato</h2>
      <p style="text-align: justify; margin-bottom: 1rem;">
        Vigência de <span class="highlight" data-field="prazo_meses">___</span> meses, de <span class="highlight" data-field="data_inicio">___</span> até <span class="highlight" data-field="data_termino">___</span>.
      </p>

      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">4. Do Valor e Pagamento</h2>
      <p style="text-align: justify; margin-bottom: 1rem;">
        O valor do aluguel mensal é de <span class="highlight" data-field="valor_aluguel">___</span>.
      </p>

      <p style="text-align: justify; margin-bottom: 2rem;">
        Por estarem assim justos e contratados, assinam o presente instrumento.
      </p>

      <div class="signature-area">
        <p style="text-align: right; margin-bottom: 4rem;">
          <span class="highlight" data-field="foro_cidade">___</span>, <span class="highlight" data-field="data_assinatura">___</span>.
        </p>

        <div class="signatures">
          <div class="signature-block">
            <div class="signature-line">
              <div class="signature-img-container" data-signature="locador"></div>
              Locador: <span class="highlight" data-field="nome_locador">___</span>
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-line">
              <div class="signature-img-container" data-signature="locatario"></div>
              Locatário: <span class="highlight" data-field="nome_locatario">___</span>
            </div>
          </div>
        </div>
      </div>
    `
  }
};
