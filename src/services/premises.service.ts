import { LocationCandidate, PropertyListing } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/environment.js';
import { createLocationProvider } from '../providers/location/index.js';
import { propertyRepository } from '../repositories/property.repository.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { projectService } from '../services/project.service.js';
import { getProjectTypeConfig } from '../lib/project-types.js';
import { normalizeProperty, type RawPropertyInput } from '../lib/property-normalizer.js';
import { logger } from '../lib/logger.js';

export interface AttachPremisesInput extends Omit<RawPropertyInput, 'latitude' | 'longitude'> {
  /** Optional: geocoded from the address when the client does not supply them. */
  latitude?: number;
  longitude?: number;
  /** Name shown in the report, e.g. "Ruko Kemang Raya No. 1". Defaults to the address. */
  name?: string;
}

export interface AttachPremisesResult {
  candidate: LocationCandidate;
  listing: PropertyListing;
  /** True when coordinates were derived from the address rather than supplied. */
  coordinatesGeocoded: boolean;
}

/**
 * Attaches a premises the CLIENT has chosen to a project.
 *
 * This is the entry point for the two products where the client already knows
 * the property: VALIDATION (one premises) and COMPARISON (several). It does two
 * things at once, deliberately:
 *
 *   1. Creates the LocationCandidate the pipeline will analyse — so the report
 *      is about the premises the client actually asked about.
 *   2. Records the same premises as a PropertyListing, which accumulates into
 *      the area rent benchmark that later makes AREA_SCOUTING concrete (§30).
 *
 * AREA_SCOUTING is refused here: its candidates come from discovery, and
 * accepting a premises would quietly turn it into a different product.
 */
export class PremisesService {
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  async attachPremises(
    projectId: string,
    input: AttachPremisesInput
  ): Promise<AttachPremisesResult> {
    const project = await projectService.getProject(projectId);
    const config = getProjectTypeConfig(project.projectType);

    if (config.runsCandidateDiscovery) {
      throw new Error(
        `${config.label} finds its own candidates; a premises cannot be attached to it. ` +
          'Use VALIDATION or COMPARISON for a premises the client has already chosen.'
      );
    }

    const existing = project.candidates.length;
    if (config.maxClientCandidates !== null && existing >= config.maxClientCandidates) {
      throw new Error(
        `${config.label} accepts at most ${config.maxClientCandidates} premises, ` +
          `and this project already has ${existing}.`
      );
    }

    // Coordinates are needed for competition, accessibility and routing. When
    // the client gives only an address, geocode it rather than refusing.
    let latitude = input.latitude;
    let longitude = input.longitude;
    let coordinatesGeocoded = false;

    if (latitude === undefined || longitude === undefined) {
      const geocoded = await this.locationProvider.geocode({ address: input.address });
      latitude = geocoded.data.location.latitude;
      longitude = geocoded.data.location.longitude;
      coordinatesGeocoded = true;

      await dataSourceRepository.record(geocoded.provenance, {
        projectId,
        metadata: { operation: 'geocodePremises', address: input.address },
      });
    }

    // Validate before writing anything: an unpermitted source or a nonsensical
    // rent must not create a half-attached premises.
    const normalized = normalizeProperty({ ...input, latitude, longitude });

    const listing = await propertyRepository.submit({
      ...input,
      projectId,
      latitude,
      longitude,
    });

    const candidate = await prisma.locationCandidate.create({
      data: {
        projectId,
        name: input.name?.trim() || normalized.address,
        address: normalized.address,
        latitude,
        longitude,
        placeId: normalized.placeId,
        estimatedRent: normalized.monthlyRent ?? null,
        propertySize: normalized.sizeSqm ?? null,
        propertyType: normalized.propertyType ?? null,
        propertyListingId: listing.id,
        // The client supplied these figures; they are still unverified on site
        // until someone confirms them (§17).
        confidence: normalized.confidence,
        status: 'IDENTIFIED',
      },
    });

    await prisma.$executeRaw`
      UPDATE location_candidates
      SET geom = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE id = ${candidate.id}
    `;

    logger.info(
      {
        projectId,
        projectType: config.type,
        candidateId: candidate.id,
        listingId: listing.id,
        coordinatesGeocoded,
        rentIsDerived: normalized.rentIsDerived,
      },
      'Client premises attached to project'
    );

    return { candidate, listing, coordinatesGeocoded };
  }

  /**
   * Remove a premises the client attached by mistake, before analysis runs.
   */
  async detachPremises(projectId: string, candidateId: string): Promise<void> {
    const candidate = await prisma.locationCandidate.findFirst({
      where: { id: candidateId, projectId },
    });

    if (!candidate) {
      throw new Error(`Premises ${candidateId} not found on project ${projectId}`);
    }

    // The listing stays: it is an observed rent for the area, and remains
    // useful even if this project no longer considers the premises.
    await prisma.locationCandidate.delete({ where: { id: candidateId } });

    logger.info({ projectId, candidateId }, 'Client premises detached from project');
  }
}

export const premisesService = new PremisesService();
