export interface TrendData {
  keyword: string;
  interestScore: number; // 0-100
  trendDirection: 'UP' | 'DOWN' | 'STABLE';
  source: string;
  disclaimer: string;
}

export interface TrendsProvider {
  /**
   * Retrieves search interest data for a specific keyword in an area.
   * @param keyword The term to search for (e.g. "coffee shop", "cafe")
   * @param areaName The target location
   */
  getSearchInterest(keyword: string, areaName: string): Promise<TrendData>;
}
