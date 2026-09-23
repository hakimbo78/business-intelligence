/**
 * What kind of trade this is, and what that changes.
 *
 * Until now every business was analysed identically: the same 3 km facility
 * radius, the same eight facilities, the same ten scoring dimensions weighted
 * equally, and a competitor radius an LLM invented afresh each time — two
 * laundries in the same city were given 1,500 m and 2,000 m for no reason.
 *
 * That is wrong in a way that matters. Someone carries laundry to the nearest
 * place within walking or motorbike distance; someone chooses a destination
 * restaurant from across the city. Measuring both at the same radius
 * guarantees one of them is measured wrong, and the catchment population that
 * every derived number rests on is a function of radius squared.
 *
 * IMPORTANT — where these numbers come from. The radii, occupancy bands and
 * visit rates below are general retail trade-area rules of thumb. They are NOT
 * measurements of Indonesian trade. So each profile carries the sentence that
 * says so, the report prints it, and the client can replace any of it with
 * figures from their own business. Presenting them as measurement would repeat
 * the invented-demographics failure this codebase already removed once.
 */

import type { FacilityKey } from './location-context.js';

/** Scoring dimensions, as the calculator names them. */
export type ScoreDimension =
  | 'market_fit'
  | 'customer_fit'
  | 'demand'
  | 'competition'
  | 'gap'
  | 'accessibility'
  | 'financial_fit'
  | 'growth'
  | 'risk'
  | 'confidence';

export interface TradeProfile {
  key: string;
  /** What the client calls it. */
  label: string;
  /**
   * How far customers realistically travel to this kind of business.
   *
   * Drives the catchment population and the competitor census, so it is the
   * single most consequential number in this table.
   */
  catchmentRadiusMeters: number;
  /**
   * Facilities that generate demand for THIS trade.
   *
   * A laundry lives off residents and students; showing its owner the distance
   * to a shopping mall is noise. A cafe is the other way round.
   */
  demandDrivers: FacilityKey[];
  /** Healthy rent as a share of revenue, as a band. */
  healthyOccupancy: { min: number; max: number };
  /**
   * Potential transactions per resident per month.
   *
   * Turns a head-count into a market size. Deliberately conservative: it is
   * better for the report to overstate how hard the market is than to
   * understate it.
   */
  visitsPerResidentPerMonth: number;
  /** What one transaction is called, for the report's own wording. */
  transactionNoun: string;
  /** Dimension weights. 1 is neutral; the calculator normalises. */
  weights: Partial<Record<ScoreDimension, number>>;
  /** Stated in the report, so the client can argue with the assumptions. */
  basis: string;
}

/** Said of every profile, because none of it was measured here. */
const RULE_OF_THUMB =
  'Angka radius jangkauan, patokan sewa sehat, dan frekuensi pemakaian di bawah ini adalah ' +
  'kaidah umum ritel, BUKAN hasil pengukuran kami di lokasi Anda. Silakan ganti dengan angka ' +
  'dari usaha Anda sendiri jika Anda punya data yang lebih baik — seluruh perhitungan di ' +
  'laporan ini akan mengikuti.';

/**
 * The trade a business falls into.
 *
 * Ordered: the first match wins, so narrower trades come before broader ones.
 */
