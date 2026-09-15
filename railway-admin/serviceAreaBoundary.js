// Stores the official IBGE boundary of the configured service area in
// public.service_area_boundaries. The app and the ride guard decide by the
// ride coordinates against it, so it must follow every change in the admin.
const IBGE = 'https://servicodados.ibge.gov.br/api';
const GEOJSON = 'formato=application/vnd.geo%2Bjson';

const cityKey = (value) => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
  return res.json();
}

async function officialBoundary({ scope, city, state, country }) {
  if (country !== 'BR') throw new Error(`limite oficial disponível só para o Brasil (país configurado: ${country})`);
  if (scope === 'country') {
    const collection = await getJson(`${IBGE}/v3/malhas/paises/BR?${GEOJSON}&qualidade=intermediaria`);
    return { name: 'Brasil', source: 'IBGE malha do Brasil (qualidade intermediaria)', collection };
  }
  if (scope === 'state') {
    const collection = await getJson(`${IBGE}/v3/malhas/estados/${encodeURIComponent(state)}?${GEOJSON}&qualidade=maxima`);
    return { name: state, source: `IBGE malha estadual ${state} (qualidade maxima)`, collection };
  }
  const municipios = await getJson(`${IBGE}/v1/localidades/estados/${encodeURIComponent(state)}/municipios`);
  const municipio = municipios.find((item) => cityKey(item.nome) === cityKey(city));
  if (!municipio) throw new Error(`cidade "${city}" não encontrada no IBGE para ${state}`);
  const collection = await getJson(`${IBGE}/v3/malhas/municipios/${municipio.id}?${GEOJSON}&qualidade=maxima`);
  return { name: municipio.nome, source: `IBGE malha municipal ${municipio.id} (qualidade maxima)`, collection };
}

export async function syncServiceAreaBoundary(admin, area) {
  if (!area.enabled || !['city', 'state', 'country'].includes(area.scope)) return;
  const { name, source, collection } = await officialBoundary(area);
  const geometry = collection?.features?.[0]?.geometry;
  if (!geometry) throw new Error('IBGE não retornou o limite da área');

  const { error } = await admin.rpc('set_service_area_boundary', {
    p_scope: area.scope,
    p_country: area.country,
    p_state: area.state,
    p_city: area.city,
    p_name: name,
    p_source: source,
    p_geojson: JSON.stringify(geometry),
  });
  // Database without the boundaries migration yet: it still checks by address text.
  if (error?.code === 'PGRST202') return;
  if (error) throw new Error(error.message);
}
