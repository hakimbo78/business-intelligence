/**
 * How much of the catchment is actually reachable.
 *
 * Every catchment figure in this report has been a circle drawn on a map. A
 * circle does not know about the river, the toll road, the railway or the
 * gated cluster wall, so it counts people on the far side of all of them as
 * customers. For a laundry whose catchment is 800 m, that error is the
 * difference between a market and a wish.
 *
 * This walks the road network instead. The catchment radius is reinterpreted
 * as distance ALONG ROADS rather than straight-line distance, which needs no
 * assumption about walking speed and is directly comparable to the old number.
 *
 * The output is deliberately a fraction, not a polygon. A polygon implies a
 * boundary we can defend metre by metre; a fraction says "about this much of
 * the circle is really within reach", which is what the evidence supports. The
 * fraction then scales the population, and it only ever scales it DOWN — the
 * bias runs toward the market being harder than it looks, never easier.
 *
 * Road data © OpenStreetMap contributors, ODbL 1.0.
 */

import type { Coordinates } from '../providers/location/location-provider.interface.js';

export interface GraphNode {
  lat: number;
  lon: number;
}

export interface RoadGraph {
  nodes: Map<number, GraphNode>;
  /** Node id to its neighbours and the metres between them. */
  adjacency: Map<number, Array<{ to: number; meters: number }>>;
}

/** Roads a person on foot cannot use. In Indonesia `motorway` is the toll road. */
const NOT_WALKABLE = new Set(['motorway', 'motorway_link', 'trunk_link', 'raceway']);

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

export function metresBetween(a: GraphNode, b: GraphNode): number {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lat - a.lat) * mPerDegLat, (b.lon - a.lon) * mPerDegLon);
}

/**
 * Build an undirected walking graph from an Overpass `out skel` response.
 *
 * Undirected on purpose: one-way restrictions bind vehicles, and the catchment
 * being measured is the people who can reach the shop, most of whom walk or
 * ride a motorbike that can turn around.
 */
export function buildGraph(elements: OverpassElement[]): RoadGraph {
  const nodes = new Map<number, GraphNode>();
  for (const element of elements) {
    if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
      nodes.set(element.id, { lat: element.lat, lon: element.lon });
    }
  }

  const adjacency = new Map<number, Array<{ to: number; meters: number }>>();
  const link = (from: number, to: number, meters: number) => {
    const edges = adjacency.get(from);
    if (edges) edges.push({ to, meters });
    else adjacency.set(from, [{ to, meters }]);
  };

  for (const element of elements) {
    if (element.type !== 'way' || !element.nodes) continue;
    if (NOT_WALKABLE.has(element.tags?.highway ?? '')) continue;

    for (let i = 0; i < element.nodes.length - 1; i += 1) {
      const a = nodes.get(element.nodes[i]);
      const b = nodes.get(element.nodes[i + 1]);
      if (!a || !b) continue;

      const meters = metresBetween(a, b);
      link(element.nodes[i], element.nodes[i + 1], meters);
      link(element.nodes[i + 1], element.nodes[i], meters);
    }
  }

  return { nodes, adjacency };
}

/** The graph node closest to a point, or null when the graph is empty. */
export function nearestNode(graph: RoadGraph, point: Coordinates): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;

  for (const [id, node] of graph.nodes) {
    const distance = metresBetween({ lat: point.latitude, lon: point.longitude }, node);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }

  return best;
}

/**
 * Network distance from a start node to everything within a budget.
 *
 * Dijkstra with a linear scan for the next node: the graphs here are a few
 * thousand nodes, where a heap would add code without adding speed.
 */
export function networkDistances(
  graph: RoadGraph,
  startNode: number,
  maxMeters: number
): Map<number, number> {
  const distances = new Map<number, number>([[startNode, 0]]);
  const settled = new Set<number>();

  for (;;) {
    let current: number | null = null;
    let currentDistance = Infinity;

    for (const [id, distance] of distances) {
      if (!settled.has(id) && distance < currentDistance) {
        current = id;
        currentDistance = distance;
      }
    }

    if (current === null || currentDistance > maxMeters) break;
    settled.add(current);

    for (const edge of graph.adjacency.get(current) ?? []) {
      const candidate = currentDistance + edge.meters;
      if (candidate > maxMeters) continue;

      const known = distances.get(edge.to);
      if (known === undefined || candidate < known) {
        distances.set(edge.to, candidate);
      }
    }
  }

  // Nodes left over the budget were discovered but never settled.
  for (const [id, distance] of distances) {
    if (distance > maxMeters) distances.delete(id);
  }

  return distances;
}

