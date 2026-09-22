import { describe, it, expect, vi } from 'vitest';
import { marketGapAgent } from '@/agents/market-gap.agent.js';
import { projectService } from '@/services/project.service.js';
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
      },
      competitionAnalysis: {
        densityLevel: 'MEDIUM',
      },
      demandAnalysis: {
        demandSignal: 'STRONG',
      },
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

describe('Market Gap Agent', () => {
  it('should generate market gap analysis', async () => {
    const result = await marketGapAgent.analyzeMarketGap('mock-project-id');
    
    // Check mocked response from MockAIProvider
    expect(result.overallRecommendation).toBe('PROCEED_WITH_CAUTION');
    expect(result.hypotheses.length).toBeGreaterThan(0);
    expect(result.hypotheses[0].confidenceLevel).toBe('MEDIUM');
    
    // Verify database update was called
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { marketGapAnalysis: result as any },
      })
    );
  });

  it('should throw error if project is missing required data', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({ 
      id: 'mock-project-2',
      businessProfile: {},
      competitionAnalysis: null, 
    }); 
    
    await expect(marketGapAgent.analyzeMarketGap('mock-project-2'))
      .rejects.toThrow('Project mock-project-2 is missing required data');
  });
});
