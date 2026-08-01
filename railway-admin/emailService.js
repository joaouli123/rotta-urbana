import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY || 're_GrzUC7GF_4txG77tqjLpnFhtdrcR3jwbE';
const resend = new Resend(apiKey);
const fromEmail = process.env.FROM_EMAIL || 'Rotta Urbana <contato@rottaurbana.com.br>';

/**
 * Funcao generica para envio via Resend
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    const response = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, '')
    });
    console.log(`[Resend Email Sent] Subject: "${subject}" to: ${to}`, response);
    return { success: true, data: response };
  } catch (error) {
    console.error(`[Resend Email Error] Subject: "${subject}" to: ${to}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 1. Email de Boas-Vindas (Criacao de Conta)
 */
export async function sendWelcomeEmail({ email, name = 'Usuário', role = 'Passageiro' }) {
  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#F7F8F6; padding:30px 15px;">
      <div style="max-width:550px; margin:0 auto; background:#FFFFFF; border-radius:12px; border:1px solid #E3E6E1; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #EEEEEE;">
          <h2 style="color:#279A0A; margin:0; font-size:24px;">Rotta Urbana</h2>
          <p style="color:#646A64; margin:5px 0 0 0; font-size:14px;">Mobilidade Urbana Inteligente</p>
        </div>
        <div style="padding:20px 0;">
          <h3 style="color:#0B0C0D; margin-top:0;">Bem-vindo(a), ${name}!</h3>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">
            Sua conta de <strong>${role}</strong> no Rotta Urbana foi criada com sucesso!
          </p>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">
            Agora você faz parte da plataforma de transporte mais justa e vantajosa da cidade. Aproveite viagens sem tarifas dinâmicas abusivas e saques instantâneos via PIX.
          </p>
          <div style="text-align:center; margin:30px 0;">
            <a href="https://play.google.com/store/apps/details?id=com.rottaurbana.app&hl=pt_BR" style="background:#48D10A; color:#0B0C0D; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:bold; font-size:15px; display:inline-block;">Acessar o App</a>
          </div>
        </div>
        <div style="border-top:1px solid #EEEEEE; padding-top:20px; text-align:center; color:#8A9088; font-size:12px;">
          © 2026 Rotta Urbana. Todos os direitos reservados.
        </div>
      </div>
    </div>
  `;
  return sendEmail({ to: email, subject: 'Bem-vindo ao Rotta Urbana!', html });
}

/**
 * 2. Email de Redefinicao de Senha
 */
export async function sendPasswordResetEmail({ email, name = 'Usuário', resetUrl = '#' }) {
  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#F7F8F6; padding:30px 15px;">
      <div style="max-width:550px; margin:0 auto; background:#FFFFFF; border-radius:12px; border:1px solid #E3E6E1; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #EEEEEE;">
          <h2 style="color:#279A0A; margin:0; font-size:24px;">Rotta Urbana</h2>
        </div>
        <div style="padding:20px 0;">
          <h3 style="color:#0B0C0D; margin-top:0;">Redefinição de Senha</h3>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">Olá, ${name}.</p>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">
            Recebemos uma solicitação para redefinir a senha da sua conta no Rotta Urbana. Clique no botão abaixo para escolher uma nova senha:
          </p>
          <div style="text-align:center; margin:30px 0;">
            <a href="${resetUrl}" style="background:#0B0C0D; color:#FFFFFF; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:bold; font-size:15px; display:inline-block;">Redefinir Minha Senha</a>
          </div>
          <p style="color:#8A9088; font-size:13px; line-height:1.5;">
            Se você não solicitou a alteração, por favor ignore este e-mail. Sua senha continuará a mesma.
          </p>
        </div>
        <div style="border-top:1px solid #EEEEEE; padding-top:20px; text-align:center; color:#8A9088; font-size:12px;">
          © 2026 Rotta Urbana. Suporte e Segurança.
        </div>
      </div>
    </div>
  `;
  return sendEmail({ to: email, subject: 'Redefinição de Senha — Rotta Urbana', html });
}

/**
 * 3. Email de Conta Apagada / Desativada
 */
