import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Card } from '../components/Card';
import { useAuth } from '../auth/AuthContext';

export const Login: React.FC = () => {
  const { signInWithGoogle, googleClientId } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex justify-center items-center" style={{ minHeight: '80vh' }}>
      <Card title="Sign in" className="max-w-md">
        <p className="text-muted mb-8">
          Sign in with your Google account to view your location intelligence reports.
        </p>

        {googleClientId ? (
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              setError(null);
              try {
                if (!credentialResponse.credential) {
                  throw new Error('Google did not return a credential');
                }
                await signInWithGoogle(credentialResponse.credential);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Sign-in failed');
              }
            }}
            onError={() => setError('Google sign-in was cancelled or failed')}
          />
        ) : (
          <p className="text-xs" style={{ color: 'var(--warning)' }}>
            Sign-in is not configured. Set GOOGLE_OAUTH_CLIENT_ID on the API, or
            run locally with AUTH_DISABLED=true.
          </p>
        )}

        {error && (
          <p className="text-xs mt-4" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <p className="text-xs text-muted mt-8">
          We only read your name and email address. No password is stored.
        </p>
      </Card>
    </div>
  );
};
