import { describe, it, expect } from 'vitest';
import { renderReportHtml } from '@/services/report-pdf.service.js';
import { REPORT_DISCLAIMER_EN } from '@/lib/disclaimer.js';

const base = {
  projectMeta: { projectId: 'p1', projectName: 'Validasi Ruko', generatedAt: '2026-09-22T00:00:00Z' },
  disclaimer: REPORT_DISCLAIMER_EN,
  synthesis: { executiveSummary: 'Summary', methodology: 'Method', assumptions: [], validationChecklist: [] },
  candidates: { totalIdentified: 1, shortlistedCount: 1, shortlisted: [] },
  analysis: {},
} as never;

describe('Premises section in the report', () => {
  it('should state what the property costs', () => {
    const html = renderReportHtml({
      ...(base as object),
      premises: {
        name: 'Ruko Delima Raya',
        address: 'Jl. Delima Raya No. 85, Depok',
        propertyType: 'Ruko',
        confidence: 'LOW',
        cost: {
          monthlyRent: 5_000_000,
          annualRent: 60_000_000,
          propertySizeSqm: 200,
          rentPerSqm: 25_000,
          occupancyCostRatio: 49.9,
          estimatedLocationInvestment: 105_000_000,
          missing: [],
        },
      },
    } as never);

    // A validation report must name the property it judged.
    expect(html).toContain('Ruko Delima Raya');
    expect(html).toContain('Jl. Delima Raya No. 85, Depok');

    // And the cost figures §12 calls for.
    expect(html).toContain('5.000.000');
    expect(html).toContain('60.000.000');
    expect(html).toContain('25.000');
    expect(html).toContain('49.9% of annual revenue');
    expect(html).toContain('105.000.000');
  });

  it('should say what is unavailable rather than showing a confident zero', () => {
    const html = renderReportHtml({
      ...(base as object),
      premises: {
        name: 'Ruko tanpa data',
        address: 'Somewhere',
        propertyType: null,
        confidence: 'LOW',
        cost: {
          monthlyRent: null,
          annualRent: null,
          propertySizeSqm: null,
          rentPerSqm: null,
          occupancyCostRatio: null,
          estimatedLocationInvestment: null,
          missing: ['monthly rent', 'property size'],
        },
      },
    } as never);

    expect(html).toContain('DATA NOT AVAILABLE');
    expect(html).toContain('monthly rent, property size');
    // A missing rent must never render as Rp 0.
    expect(html).not.toContain('Rp 0');
  });

  it('should leave the section out for an area scouting report', () => {
    const html = renderReportHtml({ ...(base as object), premises: null } as never);

    expect(html).not.toContain('The Premises Assessed');
    // The rest of the report still renders.
    expect(html).toContain('Executive Summary');
  });
});
