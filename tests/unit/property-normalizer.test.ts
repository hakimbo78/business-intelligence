import { describe, it, expect } from 'vitest';
import {
  normalizeProperty,
  PropertyNormalizationError,
  PERMITTED_PROPERTY_SOURCES,
} from '@/lib/property-normalizer.js';

const base = {
  source: 'AGENT_SUBMITTED',
  address: 'Jl. Kemang Raya No. 1',
  latitude: -6.261,
  longitude: 106.816,
};

describe('Property normalization', () => {
  it('should derive a monthly rent from an annual quote and flag it', () => {
    const result = normalizeProperty({ ...base, annualRent: 240_000_000 });

    // Indonesian commercial leases are routinely quoted per year.
    expect(result.monthlyRent).toBe(20_000_000);
    expect(result.rentIsDerived).toBe(true);
    expect(result.notes.join(' ')).toContain('derived from a stated annual rent');
  });

  it('should fill the annual figure from a monthly quote without flagging it', () => {
    const result = normalizeProperty({ ...base, monthlyRent: 20_000_000 });

    expect(result.annualRent).toBe(240_000_000);
    expect(result.rentIsDerived).toBe(false);
  });

  it('should leave an unstated rent empty rather than estimating one', () => {
    const result = normalizeProperty({ ...base });

    expect(result.monthlyRent).toBeUndefined();
    expect(result.notes.join(' ')).toContain('left empty rather than estimated');
  });

  it('should leave an unstated size empty rather than estimating one', () => {
    const result = normalizeProperty({ ...base, monthlyRent: 1 });

    expect(result.sizeSqm).toBeUndefined();
    expect(result.notes.join(' ')).toContain('Size not stated');
  });

  it('should reject a source the spec does not permit', () => {
    // Marketplace scraping is explicitly disallowed by PROJECT_MASTER_SPEC.md §7.
    expect(() => normalizeProperty({ ...base, source: 'SCRAPED_MARKETPLACE' }))
      .toThrow(PropertyNormalizationError);
    expect(() => normalizeProperty({ ...base, source: 'SCRAPED_MARKETPLACE' }))
      .toThrow(/not permitted/);
  });

  it('should not list scraping among the permitted sources', () => {
    expect(PERMITTED_PROPERTY_SOURCES.join(' ')).not.toMatch(/SCRAPE/i);
  });

  it('should accept every permitted source', () => {
    for (const source of PERMITTED_PROPERTY_SOURCES) {
      expect(normalizeProperty({ ...base, source }).source).toBe(source);
    }
  });

  it('should default unknown availability and confidence to the weakest value', () => {
    const result = normalizeProperty({ ...base, availability: 'maybe?', confidence: 'certain' });

    expect(result.availability).toBe('UNKNOWN');
    expect(result.confidence).toBe('LOW');
  });

  it('should normalize case for availability it recognises', () => {
    expect(normalizeProperty({ ...base, availability: 'available' }).availability).toBe('AVAILABLE');
  });

  it('should reject nonsensical numbers', () => {
    expect(() => normalizeProperty({ ...base, monthlyRent: -1 })).toThrow(/positive/);
    expect(() => normalizeProperty({ ...base, sizeSqm: 0 })).toThrow(/positive/);
  });

  it('should require an address and valid coordinates', () => {
    expect(() => normalizeProperty({ ...base, address: '   ' })).toThrow(/address/);
    expect(() => normalizeProperty({ ...base, latitude: NaN })).toThrow(/coordinates/);
  });
});
