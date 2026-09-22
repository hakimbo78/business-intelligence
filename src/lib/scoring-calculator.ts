/**
 * Scoring Calculator — Pure Deterministic Functions
 *
 * Per AGENT_ORCHESTRATION_SPEC.md §13:
 * "Uses deterministic scoring engine. LLM explains scores;
 *  it does not arbitrarily assign scores without evidence."
 *
 * All scores are 0-100. Every score exposes its evidence string.
 */

/**
 * Version of the scoring model.
 *
 * Required by DEVELOPMENT_RULES.md §13 and stored with every result, so a score
 * produced last month can still be explained after the weights change.
 * Bump this whenever a dimension is added, removed, or its mapping changes.
 */
export const SCORING_VERSION = '1.0';

export interface DimensionScore {
  dimension: string;
  score: number;
  evidence: string;
}

export interface ScoringResult {
  dimensions: DimensionScore[];
  overallScore: number;
  /** The scoring model that produced these numbers. */
  scoringVersion: string;
  /** When the scores were computed, for audit (PROJECT_MASTER_SPEC.md §25). */
  scoredAt: string;
}

export interface ScoringInputs {
  competitionAnalysis?: any;
  demandAnalysis?: any;
  marketGapAnalysis?: any;
  accessibilityAnalysis?: any;
  financialAnalysis?: any;
}

// --- Individual Dimension Scorers ---

function scoreDemand(demand: any): DimensionScore {
  if (!demand) return { dimension: 'demand', score: 0, evidence: 'No demand data available.' };
  const map: Record<string, number> = { WEAK: 25, MODERATE: 50, STRONG: 85 };
  const score = map[demand.demandSignal] ?? 0;
  return { dimension: 'demand', score, evidence: `Demand signal is ${demand.demandSignal}.` };
}

function scoreCompetition(competition: any): DimensionScore {
  if (!competition) return { dimension: 'competition', score: 0, evidence: 'No competition data available.' };
  const map: Record<string, number> = { LOW: 85, MEDIUM: 55, HIGH: 25 };
  const score = map[competition.densityLevel] ?? 0;
  return { dimension: 'competition', score, evidence: `Competition density is ${competition.densityLevel}.` };
}

function scoreMarketFit(competition: any, demand: any): DimensionScore {
  if (!competition || !demand) return { dimension: 'market_fit', score: 0, evidence: 'Insufficient data for market fit.' };
  const demandScore = ({ WEAK: 25, MODERATE: 50, STRONG: 85 } as Record<string, number>)[demand.demandSignal] ?? 0;
  const compScore = ({ LOW: 85, MEDIUM: 55, HIGH: 25 } as Record<string, number>)[competition.densityLevel] ?? 0;
  const score = Math.round((demandScore + compScore) / 2);
  return { dimension: 'market_fit', score, evidence: `Demand ${demand.demandSignal} + Competition ${competition.densityLevel}.` };
}

function scoreCustomerFit(demand: any): DimensionScore {
  if (!demand) return { dimension: 'customer_fit', score: 0, evidence: 'No customer fit data.' };
  const map: Record<string, number> = { LOW: 30, MEDIUM: 60, HIGH: 90 };
  const score = map[demand.confidence] ?? 50;
  return { dimension: 'customer_fit', score, evidence: `Customer fit confidence is ${demand.confidence}.` };
}

function scoreGap(gap: any): DimensionScore {
  if (!gap) return { dimension: 'gap', score: 0, evidence: 'No market gap data available.' };
  const map: Record<string, number> = { AVOID: 15, PROCEED_WITH_CAUTION: 50, STRONG_OPPORTUNITY: 85 };
  const score = map[gap.overallRecommendation] ?? 0;
  return { dimension: 'gap', score, evidence: `Market gap recommendation: ${gap.overallRecommendation}.` };
}

function scoreAccessibility(accessibility: any): DimensionScore {
  if (!accessibility) return { dimension: 'accessibility', score: 0, evidence: 'No accessibility data.' };
  const score = Math.min(100, Math.max(0, accessibility.score ?? 0));
  return { dimension: 'accessibility', score, evidence: `Accessibility score is ${score}/100.` };
}

/**
 * The best score a location may earn while operating costs are unknown.
 *
 * Without them, operating profit is gross profit less rent only, so the payback
 * period is optimistic — often by a wide margin. Scoring that 90/100 would have
 * the score contradict the warning printed in the same report.
 */
const UNKNOWN_OPERATING_COST_CAP = 55;

