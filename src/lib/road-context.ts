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

  if (input.addressPrecision && input.addressPrecision !== 'ROOFTOP') {
    notes.push(
      `Titik koordinat properti hanya presisi tingkat "${input.addressPrecision}", bukan ` +
        'bangunan persis. Jarak-jarak di laporan ini bisa meleset beberapa puluh meter.'
    );
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
