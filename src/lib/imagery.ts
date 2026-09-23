/**
 * Photographs and maps of the location.
 *
 * The road classification in `road-context.ts` reads a name and counts
 * neighbours; it explicitly cannot see how wide the road is, whether a car can
 * pass, or whether there is anywhere to park. A photograph of the frontage
 * settles all three in a second, for a customer who has not yet travelled to
 * the site.
 *
 * Two rules govern what is shown, both for the same reason — an image looks
 * like proof, so it must not be allowed to claim more than it is:
 *
 *  1. The capture date always travels with the photograph. Street View imagery
 *     in Indonesia is routinely several years old, and a shopfront that closed
 *     in 2021 still stands in the picture.
 *  2. When the nearest camera position is some distance from the address, the
 *     distance is stated, because the building in the frame may not be the
 *     building being assessed.
 */

import type { Coordinates } from '../providers/location/location-provider.interface.js';

/** Beyond this, the camera may well be looking at a different building. */
const OFFSET_WARNING_METERS = 30;

/** Street View imagery older than this deserves saying so plainly. */
const STALE_IMAGERY_YEARS = 3;

export interface StreetViewShot {
  /** A data: URI, so the PDF carries no API key and needs no network. */
  dataUri: string;
  /** As Google reports it, "YYYY-MM". Null when it does not. */
  captureDate: string | null;
  /** How far the camera stood from the address. */
  offsetMeters: number | null;
}

export interface MapShot {
  dataUri: string;
  /** How many competitors are pinned on it. */
  markedCompetitors: number;
}

export interface LocationImagery {
  streetView: StreetViewShot | null;
  map: MapShot | null;
  notes: string[];
  /**
   * Why there is no imagery, when there is none.
   *
   * Stated in the report rather than leaving a blank space, so the customer
   * knows the photograph was sought and not found — not that we never looked.
   */
  unavailableReason: string | null;
}

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Turn Google's "2023-05" into "Mei 2023". */
export function formatCaptureDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const match = value.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return value;

  const year = match[1];
  const month = match[2] ? MONTHS_ID[Number(match[2]) - 1] : null;
  return month ? `${month} ${year}` : year;
}

/** How old the imagery is, in whole years, or null if the date is unreadable. */
export function imageryAgeYears(captureDate: string | null, now = new Date()): number | null {
  if (!captureDate) return null;

  const match = captureDate.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return null;

  const captured = new Date(Number(match[1]), match[2] ? Number(match[2]) - 1 : 0, 1);
  const years = (now.getTime() - captured.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years < 0 ? 0 : Math.floor(years);
}

/**
 * Compass bearing from one point to another, in degrees.
 *
 * Used to aim the camera at the premises. Without it Street View returns
 * whichever way the car happened to be pointing, which is as often the road
 * opposite as the property being paid for.
 */
export function bearing(from: Coordinates, to: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const p1 = toRad(from.latitude);
  const p2 = toRad(to.latitude);
  const dl = toRad(to.longitude - from.longitude);

  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);

  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * What the customer must be told about the images alongside them.
 *
 * Separated from the fetching so the wording is testable without a network
 * call, and so absence produces words rather than an empty box.
 */
export function describeImagery(input: {
  streetView: StreetViewShot | null;
  map: MapShot | null;
  now?: Date;
}): string[] {
  const notes: string[] = [];
  const { streetView, map } = input;

  if (streetView) {
    const formatted = formatCaptureDate(streetView.captureDate);
    const age = imageryAgeYears(streetView.captureDate, input.now);

    if (formatted) {
      notes.push(
        `Foto ini diambil Google Street View pada ${formatted}. Kondisi lokasi saat ini ` +
          'bisa sudah berbeda — bangunan, usaha yang menempati, dan lalu lintas dapat berubah.'
      );
    } else {
      notes.push(
        'Google tidak menyebutkan kapan foto ini diambil, sehingga usianya tidak diketahui. ' +
          'Anggap foto ini sebagai gambaran kasar, bukan kondisi terkini.'
      );
    }

    if (age !== null && age >= STALE_IMAGERY_YEARS) {
      notes.push(
        `Usia foto sudah sekitar ${age} tahun. Untuk keputusan sewa, foto setua ini hanya ` +
          'berguna untuk melihat bentuk jalan, bukan untuk menilai usaha yang ada sekarang.'
      );
    }

    if (streetView.offsetMeters !== null && streetView.offsetMeters > OFFSET_WARNING_METERS) {
      notes.push(
        `Titik kamera Street View terdekat berjarak sekitar ${streetView.offsetMeters} m dari ` +
          'alamat properti. Bangunan pada foto mungkin BUKAN properti yang dinilai — gunakan ' +
          'foto ini untuk melihat jenis jalannya, bukan bangunannya.'
      );
    }
  } else {
    // Absence is itself informative, but only weakly, and the report should say
    // exactly how weakly rather than let the customer draw the strong version.
    notes.push(
      'Google Street View tidak memiliki foto untuk titik ini. Mobil Street View umumnya ' +
        'hanya melewati jalan yang dapat dilalui mobil, sehingga tidak adanya foto BISA ' +
        'berarti jalannya sempit — tetapi bisa juga berarti area ini memang belum dipetakan. ' +
        'Ini bukan bukti, hanya petunjuk lemah.'
    );
  }

  if (map && map.markedCompetitors > 0) {
    notes.push(
      `Peta menandai lokasi properti dan ${map.markedCompetitors} pesaing terdekat yang ` +
        'kami temukan. Pesaing yang tidak terdaftar di Google Maps tidak muncul di peta ini.'
    );
  }

  if (streetView || map) {
    notes.push('Foto dan peta ini bahan bantu, bukan pengganti kunjungan ke lokasi.');
  }

  return notes;
}

/**
 * Cache key for a location's imagery.
 *
 * Five decimal places is about a metre — close enough that two requests for the
 * same premises share an entry, far enough that neighbouring shops do not. The
 * point is billing: the same report regenerated ten times must not be charged
 * ten times (PROJECT_MASTER_SPEC.md §22).
 */
export function imageryCacheKey(location: Coordinates, kind: string): string {
  return `${kind}:${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}
