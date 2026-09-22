import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueWorker } from '@/queue/worker.js';
import { prisma } from '@/config/database.js';
import { projectService } from '@/services/project.service.js';

vi.mock('@/config/environment.js', () => ({
  env: { MAP_PROVIDER: 'mock', AI_PROVIDER: 'mock', LOG_LEVEL: 'error' }
}));

vi.mock('@/config/database.js', () => ({
  prisma: {
    jobQueue: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    }
  }
}));

vi.mock('@/services/project.service.js', () => ({
  projectService: {
    getProject: vi.fn(),
    updateProjectStatus: vi.fn(),
  }
}));

/**
 * `claimJob` and `processJob` are private. Reaching them directly keeps these
 * tests focused on the retry/claim contract without standing up the 5s poll loop.
 */
const worker = queueWorker as unknown as {
  claimJob: () => Promise<unknown>;
  processJob: (job: unknown) => Promise<void>;
};

const job = {
  id: 'job-1',
  type: 'GENERATE_REPORT',
  payload: { projectId: 'p1' },
  attempts: 0,
  maxAttempts: 3,
  status: 'PENDING',
};

describe('Queue worker job claiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should claim a job only while it is still claimable', async () => {
    (prisma.jobQueue.findFirst as any).mockResolvedValueOnce(job);
    (prisma.jobQueue.updateMany as any).mockResolvedValueOnce({ count: 1 });

    const claimed = await worker.claimJob();

    expect(claimed).toEqual(job);
    // The status guard is what makes the claim atomic between workers.
    expect(prisma.jobQueue.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: { in: ['PENDING', 'RETRYING'] } },
      data: expect.objectContaining({ status: 'PROCESSING' }),
    });
  });

  it('should yield the job when another worker claimed it first', async () => {
    (prisma.jobQueue.findFirst as any).mockResolvedValueOnce(job);
    // The guarded UPDATE matched no rows: someone else already took it.
    (prisma.jobQueue.updateMany as any).mockResolvedValueOnce({ count: 0 });

    expect(await worker.claimJob()).toBeNull();
  });

  it('should pick up retrying jobs, not just fresh ones', async () => {
    (prisma.jobQueue.findFirst as any).mockResolvedValueOnce(null);

    await worker.claimJob();

    expect(prisma.jobQueue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['PENDING', 'RETRYING'] } },
      })
    );
  });
});

describe('Queue worker retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mark a failed job RETRYING while attempts remain', async () => {
    (projectService.getProject as any).mockRejectedValueOnce(new Error('boom'));

    await worker.processJob({ ...job, attempts: 0 });

    expect(prisma.jobQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'RETRYING', attempts: 1 }),
      })
    );
  });

  it('should mark a job FAILED once attempts are exhausted', async () => {
    (projectService.getProject as any).mockRejectedValueOnce(new Error('boom'));

    await worker.processJob({ ...job, attempts: 2, maxAttempts: 3 });

    expect(prisma.jobQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', attempts: 3 }),
      })
    );
  });

  it('should record the error so a failure can be diagnosed', async () => {
    (projectService.getProject as any).mockRejectedValueOnce(new Error('boom'));

    await worker.processJob({ ...job, attempts: 2 });

    const arg = (prisma.jobQueue.update as any).mock.calls[0][0];
    expect(arg.data.error).toContain('boom');
  });

  it('should refuse an unknown job type', async () => {
    await worker.processJob({ ...job, type: 'NOT_A_JOB', attempts: 2 });

    const arg = (prisma.jobQueue.update as any).mock.calls[0][0];
    expect(arg.data.status).toBe('FAILED');
    expect(arg.data.error).toContain('Unknown job type');
  });
});
