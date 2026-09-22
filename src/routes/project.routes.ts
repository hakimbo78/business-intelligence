import { FastifyInstance } from 'fastify';
import { projectService } from '../services/project.service.js';
import { intakeAgent } from '../agents/intake.agent.js';
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
import { CreateProjectInput } from '../repositories/project.repository.js';
import { jobService } from '../queue/job.service.js';
import { premisesService, type AttachPremisesInput } from '../services/premises.service.js';
import { PropertyNormalizationError } from '../lib/property-normalizer.js';
import { prisma } from '../config/database.js';
import {
  PROJECT_TYPES,
  getProjectTypeConfig,
  checkCandidateCount,
} from '../lib/project-types.js';
import {
  findMissingFinancialInputs,
  describeFinancialAssumptions,
  INITIAL_INVESTMENT_DEFINITION_EN,
  INITIAL_INVESTMENT_DEFINITION_ID,
} from '../lib/financial-inputs.js';

export async function projectRoutes(app: FastifyInstance) {
  /** The three products, so a client can present the right order form. */
  app.get('/types', async (_request, reply) => {
    return reply.send(PROJECT_TYPES.map((t) => getProjectTypeConfig(t)));
  });

  app.get('/', async (request, reply) => {
    try {
      const projects = await projectService.listProjects();
      return reply.send(projects);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list projects');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  app.post<{ Body: CreateProjectInput }>('/', async (request, reply) => {
    try {
      const project = await projectService.createProject(request.body);
      return reply.status(201).send(project);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create project');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  app.post<{ Body: { clientId: string, brief: string, projectType?: string } }>('/intake', async (request, reply) => {
    try {
      const { clientId, brief, projectType } = request.body;
      if (!clientId || !brief) {
        return reply.status(400).send({ error: 'clientId and brief are required' });
      }
      
      // Ensure client exists (mocking auth)
      await prisma.client.upsert({
        where: { id: clientId },
        create: { id: clientId, name: 'Mock Client', email: `${clientId}@example.com` },
        update: {}
      });

      const result = await intakeAgent.processBrief(clientId, brief, projectType);
      return reply.status(201).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to process brief intake');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const project = await projectService.getProject(request.params.id);
      return reply.send(project);
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  });

  /**
   * Report which financial inputs a project is still missing, with the wording
   * the customer should be shown when asked for them.
   */
  app.get<{ Params: { id: string } }>('/:id/readiness', async (request, reply) => {
    try {
      const project = await projectService.getProject(request.params.id);
      const missing = findMissingFinancialInputs(project);
      const config = getProjectTypeConfig(project.projectType);
      const candidateProblem = checkCandidateCount(config.type, project.candidates.length);

      return reply.send({
        readyForAnalysis: missing.length === 0 && candidateProblem === null,
        projectType: config.type,
        deliverable: config.deliverable,
        suppliedPremises: project.candidates.length,
        candidateProblem,
        missingFinancialInputs: missing,
        assumptions: describeFinancialAssumptions(project),
        definitions: {
          estimatedInitialInvestment: {
            en: INITIAL_INVESTMENT_DEFINITION_EN,
            id: INITIAL_INVESTMENT_DEFINITION_ID,
          },
        },
      });
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  });

  /**
   * Supply the financial inputs a brief did not state, so a project blocked by
   * missing data can proceed without being re-created.
   */
  app.patch<{
    Params: { id: string };
    Body: {
      estimatedInitialInvestment?: number;
      maximumInitialInvestment?: number;
      maximumMonthlyRent?: number;
      targetPropertySize?: number;
      currentAverageTransaction?: number;
      estimatedDailyCustomers?: number;
      operatingDays?: number;
      grossMargin?: number;
    };
  }>('/:id/financial-inputs', async (request, reply) => {
    try {
      const body = request.body ?? {};

      const positiveFields = [
        'estimatedInitialInvestment',
        'maximumInitialInvestment',
        'maximumMonthlyRent',
        'targetPropertySize',
        'currentAverageTransaction',
        'estimatedDailyCustomers',
        'operatingDays',
      ] as const;

      for (const field of positiveFields) {
        const value = body[field];
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
          return reply.status(400).send({ error: `${field} must be a positive number` });
        }
      }
      if (
        body.grossMargin !== undefined &&
        (typeof body.grossMargin !== 'number' || body.grossMargin <= 0 || body.grossMargin > 1)
      ) {
        return reply.status(400).send({
          error: 'grossMargin must be a decimal between 0 and 1 (e.g. 0.65 for 65%)',
        });
      }

      const project = await projectService.getProject(request.params.id);

      if (
        body.estimatedInitialInvestment !== undefined ||
        body.maximumInitialInvestment !== undefined ||
        body.maximumMonthlyRent !== undefined ||
        body.targetPropertySize !== undefined
      ) {
        if (!project.locationSearch) {
          return reply.status(409).send({ error: 'Project has no location search to update' });
        }
        await prisma.locationSearch.update({
          where: { projectId: request.params.id },
          data: {
            estimatedInitialInvestment: body.estimatedInitialInvestment,
            maximumInitialInvestment: body.maximumInitialInvestment,
            maximumMonthlyRent: body.maximumMonthlyRent,
            targetPropertySize: body.targetPropertySize,
          },
        });
      }

      if (
        body.currentAverageTransaction !== undefined ||
        body.estimatedDailyCustomers !== undefined ||
        body.operatingDays !== undefined ||
        body.grossMargin !== undefined
      ) {
        if (!project.businessProfile) {
          return reply.status(409).send({ error: 'Project has no business profile to update' });
        }
        await prisma.businessProfile.update({
          where: { projectId: request.params.id },
          data: {
            currentAverageTransaction: body.currentAverageTransaction,
            estimatedDailyCustomers: body.estimatedDailyCustomers,
            operatingDays: body.operatingDays,
            grossMargin: body.grossMargin,
          },
        });
      }

      const updated = await projectService.getProject(request.params.id);
      const missing = findMissingFinancialInputs(updated);

      return reply.send({
        readyForAnalysis: missing.length === 0,
        missingFinancialInputs: missing,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update financial inputs');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  /**
   * Attach a premises the client has chosen (VALIDATION / COMPARISON).
   * Creates the candidate the report will be about, and records the rent as an
   * observation for the area benchmark.
   */
  app.post<{ Params: { id: string }; Body: AttachPremisesInput }>(
    '/:id/premises',
    async (request, reply) => {
      try {
        const result = await premisesService.attachPremises(
          request.params.id,
          request.body ?? ({} as AttachPremisesInput)
        );
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof PropertyNormalizationError) {
          return reply.status(400).send({ error: error.message });
        }
        request.log.error({ err: error }, 'Failed to attach premises');
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  app.delete<{ Params: { id: string; candidateId: string } }>(
    '/:id/premises/:candidateId',
    async (request, reply) => {
      try {
        await premisesService.detachPremises(request.params.id, request.params.candidateId);
        return reply.status(204).send();
      } catch (error) {
        return reply.status(404).send({ error: (error as Error).message });
      }
    }
  );

  app.post<{ Params: { id: string } }>('/:id/research-plan', async (request, reply) => {
    try {
      const plan = await researchPlannerAgent.generatePlan(request.params.id);
      return reply.status(201).send(plan);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate research plan');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/discover-candidates', async (request, reply) => {
    try {
      const result = await candidateDiscoveryAgent.discoverCandidates(request.params.id);
      return reply.status(201).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to discover candidates');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/competition-analysis', async (request, reply) => {
    try {
      const analysis = await competitionAgent.analyzeCompetition(request.params.id);
      return reply.status(201).send(analysis);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to analyze competition');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/demand-analysis', async (request, reply) => {
    try {
      const analysis = await demandAgent.analyzeDemand(request.params.id);
      return reply.status(201).send(analysis);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to analyze demand');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/market-gap-analysis', async (request, reply) => {
    try {
      const analysis = await marketGapAgent.analyzeMarketGap(request.params.id);
      return reply.status(201).send(analysis);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to analyze market gap');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/accessibility-analysis', async (request, reply) => {
    try {
      const analysis = await accessibilityAgent.analyzeAccessibility(request.params.id);
      return reply.status(201).send(analysis);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to analyze accessibility');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/financial-analysis', async (request, reply) => {
    try {
      const overrides = request.body as any;
      const analysis = await financialAgent.analyzeFinancials(request.params.id, overrides);
      return reply.status(201).send(analysis);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to calculate financials');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/scoring', async (request, reply) => {
    try {
      const analysis = await scoringAgent.scoreProject(request.params.id);
      return reply.status(201).send(analysis);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to score project');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/shortlist', async (request, reply) => {
    try {
      const filters = request.body as any;
      const result = await shortlistAgent.filterCandidates(request.params.id, filters);
      return reply.status(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to shortlist candidates');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/report', async (request, reply) => {
    try {
      const report = await reportAgent.generateReport(request.params.id);
      return reply.status(201).send(report);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate report');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>('/:id/report', async (request, reply) => {
    try {
      const report = await reportAgent.getLatestReport(request.params.id);
      if (!report) {
        return reply.status(404).send({ error: 'Report not found' });
      }
      return reply.send(report);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get report');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/qa', async (request, reply) => {
    try {
      const result = await qaAgent.reviewProject(request.params.id);
      return reply.status(200).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to run QA');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  // Phase 14: Job Queue endpoint
  app.post<{ Params: { id: string } }>('/:id/generate-full-report', async (request, reply) => {
    try {
      const jobId = await jobService.enqueueJob('GENERATE_REPORT', { projectId: request.params.id });
      return reply.status(202).send({ message: 'Report generation queued', jobId });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to enqueue report generation');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.get('/jobs/:jobId', async (request: any, reply) => {
    try {
      const job = await jobService.getJobStatus(request.params.jobId);
      return reply.send(job);
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  });

  // Phase 14: Owner Approval endpoints
  app.post<{ Params: { id: string } }>('/:id/approve', async (request, reply) => {
    try {
      // The owner is the only actor that may advance a report past QA review
      // (PROJECT_MASTER_SPEC.md §35).
      const report = await prisma.report.findFirst({
        where: { projectId: request.params.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!report) {
        return reply.status(404).send({ error: 'No report to approve for this project' });
      }
      if (report.status !== 'REVIEW') {
        return reply.status(409).send({
          error: `Report is not awaiting approval (status: ${report.status})`,
        });
      }

      await prisma.report.update({
        where: { id: report.id },
        data: { status: 'APPROVED' },
      });
      await projectService.updateProjectStatus(request.params.id, 'APPROVED');
      return reply.status(200).send({ message: 'Project approved for delivery' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to approve project');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string }, Body: { reason: string } }>('/:id/reject', async (request, reply) => {
    try {
      await projectService.updateProjectStatus(request.params.id, 'NEEDS_REVISION');
      return reply.status(200).send({ message: 'Project rejected and needs revision' });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to reject project');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });
}