const PROFILES: Array<TradeProfile & { match: RegExp }> = [
  {
    key: 'laundry',
    label: 'Laundry',
    match: /laundry|londri|cuci\s*(pakaian|baju|kiloan)|dry\s*clean/i,
    // People take washing to the nearest place they can reach on a motorbike.
    catchmentRadiusMeters: 800,
    demandDrivers: ['university', 'school', 'office'],
    healthyOccupancy: { min: 0.1, max: 0.15 },
    visitsPerResidentPerMonth: 0.3,
    transactionNoun: 'transaksi cucian',
    weights: { competition: 2, demand: 2, financial_fit: 2, accessibility: 0.5 },
    basis:
      'Laundry kiloan dilayani dari jarak dekat: pelanggan membawa cucian ke tempat terdekat ' +
      'yang bisa dijangkau jalan kaki atau motor. Kepadatan penduduk dan jumlah anak kos ' +
      'jauh lebih menentukan daripada akses mobil.',
  },
  {
    key: 'minimarket',
    label: 'Minimarket / toko kelontong',
    match: /minimarket|kelontong|sembako|toko\s*serba|convenience/i,
    catchmentRadiusMeters: 500,
    demandDrivers: ['school', 'office'],
    healthyOccupancy: { min: 0.08, max: 0.12 },
    visitsPerResidentPerMonth: 6,
    transactionNoun: 'transaksi belanja',
    weights: { competition: 2, demand: 2, financial_fit: 2, accessibility: 0.5 },
    basis:
      'Toko kebutuhan sehari-hari dilayani dari radius sangat dekat dan dikunjungi berkali-kali ' +
      'sebulan. Yang menentukan adalah jumlah rumah tangga di sekitar, bukan daya tarik lokasi.',
  },
  {
    key: 'barbershop',
    label: 'Pangkas rambut / barbershop',
    match: /pangkas|barber|cukur/i,
    catchmentRadiusMeters: 1000,
    demandDrivers: ['school', 'university', 'office'],
    healthyOccupancy: { min: 0.1, max: 0.15 },
    visitsPerResidentPerMonth: 0.35,
    transactionNoun: 'potong rambut',
    weights: { competition: 1.5, demand: 1.5, financial_fit: 2, accessibility: 0.5 },
    basis:
      'Potong rambut dilakukan sekitar sebulan sekali dan orang memilih tempat dekat rumah ' +
      'atau dekat kantor. Kepadatan penduduk lebih menentukan daripada akses kendaraan.',
  },
  {
    key: 'salon',
    label: 'Salon / perawatan kecantikan',
    match: /salon|kecantikan|beauty|nail|kuku|spa/i,
    catchmentRadiusMeters: 2000,
    demandDrivers: ['office', 'mall', 'university'],
    healthyOccupancy: { min: 0.12, max: 0.18 },
    visitsPerResidentPerMonth: 0.15,
    transactionNoun: 'kunjungan perawatan',
    weights: { competition: 1.5, financial_fit: 2, accessibility: 1 },
    basis:
      'Pelanggan salon bersedia menempuh jarak lebih jauh untuk tempat yang cocok, sehingga ' +
      'jangkauannya lebih luas daripada jasa sehari-hari.',
  },
  {
    key: 'cafe',
    label: 'Kafe / kedai kopi',
    match: /kopi|coffee|kafe|cafe|boba|milk\s*tea|jus|juice/i,
    catchmentRadiusMeters: 1500,
    demandDrivers: ['office', 'university', 'mall', 'school'],
    healthyOccupancy: { min: 0.15, max: 0.2 },
    visitsPerResidentPerMonth: 1.5,
    transactionNoun: 'transaksi',
    weights: { competition: 1.5, demand: 2, financial_fit: 2, accessibility: 1 },
    basis:
      'Kedai kopi hidup dari orang yang sedang beraktivitas di sekitarnya — pekerja kantor dan ' +
      'mahasiswa — bukan hanya dari penduduk yang tinggal di situ.',
  },
  {
    key: 'restaurant',
    label: 'Restoran / rumah makan',
    match: /warung|rumah\s*makan|resto|restoran|restaurant|katering|catering|makanan|kuliner|bakery|roti|kue/i,
    catchmentRadiusMeters: 2000,
    demandDrivers: ['office', 'school', 'transit', 'mall'],
    healthyOccupancy: { min: 0.08, max: 0.12 },
    visitsPerResidentPerMonth: 2,
    transactionNoun: 'transaksi',
    weights: { competition: 1.5, demand: 1.5, financial_fit: 2, accessibility: 1.5 },
    basis:
      'Tempat makan menarik pelanggan dari jarak yang lebih jauh, dan akses serta parkir ikut ' +
      'menentukan — berbeda dengan jasa yang dilayani dari lingkungan sekitar saja.',
  },
  {
    key: 'pharmacy',
    label: 'Apotek',
    match: /apotek|apotik|pharmacy|obat/i,
    catchmentRadiusMeters: 1500,
    demandDrivers: ['hospital', 'school', 'office'],
    healthyOccupancy: { min: 0.08, max: 0.12 },
    visitsPerResidentPerMonth: 0.5,
    transactionNoun: 'transaksi',
    weights: { competition: 1.5, demand: 1.5, financial_fit: 2 },
    basis:
      'Apotek sangat dipengaruhi kedekatan dengan klinik dan rumah sakit, karena sebagian besar ' +
      'pembelian mengikuti kunjungan berobat.',
  },
  {
    key: 'workshop',
    label: 'Bengkel / cuci kendaraan',
    match: /bengkel|servis\s*(mobil|motor)|cuci\s*(mobil|motor)|car\s*wash|car\s*repair|steam/i,
    catchmentRadiusMeters: 2500,
    demandDrivers: ['office', 'transit'],
    healthyOccupancy: { min: 0.08, max: 0.12 },
    visitsPerResidentPerMonth: 0.2,
    transactionNoun: 'kendaraan dilayani',
    weights: { competition: 1.5, financial_fit: 2, accessibility: 2 },
    basis:
      'Pelanggan datang berkendara, sehingga jangkauannya luas dan letak terhadap jalan yang ' +
      'dilalui kendaraan sangat menentukan.',
  },
  {
    key: 'gym',
    label: 'Gym / pusat kebugaran',
    match: /gym|fitness|kebugaran|sasana/i,
    catchmentRadiusMeters: 2500,
    demandDrivers: ['office', 'university', 'mall'],
    healthyOccupancy: { min: 0.15, max: 0.25 },
    visitsPerResidentPerMonth: 0.05,
    transactionNoun: 'anggota baru',
    weights: { competition: 1.5, demand: 1.5, financial_fit: 2, accessibility: 1.5 },
    basis:
      'Keanggotaan gym dibeli bulanan oleh sebagian kecil penduduk, dan orang bersedia menempuh ' +
      'jarak untuk tempat yang sesuai.',
  },
  {
    key: 'retail',
    label: 'Toko ritel',
    match: /baju|pakaian|butik|clothing|fashion|distro|sepatu|shoe|elektronik|buku|mebel|furnitur|bangunan|material/i,
    catchmentRadiusMeters: 2500,
    demandDrivers: ['mall', 'office', 'transit'],
    healthyOccupancy: { min: 0.08, max: 0.12 },
    visitsPerResidentPerMonth: 0.2,
    transactionNoun: 'transaksi',
    weights: { competition: 1.5, financial_fit: 2, accessibility: 1.5 },
    basis:
      'Toko ritel barang tahan lama dikunjungi jarang, dan pembeli membandingkan beberapa ' +
      'tempat, sehingga jangkauannya luas.',
  },
];

