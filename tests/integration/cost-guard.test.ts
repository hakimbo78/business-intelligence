import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/config/database.js';
import { costGuardService, BudgetExceededError } from '@/services/cost-guard.service.js';
import { env } from '@/config/environment.js';

/**
 * The ceilings exist because billing is enabled: a bug that used to return an
 * error now returns an invoice.
 */

const projectId = `budget-test-${Date.now()}`;

beforeEach(async () => {
  await prisma.apiUsage.deleteMany({});
});

afterAll(async () => {
  await prisma.apiUsage.deleteMany({});
});

describe('Counting what has been spent', () => {
  it('should accumulate calls into one row per day and SKU', async () => {
    await costGuardService.record('NEARBY_SEARCH_PRO', 10, projectId);
    await costGuardService.record('NEARBY_SEARCH_PRO', 5, projectId);

    const rows = await prisma.apiUsage.findMany({ where: { projectId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].calls).toBe(15);
    expect(rows[0].estimatedCostUsd).toBeCloseTo(0.48, 4);
  });

  it('should keep projects apart so one order’s spend is visible', async () => {
    await costGuardService.record('NEARBY_SEARCH_PRO', 10, 'project-a');
    await costGuardService.record('NEARBY_SEARCH_PRO', 20, 'project-b');

    const a = await costGuardService.projectCost('project-a');
    expect(a.totalCalls).toBe(10);
  });

  it('should survive a restart, because the count is in the database', async () => {
    await costGuardService.record('NEARBY_SEARCH_PRO', 100, projectId);

    // A fresh service instance is what a redeploy produces.
    const { CostGuardService } = await import('@/services/cost-guard.service.js');
    const afterRestart = new CostGuardService();

    const spend = await afterRestart.currentSpend(projectId);
    expect(spend.projectUsd).toBeCloseTo(3.2, 3);
  });
});

describe('Refusing a call that would breach a ceiling', () => {
  it('should allow a call while there is room', async () => {
    await expect(
      costGuardService.assertWithinBudget('NEARBY_SEARCH_PRO', 1, projectId)
    ).resolves.toBeUndefined();
  });

  it('should stop one project from consuming the month', async () => {
    // Spend past the per-project ceiling.
    const callsToExceed = Math.ceil((env.MAX_PROJECT_API_COST_USD / 32) * 1000) + 10;
    await costGuardService.record('NEARBY_SEARCH_PRO', callsToExceed, projectId);

    await expect(
      costGuardService.assertWithinBudget('NEARBY_SEARCH_PRO', 1, projectId)
    ).rejects.toThrow(BudgetExceededError);
  });

  it('should name the ceiling that was hit, in the language of the operator', async () => {
    const callsToExceed = Math.ceil((env.MAX_PROJECT_API_COST_USD / 32) * 1000) + 10;
    await costGuardService.record('NEARBY_SEARCH_PRO', callsToExceed, projectId);

    try {
      await costGuardService.assertWithinBudget('NEARBY_SEARCH_PRO', 1, projectId);
      expect.unreachable('should have thrown');
    } catch (error) {
      const budget = error as BudgetExceededError;
      expect(budget.scope).toBe('PROJECT');
      expect(budget.message).toContain('Batas biaya per laporan terlampaui');
      expect(budget.limitUsd).toBe(env.MAX_PROJECT_API_COST_USD);
    }
  });

  it('should stop a runaway loop at the daily ceiling even across projects', async () => {
    // Spread across many projects, so no single project ceiling is reached.
    const perProject = Math.ceil((env.MAX_PROJECT_API_COST_USD / 32) * 1000) - 10;
    const projects = Math.ceil(env.MAX_DAILY_API_COST_USD / env.MAX_PROJECT_API_COST_USD) + 1;

    for (let i = 0; i < projects; i += 1) {
      await costGuardService.record('NEARBY_SEARCH_PRO', perProject, `runaway-${i}`);
    }

    await expect(
      costGuardService.assertWithinBudget('NEARBY_SEARCH_PRO', 1, 'runaway-new')
    ).rejects.toThrow(/harian|bulanan/);
  });

  it('should never block a free SKU', async () => {
    await costGuardService.record('NEARBY_SEARCH_PRO', 1_000_000, projectId);

    // The metadata lookup costs nothing, so no ceiling can apply to it.
    await expect(
      costGuardService.assertWithinBudget('STREET_VIEW_METADATA', 1, projectId)
    ).resolves.toBeUndefined();
  });
});

describe('Reporting spend to the owner', () => {
  it('should group the month by SKU with the free allowance left', async () => {
    await costGuardService.record('NEARBY_SEARCH_PRO', 600, projectId);
    await costGuardService.record('GEOCODING', 25, projectId);

    const usage = await costGuardService.monthlyUsage();
    const nearby = usage.perSku.find((s) => s.sku === 'NEARBY_SEARCH_PRO')!;

    expect(nearby.calls).toBe(600);
    expect(nearby.freeRemaining).toBe(4_400);
    expect(usage.totalCalls).toBe(625);
  });
});
