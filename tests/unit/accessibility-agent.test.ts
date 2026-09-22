import { describe, it, expect, vi } from 'vitest';
import { accessibilityAgent } from '@/agents/accessibility.agent.js';
import { projectService } from '@/services/project.service.js';
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
      locationSearch: {
        targetCity: 'Jakarta',
        targetArea: 'Kemang',
      },
    }),
  }
}));

vi.mock('@/providers/location/index.js', () => {
  return {
    createLocationProvider: vi.fn().mockReturnValue({
      geocode: vi.fn().mockResolvedValue({
        data: { location: { latitude: -6.2, longitude: 106.8 } }
      }),
      searchPlaces: vi.fn().mockResolvedValue({
        data: [
          { name: 'Stasiun MRT Blok M', location: { latitude: -6.21, longitude: 106.81 } }
        ]
      }),
      calculateRoute: vi.fn().mockResolvedValue({
        data: { distanceMeters: 2000, durationSeconds: 600 }
      })
    })
  };
});

vi.mock('@/config/database.js', () => ({
  prisma: {
    project: {
      update: vi.fn(),
    }
  }
}));

describe('Accessibility Agent', () => {
  it('should generate accessibility analysis', async () => {
    const result = await accessibilityAgent.analyzeAccessibility('mock-project-id');
    
    // Check mocked response from MockAIProvider
    expect(result.score).toBe(85);
    expect(result.metrics.averageTravelTimeMinutes).toBe(12);
    
    // Verify database update was called
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { accessibilityAnalysis: result as any },
      })
    );
  });

  it('should throw error if project is missing required data', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({ 
      id: 'mock-project-2',
      locationSearch: null,
    }); 
    
    await expect(accessibilityAgent.analyzeAccessibility('mock-project-2'))
      .rejects.toThrow('Project mock-project-2 is missing required data');
  });
});
