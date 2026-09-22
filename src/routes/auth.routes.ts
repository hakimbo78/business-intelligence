import { FastifyInstance } from 'fastify';
import { authService, AuthenticationError } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { env } from '../config/environment.js';

export async function authRoutes(app: FastifyInstance) {
  /**
   * What the dashboard needs to render a Google sign-in button.
   * Public: it exposes only the OAuth client id, which is not a secret.
   */
  app.get('/config', async (_request, reply) => {
    return reply.send({
      googleClientId: env.GOOGLE_OAUTH_CLIENT_ID ?? null,
      authDisabled: env.AUTH_DISABLED,
    });
  });

  /**
   * Exchange a Google ID token for a session token.
   *
   * Rate limited harder than the rest of the API: this is the endpoint an
   * attacker would hammer with forged credentials.
   */
  app.post<{ Body: { credential?: string } }>(
    '/google',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const credential = request.body?.credential;
      if (!credential) {
        return reply.status(400).send({ error: 'credential is required' });
      }

      try {
        const { token, user } = await authService.signInWithGoogle(credential);
        return reply.send({ token, user });
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return reply.status(401).send({ error: error.message });
        }
        // Never echo the credential back in an error.
        request.log.error({ err: error }, 'Google sign-in failed');
        return reply.status(500).send({ error: 'Sign-in failed' });
      }
    }
  );

  /** Who am I — used by the dashboard to restore a session on reload. */
  app.get('/me', { onRequest: requireAuth }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
