import { FastifyInstance } from 'fastify';
import { propertyRepository, type SubmitPropertyInput } from '../repositories/property.repository.js';
import {
  PERMITTED_PROPERTY_SOURCES,
  PropertyNormalizationError,
} from '../lib/property-normalizer.js';

export async function propertyRoutes(app: FastifyInstance) {
  /**
   * The permitted sources, so a client can present the right options instead of
   * guessing and being rejected.
   */
  app.get('/sources', async (_request, reply) => {
    return reply.send({
      permittedSources: PERMITTED_PROPERTY_SOURCES,
      note:
        'Marketplace scraping is not a permitted source. Listings must come from ' +
        'licensed providers, agents, owners, the customer, or a field survey ' +
        '(PROJECT_MASTER_SPEC.md §7).',
    });
  });

  /**
   * Submit a property listing from a permitted source.
   * This is how real rent data enters the system.
   */
  app.post<{ Body: SubmitPropertyInput }>('/', async (request, reply) => {
    try {
      const listing = await propertyRepository.submit(request.body ?? ({} as SubmitPropertyInput));
      return reply.status(201).send(listing);
    } catch (error) {
      if (error instanceof PropertyNormalizationError) {
        return reply.status(400).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Failed to submit property listing');
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  /**
   * Mark a listing as physically verified (§17). Verified rents are the
   * proprietary dataset described in §30.
   */
  app.post<{ Params: { id: string }; Body: { confidence?: 'HIGH' | 'MEDIUM' } }>(
    '/:id/verify',
    async (request, reply) => {
      try {
        const listing = await propertyRepository.markVerified(
          request.params.id,
          request.body?.confidence ?? 'HIGH'
        );
        return reply.send(listing);
      } catch (error) {
        return reply.status(404).send({ error: (error as Error).message });
      }
    }
  );
}

export async function projectPropertyRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/:id/properties', async (request, reply) => {
    try {
      const listings = await propertyRepository.listForProject(request.params.id);
      return reply.send(listings);
    } catch (error) {
      return reply.status(500).send({ error: (error as Error).message });
    }
  });
}
