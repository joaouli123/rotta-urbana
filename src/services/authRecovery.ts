export type PasswordRecoveryLink =
  | { accessToken: string; refreshToken: string }
  | { error: string }
  | null;

function decode(value: string): string {
  try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; }
}

export function parsePasswordRecoveryUrl(url: string): PasswordRecoveryLink {
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const hash = url.split('#')[1] ?? '';
  const params: Record<string, string> = {};

  for (const part of `${query}&${hash}`.split('&')) {
    if (!part) continue;
    const [key, ...rest] = part.split('=');
    if (key) params[decode(key)] = decode(rest.join('='));
  }

  if (params.error) {
    return { error: params.error_description || 'O link de redefinicao expirou ou nao e valido.' };
  }
  if (params.type !== 'recovery' || !params.access_token || !params.refresh_token) return null;
  return { accessToken: params.access_token, refreshToken: params.refresh_token };
}
