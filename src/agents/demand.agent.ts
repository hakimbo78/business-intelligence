import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { projectService } from '../services/project.service.js';
import { createLocationProvider } from '../providers/location/index.js';
import { locationContextService } from '../services/location-context.service.js';
import { describeCatchment, type LocationContext } from '../lib/location-context.js';
import { logger } from '../lib/logger.js';
import { resolveTradeProfile } from '../lib/trade-profile.js';
import { prisma } from '../config/database.js';

export const demandAnalysisSchema = z.object({
  demandSignal: z.enum(['WEAK', 'MODERATE', 'STRONG']).describe('Overall demand strength'),
  customerFit: z.string().describe('Explanation of how well the local demographics fit the business target audience'),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Confidence level in this assessment'),
  evidence: z.array(z.string()).describe('Specific data points supporting this analysis'),
});

export type DemandAnalysis = z.infer<typeof demandAnalysisSchema> & {
  locationContext?: LocationContext;
};

export class DemandAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  async analyzeDemand(projectId: string): Promise<DemandAnalysis> {
    logger.info({ projectId }, 'DemandAgent analyzing demand');

    // 1. Fetch project and dependencies
    const project = await projectService.getProject(projectId);
    
    if (!project.businessProfile || !project.locationSearch) {
      throw new Error(`Project ${projectId} is missing required profiles (Business or Location)`);
    }

    const targetArea = project.locationSearch.targetArea 
      ? `${project.locationSearch.targetArea}, ${project.locationSearch.targetCity}`
      : project.locationSearch.targetCity;

    // 2. Establish what is actually around the location.
    //
    // This used to read from a mock demographic provider that returned the same
    // figures for every location on earth — "dominant age group 25-34" was
    // printed in customer reports as a finding about their own neighbourhood.
    // Distances to real facilities can at least be verified on foot.
    //
    // Centred on the premises when the client named one: geocoding a road name
    // returns its midpoint, which on a long road is a different neighbourhood.
    const premises = project.candidates?.[0] ?? null;
    const centre =
      premises && Number.isFinite(premises.latitude) && Number.isFinite(premises.longitude)
        ? { latitude: premises.latitude, longitude: premises.longitude }
        : (await this.locationProvider.geocode({ address: targetArea })).data.location;

    // The trade decides which facilities count as demand drivers: a campus
    // matters to a laundry, an office district to a cafe.
    const profile = resolveTradeProfile([
      project.businessProfile.businessCategory,
      project.businessProfile.businessSubcategory,
    ]);

    const context = await locationContextService.describe(centre, projectId, profile);

    // 3. Prepare AI prompt
    const prompt = `You are a Demand Analyst Agent for a Location Decision Intelligence platform.
Write every free-text field in Indonesian (Bahasa Indonesia); the reader is an Indonesian business owner. Enum values stay in English.

Judge demand from WHAT IS AROUND THE LOCATION and how that fits this business.
A laundry near a campus and boarding houses has different demand from one on an
office street; a restaurant near schools trades at different hours from one near
a hospital. Reason from the distances below.

BUSINESS PROFILE:
${JSON.stringify(project.businessProfile, null, 2)}

NEAREST FACILITIES (measured from the target location, radius ${context.searchRadiusMeters} m):
${describeCatchment(context)}

WHAT WE DID NOT MEASURE — you must not claim any of it:
${context.notMeasured.map((n) => `- ${n}`).join('\n')}

Rules:
- Every item in 'evidence' must cite one of the distances above. Do not invent
  population figures, age groups, income levels, or foot traffic counts.
- confidence must be LOW or at most MEDIUM: this assessment rests on what is
  nearby, not on measured customer behaviour. Reserve HIGH for nothing here.
- If the surroundings do not suit this business, say so plainly.

Provide a structured demand analysis.`;

    // 4. Generate Analysis
    const analysis = await this.aiProvider.generateStructuredData(prompt, demandAnalysisSchema, 'DemandAnalysis');

    // 5. Save Analysis to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { demandAnalysis: { ...analysis, locationContext: context } as any },
    });

    return analysis;
  }
}

export const demandAgent = new DemandAgent();
