/**
 * Financial Calculator — Pure Deterministic Functions
 *
 * Per AGENT_ORCHESTRATION_SPEC.md §12:
 * "Calls deterministic financial functions."
 *
 * No AI/LLM is used here. All calculations are transparent,
 * traceable, and auditable.
 */

export interface FinancialInputs {
  /** Monthly rent (IDR) */
  rent: number;
  /** Property size (m²) */
  propertySize: number;
  /** Estimated customers per day */
  customersPerDay: number;
  /** Average transaction value (IDR) */
  averageTransaction: number;
  /** Operating days per month */
  operatingDays: number;
  /** Gross margin as a decimal (e.g. 0.65 = 65%) */
  grossMargin: number;
  /** Monthly operating cost excluding rent (IDR) */
  operatingCostMonthly: number;
  /**
   * Total Initial Investment (IDR): deposit, renovation, equipment, furniture,
   * signage, permits and opening stock. Excludes rent, which is already
   * deducted from operating profit via `rent` — including it here would
   * double-count it. See lib/financial-inputs.ts for the customer-facing wording.
   */
  initialInvestment: number;
}

export interface ScenarioResult {
  scenarioName: 'CONSERVATIVE' | 'BASE' | 'UPSIDE';
  customerMultiplier: number;
  effectiveCustomersPerDay: number;
  monthlyRevenue: number;
  grossProfit: number;
  operatingProfit: number;
  breakEvenDailyCustomers: number;
  paybackPeriodMonths: number;
  isViable: boolean;
}

export interface FinancialAnalysisResult {
  inputs: FinancialInputs;
  scenarios: ScenarioResult[];
  rentPerSqm: number;
}

/**
 * Calculate a single financial scenario.
 */
export function calculateScenario(
  inputs: FinancialInputs,
  scenarioName: ScenarioResult['scenarioName'],
  customerMultiplier: number
): ScenarioResult {
  const effectiveCustomersPerDay = Math.round(inputs.customersPerDay * customerMultiplier);

  // Revenue = customers/day × avgTransaction × operatingDays/month
  const monthlyRevenue = effectiveCustomersPerDay * inputs.averageTransaction * inputs.operatingDays;

  // Gross Profit = Revenue × Gross Margin
  const grossProfit = monthlyRevenue * inputs.grossMargin;

  // Operating Profit = Gross Profit − Rent − Other Operating Costs
  const operatingProfit = grossProfit - inputs.rent - inputs.operatingCostMonthly;

  // Break-even daily customers = Fixed Costs / (AvgTransaction × GrossMargin × OperatingDays)
  const revenuePerCustomerDay = inputs.averageTransaction * inputs.grossMargin * inputs.operatingDays;
  const fixedCosts = inputs.rent + inputs.operatingCostMonthly;
  const breakEvenDailyCustomers = revenuePerCustomerDay > 0
    ? Math.ceil(fixedCosts / revenuePerCustomerDay)
    : 0;

  // Payback period (months) = Initial Investment / monthly operating profit
  const paybackPeriodMonths = operatingProfit > 0
    ? Math.round((inputs.initialInvestment / operatingProfit) * 10) / 10
    : -1; // -1 indicates not viable (never pays back)

  const isViable = operatingProfit > 0;

  return {
    scenarioName,
    customerMultiplier,
    effectiveCustomersPerDay,
    monthlyRevenue,
    grossProfit,
    operatingProfit,
    breakEvenDailyCustomers,
    paybackPeriodMonths,
    isViable,
  };
}

/**
 * Calculate all three financial scenarios.
 *
 * Per BUILD_ROADMAP.md Phase 9:
 * - Conservative (70% of estimated customers)
 * - Base (100%)
 * - Upside (130%)
 */
export function calculateScenarios(inputs: FinancialInputs): FinancialAnalysisResult {
  const scenarios: ScenarioResult[] = [
    calculateScenario(inputs, 'CONSERVATIVE', 0.7),
    calculateScenario(inputs, 'BASE', 1.0),
    calculateScenario(inputs, 'UPSIDE', 1.3),
  ];

  const rentPerSqm = inputs.propertySize > 0
    ? Math.round(inputs.rent / inputs.propertySize)
    : 0;

  return {
    inputs,
    scenarios,
    rentPerSqm,
  };
}
