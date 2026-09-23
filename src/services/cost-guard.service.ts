import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import {
  estimateCostUsd,
  summariseUsage,
  type BillableSku,
  type SkuUsage,
  type UsageSummary,
} from '../lib/api-cost.js';

/**
 * The ceiling that stops a mistake becoming an invoice.
 *
 * With billing enabled, the failure modes change character. A loop that used to
 * return quota errors now returns results and a bill; a key committed by
 * accident is a bill someone else runs up; a census that subdivides once too
 * often is a bill nobody authorised.
 *
 * Three ceilings, checked before every billable call and enforced against the
 * database rather than a counter in memory, so a restart does not reset the
 * budget:
 *
 *   per project  — one order cannot consume the month
 *   per day      — a runaway loop is bounded by sunset, not by month end
 *   per month    — the number the owner actually agreed to spend
 *
 * This is the last line, not the first. The first line is in the Google Cloud
 * console: a restricted API key and a per-API daily quota. Code cannot stop
 * spending on a key that has leaked, and this guard only sees calls that go
 * through this application.
 */

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    readonly scope: 'PROJECT' | 'DAY' | 'MONTH',
    readonly spentUsd: number,
    readonly limitUsd: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/** Midnight UTC of a date, which is how usage rows are keyed. */
function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export interface SpendSnapshot {
  projectUsd: number;
  dayUsd: number;
  monthUsd: number;
  limits: { projectUsd: number; dayUsd: number; monthUsd: number };
}

export class CostGuardService {
  /**
   * The database client, fetched on first use.
   *
   * Imported lazily because the Google provider calls this guard, and a
   * top-level import would mean that merely loading the provider constructs a
   * PrismaClient — dragging persistence into a module that has no business
   * knowing about it, and breaking any test that mocks only the environment.
   */
  private async db() {
    const { prisma } = await import('../config/database.js');
    return prisma;
  }

  /**
   * Refuse a call that would take spending past a ceiling.
   *
   * Checked before the call, using the cost the call is about to add, so the
   * ceiling is never crossed rather than merely detected afterwards.
   */
  async assertWithinBudget(
    sku: BillableSku,
    calls: number,
    projectId?: string,
    now = new Date()
  ): Promise<void> {
    const cost = estimateCostUsd(sku, calls);
    if (cost === 0) return; // A free SKU cannot breach a ceiling.

    const spend = await this.currentSpend(projectId, now);

    if (projectId && spend.projectUsd + cost > spend.limits.projectUsd) {
      throw new BudgetExceededError(
        `Batas biaya per laporan terlampaui: sudah US$ ${spend.projectUsd.toFixed(2)} ` +
          `dari batas US$ ${spend.limits.projectUsd.toFixed(2)}. Analisis dihentikan agar ` +
          'tagihan tidak membengkak.',
        'PROJECT',
        spend.projectUsd,
        spend.limits.projectUsd
      );
    }

    if (spend.dayUsd + cost > spend.limits.dayUsd) {
      throw new BudgetExceededError(
        `Batas biaya harian terlampaui: sudah US$ ${spend.dayUsd.toFixed(2)} dari batas ` +
          `US$ ${spend.limits.dayUsd.toFixed(2)}.`,
        'DAY',
        spend.dayUsd,
        spend.limits.dayUsd
      );
    }

    if (spend.monthUsd + cost > spend.limits.monthUsd) {
      throw new BudgetExceededError(
        `Batas biaya bulanan terlampaui: sudah US$ ${spend.monthUsd.toFixed(2)} dari batas ` +
          `US$ ${spend.limits.monthUsd.toFixed(2)}.`,
        'MONTH',
        spend.monthUsd,
        spend.limits.monthUsd
      );
    }
  }

