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
export const SCORING_VERSION = '2.0';

export interface DimensionScore {
  dimension: string;
  score: number;
  evidence: string;
  /**
   * True when the dimension could not be measured.
   *
   * Excluded from the average rather than scored zero: "not measured" is not
   * the same as "bad", and averaging it in as zero misstates both.
   */
  notMeasured?: boolean;
}

export interface ScoringResult {
  dimensions: DimensionScore[];
  overallScore: number;
  /**
   * Why the overall score was held down, when it was.
   *
   * A plain average across ten dimensions let a location that loses money
   * every month score 55/100: nine dimensions that say nothing about survival
   * outvoted the one that does. Some facts are not averageable.
   */
  caps: string[];
  /** The scoring model that produced these numbers. */
  scoringVersion: string;
  /** When the scores were computed, for audit (PROJECT_MASTER_SPEC.md §25). */
  scoredAt: string;
}

export interface ScoringInputs {
  /**
   * Dimension weights for this trade, from its profile.
   *
   * Equal weighting said that car access matters to a laundry as much as the
   * number of laundries next door. Missing dimensions default to 1.
   */
  weights?: Partial<Record<string, number>>;
  competitionAnalysis?: any;
  demandAnalysis?: any;
  marketGapAnalysis?: any;
  accessibilityAnalysis?: any;
  financialAnalysis?: any;
}

/** The report is read by an Indonesian business owner; the scores speak to them. */
const DEMAND_LABEL: Record<string, string> = { WEAK: 'lemah', MODERATE: 'sedang', STRONG: 'kuat' };
const DENSITY_LABEL: Record<string, string> = { LOW: 'rendah', MEDIUM: 'sedang', HIGH: 'padat' };
const LEVEL_LABEL: Record<string, string> = { LOW: 'rendah', MEDIUM: 'sedang', HIGH: 'tinggi' };

// --- Individual Dimension Scorers ---

function scoreDemand(demand: any): DimensionScore {
  if (!demand) return { dimension: 'demand', score: 0, evidence: 'No demand data available.' };
  const map: Record<string, number> = { WEAK: 25, MODERATE: 50, STRONG: 85 };
  const score = map[demand.demandSignal] ?? 0;
  return {
    dimension: 'demand',
    score,
    evidence: `Sinyal permintaan ${DEMAND_LABEL[demand.demandSignal] ?? demand.demandSignal}.`,
  };
}

function scoreCompetition(competition: any): DimensionScore {
  if (!competition) return { dimension: 'competition', score: 0, evidence: 'No competition data available.' };
  // UNKNOWN is not a middling market; it is an unmeasured one.
  if (competition.densityLevel === 'UNKNOWN') {
    return {
      dimension: 'competition',
      score: 0,
      notMeasured: true,
      evidence:
        'Jumlah pesaing tidak dapat diukur karena jenis usaha ini tidak ada padanannya di ' +
        'kategori Google Maps. Dimensi ini tidak dihitung dalam skor.',
    };
  }

  const map: Record<string, number> = { LOW: 85, MEDIUM: 55, HIGH: 25 };
  const score = map[competition.densityLevel] ?? 0;
  const explanation = competition.countExplanation ? ` ${competition.countExplanation}` : '';

  return {
    dimension: 'competition',
    score,
    evidence:
      `Kepadatan pesaing ${DENSITY_LABEL[competition.densityLevel] ?? competition.densityLevel}.` +
      explanation,
  };
}

function scoreMarketFit(competition: any, demand: any): DimensionScore {
  if (!competition || !demand) return { dimension: 'market_fit', score: 0, evidence: 'Insufficient data for market fit.' };
  if (competition.densityLevel === 'UNKNOWN') {
    return {
      dimension: 'market_fit',
      score: 0,
      notMeasured: true,
      evidence: 'Tidak dapat dinilai tanpa pengukuran pesaing.',
    };
  }

  const demandScore = ({ WEAK: 25, MODERATE: 50, STRONG: 85 } as Record<string, number>)[demand.demandSignal] ?? 0;
  const compScore = ({ LOW: 85, MEDIUM: 55, HIGH: 25 } as Record<string, number>)[competition.densityLevel] ?? 0;
  const score = Math.round((demandScore + compScore) / 2);

  return {
    dimension: 'market_fit',
    score,
    evidence:
      `Permintaan ${DEMAND_LABEL[demand.demandSignal] ?? demand.demandSignal}, ` +
      `persaingan ${DENSITY_LABEL[competition.densityLevel] ?? competition.densityLevel}.`,
  };
}

function scoreCustomerFit(demand: any): DimensionScore {
  if (!demand) return { dimension: 'customer_fit', score: 0, evidence: 'No customer fit data.' };
  const map: Record<string, number> = { LOW: 30, MEDIUM: 60, HIGH: 90 };
  const score = map[demand.confidence] ?? 50;
  return {
    dimension: 'customer_fit',
    score,
    evidence: `Keyakinan kecocokan pelanggan ${LEVEL_LABEL[demand.confidence] ?? demand.confidence}.`,
  };
}

