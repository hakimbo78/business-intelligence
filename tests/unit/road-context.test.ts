import { describe, it, expect } from 'vitest';
import { describeRoad, addressIsOnRoad, normaliseRoadName } from '@/lib/road-context.js';

describe('Road name matching', () => {
  it('should treat the same road written differently as one road', () => {
    expect(normaliseRoadName('Jl. Delima Raya')).toBe(normaliseRoadName('Jalan Delima Raya'));
    expect(addressIsOnRoad('Jl. Delima Raya No. 12, Depok', 'Jalan Delima Raya')).toBe(true);
  });

  it('should not match a different road', () => {
    expect(addressIsOnRoad('Jl. Margonda Raya No. 1, Depok', 'Jalan Delima Raya')).toBe(false);
  });

  it('should refuse to match on a name too short to be safe', () => {
    // Matching on "Jl" alone would put every address on the same road.
    expect(addressIsOnRoad('Jl. Apa Saja No. 1', 'Jl.')).toBe(false);
  });
});

describe('Road classification', () => {
  it('should read a gang as an alley', () => {
    const road = describeRoad({ roadName: 'Gang Swadaya', nearbyAddresses: [] });

    expect(road.indicatedClass).toBe('ALLEY');
    expect(road.classBasis).toContain('gang');
  });

  it('should read Raya as a through road', () => {
    const road = describeRoad({ roadName: 'Jalan Delima Raya', nearbyAddresses: [] });

    expect(road.indicatedClass).toBe('MAIN_ROAD');
  });

  it('should fall back to the businesses when the name says nothing', () => {
    // "Jalan Margonda" is a major road whose returned name carries no marker,
    // so the businesses lining it are the evidence.
    const road = describeRoad({
      roadName: 'Jalan Margonda',
      nearbyAddresses: [
        'Jl. Margonda No. 1', 'Jl. Margonda No. 5', 'Jl. Margonda No. 9',
        'Jl. Margonda No. 12', 'Jl. Kartini No. 3',
      ],
    });

    expect(road.indicatedClass).toBe('MAIN_ROAD');
    expect(road.businessesOnSameRoad).toBe(4);
    expect(road.classBasis).toContain('ruas jalan komersial');
  });

  it('should call it a local street when neither signal is strong', () => {
    const road = describeRoad({
      roadName: 'Jalan Kartini',
      nearbyAddresses: ['Jl. Margonda No. 1', 'Jl. Margonda No. 5'],
    });

    expect(road.indicatedClass).toBe('STREET');
  });

  it('should warn when no nearby business fronts the same road', () => {
    const road = describeRoad({
      roadName: 'Jalan Delima Raya',
      nearbyAddresses: ['Jl. Margonda No. 1', 'Jl. Kartini No. 2'],
    });

    // The customer should know the trade may be passing somewhere else.
    expect(road.notes.join(' ')).toContain('di luar ruas komersial');
  });

  it('should always state what it cannot see', () => {
    const road = describeRoad({ roadName: 'Jalan Delima Raya', nearbyAddresses: [] });

    // A lease signed on a name-based reading deserves the caveat.
    expect(road.notes.join(' ')).toContain('lebar jalan');
    expect(road.notes.join(' ')).toContain('Pastikan sendiri di lapangan');
  });

  it('should flag an imprecise geocode', () => {
    const road = describeRoad({
      roadName: 'Jalan Delima Raya',
      addressPrecision: 'GEOMETRIC_CENTER',
      nearbyAddresses: [],
    });

    expect(road.notes.join(' ')).toContain('TITIK TENGAH JALAN');
  });

  it('should say nothing rather than guess when the road is unknown', () => {
    const road = describeRoad({ roadName: null, nearbyAddresses: [] });

    expect(road.indicatedClass).toBe('UNKNOWN');
    expect(road.notes).toEqual([]);
  });
});
