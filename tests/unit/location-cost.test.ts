import { describe, it, expect } from 'vitest';
import {
  estimateInitialLocationInvestment,
  describeLocationCostAssumptions,
} from '@/lib/location-cost.js';

describe('Initial Location Investment', () => {
  it('should sum deposit and renovation when both assumptions are supplied', () => {
    const result = estimateInitialLocationInvestment(
      { estimatedRent: 20_000_000, propertySize: 50 },
      { depositMonths: 3, renovationCostPerSqm: 4_000_000 }
    );

    // deposit 60,000,000 + renovation 200,000,000
    expect(result.amount).toBe(260_000_000);
    expect(result.isLowerBound).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.components).toHaveLength(2);
  });

  it('should never invent a deposit period', () => {
    const result = estimateInitialLocationInvestment(
      { estimatedRent: 20_000_000, propertySize: 50 },
      {}
    );

    // No assumptions supplied means nothing can be estimated, rather than
    // silently applying an industry-average multiplier.
    expect(result.amount).toBeNull();
    expect(result.missing.join(' ')).toContain('depositMonths assumption not provided');
    expect(result.missing.join(' ')).toContain('renovationCostPerSqm assumption not provided');
  });

  it('should return a flagged lower bound when only the deposit can be computed', () => {
    const result = estimateInitialLocationInvestment(
      { estimatedRent: 20_000_000, propertySize: null },
      { depositMonths: 3, renovationCostPerSqm: 4_000_000 }
    );

    expect(result.amount).toBe(60_000_000);
    expect(result.isLowerBound).toBe(true);
    expect(result.missing.join(' ')).toContain('candidate has no property size');
  });

  it('should return null when the candidate has no cost data at all', () => {
    const result = estimateInitialLocationInvestment(
      { estimatedRent: null, propertySize: null },
      { depositMonths: 3, renovationCostPerSqm: 4_000_000 }
    );

    expect(result.amount).toBeNull();
    expect(result.isLowerBound).toBe(true);
  });

  it('should describe supplied assumptions and demand field verification', () => {
    const described = describeLocationCostAssumptions({
      depositMonths: 3,
      renovationCostPerSqm: 4_000_000,
    });

    expect(described).toHaveLength(2);
    expect(described.join(' ')).toContain('ASSUMPTION');
    expect(described.join(' ')).toContain('requires field verification');
  });

  it('should describe nothing when no assumptions are in force', () => {
    expect(describeLocationCostAssumptions({})).toEqual([]);
  });
});
