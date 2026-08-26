// Static PIX "copia e cola" (BR Code / EMV) generator.
// Lets a passenger pay a driver directly into their PIX key — no per-driver
// payment-gateway integration needed. Standard: Bacen PIX EMVCo + CRC16-CCITT.

function tlv(id: string, value: string): string {
  // EMVCo lengths are bytes, not JavaScript UTF-16 code units.
  const len = new TextEncoder().encode(value).length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the payload incl. "6304".
function crc16(payload: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(payload);
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Strip accents / invalid chars and clamp length (name<=25, city<=15 per spec).
function sanitize(s: string, max: number): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase().trim().slice(0, max) || 'NA';
}

export interface PixInput {
  key: string;            // chave PIX do recebedor
  keyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  name: string;           // nome do recebedor
  city: string;           // cidade do recebedor
  amount?: number;        // valor (opcional)
  txid?: string;          // identificador (<=25), default '***'
  description?: string;   // descrição opcional
}

/** Normalize the formats accepted by the PIX BR Code merchant account field. */
export function normalizePixKey(value: string, type?: PixInput['keyType']): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (type === 'cpf' || type === 'cnpj') return raw.replace(/\D/g, '');
  if (type === 'phone') {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) return `+55${digits}`;
    if (digits.length === 13 && digits.startsWith('55')) return `+${digits}`;
    return raw.replace(/[^0-9+]/g, '');
  }
  if (type === 'email') return raw.toLowerCase();
  return raw.replace(/\s+/g, '');
}

function isPlausiblePixKey(key: string, type?: PixInput['keyType']): boolean {
  if (key.length < 1 || key.length > 77) return false;
  if (type === 'cpf') return /^\d{11}$/.test(key);
  if (type === 'cnpj') return /^\d{14}$/.test(key);
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
  if (type === 'phone') return /^\+\d{12,13}$/.test(key);
  return /^[A-Za-z0-9._+@-]+$/.test(key);
}

/** Returns the PIX copia-e-cola string, or null if no key is provided. */
export function buildPixPayload(input: PixInput): string | null {
  const key = normalizePixKey(input.key, input.keyType);
  if (!isPlausiblePixKey(key, input.keyType)) return null;

  const gui = tlv('00', 'br.gov.bcb.pix');
  const k = tlv('01', key);
  const desc = input.description ? tlv('02', sanitize(input.description, 40)) : '';
  const merchantAccount = tlv('26', gui + k + desc);

  const txid = (input.txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';

  let payload =
    tlv('00', '01') +              // payload format indicator
    merchantAccount +
    tlv('52', '0000') +           // merchant category code
    tlv('53', '986') +            // currency BRL
    (input.amount != null && input.amount > 0 ? tlv('54', input.amount.toFixed(2)) : '') +
    tlv('58', 'BR') +             // country
    tlv('59', sanitize(input.name, 25)) +
    tlv('60', sanitize(input.city, 15)) +
    tlv('62', tlv('05', txid)) +  // additional data: reference label
    '6304';                        // CRC placeholder id+len

  return payload + crc16(payload);
}
