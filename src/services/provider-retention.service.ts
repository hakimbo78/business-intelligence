import { prisma } from '../config/database.js';
import { logger } from '../lib/logger.js';

/**
 * Expiring cached map-provider content.
 *
 * Google's Places policy exempts exactly one field from its caching
 * restriction: the place ID. Everything else a search returns — the name, the
 * address, the coordinates, the rating, the review count — is provider content
 * that may be cached only temporarily.
 *
 * The competitor table held all of it indefinitely. Each report re-ran the
 * census anyway, so the old rows were never even useful; they were a liability
 * with no benefit.
 *
 * The sweep clears the provider's fields and keeps the place ID, so a later run
 * can fetch the content again and nothing about the project is lost that cannot
 * be rebuilt. Reports already generated are untouched: a delivered report is the
 * work product the client paid for, not our cache of someone else's data.
 *
 * The retention window is ours to choose and is set well inside the allowance,
 * because nothing here needs the data to live longer than one report cycle.
 */

/** Days a provider's content may sit in our database before it is cleared. */
export const CONTENT_RETENTION_DAYS = 30;

/** What the sweep replaces a cleared name with, so a stale row is obvious. */
const PURGED_PLACEHOLDER = '[konten kedaluwarsa]';

export interface RetentionSweepResult {
  purged: number;
  cutoff: Date;
}

export class ProviderRetentionService {
  /**
   * Clear provider content older than the retention window.
   *
   * Rows with no timestamp are treated as expired: they predate this policy, so
   * their content is older than the window by definition.
   */
  async sweep(now = new Date()): Promise<RetentionSweepResult> {
    const cutoff = new Date(now.getTime() - CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const { count } = await prisma.competitor.updateMany({
      where: {
        contentPurged: false,
        OR: [{ contentFetchedAt: { lt: cutoff } }, { contentFetchedAt: null }],
      },
      data: {
        // The place ID stays: it is the one field the policy exempts, and it is
        // all a re-run needs to fetch everything else again.
        name: PURGED_PLACEHOLDER,
        address: null,
        rating: null,
        reviewCount: null,
        contentPurged: true,
      },
    });

    if (count > 0) {
      logger.info(
        { purged: count, cutoff: cutoff.toISOString(), retentionDays: CONTENT_RETENTION_DAYS },
        'Expired cached map-provider content'
      );
    }

    return { purged: count, cutoff };
  }

  /** Rows that will be cleared by the next sweep, for reporting. */
  async countExpiring(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - CONTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    return prisma.competitor.count({
      where: {
        contentPurged: false,
        OR: [{ contentFetchedAt: { lt: cutoff } }, { contentFetchedAt: null }],
      },
    });
  }
}

export const providerRetentionService = new ProviderRetentionService();
