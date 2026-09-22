import { describe, it, expect } from 'vitest';
import {
  findMissingFinancialInputs,
  describeFinancialAssumptions,
  INITIAL_INVESTMENT_DEFINITION_EN,
  INITIAL_INVESTMENT_DEFINITION_ID,
} from '@/lib/financial-inputs.js';

const complete = {
  businessProfile: {
    currentAverageTransaction: 35000,
    estimatedDailyCustomers: 100,
    operatingDays: 26,
    grossMargin: 0.65,
  },
  locationSearch: {
    estimatedInitialInvestment: 350_000_000,
    maximumMonthlyRent: 20_000_000,
  },
};

describe('Financial input requirements', () => {
  it('should accept a fully specified project', () => {
    expect(findMissingFinancialInputs(complete)).toEqual([]);
  });

  it('should require the total initial investment', () => {
    const missing = findMissingFinancialInputs({
      ...complete,
      locationSearch: { ...complete.locationSearch, estimatedInitialInvestment: null },
    });

    expect(missing.map((m) => m.field)).toContain('locationSearch.estimatedInitialInvestment');
  });

  it('should treat zero as missing rather than as a real figure', () => {
    // A zero investment previously produced a 0-month payback, which the
    // scoring engine rewarded as excellent financial fit.
    const missing = findMissingFinancialInputs({
      ...complete,
      locationSearch: { ...complete.locationSearch, estimatedInitialInvestment: 0 },
    });

    expect(missing.map((m) => m.field)).toContain('locationSearch.estimatedInitialInvestment');
  });

  it('should require revenue drivers', () => {
    const missing = findMissingFinancialInputs({
      businessProfile: { currentAverageTransaction: null, estimatedDailyCustomers: null },
      locationSearch: { estimatedInitialInvestment: 100 },
    });

    expect(missing.map((m) => m.field)).toEqual([
      'businessProfile.currentAverageTransaction',
      'businessProfile.estimatedDailyCustomers',
    ]);
  });

  it('should explain the investment definition in the failure reason', () => {
    const [missing] = findMissingFinancialInputs({
      ...complete,
      locationSearch: { estimatedInitialInvestment: null },
    });

    // The customer must be told what to enter, not just which field is empty.
    expect(missing.reason).toContain('deposit');
    expect(missing.reason).toContain('EXCLUDES monthly rent');
  });

  it('should define investment as excluding rent in both languages', () => {
    expect(INITIAL_INVESTMENT_DEFINITION_EN).toMatch(/EXCLUDES monthly rent/);
    expect(INITIAL_INVESTMENT_DEFINITION_ID).toMatch(/TIDAK termasuk sewa bulanan/);
  });

  it('should report substituted values as explicit assumptions', () => {
    const assumptions = describeFinancialAssumptions({
      businessProfile: { currentAverageTransaction: 1, estimatedDailyCustomers: 1 },
      locationSearch: { estimatedInitialInvestment: 1 },
    });

    expect(assumptions).toHaveLength(2);
    expect(assumptions.join(' ')).toContain('ASSUMPTION');
    expect(assumptions.join(' ')).toContain('26 days');
    expect(assumptions.join(' ')).toContain('50%');
  });

  it('should report no assumptions when the customer supplied everything', () => {
    expect(describeFinancialAssumptions(complete)).toEqual([]);
  });
});
