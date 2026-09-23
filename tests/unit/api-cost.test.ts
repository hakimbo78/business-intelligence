import { describe, it, expect } from 'vitest';
import {
  estimateCostUsd,
  isEnterpriseFieldMask,
  summariseUsage,
  formatCost,
  SKU_PRICING,
} from '@/lib/api-cost.js';

describe('Knowing what a call costs', () => {
  it('should price a census the way Google does', () => {
    // 45 Nearby Search calls at $32 per thousand.
    expect(estimateCostUsd('NEARBY_SEARCH_PRO', 45)).toBeCloseTo(1.44, 4);
    expect(estimateCostUsd('NEARBY_SEARCH_ENTERPRISE', 45)).toBeCloseTo(1.575, 4);
  });

  it('should charge nothing for the free metadata lookup', () => {
    expect(estimateCostUsd('STREET_VIEW_METADATA', 1000)).toBe(0);
  });

  it('should not round a single call up to a cent', () => {
    // Rounding each call to the nearest cent would inflate a census 10x.
    expect(estimateCostUsd('NEARBY_SEARCH_PRO', 1)).toBeCloseTo(0.032, 5);
  });
});

describe('The field mask that costs a tier', () => {
  it('should recognise the two fields that move a search to Enterprise', () => {
    expect(isEnterpriseFieldMask('places.id,places.displayName,places.location')).toBe(false);
    expect(isEnterpriseFieldMask('places.id,places.rating')).toBe(true);
    expect(isEnterpriseFieldMask('places.id,places.userRatingCount')).toBe(true);
  });

  it('should keep the Enterprise allowance at a fifth of Pro', () => {
    // The reason the census asks for the cheap mask at all.
    expect(SKU_PRICING.NEARBY_SEARCH_ENTERPRISE.freePerMonth).toBeLessThan(
      SKU_PRICING.NEARBY_SEARCH_PRO.freePerMonth
    );
  });
});

describe('Summarising a month of usage', () => {
  it('should say how much free allowance is left, which is what the owner steers by', () => {
    const summary = summariseUsage([
      { sku: 'NEARBY_SEARCH_PRO', calls: 1_200, estimatedCostUsd: 38.4 },
      { sku: 'GEOCODING', calls: 40, estimatedCostUsd: 0.2 },
    ]);

    const nearby = summary.perSku.find((s) => s.sku === 'NEARBY_SEARCH_PRO')!;
    expect(nearby.freeRemaining).toBe(3_800);
    expect(nearby.label).toContain('Pro');
    expect(summary.totalCalls).toBe(1_240);
  });

  it('should charge nothing while the free allowance covers the calls', () => {
    const summary = summariseUsage([
      { sku: 'NEARBY_SEARCH_PRO', calls: 1_000, estimatedCostUsd: 32 },
    ]);

    // Within the allowance the run rate is real but the invoice is not.
    expect(summary.totalCostUsd).toBe(32);
    expect(summary.billableCostUsd).toBe(0);
  });

  it('should charge for the calls past the allowance', () => {
    const summary = summariseUsage([
      { sku: 'NEARBY_SEARCH_ENTERPRISE', calls: 1_500, estimatedCostUsd: 52.5 },
    ]);

    // 500 calls past the 1,000 free at $35 per thousand.
    expect(summary.billableCostUsd).toBeCloseTo(17.5, 3);
  });
});

describe('Showing cost to an Indonesian reader', () => {
  it('should give both currencies and mark the rupiah as approximate', () => {
    expect(formatCost(1.44, 16_000)).toBe('US$ 1.44 (±Rp 23.040)');
  });
});
