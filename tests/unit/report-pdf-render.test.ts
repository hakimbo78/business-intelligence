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

describe('Location context in the report', () => {
  it('should show measured distances and state what was not measured', () => {
    const html = renderReportHtml({
      ...(base as object),
      premises: null,
      analysis: {
        demand: {
          locationContext: {
            searchRadiusMeters: 3000,
            facilities: [
              { key: 'school', label: 'Sekolah', distanceMeters: 992, name: 'SDN Depok 1' },
              { key: 'mall', label: 'Pusat perbelanjaan', distanceMeters: null, name: null },
            ],
            notMeasured: ['Jumlah penduduk dan komposisi usia tidak diukur.'],
          },
        },
      },
    } as never);

    expect(html).toContain('Konteks Lokasi');
    expect(html).toContain('992 m');
    expect(html).toContain('SDN Depok 1');
    // An absent facility is a finding, not an omission.
    expect(html).toContain('tidak ditemukan');
    // And the limits of the evidence are stated to the customer.
    expect(html).toContain('Yang TIDAK kami ukur');
    expect(html).toContain('Jumlah penduduk dan komposisi usia tidak diukur.');
  });

  it('should leave the section out when no catchment was measured', () => {
    const html = renderReportHtml({ ...(base as object), premises: null } as never);
    expect(html).not.toContain('Konteks Lokasi');
  });
});

describe('Break-even section in the report', () => {
  const withSensitivity = (sensitivity: unknown) => renderReportHtml({
    ...(base as object),
    premises: null,
    analysis: { financial: { sensitivity } },
  } as never);

  it('should lead with the threshold, not the projection', () => {
    const html = withSensitivity({
      breakEvenCustomersPerDay: 22,
      assumedCustomersPerDay: 50,
      marginOfSafetyPercent: 56,
      points: [
        { customersPerDay: 20, monthlyRevenue: 52_000_000, operatingProfit: -2_000_000, paybackPeriodMonths: null, isViable: false, isAssumption: false },
        { customersPerDay: 50, monthlyRevenue: 130_000_000, operatingProfit: 37_000_000, paybackPeriodMonths: 6.8, isViable: true, isAssumption: true },
      ],
      notes: ['Angka 50 pelanggan/hari berasal dari perkiraan Anda sendiri.'],
    });

    expect(html).toContain('Titik Impas');
    expect(html).toContain('22 orang/hari');
    expect(html).toContain('56%');
    // The customer's own row is marked so they can find themselves in it.
    expect(html).toContain('perkiraan Anda');
    // A loss-making level shows no payback rather than a misleading number.
    expect(html).toContain('Tidak balik modal');
    expect(html).toContain('berasal dari perkiraan Anda sendiri');
  });

  it('should leave the section out when there is no sensitivity analysis', () => {
    const html = renderReportHtml({ ...(base as object), premises: null } as never);
    expect(html).not.toContain('Titik Impas');
  });
});

describe('Imagery in the report', () => {
  const road = {
    roadName: 'Jalan Delima Raya',
    indicatedClass: 'MAIN_ROAD',
    classBasis: 'Nama mengandung penanda jalan utama.',
    businessesOnSameRoad: 5,
    businessesConsidered: 12,
    addressPrecision: null,
    notes: [],
  };

  it('should show the frontage photograph alongside the road reading', () => {
    const html = renderReportHtml({
      ...(base as object),
      road,
      imagery: {
        streetView: { dataUri: 'data:image/jpeg;base64,ZZZ', captureDate: '2024-02', offsetMeters: 9 },
        map: null,
        notes: ['Foto ini diambil Google Street View pada Februari 2024.'],
        unavailableReason: null,
      },
    } as never);

    expect(html).toContain('<img src="data:image/jpeg;base64,ZZZ"');
    // The caveat has to be on the page with the picture, not elsewhere.
    expect(html).toContain('Februari 2024');
  });

  it('should pin the competitors on a map in the competitor section', () => {
    const html = renderReportHtml({
      ...(base as object),
      competitors: [
        { name: 'Kopi Kenangan', category: 'cafe', distanceMeters: 120, rating: 4.5, reviewCount: 300 },
      ],
      imagery: {
        streetView: null,
        map: { dataUri: 'data:image/png;base64,MAP', markedCompetitors: 4 },
        notes: [],
        unavailableReason: null,
      },
    } as never);

    expect(html).toContain('data:image/png;base64,MAP');
    expect(html).toContain('Penanda merah (A)');
  });

  it('should say why there is no photograph rather than leaving a gap', () => {
    const html = renderReportHtml({
      ...(base as object),
      road,
      imagery: {
        streetView: null,
        map: null,
        notes: [],
        unavailableReason: 'Foto lokasi tidak disertakan: layanan citra Google belum diaktifkan.',
      },
    } as never);

    expect(html).toContain('belum diaktifkan');
    expect(html).not.toContain('<img');
  });

  it('should refuse to render anything that is not an image we encoded', () => {
    const html = renderReportHtml({
      ...(base as object),
      road,
      imagery: {
        streetView: { dataUri: 'https://evil.example/pixel.png', captureDate: null, offsetMeters: null },
        map: null,
        notes: [],
        unavailableReason: null,
      },
    } as never);

    expect(html).not.toContain('evil.example');
  });
});