function scoreFinancialFit(financial: any): DimensionScore {
  if (!financial?.scenarios) return { dimension: 'financial_fit', score: 0, evidence: 'No financial data.' };
  const base = financial.scenarios.find((s: any) => s.scenarioName === 'BASE');
  if (!base) return { dimension: 'financial_fit', score: 0, evidence: 'BASE scenario not found.' };

  const operatingCostKnown = (financial.inputs?.operatingCostMonthly ?? 0) > 0;

  let score: number;
  if (!base.isViable) {
    score = 15;
  } else if (base.paybackPeriodMonths <= 6) {
    score = 90;
  } else if (base.paybackPeriodMonths <= 12) {
    score = 75;
  } else if (base.paybackPeriodMonths <= 24) {
    score = 55;
  } else {
    score = 35;
  }
  if (!operatingCostKnown && score > UNKNOWN_OPERATING_COST_CAP) {
    return {
      dimension: 'financial_fit',
      score: UNKNOWN_OPERATING_COST_CAP,
      evidence:
        `Balik modal BASE ${base.paybackPeriodMonths} bulan, TETAPI biaya operasional ` +
        '(gaji, listrik, bahan) belum dikurangkan. Skor dibatasi karena kelayakan ' +
        'sebenarnya belum dapat dinilai.',
    };
  }

  return {
    dimension: 'financial_fit',
    score,
    evidence: `Balik modal BASE ${base.paybackPeriodMonths} bulan. Layak: ${base.isViable}.`,
  };
}

function scoreGrowth(demand: any, gap: any): DimensionScore {
  if (!demand || !gap) return { dimension: 'growth', score: 0, evidence: 'Insufficient data for growth scoring.' };
  let score = 50;
  // Boost for strong demand
  if (demand.demandSignal === 'STRONG') score += 15;
  else if (demand.demandSignal === 'WEAK') score -= 15;
  // Boost for number of hypotheses
  const hypothesesCount = gap.hypotheses?.length ?? 0;
  score += Math.min(hypothesesCount * 10, 20);
  score = Math.min(100, Math.max(0, score));
  return { dimension: 'growth', score, evidence: `Demand: ${demand.demandSignal}, ${hypothesesCount} growth hypotheses identified.` };
}

function scoreRisk(competition: any, demand: any): DimensionScore {
  if (!competition || !demand) return { dimension: 'risk', score: 0, evidence: 'Insufficient data for risk scoring.' };
  let riskCount = 0;
  riskCount += competition.competitionRisks?.length ?? 0;
  // More risks = lower score (inverse)
  const rawRisk = Math.min(riskCount * 15, 60);
  let score = 100 - rawRisk;
  // Low confidence penalizes risk
  if (demand.confidence === 'LOW') score -= 20;
  score = Math.min(100, Math.max(0, score));
  return { dimension: 'risk', score, evidence: `${riskCount} competition risk(s) identified. Confidence: ${demand.confidence}.` };
}

function scoreConfidence(demand: any, gap: any): DimensionScore {
  const levels: number[] = [];
  const map: Record<string, number> = { LOW: 30, MEDIUM: 60, HIGH: 90 };
  if (demand?.confidence) levels.push(map[demand.confidence] ?? 50);
  if (gap?.hypotheses) {
    for (const h of gap.hypotheses) {
      if (h.confidenceLevel) levels.push(map[h.confidenceLevel] ?? 50);
    }
  }
  const score = levels.length > 0 ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
  return { dimension: 'confidence', score, evidence: `Average confidence from ${levels.length} data point(s).` };
}

// --- Main Calculator ---

export function calculateScores(inputs: ScoringInputs): ScoringResult {
  const dimensions: DimensionScore[] = [
    scoreMarketFit(inputs.competitionAnalysis, inputs.demandAnalysis),
    scoreCustomerFit(inputs.demandAnalysis),
    scoreDemand(inputs.demandAnalysis),
    scoreCompetition(inputs.competitionAnalysis),
    scoreGap(inputs.marketGapAnalysis),
    scoreAccessibility(inputs.accessibilityAnalysis),
    scoreFinancialFit(inputs.financialAnalysis),
    scoreGrowth(inputs.demandAnalysis, inputs.marketGapAnalysis),
    scoreRisk(inputs.competitionAnalysis, inputs.demandAnalysis),
    scoreConfidence(inputs.demandAnalysis, inputs.marketGapAnalysis),
  ];

  const overallScore = dimensions.length > 0
    ? Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
    : 0;

  return {
    dimensions,
    overallScore,
    scoringVersion: SCORING_VERSION,
    scoredAt: new Date().toISOString(),
  };
}
