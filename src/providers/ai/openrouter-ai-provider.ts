import { env } from '../../config/environment.js';
import { AIProvider, ParsedBrief, parsedBriefSchema } from './ai-provider.interface.js';
import { logger } from '../../lib/logger.js';
import { INITIAL_INVESTMENT_DEFINITION_EN } from '../../lib/financial-inputs.js';
import { z } from 'zod';

/** Minimal shape of the OpenAI-compatible chat completion response. */
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenRouterAIProvider implements AIProvider {
  readonly providerName = 'OpenRouterAIProvider';

  constructor() {
    if (!env.OPENROUTER_API_KEY) {
      logger.warn('OpenRouterAIProvider initialized without OPENROUTER_API_KEY');
    }
  }

  async generateStructuredData<T>(prompt: string, schema: z.ZodSchema<T>, schemaName: string): Promise<T> {
    logger.info({ provider: this.providerName, promptLength: prompt.length, schemaName, model: env.OPENROUTER_MODEL }, 'Generating structured data with OpenRouter');
    
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    try {
      // zod v4 emits JSON Schema natively. The previous `zod-to-json-schema`
      // dependency only understood zod v3 internals and silently produced an
      // empty schema, which left the model with no structural guidance at all.
      const schemaString = JSON.stringify(z.toJSONSchema(schema));

      const systemPrompt = `You are a helpful data extraction AI.
You must return your output ONLY as a raw JSON object conforming EXACTLY to this JSON schema:
${schemaString}

CRITICAL INSTRUCTIONS:
1. You MUST output a valid JSON object matching the schema's top-level shape directly.
2. You MUST provide values for ALL properties listed in the schema's "required" array.
3. Where the schema lists an "enum", you MUST use one of those exact values.
4. If information is missing from the prompt, state what is missing rather than inventing
   business facts. Use empty strings, empty arrays, or 0 for unknown values.
5. Do not include any markdown formatting like \`\`\`json, do not include explanations, just return the raw JSON braces.`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Location Intelligence",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API Error: ${response.status} ${errText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      let content = data.choices?.[0]?.message?.content || "";

      // Clean up potential markdown formatting if the model disobeys
      content = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

      if (!content) {
        throw new Error('No content returned from OpenRouter');
      }

      let parsed = JSON.parse(content);
      // Fallback if the model wrapped the result in the schema name
      if (parsed[schemaName] && typeof parsed[schemaName] === 'object') {
        parsed = parsed[schemaName];
      }
      return schema.parse(parsed);
      
    } catch (error) {
      logger.error({ err: error }, 'OpenRouter parsing failed');
      throw error;
    }
  }

  async parseBrief(rawText: string): Promise<ParsedBrief> {
    const prompt = `You are an AI Intake Agent for a Location Decision Intelligence platform.
Your job is to read the customer's natural language brief and extract the structured information.

Definition of estimatedInitialInvestment:
${INITIAL_INVESTMENT_DEFINITION_EN}
Only fill estimatedInitialInvestment when the brief actually states the customer's total
start-up capital. Do NOT derive it from the rent, and do NOT invent a figure.

Omit any field the brief does not state, and list it in 'missingInformation'.
Never guess a business number: a missing value is more useful than a fabricated one.

CUSTOMER BRIEF:
${rawText}`;

    return this.generateStructuredData(prompt, parsedBriefSchema, 'ParsedBrief');
  }
}
