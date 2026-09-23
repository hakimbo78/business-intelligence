/**
 * What kind of road the premises sits on.
 *
 * A business owner's first question about a location is usually whether it
 * faces a road people actually pass along, or sits down a gang where only
 * neighbours go. That difference decides a shopfront business.
 *
 * Google does not sell road classification on the APIs available here, so this
 * combines two signals that are available:
 *
 *  1. Indonesian road naming, which genuinely encodes class — "Gang" is an
 *     alley, "Raya" is usually a through road.
 *  2. How many of the businesses already found nearby share the same road.
 *     A commercial strip is lined with businesses; a residential lane is not.
 *
 * Neither sees road width, surface, or whether a car can pass, so the result is
 * an indication that the field checklist asks the customer to confirm.
 */

export type RoadClass = 'MAIN_ROAD' | 'STREET' | 'ALLEY' | 'UNKNOWN';

/**
 * How badly an imprecise geocode damages the report.
 *
 * Every distance in the report — to the nearest school, to each competitor — is
 * measured from one point. When the client gives a road name without a number,
 * the geocoder returns the MIDPOINT OF THE ROAD, which on a four-kilometre
 * Depok street can be two kilometres from the premises. The report then reads
 * as precise measurement of somewhere the client has never been.
 *
 * So this is not a footnote. It is stated at the top of the report and it caps
 * what the rest of the report is allowed to claim.
 */
export type PrecisionLevel = 'EXACT' | 'APPROXIMATE' | 'ROAD_ONLY' | 'UNKNOWN';

export interface GeocodePrecision {
  level: PrecisionLevel;
  /** The provider's own word, kept for the audit trail. */
  raw: string | null;
  /** What it means for the numbers in this report. */
  message: string | null;
}

export function describeGeocodePrecision(raw: string | null | undefined): GeocodePrecision {
  if (!raw) {
    return {
      level: 'UNKNOWN',
      raw: null,
      message: null,
    };
  }

  const value = raw.toUpperCase();

  if (value === 'ROOFTOP' || value === 'PREMISE' || value === 'SUB_PREMISE') {
    return { level: 'EXACT', raw, message: null };
  }

  if (value === 'GEOMETRIC_CENTER' || value === 'ROUTE' || value === 'APPROXIMATE') {
    return {
      level: 'ROAD_ONLY',
      raw,
      message:
        'PERINGATAN AKURASI: alamat yang Anda berikan hanya sampai tingkat nama jalan, bukan ' +
        'nomor bangunan. Titik yang kami analisis adalah TITIK TENGAH JALAN tersebut — pada ' +
        'jalan sepanjang beberapa kilometer, titik itu bisa berjarak lebih dari satu kilometer ' +
        'dari properti Anda. Semua jarak di laporan ini (ke sekolah, ke pesaing, ke fasilitas) ' +
        'diukur dari titik tengah itu, sehingga BISA SANGAT MELESET. Kirim ulang alamat lengkap ' +
        'dengan nomor, atau titik koordinat dari Google Maps, untuk mendapat hasil yang akurat.',
    };
  }

  return {
    level: 'APPROXIMATE',
    raw,
    message:
      `Titik properti hanya dapat ditemukan pada tingkat presisi "${raw}", bukan bangunan ` +
      'persis. Jarak-jarak di laporan ini bisa meleset beberapa puluh meter.',
  };
}

export const ROAD_CLASS_LABEL: Record<RoadClass, string> = {
  MAIN_ROAD: 'Kemungkinan jalan utama',
  STREET: 'Jalan lingkungan',
  ALLEY: 'Gang / jalan kecil',
  UNKNOWN: 'Tidak dapat ditentukan',
};

export interface RoadContext {
  roadName: string | null;
  indicatedClass: RoadClass;
  /** Why that class was indicated, in the customer's language. */
  classBasis: string;
  /** Businesses found nearby that front the same road. */
  businessesOnSameRoad: number;
  businessesConsidered: number;
  /** ROOFTOP means Google located the exact building, not just the street. */
  addressPrecision: string | null;
  notes: string[];
}

