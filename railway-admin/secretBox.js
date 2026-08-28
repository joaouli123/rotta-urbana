import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function encryptionKey() {
  const raw = String(process.env.MP_SPLIT_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('MP_SPLIT_ENCRYPTION_KEY não configurada.');
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error('MP_SPLIT_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais.');
  }
  return Buffer.from(raw, 'hex');
}

export function secretBoxConfigured() {
  const raw = String(process.env.MP_SPLIT_ENCRYPTION_KEY || '').trim();
  return /^[a-f0-9]{64}$/i.test(raw);
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(value) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(value || '').split('.');
  if (version !== VERSION || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Token criptografado inválido.');
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

