import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type UserRole = 'OWNER' | 'CLIENT';

export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  clientId: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Google client id from the API, or null when sign-in is disabled locally. */
  googleClientId: string | null;
  authDisabled: boolean;
  signInWithGoogle: (credential: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Where the session token lives.
 *
 * sessionStorage, not localStorage: the token dies with the tab, which limits
 * the window on a shared machine. It is not readable cross-origin either way.
 */
const TOKEN_KEY = 'li.session.token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing can refuse storage; the session simply will not persist.
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [authDisabled, setAuthDisabled] = useState(false);

  // Restore an existing session, and learn how sign-in is configured.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const configRes = await fetch('/api/auth/config');
        const config = await configRes.json();
        if (cancelled) return;

        setGoogleClientId(config.googleClientId ?? null);
        setAuthDisabled(Boolean(config.authDisabled));

        const meRes = await fetch('/api/auth/me', {
          headers: config.authDisabled
            ? {}
            : { Authorization: `Bearer ${getToken() ?? ''}` },
        });

        if (!cancelled && meRes.ok) {
          const data = await meRes.json();
          setUser(data.user ?? null);
        }
      } catch {
        // Offline or API down: fall through to the signed-out state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogle = useCallback(async (credential: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error ?? 'Sign-in failed');
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, googleClientId, authDisabled, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
