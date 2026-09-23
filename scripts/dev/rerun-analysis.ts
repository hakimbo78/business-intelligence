/**
 * Re-run the analysis for an existing project with the client's original
 * inputs, and render the PDF.
 *
 * Exists so a change to the pipeline can be judged against a real order rather
 * than a fixture: run it before and after, and compare the two reports.
 *
 *   RERUN_PROJECT_ID=<uuid> RERUN_OUT=<path.pdf> npx tsx scripts/dev/rerun-analysis.ts
 */
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/environment.js';
import { createLocationProvider } from '../../src/providers/location/index.js';
import { competitionAgent } from '../../src/agents/competition.agent.js';
import { demandAgent } from '../../src/agents/demand.agent.js';
import { marketGapAgent } from '../../src/agents/market-gap.agent.js';
import { accessibilityAgent } from '../../src/agents/accessibility.agent.js';
import { financialAgent } from '../../src/agents/financial.agent.js';
import { scoringAgent } from '../../src/agents/scoring.agent.js';
import { reportAgent } from '../../src/agents/report.agent.js';
import { renderReportPdf } from '../../src/services/report-pdf.service.js';
import { writeFile } from 'node:fs/promises';

const projectId = process.env.RERUN_PROJECT_ID;
const out = process.env.RERUN_OUT;

async function main() {
  if (!projectId || !out) {
    throw new Error('Set RERUN_PROJECT_ID and RERUN_OUT.');
  }

  // Competitors found by an earlier run would otherwise be counted again.
  await prisma.competitor.deleteMany({ where: { projectId } });

  // Backfill the geocode precision that older runs discarded.
  const candidate = await prisma.locationCandidate.findFirst({ where: { projectId } });
  if (candidate && !candidate.geocodePrecision) {
    const geo = await createLocationProvider(env.MAP_PROVIDER).geocode({
      address: candidate.address,
    });
    await prisma.locationCandidate.update({
      where: { id: candidate.id },
      data: {
        geocodePrecision: geo.data.precision ?? null,
        geocodedRoadName: geo.data.roadName ?? null,
      },
    });
    console.log(`precision: ${geo.data.precision} | road: ${geo.data.roadName}`);
  }

  const competition = await competitionAgent.analyzeCompetition(projectId);
  console.log(
    `competition: density=${competition.densityLevel} found=${competition.count?.found} capped=${competition.count?.capped}`
  );

  await demandAgent.analyzeDemand(projectId);
  await marketGapAgent.analyzeMarketGap(projectId);
  await accessibilityAgent.analyzeAccessibility(projectId);
  await financialAgent.analyzeFinancials(projectId);

  const scoring = await scoringAgent.scoreProject(projectId);
  console.log(`scoring: overall=${scoring.overallScore} caps=${scoring.caps.length}`);

  const report = await reportAgent.generateReport(projectId);
  await writeFile(out, await renderReportPdf(report));
  console.log(`report written: ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
