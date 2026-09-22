import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intakeAgent } from '@/agents/intake.agent.js';
import { projectService } from '@/services/project.service.js';

// Mock environment and AI Provider
vi.mock('@/config/environment.js', () => ({
  env: {
    AI_PROVIDER: 'mock',
    MAP_PROVIDER: 'mock',
  }
}));

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    createProject: vi.fn(),
  }
}));

/** What the repository returns once the mock brief has been persisted. */
const createdProject = {
  id: 'mock-project-id',
  name: 'Expansion: Mock Coffee Shop - Kemang',
  businessProfile: {
    businessName: 'Mock Coffee Shop',
    businessCategory: 'F&B',
    currentAverageTransaction: 35000,
    estimatedDailyCustomers: 100,
    operatingDays: 26,
    grossMargin: 0.65,
  },
  locationSearch: {
    targetCity: 'Jakarta Selatan',
    targetArea: 'Kemang',
    maximumMonthlyRent: 20000000,
    estimatedInitialInvestment: 350000000,
  },
};

describe('Intake Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (projectService.createProject as any).mockResolvedValue(createdProject);
  });

  it('should process natural language brief and orchestrate project creation', async () => {
    const brief = 'Saya ingin membuka kedai kopi di Kemang, Jakarta Selatan dengan budget sewa maksimal 20 juta per bulan.';

    const result = await intakeAgent.processBrief('client-123', brief);

    expect(result.project.id).toBe('mock-project-id');
    expect(result.project.name).toContain('Mock Coffee Shop - Kemang');
    expect(result.missingInformation).toEqual([]);
    expect(result.readyForAnalysis).toBe(true);

    // Verify that the agent correctly called the project service with structured data
    expect(projectService.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-123',
        name: 'Expansion: Mock Coffee Shop - Kemang',
        businessProfile: expect.objectContaining({
          businessName: 'Mock Coffee Shop',
          businessCategory: 'F&B',
          operatingDays: 26,
          grossMargin: 0.65,
        }),
        locationSearch: expect.objectContaining({
          targetCity: 'Jakarta Selatan',
          targetArea: 'Kemang',
          maximumMonthlyRent: 20000000,
          estimatedInitialInvestment: 350000000,
        })
      })
    );
  });

  it('should flag a brief that never states the initial investment', async () => {
    (projectService.createProject as any).mockResolvedValueOnce({
      ...createdProject,
      locationSearch: { ...createdProject.locationSearch, estimatedInitialInvestment: null },
    });

    const result = await intakeAgent.processBrief('client-123', 'Kedai kopi di Kemang.');

    // The project is still created, but it must not proceed to analysis until
    // the customer supplies the figure.
    expect(result.readyForAnalysis).toBe(false);
    expect(result.missingFinancialInputs.map((m: { field: string }) => m.field))
      .toContain('locationSearch.estimatedInitialInvestment');
    expect(result.missingInformation.join(' ')).toContain('EXCLUDES monthly rent');
  });
});
