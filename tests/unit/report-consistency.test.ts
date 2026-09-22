import { describe, it, expect } from 'vitest';
import {
  checkReportConsistency,
  assertsViability,
  statedPaybackMonths,
} from '@/lib/report-consistency.js';
import { REPORT_DISCLAIMER_EN } from '@/lib/disclaimer.js';

const codes = (report: unknown) =>
  checkReportConsistency(report as never, REPORT_DISCLAIMER_EN).map((i) => i.code);

/** A report that says nothing contradictory. */
const soundReport = {
  disclaimer: REPORT_DISCLAIMER_EN,
  synthesis: {
    executiveSummary: 'Demand is strong and the base scenario pays back in 7.9 months.',
    assumptions: ['Average transaction of Rp 35.000 as supplied by the client'],
  },
  analysis: {
    financial: {
      inputs: { averageTransaction: 35000 },
      scenarios: [
        { scenarioName: 'CONSERVATIVE', isViable: true, paybackPeriodMonths: 12.1 },
        { scenarioName: 'BASE', isViable: true, paybackPeriodMonths: 7.9 },
        { scenarioName: 'UPSIDE', isViable: true, paybackPeriodMonths: 5.2 },
      ],
    },
  },
  candidates: { shortlistedCount: 1, shortlisted: [{}] },
};

describe('Viability assertions', () => {
  it('should spot a claim that the venture works', () => {
    expect(assertsViability('Financials indicate a viable payback period')).toBe(true);
    expect(assertsViability('The location is profitable')).toBe(true);
    expect(assertsViability('Lokasi ini menguntungkan')).toBe(true);
  });

  it('should not mistake a denial for a claim', () => {
    // "not viable" must never be read as a claim of viability.
    expect(assertsViability('The base scenario is not viable')).toBe(false);
    expect(assertsViability('This location is tidak menguntungkan')).toBe(false);
    expect(assertsViability('No scenario is profitable at this rent')).toBe(false);
  });

  it('should say nothing about text that makes no claim', () => {
    expect(assertsViability('Demand is strong and competition is moderate.')).toBe(false);
    expect(assertsViability('')).toBe(false);
  });
});

describe('Payback figures stated in prose', () => {
  it('should read the months out of a claim, however it is phrased', () => {
    expect(statedPaybackMonths('a viable payback period of 8 months')).toEqual([8]);
    expect(statedPaybackMonths('balik modal dalam 12 bulan')).toEqual([12]);
    expect(statedPaybackMonths('payback period of 7.9 months')).toEqual([7.9]);
    // Phrasings a model reaches for just as readily.
    expect(statedPaybackMonths('the base scenario pays back in 3 months')).toEqual([3]);
    expect(statedPaybackMonths('the investment is paid back in 10 months')).toEqual([10]);
  });

  it('should find nothing when no figure is claimed', () => {
    expect(statedPaybackMonths('The location shows promise.')).toEqual([]);
  });
});

describe('Report consistency', () => {
  it('should pass a report that agrees with itself', () => {
    expect(codes(soundReport)).toEqual([]);
  });

  it('should catch a viability claim when every scenario loses money', () => {
    // This is the failure that reached a customer: the summary promised a
    // viable 8-month payback one page before a table of negative profits.
    const issues = codes({
      ...soundReport,
      synthesis: {
        executiveSummary:
          'The project shows strong potential. Financials indicate a viable payback period of 8 months.',
        assumptions: [],
      },
      analysis: {
        financial: {
          inputs: { averageTransaction: 55000 },
          scenarios: [
            { scenarioName: 'CONSERVATIVE', isViable: false, paybackPeriodMonths: -1 },
            { scenarioName: 'BASE', isViable: false, paybackPeriodMonths: -1 },
            { scenarioName: 'UPSIDE', isViable: false, paybackPeriodMonths: -1 },
          ],
        },
      },
    });

    expect(issues).toContain('VIABILITY_CONTRADICTION');
    expect(issues).toContain('PAYBACK_MISMATCH');
  });

  it('should catch a payback figure no scenario produced', () => {
    const issues = codes({
      ...soundReport,
      synthesis: {
        executiveSummary: 'The base scenario pays back in 3 months.',
        assumptions: [],
      },
    });

    expect(issues).toContain('PAYBACK_MISMATCH');
  });

  it('should accept a payback figure that matches within rounding', () => {
    const issues = codes({
      ...soundReport,
      synthesis: {
        executiveSummary: 'The base scenario pays back in 8 months.',
        assumptions: [],
      },
    });

    // 7.9 computed against 8 claimed is a rounding difference, not a lie.
    expect(issues).not.toContain('PAYBACK_MISMATCH');
  });

  it('should catch an assumption stating a figure the model did not use', () => {
    const issues = codes({
      ...soundReport,
      synthesis: {
        executiveSummary: 'Demand is strong.',
        assumptions: ['Average ticket size remains constant at Rp 35.000'],
      },
      analysis: {
        ...soundReport.analysis,
        financial: { ...soundReport.analysis.financial, inputs: { averageTransaction: 55000 } },
      },
    });

    expect(issues).toContain('ASSUMPTION_MISMATCH');
  });

  it('should catch language the spec forbids', () => {
    for (const phrase of ['pasti balik modal', 'lokasi terbaik', 'guaranteed success']) {
      const issues = codes({
        ...soundReport,
        synthesis: { executiveSummary: `Ini ${phrase} untuk bisnis Anda.`, assumptions: [] },
      });
      expect(issues, phrase).toContain('FORBIDDEN_LANGUAGE');
    }
  });

  it('should catch a missing or altered disclaimer', () => {
    expect(codes({ ...soundReport, disclaimer: undefined })).toContain('MISSING_DISCLAIMER');
    expect(codes({ ...soundReport, disclaimer: 'We guarantee success.' }))
      .toContain('MISSING_DISCLAIMER');
  });

  it('should catch a claimed candidate count the report does not carry', () => {
    const issues = codes({
      ...soundReport,
      candidates: { shortlistedCount: 5, shortlisted: [{}] },
    });

    expect(issues).toContain('CANDIDATE_COUNT_MISMATCH');
  });

  it('should not invent problems when there are no financials yet', () => {
    const issues = codes({
      disclaimer: REPORT_DISCLAIMER_EN,
      synthesis: { executiveSummary: 'Analysis pending.', assumptions: [] },
      analysis: {},
      candidates: { shortlistedCount: 0, shortlisted: [] },
    });

    expect(issues).toEqual([]);
  });
});
