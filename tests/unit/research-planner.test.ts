import { describe, it, expect, vi } from 'vitest';
import { researchPlannerAgent } from '@/agents/research-planner.agent.js';
import { projectService } from '@/services/project.service.js';
import { prisma } from '@/config/database.js';

// Mock environment and AI Provider
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
      }
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

describe('Research Planner Agent', () => {
  it('should generate research plan based on project profile', async () => {
    const result = await researchPlannerAgent.generatePlan('mock-project-id');
    
    // Check mocked response
    expect(result.competitorCategories).toContain('cafe');
    expect(result.searchRadiusMeters).toBe(3000);
    expect(result.estimatedAPICalls).toBe(2);
    
    // Verify project service was called
    expect(projectService.getProject).toHaveBeenCalledWith('mock-project-id');
    
    // Verify database update was called
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { researchPlan: result as any },
      })
    );
  });

  it('should throw error if project has no business profile', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({ id: 'mock-project-2' });
    
    await expect(researchPlannerAgent.generatePlan('mock-project-2'))
      .rejects.toThrow('Project mock-project-2 has no business profile');
  });
});
