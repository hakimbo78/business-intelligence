import { describe, it, expect, vi } from 'vitest';
import { demandAgent } from '@/agents/demand.agent.js';
import { projectService } from '@/services/project.service.js';
import { demographicProvider } from '@/providers/demographics/mock-demographic-provider.js';
import { trendsProvider } from '@/providers/trends/mock-trends-provider.js';
import { prisma } from '@/config/database.js';

// Mock environment and dependencies
vi.mock('@/config/environment.js', () => ({
  env: {
    AI_PROVIDER: 'mock',
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
    }),
  }
}));

vi.mock('@/providers/demographics/mock-demographic-provider.js', () => ({
  demographicProvider: {
    getDemographicData: vi.fn().mockResolvedValue({
      totalPopulation: 100000,
      dominantAgeGroup: '25-34',
      disclaimer: 'Mock BPS',
    }),
  }
}));

vi.mock('@/providers/trends/mock-trends-provider.js', () => ({
  trendsProvider: {
    getSearchInterest: vi.fn().mockResolvedValue({
      interestScore: 85,
      disclaimer: 'Proxy signal',
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

describe('Demand Agent', () => {
  it('should generate demand analysis', async () => {
    const result = await demandAgent.analyzeDemand('mock-project-id');
    
    // Check mocked response
    expect(result.demandSignal).toBe('STRONG');
    expect(result.confidence).toBe('HIGH');
    
    // Verify dependencies were called
    expect(projectService.getProject).toHaveBeenCalledWith('mock-project-id');
    expect(demographicProvider.getDemographicData).toHaveBeenCalledWith('Jakarta');
    expect(trendsProvider.getSearchInterest).toHaveBeenCalledWith('F&B', 'Jakarta');
    
    // Verify database update was called
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { demandAnalysis: result as any },
      })
    );
  });

  it('should throw error if project is missing required profiles', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({ id: 'mock-project-2' }); 
    
    await expect(demandAgent.analyzeDemand('mock-project-2'))
      .rejects.toThrow('Project mock-project-2 is missing required profiles');
  });
});
