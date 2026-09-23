import puppeteer from 'puppeteer';
import { REPORT_DISCLAIMER_ID } from '../lib/disclaimer.js';
import { ROAD_CLASS_LABEL } from '../lib/road-context.js';
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
 * What is around the location, and what we did not measure.
 *
 * The honesty of this section is the point. A customer comparing this with a
 * telco's mobile-positioning product should learn where our evidence stops
 * from the report itself, not from being surprised later.
 */
function locationContextSection(report: StructuredReport): string {
  const context = (report.analysis as any)?.demand?.locationContext;
  if (!context?.facilities?.length) return '';

  const rows = context.facilities
    .map(
      (f: any) => `
            <tr>
              <td>${esc(f.label)}</td>
              <td>${
                f.distanceMeters === null
                  ? `<em>tidak ada dalam ${context.searchRadiusMeters} m</em>`
                  : `${f.distanceMeters} m`
              }</td>
              <td>${f.name ? esc(f.name) : '—'}</td>
            </tr>`
    )
    .join('');

  const notMeasured = (context.notMeasured ?? [])
    .map((n: string) => `<li>${esc(n)}</li>`)
    .join('');

  return `
      <h2>4. Konteks Lokasi</h2>
      <p class="note">
        Jarak ke fasilitas terdekat, diukur dari titik properti. Semua angka ini
        dapat Anda periksa sendiri di lapangan.
      </p>
      <table>
        <thead><tr><th>Fasilitas</th><th>Jarak terdekat</th><th>Nama</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${
        notMeasured
          ? `<div class="warning">
        <strong>Yang TIDAK kami ukur dalam laporan ini:</strong>
        <ul>${notMeasured}</ul>
      </div>`
          : ''
      }`;
}


/**
 * A score is a traffic light, so it must not be green while the report says the
 * business loses money. Previously the box was hardcoded green at every value.
 */
function scoreColour(score: unknown): string {
  const value = typeof score === 'number' ? score : -1;
  if (value < 0) return '#7f8c8d';
  if (value >= 70) return '#27ae60';
  if (value >= 45) return '#f39c12';
  return '#e74c3c';
}

/**
 * The accuracy warning, at the top where it belongs.
 *
 * When the client gives a road without a number, every distance in the report
 * is measured from the midpoint of that road. Burying that in a later section
 * lets the reader take the earlier numbers at face value.
 */
function precisionBanner(report: StructuredReport): string {
  const message = report.precision?.message;
  if (!message) return '';

  return `<div class="alert">${esc(message)}</div>`;
}

/** Why the overall score was held below what the dimensions averaged to. */
function capsSection(report: StructuredReport): string {
  const caps: string[] = (report.analysis as any)?.scoring?.caps ?? [];
  if (caps.length === 0) return '';

  return `
      <div class="alert">
        <strong>Mengapa skor ini dibatasi:</strong>
        <ul>${caps.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>`;
}

/**
 * An image with its caption.
 *
 * The caption is not decoration. A photograph is the most persuasive thing in
 * the report and the easiest to over-read, so nothing is shown without the
 * words that bound it.
 */
function figure(dataUri: string, caption: string): string {
  // Only ever an image we fetched and encoded ourselves; anything else would be
  // an arbitrary URL rendered inside the customer's report.
  if (!dataUri.startsWith('data:image/')) return '';

  return `
      <figure>
        <img src="${dataUri}" alt="${esc(caption)}">
        <figcaption>${esc(caption)}</figcaption>
      </figure>`;
}

/** The caveats that travel with the imagery, or the reason there is none. */
function imageryNotes(report: StructuredReport): string {
  const imagery = report.imagery;
  if (!imagery) return '';

  if (imagery.unavailableReason) {
    return `<p class="note">${esc(imagery.unavailableReason)}</p>`;
  }

  return imagery.notes.length > 0
    ? `<div class="warning"><ul>${imagery.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`
    : '';
}

/**
 * What kind of road the premises faces.
 *
 * Usually the first thing a shopfront owner wants to know, and the one thing a
 * map cannot settle on its own — so the indication is given with its basis and
 * its limits side by side.
 */
