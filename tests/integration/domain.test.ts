import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/config/database.js';
import { projectRepository } from '@/repositories/project.repository.js';
import { candidateRepository } from '@/repositories/candidate.repository.js';

describe('Domain Model Integration', () => {
  let clientId: string;
  let projectId: string;

  beforeAll(async () => {
    // Create a base client
    const client = await prisma.client.create({
      data: {
        name: 'Test Client',
        email: 'test@example.com',
      },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.client.deleteMany();
  });

  it('should create a project with a business profile and location search', async () => {
    const project = await projectRepository.createProject({
      clientId,
      name: 'Expansion Project Q4',
      businessProfile: {
        businessName: 'Kopi Kenangan',
        businessCategory: 'F&B',
        currentBranchCount: 15,
        estimatedDailyCustomers: 200,
      },
      locationSearch: {
        targetCity: 'Jakarta Selatan',
        targetArea: 'Kemang',
        preferredRadius: 2000, // 2km
        maximumMonthlyRent: 15000000,
      }
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Expansion Project Q4');
    expect(project.businessProfile).toBeDefined();
    expect(project.businessProfile?.businessName).toBe('Kopi Kenangan');
    expect(project.locationSearch).toBeDefined();
    expect(project.locationSearch?.targetCity).toBe('Jakarta Selatan');

    projectId = project.id;
  });

  it('should retrieve project by ID with all relations', async () => {
    const project = await projectRepository.getProjectById(projectId);
    expect(project).toBeDefined();
    expect(project?.businessProfile?.businessCategory).toBe('F&B');
    expect(project?.locationSearch?.preferredRadius).toBe(2000);
  });

  it('should create a location candidate and a competitor with PostGIS geometries', async () => {
    // 1. Create Candidate
    const candidate = await candidateRepository.createCandidate({
      projectId,
      name: 'Kemang Raya 15',
      address: 'Jl. Kemang Raya No. 15, Jakarta Selatan',
      latitude: -6.261,
      longitude: 106.816,
    });

    expect(candidate.id).toBeDefined();
    expect(candidate.name).toBe('Kemang Raya 15');

    // 2. Add Financial Scenario
    await candidateRepository.addFinancialScenario(candidate.id, {
      type: 'BASE',
      monthlyRevenue: 100000000,
      monthlyOperatingCost: 70000000,
      grossProfit: 30000000,
      netProfit: 15000000,
      paybackPeriodMonths: 18,
    });

    // 3. Create Competitors around candidate
    await candidateRepository.addCompetitor({
      projectId,
      name: 'Janji Jiwa Kemang',
      category: 'F&B - Coffee',
      type: 'DIRECT',
      latitude: -6.262, // Very close
      longitude: 106.817,
      distanceMeters: 150,
    });

    await candidateRepository.addCompetitor({
      projectId,
      name: 'Far Away Cafe',
      category: 'F&B - Coffee',
      type: 'DIRECT',
      latitude: -6.290, // Far away (~3km)
      longitude: 106.840,
    });

    // 4. Test PostGIS Radius Search (find competitors within 1km / 1000m)
    // The query relies on ST_DWithin
    const nearby = await candidateRepository.findCompetitorsInRadius(
      projectId, 
      candidate.latitude, 
      candidate.longitude, 
      1000
    );

    expect(nearby.length).toBeGreaterThanOrEqual(1);
    const nearbyNames = nearby.map(c => c.name);
    expect(nearbyNames).toContain('Janji Jiwa Kemang');
    expect(nearbyNames).not.toContain('Far Away Cafe');
  });
});
