import type { JobQueue } from '@prisma/client';
import { prisma } from '../config/database.js';
import { logger } from '../lib/logger.js';
import { researchPlannerAgent } from '../agents/research-planner.agent.js';
import { candidateDiscoveryAgent } from '../agents/candidate-discovery.agent.js';
import { competitionAgent } from '../agents/competition.agent.js';
import { demandAgent } from '../agents/demand.agent.js';
import { marketGapAgent } from '../agents/market-gap.agent.js';
import { accessibilityAgent } from '../agents/accessibility.agent.js';
import { financialAgent } from '../agents/financial.agent.js';
import { scoringAgent } from '../agents/scoring.agent.js';
import { shortlistAgent } from '../agents/shortlist.agent.js';
import { reportAgent } from '../agents/report.agent.js';
import { qaAgent } from '../agents/qa.agent.js';
import { projectService } from '../services/project.service.js';
import { findMissingFinancialInputs } from '../lib/financial-inputs.js';
import { getProjectTypeConfig, checkCandidateCount } from '../lib/project-types.js';

/** Statuses a poll will pick up: fresh jobs and jobs awaiting another attempt. */
const CLAIMABLE_STATUSES = ['PENDING', 'RETRYING'];

export class QueueWorker {
  private isRunning = false;
  private pollIntervalMs = 5000;
  private pollTimer: NodeJS.Timeout | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('QueueWorker started polling');
    this.poll();
  }

  stop() {
    this.isRunning = false;
    // Without this the process keeps a pending timer alive after shutdown.
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('QueueWorker stopped');
  }

  /**
   * Take ownership of a job, or return null if another worker got there first.
   *
   * The status guard makes the claim atomic: the UPDATE only matches while the
   * row is still claimable, so two workers polling the same row cannot both
   * run it (AGENT_ORCHESTRATION_SPEC.md §3).
   */
  private async claimJob() {
    const candidate = await prisma.jobQueue.findFirst({
      where: { status: { in: CLAIMABLE_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidate) return null;

    const claimed = await prisma.jobQueue.updateMany({
      where: { id: candidate.id, status: { in: CLAIMABLE_STATUSES } },
      data: { status: 'PROCESSING', updatedAt: new Date() },
    });

    if (claimed.count === 0) {
      logger.debug({ jobId: candidate.id }, 'Job was claimed by another worker');
      return null;
    }

    return candidate;
  }

  private async poll() {
    if (!this.isRunning) return;

    try {
      const job = await this.claimJob();

      if (job) {
        logger.info(
          { jobId: job.id, type: job.type, attempt: job.attempts + 1, maxAttempts: job.maxAttempts },
          'Processing job'
        );
        await this.processJob(job);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error in QueueWorker poll loop');
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  private async processJob(job: JobQueue) {
    try {
      if (job.type === 'GENERATE_REPORT') {
        await this.runReportOrchestrator((job.payload as { projectId: string }).projectId);
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }

      await prisma.jobQueue.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', attempts: job.attempts + 1, updatedAt: new Date() },
      });
      logger.info({ jobId: job.id }, 'Job completed successfully');

    } catch (error) {
      const attempts = job.attempts + 1;
      const willRetry = attempts < job.maxAttempts;

      logger.error(
        { err: error, jobId: job.id, attempts, maxAttempts: job.maxAttempts, willRetry },
        willRetry ? 'Job failed; will retry' : 'Job failed permanently'
      );

      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: willRetry ? 'RETRYING' : 'FAILED',
          attempts,
          error: error instanceof Error ? error.stack : String(error),
          updatedAt: new Date(),
        },
      });
    }
  }

  private async runReportOrchestrator(projectId: string) {
    logger.info({ projectId }, 'Running full report pipeline');

    // Fail before spending on research and LLM calls, not eight agents later
    // (DEVELOPMENT_RULES.md §18).
    const project = await projectService.getProject(projectId);
    const config = getProjectTypeConfig(project.projectType);

    const missing = findMissingFinancialInputs(project);
    if (missing.length > 0) {
      const detail = missing.map((m) => `  - ${m.field}: ${m.reason}`).join('\n');
      throw new Error(
        `Project ${projectId} is not ready for analysis. Missing required input(s):\n${detail}`
      );
    }

    // For VALIDATION and COMPARISON the client supplies the premises, so an
    // order with none attached is incomplete rather than merely unanalysable.
    const candidateProblem = checkCandidateCount(config.type, project.candidates.length);
    if (candidateProblem) {
      throw new Error(`Project ${projectId} is not ready for analysis. ${candidateProblem.reason}`);
    }

    // Ensure project is in RESEARCH status to begin
    await projectService.updateProjectStatus(projectId, 'RESEARCH');

    // 4. Research Plan
    await researchPlannerAgent.generatePlan(projectId);

    // 5. Candidate discovery — only AREA_SCOUTING searches for its own
    // candidates. The other two already have the client's premises, and
    // discovering extra ones would answer a question nobody asked.
    if (config.runsCandidateDiscovery) {
      await candidateDiscoveryAgent.discoverCandidates(projectId);
    } else {
      logger.info(
        { projectId, projectType: config.type, clientCandidates: project.candidates.length },
        'Skipping candidate discovery; the client supplied the premises'
      );
    }

    // 6-10. Analytics
    await projectService.updateProjectStatus(projectId, 'ANALYSIS');
    await competitionAgent.analyzeCompetition(projectId);
    await demandAgent.analyzeDemand(projectId);
    await marketGapAgent.analyzeMarketGap(projectId);
    await accessibilityAgent.analyzeAccessibility(projectId);
    await financialAgent.analyzeFinancials(projectId);
    
    // 11. Scoring & Shortlisting
    await scoringAgent.scoreProject(projectId);
    await shortlistAgent.filterCandidates(projectId);

    // 12. Report Generation
    await reportAgent.generateReport(projectId);
    
    // 13. QA
    //
    // The QA agent sets the project status itself: REVIEW when the report is
    // fit for the owner, NEEDS_REVISION when it is not. Setting REVIEW here
    // unconditionally erased that verdict, leaving a rejected report looking
    // as though it were awaiting approval.
    const review = await qaAgent.reviewProject(projectId);

    logger.info(
      { projectId, qaApproved: review.isApproved, issueCount: review.issues.length },
      'Full report pipeline finished'
    );
  }
}

export const queueWorker = new QueueWorker();
