import { describe, it, expect } from 'vitest';
import {
  describeGoogleMapsFailure,
  LocationProviderError,
} from '@/providers/location/location-provider.error.js';

function googleError(status: string, error_message?: string, httpStatus = 403) {
  return { response: { status: httpStatus, data: { status, error_message } } };
}

describe('Google Maps failure messages', () => {
  it('should explain a denied request instead of leaking the transport error', () => {
    // What the client actually saw was "Request failed with status code 403",
    // which tells nobody what to do.
    const described = describeGoogleMapsFailure(
      googleError('REQUEST_DENIED', 'You must enable Billing on the Google Cloud Project'),
      'geocode'
    );

    expect(described).toBeInstanceOf(LocationProviderError);
    expect(described.isConfigurationProblem).toBe(true);
    expect(described.message).toContain('enable Billing');
    expect(described.message).toContain('MAP_PROVIDER=mock');
    expect(described.message).not.toContain('Request failed with status code');
  });

  it('should flag a quota problem as the operator’s to fix', () => {
    const described = describeGoogleMapsFailure(googleError('OVER_QUERY_LIMIT'), 'searchPlaces');

    expect(described.isConfigurationProblem).toBe(true);
    expect(described.message).toContain('quota');
  });

  it('should not blame configuration for an address that simply has no match', () => {
    const described = describeGoogleMapsFailure(googleError('ZERO_RESULTS', undefined, 200), 'geocode');

    expect(described.isConfigurationProblem).toBe(false);
    expect(described.message).toContain('no result');
  });

  it('should still say something useful for an unrecognised failure', () => {
    const described = describeGoogleMapsFailure(new Error('socket hang up'), 'calculateRoute');

    expect(described.operation).toBe('calculateRoute');
    expect(described.message).toContain('socket hang up');
  });

  it('should keep the original error as the cause for debugging', () => {
    const original = new Error('socket hang up');
    expect(describeGoogleMapsFailure(original, 'geocode').cause).toBe(original);
  });
});
