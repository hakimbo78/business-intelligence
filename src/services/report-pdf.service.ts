import puppeteer from 'puppeteer';
import { REPORT_DISCLAIMER_EN, REPORT_DISCLAIMER_ID } from '../lib/disclaimer.js';
import type { StructuredReport } from '../agents/report.agent.js';
import { logger } from '../lib/logger.js';

/** Escape untrusted text before interpolating it into HTML. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return 'DATA NOT AVAILABLE';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString('id-ID') : 'DATA NOT AVAILABLE';
}

function list(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<li><em>DATA NOT AVAILABLE</em></li>';
  }
  return items.map((i) => `<li>${esc(i)}</li>`).join('');
}


/**
 * The property under assessment.
 *
 * A validation report exists to judge one premises, so its cost figures belong
 * near the front. Anything that could not be derived says so rather than
 * showing a confident zero.
 */
function premisesSection(report: StructuredReport): string {
  const premises = report.premises;
  if (!premises) return '';

  const cost = premises.cost;
  const row = (label: string, value: string) =>
    `<tr><th style="width:45%">${label}</th><td>${value}</td></tr>`;

  const rupiah = (v: number | null) =>
    v === null ? '<em>DATA NOT AVAILABLE</em>' : `Rp ${v.toLocaleString('id-ID')}`;

  const occupancy =
    cost.occupancyCostRatio === null
      ? '<em>DATA NOT AVAILABLE</em>'
      : `${cost.occupancyCostRatio}% of annual revenue`;

  return `
      <h2>4. The Premises Assessed <br><span class="sub">Properti yang Dinilai</span></h2>
      <div class="panel">
        <strong>${esc(premises.name)}</strong><br>
        ${esc(premises.address)}
        ${premises.propertyType ? `<br>Type / Tipe: ${esc(premises.propertyType)}` : ''}
      </div>
      <table>
        ${row('Monthly rent / Sewa bulanan', rupiah(cost.monthlyRent))}
        ${row('Annual rent / Sewa tahunan', rupiah(cost.annualRent))}
        ${row('Size / Luas', cost.propertySizeSqm === null ? '<em>DATA NOT AVAILABLE</em>' : `${cost.propertySizeSqm} m²`)}
        ${row('Rent per m² / Sewa per m²', rupiah(cost.rentPerSqm))}
        ${row('Occupancy cost ratio / Rasio biaya okupansi', occupancy)}
        ${row('Initial location investment / Investasi lokasi awal', rupiah(cost.estimatedLocationInvestment))}
        ${row('Data confidence / Keyakinan data', esc(premises.confidence))}
      </table>
      ${
        cost.missing.length > 0
          ? `<p class="sub">Not available from the information supplied: ${esc(cost.missing.join(', '))}.</p>`
          : ''
      }`;
}

/**
 * Render a report as HTML.
 *
 * Section headings are bilingual because they are fixed labels. Report CONTENT
 * appears exactly once, from the report itself — never duplicated into a
 * hand-written Indonesian column, which would present fabricated findings to
 * the customer (DEVELOPMENT_RULES.md §9).
 */