export interface Reachability {
  /** Of the circle's area, the share within the radius along roads. */
  fraction: number;
  radiusMeters: number;
  /** Sample points tested, so the precision of the fraction is visible. */
  samplesTested: number;
  samplesReachable: number;
  notes: string[];
}

/** A sample counts as served when it sits this close to a reachable road. */
const SERVED_BY_ROAD_METERS = 120;

/**
 * Metres from a point to a road segment.
 *
 * Distance to the nearest NODE is not the same thing and badly understates
 * coverage: OSM puts nodes at geometry vertices, so a straight 300 m road may
 * carry only two of them, leaving the middle of it looking unreachable.
 */
function pointToSegmentMeters(p: GraphNode, a: GraphNode, b: GraphNode): number {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((p.lat * Math.PI) / 180);

  const px = p.lon * mPerDegLon;
  const py = p.lat * mPerDegLat;
  const ax = a.lon * mPerDegLon;
  const ay = a.lat * mPerDegLat;
  const bx = b.lon * mPerDegLon;
  const by = b.lat * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Points per ring, and rings, of the sampling grid. */
const SAMPLE_RINGS = 6;
const SAMPLE_SPOKES = 16;

/**
 * What share of the circle the road network actually serves.
 *
 * Samples the disc on a polar grid, weighting by ring so each sample stands for
 * roughly equal area, and asks of each whether a reachable road passes near it.
 */
export function assessReachability(input: {
  graph: RoadGraph;
  centre: Coordinates;
  radiusMeters: number;
  reachable: Map<number, number>;
}): Reachability {
  const { graph, centre, radiusMeters, reachable } = input;

  // The reachable network as segments, each counted once.
  const segments: Array<[GraphNode, GraphNode]> = [];
  for (const [id, edges] of graph.adjacency) {
    if (!reachable.has(id)) continue;
    const from = graph.nodes.get(id);
    if (!from) continue;

    for (const edge of edges) {
      if (edge.to <= id || !reachable.has(edge.to)) continue;
      const to = graph.nodes.get(edge.to);
      if (to) segments.push([from, to]);
    }
  }

  const notes: string[] = [];

  if (segments.length === 0) {
    return {
      fraction: 1,
      radiusMeters,
      samplesTested: 0,
      samplesReachable: 0,
      notes: [
        'Jaringan jalan di sekitar lokasi tidak dapat dibaca, sehingga jangkauan dihitung ' +
          'sebagai lingkaran garis lurus. Angka penduduk bisa lebih besar dari yang benar-benar ' +
          'dapat menjangkau lokasi ini.',
      ],
    };
  }

  let tested = 0;
  let served = 0;

  for (let ring = 1; ring <= SAMPLE_RINGS; ring += 1) {
    // Equal-area rings: the radius grows with the square root of the ring index.
    const r = radiusMeters * Math.sqrt(ring / SAMPLE_RINGS);
    const spokes = SAMPLE_SPOKES;

    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = (spoke / spokes) * 2 * Math.PI;
      const mPerDegLat = 111_320;
      const mPerDegLon = 111_320 * Math.cos((centre.latitude * Math.PI) / 180);

      const point: GraphNode = {
        lat: centre.latitude + (r * Math.sin(angle)) / mPerDegLat,
        lon: centre.longitude + (r * Math.cos(angle)) / mPerDegLon,
      };

      tested += 1;
      const near = segments.some(
        ([a, b]) => pointToSegmentMeters(point, a, b) <= SERVED_BY_ROAD_METERS
      );
      if (near) served += 1;
    }
  }

  const fraction = tested === 0 ? 1 : served / tested;

  if (fraction < 0.75) {
    notes.push(
      `Hanya sekitar ${Math.round(fraction * 100)}% dari lingkaran radius ${radiusMeters} m yang ` +
        'benar-benar dapat dicapai lewat jalan dalam jarak tempuh yang sama. Sisanya terhalang — ' +
        'bisa karena sungai, rel, jalan tol, tembok perumahan, atau memang tidak ada jalan tembus.'
    );
  }

  notes.push(
    'Jangkauan diukur sebagai jarak menyusuri jalan, bukan garis lurus di peta. Penduduk yang ' +
      'dihitung sudah dikurangi sesuai bagian yang benar-benar terjangkau.'
  );

  return { fraction, radiusMeters, samplesTested: tested, samplesReachable: served, notes };
}
