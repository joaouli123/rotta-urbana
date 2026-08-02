export function privacyPolicyPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Políticas de Privacidade · Rotta Urbana</title>
  
  <!-- Favicon -->
  <link rel="icon" type="image/png" href="/app-icon.png">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg: #f8fafc;
      --panel: #ffffff;
      --border: #e2e8f0;
      --primary: #84cc16;
      --primary-dark: #4d7c0f;
      --text: #0f172a;
      --text-muted: #475569;
      --font-outfit: 'Outfit', sans-serif;
      --font-sans: 'Plus Jakarta Sans', sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.6;
      padding-top: 120px;
      padding-bottom: 80px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 24px;
    }

    header {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 100;
      background: #0f172a;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      height: 80px;
      display: flex;
      align-items: center;
    }

    .header-wrap {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .logo-img {
      height: 38px;
      object-fit: contain;
    }

    .back-link {
      color: #94a3b8;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
    }

    .back-link:hover {
      color: var(--primary);
    }

    .policy-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 48px;
      box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.05);
    }

    h1 {
      font-family: var(--font-outfit);
      font-size: 36px;
      font-weight: 900;
      margin-bottom: 12px;
      color: var(--text);
      line-height: 1.15;
    }

    .meta-date {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 32px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }

    h2 {
      font-family: var(--font-outfit);
      font-size: 22px;
      font-weight: 800;
      margin-top: 32px;
      margin-bottom: 16px;
      color: var(--text);
    }

    p {
      margin-bottom: 16px;
      color: var(--text-muted);
      font-size: 15px;
    }

    ul, ol {
      margin-bottom: 20px;
      padding-left: 24px;
      color: var(--text-muted);
      font-size: 15px;
    }

    li {
      margin-bottom: 8px;
    }

    .contact-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-top: 32px;
    }

    .contact-card h3 {
      font-family: var(--font-outfit);
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .contact-card p {
      margin-bottom: 8px;
      font-size: 14.5px;
    }

    .contact-card p:last-child {
      margin-bottom: 0;
    }

    @media (max-width: 768px) {
      .policy-box {
        padding: 24px;
        border-radius: 16px;
      }
      h1 {
        font-size: 28px;
      }
      body {
        padding-top: 100px;
      }
    }
  </style>
</head>
<body>

  <header>
    <div class="container header-wrap">
      <a href="/">
        <img src="/logo.png" alt="Rotta Urbana Logo" class="logo-img">
      </a>
      <a href="/" class="back-link">← Voltar ao site</a>
    </div>
  </header>

  <main class="container">
    <div class="policy-box">
      <h1>Políticas de Privacidade</h1>
      <div class="meta-date">Última atualização: 01 de Julho de 2026</div>

      <p>A <strong>ROTTA URBANA LTDA</strong>, pessoa jurídica de direito privado, valoriza a privacidade dos seus usuários e está empenhada em proteger as informações coletadas por meio da nossa plataforma de mobilidade urbana (aplicativo de mobilidade Rotta Urbana). Esta política descreve como coletamos, usamos, armazenamos e protegemos seus dados pessoais.</p>

      <h2>1. Informações que Coletamos</h2>
      <p>Para fornecer nossos serviços com qualidade e segurança, coletamos os seguintes tipos de informações:</p>
      <ul>
        <li><strong>Informações do Perfil do Usuário:</strong> Nome completo, endereço de e-mail, número de telefone celular, foto de perfil e senha de acesso.</li>
        <li><strong>Documentação do Motorista (apenas para parceiros):</strong> Registro da Carteira Nacional de Habilitação (CNH), Certificado de Registro e Licenciamento de Veículo (CRLV), comprovante de antecedentes criminais e chave PIX para repasse de pagamentos.</li>
        <li><strong>Dados de Localização (GPS):</strong> 
          <ul>
            <li><strong>Para Passageiros:</strong> Coletamos a localização precisa ou aproximada enquanto o aplicativo estiver aberto e em uso, para determinar os pontos de partida e destino e calcular as rotas.</li>
            <li><strong>Para Motoristas:</strong> Coletamos dados de localização precisa em tempo real enquanto o aplicativo estiver em uso e também em <strong>segundo plano</strong> (quando o aplicativo não estiver na tela ativa, mas o motorista estiver "Online" para receber chamadas), a fim de alocar corridas e manter o histórico de rastreamento de segurança.</li>
          </ul>
        </li>
        <li><strong>Histórico de Transações e Corridas:</strong> Detalhes das rotas realizadas, horários, preços cobrados, mensagens trocadas via chat interno e avaliações atribuídas.</li>
      </ul>

      <h2>2. Uso dos Dados Coletados</h2>
      <p>As informações são utilizadas para as seguintes finalidades:</p>
      <ul>
        <li>Conectar passageiros a motoristas em Sinop/MT e região.</li>
        <li>Calcular estimativas de tempo de chegada, rotas ideais e tarifas de corrida.</li>
        <li>Permitir que o passageiro pague diretamente o motorista via PIX (exibindo a chave PIX do motorista na tela de pagamento).</li>
        <li>Verificar a legitimidade dos documentos de motoristas parceiros para segurança de toda a comunidade.</li>
        <li>Oferecer recursos adicionais de segurança, como acompanhamento de rotas e o botão de reporte de incidentes.</li>
        <li>Processar assinaturas de planos e faturar os motoristas (diário, semanal e mensal).</li>
      </ul>

      <h2>3. Compartilhamento de Dados</h2>
      <p>A Rotta Urbana preza pela não-comercialização de seus dados. Compartilhamos apenas as informações estritamente necessárias para a prestação do serviço:</p>
      <ul>
        <li><strong>Entre Passageiro e Motorista:</strong> Durante uma solicitação de viagem, compartilhamos a foto de perfil, primeiro nome, localização do GPS atual, marca/modelo do veículo e placa para fins de embarque e segurança. Ao final da corrida, a chave PIX do motorista é compartilhada com o passageiro para viabilizar o pagamento.</li>
        <li><strong>Cumprimento Legal:</strong> Podemos divulgar dados às autoridades caso seja exigido por lei ou decisão judicial, para coibir fraudes ou garantir a segurança do aplicativo.</li>
      </ul>

      <h2>4. Armazenamento e Segurança dos Dados</h2>
      <p>Os seus dados são mantidos em servidores de banco de dados seguros e com criptografia padrão de mercado (via infraestrutura Supabase). Adotamos rígidas medidas físicas, técnicas e administrativas para evitar o acesso não autorizado, alteração ou perda das suas informações.</p>

      <h2>5. Seus Direitos e Exclusão de Conta</h2>
      <p>Você, como titular dos dados de acordo com a Lei Geral de Proteção de Dados (LGPD), possui direitos para confirmar a existência do tratamento, acessar seus dados e solicitar correções. Além disso, você tem o direito de solicitar a **exclusão definitiva** da sua conta e de todos os seus dados pessoais a qualquer momento.</p>
      <p>Para instruções detalhadas ou para solicitar a remoção direta dos seus dados, visite a nossa página de <a href="/exclusao-de-conta" style="color: var(--primary-dark); font-weight: 750; text-decoration: underline;">Exclusão de Conta</a>.</p>

      <div class="contact-card">
        <h3>Dúvidas e Contato</h3>
        <p>Se tiver qualquer dúvida sobre esta Política de Privacidade ou precisar exercer seus direitos de privacidade, entre em contato conosco:</p>
        <p><strong>Empresa:</strong> Rotta Urbana Ltda</p>
        <p><strong>E-mail de Suporte:</strong> <a href="mailto:contato@rottaurbana.com.br" style="color: var(--primary-dark); font-weight: bold;">contato@rottaurbana.com.br</a></p>
        <p><strong>WhatsApp Comercial:</strong> <a href="https://wa.me/5566996471003" target="_blank" style="color: var(--primary-dark); font-weight: bold;">+55 66 99647-1003</a></p>
      </div>
    </div>
  </main>

</body>
</html>`;
}

export function deleteAccountPage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Exclusão de Conta · Rotta Urbana</title>
  
  <!-- Favicon -->
  <link rel="icon" type="image/png" href="/app-icon.png">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg: #f8fafc;
      --panel: #ffffff;
      --border: #e2e8f0;
      --primary: #84cc16;
      --primary-dark: #4d7c0f;
      --danger: #ef4444;
      --text: #0f172a;
      --text-muted: #475569;
      --font-outfit: 'Outfit', sans-serif;
      --font-sans: 'Plus Jakarta Sans', sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.6;
      padding-top: 120px;
      padding-bottom: 80px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 24px;
    }

    header {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 100;
      background: #0f172a;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      height: 80px;
      display: flex;
      align-items: center;
    }

    .header-wrap {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .logo-img {
      height: 38px;
      object-fit: contain;
    }

    .back-link {
      color: #94a3b8;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
    }

    .back-link:hover {
      color: var(--primary);
    }

    .policy-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 48px;
      box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.05);
    }

    h1 {
      font-family: var(--font-outfit);
      font-size: 36px;
      font-weight: 900;
      margin-bottom: 12px;
      color: var(--text);
      line-height: 1.15;
    }

    .meta-date {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 32px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }

    h2 {
      font-family: var(--font-outfit);
      font-size: 22px;
      font-weight: 800;
      margin-top: 32px;
      margin-bottom: 16px;
      color: var(--text);
    }

    p {
      margin-bottom: 16px;
      color: var(--text-muted);
      font-size: 15px;
    }

    ol {
      margin-bottom: 24px;
      padding-left: 24px;
      color: var(--text-muted);
      font-size: 15px;
    }

    li {
      margin-bottom: 12px;
    }

    .warning-box {
      background: #fef2f2;
      border: 1px solid #fee2e2;
      color: #991b1b;
      padding: 20px;
      border-radius: 16px;
      margin-bottom: 24px;
      font-size: 14.5px;
    }

    .warning-box strong {
      display: block;
      margin-bottom: 4px;
      color: var(--danger);
    }

    .contact-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-top: 32px;
    }

    .contact-card h3 {
      font-family: var(--font-outfit);
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .contact-card p {
      margin-bottom: 8px;
      font-size: 14.5px;
    }

    .contact-card p:last-child {
      margin-bottom: 0;
    }

    @media (max-width: 768px) {
      .policy-box {
        padding: 24px;
        border-radius: 16px;
      }
      h1 {
        font-size: 28px;
      }
      body {
        padding-top: 100px;
      }
    }
  </style>
</head>
<body>

  <header>
    <div class="container header-wrap">
      <a href="/">
        <img src="/logo.png" alt="Rotta Urbana Logo" class="logo-img">
      </a>
      <a href="/" class="back-link">← Voltar ao site</a>
    </div>
  </header>

  <main class="container">
    <div class="policy-box">
      <h1>Solicitação de Exclusão de Conta</h1>
      <div class="meta-date">Instruções para usuários e motoristas parceiros</div>

      <p>Na Rotta Urbana, nós garantimos o seu direito à privacidade e a posse dos seus próprios dados. Se você deseja excluir a sua conta da nossa plataforma, você pode fazer isso de forma autônoma ou solicitando suporte.</p>

      <div class="warning-box">
        <strong>Atenção: Ação Irreversível!</strong>
        Ao excluir sua conta, seu histórico de viagens, avaliações, fotos de perfil, dados cadastrados e conexões de pagamento serão permanentemente apagados dos nossos servidores ativos de forma definitiva. Você não poderá recuperar o acesso a essa conta futuramente.
      </div>

      <h2>Opção 1: Exclusão direta pelo Aplicativo (Recomendado)</h2>
      <p>A maneira mais rápida e segura de excluir seus dados é diretamente de dentro do aplicativo no seu celular:</p>
      <ol>
        <li>Abra o aplicativo <strong>Rotta Urbana</strong> (Passageiro ou Motorista) e faça login.</li>
        <li>No menu principal ou barra de navegação, clique na sua <strong>Foto de Perfil</strong> para abrir as configurações.</li>
        <li>Selecione a opção <strong>"Editar Perfil"</strong> ou <strong>"Configurações da Conta"</strong>.</li>
        <li>Role a tela até o final e clique no botão vermelho escrito <strong>"Excluir Minha Conta"</strong>.</li>
        <li>Confirme a sua senha e confirme a decisão na tela. O sistema desconectará você e iniciará a remoção definitiva imediatamente.</li>
      </ol>

      <h2>Opção 2: Solicitação por E-mail ou WhatsApp</h2>
      <p>Caso não tenha mais acesso ao aplicativo instalado ou prefira falar com o suporte, envie sua solicitação pelos nossos canais oficiais de comunicação:</p>
      <ol>
        <li>Envie um e-mail para <a href="mailto:contato@rottaurbana.com.br" style="color: var(--primary-dark); font-weight: bold;">contato@rottaurbana.com.br</a> com o assunto "Exclusão de Conta".</li>
        <li>No corpo da mensagem, informe o seu <strong>número de telefone cadastrado com o DDD</strong> e seu <strong>nome completo</strong>.</li>
        <li>Nossa equipe efetuará uma rápida verificação de segurança para confirmar sua identidade e processará a exclusão completa dos seus dados em até <strong>5 dias úteis</strong>.</li>
      </ol>

      <h2>Retenção de Dados por Obrigações Legais</h2>
      <p>Conforme previsto na Lei Geral de Proteção de Dados (LGPD) e pelo Marco Civil da Internet (Lei Federal nº 12.965/2014), certas informações (como logs de acesso contendo IP, data e hora de conexão, além do histórico financeiro de transações) devem ser mantidas em armazenamento seguro pelo período legal obrigatório de 6 (seis) meses para fins de cumprimento de obrigações tributárias ou judiciais. Passado este período legal, estes dados remanescentes são destruídos permanentemente.</p>

      <div class="contact-card">
        <h3>Canais de Atendimento e Suporte</h3>
        <p>Se tiver qualquer dificuldade para excluir sua conta, nossa equipe de suporte está à disposição:</p>
        <p><strong>Empresa:</strong> Rotta Urbana Ltda</p>
        <p><strong>E-mail:</strong> <a href="mailto:contato@rottaurbana.com.br" style="color: var(--primary-dark); font-weight: bold;">contato@rottaurbana.com.br</a></p>
        <p><strong>WhatsApp de Suporte:</strong> <a href="https://wa.me/5566996471003" target="_blank" style="color: var(--primary-dark); font-weight: bold;">+55 66 99647-1003</a></p>
      </div>
    </div>
  </main>

</body>
</html>`;
}

