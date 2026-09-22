import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '@/app.js';
import { prisma } from '@/config/database.js';
import { FastifyInstance } from 'fastify';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let clientId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Create a base client
    const client = await prisma.client.create({
      data: {
        name: 'API Test Client',
        email: 'api.test@example.com',
      },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    await app.close();
    // Scoped: a bare deleteMany() cascades into other suites' projects.
    await prisma.client.deleteMany({ where: { email: 'api.test@example.com' } });
  });

  it('POST /api/projects - should create a project', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: {
        clientId,
        name: 'API Project',
        businessProfile: {
          businessName: 'Toko API',
          businessCategory: 'Retail',
          currentAverageTransaction: 35000,
          estimatedDailyCustomers: 100,
          operatingDays: 26,
          grossMargin: 0.65,
        },
        locationSearch: {
          targetCity: 'Jakarta',
          targetArea: 'Kemang',
          maximumMonthlyRent: 15000000,
          targetPropertySize: 50,
          minimumPropertySize: 50,
          maximumInitialInvestment: 200000000,
          estimatedInitialInvestment: 350000000,
        }
      },
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    expect(data.id).toBeDefined();
    expect(data.name).toBe('API Project');
    expect(data.businessProfile.businessName).toBe('Toko API');
    
    projectId = data.id;
  });

  it('GET /api/projects/:id - should retrieve the project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.name).toBe('API Project');
    expect(data.businessProfile.businessCategory).toBe('Retail');
  });

  it('POST /api/projects/intake - should process natural language brief', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/intake',
      payload: {
        clientId,
        brief: 'I want to open a cafe in Kemang with 50 sqm property and max rent 20M.',
      },
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check returned project
    expect(data.project.id).toBeDefined();
    expect(data.project.name).toBe('Expansion: Mock Coffee Shop - Kemang');
    expect(data.missingInformation).toBeInstanceOf(Array);

    // Verify it's in the DB with relations
    const dbProject = await prisma.project.findUnique({
      where: { id: data.project.id },
      include: { businessProfile: true, locationSearch: true },
    });

    expect(dbProject?.businessProfile?.businessName).toBe('Mock Coffee Shop');
    expect(dbProject?.locationSearch?.targetCity).toBe('Jakarta Selatan');
    expect(dbProject?.locationSearch?.maximumMonthlyRent).toBe(20000000);
  });

  it('POST /api/locations/search - should trigger search and save candidates', async () => {
    // The test environment uses MAP_PROVIDER="mock", so this will use MockLocationProvider
    const response = await app.inject({
      method: 'POST',
      url: '/api/locations/search',
      payload: {
        projectId,
        query: 'cafe in Kemang',
        latitude: -6.260,
        longitude: 106.815,
        radiusMeters: 2000,
      },
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check provenance
    expect(data.provenance.source).toBe('MockLocationProvider');
    expect(data.provenance.dataType).toBe('search_places');
    
    // Check candidates
    expect(data.candidates).toBeInstanceOf(Array);
    expect(data.candidates.length).toBe(2);
    expect(data.candidates[0].name).toBe('Janji Jiwa Kemang');
    expect(data.candidates[0].projectId).toBe(projectId);

    // Verify candidates are actually saved in the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: { candidates: true },
    });

    expect(dbProject?.candidates.length).toBe(2);
    expect(dbProject?.candidates[0].name).toBe('Janji Jiwa Kemang');
  });
  it('POST /api/projects/:id/research-plan - should generate research plan', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/research-plan`,
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check research plan format
    expect(data.searchRadiusMeters).toBe(3000);
    expect(data.competitorCategories).toContain('cafe');

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.researchPlan).toBeDefined();
    expect((dbProject?.researchPlan as any).searchRadiusMeters).toBe(3000);
  });

  it('POST /api/projects/:id/competition-analysis - should generate competition analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/competition-analysis`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check analysis format (mocked in AI provider)
    expect(data.densityLevel).toBe('MEDIUM');
    expect(data.directCompetitorsCount).toBe(3);

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.competitionAnalysis).toBeDefined();
    expect((dbProject?.competitionAnalysis as any).densityLevel).toBe('MEDIUM');
  });

  it('POST /api/projects/:id/demand-analysis - should generate demand analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/demand-analysis`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check analysis format (mocked in AI provider)
    expect(data.demandSignal).toBe('STRONG');
    expect(data.confidence).toBe('HIGH');

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.demandAnalysis).toBeDefined();
    expect((dbProject?.demandAnalysis as any).demandSignal).toBe('STRONG');
  });

  it('POST /api/projects/:id/market-gap-analysis - should generate market gap analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/market-gap-analysis`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check analysis format (mocked in AI provider)
    expect(data.overallRecommendation).toBe('PROCEED_WITH_CAUTION');
    expect(data.hypotheses.length).toBeGreaterThan(0);

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.marketGapAnalysis).toBeDefined();
    expect((dbProject?.marketGapAnalysis as any).overallRecommendation).toBe('PROCEED_WITH_CAUTION');
  });

  it('POST /api/projects/:id/accessibility-analysis - should generate accessibility analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/accessibility-analysis`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check analysis format (mocked in AI provider)
    expect(data.score).toBe(85);
    expect(data.parkingAvailability).toBe('ADEQUATE');

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.accessibilityAnalysis).toBeDefined();
    expect((dbProject?.accessibilityAnalysis as any).score).toBe(85);
  });

  it('GET /api/projects/:id/readiness - should report the project as analysable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/readiness`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);

    expect(data.readyForAnalysis).toBe(true);
    expect(data.missingFinancialInputs).toEqual([]);
    // The customer-facing wording travels with the requirement.
    expect(data.definitions.estimatedInitialInvestment.id).toContain('TIDAK termasuk sewa bulanan');
  });

  it('PATCH /api/projects/:id/financial-inputs - should reject a non-positive investment', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/financial-inputs`,
      payload: { estimatedInitialInvestment: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('positive number');
  });

  it('PATCH /api/projects/:id/financial-inputs - should reject a gross margin above 1', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/financial-inputs`,
      payload: { grossMargin: 65 },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('between 0 and 1');
  });

  it('PATCH /api/projects/:id/financial-inputs - should update the planned investment', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/financial-inputs`,
      payload: { estimatedInitialInvestment: 350000000 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).readyForAnalysis).toBe(true);

    const ls = await prisma.locationSearch.findUnique({ where: { projectId } });
    expect(ls?.estimatedInitialInvestment).toBe(350000000);
    // The budget ceiling is a separate field and must not be overwritten.
    expect(ls?.maximumInitialInvestment).toBe(200000000);
  });

  it('POST /api/projects/:id/financial-analysis - should generate financial analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/financial-analysis`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check deterministic output
    expect(data.scenarios).toHaveLength(3);
    expect(data.scenarios[0].scenarioName).toBe('CONSERVATIVE');
    expect(data.scenarios[1].scenarioName).toBe('BASE');
    expect(data.scenarios[2].scenarioName).toBe('UPSIDE');

    // BASE revenue = 100 × 35000 × 26 = 91,000,000
    expect(data.scenarios[1].monthlyRevenue).toBe(91000000);

    // Payback uses estimatedInitialInvestment (350M), not the 200M budget
    // ceiling: 350,000,000 / 44,150,000 = 7.9 months (the ceiling gives 4.5).
    expect(data.scenarios[1].paybackPeriodMonths).toBe(7.9);

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.financialAnalysis).toBeDefined();
    expect((dbProject?.financialAnalysis as any).scenarios).toHaveLength(3);
  });

  it('POST /api/projects/:id/scoring - should generate scoring analysis', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/scoring`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    // Check 10 dimensions
    expect(data.dimensions).toHaveLength(10);
    expect(data.overallScore).toBeGreaterThan(0);
    expect(data.explanation).toBeDefined();

    // Verify it was saved to the DB
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    expect(dbProject?.scoringAnalysis).toBeDefined();
    expect((dbProject?.scoringAnalysis as any).dimensions).toHaveLength(10);
  });

  it('POST /api/projects/:id/shortlist - should filter and shortlist candidates', async () => {
    // Clear existing candidates to avoid test pollution
    await prisma.locationCandidate.deleteMany({
      where: { projectId }
    });

    // Inject mock candidates
    await prisma.locationCandidate.createMany({
      data: [
        { projectId, name: 'Candidate 1', address: 'A', latitude: -6.261, longitude: 106.816, estimatedRent: 10000000, propertySize: 100, status: 'IDENTIFIED' },
        { projectId, name: 'Candidate 2', address: 'B', latitude: -6.261, longitude: 106.816, estimatedRent: 30000000, propertySize: 100, status: 'IDENTIFIED' }, // Fails rent (> 15M)
        { projectId, name: 'Candidate 3', address: 'C', latitude: -6.261, longitude: 106.816, estimatedRent: 10000000, propertySize: 20, status: 'IDENTIFIED' },  // Fails size (< 50)
      ]
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/shortlist`,
      payload: {
        topN: 5
      }
    });

    if (response.statusCode !== 200) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    
    expect(data.totalAnalyzed).toBe(3);
    // 1 candidate passes all filters (Candidate 1)
    expect(data.finalShortlisted).toBe(1);
    expect(data.shortlistedCandidates).toHaveLength(1);
    expect(data.shortlistedCandidates[0].name).toBe('Candidate 1');

    // Verify DB statuses
    const finalCandidates = await prisma.locationCandidate.findMany({ where: { projectId } });
    const shortlisted = finalCandidates.filter(c => c.status === 'SHORTLISTED');
    const rejected = finalCandidates.filter(c => c.status === 'REJECTED');

    expect(shortlisted).toHaveLength(1);
    expect(rejected).toHaveLength(2);
  });

  it('POST /api/projects/:id/report - should generate structured report', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/report`,
    });

    if (response.statusCode !== 201) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    
    expect(data.projectMeta.projectId).toBe(projectId);
    expect(data.synthesis.executiveSummary).toBeDefined();
    
    // Total analyzed depends on earlier tests (3 candidates created in total after clearing)
    expect(data.candidates.totalIdentified).toBe(3);
    // 1 candidate passed the shortlist test
    expect(data.candidates.shortlistedCount).toBe(1);

    // Verify DB update
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });
    // Project status should now be REVIEW
    expect(dbProject?.status).toBe('REVIEW');
  });

  it('GET /api/projects/:id/report - should retrieve the latest report', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/report`,
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    // The owner dashboard needs the report's status alongside its content.
    expect(data.status).toBe('REVIEW');
    expect(data.contentJson.projectMeta.projectId).toBe(projectId);
  });

  it('POST /api/projects/:id/qa - should pass review without delivering', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/qa`,
    });

    if (response.statusCode !== 200) {
      console.log('Error payload:', response.payload);
    }
    
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    
    expect(data.isApproved).toBe(true);

    // Verify DB update
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });
    // A QA pass clears the report for the owner but must NOT deliver it
    // (PROJECT_MASTER_SPEC.md §35, BUILD_ROADMAP.md Phase 14).
    expect(dbProject?.status).toBe('REVIEW');
  });

  it('POST /api/projects/:id/approve - owner approval advances the report', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/approve`,
    });

    expect(response.statusCode).toBe(200);

    const dbProject = await prisma.project.findUnique({ where: { id: projectId } });
    expect(dbProject?.status).toBe('APPROVED');

    const dbReport = await prisma.report.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    expect(dbReport?.status).toBe('APPROVED');
  });

  it('POST /api/projects/:id/approve - rejects a second approval', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/approve`,
    });

    // Already APPROVED, so it is no longer awaiting approval.
    expect(response.statusCode).toBe(409);
  });

  it('POST /api/projects/:id/discover-candidates - discovers without duplicating', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/discover-candidates`,
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.payload);
    expect(data.queriesRun.length).toBeGreaterThan(0);
    // Every place found is either stored once or recognised as already stored.
    expect(data.placesFound).toBe(data.candidatesCreated + data.duplicatesSkipped);
  });
});
