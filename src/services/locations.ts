export interface CityOption {
  id: number;
  name: string;
  state: string;
  stateName: string;
}

const IBGE_CITIES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
let citiesPromise: Promise<CityOption[]> | null = null;

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function fetchCities(): Promise<CityOption[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(IBGE_CITIES_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`IBGE HTTP ${response.status}`);
    const payload = await response.json() as Array<{
      id: number;
      nome: string;
      microrregiao?: { mesorregiao?: { UF?: { sigla?: string; nome?: string } } };
      'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { sigla?: string; nome?: string } } };
    }>;

    return payload
      .map((city) => {
        const uf = city.microrregiao?.mesorregiao?.UF
          ?? city['regiao-imediata']?.['regiao-intermediaria']?.UF;
        return {
          id: Number(city.id),
          name: String(city.nome || '').trim(),
          state: String(uf?.sigla || '').trim().toUpperCase(),
          stateName: String(uf?.nome || '').trim(),
        };
      })
      .filter((city) => city.name && city.state)
      .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name), 'pt-BR'));
  } finally {
    clearTimeout(timeout);
  }
}

export function loadBrazilCities(): Promise<CityOption[]> {
  if (!citiesPromise) {
    citiesPromise = fetchCities().catch((error) => {
      citiesPromise = null;
      throw error;
    });
  }
  return citiesPromise;
}

export function searchBrazilCities(cities: CityOption[], query: string, limit = 8): CityOption[] {
  const term = normalize(query);
  if (term.length < 2) return [];

  return cities
    .map((city) => {
      const name = normalize(city.name);
      const full = `${name} ${normalize(city.state)}`;
      const score = name === term ? 0 : name.startsWith(term) ? 1 : full.startsWith(term) ? 2 : name.includes(term) ? 3 : 4;
      return { city, score };
    })
    .filter(({ score }) => score < 4)
    .sort((a, b) => a.score - b.score || a.city.name.localeCompare(b.city.name, 'pt-BR'))
    .slice(0, limit)
    .map(({ city }) => city);
}
