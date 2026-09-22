import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qaAgent } from '@/agents/qa.agent.js';
import { prisma } from '@/config/database.js';
import { REPORT_DISCLAIMER_EN } from '@/lib/disclaimer.js';

vi.mock('@/config/environment.js', () => ({
  env: {
    AI_PROVIDER: 'mock',
  }
}));

vi.mock('@/config/database.js', () => ({
  prisma: {
    project: {
      update: vi.fn(),
    },
    report: {
      findFirst: vi.fn(),
      update: vi.fn(),
    }
  }
}));

describe('QA Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass a valid report and leave it awaiting owner approval', async () => {
    (prisma.report.findFirst as any).mockResolvedValueOnce({
      id: 'mock-report-id',
      contentJson: {
        disclaimer: REPORT_DISCLAIMER_EN,
        synthesis: { executiveSummary: 'Valid report' },
      }
    });

    const result = await qaAgent.reviewProject('mock-project-id');

    expect(result.isApproved).toBe(true);

    // A QA pass must NOT deliver. The owner holds final authority
    // (PROJECT_MASTER_SPEC.md §35).
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-report-id' },
        // The verdict is stored with the report so the owner can see it later.
        data: expect.objectContaining({ status: 'REVIEW', qaReview: expect.anything() })
      })
    );

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { status: 'REVIEW' }
      })
    );

    // Nothing in the QA path may mark the project as delivered.
    expect(prisma.project.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DELIVERED' } })
    );
  });

  it('should reject a report whose mandatory disclaimer is missing', async () => {
    (prisma.report.findFirst as any).mockResolvedValueOnce({
      id: 'mock-report-id',
      contentJson: { synthesis: { executiveSummary: 'Missing the disclaimer' } }
    });

    const result = await qaAgent.reviewProject('mock-project-id');

    // The mock AI provider approves, but the deterministic gate overrides it.
    expect(result.isApproved).toBe(false);
    expect(result.issues.join(' ')).toMatch(/disclaimer/i);

    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-report-id' },
        data: expect.objectContaining({ status: 'DRAFT', qaReview: expect.anything() })
      })
    );

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-project-id' },
        data: { status: 'NEEDS_REVISION' }
      })
    );
  });

  it('should reject a report whose disclaimer has been altered', async () => {
    (prisma.report.findFirst as any).mockResolvedValueOnce({
      id: 'mock-report-id',
      contentJson: {
        disclaimer: 'This report guarantees your business will succeed.',
        synthesis: { executiveSummary: 'Tampered disclaimer' },
      }
    });

    const result = await qaAgent.reviewProject('mock-project-id');

    expect(result.isApproved).toBe(false);
    expect(result.issues.join(' ')).toMatch(/disclaimer/i);
  });

  it('should throw error if no report exists', async () => {
    (prisma.report.findFirst as any).mockResolvedValueOnce(null);

    await expect(qaAgent.reviewProject('mock-project-id'))
      .rejects.toThrow('No generated report found');
  });
});
