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
    expect(html).toContain('49.9% dari pendapatan setahun');
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

    expect(html).toContain('DATA TIDAK TERSEDIA');
    expect(html).toContain('monthly rent, property size');
    // A missing rent must never render as Rp 0.
    expect(html).not.toContain('Rp 0');
  });

  it('should leave the section out for an area scouting report', () => {
    const html = renderReportHtml({ ...(base as object), premises: null } as never);

    expect(html).not.toContain('Properti yang Dinilai');
    // The rest of the report still renders.
    expect(html).toContain('Ringkasan Eksekutif');
  });
});

describe('Competitors and scoring in the report', () => {
  it('should name the competitors rather than only counting them', () => {
    const html = renderReportHtml({
      ...(base as object),
      premises: null,
      competitors: [
        { name: 'Warung Bu Ani', category: 'restaurant', distanceMeters: 120, rating: 4.5, reviewCount: 312 },
        { name: 'RM Padang Sederhana', category: 'restaurant', distanceMeters: 480, rating: 4.1, reviewCount: 95 },
      ],
    } as never);

    // "30 pesaing" is a claim; names and distances are evidence.
    expect(html).toContain('Warung Bu Ani');
    expect(html).toContain('120 m');
    expect(html).toContain('312');
    expect(html).toContain('Pesaing di Sekitar Lokasi');
  });

  it('should show every scoring dimension with its evidence', () => {
    const html = renderReportHtml({
      ...(base as object),
      premises: null,
      scoreBreakdown: [
        { dimension: 'competition', score: 25, evidence: 'Kepadatan kompetisi TINGGI.' },
        { dimension: 'financial_fit', score: 90, evidence: 'Balik modal 5,9 bulan.' },
      ],
    } as never);

    // A bare 69/100 is not decision support; the reader must be able to disagree.
    expect(html).toContain('Rincian Skor');
    expect(html).toContain('Kompetisi');
    expect(html).toContain('Kepadatan kompetisi TINGGI.');
    expect(html).toContain('Kelayakan Finansial');
  });

  it('should say so plainly when no competitor was found', () => {
    const html = renderReportHtml({ ...(base as object), premises: null, competitors: [] } as never);
    expect(html).toContain('DATA TIDAK TERSEDIA');
  });

  it('should render the whole report in Indonesian', () => {
    const html = renderReportHtml({ ...(base as object), premises: null } as never);

    expect(html).toContain('lang="id"');
    expect(html).toContain('Laporan Intelijen Lokasi');
    expect(html).toContain('Skenario Finansial');
    expect(html).toContain('Penafian');
    // No English headings left behind.
    expect(html).not.toContain('Executive Summary');
    expect(html).not.toContain('Field Validation Checklist');
  });
});
