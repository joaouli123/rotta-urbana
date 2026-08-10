import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAccountDeletedEmail,
  sendPaymentApprovedEmail,
  sendRideCompletedEmail,
  sendContactFormEmail
} from './emailService.js';

const targetEmail = 'jl.uli1996@gmail.com';

async function runTests() {
  console.log(`Iniciando disparos de teste de e-mail via Resend para: ${targetEmail}`);

  console.log('\n1. Enviando e-mail de Boas-vindas...');
  const res1 = await sendWelcomeEmail({ email: targetEmail, name: 'João Lucas', role: 'Motorista Parceiro' });
  console.log('Resultado 1:', res1);

  console.log('\n2. Enviando e-mail de Redefinição de Senha...');
  const res2 = await sendPasswordResetEmail({ email: targetEmail, name: 'João Lucas', resetUrl: 'https://rottaurbana.app/reset-password?token=sample123' });
  console.log('Resultado 2:', res2);

  console.log('\n3. Enviando e-mail de Conta Apagada...');
  const res3 = await sendAccountDeletedEmail({ email: targetEmail, name: 'João Lucas' });
  console.log('Resultado 3:', res3);

  console.log('\n4. Enviando e-mail de Pagamento Aprovado...');
  const res4 = await sendPaymentApprovedEmail({ email: targetEmail, name: 'João Lucas', amount: 'R$ 49,90', method: 'PIX Instantâneo', transactionId: 'PIX-987654321' });
  console.log('Resultado 4:', res4);

  console.log('\n5. Enviando e-mail de Corrida Concluída...');
  const res5 = await sendRideCompletedEmail({ email: targetEmail, name: 'João Lucas', driverName: 'Carlos Silva', amount: 'R$ 18,50', origin: 'Av. das Embaúbas, 1200 - Centro', destination: 'Residencial Gente Feliz, Quadra 4' });
  console.log('Resultado 5:', res5);

  console.log('\n6. Enviando e-mail de Formulário de Contato da Landing Page...');
  const res6 = await sendContactFormEmail({ name: 'João Lucas', email: targetEmail, phone: '(66) 99647-1003', subject: 'Quero ser motorista parceiro', message: 'Gostaria de tirar dúvidas sobre o plano Rotta Smart.' });
  console.log('Resultado 6:', res6);

console.log('\nTestes concluídos.');
}

runTests();
