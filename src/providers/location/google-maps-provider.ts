import { Client, PlaceType1, TravelMode } from '@googlemaps/google-maps-services-js';
import { env } from '../../config/environment.js';
import {
  LocationProvider,
  SearchPlacesParams,
  GetPlaceDetailsParams,
  GeocodeParams,
  CalculateRouteParams,
  ProviderResult,
  PlaceSummary,
  PlaceDetails,
  GeocodingResult,
  RouteResult,
} from './location-provider.interface.js';
import { logger } from '../../lib/logger.js';
import { describeGoogleMapsFailure } from './location-provider.error.js';

export class GoogleMapsProvider implements LocationProvider {
  readonly providerName = 'GoogleMapsProvider';
  private client: Client;

  constructor() {
    this.client = new Client({});
    if (!env.GOOGLE_MAPS_API_KEY) {
      logger.warn('GoogleMapsProvider initialized without GOOGLE_MAPS_API_KEY');
    }
  }

  private get key(): string {
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    return env.GOOGLE_MAPS_API_KEY;
  }

  async searchPlaces(params: SearchPlacesParams): Promise<ProviderResult<PlaceSummary[]>> {
    try {
      const response = await this.client.textSearch({
        params: {
          query: params.query,
          location: { lat: params.location.latitude, lng: params.location.longitude },
          radius: params.radiusMeters,
          // The provider interface keeps `type` a plain string so business code
          // is not coupled to the Google SDK's enum (DEVELOPMENT_RULES.md §5).
          type: params.type as PlaceType1 | undefined,
          key: this.key,
        },
      });

      const places = response.data.results.map((r): PlaceSummary => ({
        placeId: r.place_id || '',
        name: r.name || '',
        address: r.formatted_address || '',
        location: {
          latitude: r.geometry?.location.lat || 0,
          longitude: r.geometry?.location.lng || 0,
        },
        category: params.type || 'unknown',
        rating: r.rating,
        reviewCount: r.user_ratings_total,
      }));

      return {
        data: places.slice(0, params.maxResults || 20),
        provenance: {
          source: this.providerName,
          retrievedAt: new Date().toISOString(),
          dataType: 'search_places',
          confidence: 'HIGH',
        },
      };
    } catch (error) {
      const described = describeGoogleMapsFailure(error, 'searchPlaces');
      logger.error(
        { err: error, isConfigurationProblem: described.isConfigurationProblem },
        described.message
      );
      throw described;
    }
  }

  async getPlaceDetails(params: GetPlaceDetailsParams): Promise<ProviderResult<PlaceDetails>> {
    try {
      const response = await this.client.placeDetails({
        params: {
          place_id: params.placeId,
          fields: params.fields || ['name', 'formatted_address', 'geometry', 'formatted_phone_number', 'website', 'opening_hours', 'price_level', 'type', 'rating', 'user_ratings_total'],
          key: this.key,
        },
      });

      const r = response.data.result;

      return {
        data: {
          placeId: params.placeId,
          name: r.name || '',
          address: r.formatted_address || '',
          location: {
            latitude: r.geometry?.location.lat || 0,
            longitude: r.geometry?.location.lng || 0,
          },
          category: r.types?.[0] || 'unknown',
          phone: r.formatted_phone_number,
          website: r.website,
          openingHours: r.opening_hours?.weekday_text,
          priceLevel: r.price_level,
          types: r.types || [],
          rating: r.rating,
          reviewCount: r.user_ratings_total,
        },
        provenance: {
          source: this.providerName,
          retrievedAt: new Date().toISOString(),
          dataType: 'place_details',
          confidence: 'HIGH',
        },
      };
    } catch (error) {
      const described = describeGoogleMapsFailure(error, 'getPlaceDetails');
      logger.error(
        { err: error, isConfigurationProblem: described.isConfigurationProblem },
        described.message
      );
      throw described;
    }
  }

  async geocode(params: GeocodeParams): Promise<ProviderResult<GeocodingResult>> {
    try {
      const response = await this.client.geocode({
        params: {
          address: params.address,
          key: this.key,
        },
      });

      if (!response.data.results.length) {
        throw new Error(`No geocoding results for address: ${params.address}`);
      }

      const r = response.data.results[0];

      return {
        data: {
          formattedAddress: r.formatted_address,
          location: {
            latitude: r.geometry.location.lat,
            longitude: r.geometry.location.lng,
          },
          placeId: r.place_id,
        },
        provenance: {
          source: this.providerName,
          retrievedAt: new Date().toISOString(),
          dataType: 'geocoding',
          confidence: 'HIGH',
        },
      };
    } catch (error) {
      const described = describeGoogleMapsFailure(error, 'geocode');
      logger.error(
        { err: error, isConfigurationProblem: described.isConfigurationProblem },
        described.message
      );
      throw described;
    }
  }

  async calculateRoute(params: CalculateRouteParams): Promise<ProviderResult<RouteResult>> {
    try {
      const response = await this.client.directions({
        params: {
          origin: { lat: params.origin.latitude, lng: params.origin.longitude },
          destination: { lat: params.destination.latitude, lng: params.destination.longitude },
          mode: (params.travelMode as TravelMode) || TravelMode.driving,
          key: this.key,
        },
      });

      if (!response.data.routes.length || !response.data.routes[0].legs.length) {
        throw new Error('No route found');
      }

      const leg = response.data.routes[0].legs[0];

      return {
        data: {
          distanceMeters: leg.distance.value,
          durationSeconds: leg.duration.value,
          origin: params.origin,
          destination: params.destination,
        },
        provenance: {
          source: this.providerName,
          retrievedAt: new Date().toISOString(),
          dataType: 'routing',
          confidence: 'HIGH',
        },
      };
    } catch (error) {
      const described = describeGoogleMapsFailure(error, 'calculateRoute');
      logger.error(
        { err: error, isConfigurationProblem: described.isConfigurationProblem },
        described.message
      );
      throw described;
    }
  }
}
