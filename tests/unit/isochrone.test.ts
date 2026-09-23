import { describe, it, expect } from 'vitest';
import {
  buildGraph,
  nearestNode,
  networkDistances,
  assessReachability,
  metresBetween,
  type OverpassElement,
} from '@/lib/isochrone.js';

const LAT = -6.403;
const LON = 106.829;

/** A node id at a given offset in metres, north and east of the centre. */
function node(id: number, northMeters: number, eastMeters: number): OverpassElement {
  return {
    type: 'node',
    id,
    lat: LAT + northMeters / 111_320,
    lon: LON + eastMeters / (111_320 * Math.cos((LAT * Math.PI) / 180)),
  };
}

const way = (id: number, nodes: number[], highway = 'residential'): OverpassElement => ({
  type: 'way',
  id,
  nodes,
  tags: { highway },
});

describe('Building the walking graph', () => {
  it('should connect the nodes of a way in both directions', () => {
    const graph = buildGraph([node(1, 0, 0), node(2, 0, 100), way(10, [1, 2])]);

    expect(graph.adjacency.get(1)?.[0].to).toBe(2);
    expect(graph.adjacency.get(2)?.[0].to).toBe(1);
    expect(graph.adjacency.get(1)?.[0].meters).toBeCloseTo(100, 0);
  });

  it('should leave out roads a person cannot walk on', () => {
    // A toll road passing the premises serves nobody arriving on foot.
    const graph = buildGraph([node(1, 0, 0), node(2, 0, 100), way(10, [1, 2], 'motorway')]);

    expect(graph.adjacency.size).toBe(0);
  });

  it('should skip a way whose nodes were not returned', () => {
    const graph = buildGraph([node(1, 0, 0), way(10, [1, 999])]);
    expect(graph.adjacency.size).toBe(0);
  });
});

describe('Distance along the roads', () => {
  it('should measure the path, not the straight line', () => {
    // A dead end going east then a long detour north to reach a near neighbour.
    const graph = buildGraph([
      node(1, 0, 0),
      node(2, 0, 300),
      node(3, 400, 300),
      node(4, 400, 0),
      way(10, [1, 2]),
      way(11, [2, 3]),
      way(12, [3, 4]),
    ]);

    const distances = networkDistances(graph, 1, 2000);

    // Node 4 is 400 m away in a straight line but 1,000 m along the roads
    // (300 east, then 400 north, then 300 back west).
    expect(distances.get(4)).toBeCloseTo(1000, -1);
  });

  it('should stop at the budget', () => {
    const graph = buildGraph([
      node(1, 0, 0), node(2, 0, 300), node(3, 0, 900),
      way(10, [1, 2]), way(11, [2, 3]),
    ]);

    const distances = networkDistances(graph, 1, 500);

    expect(distances.has(2)).toBe(true);
    expect(distances.has(3)).toBe(false);
  });

  it('should find the graph node nearest a point', () => {
    const graph = buildGraph([node(1, 0, 0), node(2, 0, 500), way(10, [1, 2])]);
    expect(nearestNode(graph, { latitude: LAT, longitude: LON })).toBe(1);
  });

  it('should return nothing for an empty graph', () => {
    expect(nearestNode(buildGraph([]), { latitude: LAT, longitude: LON })).toBeNull();
  });
});

describe('How much of the circle the roads actually serve', () => {
  it('should cut the catchment when the network only covers one side', () => {
    // Roads run east only; the west half of the circle is across a river.
    const elements: OverpassElement[] = [node(1, 0, 0)];
    for (let i = 1; i <= 8; i += 1) elements.push(node(i + 1, 0, i * 100));
    elements.push(way(10, [1, 2, 3, 4, 5, 6, 7, 8, 9]));

    const graph = buildGraph(elements);
    const reachable = networkDistances(graph, 1, 800);

    const result = assessReachability({
      graph,
      centre: { latitude: LAT, longitude: LON },
      radiusMeters: 800,
      reachable,
    });

    expect(result.fraction).toBeLessThan(0.5);
    expect(result.notes.join(' ')).toContain('terhalang');
  });

  /** A grid of streets 200 m apart, spanning 800 m in every direction. */
  function streetGrid(): OverpassElement[] {
    const elements: OverpassElement[] = [];
    const ids: number[][] = [];
    let id = 1;
    let wayId = 1000;

    for (let row = -4; row <= 4; row += 1) {
      const rowIds: number[] = [];
      for (let col = -4; col <= 4; col += 1) {
        elements.push(node(id, row * 200, col * 200));
        rowIds.push(id);
        id += 1;
      }
      ids.push(rowIds);
    }

    for (const rowIds of ids) elements.push(way(wayId++, rowIds));
    for (let col = 0; col < 9; col += 1) elements.push(way(wayId++, ids.map((r) => r[col])));

    return elements;
  }

  it('should keep the whole circle when the network reaches past its edge', () => {
    const graph = buildGraph(streetGrid());
    const centreNode = nearestNode(graph, { latitude: LAT, longitude: LON })!;

    const result = assessReachability({
      graph,
      centre: { latitude: LAT, longitude: LON },
      radiusMeters: 800,
      reachable: networkDistances(graph, centreNode, 1600),
    });

    expect(result.fraction).toBeGreaterThan(0.95);
    expect(result.notes.join(' ')).not.toContain('terhalang');
  });

  it('should show that a grid of streets does not cover its own circle', () => {
    // The point of the whole feature. Walking 800 m along a grid reaches a
    // diamond, not a disc: the corners are 1,600 m away by road. Roughly
    // two-thirds of the circle, which a straight-line radius counts as all.
    const graph = buildGraph(streetGrid());
    const centreNode = nearestNode(graph, { latitude: LAT, longitude: LON })!;

    const result = assessReachability({
      graph,
      centre: { latitude: LAT, longitude: LON },
      radiusMeters: 800,
      reachable: networkDistances(graph, centreNode, 800),
    });

    expect(result.fraction).toBeGreaterThan(0.55);
    expect(result.fraction).toBeLessThan(0.75);
  });

  it('should fall back to the circle, and say so, when there is no network', () => {
    const graph = buildGraph([]);

    const result = assessReachability({
      graph,
      centre: { latitude: LAT, longitude: LON },
      radiusMeters: 800,
      reachable: new Map(),
    });

    // Never silently: a full circle presented as measured would overstate reach.
    expect(result.fraction).toBe(1);
    expect(result.notes.join(' ')).toContain('tidak dapat dibaca');
  });

  it('should always say the reach was measured along roads', () => {
    const graph = buildGraph([node(1, 0, 0), node(2, 0, 100), way(10, [1, 2])]);
    const result = assessReachability({
      graph,
      centre: { latitude: LAT, longitude: LON },
      radiusMeters: 800,
      reachable: networkDistances(graph, 1, 800),
    });

    expect(result.notes.join(' ')).toContain('menyusuri jalan, bukan garis lurus');
  });
});

describe('Distance helper', () => {
  it('should measure metres between two points', () => {
    expect(metresBetween({ lat: LAT, lon: LON }, { lat: LAT + 0.001, lon: LON })).toBeCloseTo(111, 0);
  });
});
