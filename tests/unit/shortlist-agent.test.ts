import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shortlistAgent } from '@/agents/shortlist.agent.js';
import { projectService } from '@/services/project.service.js';
import { prisma } from '@/config/database.js';

// Mock dependencies
vi.mock('@/config/environment.js', () => ({
  env: {
    MAP_PROVIDER: 'mock',
  }
}));

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    getProject: vi.fn(),
  }
}));

vi.mock('@/providers/location/index.js', () => ({
  createLocationProvider: vi.fn().mockReturnValue({
    geocode: vi.fn().mockResolvedValue({
      data: { location: { latitude: 0, longitude: 0 } } // Center
    }),
  })
}));

vi.mock('@/config/database.js', () => ({
  prisma: {
    locationCandidate: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    }
  }
}));

describe('Shortlist Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter candidates by radius, rent, and size', async () => {
    // Center is (0,0). 1 degree lat is ~111km. 0.01 deg is ~1.1km. 
    const mockCandidates = [
      { id: '1', latitude: 0.01, longitude: 0, estimatedRent: 10, propertySize: 100, status: 'IDENTIFIED' }, // Passes (Dist: ~1.1km, Rent <= 15, Size >= 50)
      { id: '2', latitude: 0.1, longitude: 0, estimatedRent: 10, propertySize: 100, status: 'IDENTIFIED' },  // Fails radius (~11km > 5km)
      { id: '3', latitude: 0, longitude: 0, estimatedRent: 20, propertySize: 100, status: 'IDENTIFIED' },    // Fails rent (20 > 15)
      { id: '4', latitude: 0, longitude: 0, estimatedRent: 10, propertySize: 30, status: 'IDENTIFIED' },     // Fails size (30 < 50)
      { id: '5', latitude: 0.02, longitude: 0, estimatedRent: null, propertySize: null, status: 'IDENTIFIED' }, // Passes (Optimistic nulls, Dist: ~2.2km)
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'AREA_SCOUTING',
      locationSearch: {
        targetCity: 'Origin',
        preferredRadius: 5000,
        maximumMonthlyRent: 15,
        minimumPropertySize: 50,
      }
    });

    (prisma.locationCandidate.findMany as any).mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce([mockCandidates[0], mockCandidates[4]]); // DB refresh

    const result = await shortlistAgent.filterCandidates('mock-project-id');

    expect(result.totalAnalyzed).toBe(5);
    
    // Only '1', '3', '4', '5' pass radius
    expect(result.passedRadiusFilter).toBe(4);
    
    // Of those, '1', '4', '5' pass rent ('3' fails rent)
    expect(result.passedRentFilter).toBe(3);
    
    // Of those, '1', '5' pass size ('4' fails size)
    expect(result.passedSizeFilter).toBe(2);

    expect(result.finalShortlisted).toBe(2);

    // Check DB updates
    expect(prisma.locationCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['1', '5'] } },
        data: { status: 'SHORTLISTED' }
      })
    );

    expect(prisma.locationCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['2', '3', '4'] } },
        data: { status: 'REJECTED' }
      })
    );
  });

  it('should slice to top N based on rent', async () => {
    const mockCandidates = [
      { id: '1', latitude: 0, longitude: 0, estimatedRent: 30, propertySize: 100, status: 'IDENTIFIED' }, // 3rd best
      { id: '2', latitude: 0, longitude: 0, estimatedRent: 10, propertySize: 100, status: 'IDENTIFIED' }, // 1st best
      { id: '3', latitude: 0, longitude: 0, estimatedRent: 20, propertySize: 100, status: 'IDENTIFIED' }, // 2nd best
      { id: '4', latitude: 0, longitude: 0, estimatedRent: 40, propertySize: 100, status: 'IDENTIFIED' }, // 4th
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'AREA_SCOUTING',
      locationSearch: {} // No limits, use defaults
    });

    (prisma.locationCandidate.findMany as any).mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce([]); // mock refresh

    // Force TopN = 2
    const result = await shortlistAgent.filterCandidates('mock-project-id', { topN: 2 });

    expect(result.passedSizeFilter).toBe(4);
    expect(result.finalShortlisted).toBe(2);

    // Should shortlist '2' and '3'
    expect(prisma.locationCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['2', '3'] } },
        data: { status: 'SHORTLISTED' }
      })
    );
  });

  it('should reject candidates whose location cost alone exceeds the ceiling', async () => {
    const mockCandidates = [
      // deposit 3 x 10 = 30, renovation 10 x 1 = 10 -> 40, within the 100 ceiling
      { id: 'affordable', latitude: 0, longitude: 0, estimatedRent: 10, propertySize: 10, status: 'IDENTIFIED' },
      // deposit 3 x 50 = 150 -> already over the ceiling on its own
      { id: 'too-expensive', latitude: 0, longitude: 0, estimatedRent: 50, propertySize: 10, status: 'IDENTIFIED' },
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'AREA_SCOUTING',
      locationSearch: { targetCity: 'Origin', maximumInitialInvestment: 100 },
    });

    (prisma.locationCandidate.findMany as any)
      .mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce([mockCandidates[0]]);

    const result = await shortlistAgent.filterCandidates('mock-project-id', {
      depositMonths: 3,
      renovationCostPerSqm: 1,
    });

    expect(result.passedInvestmentFilter).toBe(1);

    const investmentFilter = result.filters.find((f) => f.filter === 'initial_investment');
    expect(investmentFilter?.applied).toBe(true);
    expect(investmentFilter?.notEvaluated).toBe(0);

    // The estimate is persisted so the report can explain the cost.
    expect(prisma.locationCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'affordable' },
        data: { estimatedLocationInvestment: 40 },
      })
    );

    // Assumptions are surfaced, not buried.
    expect(result.assumptions.join(' ')).toContain('3 months of rent');
  });

  it('should report the investment filter as inert when no cost assumptions exist', async () => {
    const mockCandidates = [
      { id: '1', latitude: 0, longitude: 0, estimatedRent: 10, propertySize: 10, status: 'IDENTIFIED' },
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'AREA_SCOUTING',
      locationSearch: { targetCity: 'Origin', maximumInitialInvestment: 100 },
    });

    (prisma.locationCandidate.findMany as any)
      .mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce(mockCandidates);

    const result = await shortlistAgent.filterCandidates('mock-project-id');

    const investmentFilter = result.filters.find((f) => f.filter === 'initial_investment');
    expect(investmentFilter?.applied).toBe(false);
    expect(investmentFilter?.skippedReason).toContain('No location cost assumptions supplied');
    // Nothing was dropped on the basis of data nobody supplied.
    expect(result.passedInvestmentFilter).toBe(1);
    expect(result.assumptions).toEqual([]);
  });

  it('should distinguish an inert filter from one that found no problems', async () => {
    // Candidates carry no rent or size, which is the current state of every
    // discovered candidate. The funnel must not look like it vetted them.
    const mockCandidates = [
      { id: '1', latitude: 0, longitude: 0, estimatedRent: null, propertySize: null, status: 'IDENTIFIED' },
      { id: '2', latitude: 0, longitude: 0, estimatedRent: null, propertySize: null, status: 'IDENTIFIED' },
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'AREA_SCOUTING',
      locationSearch: {
        targetCity: 'Origin',
        maximumMonthlyRent: 15,
        targetPropertySize: 50,
        maximumInitialInvestment: 100,
      },
    });

    (prisma.locationCandidate.findMany as any)
      .mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce(mockCandidates);

    const result = await shortlistAgent.filterCandidates('mock-project-id', {
      depositMonths: 3,
    });

    const byName = Object.fromEntries(result.filters.map((f) => [f.filter, f]));

    // Thresholds are configured, but no candidate could actually be judged.
    expect(byName.rent.notEvaluated).toBe(2);
    expect(byName.size.notEvaluated).toBe(2);
    expect(byName.initial_investment.applied).toBe(false);
    expect(byName.initial_investment.notEvaluated).toBe(2);

    // Everything survives the funnel, which is exactly why it must be visible.
    expect(result.finalShortlisted).toBe(2);
  });

  it('should carry every client-supplied premises into a comparison report', async () => {
    const mockCandidates = [
      // Far outside the radius, over budget, and undersized — yet all three
      // are exactly what the client asked us to compare.
      { id: '1', latitude: 0.5, longitude: 0, estimatedRent: 999, propertySize: 1, status: 'IDENTIFIED' },
      { id: '2', latitude: 0, longitude: 0, estimatedRent: 5, propertySize: 100, status: 'IDENTIFIED' },
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'COMPARISON',
      locationSearch: {
        targetCity: 'Origin',
        preferredRadius: 100,
        maximumMonthlyRent: 10,
        minimumPropertySize: 50,
        maximumInitialInvestment: 1,
      },
    });

    (prisma.locationCandidate.findMany as any)
      .mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce(mockCandidates);

    const result = await shortlistAgent.filterCandidates('mock-project-id');

    expect(result.finalShortlisted).toBe(2);
    expect(result.filters.every((f) => f.applied === false)).toBe(true);
    expect(result.filters[0].skippedReason).toContain('assessed, not filtered out');

    // Nothing may be rejected: answering "we filtered out your choice" is not an answer.
    expect(prisma.locationCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SHORTLISTED' } })
    );
    expect(prisma.locationCandidate.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } })
    );
  });

  it('should keep the single premises in a validation report', async () => {
    const mockCandidates = [
      { id: '1', latitude: 0.5, longitude: 0, estimatedRent: 999, propertySize: 1, status: 'IDENTIFIED' },
    ];

    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      projectType: 'VALIDATION',
      locationSearch: { targetCity: 'Origin', preferredRadius: 100 },
    });

    (prisma.locationCandidate.findMany as any)
      .mockResolvedValueOnce(mockCandidates)
      .mockResolvedValueOnce(mockCandidates);

    const result = await shortlistAgent.filterCandidates('mock-project-id');

    expect(result.finalShortlisted).toBe(1);
  });
});
