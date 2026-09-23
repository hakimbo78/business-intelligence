import { z } from 'zod';
import { env } from '../config/environment.js';
import { createAIProvider } from '../providers/ai/index.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import { REPORT_DISCLAIMER_EN } from '../lib/disclaimer.js';
import { summariseLocationCost, type LocationCostSummary } from '../lib/location-cost.js';
import {
  describeRoad,
  describeGeocodePrecision,
  type GeocodePrecision,
  type RoadContext,
} from '../lib/road-context.js';
import { imageryService } from '../services/imagery.service.js';
import { osmRoadService, OSM_ATTRIBUTION } from '../services/osm-road.service.js';
import { populationService, WORLDPOP_ATTRIBUTION, type PopulationContext } from '../services/population.service.js';
import type { OsmRoadContext } from '../lib/osm-road.js';
import {
  resolveTradeProfile,
  describeTradeProfile,
  assessOccupancy,
  type TradeProfile,
  type OccupancyAssessment,
} from '../lib/trade-profile.js';
import { assessMarketShare, type MarketShareRequirement } from '../lib/market-share.js';
import { decideVerdict, type DecisionVerdict } from '../lib/decision-verdict.js';
import {
  checkInputPlausibility,
  summarisePlausibility,
  type PlausibilityIssue,
} from '../lib/input-plausibility.js';
import { reachabilityService } from '../services/reachability.service.js';
import type { Reachability } from '../lib/isochrone.js';
import type { LocationImagery } from '../lib/imagery.js';

/**
 * Pull the road out of a free-text address.
 *
 * The premises address is stored as the client typed it, so the road is
 * whatever precedes the house number.
 */
function extractRoadName(address: string | null | undefined): string | null {
  // Report generation must not fall over on an address that is missing.
  if (!address) return null;

  const match = address.match(/^([^,]*?)(?:\s+No\.?\s*\d.*)?(?:,|$)/i);
  const road = match?.[1]?.trim();
  return road && road.length > 3 ? road : null;
}

/** Distance in metres between two coordinates. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  /**
   * What kind of road the premises faces. A shopfront on a through road and
   * one down a gang are different businesses.
   */
  road: RoadContext | null;
  /**
   * The same question answered from OpenStreetMap, which knows things a name
   * cannot reveal: the official class, the traffic direction, the surface.
   * Null when OSM could not be reached.
   */
  osmRoad: OsmRoadContext | null;
  /**
   * The trade this business belongs to, and the assumptions that follow.
   *
   * Printed rather than applied silently: the radii and rent bands are retail
   * rules of thumb, not measurements, and the client may replace them.
   */
  tradeProfile: {
    label: string;
    catchmentRadiusMeters: number;
    notes: string[];
  } | null;
  /** Residents around the premises, from WorldPop. */
  population: PopulationContext | null;
  /**
   * How much of that catchment the road network actually serves.
   *
   * A circle counts people across the river; this measures the ones who can
   * get here along a road. Null when the network could not be read.
   */
  reachability: Reachability | null;
  /** The share of the local market this business must win to break even. */
  marketShare: MarketShareRequirement | null;
  /** Whether the rent is survivable for this trade. */
  occupancy: OccupancyAssessment | null;
  /**
   * The client's own figures that sit far outside the trade's norms.
   *
   * Printed because every financial number descends from them. The report
   * never changes them; it refuses to stay silent about them.
   */
  plausibility: { issues: PlausibilityIssue[]; summary: string | null } | null;
  /**
   * Whether this location is worth the cost of a field survey.
   *
   * The narrowest decision the evidence can actually settle, and the line the
   * client acts on. A score leaves the reader to interpret it; this does not.
   */
  decision: DecisionVerdict | null;
  /** Sources that require attribution by licence. */
  attributions: string[];
  /**
   * How precisely the premises could be located.
   *
   * Carried at the top level rather than inside the road section, because a
   * road-midpoint geocode invalidates every distance in the report, not just
   * the road reading.
   */
  precision: GeocodePrecision | null;
  /**
   * A photograph of the frontage and a map with the competitors pinned.
   *
   * The road reading above is inferred from a name and the neighbours; a
   * photograph shows the width, the parking and the frontage that the inference
   * explicitly cannot see. Null when imagery is switched off.
   */
  imagery: LocationImagery | null;
  synthesis: ReportSynthesis;
  candidates: {
    totalIdentified: number;
    shortlistedCount: number;
    shortlisted: any[];
  };
  /**
   * The competitors actually found, named.
   *
   * "30 direct competitors" is a claim; a list with names, distances and review
   * counts is evidence the customer can go and check.
   */
  competitors: Array<{
    name: string;
    category: string;
    distanceMeters: number | null;
    rating: number | null;
    reviewCount: number | null;
  }>;
  /** The ten scoring dimensions with the evidence behind each. */
  scoreBreakdown: Array<{ dimension: string; score: number; evidence: string }>;
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
  qaReview: {
    isApproved: boolean;
    issues: string[];
    advisoryConcerns?: string[];
    confidenceScore?: number;
  } | null;
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

