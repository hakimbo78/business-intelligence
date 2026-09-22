/**
 * Deterministic consistency checks on a finished report.
 *
 * A generated report once claimed "a viable payback period of 8 months" one
 * page before a table showing every scenario losing money. An LLM reviewer may
 * or may not notice that; code notices it every time, so the checks that can be
 * made mechanically are made here and the QA agent treats them as binding.
 *
 * These complement the LLM review (AGENT_ORCHESTRATION_SPEC.md §15) rather than
 * replacing it: the model still judges the things only judgement can catch.
 */

export interface ConsistencyIssue {
  code: string;
  message: string;
}

interface Scenario {
  scenarioName?: string;
  isViable?: boolean;
  paybackPeriodMonths?: number;
}

interface ReportShape {
  disclaimer?: string;
  synthesis?: { executiveSummary?: string; assumptions?: string[] };
  analysis?: {
    financial?: { scenarios?: Scenario[]; inputs?: { averageTransaction?: number } };
  };
  candidates?: { shortlistedCount?: number; shortlisted?: unknown[] };
}

/**
 * Language PROJECT_MASTER_SPEC.md §1 forbids outright, because the product
 * must never promise an outcome it cannot know.
 */
const FORBIDDEN_PHRASES = [
  'pasti berhasil',
  'dijamin laris',
  'dijamin berhasil',
  '100% profitable',
  '100% untung',
  'lokasi terbaik',
  'pasti ramai',
  'pasti balik modal',
  'guaranteed success',
  'guaranteed profit',
  'risk-free',
  'best location',
  'will definitely',
  'certain to succeed',
];

/** Words asserting the venture loses money, in either language. */
const LOSS_WORDS = /(kerugian|merugi|tidak layak|rugi|not viable|unprofitable|loss-making)/gi;

/** Words asserting the venture works, in either language. */
const VIABILITY_WORDS = /(viable|profitable|menguntungkan|balik modal|layak secara finansial)/gi;

/** Negations that flip such a word: "not viable", "tidak menguntungkan". */
const NEGATION_BEFORE = /\b(not|non|never|no|tidak|belum|bukan|tanpa)\s+(\w+\s+){0,2}$/i;

/**
 * Does this text assert the business is financially viable?
 *
 * Checks for a negation immediately before the word, so "not viable" is not
 * mistaken for a claim of viability.
 */
/**
 * Does this text assert the business loses money?
 *
 * The mirror of assertsViability. A summary opening "berpotensi mengalami
 * kerugian" above a table showing Rp 63,500,000 monthly profit is just as
 * contradictory as the reverse, and was not being caught.
 */
export function assertsLoss(text: string): boolean {
  if (!text) return false;

  for (const match of text.matchAll(LOSS_WORDS)) {
    const preceding = text.slice(Math.max(0, match.index - 30), match.index);
    if (!NEGATION_BEFORE.test(preceding)) return true;
  }
  return false;
}

export function assertsViability(text: string): boolean {
  if (!text) return false;

  for (const match of text.matchAll(VIABILITY_WORDS)) {
    const preceding = text.slice(Math.max(0, match.index - 30), match.index);
    if (!NEGATION_BEFORE.test(preceding)) return true;
  }
  return false;
}

/** Payback periods the prose states, e.g. "payback period of 8 months". */
export function statedPaybackMonths(text: string): number[] {
  if (!text) return [];

  // Covers the natural phrasings a model reaches for: "payback period of 8
  // months", "pays back in 3 months", "balik modal dalam 12 bulan".
  const pattern =
    /(?:payback|pays?\s+back|paid\s+back|balik\s+modal)[^.]{0,40}?(\d+(?:[.,]\d+)?)\s*(?:months?|bulan)/gi;

  return [...text.matchAll(pattern)]
    .map((m) => Number(m[1].replace(',', '.')))
    .filter((n) => Number.isFinite(n));
}

/**
 * Check a report against its own numbers.
 *
 * Returns the contradictions found. An empty array does not mean the report is
 * good — only that it does not contradict itself in ways code can detect.
 */
