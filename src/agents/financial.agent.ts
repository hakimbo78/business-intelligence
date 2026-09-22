import { projectService } from '../services/project.service.js';
import { calculateScenarios, FinancialInputs, FinancialAnalysisResult } from '../lib/financial-calculator.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';
import {
  findMissingFinancialInputs,
  describeFinancialAssumptions,
  describeRentBasis,
  describeOperatingCostBasis,
  resolveRent,
  ASSUMED_OPERATING_DAYS,
  ASSUMED_GROSS_MARGIN,
} from '../lib/financial-inputs.js';

/**
 * Financial Agent — Deterministic (No AI)
 *
 * Per AGENT_ORCHESTRATION_SPEC.md §12:
 * "Calls deterministic financial functions."
 *
 * This agent extracts financial inputs from the project's
 * BusinessProfile and LocationSearch, then runs pure math.
 */
export class FinancialAgent {

  async analyzeFinancials(
    projectId: string,
    overrides?: Partial<FinancialInputs>
  ): Promise<FinancialAnalysisResult & { assumptions: string[] }> {
    logger.info({ projectId }, 'FinancialAgent calculating financial projections');

    // 1. Fetch project
    const project = await projectService.getProject(projectId);

    if (!project.businessProfile || !project.locationSearch) {
      throw new Error(`Project ${projectId} is missing required data (BusinessProfile or LocationSearch)`);
    }

    const bp = project.businessProfile;
    const ls = project.locationSearch;

    // 2. Refuse to model on absent data.
    //
    // Defaulting a missing initial investment to 0 produced a payback period of
    // 0 months, which the scoring engine then rewarded with a 90/100 financial
    // fit. Prefer a hard failure over a fabricated number
    // (PROJECT_MASTER_SPEC.md §24).
    const missing = findMissingFinancialInputs(project).filter((m) => {
      if (m.field === 'locationSearch.estimatedInitialInvestment') {
        return overrides?.initialInvestment === undefined;
      }
      if (m.field === 'businessProfile.currentAverageTransaction') {
        return overrides?.averageTransaction === undefined;
      }
      if (m.field === 'businessProfile.estimatedDailyCustomers') {
        return overrides?.customersPerDay === undefined;
      }
      return true;
    });

    if (missing.length > 0) {
      const detail = missing.map((m) => `  - ${m.field}: ${m.reason}`).join('\n');
      throw new Error(
        `Project ${projectId} cannot be analysed financially. Missing required input(s):\n${detail}`
      );
    }

    // 3. Map project data to financial inputs (allow overrides for what-if).
    //
    // `estimatedInitialInvestment` is the customer's planned Total Initial
    // Investment. `maximumInitialInvestment` is only a budget ceiling used to
    // filter candidates, and is deliberately NOT used here.
    //
    // When the client named the premises, its rent and size ARE the facts of
    // the case. Falling back to their budget ceiling would model a different
    // property: rent would drop out of operating profit entirely and the
    // payback period would look far better than the premises deserves.
    const premises = project.candidates.length === 1 ? project.candidates[0] : null;

    const resolvedRent = resolveRent({
      override: overrides?.rent,
      premisesRent: premises?.estimatedRent,
      budgetCeiling: ls.maximumMonthlyRent,
    });

    const inputs: FinancialInputs = {
      rent: resolvedRent.rent,
      propertySize:
        overrides?.propertySize ?? premises?.propertySize ?? ls.targetPropertySize ?? 0,
      customersPerDay: overrides?.customersPerDay ?? bp.estimatedDailyCustomers ?? 0,
      averageTransaction: overrides?.averageTransaction ?? bp.currentAverageTransaction ?? 0,
      operatingDays: overrides?.operatingDays ?? bp.operatingDays ?? ASSUMED_OPERATING_DAYS,
      grossMargin: overrides?.grossMargin ?? bp.grossMargin ?? ASSUMED_GROSS_MARGIN,
      operatingCostMonthly:
        overrides?.operatingCostMonthly ?? bp.operatingCostMonthly ?? 0,
      initialInvestment: overrides?.initialInvestment ?? ls.estimatedInitialInvestment ?? 0,
    };

    // 4. Calculate (pure deterministic — no AI)
    const result = calculateScenarios(inputs);

    // Any value the customer did not supply is recorded as an explicit
    // assumption rather than presented as fact (DEVELOPMENT_RULES.md §11).
    const analysis = {
      ...result,
      assumptions: [
        ...describeFinancialAssumptions(project),
        ...describeRentBasis(resolvedRent.basis, premises !== null),
        ...describeOperatingCostBasis(inputs.operatingCostMonthly),
      ],
    };

    // 5. Save to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { financialAnalysis: analysis as any },
    });

    return analysis;
  }
}

export const financialAgent = new FinancialAgent();
