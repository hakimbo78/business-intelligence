import type { FinancialInputs } from './financial-calculator.js';

/**
 * Sensitivity to the customer's own traffic estimate.
 *
 * Every revenue figure in the report descends from one number the customer
 * guessed: how many customers a day they expect. The three scenarios vary it by
 * ±30%, so if the guess is wrong by a factor of two, all three are wrong
 * together and the report reads as confident anyway.
 *
 * This turns the question around. Instead of projecting from the guess, it
 * states the threshold the business must clear — a number the customer can go
 * and test by standing outside a competitor and counting.
 */

export interface SensitivityPoint {
  customersPerDay: number;
  monthlyRevenue: number;
  operatingProfit: number;
  /** Null when the business does not pay back at this level. */
  paybackPeriodMonths: number | null;
  isViable: boolean;
  /** True for the row matching the customer's own estimate. */
  isAssumption: boolean;
  /** True for the row at the break-even threshold. */
  isBreakEven: boolean;
}

export interface SensitivityAnalysis {
  /** Customers per day at which operating profit reaches zero. */
  breakEvenCustomersPerDay: number;
  /**
   * The highest rent that still breaks even at the customer's own estimate.
   *
   * The most actionable number the model can produce: the client is holding a
   * quoted rent and can compare it directly. Null when the business earns
   * nothing per customer, and negative is clamped to zero — a rent cannot be
   * negative, and the shortfall is already visible elsewhere.
   */
  maxAffordableRent: number | null;
  /** What the customer estimated. */
  assumedCustomersPerDay: number;
  /**
   * How far the estimate can fall before the business loses money, as a
   * percentage of the estimate. Negative when the estimate is already below
   * break-even.
   */
  marginOfSafetyPercent: number | null;
  points: SensitivityPoint[];
  notes: string[];
}

/** How far around the estimate to explore. */
const MULTIPLIERS = [0.4, 0.6, 0.8, 1.0, 1.2, 1.4];

/**
 * Customers per day needed to cover rent and operating costs.
 *
 * Rounded up: a fractional customer does not pay rent.
 */
export function breakEvenCustomersPerDay(inputs: FinancialInputs): number {
  const contributionPerCustomerPerMonth =
    inputs.averageTransaction * inputs.grossMargin * inputs.operatingDays;

  if (contributionPerCustomerPerMonth <= 0) return 0;

  const fixedCosts = inputs.rent + inputs.operatingCostMonthly;
  return Math.ceil(fixedCosts / contributionPerCustomerPerMonth);
}

function evaluate(
  inputs: FinancialInputs,
  customersPerDay: number
): Omit<SensitivityPoint, 'isAssumption' | 'isBreakEven'> {
  const monthlyRevenue = customersPerDay * inputs.averageTransaction * inputs.operatingDays;
  const grossProfit = monthlyRevenue * inputs.grossMargin;
  const operatingProfit = grossProfit - inputs.rent - inputs.operatingCostMonthly;

  const paybackPeriodMonths =
    operatingProfit > 0 && inputs.initialInvestment > 0
      ? Math.round((inputs.initialInvestment / operatingProfit) * 10) / 10
      : null;

  return {
    customersPerDay,
    monthlyRevenue,
    operatingProfit,
    paybackPeriodMonths,
    isViable: operatingProfit > 0,
  };
}

/**
 * The rent at which the customer's own estimate exactly breaks even.
 *
 * Contribution per month less the operating costs: whatever is left is what
 * rent may take.
 */
export function maxAffordableRent(inputs: FinancialInputs): number | null {
  const contributionPerMonth =
    inputs.customersPerDay * inputs.averageTransaction * inputs.grossMargin * inputs.operatingDays;

  if (contributionPerMonth <= 0) return null;

  return Math.max(0, Math.round(contributionPerMonth - inputs.operatingCostMonthly));
}

export function analyseSensitivity(inputs: FinancialInputs): SensitivityAnalysis {
  const assumed = inputs.customersPerDay;
  const breakEven = breakEvenCustomersPerDay(inputs);

  const marginOfSafetyPercent =
    assumed > 0 ? Math.round(((assumed - breakEven) / assumed) * 1000) / 10 : null;

  // The customer's own estimate always appears, even if it does not land on a
  // multiplier, so they can find their own number in the table.
  const counts = new Set<number>(
    MULTIPLIERS.map((m) => Math.max(1, Math.round(assumed * m)))
  );
  counts.add(assumed);

  // The threshold is the point of the table, and it was missing from it: with
  // an estimate of 20 the rows ran 8 to 28 while break-even sat at 33, so the
  // one number the customer had to clear never appeared.
  if (breakEven > 0) counts.add(breakEven);

  const points: SensitivityPoint[] = [...counts]
    .sort((a, b) => a - b)
    .map((c) => ({
      ...evaluate(inputs, c),
      isAssumption: c === assumed,
      isBreakEven: c === breakEven,
    }));

  const notes: string[] = [];

  if (inputs.operatingCostMonthly <= 0) {
    notes.push(
      `Ambang ${breakEven} pelanggan/hari ini HANYA menutup sewa. Biaya operasional ` +
        '(gaji, listrik, bahan) belum dihitung, sehingga ambang yang sebenarnya lebih tinggi — ' +
        'sering kali jauh lebih tinggi.'
    );
  }

  if (marginOfSafetyPercent !== null && marginOfSafetyPercent < 0) {
    notes.push(
      `Estimasi Anda (${assumed} pelanggan/hari) ADA DI BAWAH titik impas ` +
        `(${breakEven} pelanggan/hari). Dengan asumsi ini, usaha rugi sejak awal.`
    );
  } else if (marginOfSafetyPercent !== null && marginOfSafetyPercent < 25) {
    notes.push(
      `Jarak antara estimasi Anda dan titik impas hanya ${marginOfSafetyPercent}%. ` +
        'Meleset sedikit saja dari perkiraan pelanggan sudah membuat usaha rugi.'
    );
  }

  notes.push(
    `Angka ${assumed} pelanggan/hari berasal dari perkiraan Anda sendiri, bukan dari ` +
      'pengukuran kami. Sebelum memutuskan, hitung langsung di lapangan: berdirilah di ' +
      'depan pesaing terdekat pada jam sibuk dan hitung berapa orang masuk per jam.'
  );

  const affordableRent = maxAffordableRent(inputs);

  if (affordableRent !== null && affordableRent < inputs.rent) {
    notes.push(
      `Dengan perkiraan ${assumed} pelanggan/hari, sewa tertinggi yang masih impas adalah ` +
        `Rp ${affordableRent.toLocaleString('id-ID')} per bulan. Sewa yang ditawarkan ` +
        `Rp ${inputs.rent.toLocaleString('id-ID')} — selisihnya ` +
        `Rp ${(inputs.rent - affordableRent).toLocaleString('id-ID')} setiap bulan. Tawar sewa ` +
        'ke angka itu, atau pastikan pelanggan Anda lebih banyak dari perkiraan.'
    );
  }

  return {
    breakEvenCustomersPerDay: breakEven,
    maxAffordableRent: affordableRent,
    assumedCustomersPerDay: assumed,
    marginOfSafetyPercent,
    points,
    notes,
  };
}
