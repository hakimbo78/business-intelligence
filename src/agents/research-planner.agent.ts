import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { projectService } from '../services/project.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export const researchPlanSchema = z.object({
  competitorCategories: z.array(z.string()).describe('List of competitor search queries (e.g. ["cafe", "coffee shop"])'),
  searchRadiusMeters: z.number().describe('Recommended search radius in meters (e.g. 3000)'),
  candidateSearchQueries: z.array(z.string()).describe('Search queries used to discover candidate properties / micro-locations (e.g. ["ruko disewakan", "commercial space for rent"])'),
  requiredDataSources: z.array(z.string()).describe('List of data sources needed (e.g. ["google_places", "demographics"])'),
  estimatedAPICalls: z.number().describe('Estimated number of API calls needed for this research'),
  rationale: z.string().describe('Explanation of why this research strategy was chosen based on the business profile'),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export class ResearchPlannerAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

  /**
   * Generates a research plan for a given project based on its business profile and location search.
   */
  async generatePlan(projectId: string): Promise<ResearchPlan> {
    logger.info({ projectId }, 'ResearchPlannerAgent generating plan');
    
    // 1. Fetch project details
    const project = await projectService.getProject(projectId);
    if (!project.businessProfile) {
      throw new Error(`Project ${projectId} has no business profile. Cannot generate research plan.`);
    }

    // 2. Prepare the prompt
    const prompt = `You are a Research Planner Agent for a Location Decision Intelligence platform.
Your task is to analyze the business profile and target location, and generate an optimal research strategy.
A small business (e.g., small coffee shop) needs a smaller search radius (e.g. 1000m-2000m) than a destination restaurant (e.g. 5000m).

BUSINESS PROFILE:
${JSON.stringify(project.businessProfile, null, 2)}

LOCATION SEARCH:
${JSON.stringify(project.locationSearch || {}, null, 2)}

Provide a logical, cost-efficient research strategy.`;

    // 3. Generate plan
    const plan = await this.aiProvider.generateStructuredData(prompt, researchPlanSchema, 'ResearchPlan');

    // 4. Save plan to database
    await prisma.project.update({
      where: { id: projectId },
      data: { researchPlan: plan as any },
    });

    return plan;
  }
}

export const researchPlannerAgent = new ResearchPlannerAgent();
