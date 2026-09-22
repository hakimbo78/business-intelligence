import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportAgent } from '@/agents/report.agent.js';
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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    locationCandidate: {
      count: vi.fn(),
    },
    report: {
      create: vi.fn(),
      findFirst: vi.fn(),
    }
  }
}));

describe('Report Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate a comprehensive structured report', async () => {
    (prisma.project.findUnique as any).mockResolvedValueOnce({
      id: 'mock-project-id',
      name: 'Test Project',
      businessProfile: { businessName: 'Test Business' },
      locationSearch: { targetCity: 'Jakarta' },
      candidates: [
        { name: 'Shortlisted 1', estimatedRent: 1000, propertySize: 100 }
      ],
      competitors: [],
      scoringAnalysis: { overallScore: 85 }
    });

    (prisma.locationCandidate.count as any).mockResolvedValueOnce(50); // Total identified

    const result = await reportAgent.generateReport('mock-project-id');

    expect(result.projectMeta.projectName).toBe('Test Project');
    expect(result.candidates.totalIdentified).toBe(50);
    expect(result.candidates.shortlistedCount).toBe(1);
    
    // AI Synthesis fields (from mock AI provider)
    expect(result.synthesis.executiveSummary).toBeDefined();
    expect(result.synthesis.methodology).toBeDefined();
    expect(result.synthesis.assumptions.length).toBeGreaterThan(0);
    expect(result.synthesis.validationChecklist.length).toBeGreaterThan(0);

    // The §28 disclaimer is mandatory on every report.
    expect(result.disclaimer).toBe(REPORT_DISCLAIMER_EN);

    // Database interactions
    expect(prisma.report.create).toHaveBeenCalled();
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'REVIEW' }
      })
    );
  });

  it('should retrieve the latest report with its review status', async () => {
    (prisma.report.findFirst as any).mockResolvedValueOnce({
      id: 'report-1',
      projectId: 'mock-project-id',
      version: '1.0',
      status: 'REVIEW',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      contentJson: { projectMeta: { projectName: 'Stored Report' } }
    });

    const report = await reportAgent.getLatestReport('mock-project-id');
    expect(report).toBeDefined();
    // The owner dashboard needs `status` to decide whether it may still approve.
    expect(report?.status).toBe('REVIEW');
    expect(report?.contentJson.projectMeta.projectName).toBe('Stored Report');
  });

  it('should return null if no report exists', async () => {
    (prisma.report.findFirst as any).mockResolvedValueOnce(null);
    const report = await reportAgent.getLatestReport('mock-project-id');
    expect(report).toBeNull();
  });
});
