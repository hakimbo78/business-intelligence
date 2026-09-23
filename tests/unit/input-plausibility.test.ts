import { describe, it, expect } from 'vitest';
import { checkInputPlausibility, summarisePlausibility } from '@/lib/input-plausibility.js';
import { resolveTradeProfile, assessOccupancy } from '@/lib/trade-profile.js';

const cafe = resolveTradeProfile(['cafe']);

/** The Kemang cafe report, exactly as the client's figures produced it. */
const kemang = {
  profile: cafe,
  averageTransaction: 150_000,
  customersPerDay: 300,
  occupancyRatioPercent: 0.9,
  paybackMonths: 1.3,
  breakEvenCustomersPerDay: 8,
};

describe('The report that accepted fiction', () => {
  it('should raise every one of the figures that made it fiction', () => {
    const issues = checkInputPlausibility(kemang);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain('TRANSACTION_ABOVE_RANGE');
    expect(codes).toContain('RENT_TOO_SMALL_FOR_REVENUE');
    expect(codes).toContain('PAYBACK_TOO_FAST');
    expect(codes).toContain('BREAK_EVEN_TRIVIAL');
  });

  it('should say how far outside the range the transaction sits', () => {
    const issue = checkInputPlausibility(kemang).find((i) => i.code === 'TRANSACTION_ABOVE_RANGE')!;

    // Rp 150,000 against a Rp 80,000 ceiling.
    expect(issue.message).toContain('1.9 kali lipat');
    expect(issue.message).toContain('Rp 150.000');
  });

  it('should name the revenue, not the rent, as the likely error', () => {
    const issue = checkInputPlausibility(kemang).find((i) => i.code === 'RENT_TOO_SMALL_FOR_REVENUE')!;

    expect(issue.message).toContain('kelewat tinggi');
  });

  it('should leave the client’s figures alone and say so', () => {
    const summary = summarisePlausibility(checkInputPlausibility(kemang))!;

    expect(summary).toContain('TIDAK mengubahnya');
    expect(summary).toContain('belum dapat dipakai');
  });
});

describe('Ordinary figures', () => {
  const ordinary = {
    profile: cafe,
    averageTransaction: 35_000,
    customersPerDay: 120,
    occupancyRatioPercent: 17,
    paybackMonths: 18,
    breakEvenCustomersPerDay: 70,
  };

  it('should say nothing when nothing is odd', () => {
    expect(checkInputPlausibility(ordinary)).toEqual([]);
    expect(summarisePlausibility([])).toBeNull();
  });

  it('should not complain about figures it was not given', () => {
    expect(
      checkInputPlausibility({
        profile: cafe,
        averageTransaction: null,
        customersPerDay: null,
        occupancyRatioPercent: null,
        paybackMonths: null,
        breakEvenCustomersPerDay: null,
      })
    ).toEqual([]);
  });

  it('should catch a price entered per item rather than per transaction', () => {
    const issues = checkInputPlausibility({ ...ordinary, averageTransaction: 8_000 });
    expect(issues.map((i) => i.code)).toContain('TRANSACTION_BELOW_RANGE');
  });
});

describe('Rent as a share of revenue', () => {
  it('should stop calling an impossibly low ratio healthy', () => {
    // The exact sentence the Kemang report printed: "jadi angka ini masih wajar".
    const result = assessOccupancy(0.9, cafe);

    expect(result.verdict).toBe('IMPLAUSIBLE');
    expect(result.message).toContain('BUKAN pertanda sehat');
    expect(result.message).not.toContain('masih wajar');
  });

  it('should still accept a genuinely cheap lease', () => {
    // A third of the floor is cheap; a twentieth is an input error.
    expect(assessOccupancy(8, cafe).verdict).toBe('HEALTHY');
    expect(assessOccupancy(17, cafe).verdict).toBe('HEALTHY');
  });

  it('should keep flagging rent that is too high', () => {
    expect(assessOccupancy(41, cafe).verdict).toBe('DANGEROUS');
  });
});
