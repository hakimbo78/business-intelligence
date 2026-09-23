import { describe, it, expect } from 'vitest';
import { SCORING_VERSION, calculateScores, ScoringInputs } from '@/lib/scoring-calculator.js';

/**
 * Scoring Calculator Tests — Pure Deterministic (No Mocks Needed)
 */

const fullInputs: ScoringInputs = {
  competitionAnalysis: {
    densityLevel: 'MEDIUM',
    directCompetitorsCount: 3,
    competitionRisks: ['High saturation in 1km radius.'],
  },
  demandAnalysis: {
    demandSignal: 'STRONG',
    confidence: 'HIGH',
  },
  marketGapAnalysis: {
    overallRecommendation: 'PROCEED_WITH_CAUTION',
    hypotheses: [
      { confidenceLevel: 'MEDIUM' },
    ],
  },
  accessibilityAnalysis: {
    score: 85,
  },
  financialAnalysis: {
    scenarios: [
      { scenarioName: 'CONSERVATIVE', isViable: true, paybackPeriodMonths: 12 },
      { scenarioName: 'BASE', isViable: true, paybackPeriodMonths: 8.3 },
      { scenarioName: 'UPSIDE', isViable: true, paybackPeriodMonths: 5 },
    ],
  },
};

describe('Scoring Calculator', () => {
  it('should calculate all 10 dimensions', () => {
    const result = calculateScores(fullInputs);
    expect(result.dimensions).toHaveLength(10);
  });

  it('should produce an overall score', () => {
    const result = calculateScores(fullInputs);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('should score demand as 85 for STRONG signal', () => {
    const result = calculateScores(fullInputs);
    const demand = result.dimensions.find(d => d.dimension === 'demand');
    expect(demand?.score).toBe(85);
    // The report is Indonesian, so the evidence is too.
    expect(demand?.evidence).toContain('kuat');
  });

  it('should score competition as 55 for MEDIUM density', () => {
    const result = calculateScores(fullInputs);
    const comp = result.dimensions.find(d => d.dimension === 'competition');
    expect(comp?.score).toBe(55);
  });

  it('should score gap as 50 for PROCEED_WITH_CAUTION', () => {
    const result = calculateScores(fullInputs);
    const gap = result.dimensions.find(d => d.dimension === 'gap');
    expect(gap?.score).toBe(50);
  });

  it('should pass through accessibility score', () => {
    const result = calculateScores(fullInputs);
    const acc = result.dimensions.find(d => d.dimension === 'accessibility');
    expect(acc?.score).toBe(85);
  });

  it('should score financial_fit from the payback period once costs are known', () => {
    const result = calculateScores({
      ...fullInputs,
      financialAnalysis: {
        ...fullInputs.financialAnalysis,
        inputs: { operatingCostMonthly: 20_000_000 },
      },
    });
    const fin = result.dimensions.find(d => d.dimension === 'financial_fit');
    // BASE payback is 8.3 months (<=12) → score 75
    expect(fin?.score).toBe(75);
  });

  it('should cap financial_fit while operating costs are unknown', () => {
    // Operating profit is gross profit less rent only, so the payback is
    // optimistic. Scoring it 75 would contradict the warning printed in the
    // same report.
    const result = calculateScores(fullInputs);
    const fin = result.dimensions.find(d => d.dimension === 'financial_fit');

    expect(fin?.score).toBe(55);
    expect(fin?.evidence).toContain('belum dikurangkan');
  });

  it('should handle missing data gracefully', () => {
    const result = calculateScores({});
    expect(result.dimensions).toHaveLength(10);
    // All scores should be 0 with "no data" evidence
    result.dimensions.forEach(d => {
      expect(d.score).toBe(0);
    });
    expect(result.overallScore).toBe(0);
  });

  it('should expose evidence for every dimension', () => {
    const result = calculateScores(fullInputs);
    result.dimensions.forEach(d => {
      expect(d.evidence).toBeDefined();
      expect(d.evidence.length).toBeGreaterThan(0);
    });
  });

  it('should stamp every result with the scoring version and time', () => {
    // DEVELOPMENT_RULES.md §13: scoring must be deterministic AND versioned, so
    // a score produced today can still be explained after the weights change.
    const result = calculateScores({});

    expect(result.scoringVersion).toBe(SCORING_VERSION);
    expect(SCORING_VERSION).toMatch(/^\d+\.\d+$/);
    expect(new Date(result.scoredAt).toString()).not.toBe('Invalid Date');
  });
});
