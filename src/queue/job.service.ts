import { prisma } from '../config/database.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '@prisma/client';

export class JobService {
  /**
   * Enqueue a new background job.
   */
  async enqueueJob(type: string, payload: any): Promise<string> {
    try {
      const job = await prisma.jobQueue.create({
        data: {
          type,
          payload: payload as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });
      
      logger.info({ jobId: job.id, type }, 'Enqueued new job');
      return job.id;
    } catch (error) {
      logger.error({ err: error, type }, 'Failed to enqueue job');
      throw error;
    }
  }

  /**
   * Check the status of a specific job.
   */
  async getJobStatus(jobId: string) {
    const job = await prisma.jobQueue.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        type: true,
        status: true,
        error: true,
        attempts: true,
        maxAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return job;
  }
}

export const jobService = new JobService();
