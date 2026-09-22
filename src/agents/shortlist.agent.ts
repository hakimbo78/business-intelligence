import { LocationCandidate } from '@prisma/client';
import { projectService } from '../services/project.service.js';
import { createLocationProvider } from '../providers/location/index.js';
import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import { getProjectTypeConfig } from '../lib/project-types.js';
import {
  estimateInitialLocationInvestment,
  describeLocationCostAssumptions,
  LocationCostAssumptions,
} from '../lib/location-cost.js';

export interface ShortlistFilterParams {
  maxDistanceMeters?: number;
  maxMonthlyRent?: number;
  minPropertySize?: number;
  maxPropertySize?: number;
  /** Ceiling on Initial Location Investment. Defaults to the project's maximumInitialInvestment. */
  maxInitialInvestment?: number;
  /** Cost assumptions required to estimate a candidate's location investment. */
  depositMonths?: number;
  renovationCostPerSqm?: number;
  topN?: number;
}

/**
 * What one funnel stage actually did.
 *
 * A filter that silently passes everything because the underlying data is
 * absent looks identical to a filter that genuinely found no problems. The
 * funnel in PROJECT_MASTER_SPEC.md §6 is only meaningful if the two are
 * distinguishable, so every stage reports whether it could run.
 */
export interface FilterOutcome {
  filter: 'radius' | 'rent' | 'size' | 'initial_investment';
  /** False when the filter could not run at all (e.g. no threshold configured). */
  applied: boolean;
  skippedReason?: string;
  /** Candidates remaining after this stage. */
  passed: number;
  /** Candidates this stage could not judge because their data is absent. */
  notEvaluated: number;
}

export interface ShortlistResult {
  totalAnalyzed: number;
  passedRadiusFilter: number;
  passedRentFilter: number;
  passedSizeFilter: number;
  passedInvestmentFilter: number;
  finalShortlisted: number;
  /** Per-stage detail, including stages that were inert for lack of data. */
  filters: FilterOutcome[];
  /** Cost assumptions in force, for the report's assumption list. */
  assumptions: string[];
  shortlistedCandidates: LocationCandidate[];
}

export class ShortlistAgent {
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * VALIDATION / COMPARISON: every premises the client supplied goes into the
   * report. Budget thresholds still matter, but as findings inside the report,
   * not as grounds for silently dropping the thing the client asked about.
   */
  private async assessAllClientPremises(
    projectId: string,
    candidates: LocationCandidate[],
    typeLabel: string
  ): Promise<ShortlistResult> {
    const ids = candidates.map((c) => c.id);
    await prisma.locationCandidate.updateMany({
      where: { id: { in: ids } },
      data: { status: 'SHORTLISTED' },
    });

    const notApplicable = (filter: FilterOutcome['filter']): FilterOutcome => ({
      filter,
      applied: false,
      skippedReason: `${typeLabel}: client-supplied premises are assessed, not filtered out`,
      passed: candidates.length,
      notEvaluated: 0,
    });

    const shortlistedCandidates = await prisma.locationCandidate.findMany({
      where: { id: { in: ids } },
    });

    logger.info(
      { projectId, typeLabel, premises: candidates.length },
      'All client-supplied premises carried into the report'
    );

    return {
      totalAnalyzed: candidates.length,
      passedRadiusFilter: candidates.length,
      passedRentFilter: candidates.length,
      passedSizeFilter: candidates.length,
      passedInvestmentFilter: candidates.length,
      finalShortlisted: candidates.length,
      filters: [
        notApplicable('radius'),
        notApplicable('rent'),
        notApplicable('size'),
        notApplicable('initial_investment'),
      ],
      assumptions: [],
      shortlistedCandidates,
    };
  }

