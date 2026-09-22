import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database.js';
import { env } from '../config/environment.js';
import { authService, AuthenticationError, type AuthenticatedUser } from '../services/auth.service.js';
import { logger } from '../lib/logger.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Stand-in identity for local development with AUTH_DISABLED=true.
 * The environment loader refuses this flag in production.
 */
const DEV_OWNER: AuthenticatedUser = {
  userId: 'dev-owner',
  email: 'dev@localhost',
  name: 'Development Owner',
  role: 'OWNER',
  clientId: null,
};

/**
 * Reject anything without a valid session token.
 *
 * Runs before every route that touches customer data. Previously there was no
 * such check at all: anyone who knew a project id could read that client's
 * report (PROJECT_MASTER_SPEC.md §26).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (env.AUTH_DISABLED) {
    request.user = DEV_OWNER;
    return;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  try {
    request.user = authService.verifySessionToken(header.slice('Bearer '.length).trim());
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({ error: error.message });
    }
    throw error;
  }
}

/** Restrict a route to the owner. */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  if (request.user.role !== 'OWNER') {
    return reply.status(403).send({ error: 'Owner access required' });
  }
}

/**
 * Enforce that the caller may reach the project named in the route.
 *
 * This is the single chokepoint for tenancy. It is applied to every route with
 * an `:id` project parameter, so a new route cannot accidentally expose another
 * client's data by forgetting its own check.
 */
export async function requireProjectAccess(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const { id } = request.params as { id?: string };
  if (!id) return;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, clientId: true },
  });

  if (!project) {
    return reply.status(404).send({ error: `Project not found: ${id}` });
  }

  // The owner operates the business and reviews every report.
  if (user.role === 'OWNER') return;

  if (!user.clientId || project.clientId !== user.clientId) {
    // Deliberately 404, not 403: confirming the project exists would tell an
    // outsider which ids are real.
    logger.warn(
      { userId: user.userId, projectId: id },
      'Blocked cross-client project access'
    );
    return reply.status(404).send({ error: `Project not found: ${id}` });
  }
}
