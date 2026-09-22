import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import { REPORT_DISCLAIMER_EN } from '../lib/disclaimer.js';
import { checkReportConsistency } from '../lib/report-consistency.js';

export const qaReviewSchema = z.object({
  isApproved: z.boolean().describe('True if the reviewer found nothing worth raising.'),
  issues: z.array(z.string()).describe('Concerns worth raising with the owner.'),
  confidenceScore: z.number().min(0).max(100).describe('Confidence in the evaluation.'),
});

export type QAReviewModelOutput = z.infer<typeof qaReviewSchema>;

export interface QAReview {
  /**
   * False only when a deterministic check failed.
   *
   * The model's concerns do not block: it once rejected a sound report by
   * claiming Rp 10,000,000 per month was inconsistent with Rp 120,000,000 per
   * year. A reviewer that cannot be trusted to multiply cannot be the gate, and
   * the owner holds final authority anyway (PROJECT_MASTER_SPEC.md §35).
   */
  isApproved: boolean;
  /** Deterministic failures. Binding, and the reason a report is held back. */
  issues: string[];
  /** The model's observations, for the owner to weigh. Never blocking. */
  advisoryConcerns: string[];
  confidenceScore: number;
}

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
    const prompt = `You are a QA reviewer for a location intelligence report.
Raise anything the owner should consider before sending this to a paying customer.

REPORT:
${JSON.stringify(report.contentJson, null, 2)}

WHAT IS A DEFECT:
- The executive summary claiming something the numbers contradict, for example
  calling a location viable when every scenario shows a negative operating profit.
- A figure in the prose that does not appear anywhere in the data.
- Language promising an outcome, such as "guaranteed" or "certain to succeed".
- A conclusion drawn with no evidence behind it.

WHAT IS NOT A DEFECT — do not raise these:
- A null or "DATA NOT AVAILABLE" field. This product deliberately leaves unknown
  values empty rather than estimating them; disclosing a gap honestly is correct
  behaviour, not a fault.
- An assumption that is clearly labelled as an assumption.
- A negative or discouraging conclusion. Reporting that a location is unviable is
  the product working, not a defect.

BEFORE CLAIMING TWO NUMBERS CONTRADICT, DO THE ARITHMETIC.
A monthly rent of 10,000,000 and an annual rent of 120,000,000 agree: 10,000,000 x 12
= 120,000,000. Only report a contradiction you have actually computed.

Set isApproved false only if you found a real defect from the first list.`;

    const aiReview = await this.aiProvider.generateStructuredData<QAReviewModelOutput>(
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

    const review: QAReview = {
      // Only a deterministic failure holds a report back. The model's concerns
      // travel with it for the owner to judge.
      isApproved: consistencyIssues.length === 0,
      issues: consistencyIssues.map((i) => `[${i.code}] ${i.message}`),
      advisoryConcerns: aiReview.isApproved ? [] : aiReview.issues,
      confidenceScore: aiReview.confidenceScore,
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
        data: { status: 'REVIEW', qaReview: review as object }
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'REVIEW' }
      });
      logger.info(
        { projectId, advisoryConcerns: review.advisoryConcerns.length },
        'QA passed the report; awaiting owner approval'
      );
    } else {
      await prisma.report.update({
        where: { id: report.id },
        // Kept with the report so the owner can see what must be fixed.
        data: { status: 'DRAFT', qaReview: review as object }
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'NEEDS_REVISION' }
      });
      logger.warn({ projectId, issues: review.issues }, 'QA held the report back on a deterministic check');
    }

    return review;
  }
}

export const qaAgent = new QAAgent();
