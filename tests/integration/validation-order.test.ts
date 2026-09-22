import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '@/app.js';
import { prisma } from '@/config/database.js';
import { FastifyInstance } from 'fastify';

/**
 * The VALIDATION product end to end: the client names one premises, and the
 * report must be about THAT premises — not about places the system found.
 */
describe('Validation order', () => {
  let app: FastifyInstance;
  let clientId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const client = await prisma.client.create({
      data: { name: 'Validation Client', email: 'validation.order@example.com' },
    });
    clientId = client.id;

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        clientId,
        name: 'Validasi Ruko Kemang',
        projectType: 'VALIDATION',
        businessProfile: {
          businessName: 'Kopi Uji',
          businessCategory: 'F&B',
          currentAverageTransaction: 35000,
          estimatedDailyCustomers: 100,
          operatingDays: 26,
          grossMargin: 0.65,
        },
        locationSearch: {
          targetCity: 'Jakarta Selatan',
          targetArea: 'Kemang',
          estimatedInitialInvestment: 350_000_000,
        },
      },
    });
    projectId = JSON.parse(created.payload).id;
  });

  afterAll(async () => {
    await prisma.propertyListing.deleteMany({ where: { address: { startsWith: 'Jl. Kemang Raya' } } });
    await prisma.client.deleteMany({ where: { email: 'validation.order@example.com' } });
    await app.close();
  });

  it('should refuse an unpermitted source for the premises', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/premises`,
      payload: {
        source: 'SCRAPED_FROM_MARKETPLACE',
        address: 'Jl. Kemang Raya No. 1',
        monthlyRent: 15_000_000,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('not permitted');
  });

  it('should attach the client premises, geocoding the address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/premises`,
      payload: {
        source: 'CUSTOMER_SUBMITTED',
        name: 'Ruko incaran client',
        address: 'Jl. Kemang Raya No. 1',
        propertyType: 'Ruko',
        sizeSqm: 60,
        // Quoted annually, as Indonesian commercial leases usually are.
        annualRent: 180_000_000,
        deposit: 45_000_000,
        availability: 'AVAILABLE',
      },
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);

    // No coordinates were supplied, so they came from geocoding the address.
    expect(data.coordinatesGeocoded).toBe(true);
    expect(data.candidate.latitude).toBeTypeOf('number');

    // The rent reached the candidate as a monthly figure.
    expect(data.candidate.estimatedRent).toBe(15_000_000);
    expect(data.candidate.propertySize).toBe(60);
    expect(data.candidate.propertyListingId).toBe(data.listing.id);

    // And it was recorded as an observation for the area benchmark.
    expect(data.listing.rentIsDerived).toBe(true);
    expect(data.listing.source).toBe('CUSTOMER_SUBMITTED');
  });

  it('should now report the order as ready for analysis', async () => {
    const data = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/readiness` })).payload
    );

    expect(data.readyForAnalysis).toBe(true);
    expect(data.suppliedPremises).toBe(1);
  });

  it('should refuse a second premises on a validation order', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/premises`,
      payload: {
        source: 'CUSTOMER_SUBMITTED',
        address: 'Jl. Kemang Raya No. 2',
        monthlyRent: 12_000_000,
      },
    });

    // Validating two premises is a comparison, which is a different product.
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('at most 1 premises');
  });

  it('should produce a report about the premises the client named', async () => {
    // Run the pipeline stages a VALIDATION order needs. Discovery is skipped:
    // the client already told us which premises to assess.
    for (const stage of [
      'research-plan',
      'competition-analysis',
      'demand-analysis',
      'market-gap-analysis',
      'accessibility-analysis',
      'financial-analysis',
      'scoring',
    ]) {
      const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/${stage}` });
      expect(res.statusCode, `${stage} failed: ${res.payload}`).toBe(201);
    }

    const shortlist = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/shortlist`,
    });
    expect(shortlist.statusCode).toBe(200);
    const funnel = JSON.parse(shortlist.payload);

    // The client's premises is assessed, never filtered out.
    expect(funnel.finalShortlisted).toBe(1);
    expect(funnel.filters.every((f: { applied: boolean }) => f.applied === false)).toBe(true);

    const report = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/report` });
    expect(report.statusCode).toBe(201);
    const data = JSON.parse(report.payload);

    expect(data.candidates.shortlistedCount).toBe(1);
    expect(data.candidates.shortlisted[0].name).toBe('Ruko incaran client');
    expect(data.disclaimer).toContain('analytical decision-support product');

    // Payback is computed from the client's own rent and investment, not defaults.
    const base = data.analysis.financial.scenarios.find(
      (s: { scenarioName: string }) => s.scenarioName === 'BASE'
    );
    expect(base.monthlyRevenue).toBe(91_000_000);
    expect(base.paybackPeriodMonths).toBeGreaterThan(0);
  });

  it('should hold the report for owner approval, not deliver it', async () => {
    const qa = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/qa` });
    expect(qa.statusCode).toBe(200);
    expect(JSON.parse(qa.payload).isApproved).toBe(true);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.status).toBe('REVIEW');
  });
});