export async function sendAccountDeletedEmail({ email, name = 'Usuário' }) {
  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#F7F8F6; padding:30px 15px;">
      <div style="max-width:550px; margin:0 auto; background:#FFFFFF; border-radius:12px; border:1px solid #E3E6E1; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #EEEEEE;">
          <h2 style="color:#E5484D; margin:0; font-size:24px;">Rotta Urbana</h2>
        </div>
        <div style="padding:20px 0;">
          <h3 style="color:#0B0C0D; margin-top:0;">Conta Encerrada</h3>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">Olá, ${name}.</p>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">
            Sua conta no Rotta Urbana foi encerrada com sucesso conforme solicitado. Todos os seus dados pessoais foram processados em conformidade com as diretrizes de privacidade (LGPD).
          </p>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">
            Agradecemos pelo tempo em que esteve conosco. Se desejar retornar no futuro, as portas estarão sempre abertas!
          </p>
        </div>
        <div style="border-top:1px solid #EEEEEE; padding-top:20px; text-align:center; color:#8A9088; font-size:12px;">
          © 2026 Rotta Urbana. Atendimento ao Cliente.
        </div>
      </div>
    </div>
  `;
  return sendEmail({ to: email, subject: 'Confirmação de Encerramento de Conta — Rotta Urbana', html });
}

/**
 * 4. Email de Pagamento Aprovado
 */
export async function sendPaymentApprovedEmail({ email, name = 'Usuário', amount = 'R$ 0,00', method = 'PIX', transactionId = 'TX123456' }) {
  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#F7F8F6; padding:30px 15px;">
      <div style="max-width:550px; margin:0 auto; background:#FFFFFF; border-radius:12px; border:1px solid #E3E6E1; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #EEEEEE;">
          <h2 style="color:#279A0A; margin:0; font-size:24px;">Rotta Urbana</h2>
          <p style="color:#646A64; margin:5px 0 0 0; font-size:14px;">Comprovante de Pagamento</p>
        </div>
        <div style="padding:20px 0;">
          <h3 style="color:#0B0C0D; margin-top:0;">Pagamento Aprovado</h3>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">Olá, ${name}. Confirmamos o recebimento do seu pagamento.</p>
          
          <div style="background:#F7F8F6; border-radius:8px; padding:15px; margin:20px 0; border:1px solid #E3E6E1;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="color:#646A64; font-size:14px;">Valor:</span>
              <strong style="color:#279A0A; font-size:16px;">${amount}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
              <span style="color:#646A64; font-size:14px;">Forma de Pagamento:</span>
              <span style="color:#0B0C0D; font-weight:bold; font-size:14px;">${method}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:#646A64; font-size:14px;">Código da Transação:</span>
              <span style="color:#0B0C0D; font-family:monospace; font-size:13px;">${transactionId}</span>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid #EEEEEE; padding-top:20px; text-align:center; color:#8A9088; font-size:12px;">
          © 2026 Rotta Urbana. Financeiro.
        </div>
      </div>
    </div>
  `;
  return sendEmail({ to: email, subject: `Pagamento de ${amount} Aprovado`, html });
}

/**
 * 5. Email de Corrida Concluida
 */
export async function sendRideCompletedEmail({ email, name = 'Passageiro', driverName = 'Motorista Parceiro', amount = 'R$ 15,00', origin = 'Origem', destination = 'Destino' }) {
  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#F7F8F6; padding:30px 15px;">
      <div style="max-width:550px; margin:0 auto; background:#FFFFFF; border-radius:12px; border:1px solid #E3E6E1; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #EEEEEE;">
          <h2 style="color:#279A0A; margin:0; font-size:24px;">Rotta Urbana</h2>
          <p style="color:#646A64; margin:5px 0 0 0; font-size:14px;">Resumo da Viagem</p>
        </div>
        <div style="padding:20px 0;">
          <h3 style="color:#0B0C0D; margin-top:0;">Obrigado por viajar conosco</h3>
          <p style="color:#4E534E; font-size:15px; line-height:1.6;">Olá, ${name}. Sua corrida foi concluída com sucesso com o motorista <strong>${driverName}</strong>.</p>
          
          <div style="background:#F7F8F6; border-radius:8px; padding:15px; margin:20px 0; border:1px solid #E3E6E1;">
            <p style="margin:0 0 8px 0; font-size:14px; color:#646A64;"><strong>Embarque:</strong> ${origin}</p>
            <p style="margin:0 0 12px 0; font-size:14px; color:#646A64;"><strong>Desembarque:</strong> ${destination}</p>
            <hr style="border:none; border-top:1px solid #E3E6E1; margin:10px 0;" />
            <p style="margin:0; font-size:15px; color:#0B0C0D;"><strong>Total Pago:</strong> <span style="color:#279A0A; font-weight:bold;">${amount}</span></p>
          </div>
        </div>
        <div style="border-top:1px solid #EEEEEE; padding-top:20px; text-align:center; color:#8A9088; font-size:12px;">
          © 2026 Rotta Urbana. Viagens Seguras.
        </div>
      </div>
    </div>
  `;
  return sendEmail({ to: email, subject: `Resumo da sua viagem Rotta Urbana — ${amount}`, html });
}

/**
 * 6. Email de Form de Contato (Landing Page)
 */
export async function sendContactFormEmail({ name, email, phone = 'Não informado', subject = 'Geral', message }) {
  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#F7F8F6; padding:30px 15px;">
      <div style="max-width:550px; margin:0 auto; background:#FFFFFF; border-radius:12px; border:1px solid #E3E6E1; padding:30px; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #EEEEEE;">
          <h2 style="color:#279A0A; margin:0; font-size:24px;">Rotta Urbana</h2>
          <p style="color:#646A64; margin:5px 0 0 0; font-size:14px;">Nova Mensagem de Contato</p>
        </div>
        <div style="padding:20px 0;">
          <h3 style="color:#0B0C0D; margin-top:0;">Contato via Landing Page</h3>
          <p><strong>Nome:</strong> ${name}</p>
          <p><strong>E-mail:</strong> ${email}</p>
          <p><strong>Telefone:</strong> ${phone}</p>
          <p><strong>Assunto:</strong> ${subject}</p>
          <hr style="border:none; border-top:1px solid #EEEEEE; margin:15px 0;" />
          <p><strong>Mensagem:</strong></p>
          <p style="background:#F7F8F6; padding:12px; border-radius:6px; font-size:14px; color:#4E534E;">${message}</p>
        </div>
      </div>
    </div>
  `;
  const adminEmail = process.env.ADMIN_EMAIL || 'cleipytt49app2@gmail.com';
  return sendEmail({ to: adminEmail, subject: `[Contato LP] ${subject} - ${name}`, html });
}