/** "Gg." and "Gang" are unambiguous; "Raya" and "Bypass" usually mean a through road. */
const ALLEY_PATTERN = /\b(gang|gg\.?)\b/i;
const MAIN_ROAD_PATTERN = /\b(raya|bypass|by-pass|by pass|lingkar|tol|arteri)\b/i;

/** Businesses on the same road before it reads as a commercial strip. */
const COMMERCIAL_STRIP_THRESHOLD = 4;

/**
 * Normalise a road name for comparison: "Jl. Delima Raya" and
 * "Jalan Delima Raya" are the same road.
 */
export function normaliseRoadName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(jl\.?|jalan|gg\.?|gang)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does this address sit on the named road? */
export function addressIsOnRoad(address: string, roadName: string): boolean {
  const road = normaliseRoadName(roadName);
  if (road.length < 4) return false; // too short to match safely
  return normaliseRoadName(address).includes(road);
}

export function describeRoad(input: {
  roadName: string | null;
  addressPrecision?: string | null;
  nearbyAddresses?: string[];
}): RoadContext {
  const roadName = input.roadName?.trim() || null;
  const addresses = input.nearbyAddresses ?? [];

  const businessesOnSameRoad = roadName
    ? addresses.filter((a) => addressIsOnRoad(a, roadName)).length
    : 0;

  let indicatedClass: RoadClass = 'UNKNOWN';
  let classBasis = 'Nama jalan tidak tersedia, sehingga jenis jalan tidak dapat diperkirakan.';

  if (roadName) {
    if (ALLEY_PATTERN.test(roadName)) {
      indicatedClass = 'ALLEY';
      classBasis = `Nama "${roadName}" menunjukkan gang atau jalan kecil.`;
    } else if (MAIN_ROAD_PATTERN.test(roadName)) {
      indicatedClass = 'MAIN_ROAD';
      classBasis = `Nama "${roadName}" mengandung penanda jalan utama.`;
    } else if (businessesOnSameRoad >= COMMERCIAL_STRIP_THRESHOLD) {
      // The name says nothing, but the businesses do.
      indicatedClass = 'MAIN_ROAD';
      classBasis =
        `${businessesOnSameRoad} dari ${addresses.length} usaha terdekat beralamat di ` +
        `${roadName}, yang menunjukkan ruas jalan komersial.`;
    } else {
      indicatedClass = 'STREET';
      classBasis =
        `Nama "${roadName}" tidak menunjukkan jalan utama maupun gang, dan hanya ` +
        `${businessesOnSameRoad} usaha terdekat berada di ruas yang sama.`;
    }
  }

  const notes: string[] = [];

  // A name-based reading can be wrong in both directions, and saying so costs
  // nothing next to a customer signing a lease on the strength of it.
  if (indicatedClass !== 'UNKNOWN') {
    notes.push(
      'Perkiraan ini berdasarkan nama jalan dan sebaran usaha di sekitarnya. Kami TIDAK ' +
        'dapat melihat lebar jalan, kondisi permukaan, arah lalu lintas, atau apakah mobil ' +
        'dapat lewat. Pastikan sendiri di lapangan.'
    );
  }

  if (roadName && businessesOnSameRoad === 0 && addresses.length > 0) {
    notes.push(
      `Tidak ada satu pun dari ${addresses.length} usaha terdekat yang beralamat di ` +
        `${roadName}. Properti ini kemungkinan berada di luar ruas komersial — periksa ` +
        'apakah calon pelanggan memang melewati jalan ini.'
    );
  }

  const precision = describeGeocodePrecision(input.addressPrecision);
  if (precision.message) {
    notes.push(precision.message);
  }

  return {
    roadName,
    indicatedClass,
    classBasis,
    businessesOnSameRoad,
    businessesConsidered: addresses.length,
    addressPrecision: input.addressPrecision ?? null,
    notes,
  };
}
