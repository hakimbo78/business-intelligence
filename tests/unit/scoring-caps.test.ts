import { describe, it, expect } from 'vitest';
import { calculateScores } from '@/lib/scoring-calculator.js';

/**
 * The report that prompted these rules scored 55/100 for a laundry that lost
 * money every month in a market with twenty competitors inside 1.5 km. Nine
 * dimensions that say nothing about survival outvoted the one that does.
 */

const strongSurroundings = {
  demandAnalysis: { demandSignal: 'STRONG', confidence: 'HIGH' },
  marketGapAnalysis: { overallRecommendation: 'STRONG_OPPORTUNITY', hypotheses: [{ confidenceLevel: 'HIGH' }] },
  accessibilityAnalysis: { score: 90 },
};

const profitable = {
  scenarios: [{ scenarioName: 'BASE', isViable: true, paybackPeriodMonths: 8 }],
  inputs: { operatingCostMonthly: 20_000_000 },
};

const lossMaking = {
  scenarios: [{ scenarioName: 'BASE', isViable: false, paybackPeriodMonths: -1 }],
  inputs: { operatingCostMonthly: 20_000_000 },
};

describe('A location that loses money', () => {
  it('should not be rescued by everything around it being good', () => {
    const result = calculateScores({
      ...strongSurroundings,
      competitionAnalysis: { densityLevel: 'LOW', competitionRisks: [] },
      financialAnalysis: lossMaking,
    });

    expect(result.overallScore).toBeLessThanOrEqual(30);
    expect(result.caps.join(' ')).toContain('RUGI setiap bulan');
  });

  it('should leave a profitable location uncapped', () => {
    const result = calculateScores({
      ...strongSurroundings,
      competitionAnalysis: { densityLevel: 'LOW', competitionRisks: [] },
      financialAnalysis: profitable,
    });

    expect(result.overallScore).toBeGreaterThan(30);
    expect(result.caps).toEqual([]);
  });

  it('should never print the -1 sentinel to the customer', () => {
    const result = calculateScores({
      ...strongSurroundings,
      competitionAnalysis: { densityLevel: 'LOW', competitionRisks: [] },
      financialAnalysis: lossMaking,
    });

    const financial = result.dimensions.find((d) => d.dimension === 'financial_fit');
    expect(financial?.evidence).not.toContain('-1');
    expect(financial?.evidence).toContain('RUGI');
  });
});

describe('A market that is already full', () => {
  it('should cap the score when the competitor search hit its ceiling', () => {
    const result = calculateScores({
      ...strongSurroundings,
      competitionAnalysis: {
        densityLevel: 'HIGH',
        competitionRisks: [],
        count: { found: 20, capped: true, radiusMeters: 1500, nearestMeters: 180, searchable: true },
      },
      financialAnalysis: profitable,
    });

    expect(result.overallScore).toBeLessThanOrEqual(50);
    expect(result.caps.join(' ')).toContain('sudah padat');
  });
});

describe('A dimension that could not be measured', () => {
  it('should be left out of the average rather than counted as zero', () => {
    const measured = calculateScores({
      ...strongSurroundings,
      competitionAnalysis: { densityLevel: 'LOW', competitionRisks: [] },
      financialAnalysis: profitable,
    });

    const unmeasured = calculateScores({
      ...strongSurroundings,
      competitionAnalysis: { densityLevel: 'UNKNOWN', competitionRisks: [] },
      financialAnalysis: profitable,
    });

    // Scoring an unknown as zero would have punished the location for our own
    // inability to search for its trade.
    const zeroed = unmeasured.dimensions.filter((d) => d.notMeasured);
    expect(zeroed.length).toBeGreaterThan(0);
    expect(unmeasured.overallScore).toBeGreaterThan(measured.overallScore - 25);
    const competition = unmeasured.dimensions.find((d) => d.dimension === 'competition');
    expect(competition?.evidence).toContain('tidak dihitung dalam skor');
  });
});
