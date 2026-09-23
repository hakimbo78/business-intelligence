import { describe, it, expect } from 'vitest';
import { classifyHighway, describeOsmRoad, type OsmWay } from '@/lib/osm-road.js';

const way = (o: Partial<OsmWay>): OsmWay => ({ distanceMeters: 10, ...o });

describe('Reading the OSM class', () => {
  it('should separate roads a car can use from those it cannot', () => {
    expect(classifyHighway('primary')).toBe('MAJOR_ROAD');
    expect(classifyHighway('residential')).toBe('LOCAL_STREET');
    expect(classifyHighway('service')).toBe('ACCESS_LANE');
    expect(classifyHighway('footway')).toBe('PEDESTRIAN_ONLY');
    expect(classifyHighway(undefined)).toBe('UNKNOWN');
  });
});

describe('The road in front of the premises', () => {
  it('should prefer the road the geocoder named', () => {
    const road = describeOsmRoad({
      preferredName: 'Jalan Boulevard Bella Casa',
      ways: [
        way({ name: 'Gang Kecil', highway: 'service', distanceMeters: 5 }),
        way({ name: 'Jalan Boulevard Bella Casa', highway: 'residential', distanceMeters: 18 }),
      ],
    });

    expect(road.name).toBe('Jalan Boulevard Bella Casa');
    expect(road.roadClass).toBe('LOCAL_STREET');
  });

  it('should report a one-way street, which no name could reveal', () => {
    // Measured for the real Bella Casa premises: oneway=yes.
    const road = describeOsmRoad({
      ways: [way({ name: 'Jalan Boulevard Bella Casa', highway: 'residential', oneway: 'yes' })],
    });

    expect(road.oneWay).toBe(true);
    expect(road.notes.join(' ')).toContain('SATU ARAH');
    expect(road.notes.join(' ')).toContain('harus memutar');
  });

  it('should say outright when no car can reach the door', () => {
    const road = describeOsmRoad({ ways: [way({ highway: 'footway' })] });

    expect(road.carAccessible).toBe(false);
    expect(road.notes.join(' ')).toContain('BUKAN jalan kendaraan');
  });

  it('should warn about a road too narrow for two cars', () => {
    const road = describeOsmRoad({
      ways: [way({ highway: 'residential', width: '3.5' })],
    });

    expect(road.widthMeters).toBe(3.5);
    expect(road.notes.join(' ')).toContain('tidak dapat berpapasan');
  });

  it('should translate an unpaved surface into what it costs the business', () => {
    const road = describeOsmRoad({
      ways: [way({ highway: 'residential', surface: 'ground' })],
    });

    expect(road.surface).toBe('tanah');
    expect(road.notes.join(' ')).toContain('berlumpur saat hujan');
  });

  it('should point out a main road just around the corner', () => {
    const road = describeOsmRoad({
      ways: [
        way({ name: 'Jalan Kecil', highway: 'residential', distanceMeters: 8 }),
        way({ name: 'Jalan Tole Iskandar', highway: 'secondary', distanceMeters: 60 }),
      ],
    });

    expect(road.nearestMajorRoad?.name).toBe('Jalan Tole Iskandar');
    expect(road.notes.join(' ')).toContain('sewa lebih murah');
  });

  it('should name what OSM never recorded instead of implying it measured it', () => {
    const road = describeOsmRoad({ ways: [way({ highway: 'residential' })] });

    expect(road.notRecorded).toContain('lebar jalan dalam meter');
    expect(road.notRecorded).toContain('jenis permukaan jalan');
    expect(road.notes.join(' ')).toContain('Periksa sendiri di lapangan');
  });

  it('should say nothing rather than guess when OSM has no road here', () => {
    const road = describeOsmRoad({ ways: [] });

    expect(road.roadClass).toBe('UNKNOWN');
    expect(road.carAccessible).toBeNull();
    expect(road.notes.join(' ')).toContain('tidak memiliki data ruas jalan');
  });
});
