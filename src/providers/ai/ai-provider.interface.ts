import { z } from 'zod';

export const parsedBriefSchema = z.object({
  businessProfile: z.object({
    businessName: z.string().min(1, 'Business name is required'),
    businessCategory: z.string().min(1, 'Business category is required'),
    businessSubcategory: z.string().optional(),
    currentAverageTransaction: z.number().optional().describe('Average transaction value in IDR'),
    estimatedDailyCustomers: z.number().optional().describe('Estimated customers per day'),
    operatingDays: z.number().optional().describe('Operating days per month'),
    grossMargin: z.number().optional().describe('Gross margin as a decimal, e.g. 0.65 for 65%'),
  }),
  locationSearch: z.object({
    targetCity: z.string().min(1, 'Target city is required'),
    targetArea: z.string().optional(),
    maximumMonthlyRent: z.number().optional().describe('Maximum MONTHLY rent in IDR'),
    targetPropertySize: z.number().optional().describe('Target property size in square metres'),
    preferredRadius: z.number().optional().describe('Preferred search radius in metres'),
    maximumInitialInvestment: z.number().optional().describe('Budget ceiling for initial investment in IDR'),
    estimatedInitialInvestment: z.number().optional().describe('Total Initial Investment the customer plans to spend in IDR'),
  }),
  /**
   * Fields the brief did not state. The intake agent adds its own required-field
   * checks on top of whatever the model reports here.
   */
  missingInformation: z.array(z.string()).optional(),
});

export type ParsedBrief = z.infer<typeof parsedBriefSchema>;

export interface AIProvider {
  readonly providerName: string;
  
  /**
   * Generates structured JSON data based on a Zod schema from a prompt.
   * @param prompt The prompt describing what to generate
   * @param schema The Zod schema to enforce
   * @param schemaName The name of the schema (for Gemini JSON schema definitions)
   */
  generateStructuredData<T>(prompt: string, schema: z.ZodSchema<T>, schemaName: string): Promise<T>;

  /**
   * Parses natural language brief into structured JSON based on parsedBriefSchema
   * @param rawText The unstructured customer brief
   */
  parseBrief(rawText: string): Promise<ParsedBrief>;
}
