import { describe, it, expect } from 'vitest';
import {
  resolveCompetitorTypes,
  densityFromCount,
  describeCompetition,
  type CompetitionCount,
} from '@/lib/competitor-types.js';

describe('Resolving a business to searchable types', () => {
  it('should search laundries as laundries', () => {
    // The failure this module exists for: 'store' matched no laundry at all.
    expect(resolveCompetitorTypes(['laundry kiloan'])).toEqual(['laundry']);
    expect(resolveCompetitorTypes(['Laundry'])).toEqual(['laundry']);
  });

  it('should understand the Indonesian words a client actually writes', () => {
    expect(resolveCompetitorTypes(['warung makan'])).toContain('restaurant');
    expect(resolveCompetitorTypes(['pangkas rambut'])).toContain('barber_shop');
    expect(resolveCompetitorTypes(['apotek'])).toContain('pharmacy');
    expect(resolveCompetitorTypes(['konter pulsa'])).toContain('cell_phone_store');
  });

  it('should merge the types of several categories without repeating them', () => {
    const types = resolveCompetitorTypes(['kedai kopi', 'coffee shop']);
    expect(types).toEqual([...new Set(types)]);
    expect(types).toContain('cafe');
  });

  it('should return nothing rather than a broad guess', () => {
    // Falling back to a general type is exactly what produced the wrong count.
    expect(resolveCompetitorTypes(['jasa konsultan pajak'])).toEqual([]);
  });
});

const base: CompetitionCount = {
  found: 0,
  capped: false,
  radiusMeters: 1500,
  nearestMeters: null,
  searchable: true,
};

describe('Density from the count', () => {
  it('should call a capped result saturated, not low', () => {
    expect(densityFromCount({ ...base, found: 20, capped: true, nearestMeters: 180 })).toBe('HIGH');
  });

  it('should scale with the count', () => {
    expect(densityFromCount({ ...base, found: 12 })).toBe('HIGH');
    expect(densityFromCount({ ...base, found: 5 })).toBe('MEDIUM');
    expect(densityFromCount({ ...base, found: 2 })).toBe('LOW');
  });

  it('should refuse to rate a business it could not search for', () => {
    expect(densityFromCount({ ...base, searchable: false })).toBe('UNKNOWN');
  });
});

describe('Explaining the count', () => {
  it('should say the real number is higher when the search hit its ceiling', () => {
    const text = describeCompetition({ ...base, found: 20, capped: true, nearestMeters: 180 });

    expect(text).toContain('BATAS');
    expect(text).toContain('lebih banyak lagi');
    expect(text).toContain('sudah padat');
  });

  it('should not let an empty result read as an opportunity', () => {
    const text = describeCompetition(base);

    expect(text).toContain('tidak bertahan di sini');
    expect(text).toContain('tidak terdaftar di Google Maps');
  });

  it('should say plainly when the business could not be searched', () => {
    const text = describeCompetition({ ...base, searchable: false });

    expect(text).toContain('TIDAK kami ukur');
    expect(text).toContain('tidak dapat dipakai');
  });

  it('should always note that unlisted businesses are uncounted', () => {
    const text = describeCompetition({ ...base, found: 6, nearestMeters: 300 });
    expect(text).toContain('tidak terdaftar tidak terhitung');
  });
});
