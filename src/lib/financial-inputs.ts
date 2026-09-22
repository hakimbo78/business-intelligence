/**
 * Financial input definitions and validation.
 *
 * The payback period is the most consequential number in the report, so the
 * inputs behind it are defined in exactly one place: this module. The same
 * wording is used for the intake prompt, API errors, and the customer-facing
 * form, so a client cannot be asked one thing and scored on another.
 */

/**
 * What "initial investment" means for this product.
 *
 * Payback = Total Initial Investment / monthly operating profit. Rent is
 * already deducted inside operating profit, so including rent here would
 * double-count it and overstate the payback period.
 *
 * Maps to "Total Initial Investment" in PROJECT_MASTER_SPEC.md §12.
 */
export const INITIAL_INVESTMENT_DEFINITION_EN =
  'Total Initial Investment is all money spent before the business opens: rental deposit, ' +
  'renovation and interior, equipment and machinery, furniture, signage, permits and licensing, ' +
  'and opening stock. It EXCLUDES monthly rent, salaries and utilities, which are recurring ' +
  'operating costs counted separately.';

export const INITIAL_INVESTMENT_DEFINITION_ID =
  'Total Investasi Awal adalah seluruh uang yang dikeluarkan sebelum bisnis buka: deposit/uang ' +
  'jaminan sewa, renovasi dan interior, peralatan dan mesin, furniture, papan nama, perizinan, ' +
  'serta stok awal. TIDAK termasuk sewa bulanan, gaji, dan utilitas, karena ketiganya adalah ' +
  'biaya operasional berulang yang dihitung terpisah.';

/**
 * Assumed values used when the customer does not supply them.
 * Surfaced as explicit assumptions rather than silently applied
 * (DEVELOPMENT_RULES.md §11).
 */
export const ASSUMED_OPERATING_DAYS = 26;
export const ASSUMED_GROSS_MARGIN = 0.5;

export interface MissingFinancialInput {
  field: string;
  reason: string;
}

interface FinancialInputSources {
  businessProfile?: {
    currentAverageTransaction?: number | null;
    estimatedDailyCustomers?: number | null;
    operatingDays?: number | null;
    grossMargin?: number | null;
  } | null;
  locationSearch?: {
    estimatedInitialInvestment?: number | null;
    maximumMonthlyRent?: number | null;
  } | null;
}

/**
 * Inputs that must be present before financial analysis may run.
 *
 * A missing value is never substituted with 0: that would report an
 * instant payback and score the location as financially excellent on the
 * strength of data nobody ever provided.
 */
export function findMissingFinancialInputs(
  project: FinancialInputSources
): MissingFinancialInput[] {
  const bp = project.businessProfile;
  const ls = project.locationSearch;
  const missing: MissingFinancialInput[] = [];

  const isMissing = (value: number | null | undefined) =>
    value === null || value === undefined || value <= 0;

  if (isMissing(ls?.estimatedInitialInvestment)) {
    missing.push({
      field: 'locationSearch.estimatedInitialInvestment',
      reason: `Total Initial Investment is required to compute the payback period. ${INITIAL_INVESTMENT_DEFINITION_EN}`,
    });
  }

  if (isMissing(bp?.currentAverageTransaction)) {
    missing.push({
      field: 'businessProfile.currentAverageTransaction',
      reason: 'Average transaction value is required to estimate revenue.',
    });
  }

  if (isMissing(bp?.estimatedDailyCustomers)) {
    missing.push({
      field: 'businessProfile.estimatedDailyCustomers',
      reason: 'Estimated customers per day is required to estimate revenue.',
    });
  }

  return missing;
}

/**
 * Assumptions applied because the customer did not supply the value.
 * These do not block analysis, but must be shown in the report.
 */
export function describeFinancialAssumptions(project: FinancialInputSources): string[] {
  const bp = project.businessProfile;
  const assumptions: string[] = [];

  if (bp?.operatingDays === null || bp?.operatingDays === undefined) {
    assumptions.push(
      `ASSUMPTION: operating days not provided; assumed ${ASSUMED_OPERATING_DAYS} days per month.`
    );
  }
  if (bp?.grossMargin === null || bp?.grossMargin === undefined) {
    assumptions.push(
      `ASSUMPTION: gross margin not provided; assumed ${ASSUMED_GROSS_MARGIN * 100}%.`
    );
  }

  return assumptions;
}
