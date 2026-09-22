import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { projectService } from '../services/project.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export const hypothesisSchema = z.object({
  opportunity: z.string().describe('Description of the market gap or opportunity'),
  evidence: z.array(z.string()).describe('Data points from competition and demand analysis supporting this hypothesis'),
  confidenceLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Confidence in this hypothesis'),
  validationRequired: z.array(z.string()).describe('Field validation actions recommended to confirm this hypothesis'),
});

export const marketGapAnalysisSchema = z.object({
  hypotheses: z.array(hypothesisSchema).describe('List of evidence-backed hypotheses'),
  overallRecommendation: z.enum(['AVOID', 'PROCEED_WITH_CAUTION', 'STRONG_OPPORTUNITY']).describe('Final synthesized recommendation'),
  summary: z.string().describe('Short explanation of the recommendation'),
});

export type MarketGapAnalysis = z.infer<typeof marketGapAnalysisSchema>;

export class MarketGapAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

  async analyzeMarketGap(projectId: string): Promise<MarketGapAnalysis> {
    logger.info({ projectId }, 'MarketGapAgent analyzing market gap');

    // 1. Fetch project and dependencies
    const project = await projectService.getProject(projectId);
    
    if (!project.businessProfile || !project.competitionAnalysis || !project.demandAnalysis) {
      throw new Error(`Project ${projectId} is missing required data (BusinessProfile, CompetitionAnalysis, or DemandAnalysis)`);
    }

    // 2. Prepare AI prompt
    const prompt = `You are a Market Gap Analyst Agent for a Location Decision Intelligence platform.
Your task is to synthesize the following Competition Analysis and Demand Analysis to find market gaps and produce evidence-backed hypotheses.
Each hypothesis MUST include field validation requirements.

BUSINESS PROFILE:
${JSON.stringify(project.businessProfile, null, 2)}

COMPETITION ANALYSIS:
${JSON.stringify(project.competitionAnalysis, null, 2)}

DEMAND ANALYSIS:
${JSON.stringify(project.demandAnalysis, null, 2)}

Provide a structured market gap analysis.`;

    // 3. Generate Analysis
    const analysis = await this.aiProvider.generateStructuredData(prompt, marketGapAnalysisSchema, 'MarketGapAnalysis');

    // 4. Save Analysis to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { marketGapAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const marketGapAgent = new MarketGapAgent();