describe('Defects the Bella Casa report exposed', () => {
  it('should not print a payback period at the break-even row', () => {
    // Profit is ~0 there, so the division produced "1000 bulan".
    const html = renderReportHtml({
      ...(base as object),
      analysis: {
        financial: {
          sensitivity: {
            breakEvenCustomersPerDay: 25,
            assumedCustomersPerDay: 15,
            marginOfSafetyPercent: -66.7,
            points: [
              { customersPerDay: 25, monthlyRevenue: 32_500_000, operatingProfit: 125_000, paybackPeriodMonths: 1000, isViable: true, isAssumption: false, isBreakEven: true },
            ],
            notes: [],
          },
        },
      },
    } as never);

    expect(html).not.toContain('1000 bulan');
    expect(html).toContain('Impas — belum ada laba');
    expect(html).toContain('TITIK IMPAS');
  });

  it('should call a negative margin a shortfall, not a tolerance', () => {
    // "Jarak aman (boleh meleset sampai) -66.7%" was nonsense.
    const html = renderReportHtml({
      ...(base as object),
      analysis: {
        financial: {
          sensitivity: {
            breakEvenCustomersPerDay: 25,
            assumedCustomersPerDay: 15,
            marginOfSafetyPercent: -66.7,
            points: [
              { customersPerDay: 15, monthlyRevenue: 19_500_000, operatingProfit: -3_125_000, paybackPeriodMonths: null, isViable: false, isAssumption: true, isBreakEven: false },
            ],
            notes: [],
          },
        },
      },
    } as never);

    expect(html).toContain('Kekurangan terhadap titik impas');
    expect(html).toContain('66.7% DI BAWAH titik impas');
    expect(html).not.toContain('boleh meleset sampai</th>');
  });

  it('should list one shop once when Google holds two entries for it', () => {
    const html = renderReportHtml({
      ...(base as object),
      competitors: [
        { name: 'Novo Hill Laundry', category: 'laundry', distanceMeters: 592, rating: null, reviewCount: null },
        { name: 'Novo Hill Laundry', category: 'laundry', distanceMeters: 592, rating: 5, reviewCount: 15 },
        { name: 'Laundry Yuk', category: 'laundry', distanceMeters: 613, rating: 5, reviewCount: 3 },
      ],
    } as never);

    expect(html.match(/Novo Hill Laundry/g)).toHaveLength(1);
    expect(html).toContain('Laundry Yuk');
  });

  it('should write the enums in the language of the report', () => {
    const html = renderReportHtml({
      ...(base as object),
      analysis: {
        demand: { demandSignal: 'WEAK', confidence: 'MEDIUM' },
        competition: { densityLevel: 'HIGH' },
      },
    } as never);

    expect(html).toContain('Lemah');
    expect(html).toContain('Tinggi');
    expect(html).not.toContain('>WEAK');
    expect(html).not.toContain('>HIGH');
  });

  it('should not claim the score is the average when it was capped', () => {
    const html = renderReportHtml({
      ...(base as object),
      scoreBreakdown: [{ dimension: 'demand', score: 25, evidence: 'Sinyal permintaan lemah.' }],
      analysis: {
        scoring: {
          overallScore: 30,
          caps: ['Skor dibatasi maksimal 30 karena lokasi ini RUGI setiap bulan.'],
        },
      },
    } as never);

    expect(html).not.toContain('rata-rata sepuluh dimensi');
    expect(html).toContain('LEBIH RENDAH dari rata-rata');
  });

  it('should judge the rent against the trade rather than printing a bare ratio', () => {
    const html = renderReportHtml({
      ...(base as object),
      premises: {
        name: 'Ruko Bella Casa',
        address: 'Jl. Bella Casa Residence No.6',
        propertyType: 'Ruko',
        confidence: 'LOW',
        cost: {
          monthlyRent: 8_000_000, annualRent: 96_000_000, propertySizeSqm: 200,
          rentPerSqm: 40_000, occupancyCostRatio: 41, estimatedLocationInvestment: null, missing: [],
        },
      },
      occupancy: {
        verdict: 'DANGEROUS',
        message: 'PERINGATAN: sewa memakan 41% dari perkiraan pendapatan setahun, sementara kisaran sehat untuk laundry adalah 10-15%.',
      },
    } as never);

    expect(html).toContain('kisaran sehat untuk laundry adalah 10-15%');
  });

  it('should name the sources whose licences require it', () => {
    const html = renderReportHtml({
      ...(base as object),
      attributions: ['Data jalan © Kontributor OpenStreetMap (ODbL 1.0)'],
    } as never);

    expect(html).toContain('Sumber Data');
    expect(html).toContain('OpenStreetMap');
  });
});

describe('The decision, before the working', () => {
  it('should lead with the verdict and its conditions', () => {
    const html = renderReportHtml({
      ...(base as object),
      decision: {
        verdict: 'INVESTIGATE',
        reasons: ['Pada perkiraan pelanggan Anda sendiri, skenario dasar sudah rugi.'],
        conditions: ['Tawar sewa turun ke Rp 4.875.000 per bulan atau kurang.'],
        nextStep: 'Penuhi syarat di atas lebih dulu.',
      },
    } as never);

    expect(html).toContain('PERLU DIPERBAIKI DULU');
    expect(html).toContain('Yang harus dipenuhi lebih dulu');
    expect(html).toContain('Rp 4.875.000');

    // The decision must come before the executive summary, not after it.
    expect(html.indexOf('PERLU DIPERBAIKI DULU')).toBeLessThan(html.indexOf('Ringkasan Eksekutif'));
  });

  it('should say plainly when a location is worth the trip', () => {
    const html = renderReportHtml({
      ...(base as object),
      decision: { verdict: 'VALIDATE', reasons: [], conditions: [], nextStep: 'Lanjutkan ke daftar periksa.' },
    } as never);

    expect(html).toContain('LAYAK DISURVEI');
  });

  it('should render nothing rather than an empty box when there is no verdict', () => {
    const html = renderReportHtml({ ...(base as object) } as never);
    expect(html).not.toContain('class="verdict"');
  });
});
