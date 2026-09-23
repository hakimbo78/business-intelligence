/**
 * How big a share of the neighbourhood this business must win to survive.
 *
 * Every other number in the report is an input or a projection. This one is a
 * demand: the customer estimated their own traffic, the break-even calculation
 * turned that into a monthly transaction count, and the catchment population
 * says how many transactions the neighbourhood generates at all. Dividing the
 * one by the other gives the share of the entire local market the business has
 * to take — and the competitor census says how many others are already taking
 * it.
 *
 * "Butuh 18% dari seluruh cucian di sekitar Anda, sementara pangsa rata-rata
 * pesaing hanya 0,4%" is a sentence a person can act on. "Skor 30/100" is not.
 *
 * Two of the three inputs are assumptions, and the notes say so every time:
 * the visit rate is a rule of thumb, and the competitor count is a floor
 * whenever the census hit a provider limit.
 */

import type { TradeProfile } from './trade-profile.js';

export interface MarketShareRequirement {
  catchmentRadiusMeters: number;
  /** Residents inside the catchment circle. Null when unavailable. */
  catchmentPopulation: number | null;
  /**
   * Share of that circle the road network actually serves.
   *
   * Null when the network could not be read, in which case the circle is used
   * whole and the notes say so.
   */
  reachableFraction: number | null;
  /** Residents actually within reach along roads. The figure the market uses. */
  reachablePopulation: number | null;
  competitorCount: number;
  /** True when the census could not be completed, so the count is a floor. */
  competitorCountIsMinimum: boolean;
  /** Transactions the catchment generates each month, at the assumed rate. */
  potentialTransactionsPerMonth: number | null;
  /** Transactions this business needs each month simply not to lose money. */
  requiredTransactionsPerMonth: number;
  /** That requirement as a share of the whole local market. */
  requiredSharePercent: number | null;
  /** The share each player would hold if the market split evenly. */
  averageSharePercent: number | null;
  /** How many times an even share the business must capture. */
  timesAverageShare: number | null;
  notes: string[];
}

