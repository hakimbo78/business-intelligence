import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/environment.js', () => ({
  env: {
    AUTH_DISABLED: false,
    JWT_SECRET: 'a-test-secret-long-enough-to-satisfy-the-schema',
    JWT_EXPIRES_IN: '12h',
    OWNER_EMAILS: 'owner@bareksa.com',
    LOG_LEVEL: 'error',
  },
}));

vi.mock('@/config/database.js', () => ({
  prisma: { project: { findUnique: vi.fn() } },
}));

const { requireAuth, requireOwner, requireProjectAccess } = await import(
  '@/middleware/auth.middleware.js'
);
const { authService } = await import('@/services/auth.service.js');
const { prisma } = await import('@/config/database.js');

function makeReply() {
  const reply = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return reply;
}

const clientUser = {
  userId: 'user-client-a',
  email: 'a@example.com',
  role: 'CLIENT' as const,
  clientId: 'client-a',
};

const ownerUser = {
  userId: 'user-owner',
  email: 'owner@bareksa.com',
  role: 'OWNER' as const,
  clientId: null,
};

describe('requireAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject a request with no Authorization header', async () => {
    const reply = makeReply();
    await requireAuth({ headers: {} } as any, reply as any);

    expect(reply.statusCode).toBe(401);
  });

  it('should reject a malformed Authorization header', async () => {
    const reply = makeReply();
    await requireAuth({ headers: { authorization: 'Basic abc' } } as any, reply as any);

    expect(reply.statusCode).toBe(401);
  });

  it('should reject an invalid token', async () => {
    const reply = makeReply();
    await requireAuth(
      { headers: { authorization: 'Bearer not-a-real-token' } } as any,
      reply as any
    );

    expect(reply.statusCode).toBe(401);
  });

  it('should attach the caller for a valid token', async () => {
    const token = authService.issueSessionToken(clientUser);
    const request = { headers: { authorization: `Bearer ${token}` } } as any;
    const reply = makeReply();

    await requireAuth(request, reply as any);

    expect(reply.statusCode).toBe(0);
    expect(request.user.userId).toBe('user-client-a');
    expect(request.user.clientId).toBe('client-a');
  });
});

describe('requireOwner', () => {
  it('should let the owner through', async () => {
    const reply = makeReply();
    await requireOwner({ user: ownerUser } as any, reply as any);
    expect(reply.statusCode).toBe(0);
  });

  it('should refuse a client', async () => {
    const reply = makeReply();
    await requireOwner({ user: clientUser } as any, reply as any);
    expect(reply.statusCode).toBe(403);
  });

  it('should refuse an anonymous caller', async () => {
    const reply = makeReply();
    await requireOwner({} as any, reply as any);
    expect(reply.statusCode).toBe(401);
  });
});

describe('requireProjectAccess — tenancy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should let a client reach their own project', async () => {
    (prisma.project.findUnique as any).mockResolvedValueOnce({
      id: 'p1',
      clientId: 'client-a',
    });

    const reply = makeReply();
    await requireProjectAccess({ user: clientUser, params: { id: 'p1' } } as any, reply as any);

    expect(reply.statusCode).toBe(0);
  });

  it("should hide another client's project", async () => {
    (prisma.project.findUnique as any).mockResolvedValueOnce({
      id: 'p2',
      clientId: 'client-b',
    });

    const reply = makeReply();
    await requireProjectAccess({ user: clientUser, params: { id: 'p2' } } as any, reply as any);

    // 404 rather than 403: a 403 would confirm the project exists, which tells
    // an outsider which ids are real.
    expect(reply.statusCode).toBe(404);
    expect(JSON.stringify(reply.body)).not.toContain('client-b');
  });

  it('should let the owner reach any project', async () => {
    (prisma.project.findUnique as any).mockResolvedValueOnce({
      id: 'p2',
      clientId: 'client-b',
    });

    const reply = makeReply();
    await requireProjectAccess({ user: ownerUser, params: { id: 'p2' } } as any, reply as any);

    expect(reply.statusCode).toBe(0);
  });

  it('should refuse a client user with no client record', async () => {
    (prisma.project.findUnique as any).mockResolvedValueOnce({
      id: 'p1',
      clientId: 'client-a',
    });

    const reply = makeReply();
    await requireProjectAccess(
      { user: { ...clientUser, clientId: null }, params: { id: 'p1' } } as any,
      reply as any
    );

    expect(reply.statusCode).toBe(404);
  });

  it('should 404 a project that does not exist', async () => {
    (prisma.project.findUnique as any).mockResolvedValueOnce(null);

    const reply = makeReply();
    await requireProjectAccess({ user: ownerUser, params: { id: 'nope' } } as any, reply as any);

    expect(reply.statusCode).toBe(404);
  });

  it('should refuse an anonymous caller', async () => {
    const reply = makeReply();
    await requireProjectAccess({ params: { id: 'p1' } } as any, reply as any);

    expect(reply.statusCode).toBe(401);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('should ignore routes without a project id', async () => {
    const reply = makeReply();
    await requireProjectAccess({ user: clientUser, params: {} } as any, reply as any);

    expect(reply.statusCode).toBe(0);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });
});
