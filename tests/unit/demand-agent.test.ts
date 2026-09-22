import { describe, it, expect, vi, beforeEach } from 'vitest';
import { demandAgent } from '@/agents/demand.agent.js';
import { projectService } from '@/services/project.service.js';
import { locationContextService } from '@/services/location-context.service.js';
import { prisma } from '@/config/database.js';

vi.mock('@/config/environment.js', () => ({
  env: { AI_PROVIDER: 'mock', MAP_PROVIDER: 'mock' }
}));

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    getProject: vi.fn().mockResolvedValue({
      id: 'mock-project-id',
      businessProfile: { businessName: 'Mock Coffee Shop', businessCategory: 'F&B' },
      locationSearch: { targetCity: 'Jakarta' },
    }),
  }
}));

vi.mock('@/providers/location/index.js', () => ({
  createLocationProvider: vi.fn().mockReturnValue({
    geocode: vi.fn().mockResolvedValue({
      data: { location: { latitude: -6.261, longitude: 106.816 } },
      provenance: { source: 'MockLocationProvider', retrievedAt: '', dataType: 'geocoding', confidence: 'HIGH' },
    }),
  }),
}));

vi.mock('@/services/location-context.service.js', () => ({
  locationContextService: {
    describe: vi.fn().mockResolvedValue({
      searchRadiusMeters: 3000,
      facilities: [
        { key: 'school', label: 'Sekolah', distanceMeters: 992, name: 'SDN 1' },
        { key: 'transit', label: 'Stasiun / terminal', distanceMeters: 693, name: 'Stasiun Depok' },
        { key: 'mall', label: 'Pusat perbelanjaan', distanceMeters: null, name: null },
      ],
      notMeasured: ['Jumlah penduduk dan komposisi usia tidak diukur.'],
    }),
  }
}));

vi.mock('@/config/database.js', () => ({
  prisma: { project: { update: vi.fn() } }
}));

describe('Demand Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should analyse demand from what is around the location', async () => {
    const result = await demandAgent.analyzeDemand('mock-project-id');

    expect(result.demandSignal).toBe('STRONG');
    expect(result.confidence).toBeDefined();
    expect(projectService.getProject).toHaveBeenCalledWith('mock-project-id');
  });

  it('should measure the catchment rather than read invented demographics', async () => {
    await demandAgent.analyzeDemand('mock-project-id');

    // The mock demographic provider returned identical figures for every
    // location on earth, and those figures were printed in customer reports.
    expect(locationContextService.describe).toHaveBeenCalledWith(
      { latitude: -6.261, longitude: 106.816 },
      'mock-project-id'
    );
  });

  it('should store the catchment with the analysis so the report can show it', async () => {
    await demandAgent.analyzeDemand('mock-project-id');

    const call = (prisma.project.update as any).mock.calls[0][0];
    expect(call.data.demandAnalysis.locationContext.facilities).toHaveLength(3);
    expect(call.data.demandAnalysis.locationContext.notMeasured.length).toBeGreaterThan(0);
  });

  it('should throw when the project has no profiles', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({ id: 'p2', businessProfile: null });

    await expect(demandAgent.analyzeDemand('p2')).rejects.toThrow('missing required profiles');
  });
});