  /** Record calls that have been made. */
  async record(
    sku: BillableSku,
    calls: number,
    projectId?: string,
    now = new Date()
  ): Promise<void> {
    if (calls <= 0) return;

    const prisma = await this.db();
    const day = startOfDay(now);
    const estimatedCostUsd = estimateCostUsd(sku, calls);

    const increment = {
      where: { day, sku, projectId: projectId ?? null },
      data: {
        calls: { increment: calls },
        estimatedCostUsd: { increment: estimatedCostUsd },
      },
    };

    // Not `upsert`: the unique key includes a nullable projectId, which Prisma
    // cannot address when it is null. Increment first, create only if the row
    // did not exist, and let a lost race fall back to another increment.
    const { count } = await prisma.apiUsage.updateMany(increment);
    if (count > 0) return;

    try {
      await prisma.apiUsage.create({
        data: { day, sku, projectId: projectId ?? null, calls, estimatedCostUsd },
      });
    } catch {
      // Another request created the row between the update and the insert.
      await prisma.apiUsage.updateMany(increment);
    }
  }

  /** What has been spent against each ceiling. */
  async currentSpend(projectId?: string, now = new Date()): Promise<SpendSnapshot> {
    const prisma = await this.db();
    const day = startOfDay(now);
    const month = startOfMonth(now);

    const [dayRows, monthRows, projectRows] = await Promise.all([
      prisma.apiUsage.aggregate({ where: { day }, _sum: { estimatedCostUsd: true } }),
      prisma.apiUsage.aggregate({ where: { day: { gte: month } }, _sum: { estimatedCostUsd: true } }),
      projectId
        ? prisma.apiUsage.aggregate({ where: { projectId }, _sum: { estimatedCostUsd: true } })
        : Promise.resolve({ _sum: { estimatedCostUsd: 0 } }),
    ]);

    return {
      dayUsd: dayRows._sum.estimatedCostUsd ?? 0,
      monthUsd: monthRows._sum.estimatedCostUsd ?? 0,
      projectUsd: projectRows._sum.estimatedCostUsd ?? 0,
      limits: {
        projectUsd: env.MAX_PROJECT_API_COST_USD,
        dayUsd: env.MAX_DAILY_API_COST_USD,
        monthUsd: env.MAX_MONTHLY_API_COST_USD,
      },
    };
  }

  /**
   * Usage so far this month, by SKU.
   *
   * Feeds the owner's cost page, where the useful number is not the dollar
   * total but how much of each free allowance is left.
   */
  async monthlyUsage(now = new Date()): Promise<UsageSummary> {
    const prisma = await this.db();
    const rows = await prisma.apiUsage.groupBy({
      by: ['sku'],
      where: { day: { gte: startOfMonth(now) } },
      _sum: { calls: true, estimatedCostUsd: true },
    });

    const usage: SkuUsage[] = rows.map((r) => ({
      sku: r.sku as BillableSku,
      calls: r._sum.calls ?? 0,
      estimatedCostUsd: r._sum.estimatedCostUsd ?? 0,
    }));

    return summariseUsage(usage);
  }

  /** What a single project has cost, for the owner's order view. */
  async projectCost(projectId: string): Promise<UsageSummary> {
    const prisma = await this.db();
    const rows = await prisma.apiUsage.groupBy({
      by: ['sku'],
      where: { projectId },
      _sum: { calls: true, estimatedCostUsd: true },
    });

    return summariseUsage(
      rows.map((r) => ({
        sku: r.sku as BillableSku,
        calls: r._sum.calls ?? 0,
        estimatedCostUsd: r._sum.estimatedCostUsd ?? 0,
      }))
    );
  }

  /**
   * Warn once a ceiling is close, so the owner hears before it bites.
   *
   * Logged rather than thrown: a warning that stopped the work would be a
   * ceiling, and there are already three of those.
   */
  async warnIfNearLimit(now = new Date()): Promise<void> {
    const spend = await this.currentSpend(undefined, now);
    const monthShare = spend.monthUsd / spend.limits.monthUsd;

    if (monthShare >= 0.8) {
      logger.warn(
        {
          spentUsd: Number(spend.monthUsd.toFixed(2)),
          limitUsd: spend.limits.monthUsd,
          percent: Math.round(monthShare * 100),
        },
        'Monthly API budget is nearly spent'
      );
    }
  }
}

export const costGuardService = new CostGuardService();
