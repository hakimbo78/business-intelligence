import * as fs from 'fs';
import * as path from 'path';
import { renderReportPdf } from '../services/report-pdf.service.js';

/**
 * Render a stored Location Intelligence Report to PDF.
 *
 * Usage: tsx src/scripts/generate-pdf.ts [input.json] [output.pdf]
 *
 * Section headings are bilingual because they are fixed labels. Report CONTENT
 * is rendered exactly once, from the report itself — never duplicated into a
 * hand-written Indonesian column, which would present fabricated findings to
 * the customer (DEVELOPMENT_RULES.md §9).
 */

async function generateReportPDF() {
  const jsonPath = path.resolve(process.argv[2] ?? 'latest-report.json');
  const pdfPath = path.resolve(process.argv[3] ?? 'latest-report.pdf');

  if (!fs.existsSync(jsonPath)) {
    console.error('Report JSON not found at:', jsonPath);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log('Rendering...');
  fs.writeFileSync(pdfPath, await renderReportPdf(report));

  console.log('PDF generated successfully at:', pdfPath);
}

generateReportPDF().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