function roadSection(report: StructuredReport): string {
  const road = report.road;
  if (!road) return '';

  const colour =
    road.indicatedClass === 'MAIN_ROAD' ? '#27ae60'
      : road.indicatedClass === 'ALLEY' ? '#e74c3c'
      : '#7f8c8d';

  return `
      <h2>5. Jenis Jalan &amp; Akses</h2>
      <table>
        <tr>
          <th style="width:45%">Nama jalan</th>
          <td>${esc(road.roadName)}</td>
        </tr>
        <tr>
          <th>Perkiraan jenis jalan</th>
          <td style="color:${colour};font-weight:bold">${esc(ROAD_CLASS_LABEL[road.indicatedClass])}</td>
        </tr>
        <tr>
          <th>Dasar perkiraan</th>
          <td>${esc(road.classBasis)}</td>
        </tr>
        <tr>
          <th>Usaha terdekat di ruas jalan yang sama</th>
          <td>${esc(road.businessesOnSameRoad)} dari ${esc(road.businessesConsidered)}</td>
        </tr>
      </table>
      ${
        report.imagery?.streetView
          ? figure(
              report.imagery.streetView.dataUri,
              'Foto Google Street View ke arah titik alamat properti.'
            )
          : ''
      }
      ${imageryNotes(report)}
      ${
        road.notes.length > 0
          ? `<div class="warning"><ul>${road.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`
          : ''
      }`;
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

  const occupancy =
    cost.occupancyCostRatio === null
      ? `<em>${UNAVAILABLE}</em>`
      : `${cost.occupancyCostRatio}% dari pendapatan setahun`;

  return `
      <h2>6. Properti yang Dinilai</h2>
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
 * The threshold, rather than the projection.
 *
 * Every revenue figure descends from one number the customer guessed. Showing
 * what the business must clear — and how much room the guess leaves — turns the
 * report from "here is what your estimate implies" into "here is the bar, go
 * and check whether you can clear it".
 */
function sensitivitySection(report: StructuredReport): string {
  const s = (report.analysis as any)?.financial?.sensitivity;
  if (!s?.points?.length) return '';

  const rows = s.points
    .map((p: any) => {
      // The threshold row is the one the customer has to act on, so it is
      // marked as clearly as their own estimate.
      const highlight = p.isAssumption
        ? ' style="background:#eaf4fb;font-weight:bold"'
        : p.isBreakEven
          ? ' style="background:#fff4e0;font-weight:bold"'
          : '';
      const marker = p.isAssumption
        ? ' &larr; perkiraan Anda'
        : p.isBreakEven
          ? ' &larr; TITIK IMPAS'
          : '';
      return `
            <tr${highlight}>
              <td>${p.customersPerDay}${marker}</td>
              <td>${money(p.monthlyRevenue)}</td>
              <td style="color:${p.operatingProfit >= 0 ? '#27ae60' : '#e74c3c'}">${money(p.operatingProfit)}</td>
              <td>${p.paybackPeriodMonths === null ? 'Tidak balik modal' : `${p.paybackPeriodMonths} bulan`}</td>
            </tr>`;
    })
    .join('');

  const margin =
    s.marginOfSafetyPercent === null
      ? UNAVAILABLE
      : `${s.marginOfSafetyPercent}%`;

  const marginColour =
    s.marginOfSafetyPercent === null ? '#7f8c8d'
      : s.marginOfSafetyPercent < 0 ? '#e74c3c'
      : s.marginOfSafetyPercent < 25 ? '#f39c12'
      : '#27ae60';

  return `
      <h2>9. Titik Impas &amp; Uji Ketahanan</h2>
      <div class="panel">
        <table style="margin-top:0">
          <tr>
            <th style="width:55%">Pelanggan per hari untuk tidak rugi (titik impas)</th>
            <td style="font-size:20px;font-weight:bold">${esc(s.breakEvenCustomersPerDay)} orang/hari</td>
          </tr>
          <tr>
            <th>Perkiraan Anda</th>
            <td>${esc(s.assumedCustomersPerDay)} orang/hari</td>
          </tr>
          <tr>
            <th>Jarak aman (boleh meleset sampai)</th>
            <td style="color:${marginColour};font-weight:bold">${margin}</td>
          </tr>
        </table>
      </div>

      <p class="note">
        Tabel berikut menunjukkan apa yang terjadi jika jumlah pelanggan berbeda dari
        perkiraan Anda. Baris biru adalah perkiraan yang Anda berikan; baris oranye adalah
        titik impas — jumlah pelanggan minimum agar tidak rugi.
      </p>
      <table>
        <thead>
          <tr>
            <th>Pelanggan / hari</th>
            <th>Pendapatan bulanan</th>
            <th>Laba operasional</th>
            <th>Balik modal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="warning">
        <ul>${(s.notes ?? []).map((n: string) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>`;
}

/**
 * The competitors found, named.
 *
 * "30 pesaing langsung" is a claim; a list with names and distances is evidence
 * the customer can go and verify on foot.
 */
function competitorSection(report: StructuredReport): string {
  const competitors = report.competitors ?? [];
  const countExplanation = (report.analysis as any)?.competition?.countExplanation ?? null;
  if (competitors.length === 0) {
    return `
      <h2>10. Pesaing di Sekitar Lokasi</h2>
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
      <h2>10. Pesaing di Sekitar Lokasi</h2>
      ${
        countExplanation
          ? `<div class="panel"><strong>Hasil pengukuran:</strong> ${esc(countExplanation)}</div>`
          : ''
      }
      <p class="note">
        ${competitors.length} pesaing terdekat yang ditampilkan, diurutkan dari yang paling dekat.
        Jumlah ulasan menunjukkan seberapa ramai sebuah tempat — bukan ukuran mutlak,
        tetapi dapat Anda periksa sendiri di lapangan.
      </p>
      ${
        report.imagery?.map
          ? figure(
              report.imagery.map.dataUri,
              'Penanda merah (A) adalah properti yang dinilai; penanda biru adalah pesaing terdekat.'
            )
          : ''
      }
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
      <h2>11. Rincian Skor</h2>
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
        .score-box { display: inline-block; padding: 10px 20px; color: white; font-size: 24px; font-weight: bold; border-radius: 8px; text-align: center; }
        .alert { padding: 15px; background: #fdf3f2; border-radius: 8px; border-left: 4px solid #e74c3c; margin: 20px 0; font-size: 14px; color: #922b21; }
        figure { margin: 15px 0; }
        figure img { width: 100%; border: 1px solid #ddd; border-radius: 8px; display: block; }
        figcaption { font-size: 12px; color: #7f8c8d; margin-top: 6px; }
        .disclaimer { margin-top: 50px; padding: 20px; border: 1px solid #e74c3c; border-radius: 8px; background: #fdf3f2; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>Laporan Intelijen Lokasi</h1>
      ${precisionBanner(report)}

      <div class="meta">
        <div><strong>Proyek:</strong> ${esc(meta?.projectName)}</div>
        <div><strong>Bisnis:</strong> ${esc(meta?.businessName)}</div>
        <div><strong>Area Target:</strong> ${esc(meta?.targetArea)}</div>
        <div>
          <strong>Skor Keseluruhan:</strong>
          <div class="score-box" style="background:${scoreColour(analysis.scoring?.overallScore)}">
            ${esc(analysis.scoring?.overallScore)} / 100
          </div>
        </div>
        <div><strong>Dibuat:</strong> ${esc(meta?.generatedAt)}</div>
      </div>

      ${capsSection(report)}

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

      ${locationContextSection(report)}

      ${roadSection(report)}

      ${premisesSection(report)}

      <h2>7. Kandidat Lokasi</h2>
      <div class="panel">
        <strong>Teridentifikasi:</strong> ${esc(report.candidates?.totalIdentified)} &nbsp;|&nbsp;
        <strong>Masuk daftar pendek:</strong> ${esc(report.candidates?.shortlistedCount)}
      </div>

      <h2>8. Skenario Finansial</h2>
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

      ${sensitivitySection(report)}

      <h2>Asumsi &amp; Catatan Penting</h2>
      <div class="warning">
        <ul>${list(synthesis?.assumptions)}</ul>
      </div>

      ${competitorSection(report)}

      ${scoreSection(report)}

      <h2>12. Hipotesis Celah Pasar</h2>
      <div class="panel">
        <strong>Rekomendasi Keseluruhan:</strong>
        ${esc(analysis.marketGap?.overallRecommendation)}
        <p>${esc(analysis.marketGap?.summary)}</p>
      </div>

      <h2>13. Daftar Periksa Validasi Lapangan</h2>
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
