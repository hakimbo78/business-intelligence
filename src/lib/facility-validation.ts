/**
 * Checking that a facility is what the map says it is.
 *
 * The nearest-facility table has been the weakest part of the report since it
 * was written, and the cause is not the provider we chose. Every POI source
 * tested carries the same fault in Indonesia:
 *
 *   Google   nearest hospital  → "RUMAH MELAHIRKAN MEDICAL HACKING DEPOK"
 *            nearest station   → "Jl. Raya St Depok Lama"   (a road)
 *            nearest mall      → "Fresh market Depok"       (a wet market)
 *   Overture nearest hospital  → "Xing Pet Care and Clinic" (a vet)
 *            nearest school    → "Learn Indonesian Online"  (a web course)
 *            nearest market    → "Biskuit Bayi"             (a baby-food shop)
 *
 * Switching sources does not fix it, so the check has to live here. Indonesian
 * business names are highly regular — a real hospital is an "RS", "Rumah
 * Sakit", "Klinik" or "Puskesmas"; a real school is an "SD", "SMP", "SMA",
 * "SMK" or "Madrasah" — which makes a name a usable second opinion on a
 * category.
 *
 * Nothing here invents a facility. It only decides whether to trust one the
 * provider offered, and when the nearest candidate fails, the next plausible
 * one is used instead. If none passes, the report says the distance is
 * unverified rather than printing a confident wrong answer.
 */

import type { FacilityKey } from './location-context.js';

interface NameRules {
  /** Names that confirm the category. */
  expect: RegExp;
  /** Names that contradict it, checked first. */
  reject?: RegExp;
}

/**
 * What a real one is called, and what is commonly mistagged as one.
 *
 * `reject` runs first: "Klinik Hewan" contains "klinik", so the veterinary
 * rule has to win.
 */
const RULES: Record<FacilityKey, NameRules> = {
  school: {
    reject: /\b(online|kursus|bimbel|bimbingan\s*belajar|les\b|daycare|penitipan|driving|setir|musik|bahasa|language)\b/i,
    expect: /\b(sd\b|sdn\b|sdit\b|smp\b|smpn\b|sma\b|sman\b|smk\b|smkn\b|mi\b|min\b|mts\b|man\b|sekolah|madrasah|school|tk\b|paud\b)/i,
  },
  transit: {
    // A road named after a station is not a station.
    reject: /^(jl\.?|jalan)\b/i,
    expect: /\b(stasiun|station|terminal|halte|shelter|lrt|mrt|krl|bus)\b/i,
  },
  market: {
    reject: /\b(cell|cellular|konter|pulsa|bayi|biskuit|counter|service)\b/i,
    expect: /\b(pasar|swalayan|supermarket|minimarket|indomaret|alfamart|alfamidi|superindo|hypermart|giant|tip\s*top|hero|lotte|grosir|toko)\b/i,
  },
  mall: {
    reject: /\b(cell|cellular|konter|pulsa|counter|butik|toko)\b/i,
    expect: /\b(mall|mal\b|plaza|square|itc|trade\s*cent|shopping|pusat\s*perbelanjaan|city\s*walk|town\s*square|depok\s*town)\b/i,
  },
  office: {
    reject: /\b(kos|kost|warung|toko)\b/i,
    expect: /\b(pt\b|cv\b|kantor|gedung|graha|wisma|tower|plaza|office|menara|balai)\b/i,
  },
  hospital: {
    // A vet, a dentist and a pharmacy are not the hospital a customer means.
    reject: /\b(hewan|pet\b|vet\b|veterinary|gigi|dental|optik|apotek|apotik|kecantikan|salon|bidan|melahirkan)\b/i,
    expect: /\b(rumah\s*sakit|\brs\b|rsud|rsia|rsu\b|hospital|klinik|clinic|puskesmas|medical\s*cent)\b/i,
  },
  worship: {
    expect: /\b(masjid|mesjid|mushola|musholla|musala|surau|mosque)\b/i,
  },
  university: {
    reject: /\b(yayasan|bimbel|kursus|sekolah\s*dasar|tk\b|paud\b)\b/i,
    expect: /\b(universitas|university|institut|institute|politeknik|polytechnic|sekolah\s*tinggi|stie\b|stmik\b|stikes\b|akademi|kampus|campus|\buin\b|\bupn\b)\b/i,
  },
};

