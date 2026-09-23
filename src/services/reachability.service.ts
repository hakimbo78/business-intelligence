import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import {
  assessReachability,
  buildGraph,
  nearestNode,
  networkDistances,
  type OverpassElement,
  type Reachability,
} from '../lib/isochrone.js';
import type { Coordinates } from '../providers/location/location-provider.interface.js';

/**
 * How much of the catchment circle the road network actually serves.
 *
 * Fetches the walkable network around the premises from Overpass and walks it,
 * so the catchment becomes a distance along roads rather than a straight line
 * across rivers and toll roads.
 *
 * Shares the OSM switch with the road classification service: both read the
 * same volunteer-run endpoint, and if it is unavailable the report falls back
 * to the circle and says so.
 *
 * Road data © OpenStreetMap contributors, ODbL 1.0.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const USER_AGENT =
  'LokasiBI/1.0 (location intelligence for Indonesian SMEs; +mailto:hakimbo78@gmail.com)';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Fetch a little beyond the radius.
 *
 * A road that leaves the circle and comes back is still the way people arrive,
 * so cutting the graph at the boundary would invent dead ends.
 */
const FETCH_MARGIN = 1.4;

export class ReachabilityService {
  private cache = new Map<string, Reachability | null>();

  /**
   * Measure reachability, or null when the network could not be read.
   *
   * Null is distinct from a fraction of 1: the first means we could not ask,
   * and the caller must not present an unmeasured circle as a measured one.
   */
  async measure(
    centre: Coordinates,
    radiusMeters: number,
    projectId?: string
  ): Promise<Reachability | null> {
    if (!env.ENABLE_OSM_ROAD) return null;

    const key = `${centre.latitude.toFixed(4)},${centre.longitude.toFixed(4)}:${radiusMeters}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const fetchRadius = Math.round(radiusMeters * FETCH_MARGIN);
    const query =
      `[out:json][timeout:25];way(around:${fetchRadius},${centre.latitude},${centre.longitude})` +
      '[highway];(._;>;);out skel qt;';

    for (const endpoint of ENDPOINTS) {
      try {
        const elements = await this.fetchElements(endpoint, query);
        const graph = buildGraph(elements);

        const start = nearestNode(graph, centre);
        if (start === null) {
          logger.warn({ projectId }, 'OpenStreetMap has no road network around this premises');
          this.cache.set(key, null);
          return null;
        }

        const reachable = networkDistances(graph, start, radiusMeters);
        const result = assessReachability({ graph, centre, radiusMeters, reachable });

        if (projectId) {
          await dataSourceRepository.record(
            {
              source: 'OpenStreetMap (Overpass)',
              retrievedAt: new Date().toISOString(),
              dataType: 'road_network_reachability',
              geographicScope: `${radiusMeters} m along roads`,
              confidence: 'MEDIUM',
            },
            {
              projectId,
              metadata: {
                endpoint,
                nodes: graph.nodes.size,
                reachableNodes: reachable.size,
                fraction: result.fraction,
              },
            }
          );
        }

        logger.info(
          {
            projectId,
            radiusMeters,
            nodes: graph.nodes.size,
            fraction: Number(result.fraction.toFixed(2)),
          },
          'Measured catchment reachability along the road network'
        );

        this.cache.set(key, result);
        return result;
      } catch (error) {
        logger.warn({ err: error, endpoint }, 'Reachability request failed, trying next endpoint');
      }
    }

    this.cache.set(key, null);
    return null;
  }

  private async fetchElements(endpoint: string, query: string): Promise<OverpassElement[]> {
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

    if (!response.ok || !text.trimStart().startsWith('{')) {
      throw new Error(`Overpass returned ${response.status}: ${text.slice(0, 120)}`);
    }

    return (JSON.parse(text) as { elements?: OverpassElement[] }).elements ?? [];
  }
}

export const reachabilityService = new ReachabilityService();
