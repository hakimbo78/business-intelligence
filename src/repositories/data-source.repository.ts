import { prisma } from '../config/database.js';
import type { DataSource, Prisma } from '@prisma/client';
import type { DataProvenance } from '../providers/location/location-provider.interface.js';
import { logger } from '../lib/logger.js';

/**
 * Persists provenance for external data retrievals.
 *
 * Per DEVELOPMENT_RULES.md §10 every external datum must carry its source,
 * retrieval time, geographic scope, data type and confidence; per
 * PROJECT_MASTER_SPEC.md §25 those references must be retained for audit.
 * Providers already return this metadata — it was simply being discarded.
 */
export class DataSourceRepository {
  async record(
    provenance: DataProvenance,
    context: { projectId?: string; metadata?: Prisma.InputJsonValue }
  ): Promise<DataSource | null> {
    try {
      return await prisma.dataSource.create({
        data: {
          projectId: context.projectId,
          source: provenance.source,
          dataType: provenance.dataType,
          geographicScope: provenance.geographicScope ?? 'UNKNOWN',
          confidence: provenance.confidence,
          retrievedAt: new Date(provenance.retrievedAt),
          metadata: context.metadata,
        },
      });
    } catch (error) {
      // Losing an audit row must not fail the customer's analysis, but it must
      // be loud enough to notice.
      logger.error(
        { err: error, source: provenance.source, dataType: provenance.dataType },
        'Failed to record data source provenance'
      );
      return null;
    }
  }

  async listForProject(projectId: string): Promise<DataSource[]> {
    return await prisma.dataSource.findMany({
      where: { projectId },
      orderBy: { retrievedAt: 'desc' },
    });
  }
}

export const dataSourceRepository = new DataSourceRepository();
