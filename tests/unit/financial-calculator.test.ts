import { describe, it, expect } from 'vitest';
import { calculateScenario, calculateScenarios, FinancialInputs } from '@/lib/financial-calculator.js';

/**
 * Financial Calculator Tests — Pure Deterministic (No Mocks Needed)
 *
 * These tests validate the mathematical correctness of the financial
 * projections. Every number must be traceable.
 */

const sampleInputs: FinancialInputs = {
  rent: 15000000,              // IDR 15M/month
  propertySize: 50,            // 50 m²
  customersPerDay: 100,        // 100 customers/day
  averageTransaction: 35000,   // IDR 35K avg transaction
  operatingDays: 26,           // 26 days/month
  grossMargin: 0.65,           // 65%
  operatingCostMonthly: 20000000,  // IDR 20M/month (staff, utilities, etc.)
  initialInvestment: 200000000,    // IDR 200M initial
};

describe('Financial Calculator', () => {
  describe('calculateScenario', () => {
    it('should calculate BASE scenario correctly', () => {
      const result = calculateScenario(sampleInputs, 'BASE', 1.0);

      // Revenue = 100 × 35000 × 26 = 91,000,000
      expect(result.monthlyRevenue).toBe(91000000);

      // Gross Profit = 91,000,000 × 0.65 = 59,150,000
      expect(result.grossProfit).toBe(59150000);

      // Operating Profit = 59,150,000 - 15,000,000 - 20,000,000 = 24,150,000
      expect(result.operatingProfit).toBe(24150000);

      // Payback = 200,000,000 / 24,150,000 ≈ 8.3 months
      expect(result.paybackPeriodMonths).toBe(8.3);

      expect(result.isViable).toBe(true);
      expect(result.effectiveCustomersPerDay).toBe(100);
    });

    it('should calculate CONSERVATIVE scenario (70% customers)', () => {
      const result = calculateScenario(sampleInputs, 'CONSERVATIVE', 0.7);

      // Effective customers = round(100 × 0.7) = 70
      expect(result.effectiveCustomersPerDay).toBe(70);

      // Revenue = 70 × 35000 × 26 = 63,700,000
      expect(result.monthlyRevenue).toBe(63700000);

      // Gross Profit = 63,700,000 × 0.65 = 41,405,000
      expect(result.grossProfit).toBe(41405000);

      // Operating Profit = 41,405,000 - 15M - 20M = 6,405,000
      expect(result.operatingProfit).toBe(6405000);

      expect(result.isViable).toBe(true);
    });

    it('should mark scenario as not viable when operating profit is negative', () => {
      const toughInputs: FinancialInputs = {
        ...sampleInputs,
        customersPerDay: 20,  // Very low traffic
      };

      const result = calculateScenario(toughInputs, 'CONSERVATIVE', 0.7);

      // Effective customers = round(20 × 0.7) = 14
      expect(result.effectiveCustomersPerDay).toBe(14);

      // Revenue = 14 × 35000 × 26 = 12,740,000
      expect(result.monthlyRevenue).toBe(12740000);

      // Operating Profit will be negative
      expect(result.operatingProfit).toBeLessThan(0);
      expect(result.isViable).toBe(false);
      expect(result.paybackPeriodMonths).toBe(-1);
    });
  });

  describe('calculateScenarios', () => {
    it('should return all 3 scenarios', () => {
      const result = calculateScenarios(sampleInputs);

      expect(result.scenarios).toHaveLength(3);
      expect(result.scenarios[0].scenarioName).toBe('CONSERVATIVE');
      expect(result.scenarios[1].scenarioName).toBe('BASE');
      expect(result.scenarios[2].scenarioName).toBe('UPSIDE');
    });

    it('should calculate rent per sqm', () => {
      const result = calculateScenarios(sampleInputs);

      // 15,000,000 / 50 = 300,000
      expect(result.rentPerSqm).toBe(300000);
    });

    it('should have ascending revenue across scenarios', () => {
      const result = calculateScenarios(sampleInputs);

      expect(result.scenarios[0].monthlyRevenue).toBeLessThan(result.scenarios[1].monthlyRevenue);
      expect(result.scenarios[1].monthlyRevenue).toBeLessThan(result.scenarios[2].monthlyRevenue);
    });

    it('should preserve original inputs in output', () => {
      const result = calculateScenarios(sampleInputs);

      expect(result.inputs).toEqual(sampleInputs);
    });
  });
});
