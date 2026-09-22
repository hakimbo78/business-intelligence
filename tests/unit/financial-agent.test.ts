import { describe, it, expect, vi, beforeEach } from 'vitest';
import { financialAgent } from '@/agents/financial.agent.js';
import { projectService } from '@/services/project.service.js';
import { prisma } from '@/config/database.js';

const completeProject = {
  id: 'mock-project-id',
  businessProfile: {
    estimatedDailyCustomers: 100,
    currentAverageTransaction: 35000,
    operatingDays: 26,
    grossMargin: 0.65,
  },
  locationSearch: {
    maximumMonthlyRent: 15000000,
    targetPropertySize: 50,
    // Budget ceiling used for filtering candidates — deliberately different
    // from the planned spend so tests can prove which one drives payback.
    maximumInitialInvestment: 200000000,
    // Total Initial Investment the customer plans to spend.
    estimatedInitialInvestment: 350000000,
  },
};

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    getProject: vi.fn(),
  }
}));

vi.mock('@/config/database.js', () => ({
  prisma: {
    project: {
      update: vi.fn(),
    }
  }
}));

describe('Financial Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (projectService.getProject as any).mockResolvedValue(completeProject);
  });

  it('should generate financial analysis with 3 scenarios', async () => {
    const result = await financialAgent.analyzeFinancials('mock-project-id');

    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios[0].scenarioName).toBe('CONSERVATIVE');
    expect(result.scenarios[1].scenarioName).toBe('BASE');
    expect(result.scenarios[2].scenarioName).toBe('UPSIDE');

    // Verify BASE scenario revenue = 100 × 35000 × 26 = 91,000,000
    expect(result.scenarios[1].monthlyRevenue).toBe(91000000);

    // Verify database update was called
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
      })
    );
  });

  it('should compute payback from the planned investment, not the budget ceiling', async () => {
    const result = await financialAgent.analyzeFinancials('mock-project-id');
    const base = result.scenarios[1];

    // grossProfit 59,150,000 − rent 15,000,000 = operating profit 44,150,000
    expect(base.operatingProfit).toBe(44150000);

    // 350,000,000 / 44,150,000 = 7.9 months.
    // The 200,000,000 ceiling would have given 4.5 — proving it is not used.
    expect(base.paybackPeriodMonths).toBe(7.9);
  });

  it('should never report an instant payback when investment is unknown', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      ...completeProject,
      locationSearch: { ...completeProject.locationSearch, estimatedInitialInvestment: null },
    });

    // Previously this silently defaulted to 0 and reported a 0-month payback.
    await expect(financialAgent.analyzeFinancials('mock-project-id'))
      .rejects.toThrow(/estimatedInitialInvestment/);
  });

  it('should explain what the customer must provide when it refuses', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      ...completeProject,
      locationSearch: { ...completeProject.locationSearch, estimatedInitialInvestment: null },
    });

    await expect(financialAgent.analyzeFinancials('mock-project-id'))
      .rejects.toThrow(/EXCLUDES monthly rent/);
  });

  it('should not write a financial analysis when inputs are missing', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      ...completeProject,
      locationSearch: { ...completeProject.locationSearch, estimatedInitialInvestment: null },
    });

    await expect(financialAgent.analyzeFinancials('mock-project-id')).rejects.toThrow();
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('should accept overrides for what-if analysis', async () => {
    const result = await financialAgent.analyzeFinancials('mock-project-id', {
      customersPerDay: 200,
    });

    // BASE should use 200 customers
    expect(result.scenarios[1].effectiveCustomersPerDay).toBe(200);
  });

  it('should let an override satisfy an otherwise missing investment', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      ...completeProject,
      locationSearch: { ...completeProject.locationSearch, estimatedInitialInvestment: null },
    });

    const result = await financialAgent.analyzeFinancials('mock-project-id', {
      initialInvestment: 44150000,
    });

    expect(result.scenarios[1].paybackPeriodMonths).toBe(1);
  });

  it('should record substituted operating days and margin as assumptions', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      ...completeProject,
      businessProfile: {
        estimatedDailyCustomers: 100,
        currentAverageTransaction: 35000,
      },
    });

    const result = await financialAgent.analyzeFinancials('mock-project-id');

    expect(result.assumptions).toHaveLength(2);
    expect(result.assumptions.join(' ')).toContain('ASSUMPTION');
  });

  it('should report no assumptions when the customer supplied everything', async () => {
    const result = await financialAgent.analyzeFinancials('mock-project-id');
    expect(result.assumptions).toEqual([]);
  });

  it('should throw error if project is missing required data', async () => {
    (projectService.getProject as any).mockResolvedValueOnce({
      id: 'mock-project-2',
      businessProfile: null,
    });

    await expect(financialAgent.analyzeFinancials('mock-project-2'))
      .rejects.toThrow('Project mock-project-2 is missing required data');
  });
});
