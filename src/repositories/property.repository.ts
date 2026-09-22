import { prisma } from '../config/database.js';
import type { PropertyListing } from '@prisma/client';
import { normalizeProperty, type RawPropertyInput } from '../lib/property-normalizer.js';

export interface SubmitPropertyInput extends RawPropertyInput {
  projectId?: string;
}

/**
 * Stores property listings from permitted sources (PROJECT_MASTER_SPEC.md §7).
 *
 * Every write goes through `normalizeProperty`, so an unpermitted source is
 * rejected at the boundary rather than quietly landing in the dataset that
 * later reports are built on.
 */
export class PropertyRepository {
  async submit(input: SubmitPropertyInput): Promise<PropertyListing> {
    const normalized = normalizeProperty(input);

    const listing = await prisma.propertyListing.create({
      data: {
        projectId: input.projectId,
        source: normalized.source,
        sourceReference: normalized.sourceReference,
        placeId: normalized.placeId,
        address: normalized.address,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        propertyType: normalized.propertyType,
        sizeSqm: normalized.sizeSqm,
        monthlyRent: normalized.monthlyRent,
        annualRent: normalized.annualRent,
        rentIsDerived: normalized.rentIsDerived,
        deposit: normalized.deposit,
        availability: normalized.availability,
        confidence: normalized.confidence,
      },
    });

    // Populate PostGIS geometry so the dataset provider can search by distance.
    await prisma.$executeRaw`
      UPDATE property_listings
      SET geom = ST_SetSRID(ST_MakePoint(${normalized.longitude}, ${normalized.latitude}), 4326)
      WHERE id = ${listing.id}
    `;

    return listing;
  }

  /**
   * Record that someone physically confirmed a listing (§17 field validation).
   * Verified listings are the proprietary asset described in §30.
   */
  async markVerified(listingId: string, confidence: 'HIGH' | 'MEDIUM' = 'HIGH'): Promise<PropertyListing> {
    return await prisma.propertyListing.update({
      where: { id: listingId },
      data: { verifiedAt: new Date(), confidence },
    });
  }

  async listForProject(projectId: string): Promise<PropertyListing[]> {
    return await prisma.propertyListing.findMany({
      where: { OR: [{ projectId }, { projectId: null }] },
      orderBy: { retrievedAt: 'desc' },
    });
  }
}

export const propertyRepository = new PropertyRepository();
