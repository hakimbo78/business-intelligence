import { FastifyInstance } from 'fastify';
import { requireOwner } from '../middleware/auth.middleware.js';
import { costGuardService } from '../services/cost-guard.service.js';
import { env } from '../config/environment.js';
import { formatCost } from '../lib/api-cost.js';

/**
 * What the paid APIs have cost.
 *
 * Owner-only, because it is the owner who pays and the owner who has to notice
 * before the month closes. The numbers are our own estimate from Google's list
 * prices, not an invoice, and the responses say so.
 */
export async function costRoutes(app: FastifyInstance) {
  /** Spend so far this month, by SKU, with the free allowance remaining. */
  app.get('/costs', { onRequest: requireOwner }, async (_request, reply) => {
    const [usage, spend] = await Promise.all([
      costGuardService.monthlyUsage(),
      costGuardService.currentSpend(),
    ]);

    return reply.send({
      month: {
        totalCalls: usage.totalCalls,
        estimatedCostUsd: usage.totalCostUsd,
        estimatedCostFormatted: formatCost(usage.totalCostUsd, env.USD_TO_IDR),
        // What would actually be invoiced once the free allowances are spent.
        billableCostUsd: usage.billableCostUsd,
        billableCostFormatted: formatCost(usage.billableCostUsd, env.USD_TO_IDR),
      },
      perSku: usage.perSku.map((s) => ({
        sku: s.sku,
        label: s.label,
        calls: s.calls,
        estimatedCostUsd: s.estimatedCostUsd,
        freePerMonth: Number.isFinite(s.freePerMonth) ? s.freePerMonth : null,
        freeRemaining: Number.isFinite(s.freeRemaining) ? s.freeRemaining : null,
      })),
      limits: {
        perProjectUsd: spend.limits.projectUsd,
        perDayUsd: spend.limits.dayUsd,
        perMonthUsd: spend.limits.monthUsd,
        spentTodayUsd: Math.round(spend.dayUsd * 10_000) / 10_000,
        spentThisMonthUsd: Math.round(spend.monthUsd * 10_000) / 10_000,
        // The share of the monthly ceiling used, which is the number to watch.
        monthlyUsedPercent: Math.round((spend.monthUsd / spend.limits.monthUsd) * 100),
      },
      disclaimer:
        'Angka ini perkiraan kami berdasarkan daftar harga Google, bukan tagihan resmi. ' +
        'Tagihan yang berlaku adalah yang tertera di Google Cloud Console. Batas biaya di ' +
        'sini hanya menghitung panggilan yang lewat aplikasi ini — kunci API yang bocor ' +
        'tidak terlihat di sini, jadi batasi kunci dan pasang kuota harian di konsol Google.',
    });
  });

  /** What one order has cost, for the owner's view of a project. */
  app.get<{ Params: { id: string } }>(
    '/costs/projects/:id',
    { onRequest: requireOwner },
    async (request, reply) => {
      const usage = await costGuardService.projectCost(request.params.id);

      return reply.send({
        projectId: request.params.id,
        totalCalls: usage.totalCalls,
        estimatedCostUsd: usage.totalCostUsd,
        estimatedCostFormatted: formatCost(usage.totalCostUsd, env.USD_TO_IDR),
        perSku: usage.perSku.map((s) => ({
          sku: s.sku,
          label: s.label,
          calls: s.calls,
          estimatedCostUsd: s.estimatedCostUsd,
        })),
      });
    }
  );
}
