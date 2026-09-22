import { DemographicProvider, DemographicData } from './demographic-provider.interface.js';
import { logger } from '../../lib/logger.js';

export class MockDemographicProvider implements DemographicProvider {
  async getDemographicData(areaName: string): Promise<DemographicData> {
    logger.info({ areaName }, 'MockDemographicProvider generating mock demographic data');
    
    // For deterministic testing, we return a static mock.
    // In a real scenario, this would query a BPS API or a curated dataset.
    return {
      totalPopulation: 150000,
      populationDensityPerSqKm: 8500,
      medianIncome: 15000000,
      dominantAgeGroup: '25-34',
      source: 'Mock BPS Data',
      retrievalDate: new Date().toISOString(),
    };
  }
}

export const demographicProvider = new MockDemographicProvider();