function scoreGap(gap: any): DimensionScore {
  if (!gap) return { dimension: 'gap', score: 0, evidence: 'No market gap data available.' };
  const map: Record<string, number> = { AVOID: 15, PROCEED_WITH_CAUTION: 50, STRONG_OPPORTUNITY: 85 };
  const label: Record<string, string> = {
    AVOID: 'hindari',
    PROCEED_WITH_CAUTION: 'lanjutkan dengan hati-hati',
    STRONG_OPPORTUNITY: 'peluang kuat',
  };
  const score = map[gap.overallRecommendation] ?? 0;
  return {
    dimension: 'gap',
    score,
    evidence: `Rekomendasi celah pasar: ${label[gap.overallRecommendation] ?? gap.overallRecommendation}.`,
  };
}

function scoreAccessibility(accessibility: any): DimensionScore {
  if (!accessibility) return { dimension: 'accessibility', score: 0, evidence: 'No accessibility data.' };
  const score = Math.min(100, Math.max(0, accessibility.score ?? 0));
  return { dimension: 'accessibility', score, evidence: `Skor aksesibilitas ${score}/100.` };
}

/**
 * The best score a location may earn while operating costs are unknown.
 *
 * Without them, operating profit is gross profit less rent only, so the payback
 * period is optimistic — often by a wide margin. Scoring that 90/100 would have
 * the score contradict the warning printed in the same report.
 */
const UNKNOWN_OPERATING_COST_CAP = 55;

/**
 * Payback in words.
 *
 * The calculator uses -1 for "never pays back". Printed raw it reached the
 * customer as "Balik modal BASE -1 bulan", which reads like a typo rather than
 * like a loss.
 */
function describePayback(base: any): string {
  const months = base?.paybackPeriodMonths;
  if (months === undefined || months === null || months < 0) return 'tidak tercapai';
  return `${months} bulan`;
}

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
        `Balik modal skenario dasar ${describePayback(base)}, TETAPI biaya operasional ` +
        '(gaji, listrik, bahan) belum dikurangkan. Skor dibatasi karena kelayakan ' +
        'sebenarnya belum dapat dinilai.',
    };
  }

  return {
    dimension: 'financial_fit',
    score,
    evidence: base.isViable
      ? `Balik modal skenario dasar ${describePayback(base)}.`
      : 'Skenario dasar RUGI: pendapatan tidak menutup sewa pada perkiraan pelanggan Anda.',
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
  return {
    dimension: 'growth',
    score,
    evidence:
      `Permintaan ${DEMAND_LABEL[demand.demandSignal] ?? demand.demandSignal}, ` +
      `${hypothesesCount} hipotesis pertumbuhan teridentifikasi.`,
  };
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
  return {
    dimension: 'risk',
    score,
    evidence:
      `${riskCount} risiko persaingan teridentifikasi. Keyakinan data ` +
      `${LEVEL_LABEL[demand.confidence] ?? demand.confidence}.`,
  };
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
  return {
    dimension: 'confidence',
    score,
    evidence: `Rata-rata tingkat keyakinan dari ${levels.length} titik data.`,
  };
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

  // Unmeasured dimensions leave the average rather than dragging it to zero.
  const measured = dimensions.filter((d) => !d.notMeasured);

  const weightOf = (dimension: string) => inputs.weights?.[dimension] ?? 1;
  const totalWeight = measured.reduce((sum, d) => sum + weightOf(d.dimension), 0);

  let overallScore = totalWeight > 0
    ? Math.round(
        measured.reduce((sum, d) => sum + d.score * weightOf(d.dimension), 0) / totalWeight
      )
    : 0;

  const caps: string[] = [];

  for (const cap of applicableCaps(inputs)) {
    if (overallScore > cap.max) {
      overallScore = cap.max;
      caps.push(cap.reason);
    }
  }

  return {
    dimensions,
    overallScore,
    caps,
    scoringVersion: SCORING_VERSION,
    scoredAt: new Date().toISOString(),
  };
}

/**
 * Ceilings that override the average.
 *
 * Averaging treats every dimension as substitutable: a strong accessibility
 * score can offset a business that does not cover its rent. It cannot. These
 * are the facts that decide survival on their own, and each states its reason
 * so the customer sees why the score stops where it does.
 */
function applicableCaps(inputs: ScoringInputs): Array<{ max: number; reason: string }> {
  const caps: Array<{ max: number; reason: string }> = [];

  const base = inputs.financialAnalysis?.scenarios?.find((s: any) => s.scenarioName === 'BASE');
  if (base && base.isViable === false) {
    caps.push({
      max: LOSS_MAKING_CAP,
      reason:
        `Skor dibatasi maksimal ${LOSS_MAKING_CAP} karena pada perkiraan pelanggan Anda sendiri, ` +
        'lokasi ini RUGI setiap bulan — pendapatan tidak menutup sewa. Sebaik apa pun ' +
        'aksesibilitas dan lingkungannya, itu tidak menutup kerugian.',
    });
  }

  if (inputs.competitionAnalysis?.count?.capped) {
    caps.push({
      max: SATURATED_MARKET_CAP,
      reason:
        `Skor dibatasi maksimal ${SATURATED_MARKET_CAP} karena jumlah usaha sejenis di sekitar ` +
        'lokasi ini mencapai batas maksimal pencarian — artinya pasarnya sudah padat dan ' +
        'jumlah sebenarnya lebih banyak dari yang kami tampilkan.',
    });
  }

  return caps;
}

/** A location that does not cover its rent is not a middling location. */
const LOSS_MAKING_CAP = 30;

/** A market already full is not a good location without evidence we do not have. */
const SATURATED_MARKET_CAP = 50;
