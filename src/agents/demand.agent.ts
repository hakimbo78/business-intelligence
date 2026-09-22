import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { projectService } from '../services/project.service.js';
import { demographicProvider } from '../providers/demographics/mock-demographic-provider.js';
import { trendsProvider } from '../providers/trends/mock-trends-provider.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export const demandAnalysisSchema = z.object({
  demandSignal: z.enum(['WEAK', 'MODERATE', 'STRONG']).describe('Overall demand strength'),
  customerFit: z.string().describe('Explanation of how well the local demographics fit the business target audience'),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Confidence level in this assessment'),
  evidence: z.array(z.string()).describe('Specific data points supporting this analysis'),
});

export type DemandAnalysis = z.infer<typeof demandAnalysisSchema>;

export class DemandAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

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

    // 2. Gather signals from providers
    const demographics = await demographicProvider.getDemographicData(targetArea);
    const searchInterest = await trendsProvider.getSearchInterest(project.businessProfile.businessCategory, targetArea);

    // 3. Prepare AI prompt
    const prompt = `You are a Demand Analyst Agent for a Location Decision Intelligence platform.
Write every free-text field in Indonesian (Bahasa Indonesia); the reader is an Indonesian business owner. Enum values stay in English.
Your task is to analyze the demographic data and search interest trends to evaluate the demand potential for the given business.
Determine the demandSignal, customerFit, confidence, and provide evidence.

DISCLAIMER: ${searchInterest.disclaimer}

BUSINESS PROFILE:
${JSON.stringify(project.businessProfile, null, 2)}

DEMOGRAPHIC DATA:
${JSON.stringify(demographics, null, 2)}

TRENDS DATA (Search Interest):
${JSON.stringify(searchInterest, null, 2)}

Provide a structured demand analysis.`;

    // 4. Generate Analysis
    const analysis = await this.aiProvider.generateStructuredData(prompt, demandAnalysisSchema, 'DemandAnalysis');

    // 5. Save Analysis to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { demandAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const demandAgent = new DemandAgent();
