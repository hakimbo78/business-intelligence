import { AIProvider } from './ai-provider.interface.js';
import { MockAIProvider } from './mock-ai-provider.js';
import { GeminiAIProvider } from './gemini-ai-provider.js';
import { OpenRouterAIProvider } from './openrouter-ai-provider.js';

export type AIProviderType = 'mock' | 'gemini' | 'openrouter';

export function createAIProvider(providerType: AIProviderType): AIProvider {
  switch (providerType) {
    case 'mock':
      return new MockAIProvider();
    case 'gemini':
      return new GeminiAIProvider();
    case 'openrouter':
      return new OpenRouterAIProvider();
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${providerType}". Supported values: mock, gemini`
      );
  }
}

export type { AIProvider, ParsedBrief } from './ai-provider.interface.js';
export { MockAIProvider } from './mock-ai-provider.js';
export { GeminiAIProvider } from './gemini-ai-provider.js';
export { OpenRouterAIProvider } from './openrouter-ai-provider.js';
