import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { createLocationProvider } from '../providers/location/index.js';
import { projectService } from '../services/project.service.js';
import { locationService } from '../services/location.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import {
  densityFromCount,
  describeCompetition,
  type CompetitionCount,
} from '../lib/competitor-types.js';
import { resolveTradeProfile } from '../lib/trade-profile.js';

export const competitionAnalysisSchema = z.object({
  directCompetitorsCount: z.number().describe('Number of direct competitors'),
  indirectCompetitorsCount: z.number().describe('Number of indirect competitors'),
  densityLevel: z
    .enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'])
    .describe('Overall density of competition in the target area'),
  competitionRisks: z.array(z.string()).describe('Specific risks posed by the competition to the business'),
  summary: z.string().describe('Executive summary of the competition analysis'),
});

export type CompetitionAnalysis = z.infer<typeof competitionAnalysisSchema> & {
  /** The measured count behind the density, so the report can show its basis. */
  count?: CompetitionCount;
  /** The count in the customer's language. */
  countExplanation?: string;
};

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
    const categories = researchPlan.competitorCategories || [];

    const profile = resolveTradeProfile([
      project.businessProfile.businessCategory,
      project.businessProfile.businessSubcategory,
      ...categories,
    ]);

    // The radius comes from the trade, not from the model.
    //
    // Two laundries in the same city were previously given 1,500 m and 2,000 m
    // because the planner invented a number each time, and catchment scales
    // with the square of it.
    const searchRadiusMeters = profile.catchmentRadiusMeters;

    // 2. Find the centre.
    //
    // The premises itself when there is one: geocoding "Jl. Tole Iskandar,
    // Depok" returns the midpoint of a four-kilometre road, and competitors
    // counted around that midpoint belong to a different neighbourhood.
    const premises = project.candidates?.[0] ?? null;
    let latitude: number;
    let longitude: number;

    if (premises) {
      latitude = premises.latitude;
      longitude = premises.longitude;
    } else {
      const targetQuery = project.locationSearch.targetArea
        ? `${project.locationSearch.targetArea}, ${project.locationSearch.targetCity}`
        : project.locationSearch.targetCity;

      const geoResult = await this.locationProvider.geocode({ address: targetQuery });
      latitude = geoResult.data.location.latitude;
      longitude = geoResult.data.location.longitude;
    }

    // 3. Search for competitors, by Google type and nearest first.
    const search = await locationService.searchCompetitorsForProject(
      projectId,
      [
        ...categories,
        project.businessProfile.businessCategory,
        project.businessProfile.businessSubcategory ?? '',
      ].filter(Boolean),
      latitude,
      longitude,
      searchRadiusMeters
    );

    const allCompetitors = search.competitors;
    const count = search.count;

    // 4. Analyze and classify competitors with AI
    const competitorSummary = allCompetitors.map(c => ({ name: c.name, category: c.category }));

    const prompt = `You are a Competition Analyst Agent.

CLASSIFICATION RULE — every business in the list was matched by Google's own
category for this trade, so treat them all as DIRECT competitors unless a name
plainly shows otherwise (for example a shoe-cleaning shop in a laundry list).
Do not split the list evenly to look balanced: the previous version reported
"10 direct and 10 indirect" for twenty businesses that were all the same type,
which was invented.

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

    const aiAnalysis = await this.aiProvider.generateStructuredData(
      prompt,
      competitionAnalysisSchema,
      'CompetitionAnalysis'
    );

    // 5. The density is measured, not judged.
    //
    // It feeds a score that feeds a recommendation, so it is computed from the
    // count (DEVELOPMENT_RULES.md §13). The model's own reading is discarded:
    // asked to rate a list of one, it answered LOW for a market that was full.
    // The counts are measured too, for the same reason the density is.
    //
    // The prompt already forbids inventing a split, and the model did it anyway:
    // a Kemang report announced "100 of 827 are direct competitors" over a list
    // where every entry had been matched by Google's own category for the trade.
    const analysis: CompetitionAnalysis = {
      ...aiAnalysis,
      directCompetitorsCount: allCompetitors.length,
      indirectCompetitorsCount: 0,
      densityLevel: densityFromCount(count),
      count,
      countExplanation: describeCompetition(count),
    };

    logger.info(
      { projectId, found: count.found, capped: count.capped, density: analysis.densityLevel },
      'Measured competition density'
    );

    await prisma.project.update({
      where: { id: projectId },
      data: { competitionAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const competitionAgent = new CompetitionAgent();
