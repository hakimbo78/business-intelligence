/**
 * What is actually around a location.
 *
 * This replaces the invented demographics the report used to carry. The
 * difference matters: "dominant age group 25-34" was never looked up for the
 * area in question, while "nearest school 992 m" is a fact the customer can
 * verify by walking there.
 *
 * Deliberately built from DISTANCES, not counts. Google's nearby search caps
 * results at 20, and in an Indonesian urban area that cap is reached even
 * within 200 m — so "20 restaurants nearby" means "at least 20, we stopped
 * counting", which is not a density measure and must not be presented as one.
 */

/** Facility types that generate passing trade, with the words a client uses. */
export const CATCHMENT_FACILITIES = [
  { key: 'school', types: ['school'], label: 'Sekolah' },
  { key: 'transit', types: ['transit_station', 'bus_station', 'train_station'], label: 'Stasiun / terminal' },
  { key: 'market', types: ['supermarket', 'grocery_store'], label: 'Pasar / supermarket' },
  { key: 'mall', types: ['shopping_mall'], label: 'Pusat perbelanjaan' },
  { key: 'office', types: ['corporate_office'], label: 'Perkantoran' },
  { key: 'hospital', types: ['hospital'], label: 'Rumah sakit / klinik' },
  { key: 'worship', types: ['mosque'], label: 'Masjid' },
  { key: 'university', types: ['university'], label: 'Kampus' },
] as const;

export type FacilityKey = (typeof CATCHMENT_FACILITIES)[number]['key'];

export interface NearestFacility {
  key: FacilityKey;
  label: string;
  /** Null when nothing of this type was found within the search radius. */
  distanceMeters: number | null;
  name: string | null;
}

export interface LocationContext {
  /** How far to the nearest of each facility type. */
  facilities: NearestFacility[];
  /** The radius searched, so "not found" has a bound. */
  searchRadiusMeters: number;
  /**
   * What this analysis does NOT measure.
   *
   * Stated in the report itself. A customer comparing us with a telco's
   * mobile-positioning product deserves to know where our evidence stops,
   * rather than discovering it later.
   */
  notMeasured: string[];
}

export const NOT_MEASURED: string[] = [
  'Jumlah penduduk, komposisi usia, dan tingkat pendapatan di sekitar lokasi — kami tidak memiliki sumber data demografi yang sah untuk dipakai komersial.',
  'Jumlah orang atau kendaraan yang benar-benar melintas di depan properti. Ini hanya dapat diketahui dengan penghitungan langsung di lapangan.',
  'Kepadatan usaha sejenis secara menyeluruh. Sumber peta membatasi hasil pencarian, sehingga jumlah pesaing yang kami tampilkan adalah yang terdekat, bukan seluruhnya.',
];

/** Distance in metres between two coordinates. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Describe the catchment in words, for the analysis prompt.
 *
 * Only what was found. A facility that is absent within the radius is stated as
 * absent rather than left out, because "no transit within 3 km" is itself a
 * finding for a business that depends on passing trade.
 */
export function describeCatchment(context: LocationContext): string {
  return context.facilities
    .map((f) =>
      f.distanceMeters === null
        ? `${f.label}: tidak ada dalam radius ${context.searchRadiusMeters} m`
        : `${f.label}: ${f.distanceMeters} m${f.name ? ` (${f.name})` : ''}`
    )
    .join('\n');
}
