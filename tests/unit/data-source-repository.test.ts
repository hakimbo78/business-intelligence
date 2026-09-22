import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataSourceRepository } from '@/repositories/data-source.repository.js';
import { prisma } from '@/config/database.js';

vi.mock('@/config/database.js', () => ({
  prisma: {
    dataSource: {
      create: vi.fn(),
      findMany: vi.fn(),
    }
  }
}));

const provenance = {
  source: 'MockLocationProvider',
  retrievedAt: '2026-09-22T00:00:00.000Z',
  dataType: 'search_places',
  confidence: 'HIGH' as const,
};

describe('Data source provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.dataSource.create as any).mockResolvedValue({ id: 'ds-1' });
  });

  it('should persist every field DEVELOPMENT_RULES §10 requires', async () => {
    await dataSourceRepository.record(provenance, {
      projectId: 'p1',
      metadata: { operation: 'searchCandidates' },
    });

    expect(prisma.dataSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        source: 'MockLocationProvider',
        dataType: 'search_places',
        confidence: 'HIGH',
        retrievedAt: new Date('2026-09-22T00:00:00.000Z'),
      }),
    });
  });

  it('should record UNKNOWN rather than omit an unstated geographic scope', async () => {
    await dataSourceRepository.record(provenance, { projectId: 'p1' });

    const arg = (prisma.dataSource.create as any).mock.calls[0][0];
    expect(arg.data.geographicScope).toBe('UNKNOWN');
  });

  it('should not fail the analysis when the audit write fails', async () => {
    (prisma.dataSource.create as any).mockRejectedValueOnce(new Error('db down'));

    // Losing an audit row must not take a customer's report down with it.
    await expect(dataSourceRepository.record(provenance, { projectId: 'p1' }))
      .resolves.toBeNull();
  });
});
