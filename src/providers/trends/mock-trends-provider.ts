import { TrendsProvider, TrendData } from './trends-provider.interface.js';
import { logger } from '../../lib/logger.js';

export class MockTrendsProvider implements TrendsProvider {
  async getSearchInterest(keyword: string, areaName: string): Promise<TrendData> {
    logger.info({ keyword, areaName }, 'MockTrendsProvider generating mock trend data');
    
    // Deterministic mock for testing
    return {
      keyword,
      interestScore: 85, // out of 100
      trendDirection: 'UP',
      source: 'Mock Google Trends',
      disclaimer: 'Search interest is a proxy signal, not direct customer count.',
    };
  }
}

export const trendsProvider = new MockTrendsProvider();
