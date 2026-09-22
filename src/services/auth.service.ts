import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';

export type UserRole = 'OWNER' | 'CLIENT';

/** The authenticated caller, as carried on every request. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  /** The Client whose data this user may reach. Null for OWNER (who sees all). */
  clientId: string | null;
}

export class AuthenticationError extends Error {}

/**
 * Sign-in with Google.
 *
 * The dashboard performs the Google sign-in and sends us the resulting ID
 * token. We verify that token against Google's public keys and our own client
 * id, then issue a short-lived session token of our own.
 *
 * Two rules protect the tenancy:
 *
 *  1. OWNER is granted only to addresses on the OWNER_EMAILS allow-list. A user
 *     can never promote themselves by signing in with a chosen address.
 *  2. Every CLIENT user is bound to exactly one Client record, and all data
 *     access is scoped to it (PROJECT_MASTER_SPEC.md §27).
 */
export class AuthService {
  private googleClient = new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID);

  private ownerEmails(): Set<string> {
    return new Set(
      (env.OWNER_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  isOwnerEmail(email: string): boolean {
    return this.ownerEmails().has(email.trim().toLowerCase());
  }

  /**
   * Verify a Google ID token and return the identity it asserts.
   */
  async verifyGoogleIdToken(idToken: string): Promise<{
    email: string;
    emailVerified: boolean;
    sub: string;
    name?: string;
  }> {
    if (!env.GOOGLE_OAUTH_CLIENT_ID) {
      throw new AuthenticationError('GOOGLE_OAUTH_CLIENT_ID is not configured');
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_OAUTH_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // Never log the token itself (DEVELOPMENT_RULES.md §19).
      logger.warn({ err: error }, 'Google ID token verification failed');
      throw new AuthenticationError('Invalid Google credential');
    }

    if (!payload?.email || !payload.sub) {
      throw new AuthenticationError('Google credential did not include an email');
    }

    // An unverified address could be claimed by someone who does not own it,
    // which would hand them that client's reports.
    if (!payload.email_verified) {
      throw new AuthenticationError('Google account email is not verified');
    }

    return {
      email: payload.email.toLowerCase(),
      emailVerified: true,
      sub: payload.sub,
      name: payload.name,
    };
  }

  /**
   * Find or create the user for a verified Google identity, and bind a CLIENT
   * user to their Client record.
   */
  async resolveUser(identity: {
    email: string;
    sub: string;
    name?: string;
  }): Promise<AuthenticatedUser> {
    const role: UserRole = this.isOwnerEmail(identity.email) ? 'OWNER' : 'CLIENT';

    let clientId: string | null = null;
    if (role === 'CLIENT') {
      // One Client per email address. A returning client reaches the same
      // record, so their previous orders are still theirs.
      const client = await prisma.client.upsert({
        where: { email: identity.email },
        update: {},
        create: { email: identity.email, name: identity.name ?? identity.email },
      });
      clientId = client.id;
    }

    const user = await prisma.user.upsert({
      where: { email: identity.email },
      update: {
        googleSub: identity.sub,
        name: identity.name,
        // Role is recomputed from the allow-list at every sign-in, so removing
        // an address from OWNER_EMAILS takes effect on their next login.
        role,
        clientId,
        lastLoginAt: new Date(),
      },
      create: {
        email: identity.email,
        googleSub: identity.sub,
        name: identity.name,
        role,
        clientId,
        lastLoginAt: new Date(),
      },
    });

    return {
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role as UserRole,
      clientId: user.clientId,
    };
  }

  /** Issue our own short-lived session token. */
  issueSessionToken(user: AuthenticatedUser): string {
    if (!env.JWT_SECRET) {
      throw new AuthenticationError('JWT_SECRET is not configured');
    }

    return jwt.sign(
      {
        sub: user.userId,
        email: user.email,
        role: user.role,
        clientId: user.clientId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );
  }

  verifySessionToken(token: string): AuthenticatedUser {
    if (!env.JWT_SECRET) {
      throw new AuthenticationError('JWT_SECRET is not configured');
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
      return {
        userId: String(payload.sub),
        email: String(payload.email),
        role: payload.role as UserRole,
        clientId: (payload.clientId as string | null) ?? null,
      };
    } catch {
      throw new AuthenticationError('Session token is invalid or has expired');
    }
  }

  /** Complete sign-in: Google credential in, session token out. */
  async signInWithGoogle(idToken: string): Promise<{
    token: string;
    user: AuthenticatedUser;
  }> {
    const identity = await this.verifyGoogleIdToken(idToken);
    const user = await this.resolveUser(identity);
    const token = this.issueSessionToken(user);

    logger.info(
      { userId: user.userId, role: user.role },
      'User signed in with Google'
    );

    return { token, user };
  }
}

export const authService = new AuthService();
