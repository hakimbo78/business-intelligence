/**
 * What the road in front of the premises actually is.
 *
 * `road-context.ts` guesses from the Indonesian name — "Raya" means a through
 * road, "Gang" means an alley — and from how many nearby businesses share the
 * street. It says so honestly, and it is still a guess: it cannot tell whether
 * a car fits, which way the traffic runs, or whether the surface is paved.
 *
 * OpenStreetMap carries that as data. `highway=*` is a real classification
 * maintained by people who have stood there, `oneway` says which way traffic
 * runs, and `width`, `lanes` and `surface` are stated in metres, counts and
 * materials when somebody has surveyed them.
 *
 * Coverage is the catch. In Indonesian suburbs the class and the name are
 * nearly always present while width and surface often are not, so this module
 * reports each field separately and stays silent on the ones that are missing
 * rather than inferring them.
 *
 * Data © OpenStreetMap contributors, ODbL. The report carries that attribution.
 */

/** OSM highway classes, ordered from largest to smallest. */
const ROAD_RANK: Record<string, number> = {
  motorway: 10, trunk: 9, primary: 8, secondary: 7, tertiary: 6,
  unclassified: 5, residential: 4, living_street: 3, service: 2, track: 1,
};

/** Classes a car cannot use at all. */
const NON_VEHICLE = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway', 'bridleway']);

export type OsmRoadClass =
  | 'MAJOR_ROAD'      // motorway/trunk/primary/secondary
  | 'CONNECTOR'       // tertiary/unclassified
  | 'LOCAL_STREET'    // residential/living_street
  | 'ACCESS_LANE'     // service/track — a car fits, barely
  | 'PEDESTRIAN_ONLY' // no car at all
  | 'UNKNOWN';

export const OSM_ROAD_CLASS_LABEL: Record<OsmRoadClass, string> = {
  MAJOR_ROAD: 'Jalan utama',
  CONNECTOR: 'Jalan penghubung',
  LOCAL_STREET: 'Jalan lingkungan',
  ACCESS_LANE: 'Jalan akses / gang',
  PEDESTRIAN_ONLY: 'Hanya untuk pejalan kaki',
  UNKNOWN: 'Tidak dapat ditentukan',
};

export interface OsmWay {
  name?: string;
  highway?: string;
  oneway?: string;
  lanes?: string;
  width?: string;
  surface?: string;
  maxspeed?: string;
  /** Metres from the premises to the nearest point of this way. */
  distanceMeters: number;
}

export interface OsmRoadContext {
  /** The road the premises fronts. */
  name: string | null;
  roadClass: OsmRoadClass;
  /** Whether a car can use it at all, when OSM says. */
  carAccessible: boolean | null;
  oneWay: boolean | null;
  lanes: number | null;
  widthMeters: number | null;
  surface: string | null;
  /** The biggest road nearby, when it is not the one out front. */
  nearestMajorRoad: { name: string | null; distanceMeters: number; roadClass: OsmRoadClass } | null;
  notes: string[];
  /** What OSM did not say, so the report does not imply it did. */
  notRecorded: string[];
}

export function classifyHighway(highway: string | undefined): OsmRoadClass {
  if (!highway) return 'UNKNOWN';
  if (NON_VEHICLE.has(highway)) return 'PEDESTRIAN_ONLY';

  const rank = ROAD_RANK[highway];
  if (rank === undefined) return 'UNKNOWN';
  if (rank >= 7) return 'MAJOR_ROAD';
  if (rank >= 5) return 'CONNECTOR';
  if (rank >= 3) return 'LOCAL_STREET';
  return 'ACCESS_LANE';
}

/** Indonesian for the surface values that actually appear. */
const SURFACE_LABEL: Record<string, string> = {
  asphalt: 'aspal',
  concrete: 'beton',
  paving_stones: 'paving blok',
  paved: 'diperkeras',
  unpaved: 'belum diperkeras',
  ground: 'tanah',
  dirt: 'tanah',
  gravel: 'kerikil',
  sand: 'pasir',
};

