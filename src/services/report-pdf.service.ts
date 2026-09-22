import puppeteer from 'puppeteer';
import { REPORT_DISCLAIMER_ID } from '../lib/disclaimer.js';
import type { StructuredReport } from '../agents/report.agent.js';
import { logger } from '../lib/logger.js';

/**
 * The report is written for Indonesian business owners, so it is rendered in
 * Indonesian throughout — labels and prose alike. Nothing is duplicated into a
 * second language column: a hand-written translation alongside generated
 * findings would be fabricated content (DEVELOPMENT_RULES.md §9).
 */

const UNAVAILABLE = 'DATA TIDAK TERSEDIA';

/** Escape untrusted text before interpolating it into HTML. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return UNAVAILABLE;
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: unknown): string {
  return typeof value === 'number' ? `Rp ${value.toLocaleString('id-ID')}` : UNAVAILABLE;
}

function list(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `<li><em>${UNAVAILABLE}</em></li>`;
  }
  return items.map((i) => `<li>${esc(i)}</li>`).join('');
}

/** Scoring dimension keys, in the words a business owner would use. */
const DIMENSION_LABEL: Record<string, string> = {
  market_fit: 'Kecocokan Pasar',
  customer_fit: 'Kecocokan Pelanggan',
  demand: 'Permintaan',
  competition: 'Kompetisi',
  gap: 'Celah Pasar',
  accessibility: 'Aksesibilitas',
  financial_fit: 'Kelayakan Finansial',
  growth: 'Potensi Pertumbuhan',
  risk: 'Risiko',
  confidence: 'Keyakinan Data',
};

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

  const occupancy =
    cost.occupancyCostRatio === null
      ? `<em>${UNAVAILABLE}</em>`
      : `${cost.occupancyCostRatio}% dari pendapatan setahun`;

  return `
      <h2>4. Properti yang Dinilai</h2>
      <div class="panel">
        <strong>${esc(premises.name)}</strong><br>
        ${esc(premises.address)}
        ${premises.propertyType ? `<br>Tipe: ${esc(premises.propertyType)}` : ''}
      </div>
      <table>
        ${row('Sewa bulanan', money(cost.monthlyRent))}
        ${row('Sewa tahunan', money(cost.annualRent))}
        ${row('Luas', cost.propertySizeSqm === null ? `<em>${UNAVAILABLE}</em>` : `${cost.propertySizeSqm} m²`)}
        ${row('Sewa per m²', money(cost.rentPerSqm))}
        ${row('Rasio biaya okupansi', occupancy)}
        ${row('Investasi lokasi awal', money(cost.estimatedLocationInvestment))}
        ${row('Tingkat keyakinan data', esc(premises.confidence))}
      </table>
      ${
        cost.missing.length > 0
          ? `<p class="note">Tidak tersedia dari informasi yang diberikan: ${esc(cost.missing.join(', '))}.</p>`
          : ''
      }`;
}

/**
 * The competitors found, named.
 *
 * "30 pesaing langsung" is a claim; a list with names and distances is evidence
 * the customer can go and verify on foot.
 */
