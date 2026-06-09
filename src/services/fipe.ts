// Tabela FIPE lookup via Parallelum v2 (free: ~500 req/day, no auth).
// Used at vehicle registration to capture the car's market value + FIPE code,
// which feed the per-category eligibility rules (comfort/premium thresholds).
// Docs: https://fipe.parallelum.com.br/api/v2
const BASE = 'https://fipe.parallelum.com.br/api/v2';

export interface FipeItem { code: string; name: string }
export interface FipeResult {
  value: number;      // BRL parsed from "R$ 10.000,00"
  code: string;       // codeFipe
  brand: string;
  model: string;
  year: number;
  reference: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`FIPE ${res.status}`);
  return res.json() as Promise<T>;
}

export const fipeBrands = () => get<FipeItem[]>('/cars/brands');
export const fipeModels = (brandId: string) => get<FipeItem[]>(`/cars/brands/${brandId}/models`);
export const fipeYears = (brandId: string, modelId: string) =>
  get<FipeItem[]>(`/cars/brands/${brandId}/models/${modelId}/years`);

function parseBRL(s: string): number {
  // "R$ 10.000,00" -> 10000
  return Number(String(s).replace('R$', '').trim().replace(/\./g, '').replace(',', '.')) || 0;
}

export async function fipePrice(brandId: string, modelId: string, yearId: string): Promise<FipeResult> {
  const d = await get<any>(`/cars/brands/${brandId}/models/${modelId}/years/${yearId}`);
  return {
    value: parseBRL(d.price),
    code: d.codeFipe ?? '',
    brand: d.brand ?? '',
    model: d.model ?? '',
    year: Number(d.modelYear) || 0,
    reference: d.referenceMonth ?? '',
  };
}
