import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { projectService } from '../services/project.service.js';
import { calculateScores, ScoringResult } from '../lib/scoring-calculator.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export const scoringExplanationSchema = z.object({
  narrative: z.string().describe('A concise narrative explaining the overall scoring and key takeaways'),
});

export type ScoringExplanation = z.infer<typeof scoringExplanationSchema>;

export interface ScoringAnalysis extends ScoringResult {
  explanation?: string;
}

export class ScoringAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

  async scoreProject(projectId: string): Promise<ScoringAnalysis> {
    logger.info({ projectId }, 'ScoringAgent scoring project');

    // 1. Fetch project with all analysis data
    const project = await projectService.getProject(projectId);

    if (!project.competitionAnalysis && !project.demandAnalysis) {
      throw new Error(`Project ${projectId} has no analysis data to score`);
    }

    // 2. Calculate deterministic scores (pure math — no AI)
    const scores = calculateScores({
      competitionAnalysis: project.competitionAnalysis as any,
      demandAnalysis: project.demandAnalysis as any,
      marketGapAnalysis: project.marketGapAnalysis as any,
      accessibilityAnalysis: project.accessibilityAnalysis as any,
      financialAnalysis: project.financialAnalysis as any,
    });

    // 3. Use AI to EXPLAIN the scores (not determine them)
    const prompt = `You are a Scoring Explanation Agent.
Write every free-text field in Indonesian (Bahasa Indonesia); the reader is an Indonesian business owner. Enum values stay in English.
The following deterministic scores have already been calculated. Your job is to provide a concise narrative summary explaining the overall scoring.
Do NOT change any scores. Only explain them.

SCORES:
${JSON.stringify(scores.dimensions, null, 2)}

OVERALL SCORE: ${scores.overallScore}/100

Provide a concise narrative.`;

    const explanationResult = await this.aiProvider.generateStructuredData(
      prompt,
      scoringExplanationSchema,
      'ScoringExplanation'
    );

    const analysis: ScoringAnalysis = {
      ...scores,
      explanation: explanationResult.narrative,
    };

    // 4. Save to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { scoringAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const scoringAgent = new ScoringAgent();
