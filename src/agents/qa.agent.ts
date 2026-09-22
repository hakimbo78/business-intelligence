import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import { REPORT_DISCLAIMER_EN } from '../lib/disclaimer.js';
import { checkReportConsistency } from '../lib/report-consistency.js';

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

    // 3. Deterministic gate.
    //
    // Whatever the model concludes, a report that contradicts its own numbers
    // must not pass. A generated report once claimed "a viable payback period
    // of 8 months" one page before a table showing every scenario losing
    // money; code catches that every time, judgement might not.
    const content = report.contentJson as unknown as Parameters<typeof checkReportConsistency>[0];
    const consistencyIssues = checkReportConsistency(content, REPORT_DISCLAIMER_EN);

    const issues = [...aiReview.issues, ...consistencyIssues.map((i) => `[${i.code}] ${i.message}`)];

    const review: QAReview = {
      ...aiReview,
      // A deterministic failure is binding: the model cannot approve past it.
      isApproved: aiReview.isApproved && consistencyIssues.length === 0,
      issues,
    };

    if (consistencyIssues.length > 0) {
      logger.warn(
        { projectId, codes: consistencyIssues.map((i) => i.code) },
        'Report failed deterministic consistency checks'
      );
    }

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
