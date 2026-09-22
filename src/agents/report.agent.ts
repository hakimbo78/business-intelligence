import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import { REPORT_DISCLAIMER_EN } from '../lib/disclaimer.js';
import { summariseLocationCost, type LocationCostSummary } from '../lib/location-cost.js';

export const reportSynthesisSchema = z.object({
  executiveSummary: z.string().describe('A strong, single-paragraph executive summary of the business intelligence analysis.'),
  methodology: z.string().describe('A brief explanation of how the data was gathered and analyzed.'),
  assumptions: z.array(z.string()).describe('Key assumptions made during the financial and market analysis.'),
  validationChecklist: z.array(z.string()).describe('Actionable checklist for the field team to verify on-site.'),
});

export type ReportSynthesis = z.infer<typeof reportSynthesisSchema>;

export interface StructuredReport {
  projectMeta: {
    projectId: string;
    projectName: string;
    businessName: string | undefined;
    targetArea: string | undefined;
    generatedAt: string;
  };
  /** Mandatory legal disclaimer (PROJECT_MASTER_SPEC.md §28). */
  disclaimer: string;
  /**
   * The premises under assessment, for VALIDATION orders.
   *
   * Without this the report never describes the property the client is paying
   * to have judged. Null for AREA_SCOUTING, which recommends areas.
   */
  premises: {
    name: string;
    address: string;
    propertyType: string | null;
    confidence: string;
    cost: LocationCostSummary;
  } | null;
  synthesis: ReportSynthesis;
  candidates: {
    totalIdentified: number;
    shortlistedCount: number;
    shortlisted: any[];
  };
  analysis: {
    demand: any;
    competition: any;
    marketGap: any;
    accessibility: any;
    financial: any;
    scoring: any;
  };
}

/**
 * A stored report row plus its typed content.
 *
 * The API returns this wrapper rather than the bare content, because callers
 * (notably the owner-approval dashboard) need the report's `status` to decide
 * whether it may still be approved or rejected.
 */
export interface ReportRecord {
  id: string;
  projectId: string;
  version: string;
  status: string;
  createdAt: Date;
  contentJson: StructuredReport;
  /** Why a report was held back, when it was. */
  qaReview: { isApproved: boolean; issues: string[]; confidenceScore?: number } | null;
}

export class ReportAgent {
  private aiProvider = createAIProvider(env.AI_PROVIDER);

  async generateReport(projectId: string): Promise<StructuredReport> {
    logger.info({ projectId }, 'ReportAgent starting report generation');

    // 1. Fetch comprehensive project data
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        businessProfile: true,
        locationSearch: true,
        candidates: {
          where: { status: 'SHORTLISTED' },
          include: { financialScenarios: true }
        },
        competitors: true,
      }
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const totalIdentified = await prisma.locationCandidate.count({
      where: { projectId }
    });

    // 2. Synthesize with AI
    // We pass a summary of the data to the LLM so it doesn't get overwhelmed with token limits,
    // but enough to write a good executive summary.
    const prompt = `You are a Report Synthesis Agent.
Review the following business intelligence data and write a highly professional Executive Summary, methodology, key assumptions, and a field validation checklist.

BUSINESS PROFILE:
${JSON.stringify(project.businessProfile, null, 2)}

LOCATION TARGET:
${JSON.stringify(project.locationSearch, null, 2)}

SCORING:
${JSON.stringify(project.scoringAnalysis, null, 2)}

FINANCIALS:
${JSON.stringify(project.financialAnalysis, null, 2)}

SHORTLISTED CANDIDATES (${project.candidates.length}):
${JSON.stringify(project.candidates.map(c => ({ name: c.name, rent: c.estimatedRent, size: c.propertySize })), null, 2)}
`;

    const synthesis = await this.aiProvider.generateStructuredData<ReportSynthesis>(
      prompt,
      reportSynthesisSchema,
      'ReportSynthesis'
    );

    // 3. Describe the premises being assessed.
    //
    // All of this is already established elsewhere; the report simply failed to
    // carry it, so a validation report never mentioned the property at all.
    const financial = project.financialAnalysis as { scenarios?: Array<{ scenarioName: string; monthlyRevenue: number }> } | null;
    const baseRevenue =
      financial?.scenarios?.find((s) => s.scenarioName === 'BASE')?.monthlyRevenue ?? null;

    const assessed = project.candidates.length === 1 ? project.candidates[0] : null;
    const premises = assessed
      ? {
          name: assessed.name,
          address: assessed.address,
          propertyType: assessed.propertyType,
          confidence: assessed.confidence,
          cost: summariseLocationCost(assessed, baseRevenue),
        }
      : null;

    // 4. Compile final structured report
    const reportData: StructuredReport = {
      projectMeta: {
        projectId: project.id,
        projectName: project.name,
        businessName: project.businessProfile?.businessName,
        targetArea: project.locationSearch?.targetCity,
        generatedAt: new Date().toISOString(),
      },
      disclaimer: REPORT_DISCLAIMER_EN,
      premises,
      synthesis,
      candidates: {
        totalIdentified,
        shortlistedCount: project.candidates.length,
        shortlisted: project.candidates,
      },
      analysis: {
        demand: project.demandAnalysis,
        competition: project.competitionAnalysis,
        marketGap: project.marketGapAnalysis,
        accessibility: project.accessibilityAnalysis,
        financial: project.financialAnalysis,
        scoring: project.scoringAnalysis,
      }
    };

    // 5. Save to DB
    await prisma.report.create({
      data: {
        projectId,
        version: '1.0',
        status: 'REVIEW',
        contentJson: reportData as any,
      }
    });

    // 6. Update Project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'REVIEW' }
    });

    return reportData;
  }

  async getLatestReport(projectId: string): Promise<ReportRecord | null> {
    const report = await prisma.report.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });

    if (!report || !report.contentJson) return null;

    return {
      id: report.id,
      projectId: report.projectId,
      version: report.version,
      status: report.status,
      createdAt: report.createdAt,
      contentJson: report.contentJson as unknown as StructuredReport,
      qaReview: (report.qaReview as ReportRecord['qaReview']) ?? null,
    };
  }
}

export const reportAgent = new ReportAgent();
