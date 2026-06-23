// Map Supabase/network error messages to friendly PT-BR text.
// NOTE: order matters. Rate-limit checks must come BEFORE the generic e-mail
// check — Supabase's "Email rate limit exceeded" contains the word "email" and
// was previously mis-shown as "E-mail inválido" at the end of a cadastro.
export function friendlyError(msg?: string): string {
  if (!msg) return 'Algo deu errado. Tente novamente.';
  const m = msg.toLowerCase();

  // ── Login / account state ────────────────────────────────────────────────
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already'))
    return 'Este e-mail já está cadastrado. Faça login.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('signup') && m.includes('disabled')) return 'Cadastro temporariamente indisponível. Tente mais tarde.';

  // ── Rate limits (must precede the generic e-mail/senha catches) ───────────
  // "For security purposes, you can only request this after N seconds."
  const sec = m.match(/after (\d+)\s*seconds?/);
  if (m.includes('for security purposes') || m.includes('only request this after')) {
    return sec ? `Aguarde ${sec[1]} segundos e tente novamente.` : 'Aguarde alguns segundos e tente novamente.';
  }
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit') ||
      m.includes('rate limit') || m.includes('too many requests') || m.includes('too many')) {
    return 'Muitas tentativas em pouco tempo. Aguarde 1 minuto e tente de novo.';
  }

  // ── Field-level ───────────────────────────────────────────────────────────
  if (m.includes('password should') || m.includes('weak password') ||
      (m.includes('password') && (m.includes('least') || m.includes('character'))))
    return 'Senha fraca: use ao menos 8 caracteres.';
  // Only true e-mail-format problems map here (NOT anything merely containing "email").
  if (m.includes('unable to validate email') || m.includes('invalid email') ||
      m.includes('email address is invalid') || m.includes('invalid format'))
    return 'E-mail inválido. Confira e tente novamente.';

  // ── Connectivity ──────────────────────────────────────────────────────────
  if (m.includes('aborted') || m.includes('abort') || m.includes('timed out') || m.includes('timeout'))
    return 'Tempo esgotado. Verifique sua conexão.';
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to'))
    return 'Sem conexão. Verifique sua internet.';

  return msg;
}
