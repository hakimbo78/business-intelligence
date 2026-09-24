import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import type { Coordinates } from '../providers/location/location-provider.interface.js';

/**
 * How many people live around the premises.
 *
 * This replaces the line the report has carried since the invented
 * demographics were removed: "Jumlah penduduk ... kami tidak memiliki sumber
 * data demografi yang sah untuk dipakai komersial."
 *
 * WorldPop publishes modelled population at 100 m resolution under CC BY 4.0,
 * which permits commercial use with attribution — unlike the BPS API, whose
 * terms require an agreement for revenue-seeking use. Their statistics service
 * takes a polygon and returns the population inside it, so nothing has to be
 * downloaded and no key is needed.
 *
 * It is modelled, not counted, and the report says so: it is a good estimate of
 * how many people live in a neighbourhood and a poor one for any single block.
 */

const STATS_URL = 'https://api.worldpop.org/v1/services/stats';
const TASK_URL = 'https://api.worldpop.org/v1/tasks';

/** The dataset year the service exposes for Indonesia. */
const DATASET = 'wpgppop';
const YEAR = 2020;

const USER_AGENT =
  'LokasiBI/1.0 (location intelligence for Indonesian SMEs; +mailto:hakimbo78@gmail.com)';

/** The service queues work; these bound the wait rather than hang a report. */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 15;

export const WORLDPOP_ATTRIBUTION =
  'Data penduduk: WorldPop (www.worldpop.org), lisensi CC BY 4.0, estimasi tahun 2020';

export interface CatchmentPopulation {
  radiusMeters: number;
  /** Modelled residents inside the radius. */
  population: number;
}

export interface PopulationContext {
  rings: CatchmentPopulation[];
  /** Residents inside the trade's own catchment radius. */
  catchmentPopulation: number | null;
  catchmentRadiusMeters: number;
  attribution: string;
  notes: string[];
}

/** A circle as a GeoJSON polygon, which is what the service accepts. */
function circlePolygon(centre: Coordinates, radiusMeters: number, points = 48) {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLon = 111_320 * Math.cos((centre.latitude * Math.PI) / 180);

  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    ring.push([
      centre.longitude + (radiusMeters * Math.cos(angle)) / metresPerDegreeLon,
      centre.latitude + (radiusMeters * Math.sin(angle)) / metresPerDegreeLat,
    ]);
  }

  return { type: 'Polygon' as const, coordinates: [ring] };
}

export class PopulationService {
  private cache = new Map<string, number | null>();

  /**
   * Population inside a radius, or null when WorldPop could not be reached.
   */
  async populationWithin(
    centre: Coordinates,
    radiusMeters: number,
    projectId?: string
  ): Promise<number | null> {
    if (!env.ENABLE_POPULATION_DATA) return null;

    const key = `${centre.latitude.toFixed(4)},${centre.longitude.toFixed(4)}:${radiusMeters}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    try {
      const geometry = JSON.stringify(circlePolygon(centre, radiusMeters));
      const url =
        `${STATS_URL}?dataset=${DATASET}&year=${YEAR}&geojson=${encodeURIComponent(geometry)}`;

      const created = (await this.getJson(url)) as { taskid?: string; error?: boolean };
      if (!created.taskid) throw new Error('WorldPop did not return a task id');

      const population = await this.awaitTask(created.taskid);

      if (projectId) {
        await dataSourceRepository.record(
          {
            source: 'WorldPop',
            retrievedAt: new Date().toISOString(),
            dataType: 'population',
            geographicScope: `${radiusMeters} m radius`,
            confidence: 'MEDIUM',
          },
          { projectId, metadata: { radiusMeters, population, dataset: DATASET, year: YEAR } }
        );
      }

      this.cache.set(key, population);
      return population;
    } catch (error) {
      // A missing population weakens the report; it must not fail it.
      logger.warn({ err: error, projectId, radiusMeters }, 'Could not read population from WorldPop');
      this.cache.set(key, null);
      return null;
    }
  }

  /**
   * Population at the trade's own catchment radius, plus context rings.
   *
   * The rings exist so the reader can see how fast the neighbourhood thins out:
   * a catchment that only works at 2 km is a different business from one that
   * is already full at 500 m.
   */
  async describe(
    centre: Coordinates,
    catchmentRadiusMeters: number,
    projectId?: string
  ): Promise<PopulationContext> {
    const radii = [...new Set([500, 1000, catchmentRadiusMeters])].sort((a, b) => a - b);

    // The service queues each request and is polled until it finishes, so three
    // rings in sequence cost three waits for no reason.
    const measured = await Promise.all(
      radii.map(async (radius) => ({
        radiusMeters: radius,
        population: await this.populationWithin(centre, radius, projectId),
      }))
    );

    const rings: CatchmentPopulation[] = measured
      .filter((r): r is CatchmentPopulation => r.population !== null);

    const catchment = rings.find((r) => r.radiusMeters === catchmentRadiusMeters)?.population ?? null;

    const notes: string[] = [];

    if (rings.length === 0) {
      notes.push(
        'Data jumlah penduduk tidak dapat diambil saat laporan ini dibuat. Angka pasar dan ' +
          'pangsa yang dibutuhkan tidak dapat dihitung.'
      );
    } else {
      notes.push(
        'Angka penduduk ini berasal dari pemodelan WorldPop pada resolusi 100 m, tahun 2020 — ' +
          'bukan sensus per alamat. Cukup akurat untuk menggambarkan padat atau tidaknya sebuah ' +
          'lingkungan, tetapi tidak untuk satu blok tertentu, dan belum memperhitungkan ' +
          'pembangunan setelah 2020.'
      );
      notes.push(
        'Jumlah ini mencakup semua penduduk, termasuk yang bukan calon pelanggan Anda. ' +
          'Perhitungan pasar di bagian berikutnya memakai asumsi frekuensi pemakaian untuk ' +
          'menyaringnya.'
      );
    }

    return {
      rings,
      catchmentPopulation: catchment,
      catchmentRadiusMeters,
      attribution: WORLDPOP_ATTRIBUTION,
      notes,
    };
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`WorldPop returned ${response.status}`);
    }

    return response.json();
  }

  private async awaitTask(taskId: string): Promise<number> {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const body = (await this.getJson(`${TASK_URL}/${taskId}`)) as {
        status?: string;
        error?: boolean;
        error_message?: string | null;
        data?: { total_population?: number };
      };

      if (body.error) {
        throw new Error(body.error_message ?? 'WorldPop reported an error');
      }

      if (body.status === 'finished') {
        const population = body.data?.total_population;
        if (typeof population !== 'number') {
          throw new Error('WorldPop finished without a population figure');
        }
        return Math.round(population);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error('WorldPop did not finish in time');
  }
}

export const populationService = new PopulationService();
