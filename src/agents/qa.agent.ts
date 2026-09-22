import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import { REPORT_DISCLAIMER_EN } from '../lib/disclaimer.js';

export const qaReviewSchema = z.object({
  isApproved: z.boolean().describe('True if the report is logically sound, fully traceable, and free of hallucinations.'),
  issues: z.array(z.string()).describe('List of logic gaps, missing data, or contradictory statements found.'),
  confidenceScore: z.number().min(0).max(100).describe('Confidence in the evaluation.'),
});

export type QAReview = z.infer<typeof qaReviewSchema>;

export class QAAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

  async reviewProject(projectId: string): Promise<QAReview> {
    logger.info({ projectId }, 'QAAgent starting QA review');

    // 1. Fetch the latest report
    const report = await prisma.report.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });

    if (!report || !report.contentJson) {
      throw new Error(`No generated report found for Project ${projectId}`);
    }

    // 2. Perform AI review
    const prompt = `You are a strict QA Auditor for a business intelligence system.
Your job is to review the following generated JSON report for logical consistency, data completeness, and to ensure there are no hallucinated claims in the executive summary that contradict the raw data.

REPORT:
${JSON.stringify(report.contentJson, null, 2)}

If the report is perfectly consistent, set isApproved to true and leave issues empty.
If you find contradictory numbers, unsupported claims, or missing critical sections, set isApproved to false and list the exact issues.`;

    const aiReview = await this.aiProvider.generateStructuredData<QAReview>(
      prompt,
      qaReviewSchema,
      'QAReview'
    );

    // 3. Deterministic gate: the §28 disclaimer is mandatory and is checked in
    // code, never delegated to the model (AGENT_ORCHESTRATION_SPEC.md §15).
    const content = report.contentJson as unknown as { disclaimer?: string };
    const disclaimerPresent = content?.disclaimer === REPORT_DISCLAIMER_EN;

    const issues = [...aiReview.issues];
    if (!disclaimerPresent) {
      issues.push(
        'Mandatory legal disclaimer (PROJECT_MASTER_SPEC.md §28) is missing or has been altered.'
      );
    }

    const review: QAReview = {
      ...aiReview,
      isApproved: aiReview.isApproved && disclaimerPresent,
      issues,
    };

    // 4. Update statuses.
    //
    // A QA pass does NOT deliver the report. QA only clears it for the owner,
    // who holds final authority over customer delivery (PROJECT_MASTER_SPEC.md
    // §35, BUILD_ROADMAP.md Phase 14). Only POST /:id/approve advances beyond
    // REVIEW.
    if (review.isApproved) {
      await prisma.report.update({
        where: { id: report.id },
        data: { status: 'REVIEW' }
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'REVIEW' }
      });
      logger.info({ projectId }, 'QA Agent PASSED the report; awaiting owner approval');
    } else {
      await prisma.report.update({
        where: { id: report.id },
        data: { status: 'DRAFT' } // Revert to draft/needs revision
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'NEEDS_REVISION' }
      });
      logger.warn({ projectId, issues: review.issues }, 'QA Agent REJECTED the report');
    }

    return review;
  }
}

export const qaAgent = new QAAgent();
