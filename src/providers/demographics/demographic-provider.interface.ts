export interface DemographicData {
  totalPopulation: number;
  populationDensityPerSqKm: number;
  medianIncome: number;
  dominantAgeGroup: string;
  source: string;
  retrievalDate: string;
}

export interface DemographicProvider {
  /**
   * Retrieves demographic data for a specific area (e.g., district, city).
   * @param areaName The name of the area
   */
  getDemographicData(areaName: string): Promise<DemographicData>;
}