WRITE EVERY FIELD IN INDONESIAN (Bahasa Indonesia). The reader is an Indonesian
business owner. Use plain business Indonesian, not translated English idiom.
Keep figures in Rupiah formatted as Rp 1.234.567.

Ground every statement in the data below. Do not soften a bad result: if the
scenarios lose money, say so plainly in the first sentence. Never promise an
outcome — avoid "pasti berhasil", "dijamin", "lokasi terbaik".

The revenue figures rest entirely on a customer count the client estimated
themselves. If the sensitivity analysis shows a thin margin of safety, or an
estimate below break-even, say so in the executive summary — that is more
useful than restating the projection.

The validation checklist must be specific to THIS location and business, not
generic advice. Good items name what to count, when, and where: jumlah orang
lewat pada jam 07.00-09.00 di depan properti, tarif sewa aktual dari pemilik,
biaya deposit dan ketentuan sewa, ketersediaan parkir, riwayat banjir di ruas
jalan tersebut.
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

    // Name the competitors rather than only counting them. Nearest first, since
    // proximity is what makes one matter.
    const assessedForDistance = project.candidates[0] ?? null;
    const competitors = project.competitors
      .map((c) => ({
        name: c.name,
        category: c.category,
        distanceMeters: assessedForDistance
          ? Math.round(
              haversineMeters(
                assessedForDistance.latitude,
                assessedForDistance.longitude,
                c.latitude,
                c.longitude
              )
            )
          : null,
        rating: c.rating,
        reviewCount: c.reviewCount,
      }))
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
      .slice(0, 20);

    const scoring = project.scoringAnalysis as { dimensions?: Array<{ dimension: string; score: number; evidence: string }> } | null;
    const scoreBreakdown = scoring?.dimensions ?? [];

    // Road context costs nothing extra: it reads the road name already returned
    // when the premises was geocoded, and the competitor addresses already held.
    const assessed = project.candidates.length === 1 ? project.candidates[0] : null;
    // The geocoder's own road name beats parsing the free text the client
    // typed: "Jl. Tole iskandar depok 2" parses to a road that does not exist,
    // while the geocoder returns "Jalan Tole Iskandar".
    const road = assessed
      ? describeRoad({
          roadName: assessed.geocodedRoadName ?? extractRoadName(assessed.address),
          addressPrecision: assessed.geocodePrecision,
          nearbyAddresses: project.competitors
            .map((c) => c.address)
            .filter((a): a is string => Boolean(a)),
        })
      : null;

    const precision = assessed ? describeGeocodePrecision(assessed.geocodePrecision) : null;
    // Billed Google products, so only for a single assessed premises, and only
    // once — the result is stored in the report and reused by every later PDF.
    const imagery = assessed
      ? await imageryService.capture({
          premises: { latitude: assessed.latitude, longitude: assessed.longitude },
          competitors: project.competitors,
          projectId,
        })
      : null;

    // What kind of business this is decides how far its customers travel, which
    // decides the catchment, which decides every market figure below.
    const profile = resolveTradeProfile([
      project.businessProfile?.businessCategory,
      project.businessProfile?.businessSubcategory,
    ]);

    // A candidate without usable coordinates skips the external lookups rather
    // than failing a report the client has already paid for.
    const premisesPoint =
      assessed && Number.isFinite(assessed.latitude) && Number.isFinite(assessed.longitude)
        ? { latitude: assessed.latitude, longitude: assessed.longitude }
        : null;

    // Free sources, so both are attempted for every report; each degrades to
    // null rather than failing the report.
    const osmRoad = premisesPoint
      ? await osmRoadService.describe(premisesPoint, {
          preferredName: assessed?.geocodedRoadName,
          projectId,
        })
      : null;

    const population = premisesPoint
      ? await populationService.describe(premisesPoint, profile.catchmentRadiusMeters, projectId)
      : null;

    const reachability = premisesPoint
      ? await reachabilityService.measure(premisesPoint, profile.catchmentRadiusMeters, projectId)
      : null;

    const sensitivity = (project.financialAnalysis as any)?.sensitivity;
    const competitionCount = (project.competitionAnalysis as any)?.count;

    const marketShare =
      sensitivity?.breakEvenCustomersPerDay !== undefined && population
        ? assessMarketShare({
            profile,
            catchmentPopulation: population.catchmentPopulation,
            reachableFraction: reachability?.fraction ?? null,
            competitorCount: competitionCount?.found ?? project.competitors.length,
            competitorCountIsMinimum: competitionCount?.capped ?? false,
            breakEvenCustomersPerDay: sensitivity.breakEvenCustomersPerDay,
            operatingDays: project.businessProfile?.operatingDays ?? 26,
          })
        : null;

    const premises = assessed
      ? {
          name: assessed.name,
          address: assessed.address,
          propertyType: assessed.propertyType,
          confidence: assessed.confidence,
          cost: summariseLocationCost(assessed, baseRevenue),
        }
      : null;

    const occupancy = premises ? assessOccupancy(premises.cost.occupancyCostRatio, profile) : null;

    // The client's own figures get the same scrutiny as the data we fetch.
    const financialInputs = (project.financialAnalysis as any)?.inputs ?? {};
    const baseScenario = (project.financialAnalysis as any)?.scenarios?.find(
      (s: any) => s.scenarioName === 'BASE'
    );

    const plausibilityIssues = premises
      ? checkInputPlausibility({
          profile,
          averageTransaction: financialInputs.averageTransaction ?? null,
          customersPerDay: financialInputs.customersPerDay ?? null,
          occupancyRatioPercent: premises.cost.occupancyCostRatio,
          paybackMonths:
            baseScenario?.paybackPeriodMonths > 0 ? baseScenario.paybackPeriodMonths : null,
          breakEvenCustomersPerDay: sensitivity?.breakEvenCustomersPerDay ?? null,
        })
      : [];

    // The verdict reads the measurements; it never asks the model.
    const decision = decideVerdict({
      baseIsViable:
        (project.financialAnalysis as any)?.scenarios?.find((s: any) => s.scenarioName === 'BASE')
          ?.isViable ?? null,
      occupancy,
      marketShare,
      precisionLevel: precision?.level ?? null,
      quotedRent: assessed?.estimatedRent ?? null,
      maxAffordableRent: sensitivity?.maxAffordableRent ?? null,
      competitorCountIsMinimum: competitionCount?.capped ?? false,
      plausibilityIssues,
    });

    const attributions = [
      ...(osmRoad ? [OSM_ATTRIBUTION] : []),
      ...(population && population.rings.length > 0 ? [WORLDPOP_ATTRIBUTION] : []),
    ];

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
      road,
      osmRoad,
      tradeProfile: {
        label: profile.label,
        catchmentRadiusMeters: profile.catchmentRadiusMeters,
        notes: describeTradeProfile(profile),
      },
      population,
      reachability,
      marketShare,
      occupancy,
      plausibility: premises
        ? { issues: plausibilityIssues, summary: summarisePlausibility(plausibilityIssues) }
        : null,
      decision,
      attributions,
      precision,
      imagery,
      synthesis,
      candidates: {
        totalIdentified,
        shortlistedCount: project.candidates.length,
        shortlisted: project.candidates,
      },
      competitors,
      scoreBreakdown,
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
