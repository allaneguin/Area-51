const Contracts = {
  locacao_residencial: {
    id: 'locacao_residencial',
    title: 'Locação de Imóvel',
    description: 'Contrato de locação.',
    icon: 'home',
    color: 'teal',
    category: 'Imobiliário',
    fields: [{ section: 'Locador', name: 'nome_locador', label: 'Nome do Locador', type: 'text' },
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
    { section: 'Imóvel', name: 'end_imovel', label: 'Endereço Completo do Imóvel', type: 'textarea' },
    { section: 'Imóvel', name: 'cep_imovel', label: 'CEP', type: 'text' },
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
    // Só aparecem quando o prazo acima é "personalizado" (visibilidade controlada em editor.js)
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
    template: `      <h1 style="font-size: 14pt; margin-bottom: 2rem; text-align: center;">CONTRATO DE LOCAÇÃO DE IMÓVEL</h1>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem;">
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>LOCADOR:</strong> <span class="highlight" data-field="nome_locador">___</span>,<span class="pf-locador"> <span class="highlight" data-field="nac_locador">___</span>, <span class="highlight" data-field="est_civil_locador">___</span>, RG <span class="highlight" data-field="rg_locador">___</span> e</span> <span class="doc-locador-label">CPF/CNPJ</span> <span class="highlight" data-field="doc_locador">___</span>.</td>
        </tr>
        <tr>
          <td style="border: 1px solid black; padding: 8px;"><strong>LOCATÁRIO:</strong> <span class="highlight" data-field="nome_locatario">___</span>, <span class="highlight" data-field="nac_locatario">___</span>, <span class="highlight" data-field="est_civil_locatario">___</span>, <span class="highlight" data-field="prof_locatario">___</span>, RG <span class="highlight" data-field="rg_locatario">___</span> e CPF <span class="highlight" data-field="doc_locatario">___</span>.</td>
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

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>1.</strong> O imóvel objeto do presente contrato será para uso exclusivamente residencial, sendo que destinação diversa, sem a autorização expressa do LOCADOR, facultará a este rescindir o contrato de plano, sem gerar direito a indenização ou qualquer ônus por parte deste último. Sem prejuízo da obrigação da LOCATÁRIA de efetuar o pagamento das multas e despesas previstas neste contrato.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>2.</strong> A LOCATÁRIA se obriga a restituir o imóvel livre e desocupado, independente de quaisquer notificações, em condições idênticas à que recebeu.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>3.</strong> Findo o prazo estipulado, operar-se-á o término da avença somente através de notificação por escrito do locador, sendo que, na falta de tal notificação, ocorrerá a renovação automática do contrato por igual período e nas mesmas condições do presente pacto, conforme dispõe a lei do inquilinato.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>4.</strong> Ultrapassando o contrato, a data prevista, ou seja, tornando-se contrato por tempo indeterminado, poderá o LOCADOR rescindi-lo a qualquer tempo, desde que ocorra notificação por escrito à LOCATÁRIA, que ficará compelida a sair do imóvel dentro do prazo de 30 (trinta) dias, a contar do recebimento da notificação. Ocorrendo prorrogação, a LOCATÁRIA e o LOCADOR ficarão obrigados por todo o teor deste contrato.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>5.</strong> Os LOCATÁRIOS, juntamente com o LOCADOR, declaram que vistoriaram o imóvel deste Contrato, registrando suas reais condições por meio de fotografias, as quais seguem em anexo, passando a compor o presente contrato. Vistoria inicial essa que servirá como base comparativa na vistoria final, que ocorrerá no momento da entrega do imóvel, onde serão identificados possíveis danos e/ou alterações no imóvel.</p>

      <p style="text-align: justify; margin-bottom: 0.5rem;"><strong>6.</strong> Ao término do presente contrato, ou quando o imóvel for devolvido, a LOCATÁRIA deverá realizar os seguintes reparos:</p>
      <ul style="margin-left: 40px; margin-bottom: 1rem; text-align: justify;">
        <li>Pintura interna e da garagem;</li>
        <li>Pintura externa;</li>
        <li>Pintura do portão e gradil;</li>
        <li>Pintura do piso das calçadas;</li>
        <li>Pintura do madeiramento e parte inferior do telhado da garagem;</li>
        <li>Pintura da parte superior de todo o telhado;</li>
        <li>Pintura das portas de madeira;</li>
      </ul>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>7.</strong> Os LOCATÁRIOS entregarão em perfeito estado de funcionamento e sem quaisquer avarias, riscos, manchas ou outros defeitos os mobiliários e equipamentos que guarnecem a residência.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>8.</strong> O aluguel mensal deverá ser pago mediante transferência bancária ao <strong><span class="highlight" data-field="banco">___</span></strong>, Agência <strong><span class="highlight" data-field="agencia">___</span></strong>, <strong><span class="highlight" data-field="tipo_conta">___</span></strong> <strong><span class="highlight" data-field="conta_banco">___</span></strong>, de titularidade do LOCADOR. Sobre o aluguel pago após o respectivo vencimento, incidirá multa moratória de 5% (cinco por cento) ao mês.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>9.</strong> Fica vedada a sublocação do imóvel ou a cessão dos direitos decorrentes deste instrumento a terceiros, mesmo que parcial ou temporária, seja a que título for, por parte da LOCATÁRIA, sem a anuência, por escrito, do LOCADOR.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>10.</strong> Além do aluguel mensal, incumbirá à LOCATÁRIA o pagamento de todas as despesas de manutenção (energia elétrica, água, etc.) e tributos incidentes (IPTU) sobre o imóvel, em seus respectivos vencimentos, devendo comprová-los ao LOCADOR sempre que solicitado, e, em especial, quando do encerramento do Contrato. A LOCATÁRIA providenciará a transferência de titularidade para suas responsabilidades junto aos serviços de abastecimento de água (Mat. <span class="highlight" data-field="mat_agua">___</span>) e energia (UC <span class="highlight" data-field="uc_energia">___</span>).</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>11.</strong> A LOCATÁRIA obriga-se a manter as dependências locadas em boas condições de higiene e limpeza, dentro das normas legais pertinentes.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>12.</strong> Qualquer benfeitoria ou construção que seja destinada ao imóvel objeto deste, deverá de imediato, ser submetida a autorização expressa do LOCADOR. Vindo a ser feita benfeitoria, sem a anuência do LOCADOR, faculta a este aceitá-la ou não, restando à LOCATÁRIA em caso do LOCADOR não as aceitar, modificar o imóvel da maneira que lhe foi entregue. As benfeitorias, consertos ou reparos farão parte integrante do imóvel, não assistindo à LOCATÁRIA o direito de retenção ou indenização sobre a mesma.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>13.</strong> O LOCADOR fica autorizado a vistoriar o imóvel, objeto da locação, mediante prévio agendamento com a LOCATÁRIA. As partes acordam se comunicar por escrito, via e-mail ou carta com AR. Constatando-se algum vício que possa afetar a estrutura física do imóvel ficará compelida a LOCATÁRIA a realizar o conserto, no prazo de 30 (trinta) dias. Não ocorrendo o conserto, o LOCADOR ficará facultado a RESCINDIR O CONTRATO, sem prejuízo dos numerários previstos neste.</p>

      <p style="text-align: justify; margin-bottom: 1rem;"><strong>14.</strong> Os contratantes elegem o foro de <strong><span class="highlight" data-field="foro_cidade">___</span></strong> para dirimir quaisquer avenças decorrentes do presente contrato.</p>

      <p style="text-align: justify; margin-bottom: 2rem;">E por estarem, assim, justas e contratadas, as partes assinam o presente instrumento particular em duas vias de igual teor, na presença de duas testemunhas, e que de tudo dão fé.</p>

      <div class="signature-area">
        <p style="text-align: right; margin-bottom: 4rem;">
          <span class="highlight" data-field="foro_cidade">___</span>, <span class="highlight" data-field="data_assinatura">___</span>.
        </p>

        <div class="signatures" style="margin-bottom: 3rem;">
          <div class="signature-block">
            <div class="signature-line">
              Locador: <span class="highlight" data-field="nome_locador">___</span>
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-line">
              Locatário: <span class="highlight" data-field="nome_locatario">___</span>
            </div>
          </div>
        </div>

        <div class="signatures">
          <div class="signature-block">
            <div class="signature-line">
              1ª Testemunha
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-line">
              2ª Testemunha
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
    category: 'Imobiliário',
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
      <p style="text-align: justify; margin-bottom: 1rem;">
        As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Locação Residencial, que se regerá pelas cláusulas seguintes.
      </p>

      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">2. Objeto do Contrato</h2>
      <ul style="margin-left: 20px; margin-bottom: 1rem; text-align: justify; list-style: none;">
        <li><strong>2.1 Denominação do imóvel:</strong> Residencial</li>
        <li><strong>2.2 Localização:</strong> <span class="highlight" data-field="end_imovel">___</span></li>
        <li><strong>2.3 Descrição:</strong> <span class="highlight" data-field="desc_imovel">___</span></li>
        <li><strong>2.4 Destinação:</strong> Somente fins residenciais.</li>
      </ul>

      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">3. Prazo do Contrato</h2>
      <p style="text-align: justify; margin-bottom: 1rem;">
        <strong>3.1</strong> O presente contrato terá vigência pelo prazo de <span class="highlight" data-field="prazo_meses">___</span> meses, iniciando-se em <span class="highlight" data-field="data_inicio">___</span> e terminando em <span class="highlight" data-field="data_termino">___</span>.
      </p>
      <p style="text-align: justify; margin-bottom: 1rem;">
        <strong>3.2</strong> O fim da locação independe de notificação judicial ou extrajudicial, obrigando-se o(a) LOCATÁRIO(A) a restituir o imóvel, completamente livre e desocupado.
      </p>
      <p style="text-align: justify; margin-bottom: 1rem;">
        <strong>3.3</strong> O contrato poderá ser renovado por igual período, mediante solicitação por escrito com antecedência mínima de 30 (trinta) dias.
      </p>

      <h2 style="font-size: 12pt; margin-top: 1rem; margin-bottom: 0.5rem;">4. Do Valor e Pagamento</h2>
      <p style="text-align: justify; margin-bottom: 1rem;">
        O valor do aluguel mensal é de <span class="highlight" data-field="valor_aluguel">___</span>, a ser pago pontualmente até a data de vencimento estipulada entre as partes.
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
              Locador: <span class="highlight" data-field="nome_locador">___</span>
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-line">
              Locatário: <span class="highlight" data-field="nome_locatario">___</span>
            </div>
          </div>
        </div>
      </div>
    `
  }
};
