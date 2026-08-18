// Tabela FIPE lookup via Parallelum v2 (free: ~500 req/day, no auth).
// Used at vehicle registration to capture the car's market value + FIPE code,
// which feed the per-category eligibility rules (comfort/premium thresholds).
// Docs: https://fipe.parallelum.com.br/api/v2
const BASE = 'https://fipe.parallelum.com.br/api/v2';
const LEGACY_BASE = 'https://parallelum.com.br/fipe/api/v1';

export interface FipeItem { code: string; name: string }
export interface FipeResult {
  value: number;      // BRL parsed from "R$ 10.000,00"
  code: string;       // codeFipe
  brand: string;
  model: string;
  /** Effective year used by the platform's vehicle rules. Zero-km FIPE entries use the current year. */
  year: number;
  /** Raw FIPE model year. FIPE uses 32000 for zero-km vehicles. */
  fipeModelYear: number;
  /** Year/fuel code selected in the FIPE table, e.g. 2025-1 or 32000-1. */
  fipeYearCode: string;
  /** Human-readable year shown to the user, e.g. "2025 - Gasolina" or "0 km - Gasolina". */
  yearLabel: string;
  fuel: string;
  isZeroKm: boolean;
  reference: string;
}

// FIPE has separate tables for cars and motorcycles; pick by vehicle kind.
export type FipeKind = 'cars' | 'motorcycles';

async function getFrom<T>(base: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`FIPE ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

const get = <T,>(path: string) => getFrom<T>(BASE, path);

function legacyKind(kind: FipeKind): string {
  return kind === 'motorcycles' ? 'motos' : 'carros';
}

export const fipeBrands = (kind: FipeKind = 'cars') => get<FipeItem[]>(`/${kind}/brands`);
export const fipeModels = (brandId: string, kind: FipeKind = 'cars') =>
  get<FipeItem[]>(`/${kind}/brands/${brandId}/models`);
export const fipeYears = async (brandId: string, modelId: string, kind: FipeKind = 'cars') => {
  let items = await get<FipeItem[]>(`/${kind}/brands/${brandId}/models/${modelId}/years`);

  // The v2 endpoint occasionally omits the 0-km/fuel variants for a model.
  // Merge the legacy response when necessary so Yamaha and other brands do
  // not lose valid years just because one FIPE endpoint is incomplete.
  if (!items.some((item) => getFipeYearInfo(item).isZeroKm)) {
    try {
      const legacy = await getFrom<Array<{ codigo: string | number; nome: string }>>(
        LEGACY_BASE,
        `/${legacyKind(kind)}/marcas/${brandId}/modelos/${modelId}/anos`,
      );
      const merged = [...items, ...legacy.map((item) => ({ code: String(item.codigo), name: String(item.nome) }))];
      items = Array.from(new Map(merged.map((item) => [item.code, item])).values());
    } catch {
      // Keep the v2 response when the compatibility endpoint is unavailable.
    }
  }

  return items.sort((a, b) => {
    const aInfo = getFipeYearInfo(a);
    const bInfo = getFipeYearInfo(b);
    if (aInfo.isZeroKm !== bInfo.isZeroKm) return aInfo.isZeroKm ? -1 : 1;
    return bInfo.rawYear - aInfo.rawYear || String(a.code).localeCompare(String(b.code));
  });
};

export function getFipeYearInfo(item: FipeItem) {
  const name = String(item.name ?? '').trim();
  const code = String(item.code ?? '').trim();
  const match = name.match(/^(\d{4,5})(?:\s+(.+))?$/);
  const rawYear = Number(match?.[1] ?? name.match(/\d{4,5}/)?.[0] ?? 0);
  const fuel = String(match?.[2] ?? '').trim();
  const isZeroKm = rawYear === 32000 || /^32000(?:-|$)/.test(code) || /\b(?:0\s*km|zero[- ]?km)\b/i.test(name);

  return {
    rawYear,
    fuel,
    isZeroKm,
    label: `${isZeroKm ? '0 km' : rawYear || name}${fuel ? ` - ${fuel}` : ''}`,
  };
}

function parseBRL(s: string): number {
  // "R$ 10.000,00" -> 10000
  return Number(String(s).replace('R$', '').trim().replace(/\./g, '').replace(',', '.')) || 0;
}

export async function fipePrice(brandId: string, modelId: string, yearId: string, kind: FipeKind = 'cars'): Promise<FipeResult> {
  let d: any;
  try {
    d = await get<any>(`/${kind}/brands/${brandId}/models/${modelId}/years/${yearId}`);
  } catch {
    const legacy = await getFrom<any>(
      LEGACY_BASE,
      `/${legacyKind(kind)}/marcas/${brandId}/modelos/${modelId}/anos/${yearId}`,
    );
    d = {
      price: legacy.Valor,
      brand: legacy.Marca,
      model: legacy.Modelo,
      modelYear: legacy.AnoModelo,
      fuel: legacy.Combustivel,
      codeFipe: legacy.CodigoFipe,
      referenceMonth: legacy.MesReferencia,
    };
  }
  const rawModelYear = Number(d.modelYear) || 0;
  const isZeroKm = rawModelYear === 32000 || /^32000(?:-|$)/.test(String(yearId));
  const currentYear = new Date().getFullYear();
  const fuel = String(d.fuel ?? '').trim();
  const effectiveYear = isZeroKm ? currentYear : rawModelYear;

  return {
    value: parseBRL(d.price),
    code: d.codeFipe ?? '',
    brand: d.brand ?? '',
    model: d.model ?? '',
    year: effectiveYear,
    fipeModelYear: isZeroKm ? 32000 : rawModelYear,
    fipeYearCode: yearId,
    yearLabel: `${isZeroKm ? '0 km' : rawModelYear || 'Ano nao informado'}${fuel ? ` - ${fuel}` : ''}`,
    fuel,
    isZeroKm,
    reference: d.referenceMonth ?? '',
  };
}
