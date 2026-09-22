import { intakeAgent } from '../agents/intake.agent.js';
import { researchPlannerAgent } from '../agents/research-planner.agent.js';
import { candidateDiscoveryAgent } from '../agents/candidate-discovery.agent.js';
import { propertyRepository } from '../repositories/property.repository.js';
import { demandAgent } from '../agents/demand.agent.js';
import { competitionAgent } from '../agents/competition.agent.js';
import { marketGapAgent } from '../agents/market-gap.agent.js';
import { accessibilityAgent } from '../agents/accessibility.agent.js';
import { financialAgent } from '../agents/financial.agent.js';
import { scoringAgent } from '../agents/scoring.agent.js';
import { shortlistAgent } from '../agents/shortlist.agent.js';
import { reportAgent } from '../agents/report.agent.js';
import { qaAgent } from '../agents/qa.agent.js';
import { prisma } from '../config/database.js';
import * as fs from 'fs';
import * as path from 'path';

async function runE2E() {
  try {
    console.log('--- STARTING E2E DEMO ---');
    
    // 0. Ensure Client
    await prisma.client.upsert({
      where: { id: 'mock-client-id' },
      update: {},
      create: {
        id: 'mock-client-id',
        name: 'Mock Client',
        email: 'mock@client.com'
      }
    });
    
    // 1 & 2. Intake & Project Creation
    const { project } = await intakeAgent.processBrief('mock-client-id', 'I want to open a coffee shop in Jakarta Selatan');
    const id = project.id;
    console.log(`[1 & 2] Created Project & Completed Intake: ${id}`);

    // 3. Research Plan
    await researchPlannerAgent.generatePlan(id);
    console.log(`[3] Generated Research Plan`);

    // 4. Candidate Discovery (runs through the real provider, no hand-seeded rows)
    const discovery = await candidateDiscoveryAgent.discoverCandidates(id);
    console.log(`[4] Discovered Candidates: ${discovery.candidatesCreated} created from ${discovery.placesFound} places`);

    // 5. Simulate an agent submitting a listing. In production this arrives via
    // POST /api/properties from an agent, owner, customer or field survey —
    // the only sources PROJECT_MASTER_SPEC.md §7 permits.
    const candidatesForDemo = await prisma.locationCandidate.findMany({
      where: { projectId: id }, take: 1,
    });
    if (candidatesForDemo.length > 0) {
      await propertyRepository.submit({
        projectId: id,
        source: 'AGENT_SUBMITTED',
        sourceReference: 'demo-agent',
        address: candidatesForDemo[0].address,
        latitude: candidatesForDemo[0].latitude,
        longitude: candidatesForDemo[0].longitude,
        propertyType: 'Ruko',
        sizeSqm: 60,
        annualRent: 180_000_000,
        availability: 'AVAILABLE',
        confidence: 'MEDIUM',
      });
    }
    console.log(`[5] Submitted a permitted property listing (rent benchmark)`);

    // 6. Competition
    await competitionAgent.analyzeCompetition(id);
    console.log(`[6] Analyzed Competition`);

    // 7. Demand
    await demandAgent.analyzeDemand(id);
    console.log(`[7] Analyzed Demand`);

    // 8. Market Gap
    await marketGapAgent.analyzeMarketGap(id);
    console.log(`[8] Analyzed Market Gap`);

    // 9. Accessibility
    await accessibilityAgent.analyzeAccessibility(id);
    console.log(`[9] Analyzed Accessibility`);

    // 10. Financial
    await financialAgent.analyzeFinancials(id);
    console.log(`[10] Analyzed Financials`);

    // 11. Scoring
    await scoringAgent.scoreProject(id);
    console.log(`[11] Generated Scores`);

    // 12. Shortlist
    await shortlistAgent.filterCandidates(id);
    console.log(`[12] Shortlisted Candidates`);

    // 13. Report
    const report = await reportAgent.generateReport(id);
    console.log(`[13] Generated Report`);

    // 14. QA
    await qaAgent.reviewProject(id);
    console.log(`[14] QA Review Completed`);

    // Save Output
    const outputPath = path.resolve(process.argv[2] ?? 'latest-report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log('\n--- SUCCESS ---');
    console.log('Report saved to', outputPath);

  } catch (err) {
    console.error('Error during E2E:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runE2E();
