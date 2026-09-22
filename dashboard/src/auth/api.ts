import { getToken } from './AuthContext';

export class ApiError extends Error {
  // A plain field rather than a parameter property: the dashboard compiles with
  // erasableSyntaxOnly, which forbids the shorthand.
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Single place every API call goes through, so no request can forget to carry
 * the session token — and a 401 is handled the same way everywhere.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    // The session expired or was revoked. Reloading returns to the sign-in
    // screen rather than leaving a half-usable dashboard.
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(
      (payload as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
