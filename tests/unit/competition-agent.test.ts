import { describe, it, expect, vi } from 'vitest';
import { competitionAgent } from '@/agents/competition.agent.js';
import { projectService } from '@/services/project.service.js';
import { locationService } from '@/services/location.service.js';
import { prisma } from '@/config/database.js';

// Mock environment and dependencies
vi.mock('@/config/environment.js', () => ({
  env: {
    AI_PROVIDER: 'mock',
    MAP_PROVIDER: 'mock',
  }
}));

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    getProject: vi.fn().mockResolvedValue({
      id: 'mock-project-id',
      businessProfile: {
        businessName: 'Mock Coffee Shop',
        businessCategory: 'F&B',
      },
      locationSearch: {
        targetCity: 'Jakarta',
      },
      researchPlan: {
        competitorCategories: ['cafe'],
        searchRadiusMeters: 2000,
      }
    }),
  }
}));

vi.mock('@/services/location.service.js', () => ({
  locationService: {
    searchCompetitorsForProject: vi.fn().mockResolvedValue({
      competitors: [
        { name: 'Rival Cafe 1', category: 'cafe' },
        { name: 'Rival Cafe 2', category: 'cafe' }
      ],
      count: {
        found: 2,
        capped: false,
        radiusMeters: 2000,
        nearestMeters: 150,
        searchable: true,
      },
      provenance: null,
    }),
  }
}));

vi.mock('@/config/database.js', () => ({
  prisma: {
    project: {
      update: vi.fn(),
    }
  }
}));

describe('Competition Agent', () => {
  it('should generate competition analysis', async () => {
    const result = await competitionAgent.analyzeCompetition('mock-project-id');
    
    // The density comes from the competitors actually found, not from the
    // model: the mock provider returns two, which is a thin market.
    expect(result.densityLevel).toBe('LOW');
    expect(result.count?.found).toBe(2);
    expect(result.count?.searchable).toBe(true);

    // The model still contributes its classification and prose.
    expect(result.directCompetitorsCount).toBe(3);
    
    // Verify project service was called
    expect(projectService.getProject).toHaveBeenCalledWith('mock-project-id');
    
    // One search covering every category, rather than one call per category:
    // the categories are resolved to Google types together and de-duplicated.
    expect(locationService.searchCompetitorsForProject).toHaveBeenCalledTimes(1);
    expect(locationService.searchCompetitorsForProject).toHaveBeenCalledWith(
      'mock-project-id',
      expect.arrayContaining(['cafe']),
      expect.any(Number), // latitude
      expect.any(Number), // longitude
      2000 // radius from research plan
    );
    
    // Verify database update was called
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { competitionAnalysis: result as any },
      })
    );
  });

  it('should throw error if project is missing required profiles', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({ id: 'mock-project-2' }); // missing business profile etc.
    
    await expect(competitionAgent.analyzeCompetition('mock-project-2'))
      .rejects.toThrow('Project mock-project-2 is missing required profiles');
  });
});
