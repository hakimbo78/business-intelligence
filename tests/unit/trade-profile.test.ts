import { describe, it, expect } from 'vitest';
import {
  resolveTradeProfile,
  describeTradeProfile,
  assessOccupancy,
  GENERIC_PROFILE,
} from '@/lib/trade-profile.js';
import { assessMarketShare } from '@/lib/market-share.js';

describe('Choosing a trade profile', () => {
  it('should give a laundry a short catchment and a restaurant a long one', () => {
    const laundry = resolveTradeProfile(['laundry kiloan']);
    const restaurant = resolveTradeProfile(['rumah makan padang']);

    // People carry washing to the nearest place; they travel for dinner.
    expect(laundry.catchmentRadiusMeters).toBeLessThan(restaurant.catchmentRadiusMeters);
  });

  it('should weight what actually decides each trade', () => {
    const laundry = resolveTradeProfile(['laundry']);
    const workshop = resolveTradeProfile(['bengkel motor']);

    // Car access barely matters to a laundry and decides a workshop.
    expect(laundry.weights.accessibility ?? 1).toBeLessThan(workshop.weights.accessibility ?? 1);
  });

  it('should pick the demand drivers that belong to the trade', () => {
    expect(resolveTradeProfile(['apotek'])).toHaveProperty('demandDrivers', expect.arrayContaining(['hospital']));
    expect(resolveTradeProfile(['kedai kopi']).demandDrivers).toContain('office');
  });

  it('should fall back to a profile that admits it is generic', () => {
    const profile = resolveTradeProfile(['jasa konsultan pajak']);

    expect(profile.key).toBe(GENERIC_PROFILE.key);
    expect(profile.basis).toContain('BELUM');
  });

  it('should always state that the numbers are rules of thumb', () => {
    const text = describeTradeProfile(resolveTradeProfile(['laundry'])).join(' ');

    // The invented-demographics failure must not come back through this door.
    expect(text).toContain('BUKAN hasil pengukuran');
    expect(text).toContain('ganti dengan angka');
  });
});

describe('Judging the rent against the trade', () => {
  const laundry = resolveTradeProfile(['laundry']);

  it('should call 41% dangerous for a laundry and say by how much', () => {
    // The Bella Casa report printed 41% with nothing beside it.
    const result = assessOccupancy(41, laundry);

    expect(result.verdict).toBe('DANGEROUS');
    expect(result.message).toContain('2.7 kali lipat');
  });

  it('should accept a rent inside the healthy band', () => {
    expect(assessOccupancy(12, laundry).verdict).toBe('HEALTHY');
  });

  it('should warn without condemning just above the band', () => {
    const result = assessOccupancy(18, laundry);

    expect(result.verdict).toBe('TIGHT');
    expect(result.message).toContain('tidak ada ruang');
  });

  it('should say it cannot judge rather than guess', () => {
    expect(assessOccupancy(null, laundry).verdict).toBe('UNKNOWN');
  });
});

describe('The share of the neighbourhood this business must win', () => {
  const laundry = resolveTradeProfile(['laundry']);

  const bellaCasa = {
    profile: laundry,
    catchmentPopulation: 12630, // measured, 500 m
    competitorCount: 17,
    competitorCountIsMinimum: false,
    breakEvenCustomersPerDay: 25,
    operatingDays: 26,
  };

  it('should turn a head count into the share that has to be won', () => {
    const result = assessMarketShare(bellaCasa);

    // 12,630 residents x 0.3 = 3,789 transactions a month in the whole area.
    expect(result.potentialTransactionsPerMonth).toBe(3789);
    // 25 customers a day x 26 days = 650 needed.
    expect(result.requiredTransactionsPerMonth).toBe(650);
    expect(result.requiredSharePercent).toBeCloseTo(17.2, 1);
  });

  it('should compare that against what an average competitor holds', () => {
    const result = assessMarketShare(bellaCasa);

    // Eighteen players sharing one market: 5.56% each.
    expect(result.averageSharePercent).toBeCloseTo(5.56, 1);
    expect(result.timesAverageShare).toBeCloseTo(3.1, 1);
    expect(result.notes.join(' ')).toContain('kali lipat pangsa pesaing');
  });

  it('should say plainly when the rent cannot be covered by the whole market', () => {
    const result = assessMarketShare({ ...bellaCasa, breakEvenCustomersPerDay: 200 });

    expect(result.requiredSharePercent).toBeGreaterThan(100);
    expect(result.notes.join(' ')).toContain('menguasai seluruh pasar');
  });

  it('should refuse to compute a share it has no population for', () => {
    const result = assessMarketShare({ ...bellaCasa, catchmentPopulation: null });

    expect(result.requiredSharePercent).toBeNull();
    expect(result.notes.join(' ')).toContain('tidak dapat diambil');
  });

  it('should warn that an incomplete census flatters the average share', () => {
    const result = assessMarketShare({ ...bellaCasa, competitorCountIsMinimum: true });

    expect(result.notes.join(' ')).toContain('angka MINIMUM');
    expect(result.notes.join(' ')).toContain('lebih berat');
  });

  it('should always say the visit rate is an assumption', () => {
    const result = assessMarketShare(bellaCasa);
    expect(result.notes.join(' ')).toContain('bukan pengukuran di lokasi Anda');
  });
});
