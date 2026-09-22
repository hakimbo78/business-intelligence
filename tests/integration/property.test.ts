import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '@/app.js';
import { prisma } from '@/config/database.js';
import { FastifyInstance } from 'fastify';

/**
 * Property listings are no longer searched — clients supply their own premises.
 * What remains is the AREA RENT BENCHMARK: every order deposits real rents that
 * later make AREA_SCOUTING recommendations concrete (PROJECT_MASTER_SPEC.md §30).
 */
describe('Property rent benchmark', () => {
  let app: FastifyInstance;
  let projectId: string;

  const LAT = -6.261;
  const LNG = 106.816;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const client = await prisma.client.create({
      data: { name: 'Property Test Client', email: 'property.test@example.com' },
    });

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: 'Property Test Project',
        projectType: 'VALIDATION',
        locationSearch: { create: { targetCity: 'Jakarta Selatan', targetArea: 'Kemang' } },
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.propertyListing.deleteMany({ where: { address: { startsWith: 'Benchmark Suite' } } });
    await prisma.client.deleteMany({ where: { email: 'property.test@example.com' } });
    await app.close();
  });

  it('GET /api/properties/sources - should exclude scraping', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/properties/sources' });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.permittedSources.join(' ')).not.toMatch(/SCRAPE/i);
    expect(data.note).toContain('not a permitted source');
  });

  it('POST /api/properties - should reject an unpermitted source', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/properties',
      payload: {
        source: 'SCRAPED_FROM_MARKETPLACE',
        address: 'Benchmark Suite Jl. Tolak',
        latitude: LAT,
        longitude: LNG,
        monthlyRent: 5_000_000,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('not permitted');
  });

  it('POST /api/properties - should convert an annual quote to monthly and flag it', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/properties',
      payload: {
        projectId,
        source: 'CUSTOMER_SUBMITTED',
        address: 'Benchmark Suite Jl. Satu',
        latitude: LAT,
        longitude: LNG,
        propertyType: 'Ruko',
        sizeSqm: 60,
        annualRent: 180_000_000,
        availability: 'AVAILABLE',
      },
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);

    // Indonesian leases are routinely quoted per year; 180,000,000 / 12.
    expect(data.monthlyRent).toBe(15_000_000);
    expect(data.rentIsDerived).toBe(true);
  });

  it('should accumulate observed rents for an area', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/properties',
      payload: {
        source: 'FIELD_SURVEY',
        address: 'Benchmark Suite Jl. Dua',
        latitude: LAT + 0.0005,
        longitude: LNG,
        propertyType: 'Ruko',
        sizeSqm: 55,
        monthlyRent: 17_000_000,
      },
    });

    // Scoped to this test's own addresses: other suites share the database.
    const observed = await prisma.propertyListing.findMany({
      where: {
        monthlyRent: { not: null },
        address: { startsWith: 'Benchmark Suite' },
      },
      select: { monthlyRent: true },
    });

    // Two real observations is the beginning of a rent range for Kemang.
    expect(observed.length).toBe(2);
    const rents = observed.map((o) => o.monthlyRent!);
    expect(Math.min(...rents)).toBe(15_000_000);
    expect(Math.max(...rents)).toBe(17_000_000);
  });

  it('GET /api/projects/:id/properties - should include project and shared listings', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/properties`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);

    // One submitted for this project, plus whatever is in the shared pool.
    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(data.some((l: { projectId: string | null }) => l.projectId === projectId)).toBe(true);
  });

  it('POST /api/properties/:id/verify - should record field verification', async () => {
    const listing = await prisma.propertyListing.findFirst({ where: { projectId } });

    const response = await app.inject({
      method: 'POST',
      url: `/api/properties/${listing!.id}/verify`,
      payload: { confidence: 'HIGH' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);

    // A physically confirmed rent is the asset described in §30.
    expect(data.verifiedAt).not.toBeNull();
    expect(data.confidence).toBe('HIGH');
  });
});
