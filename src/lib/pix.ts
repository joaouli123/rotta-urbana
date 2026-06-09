// Static PIX "copia e cola" (BR Code / EMV) generator.
// Lets a passenger pay a driver directly into their PIX key — no per-driver
// payment-gateway integration needed. Standard: Bacen PIX EMVCo + CRC16-CCITT.

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the payload incl. "6304".
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
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
  name: string;           // nome do recebedor
  city: string;           // cidade do recebedor
  amount?: number;        // valor (opcional)
  txid?: string;          // identificador (<=25), default '***'
  description?: string;   // descrição opcional
}

/** Returns the PIX copia-e-cola string, or null if no key is provided. */
export function buildPixPayload(input: PixInput): string | null {
  const key = (input.key || '').trim();
  if (!key) return null;

  const gui = tlv('00', 'br.gov.bcb.pix');
  const k = tlv('01', key);
  const desc = input.description ? tlv('02', input.description.slice(0, 40)) : '';
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