/**
 * The profile used when a trade is not in the table.
 *
 * Deliberately middling, and the report says outright that it was used, so a
 * client whose business we do not model is not shown numbers tuned for
 * somebody else's.
 */
export const GENERIC_PROFILE: TradeProfile = {
  key: 'generic',
  label: 'Usaha umum (profil standar)',
  catchmentRadiusMeters: 1500,
  demandDrivers: ['office', 'school', 'transit', 'mall'],
  healthyOccupancy: { min: 0.1, max: 0.15 },
  visitsPerResidentPerMonth: 0.5,
  transactionNoun: 'transaksi',
  weights: {},
  basis:
    'Jenis usaha Anda belum ada dalam daftar profil kami, sehingga laporan ini memakai profil ' +
    'standar. Radius jangkauan, patokan sewa, dan frekuensi pemakaian di bawah ini BELUM ' +
    'disesuaikan dengan jenis usaha Anda — perlakukan angka turunannya dengan hati-hati.',
};

export function resolveTradeProfile(categories: Array<string | null | undefined>): TradeProfile {
  const text = categories.filter(Boolean).join(' ');
  const found = PROFILES.find((p) => p.match.test(text));

  if (!found) return GENERIC_PROFILE;

  const { match, ...profile } = found;
  return profile;
}

/** What the report must say about where this profile's numbers come from. */
export function describeTradeProfile(profile: TradeProfile): string[] {
  return [
    `Profil jenis usaha: ${profile.label}.`,
    profile.basis,
    RULE_OF_THUMB,
  ];
}

export type OccupancyVerdict = 'HEALTHY' | 'TIGHT' | 'DANGEROUS' | 'UNKNOWN';

export interface OccupancyAssessment {
  verdict: OccupancyVerdict;
  message: string;
}

/**
 * Whether the rent is survivable for this trade.
 *
 * The report already printed "Rasio biaya okupansi 41%" with nothing beside
 * it. For a laundry that is roughly three times the survivable ceiling, and a
 * number the reader cannot interpret is not decision support.
 */
export function assessOccupancy(
  ratioPercent: number | null,
  profile: TradeProfile
): OccupancyAssessment {
  const min = Math.round(profile.healthyOccupancy.min * 100);
  const max = Math.round(profile.healthyOccupancy.max * 100);

  if (ratioPercent === null || !Number.isFinite(ratioPercent)) {
    return {
      verdict: 'UNKNOWN',
      message:
        'Rasio biaya sewa terhadap pendapatan tidak dapat dihitung karena datanya belum lengkap.',
    };
  }

  if (ratioPercent <= max) {
    return {
      verdict: 'HEALTHY',
      message:
        `Sewa memakan ${ratioPercent}% dari perkiraan pendapatan setahun. Untuk ${profile.label.toLowerCase()}, ` +
        `kisaran yang umumnya sehat adalah ${min}-${max}%, jadi angka ini masih wajar.`,
    };
  }

  if (ratioPercent <= max * 1.5) {
    return {
      verdict: 'TIGHT',
      message:
        `Sewa memakan ${ratioPercent}% dari perkiraan pendapatan setahun, di atas kisaran sehat ` +
        `${min}-${max}% untuk ${profile.label.toLowerCase()}. Usaha masih mungkin jalan, tetapi tidak ada ruang ` +
        'untuk meleset — tawar sewanya, atau pastikan pendapatan Anda lebih tinggi dari perkiraan.',
    };
  }

  return {
    verdict: 'DANGEROUS',
    message:
      `PERINGATAN: sewa memakan ${ratioPercent}% dari perkiraan pendapatan setahun, sementara ` +
      `kisaran sehat untuk ${profile.label.toLowerCase()} adalah ${min}-${max}%. Ini sekitar ` +
      `${(ratioPercent / max).toFixed(1)} kali lipat batas wajar. Pada tingkat ini, sewa saja ` +
      'sudah memakan laba sebelum gaji, listrik, dan bahan dihitung.',
  };
}
