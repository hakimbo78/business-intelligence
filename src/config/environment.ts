import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file in non-production environments
dotenv.config();

/**
 * Environment variable schema.
 * Validates all required configuration at startup.
 * Fails fast with clear error messages if configuration is invalid.
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Provider Selection
  MAP_PROVIDER: z.enum(['mock', 'google']).default('mock'),

  // Google Maps (optional — only required when MAP_PROVIDER=google)
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),

  // AI Provider (optional — only required when AI_PROVIDER=gemini or openrouter)
  AI_PROVIDER: z.enum(['mock', 'gemini', 'openrouter']).default('mock'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),

  // CORS (required in production so the allow-list is never implicit)
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // --- Authentication ---
  // Google OAuth client id. The dashboard signs in with Google and sends the
  // resulting ID token; the API verifies it against this audience.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  // Signing key for our own session tokens. Must be long enough that it cannot
  // be brute-forced: a forged token is a full account takeover.
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('12h'),
  // Comma-separated addresses granted the OWNER role. Everyone else who signs
  // in is a CLIENT. Nobody can promote themselves.
  OWNER_EMAILS: z.string().optional(),
  // Escape hatch for local development and tests only; refused in production.
  AUTH_DISABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
function loadEnvironment(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `❌ Invalid environment configuration:\n${formatted}\n\nSee .env.example for required variables.`
    );
  }

  const env = result.data;

  // Cross-field validation: a provider must have the credentials it needs.
  // Checked at startup so a misconfiguration fails immediately rather than
  // halfway through a customer's report.
  if (env.MAP_PROVIDER === 'google' && !env.GOOGLE_MAPS_API_KEY) {
    throw new Error(
      '❌ GOOGLE_MAPS_API_KEY is required when MAP_PROVIDER=google'
    );
  }

  if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
    throw new Error('❌ GEMINI_API_KEY is required when AI_PROVIDER=gemini');
  }

  if (env.AI_PROVIDER === 'openrouter' && !env.OPENROUTER_API_KEY) {
    throw new Error('❌ OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter');
  }

  // Authentication must be fully configured unless it is explicitly disabled
  // for local work — and it can never be disabled in production.
  if (env.AUTH_DISABLED && env.NODE_ENV === 'production') {
    throw new Error('❌ AUTH_DISABLED cannot be used when NODE_ENV=production');
  }

  if (!env.AUTH_DISABLED) {
    const missing: string[] = [];
    if (!env.GOOGLE_OAUTH_CLIENT_ID) missing.push('GOOGLE_OAUTH_CLIENT_ID');
    if (!env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!env.OWNER_EMAILS) missing.push('OWNER_EMAILS');

    if (missing.length > 0) {
      throw new Error(
        `❌ Authentication is enabled but not configured. Missing: ${missing.join(', ')}.
` +
          'Set AUTH_DISABLED=true for local development without sign-in.'
      );
    }
  }

  // Production must name its allowed origins. Previously CORS was disabled
  // outright in production, which silently blocked the dashboard.
  if (env.NODE_ENV === 'production' && !env.CORS_ALLOWED_ORIGINS) {
    throw new Error(
      '❌ CORS_ALLOWED_ORIGINS is required when NODE_ENV=production. ' +
        'Provide a comma-separated list of allowed dashboard origins.'
    );
  }

  return env;
}

/**
 * Validated environment configuration.
 * Imported throughout the application as the single source of config truth.
 */
export const env = loadEnvironment();