export function renderReportHtml(report: StructuredReport): string {
  const meta = report.projectMeta ?? ({} as StructuredReport['projectMeta']);
  const synthesis = report.synthesis ?? ({} as StructuredReport['synthesis']);
  const analysis = (report.analysis ?? {}) as Record<string, any>;
  const scenarios: any[] = analysis.financial?.scenarios ?? [];

  const scenarioRows = scenarios.length
    ? scenarios
        .map(
          (s: any) => `
            <tr>
              <td><strong>${esc(s.scenarioName)}</strong></td>
              <td>${esc(s.effectiveCustomersPerDay)}</td>
              <td>${money(s.monthlyRevenue)}</td>
              <td>${money(s.operatingProfit)}</td>
              <td>${s.paybackPeriodMonths === -1 ? 'Not viable' : esc(s.paybackPeriodMonths)}</td>
            </tr>`
        )
        .join('')
    : '<tr><td colspan="5"><em>DATA NOT AVAILABLE</em></td></tr>';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Location Intelligence Report</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 40px; margin: 0; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 30px; font-size: 28px; }
        h2 { color: #2980b9; margin-top: 40px; font-size: 22px; }
        .sub { font-size: 16px; color: #7f8c8d; font-weight: normal; }
        .panel { padding: 15px; background: #f9f9f9; border-radius: 8px; border-left: 4px solid #3498db; margin-bottom: 15px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #ecf0f1; padding: 20px; border-radius: 8px; margin-bottom: 40px; }
        .meta div strong { display: block; color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; }
        .score-box { display: inline-block; padding: 10px 20px; background: #27ae60; color: white; font-size: 24px; font-weight: bold; border-radius: 8px; text-align: center; }
        .disclaimer { margin-top: 50px; padding: 20px; border: 1px solid #e74c3c; border-radius: 8px; background: #fdf3f2; font-size: 12px; }
        .disclaimer p { margin: 0 0 10px 0; }
      </style>
    </head>
    <body>
      <h1>Location Intelligence Report <br><span class="sub">Laporan Intelijen Lokasi</span></h1>

      <div class="meta">
        <div><strong>Project / Proyek:</strong> ${esc(meta?.projectName)}</div>
        <div><strong>Business / Bisnis:</strong> ${esc(meta?.businessName)}</div>
        <div><strong>Target Area / Area Target:</strong> ${esc(meta?.targetArea)}</div>
        <div>
          <strong>Overall Score / Skor Keseluruhan:</strong>
          <div class="score-box">${esc(analysis.scoring?.overallScore)} / 100</div>
        </div>
        <div><strong>Generated / Dibuat:</strong> ${esc(meta?.generatedAt)}</div>
      </div>

      <h2>1. Executive Summary <br><span class="sub">Ringkasan Eksekutif</span></h2>
      <div class="panel">${esc(synthesis?.executiveSummary)}</div>

      <h2>2. Methodology <br><span class="sub">Metodologi</span></h2>
      <div class="panel">${esc(synthesis?.methodology)}</div>

      <h2>3. Demand &amp; Competition <br><span class="sub">Permintaan &amp; Persaingan</span></h2>
      <div class="panel">
        <strong>Demand Signal / Sinyal Permintaan:</strong> ${esc(analysis.demand?.demandSignal)}<br>
        <strong>Confidence / Tingkat Keyakinan:</strong> ${esc(analysis.demand?.confidence)}<br>
        <strong>Competition Density / Kepadatan Kompetisi:</strong> ${esc(analysis.competition?.densityLevel)}
        <p>${esc(analysis.demand?.customerFit)}</p>
        <p>${esc(analysis.competition?.summary)}</p>
      </div>

      ${premisesSection(report)}

      <h2>5. Candidate Locations <br><span class="sub">Kandidat Lokasi</span></h2>
      <div class="panel">
        <strong>Identified / Teridentifikasi:</strong> ${esc(report.candidates?.totalIdentified)} &nbsp;|&nbsp;
        <strong>Shortlisted / Masuk Daftar Pendek:</strong> ${esc(report.candidates?.shortlistedCount)}
      </div>

      <h2>6. Financial Scenarios <br><span class="sub">Skenario Finansial</span></h2>
      <table>
        <thead>
          <tr>
            <th>Scenario / Skenario</th>
            <th>Daily Customers / Pelanggan Harian</th>
            <th>Monthly Revenue / Pendapatan Bulanan (Rp)</th>
            <th>Operating Profit / Laba Operasional (Rp)</th>
            <th>Payback (months) / Balik Modal (bulan)</th>
          </tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>

      <h2>7. Key Assumptions <br><span class="sub">Asumsi Utama</span></h2>
      <ul>${list(synthesis?.assumptions)}</ul>

      <h2>8. Market Gap Hypotheses <br><span class="sub">Hipotesis Celah Pasar</span></h2>
      <div class="panel">
        <strong>Overall Recommendation / Rekomendasi Keseluruhan:</strong>
        ${esc(analysis.marketGap?.overallRecommendation)}
        <p>${esc(analysis.marketGap?.summary)}</p>
      </div>

      <h2>9. Field Validation Checklist <br><span class="sub">Daftar Periksa Validasi Lapangan</span></h2>
      <ul>${list(synthesis?.validationChecklist)}</ul>

      <div class="disclaimer">
        <p><strong>Disclaimer</strong><br>${esc(report.disclaimer ?? REPORT_DISCLAIMER_EN)}</p>
        <p><strong>Penafian</strong><br>${esc(REPORT_DISCLAIMER_ID)}</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Render a report to a PDF buffer.
 *
 * A browser is launched per call. At the volumes this product runs at — every
 * report passes through a manual payment approval — that costs a second or two
 * and avoids keeping a browser process alive for the lifetime of the server.
 */
export async function renderReportPdf(report: StructuredReport): Promise<Buffer> {
  const started = Date.now();
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(renderReportHtml(report), { waitUntil: 'load' });

    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      printBackground: true,
    });

    logger.info(
      { projectId: report.projectMeta?.projectId, durationMs: Date.now() - started },
      'Rendered report PDF'
    );

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
