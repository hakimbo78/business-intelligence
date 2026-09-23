import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { describeOsmRoad, type OsmRoadContext, type OsmWay } from '../lib/osm-road.js';
import type { Coordinates } from '../providers/location/location-provider.interface.js';

/**
 * Road data from OpenStreetMap, via Overpass.
 *
 * Free, no key, no billing — which matters, because this closes the gap the
 * report has been disclosing since the road section was written: it could not
 * see road width, surface, traffic direction, or whether a car could pass.
 *
 * Overpass is a volunteer-run service. It rate-limits anonymous traffic and
 * requires a meaningful User-Agent, so requests identify this application and
 * every failure degrades to a report that falls back on the name-based reading
 * rather than failing.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Overpass asks for a contactable identity rather than an anonymous client. */
const USER_AGENT =
  'LokasiBI/1.0 (location intelligence for Indonesian SMEs; +mailto:hakimbo78@gmail.com)';

/** Far enough to catch the main road at the corner, near enough to stay relevant. */
const SEARCH_RADIUS_METERS = 150;

const REQUEST_TIMEOUT_MS = 25_000;

export const OSM_ATTRIBUTION = 'Data jalan © Kontributor OpenStreetMap (ODbL 1.0)';

interface OverpassWay {
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

/** Metres from a point to a line segment, flat-earth at this scale. */
function pointToSegmentMeters(
  p: Coordinates,
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((p.latitude * Math.PI) / 180);

  const px = p.longitude * mPerDegLon;
  const py = p.latitude * mPerDegLat;
  const ax = a.lon * mPerDegLon;
  const ay = a.lat * mPerDegLat;
  const bx = b.lon * mPerDegLon;
  const by = b.lat * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // A degenerate segment is a point.
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function nearestDistanceMeters(point: Coordinates, geometry: Array<{ lat: number; lon: number }>): number {
  if (geometry.length === 0) return Infinity;
  if (geometry.length === 1) {
    return pointToSegmentMeters(point, geometry[0], geometry[0]);
  }

  let nearest = Infinity;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    nearest = Math.min(nearest, pointToSegmentMeters(point, geometry[i], geometry[i + 1]));
  }
  return nearest;
}

export class OsmRoadService {
  private cache = new Map<string, OsmRoadContext | null>();

  /**
   * Describe the road at a point, or null when OpenStreetMap cannot be reached.
   *
   * Null means "we could not ask", which the caller must present differently
   * from "OpenStreetMap has no road here" — the second is a finding.
   */
  async describe(
    location: Coordinates,
    options: { preferredName?: string | null; projectId?: string } = {}
  ): Promise<OsmRoadContext | null> {
    if (!env.ENABLE_OSM_ROAD) return null;

    const key = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const query =
      `[out:json][timeout:20];way(around:${SEARCH_RADIUS_METERS},` +
      `${location.latitude},${location.longitude})[highway];out tags geom;`;

    for (const endpoint of ENDPOINTS) {
      try {
        const ways = await this.fetchWays(endpoint, query, location);

        const context = describeOsmRoad({ ways, preferredName: options.preferredName });

        if (options.projectId) {
          await dataSourceRepository.record(
            {
              source: 'OpenStreetMap (Overpass)',
              retrievedAt: new Date().toISOString(),
              dataType: 'road_classification',
              confidence: 'MEDIUM',
            },
            {
              projectId: options.projectId,
              metadata: { endpoint, waysFound: ways.length, roadClass: context.roadClass },
            }
          );
        }

        logger.info(
          { projectId: options.projectId, ways: ways.length, roadClass: context.roadClass },
          'Read road classification from OpenStreetMap'
        );

        this.cache.set(key, context);
        return context;
      } catch (error) {
        // Try the next mirror before giving up: Overpass throttles by host.
        logger.warn({ err: error, endpoint }, 'Overpass request failed, trying next endpoint');
      }
    }

    this.cache.set(key, null);
    return null;
  }

  private async fetchWays(
    endpoint: string,
    query: string,
    location: Coordinates
  ): Promise<OsmWay[]> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await response.text();

    // Overpass answers a rate limit with an HTML page and a 200 in some cases,
    // so the body is checked rather than the status alone.
    if (!response.ok || !text.trimStart().startsWith('{')) {
      throw new Error(`Overpass returned ${response.status}: ${text.slice(0, 120)}`);
    }

    const body = JSON.parse(text) as { elements?: OverpassWay[] };

    return (body.elements ?? [])
      .filter((e) => e.tags?.highway)
      .map((e) => ({
        name: e.tags?.name,
        highway: e.tags?.highway,
        oneway: e.tags?.oneway,
        lanes: e.tags?.lanes,
        width: e.tags?.width,
        surface: e.tags?.surface,
        maxspeed: e.tags?.maxspeed,
        distanceMeters: nearestDistanceMeters(location, e.geometry ?? []),
      }))
      .filter((w) => Number.isFinite(w.distanceMeters));
  }
}

export const osmRoadService = new OsmRoadService();
