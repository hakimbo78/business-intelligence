/**
 * Location Cost Calculator — Pure Deterministic Functions
 *
 * Implements the "Initial Location Investment" output of
 * PROJECT_MASTER_SPEC.md §12: the part of the start-up cost that varies with
 * which property is chosen (deposit, renovation), as opposed to equipment,
 * stock and permits, which are the same wherever the business opens.
 *
 * Deliberately has NO default cost assumptions. A deposit period and a
 * renovation rate vary by landlord, business type and city, so inventing them
 * would manufacture the exact kind of unsupported figure the product forbids
 * (DEVELOPMENT_RULES.md §9, PROJECT_MASTER_SPEC.md §24). When an assumption is
 * absent the corresponding component is simply left out, and the caller is told
 * the result is incomplete.
 */

export interface LocationCostAssumptions {
  /** Deposit expressed in months of rent, e.g. 3. */
  depositMonths?: number;
  /** Fit-out cost per square metre (IDR). */
  renovationCostPerSqm?: number;
}

export interface LocationInvestmentEstimate {
  /** Estimated Initial Location Investment (IDR), or null if nothing could be estimated. */
  amount: number | null;
  /**
   * True when at least one component could not be included, so `amount`
   * understates the real cost. A lower bound can still prove a candidate is
   * unaffordable, but never that it is affordable.
   */
  isLowerBound: boolean;
  /** Human-readable breakdown of what went into `amount`. */
  components: string[];
  /** What could not be computed, and why. */
  missing: string[];
}

export interface CandidateCostInputs {
  estimatedRent: number | null;
  propertySize: number | null;
}

/**
 * Estimate the Initial Location Investment for one candidate.
 */
export function estimateInitialLocationInvestment(
  candidate: CandidateCostInputs,
  assumptions: LocationCostAssumptions
): LocationInvestmentEstimate {
  const components: string[] = [];
  const missing: string[] = [];
  let amount = 0;
  let hasAnyComponent = false;

  // --- Deposit ---
  if (assumptions.depositMonths === undefined) {
    missing.push('deposit: depositMonths assumption not provided');
  } else if (candidate.estimatedRent === null) {
    missing.push('deposit: candidate has no estimated rent');
  } else {
    const deposit = candidate.estimatedRent * assumptions.depositMonths;
    amount += deposit;
    hasAnyComponent = true;
    components.push(
      `deposit: ${assumptions.depositMonths} months rent = ${Math.round(deposit)}`
    );
  }

  // --- Renovation ---
  if (assumptions.renovationCostPerSqm === undefined) {
    missing.push('renovation: renovationCostPerSqm assumption not provided');
  } else if (candidate.propertySize === null) {
    missing.push('renovation: candidate has no property size');
  } else {
    const renovation = candidate.propertySize * assumptions.renovationCostPerSqm;
    amount += renovation;
    hasAnyComponent = true;
    components.push(
      `renovation: ${candidate.propertySize} sqm = ${Math.round(renovation)}`
    );
  }

  return {
    amount: hasAnyComponent ? Math.round(amount) : null,
    isLowerBound: missing.length > 0,
    components,
    missing,
  };
}

/**
 * Describe the cost assumptions in force, for the report's assumption list.
 */
export function describeLocationCostAssumptions(
  assumptions: LocationCostAssumptions
): string[] {
  const out: string[] = [];
  if (assumptions.depositMonths !== undefined) {
    out.push(
      `ASSUMPTION: rental deposit assumed at ${assumptions.depositMonths} months of rent; requires field verification.`
    );
  }
  if (assumptions.renovationCostPerSqm !== undefined) {
    out.push(
      `ASSUMPTION: renovation assumed at ${assumptions.renovationCostPerSqm} per sqm; requires field verification.`
    );
  }
  return out;
}
