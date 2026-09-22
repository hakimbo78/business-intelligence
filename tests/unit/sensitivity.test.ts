import { describe, it, expect } from 'vitest';
import { analyseSensitivity, breakEvenCustomersPerDay } from '@/lib/sensitivity.js';
import type { FinancialInputs } from '@/lib/financial-calculator.js';

/** A restaurant paying Rp 8,000,000 rent, 50% margin, 26 days, Rp 100,000 ticket. */
const base: FinancialInputs = {
  rent: 8_000_000,
  propertySize: 280,
  customersPerDay: 50,
  averageTransaction: 100_000,
  operatingDays: 26,
  grossMargin: 0.5,
  operatingCostMonthly: 0,
  initialInvestment: 250_000_000,
};

describe('Break-even', () => {
  it('should state how many customers a day cover the fixed costs', () => {
    // Each customer contributes 100,000 x 0.5 x 26 = 1,300,000 a month.
    // 8,000,000 rent / 1,300,000 = 6.15, rounded up.
    expect(breakEvenCustomersPerDay(base)).toBe(7);
  });

  it('should include operating costs in the threshold when they are known', () => {
    // (8,000,000 + 20,000,000) / 1,300,000 = 21.5, rounded up.
    expect(breakEvenCustomersPerDay({ ...base, operatingCostMonthly: 20_000_000 })).toBe(22);
  });

  it('should round up, since a fractional customer pays no rent', () => {
    expect(breakEvenCustomersPerDay({ ...base, rent: 1_300_001 })).toBe(2);
  });

  it('should not divide by zero when the business earns nothing per customer', () => {
    expect(breakEvenCustomersPerDay({ ...base, averageTransaction: 0 })).toBe(0);
  });
});

describe('Margin of safety', () => {
  it('should say how far the estimate can fall before the business loses money', () => {
    const result = analyseSensitivity(base);

    // Estimate 50, break-even 7: the estimate can fall 86% and still hold.
    expect(result.breakEvenCustomersPerDay).toBe(7);
    expect(result.marginOfSafetyPercent).toBe(86);
  });

  it('should go negative when the estimate is already below break-even', () => {
    const result = analyseSensitivity({
      ...base,
      rent: 40_000_000,
      customersPerDay: 20,
    });

    expect(result.marginOfSafetyPercent).toBeLessThan(0);
    expect(result.notes.join(' ')).toContain('DI BAWAH titik impas');
  });

  it('should warn when the estimate barely clears the threshold', () => {
    // Break-even 22 against an estimate of 25 leaves 12% of room.
    const result = analyseSensitivity({
      ...base,
      operatingCostMonthly: 20_000_000,
      customersPerDay: 25,
    });

    expect(result.marginOfSafetyPercent).toBeLessThan(25);
    expect(result.notes.join(' ')).toContain('Meleset sedikit saja');
  });
});

describe('Sensitivity table', () => {
  it('should always include the customer’s own estimate, marked', () => {
    const result = analyseSensitivity({ ...base, customersPerDay: 37 });

    const assumption = result.points.filter((p) => p.isAssumption);
    expect(assumption).toHaveLength(1);
    expect(assumption[0].customersPerDay).toBe(37);
  });

  it('should span below and above the estimate', () => {
    const result = analyseSensitivity(base);
    const counts = result.points.map((p) => p.customersPerDay);

    expect(Math.min(...counts)).toBeLessThan(50);
    expect(Math.max(...counts)).toBeGreaterThan(50);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('should show where the business stops paying back', () => {
    const result = analyseSensitivity({ ...base, rent: 40_000_000 });

    const losing = result.points.filter((p) => !p.isViable);
    expect(losing.length).toBeGreaterThan(0);
    // A loss-making level has no payback period at all, rather than a huge one.
    expect(losing.every((p) => p.paybackPeriodMonths === null)).toBe(true);
  });

  it('should warn that the threshold excludes operating costs', () => {
    const result = analyseSensitivity(base);
    expect(result.notes.join(' ')).toContain('HANYA menutup sewa');
  });

  it('should drop that warning once operating costs are known', () => {
    const result = analyseSensitivity({ ...base, operatingCostMonthly: 20_000_000 });
    expect(result.notes.join(' ')).not.toContain('HANYA menutup sewa');
  });

  it('should always say the estimate came from the customer, not from us', () => {
    const result = analyseSensitivity(base);

    // This is the point of the whole section.
    expect(result.notes.join(' ')).toContain('perkiraan Anda sendiri');
    expect(result.notes.join(' ')).toContain('hitung langsung di lapangan');
  });
});