export function assessMarketShare(input: {
  profile: TradeProfile;
  catchmentPopulation: number | null;
  /** From the road network, when it could be read. */
  reachableFraction?: number | null;
  competitorCount: number;
  competitorCountIsMinimum: boolean;
  breakEvenCustomersPerDay: number;
  operatingDays: number;
}): MarketShareRequirement {
  const { profile } = input;

  const requiredTransactionsPerMonth = Math.round(
    input.breakEvenCustomersPerDay * input.operatingDays
  );

  // Only ever cuts the market down: a network that cannot be read leaves the
  // circle whole rather than inflating it.
  const reachableFraction =
    input.reachableFraction !== null && input.reachableFraction !== undefined
      ? Math.min(1, Math.max(0, input.reachableFraction))
      : null;

  const reachablePopulation =
    input.catchmentPopulation === null
      ? null
      : Math.round(input.catchmentPopulation * (reachableFraction ?? 1));

  const potentialTransactionsPerMonth =
    reachablePopulation === null
      ? null
      : Math.round(reachablePopulation * profile.visitsPerResidentPerMonth);

  const requiredSharePercent =
    potentialTransactionsPerMonth === null || potentialTransactionsPerMonth <= 0
      ? null
      : Math.round((requiredTransactionsPerMonth / potentialTransactionsPerMonth) * 1000) / 10;

  // The business itself is one of the players sharing the market.
  const averageSharePercent =
    input.competitorCount >= 0
      ? Math.round((100 / (input.competitorCount + 1)) * 100) / 100
      : null;

  const timesAverageShare =
    requiredSharePercent !== null && averageSharePercent !== null && averageSharePercent > 0
      ? Math.round((requiredSharePercent / averageSharePercent) * 10) / 10
      : null;

  const notes: string[] = [];

  if (input.catchmentPopulation === null) {
    notes.push(
      'Jumlah penduduk di sekitar lokasi tidak dapat diambil saat laporan ini dibuat, sehingga ' +
        'ukuran pasar dan pangsa yang dibutuhkan tidak dapat dihitung.'
    );
  } else {
    const km = (profile.catchmentRadiusMeters / 1000).toFixed(1).replace('.', ',');

    if (reachableFraction !== null && reachableFraction < 0.98) {
      notes.push(
        `Dalam radius ${km} km ada ${input.catchmentPopulation.toLocaleString('id-ID')} penduduk, ` +
          `tetapi hanya ${Math.round(reachableFraction * 100)}% dari area itu yang benar-benar ` +
          `terjangkau lewat jalan — sekitar ${reachablePopulation!.toLocaleString('id-ID')} orang. ` +
          'Angka yang lebih kecil itulah yang dipakai menghitung pasar.'
      );
    } else {
      notes.push(
        `Ukuran pasar dihitung dari ${reachablePopulation!.toLocaleString('id-ID')} penduduk ` +
          `dalam jangkauan ${km} km.`
      );
    }

    notes.push(
      `Jumlah penduduk itu dikali asumsi ${profile.visitsPerResidentPerMonth} ` +
        `${profile.transactionNoun} per orang per bulan. Angka frekuensi itu kaidah umum, ` +
        'bukan pengukuran di lokasi Anda.'
    );
  }

  if (reachableFraction === null && input.catchmentPopulation !== null) {
    notes.push(
      'Jaringan jalan tidak dapat dibaca, sehingga jangkauan dihitung sebagai lingkaran garis ' +
        'lurus. Jumlah penduduk yang benar-benar dapat mencapai lokasi ini kemungkinan lebih kecil.'
    );
  }

  if (input.competitorCountIsMinimum) {
    notes.push(
      `Jumlah pesaing ${input.competitorCount} adalah angka MINIMUM — pencarian belum selesai ` +
        'menghitung seluruhnya. Pangsa rata-rata yang sebenarnya lebih kecil dari yang tertera, ' +
        'dan posisi Anda lebih berat.'
    );
  }

  if (timesAverageShare !== null && timesAverageShare > 1) {
    notes.push(
      `Untuk tidak rugi, Anda harus meraih ${timesAverageShare} kali lipat pangsa pesaing ` +
        'rata-rata di area ini. Itu bukan mustahil, tetapi menuntut alasan yang jelas mengapa ' +
        'pelanggan memilih Anda — harga, kualitas, jam buka, atau layanan antar.'
    );
  } else if (timesAverageShare !== null) {
    notes.push(
      `Untuk tidak rugi, Anda cukup meraih ${timesAverageShare} kali pangsa pesaing rata-rata ` +
        'di area ini, yang berarti target Anda berada di bawah pangsa rata-rata.'
    );
  }

  if (requiredSharePercent !== null && requiredSharePercent > 100) {
    notes.push(
      'Pangsa yang dibutuhkan melebihi 100% dari seluruh pasar di radius ini. Dengan asumsi ' +
        'yang dipakai, lokasi ini tidak dapat menutup biaya sewa meskipun Anda menguasai ' +
        'seluruh pasar di sekitarnya.'
    );
  }

  notes.push(
    'Perhitungan ini mengabaikan pelanggan dari luar radius dan pesaing yang tidak terdaftar ' +
      'di peta. Pakailah sebagai ukuran seberapa berat, bukan sebagai ramalan.'
  );

  return {
    catchmentRadiusMeters: profile.catchmentRadiusMeters,
    catchmentPopulation: input.catchmentPopulation,
    reachableFraction,
    reachablePopulation,
    competitorCount: input.competitorCount,
    competitorCountIsMinimum: input.competitorCountIsMinimum,
    potentialTransactionsPerMonth,
    requiredTransactionsPerMonth,
    requiredSharePercent,
    averageSharePercent,
    timesAverageShare,
    notes,
  };
}
