import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '@/app.js';
import { prisma } from '@/config/database.js';
import { FastifyInstance } from 'fastify';

/**
 * The three products take different paths through the pipeline, so the order
 * itself has to say which one it is.
 */
describe('Project types', () => {
  let app: FastifyInstance;
  let clientId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const client = await prisma.client.create({
      data: { name: 'Type Test Client', email: 'type.test@example.com' },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { email: 'type.test@example.com' } });
    await app.close();
  });

  const baseProject = {
    businessProfile: {
      businessName: 'Toko Uji',
      businessCategory: 'Retail',
      currentAverageTransaction: 35000,
      estimatedDailyCustomers: 100,
    },
    locationSearch: {
      targetCity: 'Jakarta Selatan',
      targetArea: 'Kemang',
      estimatedInitialInvestment: 200_000_000,
    },
  };

  it('GET /api/projects/types - should describe all three products', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/types' });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);

    expect(data.map((t: { type: string }) => t.type)).toEqual([
      'VALIDATION',
      'COMPARISON',
      'AREA_SCOUTING',
    ]);

    // Only scouting searches for its own candidates.
    const byType = Object.fromEntries(data.map((t: { type: string }) => [t.type, t]));
    expect(byType.VALIDATION.runsCandidateDiscovery).toBe(false);
    expect(byType.AREA_SCOUTING.runsCandidateDiscovery).toBe(true);
  });

  it('POST /api/projects - should reject an unknown project type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { clientId, name: 'Bad type', projectType: 'SOMETHING_ELSE', ...baseProject },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should default to AREA_SCOUTING when the order does not say', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { clientId, name: 'Default type', ...baseProject },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload).projectType).toBe('AREA_SCOUTING');
  });

  it('should block a VALIDATION order that has no premises attached', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { clientId, name: 'Validation order', projectType: 'VALIDATION', ...baseProject },
    });
    const projectId = JSON.parse(created.payload).id;

    const readiness = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/readiness`,
    });

    expect(readiness.statusCode).toBe(200);
    const data = JSON.parse(readiness.payload);

    // The financial inputs are complete, so the blocker is the missing premises.
    expect(data.missingFinancialInputs).toEqual([]);
    expect(data.readyForAnalysis).toBe(false);
    expect(data.candidateProblem.reason).toContain('at least 1 premises');
    expect(data.deliverable).toContain('one specific premises');
  });

  it('should accept a VALIDATION order once the premises is attached', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { clientId, name: 'Validation ready', projectType: 'VALIDATION', ...baseProject },
    });
    const projectId = JSON.parse(created.payload).id;

    await prisma.locationCandidate.create({
      data: {
        projectId,
        name: 'Ruko pilihan client',
        address: 'Jl. Kemang Raya No. 1',
        latitude: -6.261,
        longitude: 106.816,
        status: 'IDENTIFIED',
      },
    });

    const readiness = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/readiness`,
    });

    const data = JSON.parse(readiness.payload);
    expect(data.readyForAnalysis).toBe(true);
    expect(data.suppliedPremises).toBe(1);
  });

  it('should require at least two premises for a COMPARISON order', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { clientId, name: 'Comparison order', projectType: 'COMPARISON', ...baseProject },
    });
    const projectId = JSON.parse(created.payload).id;

    await prisma.locationCandidate.create({
      data: {
        projectId,
        name: 'Alternatif 1',
        address: 'Jl. Kemang Raya No. 1',
        latitude: -6.261,
        longitude: 106.816,
        status: 'IDENTIFIED',
      },
    });

    const withOne = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/readiness` })).payload
    );
    expect(withOne.readyForAnalysis).toBe(false);
    expect(withOne.candidateProblem.reason).toContain('at least 2 premises');

    await prisma.locationCandidate.create({
      data: {
        projectId,
        name: 'Alternatif 2',
        address: 'Jl. Kemang Raya No. 2',
        latitude: -6.262,
        longitude: 106.817,
        status: 'IDENTIFIED',
      },
    });

    const withTwo = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/readiness` })).payload
    );
    expect(withTwo.readyForAnalysis).toBe(true);
  });

  it('should not require premises for an AREA_SCOUTING order', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { clientId, name: 'Scouting order', projectType: 'AREA_SCOUTING', ...baseProject },
    });
    const projectId = JSON.parse(created.payload).id;

    const data = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/readiness` })).payload
    );

    // The pipeline discovers them, so an empty project is ready to run.
    expect(data.readyForAnalysis).toBe(true);
    expect(data.suppliedPremises).toBe(0);
    expect(data.deliverable).toContain('micro-areas');
  });
});
