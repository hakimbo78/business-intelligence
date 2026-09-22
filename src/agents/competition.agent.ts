import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { createLocationProvider } from '../providers/location/index.js';
import { projectService } from '../services/project.service.js';
import { locationService } from '../services/location.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export const competitionAnalysisSchema = z.object({
  directCompetitorsCount: z.number().describe('Number of direct competitors'),
  indirectCompetitorsCount: z.number().describe('Number of indirect competitors'),
  densityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Overall density of competition in the target area'),
  competitionRisks: z.array(z.string()).describe('Specific risks posed by the competition to the business'),
  summary: z.string().describe('Executive summary of the competition analysis'),
});

export type CompetitionAnalysis = z.infer<typeof competitionAnalysisSchema>;

export class CompetitionAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  async analyzeCompetition(projectId: string): Promise<CompetitionAnalysis> {
    logger.info({ projectId }, 'CompetitionAgent analyzing competition');

    // 1. Fetch project and dependencies
    const project = await projectService.getProject(projectId);
    
    if (!project.businessProfile || !project.locationSearch || !project.researchPlan) {
      throw new Error(`Project ${projectId} is missing required profiles (Business, Location, or ResearchPlan)`);
    }

    const researchPlan = project.researchPlan as any;
    const searchRadiusMeters = researchPlan.searchRadiusMeters || 3000;
    const categories = researchPlan.competitorCategories || [];

    // 2. Geocode the target area to find a center point
    const targetQuery = project.locationSearch.targetArea 
      ? `${project.locationSearch.targetArea}, ${project.locationSearch.targetCity}`
      : project.locationSearch.targetCity;
      
    const geoResult = await this.locationProvider.geocode({ address: targetQuery });
    const { latitude, longitude } = geoResult.data.location;

    // 3. Search for competitors
    const allCompetitors = [];
    for (const category of categories) {
      const result = await locationService.searchCompetitorsForProject(
        projectId,
        category,
        latitude,
        longitude,
        searchRadiusMeters
      );
      allCompetitors.push(...result.competitors);
    }

    // 4. Analyze and classify competitors with AI
    const competitorSummary = allCompetitors.map(c => ({ name: c.name, category: c.category }));

    const prompt = `You are a Competition Analyst Agent.

COUNTING RULE — the list below is ALL you may count.
It contains exactly ${competitorSummary.length} businesses. directCompetitorsCount plus
indirectCompetitorsCount must add up to ${competitorSummary.length}, and neither may
exceed it. Do not estimate a wider market: the map source caps results, so this list
is the nearest businesses, not every business in the area. Say that in the summary
rather than inventing a total.
Write every free-text field in Indonesian (Bahasa Indonesia); the reader is an Indonesian business owner. Enum values stay in English.
Analyze the following business profile and the discovered competitors in its target area.
Classify the density of the market (LOW, MEDIUM, HIGH) and identify direct vs indirect competitors.

BUSINESS PROFILE:
${JSON.stringify(project.businessProfile, null, 2)}

DISCOVERED COMPETITORS:
${JSON.stringify(competitorSummary, null, 2)}

Provide a structured competition analysis.`;

    const analysis = await this.aiProvider.generateStructuredData(prompt, competitionAnalysisSchema, 'CompetitionAnalysis');

    // 5. Save the analysis to the project
    await prisma.project.update({
      where: { id: projectId },
      data: { competitionAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const competitionAgent = new CompetitionAgent();
