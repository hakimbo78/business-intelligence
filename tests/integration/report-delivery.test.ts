import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '@/app.js';
import { prisma } from '@/config/database.js';
import { FastifyInstance } from 'fastify';

/**
 * Delivery. A report is the thing the client paid for, but only once the owner
 * has approved it (BUILD_ROADMAP.md Phase 14).
 *
 * These run as the owner (AUTH_DISABLED), so client visibility is exercised by
 * driving the report's status and asserting on what the rule allows.
 */
describe('Report delivery', () => {
  let app: FastifyInstance;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const client = await prisma.client.create({
      data: { name: 'Delivery Client', email: 'delivery.test@example.com' },
    });

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: 'Delivery Test',
        projectType: 'VALIDATION',
        locationSearch: { create: { targetCity: 'Jakarta Selatan' } },
      },
    });
    projectId = project.id;

    await prisma.report.create({
      data: {
        projectId,
        version: '1.0',
        status: 'REVIEW',
        contentJson: {
          projectMeta: { projectId, projectName: 'Delivery Test', generatedAt: new Date().toISOString() },
          disclaimer: 'This report is an analytical decision-support product.',
          synthesis: {
            executiveSummary: 'A concise summary.',
            methodology: 'How it was done.',
            assumptions: ['Rent verified on site'],
            validationChecklist: ['Count footfall at peak hours'],
          },
          candidates: { totalIdentified: 1, shortlistedCount: 1, shortlisted: [] },
          analysis: {
            scoring: { overallScore: 76 },
            financial: {
              scenarios: [
                {
                  scenarioName: 'BASE',
                  effectiveCustomersPerDay: 100,
                  monthlyRevenue: 91_000_000,
                  operatingProfit: 44_150_000,
                  paybackPeriodMonths: 7.9,
                  isViable: true,
                },
              ],
            },
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { email: 'delivery.test@example.com' } });
    await app.close();
  });

  it('should let the owner read a report still under review', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/report`,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).status).toBe('REVIEW');
  });

  it('should render a PDF of the approved report', async () => {
    await prisma.report.updateMany({ where: { projectId }, data: { status: 'APPROVED' } });

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/report.pdf`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('.pdf');

    // A real PDF, not an error page: every PDF starts with %PDF.
    expect(response.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect(response.rawPayload.length).toBeGreaterThan(1000);
  }, 60_000);

  it('should 404 the PDF when no report exists', async () => {
    const other = await prisma.project.create({
      data: {
        clientId: (await prisma.client.findFirstOrThrow({
          where: { email: 'delivery.test@example.com' },
        })).id,
        name: 'No report yet',
        projectType: 'VALIDATION',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${other.id}/report.pdf`,
    });

    expect(response.statusCode).toBe(404);
  });
});
