import { FastifyInstance } from 'fastify';
import { locationService } from '../services/location.service.js';

interface SearchCandidatesBody {
  projectId: string;
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface SearchCompetitorsBody {
  projectId: string;
  category: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export async function locationRoutes(app: FastifyInstance) {
  app.post<{ Body: SearchCandidatesBody }>('/search', async (request, reply) => {
    try {
      const { projectId, query, latitude, longitude, radiusMeters } = request.body;
      const result = await locationService.searchCandidatesForProject(projectId, query, latitude, longitude, radiusMeters);
      return reply.status(201).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to search location candidates');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  app.post<{ Body: SearchCompetitorsBody }>('/competitors', async (request, reply) => {
    try {
      const { projectId, category, latitude, longitude, radiusMeters } = request.body;
      const result = await locationService.searchCompetitorsForProject(projectId, category, latitude, longitude, radiusMeters);
      return reply.status(201).send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to search competitors');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}