/** OSM writes width as "4", "4 m", or occasionally "4.5m". */
function parseWidth(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

/**
 * Pick the road the premises fronts, and describe it.
 *
 * The road out front is the nearest one a vehicle could plausibly use; a
 * footpath three metres away is not the address. The biggest road nearby is
 * reported separately, because sitting on a quiet street thirty metres from a
 * main road is a different business from sitting a kilometre down it.
 */
export function describeOsmRoad(input: {
  ways: OsmWay[];
  /** The road name from the geocoder, preferred when it matches. */
  preferredName?: string | null;
}): OsmRoadContext {
  const ways = [...input.ways].sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (ways.length === 0) {
    return {
      name: null,
      roadClass: 'UNKNOWN',
      carAccessible: null,
      oneWay: null,
      lanes: null,
      widthMeters: null,
      surface: null,
      nearestMajorRoad: null,
      notes: [
        'OpenStreetMap tidak memiliki data ruas jalan di sekitar titik properti ini, sehingga ' +
          'jenis jalan tidak dapat dipastikan dari sumber tersebut.',
      ],
      notRecorded: [],
    };
  }

  // Prefer the road the geocoder named, when OSM knows it too.
  const preferred = input.preferredName?.toLowerCase().replace(/\b(jl\.?|jalan)\b/g, '').trim();
  const named = preferred && preferred.length >= 4
    ? ways.find((w) => w.name?.toLowerCase().includes(preferred))
    : undefined;

  const front = named ?? ways[0];
  const roadClass = classifyHighway(front.highway);

  const major = ways
    .filter((w) => classifyHighway(w.highway) === 'MAJOR_ROAD' && w !== front)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  const widthMeters = parseWidth(front.width);
  const lanes = front.lanes ? Number.parseInt(front.lanes, 10) : null;
  const oneWay = front.oneway === undefined ? null : front.oneway === 'yes';

  const notes: string[] = [];
  const notRecorded: string[] = [];

  if (roadClass === 'PEDESTRIAN_ONLY') {
    notes.push(
      'Menurut OpenStreetMap, ruas di depan properti ini BUKAN jalan kendaraan — hanya untuk ' +
        'pejalan kaki. Pelanggan tidak dapat berhenti dengan mobil atau motor di depan.'
    );
  } else if (roadClass === 'ACCESS_LANE') {
    notes.push(
      'Ruas di depan properti tercatat sebagai jalan akses atau gang. Umumnya sempit dan hanya ' +
        'melayani bangunan di sekitarnya, bukan jalan yang dilalui orang menuju tempat lain.'
    );
  }

  if (oneWay === true) {
    notes.push(
      'Jalan ini SATU ARAH. Kendaraan hanya melintas dari satu sisi, sehingga separuh calon ' +
        'pelanggan harus memutar untuk sampai ke sini. Periksa arahnya di lapangan.'
    );
  }

  if (widthMeters !== null && widthMeters < 4) {
    notes.push(
      `Lebar jalan tercatat ${widthMeters} m. Pada lebar ini dua mobil tidak dapat berpapasan, ` +
        'dan parkir di depan akan menghalangi lalu lintas.'
    );
  }

  if (front.surface && ['unpaved', 'ground', 'dirt', 'sand', 'gravel'].includes(front.surface)) {
    notes.push(
      `Permukaan jalan tercatat ${SURFACE_LABEL[front.surface] ?? front.surface}. Jalan yang ` +
        'belum diperkeras cenderung berlumpur saat hujan dan mengurangi orang yang lewat.'
    );
  }

  if (major && major.distanceMeters <= 200) {
    notes.push(
      `Jalan utama terdekat, ${major.name ?? 'tanpa nama'}, hanya ${Math.round(major.distanceMeters)} m ` +
        'dari properti. Posisi dekat jalan utama tanpa berada persis di atasnya bisa berarti ' +
        'sewa lebih murah dengan akses yang masih baik — periksa apakah properti ini terlihat dari sana.'
    );
  }

  // Say what was not recorded, rather than let silence read as a measurement.
  if (widthMeters === null) notRecorded.push('lebar jalan dalam meter');
  if (lanes === null || Number.isNaN(lanes)) notRecorded.push('jumlah lajur');
  if (!front.surface) notRecorded.push('jenis permukaan jalan');
  if (oneWay === null) notRecorded.push('arah lalu lintas (satu arah atau dua arah)');

  if (notRecorded.length > 0) {
    notes.push(
      `Belum ada yang mencatat ${notRecorded.join(', ')} untuk ruas ini di OpenStreetMap. ` +
        'Periksa sendiri di lapangan.'
    );
  }

  return {
    name: front.name ?? null,
    roadClass,
    carAccessible: roadClass === 'UNKNOWN' ? null : roadClass !== 'PEDESTRIAN_ONLY',
    oneWay,
    lanes: lanes !== null && !Number.isNaN(lanes) ? lanes : null,
    widthMeters,
    surface: front.surface ? (SURFACE_LABEL[front.surface] ?? front.surface) : null,
    nearestMajorRoad: major
      ? {
          name: major.name ?? null,
          distanceMeters: Math.round(major.distanceMeters),
          roadClass: 'MAJOR_ROAD',
        }
      : null,
    notes,
    notRecorded,
  };
}