export function checkReportConsistency(
  report: ReportShape,
  expectedDisclaimer: string
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  const summary = report.synthesis?.executiveSummary ?? '';
  const scenarios = report.analysis?.financial?.scenarios ?? [];

  // --- The mandatory disclaimer (PROJECT_MASTER_SPEC.md §28) ---
  if (report.disclaimer !== expectedDisclaimer) {
    issues.push({
      code: 'MISSING_DISCLAIMER',
      message:
        'The mandatory legal disclaimer (PROJECT_MASTER_SPEC.md §28) is missing or has been altered.',
    });
  }

  // --- Claiming viability the numbers do not support ---
  if (scenarios.length > 0) {
    const anyViable = scenarios.some((s) => s.isViable === true);

    if (!anyViable && assertsViability(summary)) {
      issues.push({
        code: 'VIABILITY_CONTRADICTION',
        message:
          'The executive summary claims the location is viable or profitable, but no financial ' +
          'scenario is viable — every scenario shows a negative operating profit.',
      });
    }

    const allViable = scenarios.every((s) => s.isViable === true);
    if (allViable && assertsLoss(summary)) {
      issues.push({
        code: 'LOSS_CONTRADICTION',
        message:
          'The executive summary says the business loses money, but every financial scenario ' +
          'is viable. If the concern is that the customer estimates behind those scenarios are ' +
          'optimistic, say that explicitly rather than contradicting the table.',
      });
    }

    // --- A payback figure in the prose that no scenario produced ---
    const computed = scenarios
      .filter((s) => s.isViable === true && typeof s.paybackPeriodMonths === 'number')
      .map((s) => s.paybackPeriodMonths as number);

    for (const claimed of statedPaybackMonths(summary)) {
      const matches = computed.some((actual) => Math.abs(actual - claimed) < 0.5);
      if (!matches) {
        issues.push({
          code: 'PAYBACK_MISMATCH',
          message:
            `The executive summary states a payback period of ${claimed} months, which no ` +
            `scenario produced. Computed viable paybacks: ${
              computed.length > 0 ? computed.join(', ') : 'none — no scenario is viable'
            }.`,
        });
      }
    }
  }

  // --- Language the spec forbids ---
  const proseToScan = [summary, ...(report.synthesis?.assumptions ?? [])].join(' ').toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (proseToScan.includes(phrase)) {
      issues.push({
        code: 'FORBIDDEN_LANGUAGE',
        message:
          `The report contains "${phrase}", which PROJECT_MASTER_SPEC.md §1 forbids: the product ` +
          'must not promise an outcome it cannot know.',
      });
    }
  }

  // --- An assumption stating a figure the model did not use ---
  const usedTransaction = report.analysis?.financial?.inputs?.averageTransaction;
  if (typeof usedTransaction === 'number' && usedTransaction > 0) {
    for (const assumption of report.synthesis?.assumptions ?? []) {
      const stated = assumption.match(
        /(?:ticket size|transaction|transaksi)[^.]{0,40}?Rp\s*([\d.,]+)/i
      );
      if (!stated) continue;

      const value = Number(stated[1].replace(/[.,]/g, ''));
      if (Number.isFinite(value) && value > 0 && value !== usedTransaction) {
        issues.push({
          code: 'ASSUMPTION_MISMATCH',
          message:
            `An assumption states an average transaction of Rp ${value.toLocaleString('id-ID')}, ` +
            `but the financial model used Rp ${usedTransaction.toLocaleString('id-ID')}.`,
        });
      }
    }
  }

  // --- Claiming candidates that are not in the report ---
  const claimed = report.candidates?.shortlistedCount;
  const actual = report.candidates?.shortlisted?.length;
  if (typeof claimed === 'number' && typeof actual === 'number' && claimed !== actual) {
    issues.push({
      code: 'CANDIDATE_COUNT_MISMATCH',
      message: `The report states ${claimed} shortlisted candidate(s) but carries ${actual}.`,
    });
  }

  return issues;
}
