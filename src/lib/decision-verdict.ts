/**
 * The one line the client actually acts on.
 *
 * A report that ends at "30 / 100" leaves the reader to decide what a 30
 * means. This turns the measurements into the decision the product exists to
 * support, and that decision is deliberately narrow: not "open here" or "do not
 * open here", but whether this location is worth the cost of a field survey.
 *
 * That is the honest limit of what public data can settle. We can measure the
 * competitors, the residents, the road and the arithmetic of the rent; we
 * cannot measure footfall, the landlord's real price, or how good the operator
 * is. So the verdict decides where to spend a day of the client's time, and the
 * field checklist decides the rest.
 *
 * Every verdict is deterministic and carries both its reasons and, where one
 * exists, the specific change that would move it up a level — a rent to
 * negotiate to, or a customer count to verify. A verdict with no way out is a
 * judgement; a verdict with a condition is advice.
 */

import type { OccupancyAssessment } from './trade-profile.js';
import type { MarketShareRequirement } from './market-share.js';
import type { PrecisionLevel } from './road-context.js';
import type { PlausibilityIssue } from './input-plausibility.js';

export type Verdict = 'VALIDATE' | 'INVESTIGATE' | 'REJECT' | 'INSUFFICIENT_DATA';

export const VERDICT_LABEL: Record<Verdict, string> = {
  VALIDATE: 'LAYAK DISURVEI',
  INVESTIGATE: 'PERLU DIPERBAIKI DULU',
  REJECT: 'BELUM LAYAK DISURVEI',
  INSUFFICIENT_DATA: 'DATA BELUM CUKUP',
};

export const VERDICT_HEADLINE: Record<Verdict, string> = {
  VALIDATE:
    'Angka-angka di laporan ini masih masuk akal. Lokasi ini layak Anda datangi dan survei langsung.',
  INVESTIGATE:
    'Ada syarat yang harus dipenuhi sebelum lokasi ini layak disurvei. Lihat daftar di bawah.',
  REJECT:
    'Dengan angka yang ada sekarang, lokasi ini belum layak menghabiskan waktu survei Anda.',
  INSUFFICIENT_DATA:
    'Data yang tersedia belum cukup untuk memberi kesimpulan. Lengkapi masukan yang disebutkan di bawah.',
};

export const VERDICT_COLOUR: Record<Verdict, string> = {
  VALIDATE: '#27ae60',
  INVESTIGATE: '#f39c12',
  REJECT: '#e74c3c',
  INSUFFICIENT_DATA: '#7f8c8d',
};

export interface DecisionVerdict {
  verdict: Verdict;
  /** Why, in the order that matters most. */
  reasons: string[];
  /** The specific changes that would move the verdict up a level. */
  conditions: string[];
  /** What must still be checked on foot, whatever the verdict. */
  nextStep: string;
}

export interface VerdictInputs {
  /** The BASE scenario's viability, from the financial model. */
  baseIsViable: boolean | null;
  occupancy: OccupancyAssessment | null;
  marketShare: MarketShareRequirement | null;
  /** How precisely the premises could be located. */
  precisionLevel: PrecisionLevel | null;
  /** Rent the client was quoted. */
  quotedRent: number | null;
  /** The rent that would break even at the client's own estimate. */
  maxAffordableRent: number | null;
  /** True when the competitor census could not be completed. */
  competitorCountIsMinimum: boolean;
  /**
   * Figures the client supplied that sit far outside the trade's norms.
   *
   * These bind harder than anything else here. Every financial number in the
   * report descends from those inputs, so a verdict computed on top of them is
   * only as sound as they are.
   */
  plausibilityIssues?: PlausibilityIssue[];
}

/** Above this multiple of an average competitor's share, the target is a stretch. */
const STRETCH_SHARE_MULTIPLE = 3;

/** Above this, it is not a stretch but a different business plan. */
const IMPLAUSIBLE_SHARE_MULTIPLE = 8;

