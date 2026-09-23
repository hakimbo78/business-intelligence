import { describe, it, expect } from 'vitest';
import { decideVerdict, type VerdictInputs } from '@/lib/decision-verdict.js';
import { maxAffordableRent } from '@/lib/sensitivity.js';
import type { FinancialInputs } from '@/lib/financial-calculator.js';

/** A healthy location: covers its rent, ordinary market share, precise address. */
const healthy: VerdictInputs = {
  baseIsViable: true,
  occupancy: { verdict: 'HEALTHY', message: 'Sewa memakan 12% dari pendapatan.' },
  marketShare: {
    catchmentRadiusMeters: 800,
    catchmentPopulation: 31_628,
    competitorCount: 12,
    competitorCountIsMinimum: false,
    potentialTransactionsPerMonth: 9_488,
    requiredTransactionsPerMonth: 650,
    requiredSharePercent: 6.9,
    averageSharePercent: 7.7,
    timesAverageShare: 0.9,
    notes: [],
  },
  precisionLevel: 'EXACT',
  quotedRent: 5_000_000,
  maxAffordableRent: 8_000_000,
  competitorCountIsMinimum: false,
};

describe('Deciding whether the location is worth a survey', () => {
  it('should send a sound location to the field', () => {
    const result = decideVerdict(healthy);

    expect(result.verdict).toBe('VALIDATE');
    expect(result.nextStep).toContain('daftar periksa validasi lapangan');
  });

  it('should hold back a location that loses money on the client’s own estimate', () => {
    const result = decideVerdict({ ...healthy, baseIsViable: false });

    expect(result.verdict).toBe('INVESTIGATE');
    expect(result.reasons.join(' ')).toContain('sudah rugi');
  });

  it('should refuse a location the whole neighbourhood could not pay for', () => {
    const result = decideVerdict({
      ...healthy,
      baseIsViable: false,
      marketShare: { ...healthy.marketShare!, requiredSharePercent: 140, timesAverageShare: 18 },
    });

    expect(result.verdict).toBe('REJECT');
    expect(result.reasons.join(' ')).toContain('lebih dari 100%');
    expect(result.nextStep).toContain('cari properti lain');
  });

  it('should treat a stretch target as a condition, not a refusal', () => {
    const result = decideVerdict({
      ...healthy,
      marketShare: { ...healthy.marketShare!, timesAverageShare: 4.2 },
    });

    expect(result.verdict).toBe('INVESTIGATE');
    expect(result.reasons.join(' ')).toContain('4.2 kali lipat');
  });

  it('should hold back when we do not know where the premises actually is', () => {
    const result = decideVerdict({ ...healthy, precisionLevel: 'ROAD_ONLY' });

    expect(result.verdict).toBe('INVESTIGATE');
    expect(result.conditions.join(' ')).toContain('nomor bangunan');
  });

  it('should hold back when the competitor count is only a floor', () => {
    const result = decideVerdict({ ...healthy, competitorCountIsMinimum: true });

    expect(result.verdict).toBe('INVESTIGATE');
    expect(result.reasons.join(' ')).toContain('lebih berat');
  });

  it('should say it cannot judge rather than guess', () => {
    const result = decideVerdict({
      ...healthy,
      baseIsViable: null,
      marketShare: null,
    });

    expect(result.verdict).toBe('INSUFFICIENT_DATA');
    expect(result.conditions.join(' ')).toContain('Lengkapi perkiraan');
  });
});

describe('The way out of a bad verdict', () => {
  it('should name the rent that would make the numbers work', () => {
    const result = decideVerdict({
      ...healthy,
      baseIsViable: false,
      quotedRent: 8_000_000,
      maxAffordableRent: 4_875_000,
    });

    // A verdict with a condition is advice; without one it is only a judgement.
    expect(result.conditions.join(' ')).toContain('Rp 4.875.000');
    expect(result.conditions.join(' ')).toContain('Rp 8.000.000');
  });

  it('should not invent a rent condition when the rent already works', () => {
    const result = decideVerdict(healthy);
    expect(result.conditions.join(' ')).not.toContain('Tawar sewa turun');
  });

  it('should always give the transaction count to verify on foot', () => {
    const result = decideVerdict(healthy);
    expect(result.conditions.join(' ')).toContain('650 transaksi per bulan');
  });
});

describe('The rent a business can actually afford', () => {
  const base: FinancialInputs = {
    rent: 8_000_000,
    propertySize: 200,
    customersPerDay: 15,
    averageTransaction: 50_000,
    operatingDays: 26,
    grossMargin: 0.5,
    operatingCostMonthly: 0,
    initialInvestment: 176_000_000,
  };

  it('should be the contribution left after operating costs', () => {
    // 15 x 50,000 x 0.5 x 26 = 9,750,000 a month of contribution.
    expect(maxAffordableRent(base)).toBe(9_750_000);
    expect(maxAffordableRent({ ...base, operatingCostMonthly: 4_000_000 })).toBe(5_750_000);
  });

  it('should never suggest a negative rent', () => {
    expect(maxAffordableRent({ ...base, operatingCostMonthly: 50_000_000 })).toBe(0);
  });

  it('should refuse to answer when the business earns nothing per customer', () => {
    expect(maxAffordableRent({ ...base, averageTransaction: 0 })).toBeNull();
  });
});