  async filterCandidates(projectId: string, filters?: ShortlistFilterParams): Promise<ShortlistResult> {
    logger.info({ projectId, filters }, 'ShortlistAgent starting funnel filter');

    // 1. Fetch project and identified candidates
    const project = await projectService.getProject(projectId);
    
    if (!project.locationSearch) {
      throw new Error(`Project ${projectId} is missing LocationSearch data`);
    }

    const ls = project.locationSearch;
    
    const candidates = await prisma.locationCandidate.findMany({
      where: {
        projectId,
        status: 'IDENTIFIED'
      }
    });

    const typeConfig = getProjectTypeConfig(project.projectType);

    // The funnel in PROJECT_MASTER_SPEC.md §6 narrows a discovered pool down.
    // When the CLIENT supplied the premises there is nothing to narrow: they
    // asked whether their own choices hold up, and answering "we filtered yours
    // out" would not be an answer. Assess them all instead.
    if (!typeConfig.runsCandidateDiscovery && candidates.length > 0) {
      return await this.assessAllClientPremises(projectId, candidates, typeConfig.label);
    }

    if (candidates.length === 0) {
      return {
        totalAnalyzed: 0,
        passedRadiusFilter: 0,
        passedRentFilter: 0,
        passedSizeFilter: 0,
        passedInvestmentFilter: 0,
        finalShortlisted: 0,
        filters: [],
        assumptions: [],
        shortlistedCandidates: []
      };
    }

    // Prepare target center coordinates for radius calculation
    const targetQuery = ls.targetArea ? `${ls.targetArea}, ${ls.targetCity}` : ls.targetCity;
    const geocodeResult = await this.locationProvider.geocode({ address: targetQuery });
    const centerCoords = geocodeResult.data.location;

    // Apply defaults from LocationSearch if not provided
    const maxRadius = filters?.maxDistanceMeters ?? ls.preferredRadius ?? 5000;
    const maxRent = filters?.maxMonthlyRent ?? ls.maximumMonthlyRent ?? Infinity;
    // A *target* size is an aim, not a rejection threshold. Using it as a hard
    // floor silently discarded candidates that were merely smaller than ideal,
    // so only the explicit bounds from PROJECT_MASTER_SPEC.md §4 filter here.
    const minSize = filters?.minPropertySize ?? ls.minimumPropertySize ?? 0;
    const maxSize = filters?.maxPropertySize ?? ls.maximumPropertySize ?? Infinity;
    const maxInvestment = filters?.maxInitialInvestment ?? ls.maximumInitialInvestment ?? null;
    const limit = filters?.topN ?? typeConfig.reportCandidateLimit ?? candidates.length;

    const costAssumptions: LocationCostAssumptions = {
      depositMonths: filters?.depositMonths,
      renovationCostPerSqm: filters?.renovationCostPerSqm,
    };

    let currentPool = [...candidates];
    const totalAnalyzed = currentPool.length;
    const filterOutcomes: FilterOutcome[] = [];

    // 2. Radius Filter — always applicable, every candidate has coordinates.
    currentPool = currentPool.filter(c => {
      const distance = this.getDistanceMeters(
        centerCoords.latitude, centerCoords.longitude,
        c.latitude, c.longitude
      );
      return distance <= maxRadius;
    });
    const passedRadiusFilter = currentPool.length;
    filterOutcomes.push({
      filter: 'radius',
      applied: true,
      passed: passedRadiusFilter,
      notEvaluated: 0,
    });

    // 3. Rent Filter
    //
    // Candidates without rent data pass through rather than being dropped on a
    // guess — but they are counted, so an inert filter is visible in the result
    // instead of looking like a filter that found nothing wrong.
    let rentNotEvaluated = 0;
    currentPool = currentPool.filter(c => {
      if (c.estimatedRent === null) {
        rentNotEvaluated++;
        return true;
      }
      return c.estimatedRent <= maxRent;
    });
    const passedRentFilter = currentPool.length;
    filterOutcomes.push({
      filter: 'rent',
      applied: maxRent !== Infinity,
      skippedReason: maxRent === Infinity ? 'No maximum monthly rent configured' : undefined,
      passed: passedRentFilter,
      notEvaluated: rentNotEvaluated,
    });

    // 4. Size Filter
    const sizeBounded = minSize > 0 || maxSize !== Infinity;
    let sizeNotEvaluated = 0;
    currentPool = currentPool.filter(c => {
      if (c.propertySize === null) {
        sizeNotEvaluated++;
        return true;
      }
      return c.propertySize >= minSize && c.propertySize <= maxSize;
    });
    const passedSizeFilter = currentPool.length;
    filterOutcomes.push({
      filter: 'size',
      applied: sizeBounded,
      skippedReason: sizeBounded
        ? undefined
        : 'No minimum or maximum property size configured',
      passed: passedSizeFilter,
      notEvaluated: sizeNotEvaluated,
    });

    // 5. Initial Investment Filter
    //
    // Rejects a candidate only when its location cost ALONE already exceeds the
    // customer's total investment ceiling. That is a lower-bound test: failing
    // it proves the candidate is unaffordable, while passing it does not prove
    // the full budget is sufficient, since equipment, stock and permits are not
    // included here.
    let investmentNotEvaluated = 0;
    const investmentEstimates = new Map<string, number>();

    if (maxInvestment !== null) {
      currentPool = currentPool.filter(c => {
        const estimate = estimateInitialLocationInvestment(c, costAssumptions);
        if (estimate.amount === null) {
          investmentNotEvaluated++;
          return true;
        }
        investmentEstimates.set(c.id, estimate.amount);
        return estimate.amount <= maxInvestment;
      });
    } else {
      investmentNotEvaluated = currentPool.length;
    }

    const passedInvestmentFilter = currentPool.length;

    const investmentSkippedReason =
      maxInvestment === null
        ? 'No maximum initial investment configured on the project'
        : costAssumptions.depositMonths === undefined &&
            costAssumptions.renovationCostPerSqm === undefined
          ? 'No location cost assumptions supplied (depositMonths, renovationCostPerSqm)'
          : undefined;

    filterOutcomes.push({
      filter: 'initial_investment',
      applied: investmentEstimates.size > 0,
      skippedReason:
        investmentEstimates.size > 0
          ? undefined
          : (investmentSkippedReason ??
            'No candidate had the rent/size data needed to estimate location investment'),
      passed: passedInvestmentFilter,
      notEvaluated: investmentNotEvaluated,
    });

    // Persist the estimates so the report can explain a candidate's cost.
    for (const [candidateId, amount] of investmentEstimates) {
      await prisma.locationCandidate.update({
        where: { id: candidateId },
        data: { estimatedLocationInvestment: amount },
      });
    }

    // 6. Top N Selection (sort by rent ascending as a simple heuristic)
    currentPool.sort((a, b) => {
      const rentA = a.estimatedRent ?? Infinity;
      const rentB = b.estimatedRent ?? Infinity;
      return rentA - rentB;
    });
    
    const finalSelection = currentPool.slice(0, limit);
    const finalShortlisted = finalSelection.length;

    // 7. Update DB statuses
    const finalIds = finalSelection.map(c => c.id);
    
    // Mark passed as SHORTLISTED
    if (finalIds.length > 0) {
      await prisma.locationCandidate.updateMany({
        where: { id: { in: finalIds } },
        data: { status: 'SHORTLISTED' }
      });
    }

    // Mark others as REJECTED
    const rejectedIds = candidates
      .map(c => c.id)
      .filter(id => !finalIds.includes(id));

    if (rejectedIds.length > 0) {
      await prisma.locationCandidate.updateMany({
        where: { id: { in: rejectedIds } },
        data: { status: 'REJECTED' }
      });
    }

    // Refresh final models from DB to return
    const shortlistedCandidates = await prisma.locationCandidate.findMany({
      where: { id: { in: finalIds } }
    });

    const inertFilters = filterOutcomes.filter((f) => !f.applied).map((f) => f.filter);
    if (inertFilters.length > 0) {
      logger.warn(
        { projectId, inertFilters },
        'Shortlist funnel ran with filters that could not be applied'
      );
    }

    return {
      totalAnalyzed,
      passedRadiusFilter,
      passedRentFilter,
      passedSizeFilter,
      passedInvestmentFilter,
      finalShortlisted,
      filters: filterOutcomes,
      assumptions: describeLocationCostAssumptions(costAssumptions),
      shortlistedCandidates
    };
  }
}

export const shortlistAgent = new ShortlistAgent();
