import { describe, it, expect, vi, beforeEach } from 'vitest';
import { candidateDiscoveryAgent } from '@/agents/candidate-discovery.agent.js';
import { projectService } from '@/services/project.service.js';
import { candidateRepository } from '@/repositories/candidate.repository.js';
import { createLocationProvider } from '@/providers/location/index.js';
import { prisma } from '@/config/database.js';

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

vi.mock('@/repositories/candidate.repository.js', () => ({
  candidateRepository: {
    createCandidate: vi.fn(),
  }
}));

vi.mock('@/repositories/data-source.repository.js', () => ({
  dataSourceRepository: {
    record: vi.fn().mockResolvedValue(null),
  }
}));

vi.mock('@/providers/location/index.js', () => {
  const searchPlaces = vi.fn();
  const geocode = vi.fn().mockResolvedValue({
    data: { location: { latitude: -6.261, longitude: 106.816 } },
    provenance: {
      source: 'MockLocationProvider',
      retrievedAt: new Date().toISOString(),
      dataType: 'geocoding',
      confidence: 'HIGH',
    },
  });
  return {
    createLocationProvider: vi.fn().mockReturnValue({ geocode, searchPlaces }),
  };
});

vi.mock('@/config/database.js', () => ({
  prisma: {
    locationCandidate: {
      findMany: vi.fn(),
    }
  }
}));

const provider = (createLocationProvider as any)();

/** Wrap mock places in the ProviderResult envelope the agent expects. */
function providerResult(data: unknown[]) {
  return {
    data,
    provenance: {
      source: 'MockLocationProvider',
      retrievedAt: new Date().toISOString(),
      dataType: 'search_places',
      confidence: 'HIGH',
    },
  };
}

function place(placeId: string, name: string) {
  return {
    placeId,
    name,
    address: `${name} address`,
    location: { latitude: -6.26, longitude: 106.81 },
    category: 'commercial',
  };
}

describe('Candidate Discovery Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (candidateRepository.createCandidate as any).mockImplementation(
      async (input: any) => ({ id: `candidate-${input.placeId}`, ...input })
    );
  });

  it('should create one candidate per unique place across all queries', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'p1',
      locationSearch: { targetCity: 'Jakarta Selatan', targetArea: 'Kemang' },
      researchPlan: {
        searchRadiusMeters: 2000,
        candidateSearchQueries: ['ruko disewakan', 'commercial space'],
      },
    });
    (prisma.locationCandidate.findMany as any).mockResolvedValueOnce([]);

    // The same property legitimately surfaces under both queries.
    provider.searchPlaces
      .mockResolvedValueOnce(providerResult([place('a', 'Ruko A'), place('b', 'Ruko B')]))
      .mockResolvedValueOnce(providerResult([place('b', 'Ruko B'), place('c', 'Ruko C')]));

    const result = await candidateDiscoveryAgent.discoverCandidates('p1');

    expect(result.placesFound).toBe(4);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.candidatesCreated).toBe(3);
    expect(candidateRepository.createCandidate).toHaveBeenCalledTimes(3);

    // Uses the research plan's radius, centred on the geocoded target area.
    expect(provider.searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'ruko disewakan', radiusMeters: 2000 })
    );
  });

  it('should skip places already stored for the project', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'p1',
      locationSearch: { targetCity: 'Jakarta Selatan' },
      researchPlan: { candidateSearchQueries: ['ruko disewakan'] },
    });
    (prisma.locationCandidate.findMany as any).mockResolvedValueOnce([{ placeId: 'a' }]);

    provider.searchPlaces.mockResolvedValueOnce(
      providerResult([place('a', 'Ruko A'), place('d', 'Ruko D')])
    );

    const result = await candidateDiscoveryAgent.discoverCandidates('p1');

    expect(result.duplicatesSkipped).toBe(1);
    expect(result.candidatesCreated).toBe(1);
    expect(candidateRepository.createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 'd' })
    );
  });

  it('should fall back to the location search radius when the plan omits one', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'p1',
      locationSearch: { targetCity: 'Jakarta Selatan', preferredRadius: 750 },
      researchPlan: { candidateSearchQueries: ['ruko disewakan'] },
    });
    (prisma.locationCandidate.findMany as any).mockResolvedValueOnce([]);
    provider.searchPlaces.mockResolvedValueOnce(providerResult([]));

    await candidateDiscoveryAgent.discoverCandidates('p1');

    expect(provider.searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ radiusMeters: 750 })
    );
  });

  it('should throw when the research plan has no candidate search queries', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'p1',
      locationSearch: { targetCity: 'Jakarta Selatan' },
      researchPlan: { candidateSearchQueries: [] },
    });

    await expect(candidateDiscoveryAgent.discoverCandidates('p1'))
      .rejects.toThrow('no candidateSearchQueries');
  });

  it('should throw when the project has no research plan', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'p1',
      locationSearch: { targetCity: 'Jakarta Selatan' },
    });

    await expect(candidateDiscoveryAgent.discoverCandidates('p1'))
      .rejects.toThrow('missing required data');
  });
});
