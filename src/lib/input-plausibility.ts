/**
 * Checking the numbers the client gave us.
 *
 * The system verifies everything it fetches — competitor categories against
 * their names, facility types against their names, road class against
 * OpenStreetMap — and then accepts whatever the client typed without a
 * murmur. Every financial figure in the report descends from those inputs, so
 * that is the wrong way round.
 *
 * A Kemang cafe report showed what it costs. The client entered an average
 * transaction of Rp 150,000 and 300 customers a day; the model dutifully
 * produced revenue of Rp 1.17 billion a month, a break-even of 8 customers a
 * day, a payback of 1.3 months, and an occupancy ratio of 0.9% — which the
 * report then described as "masih wajar". Every number was arithmetically
 * correct and the whole page was fiction.
 *
 * These checks do not correct anything and never overrule the client. They
 * notice when a figure sits far outside what the trade normally sees, say so,
 * and stop the verdict from reading as an endorsement. The client may well be
 * right — a fine-dining cafe really can take Rp 150,000 a head — and the
 * report says that too. What it must not do is stay silent.
 */

import type { TradeProfile } from './trade-profile.js';

export type PlausibilityCode =
  | 'TRANSACTION_ABOVE_RANGE'
  | 'TRANSACTION_BELOW_RANGE'
  | 'RENT_TOO_SMALL_FOR_REVENUE'
  | 'PAYBACK_TOO_FAST'
  | 'BREAK_EVEN_TRIVIAL';

export interface PlausibilityIssue {
  code: PlausibilityCode;
  /** What the client should re-check, in their own language. */
  message: string;
}

export interface PlausibilityInputs {
  profile: TradeProfile;
  /** What the client says one customer spends. */
  averageTransaction: number | null;
  customersPerDay: number | null;
  /** Rent as a share of projected annual revenue, as a percentage. */
  occupancyRatioPercent: number | null;
  /** Months to pay back the initial investment in the base scenario. */
  paybackMonths: number | null;
  /** Customers a day needed to cover the rent. */
  breakEvenCustomersPerDay: number | null;
}

/** A payback faster than this is exceptional, not typical. */
const SUSPICIOUSLY_FAST_PAYBACK_MONTHS = 6;

/** A break-even this far below the estimate suggests an input error. */
const TRIVIAL_BREAK_EVEN_SHARE = 0.15;

/** Below this share of the healthy floor, the revenue side is the problem. */
const IMPLAUSIBLY_LOW_OCCUPANCY_DIVISOR = 3;

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

export function checkInputPlausibility(input: PlausibilityInputs): PlausibilityIssue[] {
  const { profile } = input;
  const issues: PlausibilityIssue[] = [];

  const { min, max } = profile.typicalTransaction;
  const trade = profile.label.toLowerCase();

  if (input.averageTransaction !== null && input.averageTransaction > max) {
    const times = Math.round((input.averageTransaction / max) * 10) / 10;
    issues.push({
      code: 'TRANSACTION_ABOVE_RANGE',
      message:
        `Nilai transaksi rata-rata yang Anda masukkan ${rupiah(input.averageTransaction)} — sekitar ` +
        `${times} kali lipat batas atas yang umum untuk ${trade} (${rupiah(min)}–${rupiah(max)}). ` +
        'Kalau memang segmen Anda premium, angka ini bisa benar. Kalau tidak, seluruh proyeksi ' +
        'pendapatan, titik impas, dan balik modal di laporan ini terlalu optimistis.',
    });
  }

  if (input.averageTransaction !== null && input.averageTransaction > 0 && input.averageTransaction < min) {
    issues.push({
      code: 'TRANSACTION_BELOW_RANGE',
      message:
        `Nilai transaksi rata-rata yang Anda masukkan ${rupiah(input.averageTransaction)}, di bawah ` +
        `kisaran umum untuk ${trade} (${rupiah(min)}–${rupiah(max)}). Periksa apakah yang Anda ` +
        'maksud adalah satu transaksi, bukan harga satu item.',
    });
  }

  const healthyFloor = profile.healthyOccupancy.min * 100;
  if (
    input.occupancyRatioPercent !== null &&
    input.occupancyRatioPercent > 0 &&
    input.occupancyRatioPercent < healthyFloor / IMPLAUSIBLY_LOW_OCCUPANCY_DIVISOR
  ) {
    const times = Math.round(healthyFloor / input.occupancyRatioPercent);
    issues.push({
      code: 'RENT_TOO_SMALL_FOR_REVENUE',
      message:
        `Sewa hanya ${input.occupancyRatioPercent}% dari perkiraan pendapatan setahun, padahal untuk ` +
        `${trade} biasanya ${Math.round(healthyFloor)}% ke atas. Artinya perkiraan pendapatan Anda ` +
        `sekitar ${times} kali lebih besar daripada yang lazim untuk properti sesewa ini. Lebih ` +
        'mungkin perkiraan pendapatannya yang kelewat tinggi daripada sewanya yang kelewat murah.',
    });
  }

  if (
    input.paybackMonths !== null &&
    input.paybackMonths > 0 &&
    input.paybackMonths < SUSPICIOUSLY_FAST_PAYBACK_MONTHS
  ) {
    issues.push({
      code: 'PAYBACK_TOO_FAST',
      message:
        `Balik modal ${input.paybackMonths} bulan. Usaha ritel yang balik modal di bawah ` +
        `${SUSPICIOUSLY_FAST_PAYBACK_MONTHS} bulan sangat jarang — biasanya itu tanda perkiraan ` +
        'pendapatan terlalu tinggi, atau biaya investasi awal belum dihitung lengkap.',
    });
  }

  if (
    input.breakEvenCustomersPerDay !== null &&
    input.customersPerDay !== null &&
    input.customersPerDay > 0 &&
    input.breakEvenCustomersPerDay > 0 &&
    input.breakEvenCustomersPerDay < input.customersPerDay * TRIVIAL_BREAK_EVEN_SHARE
  ) {
    issues.push({
      code: 'BREAK_EVEN_TRIVIAL',
      message:
        `Titik impas hanya ${input.breakEvenCustomersPerDay} pelanggan/hari, sementara perkiraan ` +
        `Anda ${input.customersPerDay}. Jarak sebesar itu jarang nyata. Periksa kembali nilai ` +
        'transaksi, margin kotor, dan biaya sewa yang Anda masukkan — salah satunya kemungkinan keliru.',
    });
  }

  return issues;
}

/** The one line the report leads the section with. */
export function summarisePlausibility(issues: PlausibilityIssue[]): string | null {
  if (issues.length === 0) return null;

  return (
    `Ada ${issues.length} angka yang Anda masukkan tampak di luar kewajaran untuk jenis usaha ini. ` +
    'Kami TIDAK mengubahnya — seluruh hitungan di laporan ini tetap memakai angka Anda. Tetapi ' +
    'selama angka-angka itu belum Anda pastikan, perlakukan seluruh bagian finansial laporan ini ' +
    'sebagai belum dapat dipakai untuk mengambil keputusan.'
  );
}
