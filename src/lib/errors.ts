// Map Supabase/network error messages to friendly PT-BR text.
export function friendlyError(msg?: string): string {
  if (!msg) return 'Algo deu errado. Tente novamente.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) return 'Este e-mail já está cadastrado.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('password should') || m.includes('weak password') || m.includes('password')) return 'Senha fraca: use ao menos 8 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('email')) return 'E-mail inválido.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um instante.';
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to')) return 'Sem conexão. Verifique sua internet.';
  return msg;
}
