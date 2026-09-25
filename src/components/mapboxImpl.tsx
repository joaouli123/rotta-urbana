// Native map: @rnmapbox/maps. The web build gets mapboxImpl.web.tsx instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require('@rnmapbox/maps');
const Mapbox: any = mod?.default ?? mod;
export default Mapbox;