function money(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

export function decideVerdict(input: VerdictInputs): DecisionVerdict {
  const reasons: string[] = [];
  const conditions: string[] = [];

  const share = input.marketShare;
  const timesAverage = share?.timesAverageShare ?? null;

  // --- Nothing to judge ---
  if (input.baseIsViable === null && share === null) {
    return {
      verdict: 'INSUFFICIENT_DATA',
      reasons: [
        'Model keuangan dan ukuran pasar tidak dapat dihitung dari informasi yang tersedia.',
      ],
      conditions: [
        'Lengkapi perkiraan jumlah pelanggan per hari, nilai transaksi rata-rata, margin kotor, ' +
          'dan biaya sewa, lalu jalankan ulang analisis.',
      ],
      nextStep: 'Lengkapi data masukan sebelum mengambil keputusan apa pun atas lokasi ini.',
    };
  }

  // --- The rent cannot be covered even by the whole neighbourhood ---
  if (share?.requiredSharePercent !== null && share?.requiredSharePercent !== undefined && share.requiredSharePercent > 100) {
    reasons.push(
      `Untuk menutup sewa, Anda harus meraih ${share.requiredSharePercent}% dari seluruh pasar ` +
        'di radius jangkauan — lebih dari 100%. Bahkan jika seluruh pelanggan di sekitar lokasi ' +
        'ini menjadi pelanggan Anda, sewanya tetap tidak tertutup.'
    );
  }

  if (timesAverage !== null && timesAverage >= IMPLAUSIBLE_SHARE_MULTIPLE) {
    reasons.push(
      `Target Anda menuntut ${timesAverage} kali lipat pangsa pesaing rata-rata di area ini. ` +
        'Selisih sebesar itu tidak dapat ditutup hanya dengan lokasi.'
    );
  }

  if (input.occupancy?.verdict === 'DANGEROUS' || input.occupancy?.verdict === 'IMPLAUSIBLE') {
    reasons.push(input.occupancy.message);
  }

  const implausible = input.plausibilityIssues ?? [];
  for (const issue of implausible) {
    reasons.push(issue.message);
  }

  if (input.baseIsViable === false) {
    reasons.push(
      'Pada perkiraan pelanggan Anda sendiri, skenario dasar sudah rugi sebelum biaya ' +
        'operasional dihitung.'
    );
  }

  if (timesAverage !== null && timesAverage >= STRETCH_SHARE_MULTIPLE && timesAverage < IMPLAUSIBLE_SHARE_MULTIPLE) {
    reasons.push(
      `Target Anda menuntut ${timesAverage} kali lipat pangsa pesaing rata-rata. Itu mungkin, ` +
        'tetapi hanya dengan alasan yang jelas mengapa pelanggan memilih Anda.'
    );
  }

  if (input.precisionLevel === 'ROAD_ONLY') {
    reasons.push(
      'Alamat yang diberikan hanya sampai nama jalan, sehingga seluruh jarak di laporan ini ' +
        'diukur dari titik tengah jalan dan bisa meleset jauh.'
    );
  }

  if (input.competitorCountIsMinimum) {
    reasons.push(
      'Penghitungan pesaing belum selesai, sehingga jumlah sebenarnya lebih banyak dari yang ' +
        'tertera dan posisi Anda lebih berat dari gambaran ini.'
    );
  }

  // --- The way out, where one exists ---
  if (
    input.maxAffordableRent !== null &&
    input.quotedRent !== null &&
    input.maxAffordableRent < input.quotedRent
  ) {
    conditions.push(
      `Tawar sewa turun ke ${money(input.maxAffordableRent)} per bulan atau kurang. Pada angka ` +
        `itu, perkiraan pelanggan Anda sendiri sudah cukup untuk impas. Sewa yang ditawarkan ` +
        `sekarang ${money(input.quotedRent)}.`
    );
  }

  if (implausible.length > 0) {
    conditions.push(
      'Pastikan dulu angka-angka yang ditandai di atas — nilai transaksi rata-rata, jumlah ' +
        'pelanggan per hari, margin kotor, dan sewa. Selama itu belum dipastikan, seluruh bagian ' +
        'finansial laporan ini belum dapat dipakai untuk mengambil keputusan.'
    );
  }

  if (share && share.requiredTransactionsPerMonth > 0) {
    conditions.push(
      `Buktikan bahwa Anda bisa mencapai ${share.requiredTransactionsPerMonth.toLocaleString('id-ID')} ` +
        'transaksi per bulan: berdirilah di depan pesaing terdekat pada jam sibuk dan hitung ' +
        'berapa pelanggan yang masuk per jam.'
    );
  }

  if (input.precisionLevel === 'ROAD_ONLY') {
    conditions.push(
      'Kirim ulang alamat lengkap dengan nomor bangunan, atau titik koordinat dari Google Maps, ' +
        'lalu minta analisis ulang. Seluruh jarak di laporan ini akan berubah.'
    );
  }

  if (input.occupancy?.verdict === 'DANGEROUS' && input.maxAffordableRent === null) {
    conditions.push(
      'Cari properti dengan sewa lebih rendah di area yang sama, atau ukuran lebih kecil dengan ' +
        'sewa sebanding.'
    );
  }

  // --- The verdict itself ---
  const impossible =
    (share?.requiredSharePercent ?? 0) > 100 ||
    (timesAverage !== null && timesAverage >= IMPLAUSIBLE_SHARE_MULTIPLE);

  const troubled =
    implausible.length > 0 ||
    input.baseIsViable === false ||
    input.occupancy?.verdict === 'DANGEROUS' ||
    input.occupancy?.verdict === 'IMPLAUSIBLE' ||
    (timesAverage !== null && timesAverage >= STRETCH_SHARE_MULTIPLE) ||
    input.precisionLevel === 'ROAD_ONLY' ||
    input.competitorCountIsMinimum;

  const verdict: Verdict = impossible ? 'REJECT' : troubled ? 'INVESTIGATE' : 'VALIDATE';

  if (verdict === 'VALIDATE' && reasons.length === 0) {
    reasons.push(
      'Skenario dasar menutup sewa pada perkiraan pelanggan Anda sendiri, rasio sewa masih di ' +
        'kisaran wajar untuk jenis usaha ini, dan pangsa pasar yang dibutuhkan tidak jauh di ' +
        'atas pesaing rata-rata.'
    );
  }

  const nextStep =
    verdict === 'REJECT'
      ? 'Perbaiki syarat di atas atau cari properti lain sebelum menghabiskan waktu survei.'
      : verdict === 'INVESTIGATE'
        ? 'Penuhi syarat di atas lebih dulu. Setelah itu, lanjutkan ke daftar periksa validasi lapangan.'
        : 'Lanjutkan ke daftar periksa validasi lapangan di bagian akhir laporan sebelum menandatangani sewa.';

  return { verdict, reasons, conditions, nextStep };
}
