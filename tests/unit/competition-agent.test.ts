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
      ]
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
    
    // Check mocked response
    expect(result.densityLevel).toBe('MEDIUM');
    expect(result.directCompetitorsCount).toBe(3);
    
    // Verify project service was called
    expect(projectService.getProject).toHaveBeenCalledWith('mock-project-id');
    
    // Verify location service was called for competitor discovery
    expect(locationService.searchCompetitorsForProject).toHaveBeenCalledWith(
      'mock-project-id',
      'cafe',
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