export function termsOfServicePage() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Termos e Condições de Uso · Rotta Urbana</title>
  
  <link rel="icon" type="image/png" href="/app-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg: #f8fafc;
      --panel: #ffffff;
      --border: #e2e8f0;
      --primary: #84cc16;
      --primary-dark: #4d7c0f;
      --text: #0f172a;
      --text-muted: #475569;
      --font-outfit: 'Outfit', sans-serif;
      --font-sans: 'Plus Jakarta Sans', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: var(--bg); color: var(--text); font-family: var(--font-sans); line-height: 1.6; padding-top: 120px; padding-bottom: 80px; }
    .container { max-width: 800px; margin: 0 auto; padding: 0 24px; }
    header { position: fixed; top: 0; left: 0; width: 100%; z-index: 100; background: #0f172a; border-bottom: 1px solid rgba(255, 255, 255, 0.08); height: 80px; display: flex; align-items: center; }
    .header-wrap { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .logo-img { height: 38px; object-fit: contain; }
    .back-link { color: #94a3b8; font-size: 14px; font-weight: 600; text-decoration: none; }
    .back-link:hover { color: var(--primary); }
    .policy-box { background: var(--panel); border: 1px solid var(--border); border-radius: 24px; padding: 48px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.05); }
    h1 { font-family: var(--font-outfit); font-size: 36px; font-weight: 900; margin-bottom: 12px; color: var(--text); line-height: 1.15; }
    .meta-date { font-size: 14px; color: var(--text-muted); margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
    h2 { font-family: var(--font-outfit); font-size: 22px; font-weight: 800; margin-top: 32px; margin-bottom: 16px; color: var(--text); }
    p { margin-bottom: 16px; color: var(--text-muted); font-size: 15px; }
    ul, ol { margin-bottom: 20px; padding-left: 24px; color: var(--text-muted); font-size: 15px; }
    li { margin-bottom: 8px; }
    .contact-card { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-top: 32px; }
    .contact-card h3 { font-family: var(--font-outfit); font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .contact-card p { margin-bottom: 8px; font-size: 14.5px; }
    .contact-card p:last-child { margin-bottom: 0; }
    @media (max-width: 768px) {
      .policy-box { padding: 24px; border-radius: 16px; }
      h1 { font-size: 28px; }
      body { padding-top: 100px; }
    }
  </style>
</head>
<body>

  <header>
    <div class="container header-wrap">
      <a href="/">
        <img src="/logo.png" alt="Rotta Urbana Logo" class="logo-img">
      </a>
      <a href="/" class="back-link">← Voltar ao site</a>
    </div>
  </header>

  <main class="container">
    <div class="policy-box">
      <h1>Termos e Condições de Uso</h1>
      <div class="meta-date">Última atualização: 01 de Julho de 2026</div>

      <p>Bem-vindo ao <strong>Rotta Urbana</strong>. Estes Termos e Condições de Uso ("Termos") regem o acesso e a utilização dos serviços oferecidos pela <strong>ROTTA URBANA LTDA</strong> por meio da nossa plataforma digital e aplicativos móveis para passageiros e motoristas parceiros.</p>

      <h2>1. Aceitação dos Termos</h2>
      <p>Ao se cadastrar, baixar ou utilizar o aplicativo Rotta Urbana, você declara ter lido, compreendido e aceito integralmente estes Termos e a nossa Política de Privacidade. Caso não concorde com qualquer disposição aqui prevista, você não deverá utilizar a plataforma.</p>

      <h2>2. Cadastro e Requisitos</h2>
      <p>Para utilizar os serviços do Rotta Urbana, o usuário deve ser plenamente capaz segundo as leis brasileiras (maior de 18 anos) e fornecer informações verídicas, completas e atualizadas.</p>
      <ul>
        <li><strong>Para Passageiros:</strong> O cadastro exige nome, e-mail, telefone válido e senha de acesso.</li>
        <li><strong>Para Motoristas Parceiros:</strong> Além dos dados pessoais básicos, o motorista deverá fornecer cópia legível da CNH com observação de Exercício de Atividade Remunerada (EAR), CRLV do veículo cadastrado, comprovante de residência e atestado de antecedentes criminais. A aprovação da conta depende da validação completa dos documentos pela equipe Rotta Urbana.</li>
      </ul>

      <h2>3. Natureza dos Serviços</h2>
      <p>O Rotta Urbana opera como uma plataforma de tecnologia que conecta intermediando passageiros e motoristas parceiros autônomos. O Rotta Urbana não é empresa de transporte e não possui frota própria de veículos. Os motoristas parceiros prestam serviços de transporte privado individual de passageiros de forma autônoma e independente.</p>

      <h2>4. Tarifas, Pagamentos e Assinaturas</h2>
      <p>As tarifas de transporte calculadas pelo aplicativo consideram bandeirada base, distância percorrida (KM) e tempo estimado de rota (minutos).</p>
      <ul>
        <li><strong>Pagamentos via PIX:</strong> O passageiro efetua o pagamento diretamente ao motorista via chave PIX exibida na tela do aplicativo ao término da viagem ou via meio direto disponibilizado na plataforma.</li>
        <li><strong>Planos de Assinatura do Motorista:</strong> O motorista parceiro pode optar por planos flexíveis (Por Corrida, Diário, Semanal ou Mensal) para utilizar a plataforma, mantendo o controle transparente de seus ganhos sem taxas ocultas.</li>
      </ul>

      <h2>5. Cancelamento e Segurança</h2>
      <p>O passageiro e o motorista podem cancelar a viagem antes do seu início. O descumprimento injustificado de viagens aceitas ou comportamento inadequado sujeito à denúncia no chat ou botão de emergência poderá resultar na suspensão ou banimento definitivo da conta do usuário.</p>

      <h2>6. Direitos de Propriedade Intelectual</h2>
      <p>Todos os direitos autorais, marcas registrados, logos e códigos da marca Rotta Urbana são de propriedade exclusiva da ROTTA URBANA LTDA. É proibida a reprodução ou engenharia reversa sem autorização expressa por escrito.</p>

      <h2>7. Alterações destes Termos</h2>
      <p>O Rotta Urbana poderá alterar estes Termos a qualquer momento. As modificações entrarão em vigor após a publicação da nova versão na plataforma. O uso continuado dos serviços após as alterações constitui aceitação dos novos termos.</p>

      <div class="contact-card">
        <h3>Dúvidas e Canais Oficiais</h3>
        <p>Se você tiver qualquer dúvida sobre estes Termos de Uso, entre em contato com nossa equipe:</p>
        <p><strong>Empresa:</strong> Rotta Urbana Ltda</p>
        <p><strong>E-mail de Contato:</strong> <a href="mailto:contato@rottaurbana.com.br" style="color: var(--primary-dark); font-weight: bold;">contato@rottaurbana.com.br</a></p>
        <p><strong>WhatsApp Oficial:</strong> <a href="https://wa.me/5566996471003" target="_blank" style="color: var(--primary-dark); font-weight: bold;">+55 66 99647-1003</a></p>
      </div>
    </div>
  </main>

</body>
</html>`;
}
