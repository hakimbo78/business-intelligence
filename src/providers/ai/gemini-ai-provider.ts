import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/environment.js';
import { AIProvider, ParsedBrief, parsedBriefSchema } from './ai-provider.interface.js';
import { logger } from '../../lib/logger.js';
import { INITIAL_INVESTMENT_DEFINITION_EN } from '../../lib/financial-inputs.js';
import { z } from 'zod';

/**
 * Gemini's `responseSchema` accepts only a subset of JSON Schema. Strip the
 * keywords it rejects so a standard zod-generated schema can be passed through.
 */
function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiSchema);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      out[key] = toGeminiSchema(val);
    }
    return out;
  }
  return value;
}

export class GeminiAIProvider implements AIProvider {
  readonly providerName = 'GeminiAIProvider';
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY || 'dummy-key',
    });
    
    if (!env.GEMINI_API_KEY) {
      logger.warn('GeminiAIProvider initialized without GEMINI_API_KEY');
    }
  }

  async generateStructuredData<T>(prompt: string, schema: z.ZodSchema<T>, schemaName: string): Promise<T> {
    logger.info({ provider: this.providerName, promptLength: prompt.length, schemaName }, 'Generating structured data with Gemini');
    
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    try {
      // zod v4 emits JSON Schema natively. The previous `zod-to-json-schema`
      // dependency only understood zod v3 internals, so `definitions[schemaName]`
      // resolved to undefined and structured output was silently disabled.
      const jsonSchema = toGeminiSchema(z.toJSONSchema(schema));

      const response = await this.client.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: jsonSchema,
          temperature: 0.1,
        }
      });

      const jsonText = response.text;
      if (!jsonText) {
        throw new Error('No response text from Gemini');
      }

      // Parse and validate with zod
      const parsed = JSON.parse(jsonText);
      return schema.parse(parsed);
      
    } catch (error) {
      logger.error({ err: error }, 'Gemini parsing failed');
      throw error;
    }
  }

  async parseBrief(rawText: string): Promise<ParsedBrief> {
    const prompt = `You are an AI Intake Agent for a Location Decision Intelligence platform.
Your job is to read the customer's natural language brief and extract the structured information.

targetCity is REQUIRED and must never be left empty. Indonesian customers usually
name a district or street rather than a city, so infer the city or regency from
whatever place they mention: "Kemang" is in Jakarta Selatan, "Depok Jaya" is in
Depok, "Dago" is in Bandung. Put the district in targetArea and the city in
targetCity. If no place at all is named, use "UNKNOWN" and say so in
'missingInformation'.

Definition of estimatedInitialInvestment:
${INITIAL_INVESTMENT_DEFINITION_EN}
Only fill estimatedInitialInvestment when the brief actually states the customer's total
start-up capital. Do NOT derive it from the rent, and do NOT invent a figure.

Omit any other field the brief does not state, and list it in 'missingInformation'.
Never guess a business number: a missing value is more useful than a fabricated one.
Inferring a city from a district is geography, not guessing a business figure.

CUSTOMER BRIEF:
${rawText}`;

    return this.generateStructuredData(prompt, parsedBriefSchema, 'ParsedBrief');
  }
}
