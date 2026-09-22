/**
 * A location provider could not answer.
 *
 * Provider SDKs throw transport-level errors like "Request failed with status
 * code 403", which say nothing to whoever is waiting on the answer. Wrapping
 * them here means a configuration problem reads as a configuration problem
 * (DEVELOPMENT_RULES.md §17: handle API unavailable, rate limit, timeout).
 */
export class LocationProviderError extends Error {
  readonly provider: string;
  readonly operation: string;
  /** True when the operator must fix something, not the caller. */
  readonly isConfigurationProblem: boolean;

  constructor(
    message: string,
    options: { provider: string; operation: string; isConfigurationProblem?: boolean; cause?: unknown }
  ) {
    super(message, { cause: options.cause });
    this.name = 'LocationProviderError';
    this.provider = options.provider;
    this.operation = options.operation;
    this.isConfigurationProblem = options.isConfigurationProblem ?? false;
  }
}

interface GoogleErrorShape {
  response?: { status?: number; data?: { status?: string; error_message?: string } };
  message?: string;
}

/**
 * Turn a Google Maps SDK failure into something actionable.
 */
export function describeGoogleMapsFailure(error: unknown, operation: string): LocationProviderError {
  const err = error as GoogleErrorShape;
  const status = err?.response?.data?.status;
  const detail = err?.response?.data?.error_message;

  if (status === 'REQUEST_DENIED') {
    return new LocationProviderError(
      `Google Maps refused the ${operation} request. ${detail ?? 'The API key is not authorised.'} ` +
        'Check that billing is enabled on the Google Cloud project and that the required API is turned on. ' +
        'Set MAP_PROVIDER=mock to work without Google Maps.',
      { provider: 'GoogleMapsProvider', operation, isConfigurationProblem: true, cause: error }
    );
  }

  if (status === 'OVER_QUERY_LIMIT' || err?.response?.status === 429) {
    return new LocationProviderError(
      `Google Maps quota exceeded on ${operation}. ${detail ?? ''}`.trim(),
      { provider: 'GoogleMapsProvider', operation, isConfigurationProblem: true, cause: error }
    );
  }

  if (status === 'ZERO_RESULTS') {
    return new LocationProviderError(
      `Google Maps found no result for the ${operation} request.`,
      { provider: 'GoogleMapsProvider', operation, cause: error }
    );
  }

  return new LocationProviderError(
    `Google Maps ${operation} failed: ${detail ?? err?.message ?? 'unknown error'}`,
    { provider: 'GoogleMapsProvider', operation, cause: error }
  );
}
