import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyIdToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

vi.mock('@/config/environment.js', () => ({
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    JWT_SECRET: 'a-test-secret-long-enough-to-satisfy-the-schema',
    JWT_EXPIRES_IN: '12h',
    OWNER_EMAILS: 'owner@bareksa.com, second.owner@bareksa.com',
    AUTH_DISABLED: false,
    LOG_LEVEL: 'error',
  },
}));

vi.mock('@/config/database.js', () => ({
  prisma: {
    client: { upsert: vi.fn() },
    user: { upsert: vi.fn() },
  },
}));

const { authService, AuthenticationError } = await import('@/services/auth.service.js');
const { prisma } = await import('@/config/database.js');

function googlePayload(overrides: Record<string, unknown> = {}) {
  return {
    getPayload: () => ({
      email: 'client@example.com',
      email_verified: true,
      sub: 'google-sub-123',
      name: 'A Client',
      ...overrides,
    }),
  };
}

describe('Owner allow-list', () => {
  it('should grant OWNER only to listed addresses', () => {
    expect(authService.isOwnerEmail('owner@bareksa.com')).toBe(true);
    expect(authService.isOwnerEmail('second.owner@bareksa.com')).toBe(true);
    expect(authService.isOwnerEmail('someone@example.com')).toBe(false);
  });

  it('should ignore case and surrounding whitespace', () => {
    expect(authService.isOwnerEmail('  OWNER@Bareksa.com ')).toBe(true);
  });

  it('should not be fooled by a lookalike address', () => {
    expect(authService.isOwnerEmail('owner@bareksa.com.evil.com')).toBe(false);
    expect(authService.isOwnerEmail('notowner@bareksa.com')).toBe(false);
  });
});

describe('Google credential verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should accept a valid credential', async () => {
    verifyIdToken.mockResolvedValueOnce(googlePayload());

    const identity = await authService.verifyGoogleIdToken('a-token');

    expect(identity.email).toBe('client@example.com');
    // The audience check is what stops a token minted for another app.
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'test-client-id.apps.googleusercontent.com' })
    );
  });

  it('should refuse an unverified Google email', async () => {
    verifyIdToken.mockResolvedValueOnce(googlePayload({ email_verified: false }));

    // Otherwise someone could claim an address they do not own, and with it
    // that client's reports.
    await expect(authService.verifyGoogleIdToken('a-token')).rejects.toThrow(
      /not verified/
    );
  });

  it('should refuse a credential Google rejects', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('bad signature'));

    await expect(authService.verifyGoogleIdToken('forged')).rejects.toThrow(
      AuthenticationError
    );
  });
});

describe('User resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.client.upsert as any).mockResolvedValue({ id: 'client-1' });
    (prisma.user.upsert as any).mockImplementation(async ({ create }: any) => ({
      id: 'user-1',
      ...create,
    }));
  });

  it('should bind a client user to their own client record', async () => {
    const user = await authService.resolveUser({
      email: 'client@example.com',
      sub: 'google-sub-123',
      name: 'A Client',
    });

    expect(user.role).toBe('CLIENT');
    expect(user.clientId).toBe('client-1');
  });

  it('should not create a client record for the owner', async () => {
    const user = await authService.resolveUser({
      email: 'owner@bareksa.com',
      sub: 'google-sub-owner',
    });

    expect(user.role).toBe('OWNER');
    expect(user.clientId).toBeNull();
    expect(prisma.client.upsert).not.toHaveBeenCalled();
  });

  it('should recompute the role at every sign-in', async () => {
    await authService.resolveUser({ email: 'client@example.com', sub: 's' });

    // Role is written on update too, so removing an address from OWNER_EMAILS
    // demotes that user on their next sign-in rather than persisting forever.
    const call = (prisma.user.upsert as any).mock.calls[0][0];
    expect(call.update.role).toBe('CLIENT');
  });
});

describe('Session tokens', () => {
  const user = {
    userId: 'user-1',
    email: 'client@example.com',
    role: 'CLIENT' as const,
    clientId: 'client-1',
  };

  it('should round-trip the identity it was issued for', () => {
    const token = authService.issueSessionToken(user);
    const decoded = authService.verifySessionToken(token);

    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('CLIENT');
    expect(decoded.clientId).toBe('client-1');
  });

  it('should reject a tampered token', () => {
    const token = authService.issueSessionToken(user);
    const tampered = token.slice(0, -4) + 'AAAA';

    expect(() => authService.verifySessionToken(tampered)).toThrow(AuthenticationError);
  });

  it('should reject a token signed with a different secret', () => {
    // A forged token would otherwise be a complete account takeover.
    const foreign =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoiT1dORVIifQ.' +
      'ZmFrZXNpZ25hdHVyZQ';

    expect(() => authService.verifySessionToken(foreign)).toThrow(AuthenticationError);
  });

  it('should reject nonsense', () => {
    expect(() => authService.verifySessionToken('not-a-token')).toThrow(AuthenticationError);
  });
});
