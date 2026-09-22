import { describe, it, expect, vi } from 'vitest';
import { scoringAgent } from '@/agents/scoring.agent.js';
import { projectService } from '@/services/project.service.js';
import { prisma } from '@/config/database.js';

vi.mock('@/config/environment.js', () => ({
  env: {
    AI_PROVIDER: 'mock',
  }
}));

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    getProject: vi.fn().mockResolvedValue({
      id: 'mock-project-id',
      competitionAnalysis: {
        densityLevel: 'MEDIUM',
        competitionRisks: ['Risk 1'],
      },
      demandAnalysis: {
        demandSignal: 'STRONG',
        confidence: 'HIGH',
      },
      marketGapAnalysis: {
        overallRecommendation: 'PROCEED_WITH_CAUTION',
        hypotheses: [{ confidenceLevel: 'MEDIUM' }],
      },
      accessibilityAnalysis: {
        score: 85,
      },
      financialAnalysis: {
        scenarios: [
          { scenarioName: 'BASE', isViable: true, paybackPeriodMonths: 8 },
        ],
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

describe('Scoring Agent', () => {
  it('should produce deterministic scores with AI explanation', async () => {
    const result = await scoringAgent.scoreProject('mock-project-id');

    // 10 dimensions
    expect(result.dimensions).toHaveLength(10);

    // Overall score should be > 0
    expect(result.overallScore).toBeGreaterThan(0);

    // AI explanation should exist (mocked)
    expect(result.explanation).toBeDefined();
    expect(result.explanation!.length).toBeGreaterThan(0);

    // DB save
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
      })
    );
  });

  it('should throw error if project has no analysis data', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-2',
      competitionAnalysis: null,
      demandAnalysis: null,
    });

    await expect(scoringAgent.scoreProject('mock-project-2'))
      .rejects.toThrow('has no analysis data to score');
  });
});