function competitorSection(report: StructuredReport): string {
  const competitors = report.competitors ?? [];
  if (competitors.length === 0) {
    return `
      <h2>7. Pesaing di Sekitar Lokasi</h2>
      <div class="panel"><em>${UNAVAILABLE}</em></div>`;
  }

  const rows = competitors
    .map(
      (c) => `
            <tr>
              <td>${esc(c.name)}</td>
              <td>${esc(c.category)}</td>
              <td>${c.distanceMeters === null ? UNAVAILABLE : `${c.distanceMeters} m`}</td>
              <td>${c.rating === null ? '—' : esc(c.rating)}</td>
              <td>${c.reviewCount === null ? '—' : c.reviewCount.toLocaleString('id-ID')}</td>
            </tr>`
    )
    .join('');

  return `
      <h2>7. Pesaing di Sekitar Lokasi</h2>
      <p class="note">
        ${competitors.length} pesaing terdekat, diurutkan dari yang paling dekat.
        Jumlah ulasan menunjukkan seberapa ramai sebuah tempat — bukan ukuran mutlak,
        tetapi dapat Anda periksa sendiri di lapangan.
      </p>
      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Kategori</th>
            <th>Jarak</th>
            <th>Rating</th>
            <th>Ulasan</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
}

/**
 * How the overall score was reached.
 *
 * A bare "69/100" is not decision support. The ten dimensions and the evidence
 * behind each are what let the reader disagree with a score they think is wrong.
 */
function scoreSection(report: StructuredReport): string {
  const breakdown = report.scoreBreakdown ?? [];
  if (breakdown.length === 0) return '';

  const rows = breakdown
    .map((d) => {
      // Colour only at the extremes: a mid score should not read as a verdict.
      const colour = d.score >= 70 ? '#27ae60' : d.score <= 35 ? '#e74c3c' : '#7f8c8d';
      return `
            <tr>
              <td>${esc(DIMENSION_LABEL[d.dimension] ?? d.dimension)}</td>
              <td style="color:${colour};font-weight:bold">${esc(d.score)}</td>
              <td>${esc(d.evidence)}</td>
            </tr>`;
    })
    .join('');

  return `
      <h2>8. Rincian Skor</h2>
      <p class="note">
        Skor keseluruhan adalah rata-rata sepuluh dimensi di bawah ini. Setiap skor
        disertai dasar penilaiannya, sehingga Anda dapat menilai sendiri apakah
        bobotnya sesuai dengan prioritas usaha Anda.
      </p>
      <table>
        <thead>
          <tr><th>Dimensi</th><th>Skor</th><th>Dasar penilaian</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
}

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
              <td>${s.paybackPeriodMonths === -1 ? 'Tidak layak' : `${esc(s.paybackPeriodMonths)} bulan`}</td>
            </tr>`
        )
        .join('')
    : `<tr><td colspan="5"><em>${UNAVAILABLE}</em></td></tr>`;

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Laporan Intelijen Lokasi</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 40px; margin: 0; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 30px; font-size: 28px; }
        h2 { color: #2980b9; margin-top: 40px; font-size: 22px; }
        .note { font-size: 13px; color: #7f8c8d; }
        .panel { padding: 15px; background: #f9f9f9; border-radius: 8px; border-left: 4px solid #3498db; margin-bottom: 15px; }
        .warning { padding: 15px; background: #fff8e1; border-radius: 8px; border-left: 4px solid #f39c12; margin: 20px 0; font-size: 14px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #ecf0f1; padding: 20px; border-radius: 8px; margin-bottom: 40px; }
        .meta div strong { display: block; color: #2c3e50; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; }
        th { background-color: #f2f2f2; }
        .score-box { display: inline-block; padding: 10px 20px; background: #27ae60; color: white; font-size: 24px; font-weight: bold; border-radius: 8px; text-align: center; }
        .disclaimer { margin-top: 50px; padding: 20px; border: 1px solid #e74c3c; border-radius: 8px; background: #fdf3f2; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>Laporan Intelijen Lokasi</h1>

      <div class="meta">
        <div><strong>Proyek:</strong> ${esc(meta?.projectName)}</div>
        <div><strong>Bisnis:</strong> ${esc(meta?.businessName)}</div>
        <div><strong>Area Target:</strong> ${esc(meta?.targetArea)}</div>
        <div>
          <strong>Skor Keseluruhan:</strong>
          <div class="score-box">${esc(analysis.scoring?.overallScore)} / 100</div>
        </div>
        <div><strong>Dibuat:</strong> ${esc(meta?.generatedAt)}</div>
      </div>

      <h2>1. Ringkasan Eksekutif</h2>
      <div class="panel">${esc(synthesis?.executiveSummary)}</div>

      <h2>2. Metodologi</h2>
      <div class="panel">${esc(synthesis?.methodology)}</div>

      <h2>3. Permintaan &amp; Persaingan</h2>
      <div class="panel">
        <strong>Sinyal Permintaan:</strong> ${esc(analysis.demand?.demandSignal)}<br>
        <strong>Tingkat Keyakinan:</strong> ${esc(analysis.demand?.confidence)}<br>
        <strong>Kepadatan Kompetisi:</strong> ${esc(analysis.competition?.densityLevel)}
        <p>${esc(analysis.demand?.customerFit)}</p>
        <p>${esc(analysis.competition?.summary)}</p>
      </div>

      ${premisesSection(report)}

      <h2>5. Kandidat Lokasi</h2>
      <div class="panel">
        <strong>Teridentifikasi:</strong> ${esc(report.candidates?.totalIdentified)} &nbsp;|&nbsp;
        <strong>Masuk daftar pendek:</strong> ${esc(report.candidates?.shortlistedCount)}
      </div>

      <h2>6. Skenario Finansial</h2>
      <table>
        <thead>
          <tr>
            <th>Skenario</th>
            <th>Pelanggan / Hari</th>
            <th>Pendapatan Bulanan</th>
            <th>Laba Operasional</th>
            <th>Balik Modal</th>
          </tr>
        </thead>
        <tbody>${scenarioRows}</tbody>
      </table>

      <h2>Asumsi &amp; Catatan Penting</h2>
      <div class="warning">
        <ul>${list(synthesis?.assumptions)}</ul>
      </div>

      ${competitorSection(report)}

      ${scoreSection(report)}

      <h2>9. Hipotesis Celah Pasar</h2>
      <div class="panel">
        <strong>Rekomendasi Keseluruhan:</strong>
        ${esc(analysis.marketGap?.overallRecommendation)}
        <p>${esc(analysis.marketGap?.summary)}</p>
      </div>

      <h2>10. Daftar Periksa Validasi Lapangan</h2>
      <ul>${list(synthesis?.validationChecklist)}</ul>

      <div class="disclaimer">
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