export type FacilityConfidence = 'CONFIRMED' | 'UNVERIFIED' | 'REJECTED';

export interface FacilityCheck {
  confidence: FacilityConfidence;
  /** Why, for the log and for the report's own footnote. */
  reason: string;
}

/**
 * Does this name look like the facility the provider says it is?
 *
 * CONFIRMED means the name carries a word a real one carries. REJECTED means it
 * carries a word that rules it out. UNVERIFIED is everything else — a name we
 * cannot read either way, which is common and is not itself a fault.
 */
export function checkFacilityName(key: FacilityKey, name: string | null): FacilityCheck {
  if (!name || name.trim().length === 0) {
    return { confidence: 'UNVERIFIED', reason: 'Tempat ini tidak memiliki nama di sumber peta.' };
  }

  const rules = RULES[key];
  if (!rules) return { confidence: 'UNVERIFIED', reason: 'Tidak ada aturan pemeriksaan nama.' };

  if (rules.reject?.test(name)) {
    return {
      confidence: 'REJECTED',
      reason: `Namanya menunjukkan ini bukan ${FACILITY_NOUN[key]}.`,
    };
  }

  if (rules.expect.test(name)) {
    return { confidence: 'CONFIRMED', reason: 'Nama sesuai dengan jenis fasilitasnya.' };
  }

  return {
    confidence: 'UNVERIFIED',
    reason: `Namanya tidak memastikan ini benar-benar ${FACILITY_NOUN[key]}.`,
  };
}

const FACILITY_NOUN: Record<FacilityKey, string> = {
  school: 'sekolah',
  transit: 'stasiun atau terminal',
  market: 'pasar atau supermarket',
  mall: 'pusat perbelanjaan',
  office: 'perkantoran',
  hospital: 'rumah sakit atau klinik',
  worship: 'masjid',
  university: 'kampus',
};

export interface FacilityCandidate {
  name: string;
  distanceMeters: number;
}

export interface ChosenFacility {
  name: string | null;
  distanceMeters: number | null;
  confidence: FacilityConfidence;
  /** Candidates the name check ruled out, so the report can say how many. */
  rejected: number;
}

/**
 * Pick the nearest candidate that is plausibly the facility asked for.
 *
 * Prefers a confirmed match over an unverifiable one even when the unverifiable
 * one is closer: a confirmed hospital 600 m away is more useful than a maybe
 * 300 m away, and the report has to be able to stand behind the number.
 */
export function chooseFacility(
  key: FacilityKey,
  candidates: FacilityCandidate[]
): ChosenFacility {
  const byDistance = [...candidates].sort((a, b) => a.distanceMeters - b.distanceMeters);

  const checked = byDistance.map((c) => ({ ...c, check: checkFacilityName(key, c.name) }));
  const rejected = checked.filter((c) => c.check.confidence === 'REJECTED').length;

  const confirmed = checked.find((c) => c.check.confidence === 'CONFIRMED');
  if (confirmed) {
    return {
      name: confirmed.name,
      distanceMeters: confirmed.distanceMeters,
      confidence: 'CONFIRMED',
      rejected,
    };
  }

  const unverified = checked.find((c) => c.check.confidence === 'UNVERIFIED');
  if (unverified) {
    return {
      name: unverified.name,
      distanceMeters: unverified.distanceMeters,
      confidence: 'UNVERIFIED',
      rejected,
    };
  }

  // Everything the provider offered was ruled out by its own name.
  return { name: null, distanceMeters: null, confidence: 'REJECTED', rejected };
}

/** The footnote the report prints when a row is not confirmed. */
export const FACILITY_CONFIDENCE_NOTE: Record<FacilityConfidence, string | null> = {
  CONFIRMED: null,
  UNVERIFIED:
    'Nama tempat ini tidak memastikan jenisnya, jadi jaraknya belum tentu benar. Periksa sendiri.',
  REJECTED:
    'Tidak ditemukan tempat yang meyakinkan untuk kategori ini. Peta menawarkan beberapa tempat, ' +
    'tetapi namanya menunjukkan jenis usaha lain.',
};
