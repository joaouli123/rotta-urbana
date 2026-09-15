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

  // ── Service area ("ride outside service area: Sinop/MT") ─────────────────
  if (m.includes('destination outside service area')) return 'O novo destino fica fora da área de atendimento.';
  if (m.includes('outside service area')) {
    const area = msg.match(/outside service area:\s*(.+)$/i)?.[1]?.trim();
    return area
      ? `Endereço fora da área de atendimento. No momento atendemos somente ${area}.`
      : 'Esse endereço fica fora da área de atendimento.';
  }

  // ── Ride flow (accept_ride / cancel_ride / update_ride_destination) ──────
  if (m.includes('ride no longer available'))
    return 'Essa corrida não está mais disponível: outro motorista aceitou, o passageiro cancelou ou o tempo acabou.';
  if (m.includes('driver already has an active ride')) return 'Você já está em uma corrida. Finalize-a antes de aceitar outra.';
  if (m.includes('driver is not online')) return 'Fique online para aceitar corridas.';
  if (m.includes('subscription inactive or expired')) return 'Sua assinatura está vencida. Renove para aceitar corridas.';
  if (m.includes('nao atende a categoria')) return 'Seu veículo não atende à categoria desta corrida.';
  if (m.includes('ride not cancellable')) return 'Essa corrida já foi finalizada e não pode ser cancelada.';
  if (m.includes('only be changed during an active ride'))
    return 'O destino só pode ser alterado depois que um motorista aceitar a corrida.';
  if (m.includes('not assigned to this user') || m.includes('not found or not yours')) return 'Corrida não encontrada.';

  // ── Connectivity ──────────────────────────────────────────────────────────
  if (m.includes('ride_cancel_timeout') || m.includes('ridecanceltimeouterror'))
    return 'O cancelamento não foi confirmado em até 1 minuto. Verifique sua conexão e tente novamente.';
  if (m.includes('aborted') || m.includes('abort') || m.includes('timed out') || m.includes('timeout'))
    return 'Tempo esgotado. Verifique sua conexão.';
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to'))
    return 'Sem conexão. Verifique sua internet.';

  return msg;
}
